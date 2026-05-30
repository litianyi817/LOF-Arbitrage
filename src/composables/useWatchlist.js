/**
 * composables/useWatchlist.js
 * 本地关注列表管理（localStorage）
 */
import { ref, watch } from 'vue'

const STORAGE_KEY = 'lof_watchlist_v1'

/**
 * 默认关注的LOF基金列表
 */
const DEFAULT_WATCHLIST = [
  { code: '161116', name: '黄金主题LOF' },
  { code: '160505', name: '博时主题LOF' },
  { code: '162411', name: '华宝油气LOF' },
  { code: '161725', name: '白酒基金LOF' },
  { code: '161726', name: '生物医药LOF' },
  { code: '161028', name: '新能源车LOF' },
  { code: '513100', name: '纳指ETF' },
  { code: '513500', name: '标普500ETF' }
]

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data) && data.length > 0) {
        return data
      }
    }
  } catch {
    // ignore parse errors
  }
  return [...DEFAULT_WATCHLIST]
}

function saveWatchlist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // storage full or unavailable
  }
}

export function useWatchlist() {
  const watchlist = ref(loadWatchlist())

  // 自动保存
  watch(watchlist, (val) => saveWatchlist(val), { deep: true })

  function addFund(fund) {
    if (!watchlist.value.find(f => f.code === fund.code)) {
      watchlist.value.push({
        code: fund.code,
        name: fund.name || '未知'
      })
    }
  }

  function removeFund(code) {
    watchlist.value = watchlist.value.filter(f => f.code !== code)
  }

  function isWatched(code) {
    return watchlist.value.some(f => f.code === code)
  }

  function toggleFund(fund) {
    if (isWatched(fund.code)) {
      removeFund(fund.code)
      return false
    } else {
      addFund(fund)
      return true
    }
  }

  function resetToDefault() {
    watchlist.value = [...DEFAULT_WATCHLIST]
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(watchlist.value, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lof-watchlist.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importConfig(callback) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result)
          if (Array.isArray(data)) {
            watchlist.value = data
            callback?.(true, data.length)
          } else {
            callback?.(false, '格式错误：需要JSON数组')
          }
        } catch {
          callback?.(false, 'JSON解析失败')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // 获取关注的代码列表
  function getWatchCodes() {
    return watchlist.value.map(f => f.code)
  }

  return {
    watchlist,
    addFund,
    removeFund,
    isWatched,
    toggleFund,
    resetToDefault,
    exportConfig,
    importConfig,
    getWatchCodes,
    DEFAULT_WATCHLIST
  }
}
