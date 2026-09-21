/**
 * Date range filter: presets and formatters for dashboard charts.
 * Same model everywhere: { startDate, endDate } in YYYY-MM-DD.
 */

export const PRESETS = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_7: '7d',
  LAST_30: '30d',
  CUSTOM: 'custom'
}

/**
 * Format a Date as local calendar date YYYY-MM-DD (no UTC shift).
 * @param {Date} d
 * @returns {string}
 */
function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Today's date as YYYY-MM-DD in the user's local timezone (not UTC).
 * @returns {string}
 */
export function getTodayDateStr() {
  return toLocalDateStr(new Date())
}

/**
 * Today's date as YYYY-MM-DD in UTC.
 * @returns {string}
 */
export function getTodayDateStrUtc() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Current local time as HH:mm (for time inputs).
 * @returns {string}
 */
export function getCurrentTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Current UTC time as HH:mm.
 * @returns {string}
 */
export function getCurrentTimeStrUtc() {
  const d = new Date()
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * Default end time for a date filter: current time if today, otherwise end of day.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
export function getDefaultEndTimeForDate(dateStr) {
  if (!dateStr) return '23:59'
  return dateStr === getTodayDateStr() ? getCurrentTimeStr() : '23:59'
}

/**
 * Default end time (UTC) for a date filter.
 * @param {string} dateStr - YYYY-MM-DD (UTC calendar)
 * @returns {string}
 */
export function getDefaultEndTimeForDateUtc(dateStr) {
  if (!dateStr) return '23:59'
  return dateStr === getTodayDateStrUtc() ? getCurrentTimeStrUtc() : '23:59'
}

/**
 * Compare two local date+time pairs. Returns negative if a < b, 0 if equal, positive if a > b.
 * @param {string} dateA - YYYY-MM-DD
 * @param {string} timeA - HH:mm
 * @param {string} dateB - YYYY-MM-DD
 * @param {string} timeB - HH:mm
 * @returns {number}
 */
export function compareDateTime(dateA, timeA, dateB, timeB) {
  const a = `${dateA || ''}T${(timeA || '00:00').padStart(5, '0')}`
  const b = `${dateB || ''}T${(timeB || '00:00').padStart(5, '0')}`
  return a.localeCompare(b)
}

/**
 * Clamp HH:mm between optional min/max (inclusive).
 * @param {string} timeStr
 * @param {string} [minTime]
 * @param {string} [maxTime]
 * @returns {string}
 */
export function clampTimeStr(timeStr, minTime, maxTime) {
  let value = (timeStr || '00:00').padStart(5, '0')
  if (minTime && value < minTime) value = minTime
  if (maxTime && value > maxTime) value = maxTime
  return value
}

function todayStr() {
  return getTodayDateStr()
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toLocalDateStr(d)
}

/**
 * Default range for initial load. Use 7 days so charts show a trend.
 * @returns {{ startDate: string, endDate: string }}
 */
export function getDefaultDateRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return {
    startDate: toLocalDateStr(start),
    endDate: toLocalDateStr(end)
  }
}

/**
 * Check if the current range matches a preset (same start and end dates).
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string} preset - PRESETS.TODAY | PRESETS.YESTERDAY | PRESETS.LAST_7 | PRESETS.LAST_30
 * @returns {boolean}
 */
export function isPresetRange(startDate, endDate, preset) {
  if (!startDate || !endDate) return false
  const range = getPresetRange(preset)
  return startDate === range.startDate && endDate === range.endDate
}

/**
 * Get range for a preset.
 * @param {string} preset - PRESETS.TODAY | PRESETS.YESTERDAY | PRESETS.LAST_7 | PRESETS.LAST_30
 * @returns {{ startDate: string, endDate: string }}
 */
export function getPresetRange(preset) {
  const end = new Date()
  const start = new Date(end)
  if (preset === PRESETS.TODAY) {
    return { startDate: todayStr(), endDate: todayStr() }
  }
  if (preset === PRESETS.YESTERDAY) {
    const y = yesterdayStr()
    return { startDate: y, endDate: y }
  }
  if (preset === PRESETS.LAST_7) {
    start.setDate(start.getDate() - 6)
    return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) }
  }
  if (preset === PRESETS.LAST_30) {
    start.setDate(start.getDate() - 29)
    return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) }
  }
  return getDefaultDateRange()
}

/**
 * UTC calendar preset range (for payment totals and other UTC-bound filters).
 * @param {string} preset
 * @returns {{ startDate: string, endDate: string }}
 */
export function getPresetRangeUtc(preset) {
  const now = new Date()
  const today = getTodayDateStrUtc()
  if (preset === PRESETS.TODAY) {
    return { startDate: today, endDate: today }
  }
  if (preset === PRESETS.YESTERDAY) {
    const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
    const yStr = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, '0')}-${String(y.getUTCDate()).padStart(2, '0')}`
    return { startDate: yStr, endDate: yStr }
  }
  if (preset === PRESETS.LAST_7) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6))
    const startStr = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`
    return { startDate: startStr, endDate: today }
  }
  if (preset === PRESETS.LAST_30) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29))
    const startStr = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`
    return { startDate: startStr, endDate: today }
  }
  const end = today
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6))
  const startStr = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`
  return { startDate: startStr, endDate: end }
}

/**
 * Human-readable label for a date range (preset name or formatted dates).
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {string}
 */
export function formatDateRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) return ''
  if (isPresetRange(startDate, endDate, PRESETS.TODAY)) return 'Today'
  if (isPresetRange(startDate, endDate, PRESETS.YESTERDAY)) return 'Yesterday'
  if (isPresetRange(startDate, endDate, PRESETS.LAST_7)) return 'Last 7 days'
  if (isPresetRange(startDate, endDate, PRESETS.LAST_30)) return 'Last 30 days'
  const f = (d) => {
    const x = new Date(d + 'T12:00:00')
    return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  if (startDate === endDate) return f(startDate)
  return `${f(startDate)} – ${f(endDate)}`
}

/**
 * All dates between start and end (inclusive), YYYY-MM-DD.
 * @param {string} startStr
 * @param {string} endStr
 * @returns {string[]}
 */
export function getDatesInRange(startStr, endStr) {
  if (!startStr || !endStr) return []
  const start = new Date(startStr + 'T12:00:00')
  const end = new Date(endStr + 'T12:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return []
  const dates = []
  const d = new Date(start)
  while (d <= end) {
    dates.push(toLocalDateStr(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

/**
 * Format date for chart X-axis: DD MMM.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
export function formatDateForAxis(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = d.getDate()
  const month = months[d.getMonth()]
  return `${day} ${month}`
}

/**
 * Attach browser timezone offset for backend date-range filters.
 * Must match Date.getTimezoneOffset() (minutes from local time to UTC).
 * @param {Record<string, unknown>} params
 * @returns {Record<string, unknown>}
 */
export function withDateRangeTimezone(params = {}) {
  if (!params.startDate && !params.endDate) return params
  return { ...params, timezoneOffset: new Date().getTimezoneOffset() }
}

/**
 * IANA timezone of the logged-in admin's browser (e.g. America/New_York, Asia/Kolkata).
 * @returns {string}
 */
export function getAdminTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  } catch {
    return 'local'
  }
}

/**
 * Format a transaction timestamp in the admin's local timezone.
 * @param {string|Date|number|null|undefined} value
 * @returns {string}
 */
export function formatTransactionDateTime(value) {
  if (value == null || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return '—'
  const timeZone = getAdminTimeZone()
  const opts = timeZone && timeZone !== 'local' ? { timeZone } : undefined
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(opts || {})
  })
  const timeStr = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(opts || {})
  })
  return `${dateStr} · ${timeStr}`
}
