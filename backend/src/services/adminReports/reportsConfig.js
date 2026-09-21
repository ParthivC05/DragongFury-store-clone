/**
 * Admin reports behaviour. Change in code (no env).
 * When true: only Topup (deposit) and Withdraw are included in summary, trend, breakdown, and transactions.
 * When false: all transaction types are included (spin_wheel, vip, promotions, affiliate, game_deposit, game_withdraw, etc.).
 */
const REPORTS_REAL_MONEY_ONLY = true;

module.exports = { REPORTS_REAL_MONEY_ONLY };
