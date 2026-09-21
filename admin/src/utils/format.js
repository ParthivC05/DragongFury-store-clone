/**
 * Formatting for dashboard: currency and compact numbers.
 * Backend uses SC (store credit); can switch to ₹ if needed.
 */

const CURRENCY_SYMBOL = 'SC'

/**
 * Format amount for display (e.g. 1234.56 -> "1,234.56 SC").
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatCurrency(value, decimals = 2) {
  if (value == null || Number.isNaN(Number(value))) return `0.00 ${CURRENCY_SYMBOL}`
  const n = Number(value)
  return `${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${CURRENCY_SYMBOL}`
}

/**
 * Compact number for charts: 1200 -> "1.2K", 1500000 -> "1.5M".
 * @param {number} value
 * @returns {string}
 */
export function formatCompactNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '0'
  const n = Number(value)
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}
