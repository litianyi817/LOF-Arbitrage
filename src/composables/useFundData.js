/**
 * composables/useFundData.js v2
 * 支持多数据源切换 + 来源标注
 */
import { ref, shallowRef } from 'vue'
import { calcPremium, getPremiumLevel } from '../utils/calculator.js'

let lastFetchTime = 0
let cachedFunds = null
let fetchPromise = null
let currentCacheDuration = 30_000

/**
 * 获取场内实时行情
 */
async function fetchMarketPrices(codes, source, customUrl, avKey) {
  // Alpha Vantage 走独立端点
  if (source === 'alphavantage' && codes && codes.length > 0) {
    const key = avKey || 'demo'
    const url = `/api/alphavantage?codes=${codes.join(',')}&apikey=${key}`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Alpha Vantage: HTTP ${resp.status}`)
    const json = await resp.json()
    if (!json.success) throw new Error(json.error || 'Alpha Vantage 请求失败')
    return { data: json.data, source: 'alphavantage' }
  }

  let url = '/api/fund'
  if (codes && codes.length > 0) url += `?codes=${codes.join(',')}`
  else url += '?all=true'
  if (source) url += `&source=${source}`
  if (customUrl) url += `&customUrl=${encodeURIComponent(customUrl)}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`行情API: HTTP ${response.status}`)
  const json = await response.json()
  if (!json.success) throw new Error(json.error || '行情数据获取失败')
  if (!json.data || json.data.length === 0) {
    const warning = json.warning || '行情数据为空'
    throw new Error(warning)
  }
  return { data: json.data, source: json.source || source || 'eastmoney', warning: json.warning || null }
}

/**
 * 获取估算净值（Vercel 代理）
 */
async function fetchEstimatedNavs(codes, source, customUrl) {
  let url = '/api/price'
  if (codes && codes.length > 0) url += `?codes=${codes.join(',')}`
  if (source) url += `&source=${source}`
  if (customUrl) url += `&customUrl=${encodeURIComponent(customUrl)}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`净值API: HTTP ${response.status}`)
  const json = await response.json()
  if (!json.success) throw new Error(json.error || '净值数据获取失败')
  return { data: json.data || [], source: json.source || source || 'tiantian' }
}

/**
 * 浏览器直连东方财富 JSONP 获取行情
 */
function jsonpRequest(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const cbName = '_em_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6)
    const sep = url.includes('?') ? '&' : '?'
    const fullUrl = `${url}${sep}cb=${cbName}`

    const script = document.createElement('script')
    const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP超时')) }, timeout)

    function cleanup() {
      clearTimeout(timer)
      delete window[cbName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    window[cbName] = (data) => { cleanup(); resolve(data) }
    script.onerror = () => { cleanup(); reject(new Error('JSONP加载失败')) }
    script.src = fullUrl
    document.head.appendChild(script)
  })
}

/**
 * 浏览器直连东方财富 JSONP——全市场模式（fs过滤）
 * 一次请求拿所有深市+沪市 LOF/ETF
 */
async function fetchMarketJSONPAll() {
  const base = 'https://push2.eastmoney.com/api/qt/clist/get'
  const allFunds = []

  // 多组市场过滤：LOF + ETF（ETF网格可能包含IOPV字段）
  const mkts = [
    'b:MK0406',  // 深市ETF（可能有IOPV）
    'b:MK0407',  // 沪市ETF
    'b:MK0021',  // 深市LOF
    'b:MK0022',  // 沪市LOF
  ]
  for (const fs of mkts) {
    try {
      const params = new URLSearchParams()
      params.set('pn','1'); params.set('pz','500'); params.set('po','1')
      params.set('np','1'); params.set('fltt','2'); params.set('invt','2')
      params.set('fid','f3'); params.set('fs', fs)
      params.set('fields','f2,f3,f4,f5,f12,f14,f15,f16,f17,f18,f20,f21,f22')

      const data = await jsonpRequest(`${base}?${params.toString()}`, 12000)
      const items = data?.data?.diff || []
      console.log('[JSONP]', fs, ':', items.length, '条')
      const sampleSuspended = items.filter(it => parseFloat(it.f5) === 0).length
      const sampleQDII = items.filter(it => /QDII|纳斯达克|标普|恒生|港股|全球|海外|美元|港股通|中概|互联|德国|法国|日本|印度|越南|韩国|台湾/i.test(it.f14||'')).length
      console.log('[JSONP] 停牌:', sampleSuspended, '| QDII:', sampleQDII)

      for (const it of items) {
        const iopv = parseFloat(it.f21) || parseFloat(it.f22) || parseFloat(it.f20) || 0
        const volume = parseFloat(it.f5) || 0
        const name = it.f14 || ''
        allFunds.push({
          code: it.f12||'', name,
          price: parseFloat(it.f2)||0, changePct: parseFloat(it.f3)||0,
          change: parseFloat(it.f4)||0, volume,
          high: parseFloat(it.f15)||0, low: parseFloat(it.f16)||0,
          open: parseFloat(it.f17)||0, prevClose: parseFloat(it.f18)||0,
          estimatedNav: iopv,
          estimatedTime: iopv > 0 ? '实时' : '',
          navSource: iopv > 0 ? 'eastmoney_iopv' : null,
          isSuspended: it.f5 !== undefined && it.f5 !== '' && volume === 0 && parseFloat(it.f2) > 0,
          isQDII: /QDII|纳斯达克|标普|恒生|港股|全球|海外|美元|港股通|中概|互联|德国|法国|日本|印度|越南|韩国|台湾/i.test(name)
        })
      }
    } catch (e) {
      console.warn('[JSONP]', fs, '失败:', e.message)
    }
  }

  if (!allFunds.length) throw new Error('全市场JSONP无数据')
  return allFunds
}

/**
 * 浏览器直连东方财富 JSONP——指定代码模式
 */
function fetchMarketJSONP(codes) {
  const secids = codes.map(c => {
    if (c.startsWith('16') || c.startsWith('15')) return `0.${c}`
    if (c.startsWith('50') || c.startsWith('51')) return `1.${c}`
    return `0.${c}`
  }).join(',')

  const params = new URLSearchParams()
  params.set('pn','1'); params.set('pz', String(codes.length + 5))
  params.set('po','1'); params.set('np','1'); params.set('fltt','2')
  params.set('invt','2'); params.set('fid','f3')
  params.set('secids', secids)
  params.set('fields','f2,f3,f4,f12,f14,f15,f16,f17,f18')

  return jsonpRequest(`https://push2.eastmoney.com/api/qt/clist/get?${params.toString()}`, 10000)
    .then(data => {
      const items = data?.data?.diff || []
      if (!items.length) throw new Error('行情数据为空')
      return items.map(it => ({
        code: it.f12||'', name: it.f14||'',
        price: parseFloat(it.f2)||0, changePct: parseFloat(it.f3)||0,
        change: parseFloat(it.f4)||0, high: parseFloat(it.f15)||0,
        low: parseFloat(it.f16)||0, open: parseFloat(it.f17)||0,
        prevClose: parseFloat(it.f18)||0
      }))
    })
}

// 全局 jsonpgz 调度器（天天基金 JSONP 固定调用此函数）
window._navCallbacks = window._navCallbacks || {}
window.jsonpgz = function(raw) {
  const cb = window._navCallbacks._current
  if (cb) { window._navCallbacks._current = null; cb(raw) }
}

function fetchNavJSONP(code) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => {
      window._navCallbacks._current = null
      if (script.parentNode) script.parentNode.removeChild(script)
      reject(new Error('JSONP超时'))
    }, 6000)

    window._navCallbacks._current = (raw) => {
      clearTimeout(timer)
      if (script.parentNode) script.parentNode.removeChild(script)
      if (!raw) { reject(new Error('响应为空')); return }
      const gsz = parseFloat(raw.gsz) || 0
      const dwjz = parseFloat(raw.dwjz) || 0
      resolve({
        code: raw.fundcode || code,
        name: raw.name || '',
        nav: dwjz,
        estimatedNav: gsz,
        estimatedTime: raw.gztime || '',
        estimatedPct: parseFloat(raw.gszzl) || 0,
        navDate: raw.jzrq || '',
        navAcc: parseFloat(raw.ljjz) || 0,
        displayNav: gsz > 0 ? gsz : dwjz,
        source: 'tiantian_direct'
      })
    }

    script.onerror = () => {
      clearTimeout(timer)
      window._navCallbacks._current = null
      if (script.parentNode) script.parentNode.removeChild(script)
      reject(new Error('JSONP加载失败'))
    }

    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?_=${Date.now()}`
    document.head.appendChild(script)
  })
}

/**
 * 浏览器直连批量获取净值
 */
async function fetchNavsDirectJSONP(codes) {
  const results = []
  // 天天基金 JSONP 只能串行（全局回调 jsonpgz 不可重入）
  for (const code of codes) {
    try {
      const r = await fetchNavJSONP(code)
      results.push(r)
    } catch (e) {
      results.push({ code, error: e.message })
    }
  }
  return { data: results, source: 'tiantian_direct' }
}

function buildBasicFunds(prices, existingFunds, marketSource) {
  const existingMap = new Map()
  if (existingFunds) {
    for (const f of existingFunds) {
      if (f.estimatedNav > 0) existingMap.set(f.code, f)
    }
  }

  return prices.map(p => {
    const cached = existingMap.get(p.code)
    const navValue = cached?.estimatedNav || 0
    const premium = navValue > 0 ? calcPremium(p.price, navValue) : 0

    return {
      code: p.code,
      name: p.name || cached?.name || '未知',
      marketPrice: p.price,
      changePct: p.changePct || 0,
      volume: p.volume || 0,
      high: p.high, low: p.low, open: p.open, prevClose: p.prevClose,
      estimatedNav: navValue,
      isSuspended: p.isSuspended || false,
      isQDII: p.isQDII || false,
      navDate: cached?.navDate || '',
      estimatedTime: cached?.estimatedTime || '',
      estimatedPct: cached?.estimatedPct || 0,
      premium,
      premiumLevel: getPremiumLevel(premium),
      hasNavError: false,
      navStale: !!cached,
      marketSource,
      navSource: cached?.navSource || 'cache'
    }
  })
}

function mergeData(prices, navs, marketSource, navSource) {
  const navMap = new Map()
  for (const n of navs) {
    if (n.code && !n.error) navMap.set(n.code, n)
  }

  return prices.map(p => {
    const nav = navMap.get(p.code)

    // 优先级: fund API 自带的IOPV > 天天基金估算净值 > 东方财富历史净值
    const fromIOPV = p.estimatedNav || 0
    const fromNavAPI = nav ? (nav.displayNav || nav.estimatedNav || nav.nav || 0) : 0
    const navValue = fromIOPV > 0 ? fromIOPV : fromNavAPI

    const premium = navValue > 0 ? calcPremium(p.price, navValue) : 0
    const actualNavSource = fromIOPV > 0 ? (p.navSource || 'eastmoney_iopv') : navSource

    return {
      code: p.code,
      name: p.name || nav?.name || '未知',
      marketPrice: p.price,
      changePct: p.changePct || 0,
      volume: p.volume || 0,
      high: p.high, low: p.low, open: p.open, prevClose: p.prevClose,
      estimatedNav: navValue,
      isSuspended: p.isSuspended || false,
      isQDII: p.isQDII || false,
      navDate: nav?.navDate || '',
      estimatedTime: fromIOPV > 0 ? (p.estimatedTime || '实时') : (nav?.estimatedTime || ''),
      estimatedPct: nav?.estimatedPct || 0,
      premium,
      premiumLevel: getPremiumLevel(premium),
      hasNavError: navValue <= 0,
      marketSource,
      navSource: actualNavSource
    }
  })
}

export function useFundData() {
  const funds = shallowRef([])
  const loading = ref(false)
  const error = ref(null)
  const navError = ref(null)
  const lastUpdate = ref(null)
  const updateCount = ref(0)
  const activeMarketSource = ref('eastmoney')
  const activeNavSource = ref('tiantian')

  async function fetchData(codes, force = false, options = {}) {
    // null = 全市场模式；空数组 = 不查询
    if (codes && codes.length === 0) {
      funds.value = []
      return
    }

    const {
      marketSource = 'eastmoney',
      navSource = 'tiantian',
      customMarketUrl = '',
      customNavUrl = '',
      cacheDuration = 30_000,
      alphaVantageKey = ''
    } = options

    currentCacheDuration = cacheDuration
    activeMarketSource.value = marketSource
    activeNavSource.value = navSource

    const now = Date.now()
    if (!force && cachedFunds && now - lastFetchTime < cacheDuration) {
      funds.value = cachedFunds
      lastUpdate.value = new Date(lastFetchTime)
      return
    }

    if (fetchPromise) {
      await fetchPromise
      funds.value = cachedFunds
      lastUpdate.value = new Date(lastFetchTime)
      return
    }

    loading.value = true
    error.value = null
    navError.value = null

    fetchPromise = (async () => {
      // === 步骤1：获取行情 ===
      let prices = [], marketSrc = marketSource
      try {
        const result = await fetchMarketPrices(codes, marketSource, customMarketUrl, alphaVantageKey)
        prices = result.data
        marketSrc = result.source || marketSource
      } catch (err) {
        console.warn('[useFundData] Vercel行情API失败:', err.message)
        // 备用：浏览器直连东方财富 JSONP
        if (codes && codes.length > 0) {
          // 有指定代码 → 精确查询
          try {
            console.log('[useFundData] 浏览器直连行情 JSONP...', codes.length, '个')
            prices = await fetchMarketJSONP(codes.slice(0, 30))
            marketSrc = 'eastmoney_direct'
          } catch (e2) {
            console.warn('[useFundData] 行情JSONP失败:', e2.message)
          }
        } else {
          // 全市场模式 → 用 fs 过滤拿全部
          try {
            console.log('[useFundData] 浏览器全市场行情 JSONP...')
            prices = await fetchMarketJSONPAll()
            marketSrc = 'eastmoney_direct'
          } catch (e2) {
            console.warn('[useFundData] 全市场JSONP失败:', e2.message)
          }
        }

        // 如果 JSONP 也失败，报错
        if (prices.length === 0) {
          error.value = err.message
          loading.value = false
          fetchPromise = null
          if (cachedFunds) { funds.value = cachedFunds; return cachedFunds }
          funds.value = []
          return []
        }
      }

      // === 步骤2：获取净值 ===
      let navs = [], navSrc = navSource

      // 先检查行情数据里是否已有 IOPV
      const hasIOPV = prices.some(p => p.estimatedNav > 0)
      const jsonpCodes = codes && codes.length > 0 ? codes : prices.map(p => p.code).filter(Boolean)

      if (!hasIOPV && jsonpCodes.length > 0) {
        try {
          // 串行取净值（先取前100只做排名，其余后台加载）
          const limit = 100
          const batch = jsonpCodes.slice(0, limit)
          console.log('[useFundData] JSONP净值串行获取...', batch.length, '个')
          navs = (await fetchNavsDirectJSONP(batch)).data
          navSrc = 'tiantian_direct'
          if (jsonpCodes.length > limit) {
            navError.value = `净值加载中...（前${limit}只，其余后台获取中）`
            // 后台继续加载剩余（不阻塞页面）
            const remaining = jsonpCodes.slice(limit)
            fetchNavsDirectJSONP(remaining).then(extra => {
              // 更新缓存
              if (cachedFunds) {
                const extraMap = new Map(extra.data.filter(n => !n.error).map(n => [n.code, n]))
                cachedFunds = cachedFunds.map(f => {
                  const nav = extraMap.get(f.code)
                  if (nav && nav.displayNav > 0) {
                    const premium = calcPremium(f.marketPrice, nav.displayNav)
                    return { ...f, estimatedNav: nav.displayNav, premium, premiumLevel: getPremiumLevel(premium), navSource: 'tiantian_direct', hasNavError: false }
                  }
                  return f
                })
                funds.value = cachedFunds
                navError.value = null
              }
            }).catch(() => {})
          }
        } catch (e2) {
          console.warn('[useFundData] JSONP净值失败:', e2.message)
          navError.value = '净值数据暂不可用'
        }
      } else if (!hasIOPV) {
        navError.value = '净值数据暂不可用'
      }

      // === 合并 ===
      let merged
      if (navs.length > 0) {
        merged = mergeData(prices, navs, marketSrc, navSrc)
      } else {
        merged = buildBasicFunds(prices, cachedFunds, marketSrc)
        if (!navError.value) navError.value = '净值数据暂不可用'
      }

      cachedFunds = merged
      lastFetchTime = Date.now()
      lastUpdate.value = new Date()
      updateCount.value++
      return merged
    })()

    const result = await fetchPromise
    funds.value = result
    loading.value = false
    fetchPromise = null
  }

  return {
    funds, loading, error, navError, lastUpdate, updateCount,
    activeMarketSource, activeNavSource, fetchData
  }
}
