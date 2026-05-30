<template>
  <div class="fund-table w-full max-w-[1920px] mx-auto">
    <!-- 工具栏 -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 bg-bg-card/50 border-b border-white/5">
      <!-- 左侧：统计 + 搜索 -->
      <div class="flex items-center gap-3 flex-1">
        <span class="text-sm text-muted whitespace-nowrap">
          共 <span class="text-white font-semibold">{{ displayFunds.length }}</span> 只
        </span>

        <!-- 代码搜索框 -->
        <div class="relative flex-1 max-w-[260px]">
          <input
            v-model="searchQuery"
            @keydown.enter="handleSearchEnter"
            type="text"
            inputmode="numeric"
            placeholder="输入代码搜索..."
            maxlength="6"
            class="w-full bg-bg border text-sm rounded-lg pl-8 pr-8 py-1.5 font-mono-num placeholder:text-muted/40 focus:border-accent focus:outline-none transition-colors"
            :class="searchQuery ? 'border-accent/40' : 'border-white/10'"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">🔍</span>
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-white text-sm"
          >✕</button>
        </div>

        <span v-if="loading" class="text-xs text-accent animate-pulse hidden sm:inline">加载中...</span>
        <span v-if="!loading && lastUpdateText" class="text-xs text-muted hidden sm:inline">
          {{ lastUpdateText }}
        </span>
      </div>

      <!-- 右侧：排序切换 -->
      <div class="flex items-center gap-1.5">
        <button
          v-for="s in sortOptions"
          :key="s.key"
          @click="toggleSort(s.key)"
          class="px-3 py-1 rounded text-xs font-medium transition-colors"
          :class="sortKey === s.key
            ? 'bg-accent/25 text-accent shadow-sm shadow-accent/10'
            : 'text-muted hover:text-white hover:bg-white/5'"
        >
          {{ s.label }}
          <span v-if="sortKey === s.key" class="ml-1 text-sm">{{ sortAsc ? '↑' : '↓' }}</span>
        </button>
      </div>
    </div>

    <!-- 数据来源图例（简版） -->
    <div class="hidden sm:flex items-center gap-3 px-4 py-1.5 text-2xs text-muted border-b border-white/5 bg-bg/30">
      <span class="text-muted">来源:</span>
      <span
        v-for="s in activeSources"
        :key="s.id"
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
        :style="{ backgroundColor: s.color + '18', color: s.color }"
      >
        {{ s.icon }} {{ s.label }}
      </span>
    </div>

    <!-- 表头 - 桌面端 -->
    <div class="hidden xl:grid grid-cols-12 gap-2 px-4 py-2.5 text-xs text-muted uppercase tracking-wider border-b border-white/5 bg-bg/70 sticky top-0 z-10 backdrop-blur-sm">
      <div class="col-span-2 cursor-pointer select-none hover:text-white transition-colors" @click="toggleSort('code')">
        代码 {{ sortKey === 'code' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-3 cursor-pointer select-none hover:text-white transition-colors" @click="toggleSort('name')">
        基金名称 {{ sortKey === 'name' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-2 text-right cursor-pointer select-none hover:text-white transition-colors" @click="toggleSort('price')">
        场内价 {{ sortKey === 'price' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-2 text-right">估算净值</div>
      <div class="col-span-2 text-right cursor-pointer select-none hover:text-white transition-colors font-semibold text-accent" @click="toggleSort('premium')">
        溢价率 {{ sortKey === 'premium' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-1 text-center">关注</div>
    </div>

    <!-- 数据行区域 -->
    <div class="overflow-y-auto" :style="{ maxHeight: tableMaxHeight }">
      <!-- 骨架屏 -->
      <template v-if="loading && funds.length === 0">
        <div v-for="i in 6" :key="'sk'+i" class="px-4 py-4 border-b border-white/5">
          <div class="flex items-center gap-4">
            <div class="skeleton h-5 w-16 rounded"></div>
            <div class="skeleton h-5 flex-1 rounded"></div>
            <div class="skeleton h-5 w-24 rounded"></div>
            <div class="skeleton h-5 w-20 rounded"></div>
          </div>
        </div>
      </template>

      <!-- 数据行 -->
      <div
        v-for="(fund, idx) in sortedFunds"
        :key="fund.code"
        @click="$emit('select', fund)"
        class="tr-hover px-4 py-3.5 border-b border-white/[0.03] cursor-pointer transition-all duration-150 grid grid-cols-12 gap-2 items-center text-sm"
        :class="[
          idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]',
          {
            '!bg-up-bg/50 border-l-[3px] border-l-up': fund.premiumLevel === 'deep-up',
            '!bg-up-bg/25 border-l-[3px] border-l-up-light': fund.premiumLevel === 'up',
            '!bg-down-bg/50 border-l-[3px] border-l-down': fund.premiumLevel === 'deep-down',
            '!bg-down-bg/25 border-l-[3px] border-l-down-light': fund.premiumLevel === 'down'
          }
        ]"
      >
        <!-- 代码 -->
        <div class="col-span-2 font-mono-num text-sm xl:text-base font-medium truncate tracking-tight">
          {{ fund.code }}
        </div>

        <!-- 名称 -->
        <div class="col-span-3 text-sm xl:text-base truncate text-slate-300">
          {{ fund.name }}
          <span v-if="fund.hasNavError" class="text-yellow-500 text-xs ml-1.5" title="净值数据暂不可用">⚠</span>
          <span v-if="fund.navStale" class="text-muted text-2xs ml-1">缓存</span>
        </div>

        <!-- 场内价 + 来源标签 -->
        <div class="col-span-2 text-right font-mono-num text-sm xl:text-base">
          <span class="font-semibold">{{ formatPrice(fund.marketPrice) }}</span>
          <div class="text-xs" :class="fund.changePct >= 0 ? 'text-up-light' : 'text-down-light'">
            {{ fund.changePct >= 0 ? '+' : '' }}{{ fund.changePct.toFixed(2) }}%
          </div>
          <div
            v-if="fund.marketSource"
            class="inline-block mt-0.5 text-2xs px-1.5 py-0.5 rounded-full font-medium"
            :style="{ backgroundColor: getSourceLabel(fund.marketSource).color + '20', color: getSourceLabel(fund.marketSource).color }"
            :title="'行情来源: ' + getSourceLabel(fund.marketSource).name"
          >
            {{ getSourceLabel(fund.marketSource).icon }} {{ getSourceLabel(fund.marketSource).name }}
          </div>
        </div>

        <!-- 估算净值 + 来源标签 -->
        <div class="col-span-2 text-right font-mono-num text-sm xl:text-base">
          <span :class="{ 'text-muted': !fund.estimatedNav }">
            {{ fund.estimatedNav ? formatPrice(fund.estimatedNav) : '--' }}
          </span>
          <div v-if="fund.estimatedTime" class="text-xs text-muted">
            {{ fund.estimatedTime }}
          </div>
          <div
            v-if="fund.navSource"
            class="inline-block mt-0.5 text-2xs px-1.5 py-0.5 rounded-full font-medium"
            :style="{ backgroundColor: getSourceLabel(fund.navSource).color + '20', color: getSourceLabel(fund.navSource).color }"
            :title="'净值来源: ' + getSourceLabel(fund.navSource).name"
          >
            {{ getSourceLabel(fund.navSource).icon }} {{ getSourceLabel(fund.navSource).name }}
          </div>
        </div>

        <!-- 溢价率 - 放大突出的标签 -->
        <div class="col-span-2 text-right">
          <span
            class="inline-block px-2.5 py-1 rounded-lg font-bold font-mono-num text-sm xl:text-base min-w-[80px] text-center"
            :class="premiumBadgeClass(fund)"
          >
            {{ formatPremium(fund.premium) }}
          </span>
        </div>

        <!-- 关注 -->
        <div class="col-span-1 text-center">
          <button
            @click.stop="$emit('toggle-watch', fund)"
            class="text-xl transition-all duration-150 active:scale-125 hover:scale-110"
            :title="isWatched(fund.code) ? '取消关注' : '添加关注'"
          >
            {{ isWatched(fund.code) ? '⭐' : '☆' }}
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && filteredFunds.length === 0" class="py-20 text-center text-muted">
        <div class="text-5xl mb-4">📊</div>
        <p class="text-base font-medium">暂无数据</p>
        <p class="text-sm mt-2 text-muted/70">点击底部刷新按钮获取数据</p>
        <p class="text-xs mt-1 text-muted/50">如持续无数据，请检查网络连接</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatPct } from '../utils/calculator.js'

// 数据源 → 显示标签映射
const SOURCE_LABELS = {
  eastmoney:     { icon: '📡', name: '东财', color: '#4dabf7' },
  sina:          { icon: '📰', name: '新浪', color: '#f39c12' },
  tencent:       { icon: '💬', name: '腾讯', color: '#2ecc71' },
  tiantian:      { icon: '🏦', name: '天天', color: '#e67e22' },
  eastmoney_nav: { icon: '📡', name: '东财净值', color: '#4dabf7' },
  cache:         { icon: '💾', name: '缓存', color: '#8892b0' },
  alphavantage:  { icon: '📈', name: 'Alpha', color: '#9b59b6' },
  eastmoney_iopv:{ icon: '📡', name: '东财IOPV', color: '#4dabf7' },
  tiantian_direct:{ icon: '🏦', name: '天天直连', color: '#e67e22' },
  unknown:       { icon: '❓', name: '未知', color: '#8892b0' }
}

function getSourceLabel(sourceId) {
  return SOURCE_LABELS[sourceId] || SOURCE_LABELS.unknown
}

// 当前活跃的数据源（用于图例）
const activeSources = computed(() => {
  const funds = props.funds || []
  const seen = new Set()
  const sources = []
  for (const f of funds) {
    if (f.marketSource && !seen.has(f.marketSource)) {
      seen.add(f.marketSource)
      const label = getSourceLabel(f.marketSource)
      sources.push({ id: f.marketSource, icon: label.icon, label: label.name + '(行情)', color: label.color })
    }
    if (f.navSource && !seen.has(f.navSource)) {
      seen.add(f.navSource)
      const label = getSourceLabel(f.navSource)
      sources.push({ id: f.navSource, icon: label.icon, label: label.name + '(净值)', color: label.color })
    }
  }
  return sources.slice(0, 4)
})

const props = defineProps({
  funds: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  isWatched: { type: Function, default: () => false },
  lastUpdate: { type: Date, default: null }
})

const emit = defineEmits(['select', 'toggle-watch', 'search-code'])

// 搜索
const searchQuery = ref('')

function handleSearchEnter() {
  const q = searchQuery.value.trim()
  if (q.length >= 6 && /^\d{6}$/.test(q)) {
    // 检查是否已在当前列表中
    const found = props.funds.find(f => f.code === q)
    if (!found) {
      // 不在列表中，触发外部查询
      emit('search-code', q)
    }
  }
}

// 排序
const sortKey = ref('premium')
const sortAsc = ref(false)
const sortOptions = [
  { key: 'premium', label: '溢价率' },
  { key: 'price', label: '价格' },
  { key: 'code', label: '代码' }
]

function toggleSort(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === 'premium' ? false : true
  }
}

// 更新时间文本
const lastUpdateText = computed(() => {
  if (!props.lastUpdate) return ''
  return props.lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

// 表格最大高度（响应式）
const tableMaxHeight = computed(() => {
  // 4K/2K: 更大高度; 1080p: 标准; 手机: 紧凑
  if (typeof window === 'undefined') return '60vh'
  const h = window.innerHeight
  if (h > 1600) return 'calc(var(--vh, 1vh) * 72)'   // 4K
  if (h > 1000) return 'calc(var(--vh, 1vh) * 65)'   // 2K/1080p
  return 'calc(var(--vh, 1vh) * 55)'                   // 手机/平板
})

const filteredFunds = computed(() => {
  let arr = props.funds.filter(f => f.marketPrice > 0)

  // 代码/名称搜索过滤
  const q = searchQuery.value.trim()
  if (q) {
    arr = arr.filter(f =>
      f.code.includes(q) || (f.name && f.name.includes(q))
    )
  }

  return arr
})

const sortedFunds = computed(() => {
  const arr = [...filteredFunds.value]
  const key = sortKey.value
  const asc = sortAsc.value

  arr.sort((a, b) => {
    let va = a[key] ?? 0
    let vb = b[key] ?? 0
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return asc ? va - vb : vb - va
  })
  return arr
})

// 模板中使用的名称（保持兼容）
const displayFunds = computed(() => filteredFunds.value)

function formatPrice(v) {
  if (v <= 0) return '--'
  return v >= 1 ? v.toFixed(3) : v.toFixed(4)
}

function formatPremium(v) {
  if (!v || !isFinite(v)) return '--'
  return formatPct(v)
}

function premiumBadgeClass(fund) {
  switch (fund.premiumLevel) {
    case 'deep-up':
      return 'bg-red-500/25 text-red-400 ring-1 ring-red-500/40'
    case 'up':
      return 'bg-red-500/15 text-red-300 ring-1 ring-red-500/20'
    case 'deep-down':
      return 'bg-emerald-500/25 text-emerald-400 ring-1 ring-emerald-500/40'
    case 'down':
      return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
    default:
      return 'bg-white/5 text-slate-400'
  }
}
</script>
