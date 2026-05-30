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
  base.set('fields','f2,f3,f4,f12,f14,f15,f16,f17,f18,f20,f21,f22,f23,f24,f25')

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
      // 打印第一条的所有字段用于调试
      if (items[0]) console.log('[eastmoney] 调试字段:', JSON.stringify(items[0]).substring(0, 300))
      return items.map(it => {
        const iopv = parseFloat(it.f21) || parseFloat(it.f20) || 0
        return {
          code: it.f12||'', name: it.f14||'',
          price: parseFloat(it.f2)||0, changePct: parseFloat(it.f3)||0,
          change: parseFloat(it.f4)||0, high: parseFloat(it.f15)||0,
          low: parseFloat(it.f16)||0, open: parseFloat(it.f17)||0,
          prevClose: parseFloat(it.f18)||0,
          // IOPV 实时估值（ETF/LOF专属字段）
          estimatedNav: iopv,
          estimatedTime: iopv > 0 ? '实时' : '',
          navSource: iopv > 0 ? 'eastmoney_iopv' : null
        }
      })
    } catch {}
  }
  throw new Error('eastmoney failed')
}

// ====== 完整代码列表(兜底) ======
const ALL_CODES = [
  // 深市LOF 16xxxx
  '160105','160106','160119','160125','160127','160128','160135',
  '160140','160142','160143','160211','160212','160213','160215',
  '160216','160218','160220','160221','160222','160311','160314',
  '160322','160323','160324','160325','160415','160416','160418',
  '160419','160420','160421','160422','160505','160512','160513',
  '160515','160516','160517','160518','160519','160520','160522',
  '160523','160525','160526','160527','160528','160529','160603',
  '160605','160607','160608','160610','160611','160613','160615',
  '160616','160617','160618','160620','160621','160623','160624',
  '160625','160626','160628','160629','160630','160631','160632',
  '160633','160634','160635','160636','160638','160639','160640',
  '160642','160643','160644','160645','160646','160648','160649',
  '160706','160716','160717','160718','160719','160720','160722',
  '160723','160724','160725','160726','160727','160805','160806',
  '160807','160808','160809','160812','160813','160910','160916',
  '160918','160919','160921','160922','160924','160925','161005',
  '161010','161014','161015','161017','161019','161022','161024',
  '161025','161026','161027','161028','161029','161030','161031',
  '161032','161033','161035','161036','161037','161038','161039',
  '161040','161115','161116','161117','161118','161119','161120',
  '161121','161122','161123','161124','161125','161126','161127',
  '161128','161129','161130','161131','161132','161133','161211',
  '161213','161216','161217','161219','161222','161224','161225',
  '161226','161227','161228','161229','161230','161231','161232',
  '161233','161601','161603','161604','161606','161607','161609',
  '161610','161611','161612','161613','161614','161615','161616',
  '161618','161620','161624','161625','161626','161627','161628',
  '161629','161631','161706','161713','161714','161715','161716',
  '161717','161718','161720','161721','161722','161723','161724',
  '161725','161726','161727','161728','161729','161810','161811',
  '161812','161813','161815','161820','161821','161831','161903',
  '161907','161908','161910','161911','161912','161913','162006',
  '162102','162201','162202','162203','162207','162208','162209',
  '162210','162211','162212','162213','162214','162215','162216',
  '162307','162411','162412','162413','162414','162415','162416',
  '162509','162510','162511','162512','162605','162607','162703',
  '162711','162712','163001','163109','163110','163111','163113',
  '163114','163115','163116','163117','163118','163119','163208',
  '163209','163302','163402','163406','163407','163409','163412',
  '163415','163417','163503','163801','163802','163803','163804',
  '163805','163806','163807','163808','163809','163810','163811',
  '163812','163813','163816','163817','163818','163819','163820',
  '163821','163822','163823','163824','163825',
  // 沪市LOF 501xxx
  '501000','501001','501002','501003','501005','501006','501007',
  '501008','501009','501010','501011','501012','501015','501016',
  '501017','501018','501019','501021','501022','501023','501025',
  '501026','501027','501028','501029','501030','501031','501032',
  '501036','501037','501038','501039','501040','501041','501042',
  '501043','501045','501046','501047','501048','501049','501050',
  '501051','501052','501053','501054','501055','501056','501057',
  '501058','501059','501060','501061','501062','501063','501064',
  '501065','501066','501067','501068','501069','501070','501071',
  '501072','501073','501075','501076','501077','501078','501079',
  '501080','501081','501082','501083','501085','501086','501087',
  '501088','501089','501090','501091','501092','501093','501095',
  '501096','501097','501098','501099','501100',
  '501200','501201','501202','501203','501205','501206','501207',
  '501208','501209','501210','501211','501212','501213','501215',
  '501216','501217','501218','501219','501220','501221','501222',
  '501223','501225','501226','501227','501228','501229','501230',
  '501300','501301','501302','501303','501305','501306','501307',
  '501308','501309','501310','501311','501312',
  // 跨境ETF 51xxxx 159xxx
  '510050','510300','510500','510880','513100','513500','513050',
  '513520','513130','513030','513090','513880',
  '159941','159920','159915','159949','159605','159612','159615',
  '159632','159509','159655','159561','159566','159562','159601',
  '159602','159603','159606','159608','159609','159610','159611',
  '159613','159618','159619','159620','159623','159625','159627',
  '159628','159629','159630','159633','159636','159637','159638',
  '159640','159641','159642','159643','159645','159646','159647',
  '159648','159649','159650','159651','159652','159653','159656',
  '159657','159658','159659','159660','159661','159662','159663',
  '159665','159666','159667','159669','159670','159671','159672',
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

    const allMode = sp.get('all') === 'true'
    let codes = codesParam
      ? codesParam.split(',').filter(Boolean).slice(0, 30)
      : allMode ? ALL_CODES : ALL_CODES.slice(0, 30)

    let funds = [], usedSource = 'none'

    // 按 source 参数决定数据源顺序
    const preferSina = sourceParam === 'sina' || sourceParam === 'auto'
    const preferEastmoney = sourceParam === 'eastmoney'

    const firstFn = preferEastmoney ? fetchEastmoney : fetchSina
    const firstName = preferEastmoney ? 'eastmoney' : 'sina'
    const secondFn = preferEastmoney ? fetchSina : fetchEastmoney
    const secondName = preferEastmoney ? 'sina' : 'eastmoney'

    // 策略1: 首选数据源
    try {
      funds = await firstFn(codes)
      usedSource = firstName
      console.log('[fund]', firstName, '成功:', funds.length)
    } catch (e) {
      console.warn('[fund]', firstName, '失败:', e.message)
    }

    // 策略2: 备选数据源（补充缺失）
    if (funds.length < codes.length * 0.5) {
      try {
        const extraFunds = await secondFn(codes)
        const emMap = new Map(extraFunds.map(f => [f.code, f]))
        for (const f of funds) emMap.delete(f.code)
        const extra = [...emMap.values()]
        funds.push(...extra)
        usedSource = usedSource === firstName ? `${firstName}+${secondName}` : secondName
        console.log('[fund]', secondName, '补充:', extra.length)
      } catch (e) {
        console.warn('[fund]', secondName, '失败:', e.message)
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
