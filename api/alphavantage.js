/**
 * /api/alphavantage.js — Vercel Serverless Function
 * 代理 Alpha Vantage GLOBAL_QUOTE API
 *
 * GET /api/alphavantage?codes=161116,501025&apikey=xxx
 *
 * Alpha Vantage 沪深格式:
 *   深市: 161116.SHZ
 *   沪市: 501025.SHH
 *
 * 返回: GLOBAL_QUOTE 实时报价数据
 */

const AV_BASE = 'https://www.alphavantage.co/query'

async function fetchQuote(symbol, apikey) {
  const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apikey}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)

  try {
    const resp = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()

    // Alpha Vantage 错误响应
    if (data['Error Message']) throw new Error(data['Error Message'])
    if (data.Note) throw new Error('API 频率限制: ' + data.Note)

    const quote = data['Global Quote']
    if (!quote || !quote['01. symbol']) return null

    const price = parseFloat(quote['05. price']) || 0
    const prevClose = parseFloat(quote['08. previous close']) || 0

    return {
      code: symbol.replace('.SHZ', '').replace('.SHH', ''),
      name: '',
      price,
      changePct: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
      change: parseFloat(quote['09. change']) || 0,
      high: parseFloat(quote['03. high']) || 0,
      low: parseFloat(quote['04. low']) || 0,
      open: parseFloat(quote['02. open']) || 0,
      prevClose
    }
  } finally {
    clearTimeout(t)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const u = req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`
    const { searchParams: sp } = new URL(u)
    const codesParam = sp.get('codes')
    const apikey = sp.get('apikey') || 'demo'

    if (!codesParam) {
      return res.status(400).json({ success: false, error: '缺少 codes 参数' })
    }

    const codes = codesParam.split(',').filter(Boolean).slice(0, 15) // 免费25次/天，节流
    const results = []

    for (const code of codes) {
      // 转换代码格式: 161116 → 161116.SHZ
      const symbol = code.startsWith('50') || code.startsWith('51')
        ? `${code}.SHH`
        : `${code}.SHZ`

      try {
        const fund = await fetchQuote(symbol, apikey)
        if (fund) results.push(fund)
      } catch (e) {
        console.warn('[av] 失败:', code, e.message)
        // 单个失败不影响整体
      }
    }

    res.status(200).json({
      success: true,
      total: results.length,
      data: results,
      source: 'alphavantage',
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error('[av] 致命:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
