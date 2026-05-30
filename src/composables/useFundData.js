/**
 * composables/useFundData.js
 * LOF基金数据获取、缓存、合并逻辑
 * 
 * v1.1: 解耦行情和净值请求，独立容错
 */
import { ref, shallowRef } from 'vue'
import { calcPremium, getPremiumLevel } from '../utils/calculator.js'

const CACHE_DURATION = 30_000 // 30秒缓存

// 全局缓存（跨组件共享）
let lastFetchTime = 0
let cachedFunds = null
let fetchPromise = null

/**
 * 获取场内实时行情（通过Vercel Serverless代理）
 */
async function fetchMarketPrices(codes) {
  const codeStr = codes.join(',')
  const response = await fetch(`/api/fund?codes=${codeStr}`)
  if (!response.ok) throw new Error(`行情API: HTTP ${response.status}`)
  const json = await response.json()
  if (!json.success) throw new Error(json.error || '行情数据获取失败')
  if (!json.data || json.data.length === 0) throw new Error('行情数据为空')
  return json.data
}

/**
 * 获取估算净值（通过Vercel Serverless代理）
 * 注意：此API可能因Vercel海外IP被限制，失败时不影响行情展示
 */
async function fetchEstimatedNavs(codes) {
  const response = await fetch(`/api/price?codes=${codes.join(',')}`)
  if (!response.ok) throw new Error(`净值API: HTTP ${response.status}`)
  const json = await response.json()
  if (!json.success) throw new Error(json.error || '净值数据获取失败')
  return json.data || []
}

/**
 * 从行情数据构建基础基金对象（净值不可用时使用）
 */
function buildBasicFunds(prices, existingFunds) {
  // 从已有缓存中获取净值信息
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
      high: p.high,
      low: p.low,
      open: p.open,
      prevClose: p.prevClose,
      estimatedNav: navValue,
      navDate: cached?.navDate || '',
      estimatedTime: cached?.estimatedTime || '',
      estimatedPct: cached?.estimatedPct || 0,
      premium,
      premiumLevel: getPremiumLevel(premium),
      hasNavError: false,
      navStale: !!cached // 标记净值来自缓存
    }
  })
}

/**
 * 合并行情和净值数据
 */
function mergeData(prices, navs) {
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
      high: p.high,
      low: p.low,
      open: p.open,
      prevClose: p.prevClose,
      estimatedNav: navValue,
      navDate: nav?.navDate || '',
      estimatedTime: nav?.estimatedTime || '',
      estimatedPct: nav?.estimatedPct || 0,
      premium,
      premiumLevel: getPremiumLevel(premium),
      hasNavError: !hasNav
    }
  })
}

export function useFundData() {
  const funds = shallowRef([])
  const loading = ref(false)
  const error = ref(null)
  const navError = ref(null)  // 净值单独的错误提示
  const lastUpdate = ref(null)
  const updateCount = ref(0)

  async function fetchData(codes, force = false) {
    if (!codes || codes.length === 0) {
      funds.value = []
      return
    }

    // 30秒内复用缓存
    const now = Date.now()
    if (!force && cachedFunds && now - lastFetchTime < CACHE_DURATION) {
      funds.value = cachedFunds
      lastUpdate.value = new Date(lastFetchTime)
      return
    }

    // 去重请求
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
      // === 第一步：获取行情（必须成功）===
      let prices = []
      try {
        prices = await fetchMarketPrices(codes)
      } catch (err) {
        error.value = err.message
        loading.value = false
        fetchPromise = null
        // 如果有缓存，使用缓存
        if (cachedFunds) {
          funds.value = cachedFunds
          return cachedFunds
        }
        funds.value = []
        return []
      }

      // === 第二步：获取净值（允许失败）===
      let navs = []
      try {
        navs = await fetchEstimatedNavs(codes)
      } catch (err) {
        navError.value = '净值数据暂不可用（显示上一交易日净值）'
        console.warn('[useFundData] 净值API失败:', err.message)
      }

      // === 合并数据 ===
      let merged
      if (navs.length > 0) {
        merged = mergeData(prices, navs)
      } else {
        // 净值API完全失败，用缓存中的净值兜底
        merged = buildBasicFunds(prices, cachedFunds)
        if (!navError.value) {
          navError.value = '净值数据暂不可用'
        }
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
    funds,
    loading,
    error,
    navError,
    lastUpdate,
    updateCount,
    fetchData
  }
}
