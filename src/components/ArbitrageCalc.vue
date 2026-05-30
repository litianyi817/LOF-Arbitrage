<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="fund"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        @click.self="$emit('close')"
      >
        <!-- 遮罩 -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- 内容面板 -->
        <div class="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-card border-t sm:border border-white/10 shadow-2xl"
             :style="{ paddingBottom: 'calc(var(--safe-area-bottom) + 1rem)' }">
          <!-- 拖拽指示条 -->
          <div class="sm:hidden flex justify-center pt-2 pb-1">
            <div class="w-10 h-1 rounded-full bg-white/20"></div>
          </div>

          <!-- 标题栏 -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-white/5">
            <div>
              <h3 class="font-semibold text-white">
                {{ fund.name }}
                <span class="text-muted font-mono-num ml-2">{{ fund.code }}</span>
              </h3>
            </div>
            <button
              @click="$emit('close')"
              class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted hover:text-white transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          <!-- 内容 -->
          <div v-if="result" class="px-5 py-4 space-y-4">
            <!-- 溢价率概览 -->
            <div class="text-center py-4 rounded-xl"
                 :class="premiumBgColor">
              <div class="text-sm text-muted mb-1">溢价率</div>
              <div class="text-4xl font-bold font-mono-num" :class="premiumTextColor">
                {{ formatPct(result.premium) }}
              </div>
              <div class="text-sm mt-1.5" :class="premiumTextColor">
                {{ result.suggestion }}
              </div>
            </div>

            <!-- 关键数据 -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-bg rounded-lg p-4 text-center">
                <div class="text-xs text-muted mb-1">场内价格</div>
                <div class="text-xl font-mono-num font-semibold">{{ fund.marketPrice.toFixed(3) }}</div>
              </div>
              <div class="bg-bg rounded-lg p-4 text-center">
                <div class="text-xs text-muted mb-1">估算净值</div>
                <div class="text-xl font-mono-num font-semibold">{{ (fund.estimatedNav || 0).toFixed(4) }}</div>
              </div>
            </div>

            <!-- 参数设置 -->
            <div class="bg-bg rounded-lg p-4 space-y-3">
              <h4 class="text-sm text-muted uppercase tracking-wider font-semibold">套利参数</h4>

              <div class="flex items-center justify-between">
                <label class="text-sm">申购份额</label>
                <input
                  v-model.number="params.shares"
                  type="number"
                  min="100"
                  step="100"
                  class="w-36 bg-bg-card border border-white/10 rounded-lg px-3 py-1.5 text-sm text-right font-mono-num focus:border-accent focus:outline-none"
                />
              </div>

              <div class="flex items-center justify-between">
                <label class="text-sm">申购费率</label>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="params.purchaseFee"
                    type="number"
                    min="0"
                    max="5"
                    step="0.01"
                    class="w-24 bg-bg-card border border-white/10 rounded-lg px-3 py-1.5 text-sm text-right font-mono-num focus:border-accent focus:outline-none"
                  />
                  <span class="text-muted text-sm">%</span>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <label class="text-sm">卖出佣金</label>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="params.commission"
                    type="number"
                    min="0"
                    max="5"
                    step="0.001"
                    class="w-24 bg-bg-card border border-white/10 rounded-lg px-3 py-1.5 text-sm text-right font-mono-num focus:border-accent focus:outline-none"
                  />
                  <span class="text-muted text-sm">%</span>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <label class="text-sm">到账天数</label>
                <input
                  v-model.number="params.days"
                  type="number"
                  min="1"
                  max="30"
                  class="w-24 bg-bg-card border border-white/10 rounded-lg px-3 py-1.5 text-sm text-right font-mono-num focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <!-- 计算结果 -->
            <div class="bg-bg rounded-lg p-4 space-y-3">
              <h4 class="text-sm text-muted uppercase tracking-wider font-semibold">套利预估</h4>

              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">投入金额</span>
                <span class="font-mono-num text-sm">
                  ¥{{ ((params.shares * fund.marketPrice) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">成本合计</span>
                <span class="font-mono-num text-sm text-yellow-400">
                  ¥{{ result.costDetail.totalCost.toFixed(2) }}
                </span>
              </div>

              <div class="h-px bg-white/5 my-1"></div>

              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">预期净利润</span>
                <span class="font-mono-num font-bold text-xl"
                      :class="result.profit > 0 ? 'text-up-light' : 'text-down-light'">
                  ¥{{ result.profit.toFixed(2) }}
                </span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">净收益率</span>
                <span class="font-mono-num text-sm"
                      :class="result.profitPct > 0 ? 'text-up-light' : 'text-down-light'">
                  {{ result.profitPct.toFixed(4) }}%
                </span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm text-muted">年化收益率</span>
                <span class="font-mono-num font-semibold text-base"
                      :class="result.annualizedReturn > 5 ? 'text-up-light' : 'text-yellow-400'">
                  {{ result.annualizedReturn.toFixed(2) }}%
                </span>
              </div>
            </div>

            <!-- 建议 -->
            <div class="text-center text-sm px-4 py-3 rounded-lg font-medium"
                 :class="result.profit > 0 ? 'bg-up-bg text-up-light' : 'bg-white/5 text-muted'">
              💡 {{ result.suggestion }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { calcArbitrage, formatPct } from '../utils/calculator.js'

const props = defineProps({
  fund: { type: Object, default: null }
})

defineEmits(['close'])

const params = reactive({
  shares: 10000,
  purchaseFee: 0.15,
  commission: 0.03,
  days: 3
})

// fund变化时重置股份
watch(() => props.fund?.code, () => {
  if (props.fund) {
    // 保留用户手动修改的参数
  }
})

const result = computed(() => {
  if (!props.fund || !props.fund.marketPrice) return null
  return calcArbitrage({
    marketPrice: props.fund.marketPrice,
    nav: props.fund.estimatedNav || 0,
    shares: params.shares,
    purchaseFee: params.purchaseFee,
    commission: params.commission,
    days: params.days
  })
})

const premiumBgColor = computed(() => {
  if (!result.value) return 'bg-bg'
  const p = result.value.premium
  if (p > 1) return 'bg-up-bg'
  if (p > 0.5) return 'bg-up-bg/50'
  if (p < -1) return 'bg-down-bg'
  return 'bg-bg'
})

const premiumTextColor = computed(() => {
  if (!result.value) return 'text-white'
  const p = result.value.premium
  if (p > 0) return 'text-up-light'
  if (p < 0) return 'text-down-light'
  return 'text-muted'
})
</script>
