'use strict';

const CAMPAIGN_DAYS = 7;
const DAILY_BONUS_TX_TYPE = 'daily_bonus';
const DAILY_BONUS_SPIN_TX_TYPE = 'daily_bonus_spin';
const REWARD_TYPES = ['sc_coins', 'bonus_spin', 'discount_voucher'];
/** Unused package vouchers expire this long after they are claimed. */
const VOUCHER_TTL_MS = 24 * 60 * 60 * 1000;

/** UTC calendar date YYYY-MM-DD */
function calendarDateUTC(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Normalize DATEONLY / Date / ISO string to YYYY-MM-DD. */
function toDateOnly(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const sliced = value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sliced)) return sliced;
    return calendarDateUTC(value);
  }
  return calendarDateUTC(value);
}

function isDateOnlyBefore(a, b) {
  const left = toDateOnly(a);
  const right = toDateOnly(b);
  if (!left || !right) return false;
  return left < right;
}

function addCalendarDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days between two YYYY-MM-DD strings (today - start). */
function calendarDayDiff(startOn, todayOn) {
  const a = new Date(`${startOn}T12:00:00.000Z`);
  const b = new Date(`${todayOn}T12:00:00.000Z`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isUniqueViolation(err) {
  const parent = err?.parent || err?.original;
  return err?.name === 'SequelizeUniqueConstraintError' || parent?.code === '23505';
}

function voucherExpiresAt(createdAt) {
  if (createdAt == null) return null;
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getTime() + VOUCHER_TTL_MS);
}

function isVoucherPastTtl(voucher, now = new Date()) {
  const expiresAt = voucherExpiresAt(voucher?.createdAt ?? voucher?.created_at);
  if (!expiresAt) return false;
  return now.getTime() >= expiresAt.getTime();
}

module.exports = {
  CAMPAIGN_DAYS,
  DAILY_BONUS_TX_TYPE,
  DAILY_BONUS_SPIN_TX_TYPE,
  REWARD_TYPES,
  VOUCHER_TTL_MS,
  calendarDateUTC,
  toDateOnly,
  isDateOnlyBefore,
  addCalendarDays,
  calendarDayDiff,
  roundMoney,
  isUniqueViolation,
  voucherExpiresAt,
  isVoucherPastTtl
};
