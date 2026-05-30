<template>
  <div class="status-bar fixed top-0 left-0 right-0 z-50 px-3 py-2 flex items-center justify-between text-xs bg-bg-card/95 backdrop-blur border-b border-white/5"
       :style="{ paddingTop: 'calc(var(--safe-area-top) + 0.5rem)' }">
    <!-- 左侧：交易状态 -->
    <div class="flex items-center gap-2">
      <span class="text-sm">{{ marketStatus.icon }}</span>
      <span
        class="font-medium"
        :class="{
          'text-green-400': marketStatus.status === 'trading',
          'text-yellow-400': marketStatus.status === 'pre' || marketStatus.status === 'lunch',
          'text-muted': marketStatus.status === 'closed'
        }"
      >
        {{ marketStatus.label }}
      </span>
      <!-- 盘中绿色脉冲点 -->
      <span
        v-if="marketStatus.status === 'trading'"
        class="pulse-dot bg-green-400"
      ></span>
    </div>

    <!-- 中间：倒计时 + 最后更新 -->
    <div class="flex items-center gap-3">
      <span v-if="lastUpdate" class="text-muted text-2xs hidden sm:inline">
        更新于 {{ formatTime(lastUpdate) }}
      </span>
      <span
        v-if="isEnabled && tradingNow"
        class="text-muted text-2xs font-mono-num tabular-nums w-10 text-right"
      >
        {{ countdown }}s
      </span>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="flex items-center gap-2">
      <!-- 自动刷新开关 -->
      <button
        @click="$emit('toggle-auto')"
        class="px-2 py-1 rounded text-2xs transition-colors"
        :class="isEnabled ? 'bg-accent/20 text-accent' : 'bg-white/5 text-muted'"
        :title="isEnabled ? '自动刷新中' : '自动刷新已关闭'"
      >
        {{ isEnabled ? '🔄 自动' : '⏸ 手动' }}
      </button>

      <!-- 手动刷新按钮 -->
      <button
        @click="$emit('refresh')"
        :disabled="isRefreshing"
        class="px-3 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-50 flex items-center gap-1"
      >
        <span :class="{ 'animate-spin': isRefreshing }">↻</span>
        <span class="hidden sm:inline">{{ isRefreshing ? '刷新中' : '刷新' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
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
