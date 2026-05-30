/**
 * composables/useAutoRefresh.js
 * 自动刷新逻辑 + 交易时间检测
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'

/**
 * 判断当前是否在A股交易时间
 * 交易日（周一到周五）9:30-11:30, 13:00-15:00
 */
function isTradingHours() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false

  const hours = now.getHours()
  const minutes = now.getMinutes()
  const time = hours * 100 + minutes

  return (time >= 930 && time <= 1130) || (time >= 1300 && time <= 1500)
}

/**
 * 交易状态描述
 */
function getMarketStatus() {
  const now = new Date()
  const day = now.getDay()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const time = hours * 100 + minutes

  if (day === 0 || day === 6) return { status: 'closed', label: '周末休市', icon: '⏸️' }
  if (time < 930) return { status: 'pre', label: '等待开盘', icon: '🌅' }
  if (time >= 930 && time <= 1130) return { status: 'trading', label: '交易中', icon: '🟢' }
  if (time > 1130 && time < 1300) return { status: 'lunch', label: '午间休市', icon: '🍽️' }
  if (time >= 1300 && time <= 1500) return { status: 'trading', label: '交易中', icon: '🟢' }
  return { status: 'closed', label: '已收盘', icon: '🔴' }
}

export function useAutoRefresh(onRefresh, {
  interval = 30_000,     // 刷新间隔30秒
  enabledByDefault = true
} = {}) {
  const isEnabled = ref(enabledByDefault)
  const isRefreshing = ref(false)
  const countdown = ref(0) // 下次刷新倒计时（秒）
  const marketStatus = ref(getMarketStatus())

  let timer = null
  let countdownTimer = null

  function startCountdown() {
    countdown.value = Math.floor(interval / 1000)
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      if (countdown.value > 0) {
        countdown.value--
      }
    }, 1000)
  }

  async function doRefresh() {
    if (isRefreshing.value) return
    isRefreshing.value = true
    marketStatus.value = getMarketStatus()

    try {
      await onRefresh?.()
    } catch {
      // ignore refresh errors
    } finally {
      isRefreshing.value = false
      startCountdown()
    }
  }

  function toggleAutoRefresh() {
    isEnabled.value = !isEnabled.value
    if (isEnabled.value) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  }

  function startAutoRefresh() {
    if (timer) clearInterval(timer)

    timer = setInterval(() => {
      marketStatus.value = getMarketStatus()
      const trading = isTradingHours()

      if (isEnabled.value && trading) {
        doRefresh()
      }
    }, interval)

    startCountdown()
  }

  function stopAutoRefresh() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  // 判断是否在盘中交易时间（用于自动刷新决策）
  const tradingNow = computed(() => marketStatus.value.status === 'trading')

  onMounted(() => {
    marketStatus.value = getMarketStatus()
    if (isEnabled.value) startAutoRefresh()
  })

  onUnmounted(() => {
    stopAutoRefresh()
  })

  // 立即执行一次刷新
  const refreshNow = () => doRefresh()

  return {
    isEnabled,
    isRefreshing,
    countdown,
    marketStatus,
    tradingNow,
    refreshNow,
    toggleAutoRefresh,
    isTradingHours
  }
}
