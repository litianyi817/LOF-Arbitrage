/**
 * /api/price.js — Vercel Serverless Function
 * 代理天天基金API，获取基金实时估算净值(IOPV)
 *
 * 调用方式: GET /api/price?codes=161116,160505,...
 * 
 * v1.1: 减小批大小和超时，适配Vercel 10s限制
 */

const FUND_API_BASE = 'https://fundgz.1234567.com.cn/js'

// 单个基金净值查询（超时3秒）
async function fetchFundNav(code) {
  const url = `${FUND_API_BASE}/${code}.js`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/'
      }
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return { code, error: `HTTP ${response.status}` }
    }

    const text = await response.text()

    // 天天基金返回 JSONP 格式: jsonpgz({...});
    const jsonMatch = text.match(/jsonpgz\((\{[\s\S]*?\})\)/i)
    if (!jsonMatch) {
      return { code, error: '无法解析净值数据' }
    }

    const raw = JSON.parse(jsonMatch[1])

    // gsz=估算净值, dwjz=单位净值, gztime=估算时间
    const estimatedNav = parseFloat(raw.gsz) || 0
    const nav = parseFloat(raw.dwjz) || 0

    return {
      code: raw.fundcode || code,
      name: raw.name || '',
      nav,                                          // 单位净值（上一交易日确认值）
      estimatedNav,                                 // 估算净值（盘中实时，休市时为0）
      estimatedTime: raw.gztime || '',
      estimatedPct: parseFloat(raw.gszzl) || 0,
      navDate: raw.jzrq || '',
      navAcc: parseFloat(raw.ljjz) || 0,
      // 休市时 gsz=0，此时用 dwjz 作为显示净值
      displayNav: estimatedNav > 0 ? estimatedNav : nav
    }
  } catch (err) {
    clearTimeout(timeout)
    return { code, error: err.message }
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`)
    const codeParam = searchParams.get('code')
    const codesParam = searchParams.get('codes')
    const sourceParam = searchParams.get('source') || 'tiantian'

    const codes = codesParam
      ? codesParam.split(',').filter(Boolean).slice(0, 15)  // 最多15个（Vercel 10s限制）
      : codeParam
        ? [codeParam]
        : []

    if (codes.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供 code 或 codes 参数',
        time: new Date().toISOString()
      })
    }

    // 并发查询（批大小降至5，确保10秒内完成）
    const results = []
    const batchSize = 5
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(
        batch.map(code => fetchFundNav(code))
      )
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value)
        } else {
          results.push({ code: 'unknown', error: r.reason?.message || '请求失败' })
        }
      }
    }

    // 补充 displayNav 字段：优先用估算净值，否则用上一交易日净值
    for (const r of results) {
      if (!r.error && r.displayNav === undefined) {
        r.displayNav = r.estimatedNav > 0 ? r.estimatedNav : r.nav
      }
    }

    const successCount = results.filter(r => !r.error).length

    res.status(200).json({
      success: true,
      total: codes.length,
      successCount,
      data: results,
      source: sourceParam,
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error('[price API] Error:', err.message)
    res.status(500).json({
      success: false,
      error: err.message,
      time: new Date().toISOString()
    })
  }
}
