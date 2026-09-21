import { request, requestBlob, baseUrl, TOKEN_KEY } from './client'
import { encodePasswordsInBody } from '../utils/passwordEncrypt'
import { withDateRangeTimezone } from '../utils/dateRange'

/** Admin API client. Only add a function here after the corresponding backend route exists in partner-platform-/backend (admin.routes.js). */

const ADMIN = '/api/admin'

export function getMe() {
  return request(`${ADMIN}/me`)
}

/** Primary store admin: set public URL for verify-email, password reset, referral links. */
export function patchUserSiteUrl(userSiteUrl) {
  return request(`${ADMIN}/me/user-site-url`, {
    method: 'PATCH',
    body: JSON.stringify({ userSiteUrl: userSiteUrl ?? '' })
  })
}

/** Primary store admin: Golden Dragon moneybox (stored as drawer on the store account). */
export function patchDrawer(drawer) {
  return request(`${ADMIN}/me/drawer`, {
    method: 'PATCH',
    body: JSON.stringify({ drawer: drawer === '' || drawer == null ? '' : drawer })
  })
}

export function getDashboard() {
  return request(`${ADMIN}/dashboard`)
}

/** Dashboard time-series: daily/monthly topup & withdraw (optional dateFrom, dateTo, startTime, endTime). */
export function getDashboardSeries(params = {}) {
  const withTz = (params.startTime || params.endTime)
    ? { ...params, timezoneOffset: new Date().getTimezoneOffset() }
    : params
  const clean = Object.fromEntries(Object.entries(withTz).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/dashboard/series${q ? `?${q}` : ''}`)
}

/** Analytics top list: by=distributor|store, metric=recharge (optional startDate, endDate). */
export function getAnalyticsTop(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/analytics/top${q ? `?${q}` : ''}`)
}

export function getDistributors(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/distributors${q ? `?${q}` : ''}`)
}

export function getDistributor(id) {
  return request(`${ADMIN}/distributors/${id}`)
}

export function createDistributor(data) {
  return request(`${ADMIN}/distributors`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateDistributor(id, data) {
  return request(`${ADMIN}/distributors/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteDistributor(id) {
  return request(`${ADMIN}/distributors/${id}`, { method: 'DELETE' })
}

export function getStoresFilterOptions() {
  return request(`${ADMIN}/stores/filter-options`)
}

export function getStores(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/stores${q ? `?${q}` : ''}`)
}

export function createStore(data) {
  return request(`${ADMIN}/stores`, { method: 'POST', body: JSON.stringify(data) })
}

export function getStore(id) {
  return request(`${ADMIN}/stores/${id}`)
}

/** Primary owner + staff admin accounts for a store (master/distributor). */
export function getStoreAdmins(storeId) {
  return request(`${ADMIN}/stores/${storeId}/admins`)
}

/** Store roles for a store (when editing store as master/distributor). */
export function getStoreRolesForStore(storeId) {
  return request(`${ADMIN}/stores/${storeId}/store-roles`)
}

export function updateStore(id, data) {
  return request(`${ADMIN}/stores/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteStore(id) {
  return request(`${ADMIN}/stores/${id}`, { method: 'DELETE' })
}

export function getUsersFilterOptions() {
  return request(`${ADMIN}/users/filter-options`)
}

export function getUsers(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users${q ? `?${q}` : ''}`)
}

export function getContactList(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/contact-lists${q ? `?${q}` : ''}`)
}

export function getContactListFilterOptions() {
  return request(`${ADMIN}/contact-lists/filter-options`)
}

export function downloadContactList(body = {}) {
  return requestBlob(`${ADMIN}/contact-lists/download`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function getContactListDownloads(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/contact-lists/downloads${q ? `?${q}` : ''}`)
}

export function getUserDetail(userId) {
  return request(`${ADMIN}/users/${userId}`)
}

export function patchUserAdmin(userId, body) {
  return request(`${ADMIN}/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function postUserWalletDeduct(userId, body) {
  return request(`${ADMIN}/users/${userId}/wallet/deduct`, { method: 'POST', body: JSON.stringify(body) })
}

export function postUserWalletAddSc(userId, body) {
  return request(`${ADMIN}/users/${userId}/wallet/add-sc`, { method: 'POST', body: JSON.stringify(body) })
}

export function getUserTransactions(userId, params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users/${userId}/user-transactions${q ? `?${q}` : ''}`)
}

export function getUserGameActivities(userId, params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users/${userId}/game-activities${q ? `?${q}` : ''}`)
}

export function getUserGameAccounts(userId) {
  return request(`${ADMIN}/users/${userId}/game-accounts`)
}

export function getUserGameAccountCredentials(userId, accountId) {
  return request(`${ADMIN}/users/${userId}/game-accounts/${accountId}/credentials`)
}

export function updateUserGameAccountCredentials(userId, accountId, data = {}) {
  return request(`${ADMIN}/users/${userId}/game-accounts/${accountId}/credentials`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

export function deleteUserGameAccountCredentials(userId, accountId) {
  return request(`${ADMIN}/users/${userId}/game-accounts/${accountId}/credentials`, {
    method: 'DELETE'
  })
}

export function deleteAllUserGameCredentials(userId) {
  return request(`${ADMIN}/users/${userId}/game-accounts/credentials`, {
    method: 'DELETE'
  })
}

export function getUserGameCredentialsHistory(userId) {
  return request(`${ADMIN}/users/${userId}/game-accounts/credential-history`)
}

export function getUserGameAccountCredentialLogs(userId, accountId) {
  return request(`${ADMIN}/users/${userId}/game-accounts/${accountId}/credential-logs`)
}

export function getUserGameManualRequests(userId, params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users/${userId}/game-manual-requests${q ? `?${q}` : ''}`)
}

export function getUserWithdrawalRequests(userId, params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users/${userId}/withdrawal-requests${q ? `?${q}` : ''}`)
}

export function getUserDepositRequests(userId, params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users/${userId}/deposit-requests${q ? `?${q}` : ''}`)
}

export function getUserGitslotparkTransactions(userId, params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/users/${userId}/gitslotpark-transactions${q ? `?${q}` : ''}`)
}

/** List available game templates for Add game dropdown (GET /api/admin/game-templates). Returns id, name, gameKey, gameLink. */
export function getGameTemplates() {
  return request(`${ADMIN}/game-templates`)
}

/** List all game templates for management – master_admin only (GET /api/admin/game-templates/all). */
export function getAllGameTemplates() {
  return request(`${ADMIN}/game-templates/all`)
}

/** Get one game template by id – master_admin only (GET /api/admin/game-templates/:id). */
export function getGameTemplate(id) {
  return request(`${ADMIN}/game-templates/${id}`)
}

/** Create game template – master_admin only (POST /api/admin/game-templates). Body: name, gameKey, streamlitToken, botBaseUrl, gameLink, isActive?. */
export function createGameTemplate(data) {
  return request(`${ADMIN}/game-templates`, { method: 'POST', body: JSON.stringify(data) })
}

/** Update game template – master_admin only (PUT /api/admin/game-templates/:id). Body: name?, gameKey?, streamlitToken?, botBaseUrl?, gameLink?, isActive?. */
export function updateGameTemplate(id, data) {
  return request(`${ADMIN}/game-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

/** List all games (GET /api/admin/games). */
export function getGames() {
  return request(`${ADMIN}/games`)
}

/** Automation games grouped by name with API usage stats (GET /api/admin/automation-usage/games). */
export function getAutomationUsageGames(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/automation-usage/games${q ? `?${q}` : ''}`)
}

/** Per-game API error breakdown (GET /api/admin/automation-usage/breakdown). */
export function getAutomationUsageBreakdown(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/automation-usage/breakdown${q ? `?${q}` : ''}`)
}

/** Daily automation API call trend (GET /api/admin/automation-usage/trend). */
export function getAutomationUsageTrend(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/automation-usage/trend${q ? `?${q}` : ''}`)
}

/** Paginated automation API errors (GET /api/admin/automation-usage/errors). */
export function getAutomationUsageErrors(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/automation-usage/errors${q ? `?${q}` : ''}`)
}

/** Manual mode switch logs — technical staff only (GET /api/admin/games/manual-mode-logs). */
export function getGameManualModeLogs(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/games/manual-mode-logs${q ? `?${q}` : ''}`)
}

/** Bot automation failure logs — technical staff only (GET /api/admin/games/bot-failure-logs). */
export function getGameBotFailureLogs(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/games/bot-failure-logs${q ? `?${q}` : ''}`)
}

/** Game configuration history — technical staff only (GET /api/admin/games/history). */
export function getGameHistory(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/games/history${q ? `?${q}` : ''}`)
}

/** Get one game (GET /api/admin/games/:id). */
export function getGame(id) {
  return request(`${ADMIN}/games/${id}`)
}

/** Add a new game (POST /api/admin/games). With template: gameTemplateId, gameUsername, gamePassword, minWithdrawalLimit?, maxWithdrawalLimit?, minDepositLimit?, maxDepositLimit?. Legacy: gameName, gameLink, 'streamlit-token', 'bot-base-url', etc. */
export function createGame(data) {
  const body = encodePasswordsInBody(data || {})
  return request(`${ADMIN}/games`, { method: 'POST', body: JSON.stringify(body) })
}

/** Add a custom manual-only game (POST /api/admin/games/custom). Body: gameName, gameLink, imageUrl, minWithdrawalLimit?, maxWithdrawalLimit?, minDepositLimit?, maxDepositLimit?, storeCode? (master). */
export function createCustomGame(data) {
  return request(`${ADMIN}/games/custom`, { method: 'POST', body: JSON.stringify(data || {}) })
}

const MAX_GAME_IMAGE_BYTES = 5 * 1024 * 1024

/** Upload custom game image to S3 (POST /api/admin/games/upload-image). Returns { url }. */
export function uploadGameImage(file) {
  if (!file) {
    return Promise.reject(new Error('No image file selected.'))
  }
  if (file.size > MAX_GAME_IMAGE_BYTES) {
    return Promise.reject(new Error('Image is too large. Maximum size is 5MB.'))
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${ADMIN}/games/upload-image`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const raw = await res.text().catch(() => '')
    let data = {}
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed. Please try again.')
      err.status = res.status
      throw err
    }
    return data
  })
}

/** Update game (PUT /api/admin/games/:id). Body: name?, platformGameUrl?, gameUsername?, gamePassword?, minWithdrawalLimit?, maxWithdrawalLimit?, minDepositLimit?, maxDepositLimit?, isActive?, displayOrder? — credential changes validate via provider clients + generateKey. */
export function updateGame(id, data) {
  const body = encodePasswordsInBody(data || {})
  return request(`${ADMIN}/games/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

/** Change game store password (POST /api/admin/games/:id/change-password). Body: { newPassword }. */
export function changeGamePassword(id, data) {
  const body = encodePasswordsInBody(data || {})
  return request(`${ADMIN}/games/${id}/change-password`, { method: 'POST', body: JSON.stringify(body) })
}

/** Delete game (DELETE /api/admin/games/:id). */
export function deleteGame(id) {
  return request(`${ADMIN}/games/${id}`, { method: 'DELETE' })
}

/**
 * Toggle a game's bot_offline flag (PATCH /api/admin/games/:id/toggle-bot-offline).
 * When botOffline = true → all game operations go to manual processing.
 * When botOffline = false → all game operations use the bot API automatically.
 */
export function toggleGameBotOffline(id) {
  return request(`${ADMIN}/games/${id}/toggle-bot-offline`, { method: 'PATCH' })
}

/** Toggle manual redeem only mode for a game (PATCH /api/admin/games/:id/toggle-manual-redeem-only). */
export function toggleGameManualRedeemOnly(id) {
  return request(`${ADMIN}/games/${id}/toggle-manual-redeem-only`, { method: 'PATCH' })
}

// Game manual requests (operations queued when a game's bot is offline)
export function getGameManualRequests(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/game-manual-requests${q ? `?${q}` : ''}`)
}

export function getGameManualRequest(id) {
  return request(`${ADMIN}/game-manual-requests/${id}`)
}

export function approveGameManualRequest(id, data = {}) {
  return request(`${ADMIN}/game-manual-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(data) })
}

export function rejectGameManualRequest(id, data = {}) {
  return request(`${ADMIN}/game-manual-requests/${id}/reject`, { method: 'POST', body: JSON.stringify(data) })
}

export function getGameManualRequestCredentials(id) {
  return request(`${ADMIN}/game-manual-requests/${id}/credentials`)
}

export function updateGameManualRequestCredentials(id, data = {}) {
  return request(`${ADMIN}/game-manual-requests/${id}/credentials`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function getGameManualRequestLogs(id) {
  return request(`${ADMIN}/game-manual-requests/${id}/logs`)
}

/** Unified reports (all roles, scope from auth). */
export function getReportsSummary(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/reports/summary${q ? `?${q}` : ''}`)
}

export function getReportsTrend(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/reports/trend${q ? `?${q}` : ''}`)
}

export function getReportsBreakdown(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/reports/breakdown${q ? `?${q}` : ''}`)
}

export function getReportsFilterOptions() {
  return request(`${ADMIN}/reports/filter-options`)
}

export function getReportsTransactions(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/reports/transactions${q ? `?${q}` : ''}`)
}

/** master_admin: per-store wallet topup / withdraw + Chime/Cash App completed withdrawals (date range). */
export function getStoreWalletSummary(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/store-wallet-summary${q ? `?${q}` : ''}`)
}

/** master_admin / store admin: Direct Crypto on-chain treasury (BTC/ETH/TRX/SOL). */
export function getDirectCryptoTreasury(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/direct-crypto-treasury${q ? `?${q}` : ''}`)
}

/** master_admin: company LND balances (USD + BTC + sats). */
export function getLightningWallet() {
  return request(`${ADMIN}/lightning-wallet`)
}

/** Bonus report (store admin + master/technical staff). Free SC gifts by type. */
export function getBonusReportSummary(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/bonus-report/summary${q ? `?${q}` : ''}`)
}

export function getBonusReportTransactions(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/bonus-report/transactions${q ? `?${q}` : ''}`)
}

export function getBonusReportFilterOptions() {
  return request(`${ADMIN}/bonus-report/filter-options`)
}

/** Bonus SC used vs unused (master/technical staff). Still left + already used + given. */
export function getBonusScUsageSummary(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/bonus-sc-usage/summary${q ? `?${q}` : ''}`)
}

export function getBonusScUsageFilterOptions() {
  return request(`${ADMIN}/bonus-sc-usage/filter-options`)
}

/** Payment report (master/technical staff). Method & provider success/failure rates. */
export function getPaymentReportSummary(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/payment-report/summary${q ? `?${q}` : ''}`)
}

export function getPaymentReportFilterOptions() {
  return request(`${ADMIN}/payment-report/filter-options`)
}

/** Wallet adjust report (master/technical staff). Admin/staff PSC/BSC/RSC add & remove audit. */
export function getWalletAdjustReportSummary(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/wallet-adjust-report/summary${q ? `?${q}` : ''}`)
}

export function getWalletAdjustReportTransactions(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/wallet-adjust-report/transactions${q ? `?${q}` : ''}`)
}

export function getWalletAdjustReportFilterOptions() {
  return request(`${ADMIN}/wallet-adjust-report/filter-options`)
}

/** SC coin story (super admin + technical staff). Opening + added − used = leftover for PSC / Bonus / RSC. */
export function getWalletScReconciliationSummary(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/wallet-sc-reconciliation/summary${q ? `?${q}` : ''}`)
}

export function getWalletScReconciliationEntries(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/wallet-sc-reconciliation/entries${q ? `?${q}` : ''}`)
}

export function getWalletScReconciliationFilterOptions() {
  return request(`${ADMIN}/wallet-sc-reconciliation/filter-options`)
}

/** Daily SC report: each day's in / out / leftover, leftover carried to the next day. */
export function getDailyScReportSummary(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/daily-sc-report/summary${q ? `?${q}` : ''}`)
}

export function getDailyScReportEntries(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/daily-sc-report/entries${q ? `?${q}` : ''}`)
}

export function getDailyScReportFilterOptions() {
  return request(`${ADMIN}/daily-sc-report/filter-options`)
}

// Game Logs (automated games) + Slots Transactions ledger – master, distributor, store (scoped)
export function getGameLogsStats(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/game-logs/stats${q ? `?${q}` : ''}`)
}

export function getGameLogsSignups(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/game-logs/signups${q ? `?${q}` : ''}`)
}

export function getGameLogsDeposits(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/game-logs/deposits${q ? `?${q}` : ''}`)
}

export function getGameLogsWithdrawals(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/game-logs/withdrawals${q ? `?${q}` : ''}`)
}

export function getGameLogsTrend(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/game-logs/trend${q ? `?${q}` : ''}`)
}

export function getGameLogsBreakdown(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/game-logs/breakdown${q ? `?${q}` : ''}`)
}

/** Combined slots transactions ledger (deposits, withdraws, account creations) with filters. */
export function getGameLogsTransactions(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/game-logs/transactions${q ? `?${q}` : ''}`)
}

/** Game report: SC wagered / won / GGR / payout by game or provider. */
export function getGameReport(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== '' && v !== 'all')
  )
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/game-report${q ? `?${q}` : ''}`)
}

// Store roles – store admin (own store) or master/technical staff (scoped by distributorCode+storeCode)
export function getStoreRoles(params = {}) {
  const q = new URLSearchParams()
  if (params.distributorCode) q.set('distributorCode', params.distributorCode)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const qs = q.toString()
  return request(`${ADMIN}/store-roles${qs ? `?${qs}` : ''}`)
}
export function getStoreRole(id) {
  return request(`${ADMIN}/store-roles/${id}`)
}
export function createStoreRole(data) {
  return request(`${ADMIN}/store-roles`, { method: 'POST', body: JSON.stringify(data) })
}
export function updateStoreRole(id, data) {
  return request(`${ADMIN}/store-roles/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
export function deleteStoreRole(id) {
  return request(`${ADMIN}/store-roles/${id}`, { method: 'DELETE' })
}

// Store staff – store admin (own store) or master admin (all stores, optional filters)
export function getStoreStaff(params = {}) {
  const q = new URLSearchParams()
  if (params.distributorCode) q.set('distributorCode', params.distributorCode)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const qs = q.toString()
  return request(`${ADMIN}/store-staff${qs ? `?${qs}` : ''}`)
}
export function createStoreStaff(data) {
  const body = encodePasswordsInBody(data || {})
  return request(`${ADMIN}/store-staff`, { method: 'POST', body: JSON.stringify(body) })
}
export function updateStoreStaff(id, data) {
  return request(`${ADMIN}/store-staff/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
export function deleteStoreStaff(id) {
  return request(`${ADMIN}/store-staff/${id}`, { method: 'DELETE' })
}

/** IANA timezones with UTC offset labels for staff shift allocation. */
export function getStaffShiftTimezones() {
  return request(`${ADMIN}/staff-shifts/timezones`)
}

export function getStaffShifts(params = {}) {
  const q = new URLSearchParams()
  if (params.distributorCode) q.set('distributorCode', params.distributorCode)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const qs = q.toString()
  return request(`${ADMIN}/staff-shifts${qs ? `?${qs}` : ''}`)
}

export function getStaffShift(userId, params = {}) {
  const q = new URLSearchParams()
  if (params.distributorCode) q.set('distributorCode', params.distributorCode)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const qs = q.toString()
  return request(`${ADMIN}/staff-shifts/${userId}${qs ? `?${qs}` : ''}`)
}

export function saveStaffShift(userId, data) {
  return request(`${ADMIN}/staff-shifts/${userId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteStaffShift(userId, params = {}) {
  const q = new URLSearchParams()
  if (params.distributorCode) q.set('distributorCode', params.distributorCode)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const qs = q.toString()
  return request(`${ADMIN}/staff-shifts/${userId}${qs ? `?${qs}` : ''}`, { method: 'DELETE' })
}

export function getMyAttendance() {
  return request(`${ADMIN}/me/attendance`)
}

export function checkInAttendance(openingBalance) {
  return request(`${ADMIN}/me/attendance/check-in`, {
    method: 'POST',
    body: JSON.stringify({ openingBalance })
  })
}

export function checkOutAttendance(closingBalance) {
  return request(`${ADMIN}/me/attendance/check-out`, {
    method: 'POST',
    body: JSON.stringify({ closingBalance })
  })
}

export function getStaffAttendanceStaffOptions() {
  return request(`${ADMIN}/staff-attendance/staff-options`)
}

export function getStaffAttendanceReport(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/staff-attendance/report${q ? `?${q}` : ''}`)
}

export function getOffShiftRequests(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/staff-attendance/off-shift-requests${q ? `?${q}` : ''}`)
}

export function approveOffShiftRequest(id, data = {}) {
  return request(`${ADMIN}/staff-attendance/off-shift-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export function rejectOffShiftRequest(id) {
  return request(`${ADMIN}/staff-attendance/off-shift-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({}) })
}

export function grantOffShiftAccess(data) {
  return request(`${ADMIN}/staff-attendance/grant-off-shift`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

// Admin roles – master_admin only (create and manage roles for full admin panel)
export function getAdminRoles() {
  return request(`${ADMIN}/admin-roles`)
}
export function getAdminRole(id) {
  return request(`${ADMIN}/admin-roles/${id}`)
}
export function createAdminRole(data) {
  return request(`${ADMIN}/admin-roles`, { method: 'POST', body: JSON.stringify(data) })
}
export function updateAdminRole(id, data) {
  return request(`${ADMIN}/admin-roles/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
export function deleteAdminRole(id) {
  return request(`${ADMIN}/admin-roles/${id}`, { method: 'DELETE' })
}

// Admin staff – master_admin only
export function getAdminStaff() {
  return request(`${ADMIN}/admin-staff`)
}
export function createAdminStaff(data) {
  const body = encodePasswordsInBody(data || {})
  return request(`${ADMIN}/admin-staff`, { method: 'POST', body: JSON.stringify(body) })
}
export function updateAdminStaff(id, data) {
  return request(`${ADMIN}/admin-staff/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
export function deleteAdminStaff(id) {
  return request(`${ADMIN}/admin-staff/${id}`, { method: 'DELETE' })
}

// Subscriptions (manual process – no payment). Distributor/master admin: CRUD plans; store admin: view current & request.
export function getSubscriptionsCurrent(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/subscriptions/current${q ? `?${q}` : ''}`)
}
export function getSubscriptions(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/subscriptions${q ? `?${q}` : ''}`)
}
export function getSubscription(id) {
  return request(`${ADMIN}/subscriptions/${id}`)
}
export function createSubscription(data) {
  return request(`${ADMIN}/subscriptions`, { method: 'POST', body: JSON.stringify(data) })
}
export function updateSubscription(id, data) {
  return request(`${ADMIN}/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
export function deleteSubscription(id) {
  return request(`${ADMIN}/subscriptions/${id}`, { method: 'DELETE' })
}
export function getSubscriptionRequests(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/subscription-requests${q ? `?${q}` : ''}`)
}
export function createSubscriptionRequest(data) {
  return request(`${ADMIN}/subscription-requests`, { method: 'POST', body: JSON.stringify(data) })
}
export function approveSubscriptionRequest(id, data = {}) {
  return request(`${ADMIN}/subscription-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(data) })
}
export function rejectSubscriptionRequest(id, data = {}) {
  return request(`${ADMIN}/subscription-requests/${id}/reject`, { method: 'POST', body: JSON.stringify(data) })
}
/** Cancel (delete) a pending subscription request. Store admin only. */
export function cancelSubscriptionRequest(id) {
  return request(`${ADMIN}/subscription-requests/${id}`, { method: 'DELETE' })
}

// Payment providers – master_admin only (activate/deactivate for user deposit page).
export function getPaymentProviders() {
  return request(`${ADMIN}/payment-providers`)
}

/** PATCH /api/admin/payment-providers/:providerCode/status. Body: { isActive?, depositEnabled?, withdrawEnabled? }. Returns updated provider. */
export function updatePaymentProviderStatus(providerCode, payload) {
  const body = typeof payload === 'object' && payload !== null
    ? payload
    : { isActive: !!payload }
  return request(`${ADMIN}/payment-providers/${encodeURIComponent(providerCode)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

/** Master admin: reorder payment providers. Body: { orderedCodes: string[] }. Returns updated list. */
export function reorderPaymentProviders(orderedCodes) {
  return request(`${ADMIN}/payment-providers/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedCodes: Array.isArray(orderedCodes) ? orderedCodes : [] })
  })
}

/** Get wallet limits (platform, or store-scoped for store admin / master with query). */
export function getAdminWalletLimits(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/wallet-limits${q ? `?${q}` : ''}`)
}

/** Update platform wallet limits, or store daily limit when distributorCode/storeCode are sent. */
export function updateAdminWalletLimits(payload) {
  return request(`${ADMIN}/wallet-limits`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  })
}

/** Master/tech staff: list all stores with daily withdrawal limits. */
export function getAdminStoreDailyWithdrawLimits() {
  return request(`${ADMIN}/wallet-limits/stores`)
}

/** Master/tech staff: set or clear daily withdrawal limit for one store. */
export function updateAdminStoreDailyWithdrawLimit(payload) {
  return request(`${ADMIN}/wallet-limits/stores`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  })
}

/** Get redeem win % (last top-up + N% required to redeem from game). */
export function getAdminRedeemPercentage(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/redeem-percentage${q ? `?${q}` : ''}`)
}

/** Master/tech staff: list all stores with effective redeem win %. */
export function getAdminStoreRedeemPercentages() {
  return request(`${ADMIN}/redeem-percentage/stores`)
}

/** Update redeem win % for global (master) or store scope. */
export function updateAdminRedeemPercentage(payload) {
  return request(`${ADMIN}/redeem-percentage`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  })
}

/** Reset store redeem % override to platform default. */
export function resetAdminRedeemPercentage(payload = {}) {
  return request(`${ADMIN}/redeem-percentage/reset-to-default`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  })
}

/** Super admin / technical staff: platform or one-store payin/payout fee %. */
export function getAdminTransactionFees(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/transaction-fees${q ? `?${q}` : ''}`)
}

/** Super admin / technical staff: all stores with effective payin/payout fee %. */
export function getAdminStoreTransactionFees() {
  return request(`${ADMIN}/transaction-fees/stores`)
}

/** Update platform default or one store's payin/payout fee %. */
export function updateAdminTransactionFees(payload) {
  return request(`${ADMIN}/transaction-fees`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  })
}

/** Reset a store's payin/payout fee override to platform default. */
export function resetAdminTransactionFees(payload = {}) {
  return request(`${ADMIN}/transaction-fees/reset-to-default`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  })
}

/** Store admin / master: list providers for a store. Master: pass { distributorCode, storeCode }. */
export function getStorePaymentProviders(params = {}) {
  const q = new URLSearchParams()
  if (params.distributorCode) q.set('distributorCode', params.distributorCode)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const qs = q.toString()
  return request(`${ADMIN}/store-payment-providers${qs ? `?${qs}` : ''}`)
}

/** Store admin / master: set store's enabled/deposit/withdraw for a provider. */
export function updateStorePaymentProvider(providerCode, payload, storeContext = {}) {
  const body = { ...(payload || {}) }
  if (storeContext.distributorCode) body.distributorCode = storeContext.distributorCode
  if (storeContext.storeCode) body.storeCode = storeContext.storeCode
  return request(`${ADMIN}/store-payment-providers/${encodeURIComponent(providerCode)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

/** Toggle BEST DEALS label on a deposit payment method. */
export function updateStorePaymentBestDeals(methodKey, enabled, storeContext = {}) {
  const body = { methodKey, enabled }
  if (storeContext.distributorCode) body.distributorCode = storeContext.distributorCode
  if (storeContext.storeCode) body.storeCode = storeContext.storeCode
  return request(`${ADMIN}/store-payment-providers/best-deals`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

/** Store admin / master: reorder payment providers for the store. */
export function reorderStorePaymentProviders(orderedCodes, storeContext = {}) {
  return request(`${ADMIN}/store-payment-providers/reorder`, {
    method: 'PUT',
    body: JSON.stringify({
      orderedCodes: Array.isArray(orderedCodes) ? orderedCodes : [],
      ...(storeContext.distributorCode ? { distributorCode: storeContext.distributorCode } : {}),
      ...(storeContext.storeCode ? { storeCode: storeContext.storeCode } : {})
    })
  })
}

/** Help content – list all topics with default and store content. */
export function getHelpList() {
  return request(`${ADMIN}/help`)
}

/** Get one help topic for editing. */
export function getHelpTopic(topic) {
  return request(`${ADMIN}/help/${encodeURIComponent(topic)}`)
}

/** Create or update help content. Body: { content?, video_url?, use_default? } (use_default only for store_admin). */
export function upsertHelpTopic(topic, data) {
  return request(`${ADMIN}/help/${encodeURIComponent(topic)}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

/** Blog posts — store-scoped. Query: page?, limit?, search?, isActive?, category?, storeCode? (master). */
export function getAdminBlogPosts(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/blog${q ? `?${q}` : ''}`)
}

export function getAdminBlogPost(id) {
  return request(`${ADMIN}/blog/${encodeURIComponent(id)}`)
}

export function createAdminBlogPost(body) {
  return request(`${ADMIN}/blog`, { method: 'POST', body: JSON.stringify(body || {}) })
}

export function updateAdminBlogPost(id, body) {
  return request(`${ADMIN}/blog/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

export function toggleAdminBlogPost(id, status) {
  return request(`${ADMIN}/blog/${encodeURIComponent(id)}/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })
}

export function deleteAdminBlogPost(id) {
  return request(`${ADMIN}/blog/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Footer menus — store-scoped. Query: storeCode?, isActive? */
export function getAdminFooterMenus(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/footer/menus${q ? `?${q}` : ''}`)
}

export function createAdminFooterMenu(body) {
  return request(`${ADMIN}/footer/menus`, { method: 'POST', body: JSON.stringify(body || {}) })
}

export function updateAdminFooterMenu(id, body) {
  return request(`${ADMIN}/footer/menus/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

export function deleteAdminFooterMenu(id) {
  return request(`${ADMIN}/footer/menus/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Footer pages — store-scoped. Query: storeCode?, menuId?, search?, isActive? */
export function getAdminFooterPages(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/footer/pages${q ? `?${q}` : ''}`)
}

export function getAdminFooterPage(id) {
  return request(`${ADMIN}/footer/pages/${encodeURIComponent(id)}`)
}

export function createAdminFooterPage(body) {
  return request(`${ADMIN}/footer/pages`, { method: 'POST', body: JSON.stringify(body || {}) })
}

export function updateAdminFooterPage(id, body) {
  return request(`${ADMIN}/footer/pages/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

export function deleteAdminFooterPage(id) {
  return request(`${ADMIN}/footer/pages/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

const MAX_FOOTER_IMAGE_BYTES = 5 * 1024 * 1024

/** Upload footer page layout image to S3. Returns { url }. */
export function uploadAdminFooterImage(file) {
  if (!file) {
    return Promise.reject(new Error('No image file selected.'))
  }
  if (file.size > MAX_FOOTER_IMAGE_BYTES) {
    return Promise.reject(new Error('Image is too large. Maximum size is 5MB.'))
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${ADMIN}/footer/upload-image`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const raw = await res.text().catch(() => '')
    let data = {}
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed. Please try again.')
      err.status = res.status
      throw err
    }
    return data
  })
}

/** Footer settings — store-scoped. Query: storeCode? */
export function getAdminFooterSettings(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/footer/settings${q ? `?${q}` : ''}`)
}

export function updateAdminFooterSettings(body) {
  return request(`${ADMIN}/footer/settings`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

/** Legal pages (privacy, terms, responsible-gaming) — store-scoped. Query: storeCode? */
export function getAdminLegalPages(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/footer/legal${q ? `?${q}` : ''}`)
}

export function getAdminLegalPage(pageKey, params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/footer/legal/${encodeURIComponent(pageKey)}${q ? `?${q}` : ''}`)
}

export function updateAdminLegalPage(pageKey, body) {
  return request(`${ADMIN}/footer/legal/${encodeURIComponent(pageKey)}`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

const MAX_BLOG_IMAGE_BYTES = 5 * 1024 * 1024

/** Upload blog cover/content image to S3. Returns { url }. */
export function uploadAdminBlogImage(file) {
  if (!file) {
    return Promise.reject(new Error('No image file selected.'))
  }
  if (file.size > MAX_BLOG_IMAGE_BYTES) {
    return Promise.reject(new Error('Image is too large. Maximum size is 5MB.'))
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${ADMIN}/blog/upload-image`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const raw = await res.text().catch(() => '')
    let data = {}
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed. Please try again.')
      err.status = res.status
      throw err
    }
    return data
  })
}

/** Link2Play games — PlayJuwa only. Query: page?, limit?, search?, isActive?, category? */
export function getAdminLink2PlayGames(params = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString()
  return request(`${ADMIN}/link2play${q ? `?${q}` : ''}`)
}

export function getAdminLink2PlayGame(id) {
  return request(`${ADMIN}/link2play/${encodeURIComponent(id)}`)
}

export function createAdminLink2PlayGame(body) {
  return request(`${ADMIN}/link2play`, { method: 'POST', body: JSON.stringify(body || {}) })
}

export function updateAdminLink2PlayGame(id, body) {
  return request(`${ADMIN}/link2play/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

export function toggleAdminLink2PlayGame(id, status) {
  return request(`${ADMIN}/link2play/${encodeURIComponent(id)}/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })
}

export function deleteAdminLink2PlayGame(id) {
  return request(`${ADMIN}/link2play/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

const MAX_LINK2PLAY_IMAGE_BYTES = 5 * 1024 * 1024

/** Upload Link2Play game image to S3. Returns { url }. */
export function uploadAdminLink2PlayImage(file) {
  if (!file) {
    return Promise.reject(new Error('No image file selected.'))
  }
  if (file.size > MAX_LINK2PLAY_IMAGE_BYTES) {
    return Promise.reject(new Error('Image is too large. Maximum size is 5MB.'))
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${ADMIN}/link2play/upload-image`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const raw = await res.text().catch(() => '')
    let data = {}
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed. Please try again.')
      err.status = res.status
      throw err
    }
    return data
  })
}

/** User deposit history (deposit_requests + deposit_orders + manual Chime). Scoped by admin role. Query: page?, limit?, status?, provider? (orionstarspay|chime|dollarpay|xxpay), method? (card|cashapp|apple_pay|google_pay|chime|crypto), userId?, storeCode?, distributorCode? (master) */
export function getDepositRequests(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/deposit-requests${q ? `?${q}` : ''}`)
}

/** Referral transactions report (friend signup bonuses + referrer rewards). Affiliate permission. Store-scoped for store admins. */
export function getReferralTransactions(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/referral-transactions${q ? `?${q}` : ''}`)
}

/** Distinct store codes for dashboard payment totals store filter (master_admin with deposit/payment access). */
export function getPaymentTotalsStoreCodes() {
  return request(`${ADMIN}/deposit-requests/store-codes`)
}

/** Unified withdrawal history (wallet + speed crypto + manual Chime/Cash App). Scoped like deposits. */
export function getWithdrawalRequests(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/withdrawal-requests${q ? `?${q}` : ''}`)
}

/** Chime / Cash App manual withdrawals — scoped by admin role. Query: status?, payoutType?, paymentProvider? (manual|dollarpay|xxpay), page?, limit?, storeCode?, distributorCode? */
export function getChimeCashappWithdrawals(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/chime-cashapp-withdrawals${q ? `?${q}` : ''}`)
}

/** Completed manual Chime/Cash App withdrawals totaled by staff paid-from tag. */
export function getChimeCashappWithdrawalAccountTotals(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/chime-cashapp-withdrawals/account-totals${q ? `?${q}` : ''}`)
}

export function approveChimeCashappWithdrawal(id, payload = {}) {
  const body = payload && typeof payload === 'object' ? payload : {}
  return request(`${ADMIN}/chime-cashapp-withdrawals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function rejectChimeCashappWithdrawal(id, rejectionReason) {
  return request(`${ADMIN}/chime-cashapp-withdrawals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ rejectionReason: rejectionReason ?? '' })
  })
}

/** Chime manual deposits — scoped by admin role. Query: status?, page?, limit?, storeCode?, distributorCode? */
export function getChimeDeposits(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/chime-deposits${q ? `?${q}` : ''}`)
}

/** Completed Chime deposits totaled by pay-to username. Same date window as dashboard payment totals. */
export function getChimeDepositAccountTotals(params = {}) {
  const clean = Object.fromEntries(Object.entries(withDateRangeTimezone(params)).filter(([, v]) => v != null && v !== ''))
  const q = new URLSearchParams(clean).toString()
  return request(`${ADMIN}/chime-deposits/account-totals${q ? `?${q}` : ''}`)
}

/** Pay-to Chime names for a store. Store admin: no params. Master/distributor: query storeCode + distributorCode. */
export function getChimeDepositReceiveAccounts(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/chime-deposits/receive-accounts${q ? `?${q}` : ''}`)
}

/** Replace pay-to Chime accounts. Body: { accounts: [{ username, qrUrl, appLink }] }; master/distributor also send storeCode + distributorCode. */
export function putChimeDepositReceiveAccounts(body) {
  return request(`${ADMIN}/chime-deposits/receive-accounts`, {
    method: 'PUT',
    body: JSON.stringify(body || {})
  })
}

/** Upload a Chime pay-to QR image. Returns { data: { url } }. */
export function uploadChimeDepositQr(file) {
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${ADMIN}/chime-deposits/qr-upload`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed')
      err.status = res.status
      throw err
    }
    return data
  })
}

export function approveChimeDeposit(id) {
  return request(`${ADMIN}/chime-deposits/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: '{}'
  })
}

export function rejectChimeDeposit(id, rejectionReason) {
  return request(`${ADMIN}/chime-deposits/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ rejectionReason: rejectionReason ?? '' })
  })
}

/** Bonus codes API (`/api/admin/bonus/*`). Scoped: master_admin + store_admin. */
export function getAdminBonusCodes(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/bonus/codes${q ? `?${q}` : ''}`)
}

export function getAdminBonusCode(id) {
  return request(`${ADMIN}/bonus/codes/${encodeURIComponent(id)}`)
}

export function createAdminBonusCode(body) {
  return request(`${ADMIN}/bonus/codes`, { method: 'POST', body: JSON.stringify(body || {}) })
}

export function updateAdminBonusCode(id, body) {
  return request(`${ADMIN}/bonus/codes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body || {})
  })
}

export function deleteAdminBonusCode(id) {
  return request(`${ADMIN}/bonus/codes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getAdminBonusTransactions(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/bonus/transactions${q ? `?${q}` : ''}`)
}

/** Geo IP allowlist (`/api/admin/geo-ip-allowlist`). Master + store admins (store-scoped). */
export function getGeoIpAllowlist(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/geo-ip-allowlist${q ? `?${q}` : ''}`)
}

export function createGeoIpAllowlistEntry(body) {
  return request(`${ADMIN}/geo-ip-allowlist`, {
    method: 'POST',
    body: JSON.stringify(body || {})
  })
}

export function deleteGeoIpAllowlistEntry(id) {
  return request(`${ADMIN}/geo-ip-allowlist/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

/** Signup device IP allowlist (`/api/admin/fingerprint-signup-ip-allowlist`). Skips one-account-per-device. */
export function getFingerprintSignupIpAllowlist(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`${ADMIN}/fingerprint-signup-ip-allowlist${q ? `?${q}` : ''}`)
}

export function createFingerprintSignupIpAllowlistEntry(body) {
  return request(`${ADMIN}/fingerprint-signup-ip-allowlist`, {
    method: 'POST',
    body: JSON.stringify(body || {})
  })
}

export function deleteFingerprintSignupIpAllowlistEntry(id) {
  return request(`${ADMIN}/fingerprint-signup-ip-allowlist/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

/** Didit KYC settings (`/api/admin/didit-kyc`). Master admin. */
export function getDiditKycSettings() {
  return request(`${ADMIN}/didit-kyc`)
}

export function updateDiditKycSettings(body) {
  return request(`${ADMIN}/didit-kyc`, {
    method: 'PATCH',
    body: JSON.stringify(body || {})
  })
}

/** Phone verification settings (`/api/admin/phone-verification`). Master admin. */
export function getPhoneVerificationSettings() {
  return request(`${ADMIN}/phone-verification`)
}

export function updatePhoneVerificationSettings(body) {
  return request(`${ADMIN}/phone-verification`, {
    method: 'PATCH',
    body: JSON.stringify(body || {})
  })
}

/** Didit KYC player reports (`/api/admin/didit-kyc/reports`). Master admin. */
export function getDiditKycReports(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, v)
  })
  const qs = q.toString()
  return request(`${ADMIN}/didit-kyc/reports${qs ? `?${qs}` : ''}`)
}

export function getDiditKycReportsSummary(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, v)
  })
  const qs = q.toString()
  return request(`${ADMIN}/didit-kyc/reports/summary${qs ? `?${qs}` : ''}`)
}

export function getDiditKycReportsFilterOptions() {
  return request(`${ADMIN}/didit-kyc/reports/filter-options`)
}

/** Support tickets — scoped by admin role. Query: status?, category?, search?, storeCode?, page?, limit? */
export function getSupportTickets(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, v)
  })
  const qs = q.toString()
  return request(`${ADMIN}/support-tickets${qs ? `?${qs}` : ''}`)
}

export function getSupportTicket(id) {
  return request(`${ADMIN}/support-tickets/${encodeURIComponent(id)}`)
}

export function replySupportTicket(id, body) {
  return request(`${ADMIN}/support-tickets/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify(body || {})
  })
}

export function updateSupportTicketStatus(id, status) {
  return request(`${ADMIN}/support-tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })
}

export function uploadSupportTicketImage(file) {
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${ADMIN}/support-tickets/upload`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed')
      err.status = res.status
      throw err
    }
    return data
  })
}
