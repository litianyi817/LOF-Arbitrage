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
 * 获取估算净值
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
      high: p.high, low: p.low, open: p.open, prevClose: p.prevClose,
      estimatedNav: navValue,
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
    const hasNav = nav && (nav.displayNav > 0 || nav.estimatedNav > 0 || nav.nav > 0)
    const navValue = hasNav ? (nav.displayNav || nav.estimatedNav || nav.nav) : 0
    const premium = navValue > 0 ? calcPremium(p.price, navValue) : 0

    return {
      code: p.code,
      name: p.name || nav?.name || '未知',
      marketPrice: p.price,
      changePct: p.changePct || 0,
      high: p.high, low: p.low, open: p.open, prevClose: p.prevClose,
      estimatedNav: navValue,
      navDate: nav?.navDate || '',
      estimatedTime: nav?.estimatedTime || '',
      estimatedPct: nav?.estimatedPct || 0,
      premium,
      premiumLevel: getPremiumLevel(premium),
      hasNavError: !hasNav,
      marketSource,
      navSource
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
        error.value = err.message
        loading.value = false
        fetchPromise = null
        if (cachedFunds) { funds.value = cachedFunds; return cachedFunds }
        funds.value = []
        return []
      }

      // === 步骤2：获取净值 ===
      let navs = [], navSrc = navSource
      try {
        const result = await fetchEstimatedNavs(codes, navSource, customNavUrl)
        navs = result.data
        navSrc = result.source || navSource
      } catch (err) {
        navError.value = '净值数据暂不可用'
        console.warn('[useFundData] 净值API失败:', err.message)
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
