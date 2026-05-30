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
    <main class="flex-1 pt-14 sm:pt-12 pb-16 sm:pb-4 flex flex-col">
      <!-- 错误提示 -->
      <div
        v-if="dataError"
        class="mx-3 mt-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between"
      >
        <div class="flex items-center gap-2 text-sm text-red-400">
          <span>⚠️</span>
          <span>{{ dataError }}</span>
        </div>
        <button
          @click="refreshNow"
          class="px-3 py-1 rounded bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
        >
          重试
        </button>
      </div>

      <!-- 非交易时间提示 -->
      <div
        v-if="marketStatus.status === 'closed' && !dataLoading"
        class="mx-3 mt-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-400 flex items-center gap-2"
      >
        <span>{{ marketStatus.icon }}</span>
        <span>{{ marketStatus.label }} — 显示最近一次缓存数据</span>
      </div>

      <!-- 基金数据表格 -->
      <div class="flex-1 mt-2">
        <FundTable
          :funds="funds"
          :loading="dataLoading"
          :isWatched="(code) => isWatched(code)"
          @select="openArbitrage"
          @toggle-watch="handleToggleWatch"
        />
      </div>
    </main>

    <!-- 底部操作栏 -->
    <nav class="fixed bottom-0 left-0 right-0 z-30 bg-bg-card/95 backdrop-blur border-t border-white/10 px-3 py-2"
         :style="{ paddingBottom: 'calc(var(--safe-area-bottom) + 0.5rem)' }">
      <div class="flex items-center justify-around max-w-lg mx-auto">
        <!-- 关注列表按钮 -->
        <button
          @click="showWatchlist = true"
          class="flex flex-col items-center gap-0.5 text-muted hover:text-yellow-400 transition-colors px-4 py-1"
        >
          <span class="text-lg">⭐</span>
          <span class="text-2xs">关注 ({{ watchlist.length }})</span>
        </button>

        <!-- 数据概览 -->
        <div class="flex flex-col items-center gap-0.5 text-muted px-4 py-1">
          <span class="text-lg">📊</span>
          <span class="text-2xs">{{ updateCount > 0 ? `已刷新${updateCount}次` : '等待数据' }}</span>
        </div>

        <!-- 手动刷新 -->
        <button
          @click="refreshNow"
          :disabled="isRefreshing"
          class="flex flex-col items-center gap-0.5 text-accent hover:text-blue-300 transition-colors px-4 py-1 disabled:opacity-50"
        >
          <span class="text-lg" :class="{ 'animate-spin': isRefreshing }">↻</span>
          <span class="text-2xs">{{ isRefreshing ? '刷新中' : '刷新' }}</span>
        </button>
      </div>
    </nav>

    <!-- 套利计算弹窗 -->
    <ArbitrageCalc
      :fund="selectedFund"
      @close="selectedFund = null"
    />

    <!-- 关注列表面板 -->
    <Watchlist
      :show="showWatchlist"
      :watchlist="watchlist"
      :removeFund="removeFund"
      :exportConfig="exportConfig"
      :importConfig="(cb) => importConfig(cb)"
      :resetToDefault="resetToDefault"
      @close="showWatchlist = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import StatusBar from './components/StatusBar.vue'
import FundTable from './components/FundTable.vue'
import ArbitrageCalc from './components/ArbitrageCalc.vue'
import Watchlist from './components/Watchlist.vue'
import { useFundData } from './composables/useFundData.js'
import { useWatchlist } from './composables/useWatchlist.js'
import { useAutoRefresh } from './composables/useAutoRefresh.js'

// ===== 数据获取 =====
const { funds, loading: dataLoading, error: dataError, lastUpdate, updateCount, fetchData } = useFundData()

// ===== 关注列表 =====
const {
  watchlist,
  removeFund,
  isWatched,
  toggleFund,
  resetToDefault,
  exportConfig,
  importConfig,
  getWatchCodes
} = useWatchlist()

// ===== 自动刷新 =====
function onRefresh() {
  const codes = getWatchCodes()
  return fetchData(codes, true)
}

const {
  isEnabled,
  isRefreshing,
  countdown,
  marketStatus,
  tradingNow,
  refreshNow,
  toggleAutoRefresh
} = useAutoRefresh(onRefresh, { interval: 30_000 })

// ===== 弹窗状态 =====
const selectedFund = ref(null)
const showWatchlist = ref(false)

function openArbitrage(fund) {
  selectedFund.value = fund
}

function handleToggleWatch(fund) {
  const added = toggleFund(fund)
  // 如果新添加的基金不在当前数据中，刷新数据
  if (added) {
    refreshNow()
  }
}

// ===== iOS 100vh 修复 =====
function setVH() {
  const vh = window.innerHeight * 0.01
  document.documentElement.style.setProperty('--vh', `${vh}px`)
}

// ===== 监听自定义事件（从Watchlist组件） =====
function handleAddWatch(e) {
  const { code, name } = e.detail
  if (!isWatched(code)) {
    // 添加到关注列表
    watchlist.value = [...watchlist.value, { code, name }]
    refreshNow()
  }
}

// ===== 生命周期 =====
onMounted(() => {
  setVH()
  window.addEventListener('resize', setVH)
  window.addEventListener('orientationchange', () => setTimeout(setVH, 100))
  window.addEventListener('lof:add-watch', handleAddWatch)

  // 初次加载数据
  const codes = getWatchCodes()
  if (codes.length > 0) {
    fetchData(codes, true)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', setVH)
  window.removeEventListener('lof:add-watch', handleAddWatch)
})

// ===== 暴露给模板 =====
// (所有变量已通过setup返回，模板可直接使用)
</script>
