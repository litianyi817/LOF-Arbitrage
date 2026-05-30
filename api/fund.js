/**
 * /api/fund.js — Vercel Serverless Function v5
 * 多数据源: 新浪财经 → 东方财富 → 完整代码列表
 */

// ====== 数据源1: 新浪财经 (hq.sinajs.cn) ======
async function fetchSina(codes) {
  // 新浪支持批量: sz161116,sh501025
  const symbols = codes.map(c => {
    if (c.startsWith('16') || c.startsWith('15')) return `sz${c}`
    if (c.startsWith('50') || c.startsWith('51')) return `sh${c}`
    return `sz${c}`
  }).join(',')

  const url = `https://hq.sinajs.cn/list=${symbols}`
  console.log('[sina] 请求:', symbols.length, '个')

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)

  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'Referer': 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0'
      }
    })
    clearTimeout(t)

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

    // 新浪返回 GBK 编码的文本
    const buf = await resp.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buf)
    console.log('[sina] 响应:', text.substring(0, 150))

    const results = []
    const lines = text.split('\n').filter(Boolean)

    for (const line of lines) {
      const m = line.match(/hq_str_(\w+)="(.+)"/)
      if (!m) continue

      const symbol = m[1]          // sz161116
      const code = symbol.slice(2) // 161116
      const fields = m[2].split(',')

      // 基金格式: 名称,今开,昨收,最新价,最高,最低,成交量,成交额,...
      // ETF/LOF格式可能略有不同
      const name = fields[0] || ''
      const open = parseFloat(fields[1]) || 0
      const prevClose = parseFloat(fields[2]) || 0
      const price = parseFloat(fields[3]) || 0
      const high = parseFloat(fields[4]) || 0
      const low = parseFloat(fields[5]) || 0

      if (price > 0) {
        results.push({
          code, name, price,
          changePct: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
          change: price - prevClose,
          open, high, low, prevClose
        })
      }
    }

    console.log('[sina] 解析到:', results.length, '条')
    return results
  } finally {
    clearTimeout(t)
  }
}

// ====== 数据源2: 东方财富 ======
const EM_BASE = 'https://push2.eastmoney.com/api/qt/clist/get'
const UT_TOKENS = ['', 'bd1d9ddb04089700cf9c27f6f7426281']

async function fetchEastmoney(codes) {
  const secids = codes.map(c => {
    if (c.startsWith('16') || c.startsWith('15')) return `0.${c}`
    if (c.startsWith('50') || c.startsWith('51')) return `1.${c}`
    return `0.${c}`
  }).join(',')

  const base = new URLSearchParams()
  base.set('pn','1'); base.set('pz',String(codes.length+5))
  base.set('po','1'); base.set('np','1'); base.set('fltt','2')
  base.set('invt','2'); base.set('fid','f3')
  base.set('secids', secids)
  base.set('fields','f2,f3,f4,f12,f14,f15,f16,f17,f18')

  for (const ut of UT_TOKENS) {
    const p = new URLSearchParams(base.toString()); p.set('ut', ut)
    const url = `${EM_BASE}?${p}`
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent':'Mozilla/5.0', 'Referer':'https://quote.eastmoney.com/' }
      })
      clearTimeout(t)
      if (!resp.ok) continue
      const text = await resp.text()
      let data
      try { data = JSON.parse(text) } catch {
        const m = text.match(/\{[\s\S]*\}/); if (!m) continue
        data = JSON.parse(m[0])
      }
      const items = data?.data?.diff
      if (!items?.length) continue
      console.log('[eastmoney] 成功:', items.length, '条')
      return items.map(it => ({
        code: it.f12||'', name: it.f14||'',
        price: parseFloat(it.f2)||0, changePct: parseFloat(it.f3)||0,
        change: parseFloat(it.f4)||0, high: parseFloat(it.f15)||0,
        low: parseFloat(it.f16)||0, open: parseFloat(it.f17)||0,
        prevClose: parseFloat(it.f18)||0
      }))
    } catch {}
  }
  throw new Error('eastmoney failed')
}

// ====== 完整代码列表(兜底) ======
const ALL_CODES = [
  '161116','160505','161005','161706','160706','161028','160626','161725',
  '161726','161027','160716','162411','161129','160216','162415','161128',
  '160105','161015','160723','161024','161017','161121','160106','162605',
  '160644','160643','160645','160646','160648','160649',
  '163402','163406','163407','163409','163412','163415','163417',
  '163801','163803','163805','163807','163809','163813','163816',
  '501025','501029','501057','501058','501062','501063','501065',
  '501067','501075','501077','501085','501090','501092','501095',
  '501300','501301','501302','501303','501305','501310','501311',
  '513100','513500','159941','159920','513050','513520',
  '159632','159605','159612','513130','159615','159509','159655',
]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials','true')
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers','Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const u = req.url.startsWith('http')?req.url:`http://${req.headers.host}${req.url}`
    const { searchParams:sp } = new URL(u)
    const codesParam = sp.get('codes')
    const sourceParam = sp.get('source') || 'auto'

    let codes = codesParam
      ? codesParam.split(',').filter(Boolean).slice(0, 30)
      : ALL_CODES.slice(0, 30)

    let funds = [], usedSource = 'none'

    // 策略1: 新浪财经 (可能对海外IP友好)
    try {
      funds = await fetchSina(codes)
      usedSource = 'sina'
      console.log('[fund] 新浪成功:', funds.length)
    } catch (e) {
      console.warn('[fund] 新浪失败:', e.message)
    }

    // 策略2: 东方财富 (如果新浪失败或数据不够)
    if (funds.length < codes.length * 0.5) {
      try {
        const emFunds = await fetchEastmoney(codes)
        // 合并：优先新浪数据，补东方财富
        const emMap = new Map(emFunds.map(f => [f.code, f]))
        for (const f of funds) {
          emMap.delete(f.code) // 已有数据不覆盖
        }
        const extra = [...emMap.values()]
        funds.push(...extra)
        usedSource = usedSource === 'sina' ? 'sina+eastmoney' : 'eastmoney'
        console.log('[fund] 东方财富补充:', extra.length)
      } catch (e) {
        console.warn('[fund] 东方财富失败:', e.message)
      }
    }

    // 策略3: 如果数据太少，尝试扩大代码列表
    if (funds.length < 5 && !codesParam) {
      try {
        funds = await fetchSina(ALL_CODES.slice(0, 40))
        usedSource = 'sina_full'
      } catch {}
    }

    // 去重、过滤
    const seen = new Set()
    const unique = funds.filter(f => {
      if (!f.code || seen.has(f.code) || f.price <= 0) return false
      seen.add(f.code)
      return true
    })

    console.log('[fund] 最终:', unique.length, '条, 来源:', usedSource)

    res.status(200).json({
      success: true,
      total: unique.length,
      data: unique,
      source: usedSource,
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error('[fund] 致命:', err.message)
    res.status(500).json({
      success: false,
      error: err.message,
      time: new Date().toISOString()
    })
  }
}
