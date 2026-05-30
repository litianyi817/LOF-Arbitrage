/**
 * utils/calculator.js
 * LOF溢价率与套利收益计算工具
 */

/**
 * 计算溢价率
 * @param {number} marketPrice - 场内价格
 * @param {number} nav - 基金净值（或估算净值）
 * @returns {number} 溢价率百分比（正=溢价，负=折价）
 */
export function calcPremium(marketPrice, nav) {
  if (!nav || nav <= 0) return 0
  return ((marketPrice - nav) / nav) * 100
}

/**
 * 获取溢价率等级（用于颜色标识）
 * @param {number} premium - 溢价率
 * @returns {'deep-up'|'up'|'neutral'|'down'|'deep-down'}
 */
export function getPremiumLevel(premium) {
  if (premium > 1) return 'deep-up'      // 深红色，溢价>1%
  if (premium > 0.5) return 'up'         // 浅红色，溢价>0.5%
  if (premium < -1) return 'deep-down'   // 深绿色，折价>1%
  if (premium < -0.5) return 'down'      // 浅绿色，折价>0.5%
  return 'neutral'
}

/**
 * 计算套利收益
 * @param {Object} options
 * @param {number} options.marketPrice - 场内价格
 * @param {number} options.nav - 基金净值
 * @param {number} options.shares - 申购份额（默认10000）
 * @param {number} options.purchaseFee - 申购费率（默认0.15%）
 * @param {number} options.commission - 卖出佣金（默认万3 = 0.03%）
 * @param {number} options.days - 到账天数（默认T+2 = 3天）
 * @returns {Object} 套利收益计算结果
 */
export function calcArbitrage({
  marketPrice,
  nav,
  shares = 10000,
  purchaseFee = 0.15,
  commission = 0.03,
  days = 3
}) {
  const premium = calcPremium(marketPrice, nav)
  if (premium <= 0) {
    return {
      direction: 'none',
      premium,
      profit: 0,
      profitPct: 0,
      annualizedReturn: 0,
      costDetail: { purchaseFee: 0, commission: 0, totalCost: 0 },
      suggestion: '无套利空间（折价/平价）'
    }
  }

  const amount = shares * marketPrice              // 投资总金额
  const costPurchase = amount * (purchaseFee / 100) // 申购费
  const costSell = amount * (commission / 100)      // 卖出佣金
  const totalCost = costPurchase + costSell
  const grossProfit = amount * (premium / 100)      // 毛利润
  const netProfit = grossProfit - totalCost          // 净利润
  const profitPct = (netProfit / amount) * 100       // 净收益率
  const annualizedReturn = (profitPct / days) * 365  // 年化收益率

  let suggestion = '无套利空间'
  if (annualizedReturn > 5) suggestion = '⭐ 强烈推荐（年化收益>5%）'
  else if (annualizedReturn > 2) suggestion = '✅ 可以套利（年化收益>2%）'
  else if (annualizedReturn > 0) suggestion = '⚠️ 勉强可行，注意风险'
  else suggestion = '❌ 扣除成本后亏损，不建议套利'

  return {
    direction: 'long',
    premium,
    profit: netProfit,
    profitPct,
    annualizedReturn,
    costDetail: {
      purchaseFee: costPurchase,
      commission: costSell,
      totalCost
    },
    suggestion
  }
}

/**
 * 格式化百分比
 */
export function formatPct(value, decimals = 2) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

/**
 * 格式化金额
 */
export function formatMoney(value, decimals = 4) {
  if (value >= 1) return value.toFixed(decimals)
  return value.toPrecision(6)
}
