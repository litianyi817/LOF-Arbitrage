/**
 * /api/price.js — Vercel Serverless Function
 * 代理天天基金API，获取基金实时估算净值(IOPV)
 *
 * 调用方式: GET /api/price?code=161116
 *            GET /api/price?codes=161116,160505,...
 *
 * 支持批量查询（并发请求，最多20个）
 */

const FUND_API_BASE = 'https://fundgz.1234567.com.cn/js'

// 单个基金净值查询
async function fetchFundNav(code) {
  const url = `${FUND_API_BASE}/${code}.js`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
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
      return { code, error: '无法解析净值数据', raw: text.substring(0, 100) }
    }

    const raw = JSON.parse(jsonMatch[1])

    return {
      code: raw.fundcode || code,
      name: raw.name || '',
      nav: parseFloat(raw.dwjz) || 0,           // 单位净值（上一交易日）
      estimatedNav: parseFloat(raw.gsz) || 0,    // 估算净值（盘中实时）
      estimatedTime: raw.gztime || '',            // 估算时间
      estimatedPct: parseFloat(raw.gszzl) || 0,  // 估算涨跌幅
      navDate: raw.jzrq || '',                    // 净值日期
      navAcc: parseFloat(raw.ljjz) || 0           // 累计净值
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

    const codes = codesParam
      ? codesParam.split(',').filter(Boolean).slice(0, 20)
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

    // 并发查询（限制同时最多10个请求）
    const results = []
    const batchSize = 10
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

    const successCount = results.filter(r => !r.error).length

    res.status(200).json({
      success: true,
      total: codes.length,
      successCount,
      data: results,
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
