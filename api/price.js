/**
 * /api/price.js — Vercel Serverless Function v2
 * 三源净值查询: 天天基金 → 东方财富lsjz → 东方财富pingzhongdata
 */

const TIANTIAN_URL = 'https://fundgz.1234567.com.cn/js'
const EASTMONEY_LSJZ = 'https://api.fund.eastmoney.com/f10/lsjz'
const EASTMONEY_PZD = 'https://fund.eastmoney.com/pingzhongdata'

async function fetchFundNav(code) {
  // 方案1: 天天基金（实时估算净值）
  try { const r = await tryTiantian(code); if (r && !r.error) return r } catch {}
  // 方案2: 东方财富历史净值
  try { const r = await tryEastmoneyLSJZ(code); if (r && !r.error) return r } catch {}
  // 方案3: 东方财富基金数据页
  try { const r = await tryEastmoneyPZD(code); if (r && !r.error) return r } catch {}
  return { code, error: '所有净值源均失败' }
}

async function tryTiantian(code) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    const resp = await fetch(`${TIANTIAN_URL}/${code}.js`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' }
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const text = await resp.text()
    const m = text.match(/jsonpgz\((\{[\s\S]*?\})\)/i)
    if (!m) throw new Error('非JSONP')
    const raw = JSON.parse(m[1])
    const gsz = parseFloat(raw.gsz) || 0
    const dwjz = parseFloat(raw.dwjz) || 0
    return {
      code: raw.fundcode || code, name: raw.name || '',
      nav: dwjz, estimatedNav: gsz,
      estimatedTime: raw.gztime || '', estimatedPct: parseFloat(raw.gszzl) || 0,
      navDate: raw.jzrq || '', navAcc: parseFloat(raw.ljjz) || 0,
      displayNav: gsz > 0 ? gsz : dwjz, source: 'tiantian'
    }
  } finally { clearTimeout(t) }
}

async function tryEastmoneyLSJZ(code) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    const resp = await fetch(`${EASTMONEY_LSJZ}?callback=&fundCode=${code}&pageIndex=1&pageSize=1`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' }
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const text = await resp.text()
    let data
    try { data = JSON.parse(text) } catch {
      const m = text.match(/^\s*\w*\((.+)\)\s*;?\s*$/s)
      if (m) data = JSON.parse(m[1]); else throw new Error('非JSON')
    }
    const records = data?.Data?.LSJZList || []
    if (!records.length) throw new Error('无净值记录')
    const nav = parseFloat(records[0].DWJZ) || 0
    return {
      code, name: '', nav, estimatedNav: 0,
      estimatedTime: '', estimatedPct: 0,
      navDate: records[0].FSRQ || '', navAcc: parseFloat(records[0].LJJZ) || 0,
      displayNav: nav, source: 'eastmoney_nav'
    }
  } finally { clearTimeout(t) }
}

async function tryEastmoneyPZD(code) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const resp = await fetch(`${EASTMONEY_PZD}/${code}.js`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' }
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const text = await resp.text()
    // 格式: var Data_netWorthTrend = [{y:1.234,...}];
    const nameM = text.match(/fS_name\s*=\s*"(.+?)"/)
    const codeM = text.match(/fS_code\s*=\s*"(\d+)"/)
    const navM = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/)
    if (!navM) throw new Error('未找到净值数据')
    const trends = JSON.parse(navM[1])
    if (!trends.length) throw new Error('净值数组为空')
    const latest = trends[trends.length - 1]
    const nav = parseFloat(latest.y) || 0
    const equity = parseFloat(latest.equityReturn) || 0
    return {
      code: codeM ? codeM[1] : code,
      name: nameM ? nameM[1] : '',
      nav, estimatedNav: 0,
      estimatedTime: '', estimatedPct: equity,
      navDate: '', navAcc: 0,
      displayNav: nav, source: 'eastmoney_pzd'
    }
  } finally { clearTimeout(t) }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials','true')
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const u = req.url.startsWith('http')?req.url:`http://${req.headers.host}${req.url}`
    const { searchParams:sp } = new URL(u)
    const codes = sp.get('codes')?.split(',').filter(Boolean).slice(0,12) || (sp.get('code')?[sp.get('code')]:[])
    if (!codes.length) return res.status(400).json({ success:false, error:'缺少code/codes参数' })
    const sourceParam = sp.get('source') || 'tiantian'

    const results = []
    for (let i=0; i<codes.length; i+=4) {
      const batch = codes.slice(i,i+4)
      const settled = await Promise.allSettled(batch.map(fetchFundNav))
      for (const r of settled) {
        results.push(r.status==='fulfilled'?r.value:{ code:'unknown', error:r.reason?.message||'失败' })
      }
    }

    for (const r of results) {
      if (!r.error && r.displayNav === undefined) {
        r.displayNav = r.estimatedNav > 0 ? r.estimatedNav : r.nav
      }
    }

    res.status(200).json({
      success: true, total: codes.length,
      successCount: results.filter(r=>!r.error).length,
      data: results, source: sourceParam,
      time: new Date().toISOString()
    })
  } catch(err) {
    res.status(500).json({ success:false, error:err.message, time:new Date().toISOString() })
  }
}
