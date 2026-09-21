/**
 * Format a number as SC/currency with exactly 2 decimal places (.2f).
 * @param {number|null|undefined} n
 * @returns {string} e.g. "0.00", "123.45"
 */
export function formatSc(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0.00';
  return Number(n).toFixed(2);
}

/**
 * Round a number to 2 decimal places for API/calculations.
 * @param {number} n
 * @returns {number}
 */
export function roundTo2(n) {
  if (!Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
}

/** Allowed input: digits, optional dot, up to 2 digits after dot */
const MAX_TWO_DECIMALS = /^\d*\.?\d{0,2}$/;

/**
 * Constrain an amount input to at most 2 decimal places.
 * Use in onChange: setAmount(constrainAmountInput(e.target.value) ?? amount)
 * @param {string} inputValue
 * @returns {string|null} new value to set, or null to keep previous
 */
export function constrainAmountInput(inputValue) {
  if (inputValue === '' || inputValue === '.') return inputValue;
  const trimmed = String(inputValue).trim();
  if (MAX_TWO_DECIMALS.test(trimmed)) return trimmed;
  const num = parseFloat(trimmed);
  if (Number.isNaN(num)) return null;
  return roundTo2(num).toFixed(2);
}
