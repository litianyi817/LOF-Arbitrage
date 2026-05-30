<template>
  <div class="status-bar fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between text-sm bg-bg-card/85 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/20"
       :style="{ paddingTop: 'calc(var(--safe-area-top) + 0.75rem)' }">
    <!-- 左侧：交易状态 -->
    <div class="flex items-center gap-2.5">
      <span class="text-lg">{{ marketStatus.icon }}</span>
      <span
        class="font-semibold text-sm"
        :class="{
          'text-emerald-400': marketStatus.status === 'trading',
          'text-yellow-400': marketStatus.status === 'pre' || marketStatus.status === 'lunch',
          'text-muted': marketStatus.status === 'closed'
        }"
      >
        {{ marketStatus.label }}
      </span>
      <span
        v-if="marketStatus.status === 'trading'"
        class="pulse-dot bg-emerald-400"
      ></span>
    </div>

    <!-- 中间：版本号 + 倒计时 + 最后更新 -->
    <div class="flex items-center gap-3">
      <!-- 版本号 -->
      <span class="text-2xs text-muted/50 bg-white/5 px-1.5 py-0.5 rounded font-mono-num select-all" title="部署版本">
        v{{ APP_VERSION }}
      </span>
      <span v-if="lastUpdate" class="text-muted text-xs hidden sm:inline font-mono-num">
        {{ formatTime(lastUpdate) }}
      </span>
      <span
        v-if="isEnabled && tradingNow"
        class="text-muted text-xs font-mono-num tabular-nums min-w-[36px] text-right"
      >
        {{ countdown }}s
      </span>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="flex items-center gap-2">
      <button
        @click="$emit('toggle-auto')"
        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
        :class="isEnabled
          ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
          : 'bg-white/5 text-muted hover:bg-white/10'"
        :title="isEnabled ? '自动刷新中' : '自动刷新已关闭'"
      >
        {{ isEnabled ? '🔄 自动' : '⏸ 手动' }}
      </button>

      <button
        @click="$emit('refresh')"
        :disabled="isRefreshing"
        class="px-4 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/35 active:scale-95 transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium ring-1 ring-accent/25"
      >
        <span :class="{ 'animate-spin': isRefreshing }">↻</span>
        <span class="hidden sm:inline">{{ isRefreshing ? '刷新中...' : '刷新' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
// 构建时由 buildIdPlugin 注入，编译后为 "YYYYMMDD.HHMM"
const APP_VERSION = __BUILD_ID__

defineProps({
  marketStatus: { type: Object, required: true },
  isEnabled: { type: Boolean, default: true },
  isRefreshing: { type: Boolean, default: false },
  countdown: { type: Number, default: 0 },
  tradingNow: { type: Boolean, default: false },
  lastUpdate: { type: Date, default: null }
})

defineEmits(['refresh', 'toggle-auto'])

function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>
