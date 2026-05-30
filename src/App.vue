<template>
  <div class="min-h-screen bg-bg text-white flex flex-col"
       :style="{ minHeight: 'calc(var(--vh, 1vh) * 100)' }">

    <!-- 顶部状态栏 -->
    <StatusBar
      :marketStatus="marketStatus"
      :isEnabled="isEnabled"
      :isRefreshing="isRefreshing"
      :countdown="countdown"
      :tradingNow="tradingNow"
      :lastUpdate="lastUpdate"
      @refresh="refreshNow"
      @toggle-auto="toggleAutoRefresh"
    />

    <!-- 主内容区 -->
    <main class="flex-1 pt-16 sm:pt-14 pb-24 sm:pb-6 flex flex-col max-w-[1920px] mx-auto w-full">
      <!-- 错误提示 -->
      <div
        v-if="dataError"
        class="mx-3 sm:mx-4 mt-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between"
      >
        <div class="flex items-center gap-2 text-sm text-red-400">
          <span>⚠️</span>
          <span>{{ dataError }}</span>
        </div>
        <button
          @click="doRefreshWithSettings"
          class="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors font-medium"
        >重试</button>
      </div>

      <!-- 净值数据异常提示 -->
      <div
        v-if="navError && !dataLoading"
        class="mx-3 sm:mx-4 mt-2 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-2 text-sm text-yellow-400"
      >
        <span>⚠️</span>
        <span>{{ navError }}</span>
      </div>

      <!-- 非交易时间提示 -->
      <div
        v-if="marketStatus.status === 'closed' && !dataLoading"
        class="mx-3 sm:mx-4 mt-3 px-4 py-3 bg-slate-500/10 border border-slate-500/20 rounded-xl text-sm text-slate-400 flex items-center gap-2"
      >
        <span class="text-base">{{ marketStatus.icon }}</span>
        <span>{{ marketStatus.label }} — 显示最近一次数据</span>
        <button @click="doRefreshWithSettings" class="ml-auto px-3 py-1 rounded bg-white/5 text-slate-300 text-xs hover:bg-white/10 transition-colors">手动刷新</button>
      </div>

      <!-- 基金数据表格 -->
      <div class="flex-1 mt-2">
        <FundTable
          :funds="funds"
          :loading="dataLoading"
          :lastUpdate="lastUpdate"
          :isWatched="(code) => isWatched(code)"
          @select="openArbitrage"
          @toggle-watch="handleToggleWatch"
          @search-code="handleSearchCode"
        />
      </div>
    </main>

    <!-- 底部操作栏 -->
    <nav class="fixed bottom-0 left-0 right-0 z-30 bg-bg-card/90 backdrop-blur-md border-t border-white/5 px-2 py-3"
         :style="{ paddingBottom: 'calc(var(--safe-area-bottom) + 0.75rem)' }">
      <div class="flex items-center justify-around max-w-lg mx-auto">
        <!-- 关注列表 -->
        <button @click="showWatchlist = true" class="flex flex-col items-center gap-1 text-muted hover:text-yellow-400 transition-colors px-4 py-1">
          <span class="text-2xl">⭐</span>
          <span class="text-xs font-medium">关注({{ watchlist.length }})</span>
        </button>

        <!-- 数据概览 -->
        <div class="flex flex-col items-center gap-1 text-muted px-4 py-1">
          <span class="text-2xl">📊</span>
          <span class="text-xs">{{ updateCount > 0 ? `刷新${updateCount}次` : '等待数据' }}</span>
        </div>

        <!-- 手动刷新 -->
        <button @click="doRefreshWithSettings" :disabled="isRefreshing" class="flex flex-col items-center gap-1 text-accent hover:text-blue-300 transition-colors px-4 py-1 disabled:opacity-50">
          <span class="text-2xl" :class="{ 'animate-spin': isRefreshing }">↻</span>
          <span class="text-xs font-medium">{{ isRefreshing ? '刷新中' : '刷新' }}</span>
        </button>

        <!-- 设置 -->
        <button @click="showSettings = true" class="flex flex-col items-center gap-1 text-muted hover:text-white transition-colors px-4 py-1">
          <span class="text-2xl">⚙️</span>
          <span class="text-xs font-medium">设置</span>
        </button>
      </div>
    </nav>

    <!-- 弹窗们 -->
    <ArbitrageCalc :fund="selectedFund" @close="selectedFund = null" />
    <Watchlist :show="showWatchlist" :watchlist="watchlist" :removeFund="removeFund" :exportConfig="exportConfig" :importConfig="(cb) => importConfig(cb)" :resetToDefault="resetToDefault" @close="showWatchlist = false" />
    <SettingsPanel :show="showSettings" @close="onSettingsClosed" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import StatusBar from './components/StatusBar.vue'
import FundTable from './components/FundTable.vue'
import ArbitrageCalc from './components/ArbitrageCalc.vue'
import Watchlist from './components/Watchlist.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useFundData } from './composables/useFundData.js'
import { useWatchlist } from './composables/useWatchlist.js'
import { useAutoRefresh } from './composables/useAutoRefresh.js'
import { useSettings } from './composables/useSettings.js'

const { funds, loading: dataLoading, error: dataError, navError, lastUpdate, updateCount, fetchData } = useFundData()
const { watchlist, removeFund, isWatched, toggleFund, resetToDefault, exportConfig, importConfig, getWatchCodes } = useWatchlist()
const { settings, getApiParams } = useSettings()

function doRefreshWithSettings() {
  const apiParams = getApiParams()
  // Alpha Vantage 需要 codes，其他源不需要
  const codes = apiParams.marketSource === 'alphavantage' ? getWatchCodes() : null
  return fetchData(codes, true, {
    marketSource: apiParams.marketSource,
    navSource: apiParams.navSource,
    customMarketUrl: apiParams.customMarketUrl,
    customNavUrl: apiParams.customNavUrl,
    cacheDuration: settings.refreshInterval,
    alphaVantageKey: apiParams.alphaVantageKey
  })
}

function onRefresh() { return doRefreshWithSettings() }

const { isEnabled, isRefreshing, countdown, marketStatus, tradingNow, refreshNow, toggleAutoRefresh } = useAutoRefresh(onRefresh, { interval: settings.refreshInterval })

// 设置变化时重新加载
const showSettings = ref(false)
function onSettingsClosed() {
  showSettings.value = false
  doRefreshWithSettings()
}

const selectedFund = ref(null)
const showWatchlist = ref(false)

function openArbitrage(fund) { selectedFund.value = fund }
function handleToggleWatch(fund) {
  const added = toggleFund(fund)
  if (added) doRefreshWithSettings()
}

// 搜索不在当前列表中的代码 → 临时加入查询
async function handleSearchCode(code) {
  if (!code || code.length < 6) return
  if (!isWatched(code)) {
    watchlist.value = [...watchlist.value, { code, name: '查询中...' }]
  }
  // 直接用这个代码去查
  await fetchData([code], true, {
    marketSource: getApiParams().marketSource,
    navSource: getApiParams().navSource,
    customMarketUrl: getApiParams().customMarketUrl,
    customNavUrl: getApiParams().customNavUrl,
    cacheDuration: settings.refreshInterval,
    alphaVantageKey: getApiParams().alphaVantageKey
  })
  // 查完后更新关注列表中的名称
  const fund = funds.value?.find(f => f.code === code)
  if (fund) {
    const idx = watchlist.value.findIndex(w => w.code === code)
    if (idx !== -1) {
      watchlist.value[idx] = { code: fund.code, name: fund.name }
    }
  }
}

function setVH() {
  const vh = window.innerHeight * 0.01
  document.documentElement.style.setProperty('--vh', `${vh}px`)
}

function handleAddWatch(e) {
  const { code, name } = e.detail
  if (!isWatched(code)) {
    watchlist.value = [...watchlist.value, { code, name }]
    doRefreshWithSettings()
  }
}

onMounted(() => {
  setVH()
  window.addEventListener('resize', setVH)
  window.addEventListener('orientationchange', () => setTimeout(setVH, 100))
  window.addEventListener('lof:add-watch', handleAddWatch)
  const codes = getWatchCodes()
  if (codes.length > 0) doRefreshWithSettings()
})

onUnmounted(() => {
  window.removeEventListener('resize', setVH)
  window.removeEventListener('lof:add-watch', handleAddWatch)
})
</script>
