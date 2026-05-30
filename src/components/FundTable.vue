<template>
  <div class="fund-table w-full">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between px-3 py-2 bg-bg-card/50 border-b border-white/5">
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">
          共 <span class="text-white font-medium">{{ filteredFunds.length }}</span> 只基金
        </span>
        <span v-if="loading" class="text-2xs text-accent animate-pulse">加载中...</span>
      </div>

      <!-- 排序切换 -->
      <div class="flex items-center gap-1">
        <button
          v-for="s in sortOptions"
          :key="s.key"
          @click="toggleSort(s.key)"
          class="px-2 py-0.5 rounded text-2xs transition-colors"
          :class="sortKey === s.key ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white'"
        >
          {{ s.label }}
          <span v-if="sortKey === s.key" class="ml-0.5">{{ sortAsc ? '↑' : '↓' }}</span>
        </button>
      </div>
    </div>

    <!-- 表头 -->
    <div class="hidden sm:grid grid-cols-12 gap-1 px-3 py-2 text-2xs text-muted uppercase tracking-wider border-b border-white/5 bg-bg/50">
      <div class="col-span-2 cursor-pointer select-none" @click="toggleSort('code')">
        代码 {{ sortKey === 'code' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-3">名称</div>
      <div class="col-span-2 text-right cursor-pointer select-none" @click="toggleSort('price')">
        场内价 {{ sortKey === 'price' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-2 text-right">估算净值</div>
      <div class="col-span-2 text-right cursor-pointer select-none font-bold" @click="toggleSort('premium')">
        溢价率 {{ sortKey === 'premium' ? (sortAsc ? '↑' : '↓') : '' }}
      </div>
      <div class="col-span-1 text-center">关注</div>
    </div>

    <!-- 数据行 -->
    <div class="max-h-[calc(var(--vh,1vh)*100-280px)] sm:max-h-[calc(var(--vh,1vh)*100-220px)] overflow-y-auto">
      <!-- 骨架屏 -->
      <template v-if="loading && funds.length === 0">
        <div v-for="i in 8" :key="'sk'+i" class="px-3 py-2.5 border-b border-white/5">
          <div class="flex items-center gap-3">
            <div class="skeleton h-4 w-16 rounded"></div>
            <div class="skeleton h-4 flex-1 rounded"></div>
            <div class="skeleton h-4 w-20 rounded"></div>
            <div class="skeleton h-4 w-16 rounded"></div>
          </div>
        </div>
      </template>

      <!-- 数据行 -->
      <div
        v-for="fund in sortedFunds"
        :key="fund.code"
        @click="$emit('select', fund)"
        class="tr-hover px-3 py-2.5 border-b border-white/5 cursor-pointer transition-colors grid grid-cols-12 gap-1 items-center text-sm"
        :class="{
          'bg-up-bg/40': fund.premiumLevel === 'deep-up',
          'bg-up-bg/20': fund.premiumLevel === 'up',
          'bg-down-bg/40': fund.premiumLevel === 'deep-down',
          'bg-down-bg/20': fund.premiumLevel === 'down'
        }"
      >
        <!-- 代码列 -->
        <div class="col-span-2 font-mono-num text-xs sm:text-sm truncate">
          {{ fund.code }}
        </div>

        <!-- 名称列 -->
        <div class="col-span-3 text-xs sm:text-sm truncate text-muted">
          {{ fund.name }}
          <span v-if="fund.hasNavError" class="text-yellow-500 text-2xs ml-1" title="净值数据异常">⚠</span>
        </div>

        <!-- 场内价 -->
        <div class="col-span-2 text-right font-mono-num text-xs sm:text-sm">
          <span>{{ formatPrice(fund.marketPrice) }}</span>
          <div class="text-2xs" :class="fund.changePct >= 0 ? 'text-up-light' : 'text-down-light'">
            {{ fund.changePct >= 0 ? '+' : '' }}{{ fund.changePct.toFixed(2) }}%
          </div>
        </div>

        <!-- 估算净值 -->
        <div class="col-span-2 text-right font-mono-num text-xs sm:text-sm">
          {{ fund.estimatedNav ? formatPrice(fund.estimatedNav) : '--' }}
          <div v-if="fund.estimatedTime" class="text-2xs text-muted">
            {{ fund.estimatedTime }}
          </div>
        </div>

        <!-- 溢价率 -->
        <div class="col-span-2 text-right font-mono-num font-bold text-xs sm:text-sm">
          <span
            class="px-1.5 py-0.5 rounded text-xs"
            :class="premiumClass(fund)"
          >
            {{ formatPremium(fund.premium) }}
          </span>
        </div>

        <!-- 关注按钮 -->
        <div class="col-span-1 text-center">
          <button
            @click.stop="$emit('toggle-watch', fund)"
            class="text-lg transition-transform active:scale-125"
            :title="isWatched(fund.code) ? '取消关注' : '添加关注'"
          >
            {{ isWatched(fund.code) ? '⭐' : '☆' }}
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && filteredFunds.length === 0" class="py-16 text-center text-muted">
        <div class="text-4xl mb-3">📊</div>
        <p class="text-sm">暂无数据</p>
        <p class="text-2xs mt-1">请检查是否为交易时间，或手动点击刷新</p>
      </div>
    </div>

    <!-- 移动端卡片视图（替代表头说明） -->
    <div class="sm:hidden px-3 py-1.5 text-2xs text-muted border-t border-white/5 bg-bg/50">
      点击行查看套利详情 · 左右滑动查看更多列
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatPct, formatMoney } from '../utils/calculator.js'

const props = defineProps({
  funds: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  isWatched: { type: Function, default: () => false }
})

defineEmits(['select', 'toggle-watch'])

// 排序状态
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
    sortAsc.value = key === 'premium' ? false : true // 溢价率默认降序
  }
}

const filteredFunds = computed(() =>
  props.funds.filter(f => f.marketPrice > 0)
)

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

function formatPrice(v) {
  if (v <= 0) return '--'
  return v >= 1 ? v.toFixed(3) : v.toFixed(4)
}

function formatPremium(v) {
  if (v === 0 || !isFinite(v)) return '0.00%'
  return formatPct(v)
}

function premiumClass(fund) {
  switch (fund.premiumLevel) {
    case 'deep-up': return 'bg-up-deep text-up-light font-bold'
    case 'up': return 'bg-up-bg text-up-light'
    case 'deep-down': return 'bg-down-deep text-down-light font-bold'
    case 'down': return 'bg-down-bg text-down-light'
    default: return 'text-muted'
  }
}
</script>
