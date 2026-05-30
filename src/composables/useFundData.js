/**
 * composables/useFundData.js
 * LOF基金数据获取、缓存、合并逻辑
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
  if (!response.ok) throw new Error(`行情API请求失败: ${response.status}`)
  const json = await response.json()
  if (!json.success) throw new Error(json.error || '行情数据获取失败')
  return json.data
}

/**
 * 获取估算净值（通过Vercel Serverless代理）
 */
async function fetchEstimatedNavs(codes) {
  const response = await fetch(`/api/price?codes=${codes.join(',')}`)
  if (!response.ok) throw new Error(`净值API请求失败: ${response.status}`)
  const json = await response.json()
  if (!json.success) throw new Error(json.error || '净值数据获取失败')
  return json.data
}

/**
 * 合并行情和净值数据
 */
function mergeData(prices, navs) {
  const navMap = new Map()
  for (const n of navs) {
    if (n.code) navMap.set(n.code, n)
  }

  return prices.map(p => {
    const nav = navMap.get(p.code)
    const navValue = nav?.estimatedNav || nav?.nav || 0
    const premium = calcPremium(p.price, navValue)

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
      hasNavError: !nav || !!nav.error
    }
  })
}

export function useFundData() {
  const funds = shallowRef([])
  const loading = ref(false)
  const error = ref(null)
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

    // 去重请求（防止同时多个请求）
    if (fetchPromise) {
      await fetchPromise
      funds.value = cachedFunds
      lastUpdate.value = new Date(lastFetchTime)
      return
    }

    loading.value = true
    error.value = null

    fetchPromise = (async () => {
      try {
        const [prices, navs] = await Promise.all([
          fetchMarketPrices(codes),
          fetchEstimatedNavs(codes)
        ])

        const merged = mergeData(prices, navs)
        cachedFunds = merged
        lastFetchTime = Date.now()
        lastUpdate.value = new Date()
        updateCount.value++
        return merged
      } catch (err) {
        error.value = err.message
        // 如果有缓存，返回缓存数据
        if (cachedFunds) {
          return cachedFunds
        }
        return []
      } finally {
        loading.value = false
        fetchPromise = null
      }
    })()

    const result = await fetchPromise
    funds.value = result
  }

  return {
    funds,
    loading,
    error,
    lastUpdate,
    updateCount,
    fetchData
  }
}
