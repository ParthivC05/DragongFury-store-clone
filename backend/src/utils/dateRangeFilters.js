/**
 * Shared date range parsing for admin panel filters.
 * Converts YYYY-MM-DD (and optional HH:mm) strings to UTC timestamps for createdAt filtering.
 *
 * When timezoneOffset (Date.getTimezoneOffset()) is provided on the query, dates/times
 * are interpreted in the admin's local timezone. Without it, UTC calendar days/times are used.
 */

function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = String(dateStr).trim();
  if (!s || s === 'undefined') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseTimezoneOffsetMin(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 14 * 60) return null;
  return n;
}

function parseTimeParts(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const s = String(timeStr).trim();
  if (!s) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * @param {string} dateStr - YYYY-MM-DD from date input
 * @param {number|null} [timezoneOffsetMin] - Date.getTimezoneOffset() from the client
 * @returns {Date|null} Start of day as UTC timestamp, or null if invalid
 */
function toDateRangeStart(dateStr, timezoneOffsetMin = null) {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  const { year, month, day } = parts;
  const offsetMin = parseTimezoneOffsetMin(timezoneOffsetMin);
  if (offsetMin != null) {
    const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + offsetMin * 60 * 1000;
    const d = new Date(utcMs);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} dateStr - YYYY-MM-DD from date input
 * @param {number|null} [timezoneOffsetMin] - Date.getTimezoneOffset() from the client
 * @returns {Date|null} End of day as UTC timestamp (23:59:59.999), or null if invalid
 */
function toDateRangeEnd(dateStr, timezoneOffsetMin = null) {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  const { year, month, day } = parts;
  const offsetMin = parseTimezoneOffsetMin(timezoneOffsetMin);
  if (offsetMin != null) {
    const utcMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) + offsetMin * 60 * 1000;
    const d = new Date(utcMs);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59.999Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:mm
 * @param {number|null} [timezoneOffsetMin]
 * @returns {Date|null}
 */
function toDateTimeRangeStart(dateStr, timeStr, timezoneOffsetMin = null) {
  const dateParts = parseDateParts(dateStr);
  const timeParts = parseTimeParts(timeStr);
  if (!dateParts || !timeParts) return null;
  const { year, month, day } = dateParts;
  const { hour, minute } = timeParts;
  const offsetMin = parseTimezoneOffsetMin(timezoneOffsetMin);
  if (offsetMin != null) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) + offsetMin * 60 * 1000;
    const d = new Date(utcMs);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:mm
 * @param {number|null} [timezoneOffsetMin]
 * @returns {Date|null}
 */
function toDateTimeRangeEnd(dateStr, timeStr, timezoneOffsetMin = null) {
  const dateParts = parseDateParts(dateStr);
  const timeParts = parseTimeParts(timeStr);
  if (!dateParts || !timeParts) return null;
  const { year, month, day } = dateParts;
  const { hour, minute } = timeParts;
  const offsetMin = parseTimezoneOffsetMin(timezoneOffsetMin);
  if (offsetMin != null) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, 59, 999) + offsetMin * 60 * 1000;
    const d = new Date(utcMs);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 59, 999));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Build SQL fragments for created_at range filters (date-only or date + time).
 * @param {object} query
 * @param {object} replacements
 * @param {string} columnRef
 * @param {string} keyPrefix
 * @returns {string[]}
 */
function buildDateTimeRangeFilterParts(query, replacements, columnRef, keyPrefix) {
  const parts = [];
  const startDate = query.startDate != null ? String(query.startDate).trim() : '';
  const endDate = query.endDate != null ? String(query.endDate).trim() : '';
  const startTime = query.startTime != null ? String(query.startTime).trim() : '';
  const endTime = query.endTime != null ? String(query.endTime).trim() : '';
  const timezoneOffset = parseTimezoneOffsetMin(query.timezoneOffset);

  if (startDate) {
    const from = startTime
      ? toDateTimeRangeStart(startDate, startTime, timezoneOffset)
      : toDateRangeStart(startDate, timezoneOffset);
    if (from) {
      const k = `${keyPrefix}From`;
      parts.push(`${columnRef} >= :${k}`);
      replacements[k] = from;
    }
  }
  if (endDate) {
    const to = endTime
      ? toDateTimeRangeEnd(endDate, endTime, timezoneOffset)
      : toDateRangeEnd(endDate, timezoneOffset);
    if (to) {
      const k = `${keyPrefix}To`;
      parts.push(`${columnRef} <= :${k}`);
      replacements[k] = to;
    }
  }
  return parts;
}

module.exports = {
  toDateRangeStart,
  toDateRangeEnd,
  toDateTimeRangeStart,
  toDateTimeRangeEnd,
  parseTimezoneOffsetMin,
  buildDateTimeRangeFilterParts
};
