/**
 * /api/fund.js — Vercel Serverless Function v3
 * 代理东方财富API，获取LOF基金场内实时行情
 *
 * 策略：优先用 fs 市场过滤，失败时回退 secids
 * 去掉 ut token 依赖，部分API版本不需要
 */

const API_BASE = 'https://push2.eastmoney.com/api/qt/clist/get'

// LOF市场代码
const MARKETS = {
  szLof: 'b:MK0021',       // 深市LOF
  shLof: 'b:MK0022',        // 沪市LOF
}

// 常用LOF基金（兜底用）
const FALLBACK_CODES = [
  '161116','160505','161005','161706','160706','161028',
  '160626','161725','161726','161027','160716','162411',
  '161129','160216','162415','161128','160105','161015',
  '160723','161024','161017','161121','160106','162605',
  '163402','163406','163407','163409','163412','163415',
  '163417','163801','163803','163805','163807','163809',
  '501025','501029','501057','501058','501062','501063',
  '501065','501067','501075','501077','501085','501090',
  '513100','513500','159941','159920','513050','513520',
  '159632','159605','159612','513130','159615','159509',
]

// ut token 候选列表（轮换尝试）
const UT_TOKENS = [
  '',  // 空值优先（部分版本不需要）
  'bd1d9ddb04089700cf9c27f6f7426281',
  'fa1fd17049e0472387a7a6bcd81bee07',
  'f1d7f8c7b2d64c3e9a1f5b2c8d3e4a5b',
]

/**
 * 发起API请求（带ut回退）
 */
async function fetchEastmoney(paramsObj) {
  const baseParams = new URLSearchParams()
  baseParams.set('pn', '1')
  baseParams.set('pz', '200')
  baseParams.set('po', '1')
  baseParams.set('np', '1')
  baseParams.set('fltt', '2')
  baseParams.set('invt', '2')
  baseParams.set('fid', 'f3')
  baseParams.set('fields', 'f2,f3,f4,f12,f14,f15,f16,f17,f18')

  // 追加市场过滤或代码
  for (const [k, v] of Object.entries(paramsObj)) {
    baseParams.set(k, v)
  }

  let lastErr = null

  for (const ut of UT_TOKENS) {
    const params = new URLSearchParams(baseParams.toString())
    params.set('ut', ut)

    const url = `${API_BASE}?${params.toString()}`
    console.log('[fund] 尝试 ut=' + (ut || '(空)'), url.substring(0, 120))

    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 7000)

      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'Accept': '*/*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://quote.eastmoney.com/'
        }
      })
      clearTimeout(t)

      if (!resp.ok) {
        lastErr = `HTTP ${resp.status}`
        console.warn('[fund] 失败:', lastErr, 'ut=' + ut)
        continue
      }

      const text = await resp.text()
      console.log('[fund] 响应:', text.substring(0, 80))

      // 解析
      let data
      try {
        data = JSON.parse(text)
      } catch {
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) { lastErr = '非JSON响应'; continue }
        data = JSON.parse(m[0])
      }

      // 检查业务错误
      if (data?.errcode && data.errcode !== 0) {
        lastErr = `API errcode=${data.errcode} msg=${data.errmsg || ''}`
        console.warn('[fund] 业务错误:', lastErr, 'ut=' + ut)
        continue // 换ut重试
      }

      const items = data?.data?.diff
      if (!items || items.length === 0) {
        lastErr = 'data.diff为空'
        console.warn('[fund] 空数据:', lastErr, 'ut=' + ut)
        continue
      }

      console.log('[fund] 成功! ut=' + ut, '条数=', items.length)
      return items.map(it => ({
        code: it.f12 || '',
        name: it.f14 || '',
        price: parseFloat(it.f2) || 0,
        changePct: parseFloat(it.f3) || 0,
        change: parseFloat(it.f4) || 0,
        high: parseFloat(it.f15) || 0,
        low: parseFloat(it.f16) || 0,
        open: parseFloat(it.f17) || 0,
        prevClose: parseFloat(it.f18) || 0
      }))
    } catch (err) {
      lastErr = err.message
      console.warn('[fund] 异常:', lastErr, 'ut=' + ut)
      // 继续下一个ut
    }
  }

  throw new Error(`所有ut均失败。最后错误: ${lastErr}`)
}

/**
 * 获取指定代码的行情（secids方式，<=20个）
 */
async function fetchByCodes(codes) {
  const secids = codes.map(c => {
    if (c.startsWith('16') || c.startsWith('15')) return `0.${c}`
    if (c.startsWith('50') || c.startsWith('51')) return `1.${c}`
    return `0.${c}`
  }).join(',')

  return fetchEastmoney({ secids, pz: String(codes.length + 5) })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const urlStr = req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`
    const { searchParams } = new URL(urlStr)
    const codesParam = searchParams.get('codes')
    const sourceParam = searchParams.get('source') || 'eastmoney'

    let allFunds = []
    let usedFallback = false

    if (codesParam) {
      // 指定代码模式：分批获取
      const codes = codesParam.split(',').filter(Boolean).slice(0, 20)
      console.log('[fund] 指定代码模式:', codes.length, '个')

      for (let i = 0; i < codes.length; i += 10) {
        const batch = codes.slice(i, i + 10)
        try {
          const funds = await fetchByCodes(batch)
          allFunds.push(...funds)
        } catch (e) {
          console.error('[fund] 批次失败:', e.message)
        }
      }

      if (allFunds.length === 0) {
        console.log('[fund] 指定代码全失败，回退全市场...')
        usedFallback = true
      }
    }

    // 无代码参数 或 指定代码全失败 → 全市场获取
    if (!codesParam || usedFallback) {
      for (const [label, fs] of Object.entries(MARKETS)) {
        try {
          const funds = await fetchEastmoney({ fs })
          console.log('[fund]', label, ':', funds.length, '条')
          allFunds.push(...funds)
        } catch (e) {
          console.error('[fund]', label, '失败:', e.message)
        }
      }
    }

    // 如果全市场也失败，最后兜底：用内置代码列表
    if (allFunds.length === 0) {
      console.log('[fund] 全市场失败，使用兜底代码...')
      try {
        allFunds = await fetchByCodes(FALLBACK_CODES)
      } catch (e) {
        console.error('[fund] 兜底也失败:', e.message)
      }
    }

    // 终极兜底：API 完全不可达时返回静态示例数据（至少界面不空白）
    if (allFunds.length === 0) {
      console.log('[fund] 所有API不可达，返回静态占位数据')
      allFunds = FALLBACK_CODES.slice(0, 10).map(code => ({
        code,
        name: '数据加载中...',
        price: 0,
        changePct: 0,
        change: 0,
        high: 0, low: 0, open: 0, prevClose: 0
      }))
      res.status(200).json({
        success: true,
        total: allFunds.length,
        data: allFunds,
        source: 'fallback',
        warning: '数据源暂时不可达，显示占位数据。请检查网络或刷新重试。',
        time: new Date().toISOString()
      })
      return
    }

    // 去重
    const seen = new Set()
    const unique = allFunds.filter(f => {
      if (!f.code || seen.has(f.code)) return false
      seen.add(f.code)
      return f.price > 0
    })

    console.log('[fund] 最终:', unique.length, '条')

    res.status(200).json({
      success: true,
      total: unique.length,
      data: unique,
      source: sourceParam,
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
