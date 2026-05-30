/**
 * composables/useSettings.js
 * 数据源配置 + 刷新间隔等设置的 localStorage 管理
 */
import { ref, watch, reactive } from 'vue'

const STORAGE_KEY = 'lof_settings_v2'

// 预设数据源配置
export const DATA_SOURCES = {
  market: [
    {
      id: 'eastmoney',
      name: '东方财富',
      icon: '📡',
      color: '#4dabf7',
      apiParam: 'eastmoney',
      desc: 'push2.eastmoney.com — 沪深LOF实时行情'
    },
    {
      id: 'sina',
      name: '新浪财经',
      icon: '📰',
      color: '#f39c12',
      apiParam: 'sina',
      desc: 'hq.sinajs.cn — 延时行情（备选）'
    },
    {
      id: 'tencent',
      name: '腾讯财经',
      icon: '💬',
      color: '#2ecc71',
      apiParam: 'tencent',
      desc: 'qt.gtimg.cn — 实时行情（备选）'
    },
    {
      id: 'alphavantage',
      name: 'Alpha Vantage',
      icon: '📈',
      color: '#9b59b6',
      apiParam: 'alphavantage',
      desc: '全球API — 需输入API Key，支持沪深市场 (.SHZ/.SHH)'
    }
  ],
  nav: [
    {
      id: 'tiantian',
      name: '天天基金',
      icon: '🏦',
      color: '#e67e22',
      apiParam: 'tiantian',
      desc: 'fundgz.1234567.com.cn — 实时估算净值'
    },
    {
      id: 'eastmoney_nav',
      name: '东方财富净值',
      icon: '📡',
      color: '#4dabf7',
      apiParam: 'eastmoney_nav',
      desc: 'fund.eastmoney.com — 基金历史净值'
    }
  ]
}

// 刷新间隔预设
export const REFRESH_INTERVALS = [
  { value: 15_000, label: '15秒' },
  { value: 30_000, label: '30秒' },
  { value: 60_000, label: '60秒' },
  { value: 120_000, label: '2分钟' },
  { value: 300_000, label: '5分钟' }
]

// 默认设置
const DEFAULTS = {
  marketSource: 'eastmoney',
  navSource: 'tiantian',
  refreshInterval: 30_000,
  customMarketUrl: '',
  customNavUrl: '',
  alphaVantageKey: ''
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return { ...DEFAULTS, ...data }
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function saveSettings(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch { /* ignore */ }
}

// 全局共享单例
let globalSettings = null

export function useSettings() {
  if (globalSettings) return globalSettings

  const settings = reactive(loadSettings())

  // 自动保存
  watch(
    () => ({ ...settings }),
    (val) => saveSettings(val),
    { deep: true }
  )

  function resetAll() {
    Object.assign(settings, DEFAULTS)
  }

  // 获取当前数据源标签信息
  function getMarketSourceInfo() {
    return DATA_SOURCES.market.find(s => s.id === settings.marketSource) || DATA_SOURCES.market[0]
  }

  function getNavSourceInfo() {
    return DATA_SOURCES.nav.find(s => s.id === settings.navSource) || DATA_SOURCES.nav[0]
  }

  // 导出为API请求参数
  function getApiParams() {
    return {
      marketSource: settings.marketSource === 'custom' ? 'custom' : settings.marketSource,
      navSource: settings.navSource === 'custom' ? 'custom' : settings.navSource,
      customMarketUrl: settings.customMarketUrl,
      customNavUrl: settings.customNavUrl,
      alphaVantageKey: settings.alphaVantageKey
    }
  }

  globalSettings = {
    settings,
    resetAll,
    getMarketSourceInfo,
    getNavSourceInfo,
    getApiParams,
    DATA_SOURCES,
    REFRESH_INTERVALS
  }

  return globalSettings
}
