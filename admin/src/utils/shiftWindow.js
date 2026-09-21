const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

function parseHhMmToMinutes(hhmm) {
  const raw = String(hhmm || '').trim()
  if (!HH_MM.test(raw)) return null
  const [hours, minutes] = raw.split(':').map(Number)
  return hours * 60 + minutes
}

export function isWithinShiftWindow(date, timezone, startTime, endTime) {
  if (!timezone || !startTime || !endTime) return false
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
    const nowMinutes = hour * 60 + minute
    const startMinutes = parseHhMmToMinutes(startTime)
    const endMinutes = parseHhMmToMinutes(endTime)
    if (startMinutes == null || endMinutes == null) return false
    if (startMinutes === endMinutes) return true
    if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes
    return nowMinutes >= startMinutes || nowMinutes < endMinutes
  } catch {
    return false
  }
}
