/**
 * /api/fund.js — Vercel Serverless Function
 * 代理东方财富API，获取LOF基金场内实时行情
 *
 * 调用方式: GET /api/fund?codes=161116,160505,...
 *             GET /api/fund?market=MK0021  (获取深市全部LOF)
 */

// 东方财富行情推送接口
const EASTMONEY_URL = 'https://push2.eastmoney.com/api/qt/clist/get'

// 默认LOF基金池（深市LOF + 沪市LOF常用代码）
const DEFAULT_CODES = [
  // 深市LOF（市场代码 MK0021 / 0）
  '161116', '160505', '161005', '161706', '160706', '161028',
  '160626', '161725', '161726', '161027', '160716', '162411',
  '161129', '160216', '162415', '161128', '160105', '161015',
  '160723', '161024', '161017', '161121', '160106', '162605',
  '163402', '163406', '163407', '163409', '163412', '163415',
  '163417', '163801', '163803', '163805', '163807', '163809',
  '163813', '163816', '163822', '163823',
  // 沪市LOF
  '501025', '501029', '501057', '501058', '501062', '501063',
  '501065', '501067', '501075', '501077', '501085', '501090',
  '501092', '501095', '501300', '501301', '501302', '501303',
  '501305', '501310', '501311', '501312',
  // 热门跨境LOF
  '513100', '513500', '159941', '159920', '513050', '513520',
  '159632', '159605', '159612', '513130', '159615', '159509',
  '159561', '159655'
]

// 构建请求参数
function buildParams(codes, market) {
  const params = new URLSearchParams()

  if (codes && codes.length > 0) {
    // 按市场分组的基金代码
    const szCodes = codes.filter(c => c.startsWith('16') || c.startsWith('15'))
    const shCodes = codes.filter(c => c.startsWith('50') || c.startsWith('51'))
    const etfCodes = codes.filter(c => c.startsWith('51') || c.startsWith('58'))

    // 合并所有代码（用逗号分隔，API会自动识别市场）
    params.set('secids', codes.map(c => {
      if (c.startsWith('16') || c.startsWith('15')) return `0.${c}`
      if (c.startsWith('50') || c.startsWith('51')) return `1.${c}`
      return `0.${c}` // 默认深市
    }).join(','))
  } else if (market) {
    params.set('fs', `b:${market}`)
  } else {
    // 默认获取深市LOF
    const allCodes = buildParamCodes(DEFAULT_CODES)
    params.set('secids', allCodes)
  }

  params.set('fields', 'f2,f3,f4,f12,f14,f15,f16,f17,f18,f20,f21')
  // f2=最新价, f3=涨跌幅%, f4=涨跌额, f12=代码, f14=名称
  // f15=最高, f16=最低, f17=开盘, f18=昨收, f20=总市值, f21=流通市值
  params.set('fltt', '2')
  params.set('np', '3')
  params.set('ut', 'bd1d9ddb04089700cf9c27f6f7426281')
  params.set('cb', '') // 禁用JSONP回调

  return params
}

function buildParamCodes(codes) {
  return codes.map(c => {
    if (c.startsWith('16') || c.startsWith('15')) return `0.${c}`
    if (c.startsWith('50') || c.startsWith('51') || c.startsWith('58')) return `1.${c}`
    return `0.${c}`
  }).join(',')
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
    const codesParam = searchParams.get('codes')
    const marketParam = searchParams.get('market')

    const codes = codesParam
      ? codesParam.split(',').filter(Boolean)
      : DEFAULT_CODES

    const url = `${EASTMONEY_URL}?${buildParams(codes, marketParam)}`

    // 带超时的fetch
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://quote.eastmoney.com/'
      }
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()

    // 解析JSON（东方财富接口可能返回JSONP或纯JSON）
    let data
    try {
      data = JSON.parse(text)
    } catch {
      // 尝试提取JSONP中的JSON部分
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('无法解析API响应')
      }
    }

    // 提取需要的字段
    const funds = (data?.data?.diff || []).map(item => ({
      code: item.f12 || '',
      name: item.f14 || '',
      price: parseFloat(item.f2) || 0,       // 最新价
      changePct: parseFloat(item.f3) || 0,   // 涨跌幅
      change: parseFloat(item.f4) || 0,      // 涨跌额
      high: parseFloat(item.f15) || 0,
      low: parseFloat(item.f16) || 0,
      open: parseFloat(item.f17) || 0,
      prevClose: parseFloat(item.f18) || 0,
      totalCap: parseFloat(item.f20) || 0,
      floatCap: parseFloat(item.f21) || 0
    }))

    res.status(200).json({
      success: true,
      total: funds.length,
      data: funds,
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error('[fund API] Error:', err.message)
    res.status(500).json({
      success: false,
      error: err.message,
      time: new Date().toISOString()
    })
  }
}
