<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
        @click.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

        <div class="relative w-full sm:max-w-md max-h-[70vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-card border-t sm:border border-white/10 shadow-xl"
             :style="{ paddingBottom: 'calc(var(--safe-area-bottom) + 1rem)' }">
          <!-- 拖拽指示条 -->
          <div class="sm:hidden flex justify-center pt-2 pb-1">
            <div class="w-10 h-1 rounded-full bg-white/20"></div>
          </div>

          <!-- 标题 -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h3 class="font-semibold text-base">⭐ 关注列表</h3>
            <button
              @click="$emit('close')"
              class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <!-- 添加基金 -->
          <div class="px-5 py-3 border-b border-white/5">
            <div class="flex gap-2">
              <input
                v-model="newCode"
                @keydown.enter="addCustom"
                type="text"
                inputmode="numeric"
                placeholder="输入基金代码，如 161116"
                maxlength="6"
                class="flex-1 bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm font-mono-num placeholder:text-muted/50 focus:border-accent focus:outline-none"
              />
              <button
                @click="addCustom"
                :disabled="newCode.length < 6"
                class="px-4 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-30 transition-colors text-sm"
              >
                添加
              </button>
            </div>
          </div>

          <!-- 关注列表 -->
          <div class="divide-y divide-white/5">
            <div v-if="watchlist.length === 0" class="px-5 py-8 text-center text-muted text-sm">
              还没有关注的基金，输入代码添加
            </div>

            <div
              v-for="fund in watchlist"
              :key="fund.code"
              class="flex items-center justify-between px-5 py-3 hover:bg-bg/50 transition-colors"
            >
              <div class="flex items-center gap-3">
                <span class="text-yellow-400">⭐</span>
                <div>
                  <span class="font-mono-num text-sm">{{ fund.code }}</span>
                  <span class="text-muted text-xs ml-2">{{ fund.name }}</span>
                </div>
              </div>
              <button
                @click="removeFund(fund.code)"
                class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 操作栏 -->
          <div class="flex items-center gap-2 px-5 py-3 border-t border-white/5">
            <button
              @click="exportConfig"
              class="flex-1 py-2 rounded-lg bg-bg hover:bg-bg-hover text-sm text-muted hover:text-white transition-colors"
            >
              📤 导出配置
            </button>
            <button
              @click="importConfig"
              class="flex-1 py-2 rounded-lg bg-bg hover:bg-bg-hover text-sm text-muted hover:text-white transition-colors"
            >
              📥 导入配置
            </button>
            <button
              @click="resetToDefault"
              class="px-3 py-2 rounded-lg bg-bg hover:bg-red-500/20 text-sm text-muted hover:text-red-400 transition-colors"
              title="重置为默认列表"
            >
              🔄
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  watchlist: { type: Array, default: () => [] },
  removeFund: { type: Function, required: true },
  exportConfig: { type: Function, required: true },
  importConfig: { type: Function, required: true },
  resetToDefault: { type: Function, required: true }
})

defineEmits(['close'])

const newCode = ref('')

function addCustom() {
  const code = newCode.value.trim()
  if (code.length >= 6 && /^\d{6}$/.test(code)) {
    props.removeFund(code) // 如果已存在先删除（通过父组件处理）
    // 通过事件通知父组件添加
    window.dispatchEvent(new CustomEvent('lof:add-watch', { detail: { code, name: '自定义基金' } }))
    newCode.value = ''
  }
}
</script>
