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
 * YYYY-MM-DD calendar date in an IANA timezone.
 * Falls back to the browser calendar date when no zone is given.
 * @param {string} [timeZone]
 * @param {Date} [at]
 * @returns {string}
 */
export function getCalendarDateInTimeZone(timeZone, at = new Date()) {
  const date = at instanceof Date ? at : new Date(at)
  if (!timeZone || timeZone === 'local') return toLocalDateStr(isNaN(date.getTime()) ? new Date() : date)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date)
    const map = {}
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value
    }
    return `${map.year}-${map.month}-${map.day}`
  } catch {
    return toLocalDateStr(new Date())
  }
}

/**
 * Shift a YYYY-MM-DD calendar date by a number of days.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
export function addCalendarDays(dateStr, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''))
  if (!match) return dateStr
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Current HH:mm in an IANA timezone.
 * @param {string} [timeZone]
 * @returns {string}
 */
export function getCurrentTimeStrInTimeZone(timeZone) {
  if (!timeZone || timeZone === 'local') return getCurrentTimeStr()
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date())
    const map = {}
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value
    }
    const hour = map.hour === '24' ? '00' : map.hour
    return `${hour}:${map.minute}`
  } catch {
    return getCurrentTimeStr()
  }
}

/**
 * Minutes to add to a wall-clock time in `timeZone` to get UTC.
 * Same sign as Date.getTimezoneOffset() (for example IST is -330).
 * @param {string} timeZone
 * @param {Date} [at]
 * @returns {number}
 */
export function timezoneOffsetForZone(timeZone, at = new Date()) {
  if (!timeZone || timeZone === 'local') {
    const date = at instanceof Date ? at : new Date(at)
    return isNaN(date.getTime()) ? new Date().getTimezoneOffset() : date.getTimezoneOffset()
  }
  try {
    const date = at instanceof Date ? at : new Date(at)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(date)
    const map = {}
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value
    }
    let hour = Number(map.hour)
    if (hour === 24) hour = 0
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hour,
      Number(map.minute),
      Number(map.second)
    )
    return Math.round((date.getTime() - asUtc) / 60000)
  } catch {
    return new Date().getTimezoneOffset()
  }
}

/**
 * Preset range using the calendar of an IANA timezone.
 * @param {string} preset
 * @param {string} timeZone
 * @returns {{ startDate: string, endDate: string }}
 */
export function getPresetRangeInTimeZone(preset, timeZone) {
  const today = getCalendarDateInTimeZone(timeZone)
  if (preset === PRESETS.TODAY) return { startDate: today, endDate: today }
  if (preset === PRESETS.YESTERDAY) {
    const yesterday = addCalendarDays(today, -1)
    return { startDate: yesterday, endDate: yesterday }
  }
  if (preset === PRESETS.LAST_7) return { startDate: addCalendarDays(today, -6), endDate: today }
  if (preset === PRESETS.LAST_30) return { startDate: addCalendarDays(today, -29), endDate: today }
  return { startDate: addCalendarDays(today, -6), endDate: today }
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
export function getDefaultEndTimeForDate(dateStr, timeZone) {
  if (!dateStr) return '23:59'
  const today = timeZone ? getCalendarDateInTimeZone(timeZone) : getTodayDateStr()
  const now = timeZone ? getCurrentTimeStrInTimeZone(timeZone) : getCurrentTimeStr()
  return dateStr === today ? now : '23:59'
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
  const hasRange = params.startDate || params.endDate || params.dateFrom || params.dateTo
  if (!hasRange) return params
  const { timezone, ...rest } = params
  let at = new Date()
  const dateStr = params.startDate || params.dateFrom || params.endDate || params.dateTo
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    at = new Date(`${dateStr}T12:00:00Z`)
  }
  const timezoneOffset = timezone
    ? timezoneOffsetForZone(timezone, at)
    : new Date().getTimezoneOffset()
  return { ...rest, timezoneOffset }
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
export function formatTransactionDateTime(value, timeZone) {
  if (value == null || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return '—'
  const zone = timeZone || getAdminTimeZone()
  const opts = zone && zone !== 'local' ? { timeZone: zone } : undefined
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
