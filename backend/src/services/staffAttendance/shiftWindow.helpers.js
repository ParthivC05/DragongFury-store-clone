'use strict';

const { HH_MM_PATTERN } = require('../../constants/staffAttendance');

function httpError(message, statusCode, code, data) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (data) err.data = data;
  return err;
}

function isValidIanaTimeZone(timezone) {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Shown first so India and US zones (CST, EST, MST, PST) are easy to find. */
const FEATURED_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Winnipeg',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore'
];

const TIMEZONE_ALIASES = {
  'Asia/Kolkata': ['India', 'IST', 'Kolkata', 'Calcutta', 'Mumbai', 'Delhi'],
  'Asia/Calcutta': ['India', 'IST', 'Kolkata', 'Calcutta', 'Mumbai', 'Delhi'],
  'America/New_York': ['EST', 'EDT', 'Eastern', 'US Eastern', 'USA', 'America'],
  'America/Detroit': ['EST', 'EDT', 'Eastern', 'US Eastern', 'America'],
  'America/Toronto': ['EST', 'EDT', 'Eastern', 'Canada Eastern', 'America'],
  'America/Chicago': ['CST', 'CDT', 'Central', 'US Central', 'USA', 'America'],
  'America/Winnipeg': ['CST', 'CDT', 'Central', 'Canada Central', 'America'],
  'America/Mexico_City': ['CST', 'CDT', 'Central', 'Mexico', 'America'],
  'America/Regina': ['CST', 'Central', 'Saskatchewan', 'America'],
  'America/Denver': ['MST', 'MDT', 'Mountain', 'US Mountain', 'USA', 'America'],
  'America/Edmonton': ['MST', 'MDT', 'Mountain', 'Canada Mountain', 'America'],
  'America/Phoenix': ['MST', 'Arizona', 'US Mountain', 'USA', 'America'],
  'America/Los_Angeles': ['PST', 'PDT', 'Pacific', 'US Pacific', 'USA', 'America'],
  'America/Vancouver': ['PST', 'PDT', 'Pacific', 'Canada Pacific', 'America'],
  'America/Anchorage': ['AKST', 'AKDT', 'Alaska', 'USA', 'America'],
  'Pacific/Honolulu': ['HST', 'Hawaii', 'USA']
};

const TIMEZONE_TITLES = {
  'Asia/Kolkata': 'India (IST)',
  'Asia/Calcutta': 'India (IST)',
  'America/New_York': 'US Eastern (EST/EDT)',
  'America/Chicago': 'US Central (CST/CDT)',
  'America/Denver': 'US Mountain (MST/MDT)',
  'America/Phoenix': 'US Arizona (MST)',
  'America/Los_Angeles': 'US Pacific (PST/PDT)',
  'America/Anchorage': 'US Alaska (AKST)',
  'Pacific/Honolulu': 'US Hawaii (HST)',
  'America/Toronto': 'Canada Eastern (EST/EDT)',
  'America/Winnipeg': 'Canada Central (CST/CDT)',
  'America/Mexico_City': 'Mexico Central (CST/CDT)'
};

function listIanaTimeZones() {
  const fromIntl = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC'];
  const set = new Set(fromIntl);
  // Older ICU lists India as Asia/Calcutta; still accept Asia/Kolkata.
  if (isValidIanaTimeZone('Asia/Kolkata')) set.add('Asia/Kolkata');
  if (isValidIanaTimeZone('UTC')) set.add('UTC');
  return [...set];
}

function timezoneOffsetLabel(timezone, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

function timezoneAbbrev(timezone, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

function friendlyTimezoneLabel(timezone, offset) {
  const name = timezone.replace(/_/g, ' ');
  const offsetPart = offset ? ` (${offset})` : '';
  const title = TIMEZONE_TITLES[timezone];
  if (title) return `${title} – ${name}${offsetPart}`;
  return `${name}${offsetPart}`;
}

function listTimeZonesWithLabels() {
  const now = new Date();
  const all = listIanaTimeZones();
  // Prefer Asia/Kolkata; hide duplicate Calcutta so India appears once.
  const hasKolkata = all.includes('Asia/Kolkata');
  const unique = all.filter((tz) => !(tz === 'Asia/Calcutta' && hasKolkata));

  const makeItem = (timezone) => {
    const offset = timezoneOffsetLabel(timezone, now);
    const abbrev = timezoneAbbrev(timezone, now);
    const aliases = TIMEZONE_ALIASES[timezone] || [];
    const americaTag = timezone.startsWith('America/') ? ['America'] : [];
    return {
      value: timezone,
      label: friendlyTimezoneLabel(timezone, offset),
      searchText: [
        timezone,
        timezone.replace(/[_/]/g, ' '),
        abbrev,
        ...aliases,
        ...americaTag
      ].join(' ').toLowerCase()
    };
  };

  const featured = [];
  const featuredSet = new Set();
  for (const tz of FEATURED_TIMEZONES) {
    if (!unique.includes(tz) || featuredSet.has(tz)) continue;
    featuredSet.add(tz);
    featured.push(makeItem(tz));
  }
  const rest = unique
    .filter((tz) => !featuredSet.has(tz))
    .sort((a, b) => a.localeCompare(b))
    .map(makeItem);

  return [...featured, ...rest];
}

function parseHhMmToMinutes(hhmm) {
  const raw = String(hhmm || '').trim();
  if (!HH_MM_PATTERN.test(raw)) return null;
  const [hours, minutes] = raw.split(':').map(Number);
  return hours * 60 + minutes;
}

function clockMinutesInTimeZone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

/**
 * Inclusive of start, exclusive of end. Overnight windows (22:00–06:00) wrap midnight.
 * Same start and end is treated as a 24-hour window.
 */
function isWithinShiftWindow(date, timezone, startTime, endTime) {
  const nowMinutes = clockMinutesInTimeZone(date, timezone);
  const startMinutes = parseHhMmToMinutes(startTime);
  const endMinutes = parseHhMmToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return false;
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function formatDurationMinutes(totalMinutes) {
  const safe = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h ${minutes}m`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseBalance(raw, fieldLabel) {
  if (raw === undefined || raw === null || raw === '') {
    throw httpError(`${fieldLabel} is required.`, 400);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw httpError(`${fieldLabel} must be a number 0 or greater.`, 400);
  }
  return Math.round(n * 100) / 100;
}

function staffDisplayName(user) {
  if (!user) return '';
  const first = String(user.firstName || '').trim();
  const last = String(user.lastName || '').trim();
  const combined = `${first} ${last}`.trim();
  return combined || user.username || user.email || `User ${user.userId}`;
}

function serializeShift(shift, { now = new Date() } = {}) {
  if (!shift) return null;
  const json = shift.toJSON ? shift.toJSON() : shift;
  return {
    id: json.id,
    userId: json.userId,
    distributorCode: json.distributorCode,
    storeCode: json.storeCode,
    timezone: json.timezone,
    startTime: json.startTime,
    endTime: json.endTime,
    inShiftWindow: isWithinShiftWindow(now, json.timezone, json.startTime, json.endTime),
    timezoneLabel: timezoneOffsetLabel(json.timezone, now)
  };
}

function serializeAttendance(row, { now = new Date() } = {}) {
  if (!row) return null;
  const json = row.toJSON ? row.toJSON() : row;
  const checkInAt = json.checkInAt ? new Date(json.checkInAt) : null;
  const checkOutAt = json.checkOutAt ? new Date(json.checkOutAt) : null;
  const end = checkOutAt || now;
  const workingMinutes = checkInAt ? Math.max(0, Math.round((end.getTime() - checkInAt.getTime()) / 60000)) : 0;
  return {
    id: json.id,
    userId: json.userId,
    distributorCode: json.distributorCode,
    storeCode: json.storeCode,
    shiftId: json.shiftId || null,
    checkInAt: json.checkInAt,
    checkOutAt: json.checkOutAt || null,
    openingBalance: toNumber(json.openingBalance),
    closingBalance: json.closingBalance == null ? null : toNumber(json.closingBalance),
    isOffShift: Boolean(json.isOffShift),
    isOpen: !json.checkOutAt,
    workingHoursMinutes: workingMinutes,
    workingHoursLabel: formatDurationMinutes(workingMinutes)
  };
}

module.exports = {
  httpError,
  isValidIanaTimeZone,
  listIanaTimeZones,
  listTimeZonesWithLabels,
  parseHhMmToMinutes,
  isWithinShiftWindow,
  formatDurationMinutes,
  toNumber,
  parseBalance,
  staffDisplayName,
  serializeShift,
  serializeAttendance
};
