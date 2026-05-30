<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        @click.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <div class="relative w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-card border-t sm:border border-white/10 shadow-2xl"
             :style="{ paddingBottom: 'calc(var(--safe-area-bottom) + 1rem)' }">

          <!-- 拖拽指示条 -->
          <div class="sm:hidden flex justify-center pt-2 pb-1">
            <div class="w-10 h-1 rounded-full bg-white/20"></div>
          </div>

          <!-- 标题 -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h3 class="font-semibold text-base">⚙️ 数据源设置</h3>
            <button
              @click="$emit('close')"
              class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted hover:text-white transition-colors"
            >✕</button>
          </div>

          <div class="px-5 py-4 space-y-5">
            <!-- ===== 行情数据源 ===== -->
            <section>
              <h4 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span>📊</span> 场内行情数据源
              </h4>
              <div class="space-y-2">
                <button
                  v-for="src in DATA_SOURCES.market"
                  :key="src.id"
                  @click="settings.marketSource = src.id"
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left"
                  :class="settings.marketSource === src.id
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-white/5 bg-bg hover:border-white/10'"
                >
                  <span class="text-xl">{{ src.icon }}</span>
                  <div class="flex-1">
                    <div class="text-sm font-medium">{{ src.name }}</div>
                    <div class="text-xs text-muted mt-0.5">{{ src.desc }}</div>
                  </div>
                  <div
                    class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                    :class="settings.marketSource === src.id
                      ? 'border-accent bg-accent'
                      : 'border-white/20'"
                  >
                    <span v-if="settings.marketSource === src.id" class="text-white text-xs">✓</span>
                  </div>
                </button>
              </div>
            </section>

            <!-- ===== 净值数据源 ===== -->
            <section>
              <h4 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span>💰</span> 估算净值数据源
              </h4>
              <div class="space-y-2">
                <button
                  v-for="src in DATA_SOURCES.nav"
                  :key="src.id"
                  @click="settings.navSource = src.id"
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left"
                  :class="settings.navSource === src.id
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-white/5 bg-bg hover:border-white/10'"
                >
                  <span class="text-xl">{{ src.icon }}</span>
                  <div class="flex-1">
                    <div class="text-sm font-medium">{{ src.name }}</div>
                    <div class="text-xs text-muted mt-0.5">{{ src.desc }}</div>
                  </div>
                  <div
                    class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                    :class="settings.navSource === src.id
                      ? 'border-accent bg-accent'
                      : 'border-white/20'"
                  >
                    <span v-if="settings.navSource === src.id" class="text-white text-xs">✓</span>
                  </div>
                </button>
              </div>
            </section>

            <!-- ===== 连接模式 ===== -->
            <section>
              <h4 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span>🔗</span> 连接模式
              </h4>
              <div class="space-y-2">
                <button
                  @click="settings.directMode = true"
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left"
                  :class="settings.directMode
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-white/5 bg-bg hover:border-white/10'"
                >
                  <span class="text-xl">⚡</span>
                  <div class="flex-1">
                    <div class="text-sm font-medium">浏览器直连</div>
                    <div class="text-xs text-muted mt-0.5">浏览器通过本地代理访问中国API — 速度快、数据全</div>
                  </div>
                  <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                       :class="settings.directMode ? 'border-emerald-500 bg-emerald-500' : 'border-white/20'">
                    <span v-if="settings.directMode" class="text-white text-xs">✓</span>
                  </div>
                </button>
                <button
                  @click="settings.directMode = false"
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left"
                  :class="!settings.directMode
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-white/5 bg-bg hover:border-white/10'"
                >
                  <span class="text-xl">☁️</span>
                  <div class="flex-1">
                    <div class="text-sm font-medium">Vercel 代理</div>
                    <div class="text-xs text-muted mt-0.5">通过Vercel服务器中转 — 无需本地代理，但海外IP可能被限</div>
                  </div>
                  <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                       :class="!settings.directMode ? 'border-accent bg-accent' : 'border-white/20'">
                    <span v-if="!settings.directMode" class="text-white text-xs">✓</span>
                  </div>
                </button>
              </div>
            </section>

            <!-- ===== 刷新间隔 ===== -->
            <section>
              <h4 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span>⏱️</span> 自动刷新间隔
              </h4>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in REFRESH_INTERVALS"
                  :key="opt.value"
                  @click="settings.refreshInterval = opt.value"
                  class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border"
                  :class="settings.refreshInterval === opt.value
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-white/5 bg-bg text-muted hover:border-white/10'"
                >
                  {{ opt.label }}
                </button>
              </div>
            </section>

            <!-- ===== 重置 ===== -->
            <div class="pt-2 border-t border-white/5">
              <button
                @click="resetAll(); $emit('close')"
                class="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
              >
                🔄 恢复默认设置
              </button>
              <p class="text-xs text-muted text-center mt-2">
                当前：行情-{{ getMarketSourceInfo().name }} | 净值-{{ getNavSourceInfo().name }} | {{ currentIntervalLabel }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useSettings, DATA_SOURCES, REFRESH_INTERVALS } from '../composables/useSettings.js'

const props = defineProps({
  show: { type: Boolean, default: false }
})

defineEmits(['close'])

const { settings, resetAll, getMarketSourceInfo, getNavSourceInfo } = useSettings()

const currentIntervalLabel = computed(() => {
  const opt = REFRESH_INTERVALS.find(o => o.value === settings.refreshInterval)
  return opt?.label || '30秒'
})
</script>
