import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import * as affiliateApi from '../api/affiliate'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'
import './Affiliate.css'

const MAX_AMOUNT_SC = 10000
const PROGRAM_GIVE_GET = 'give_get'
const PROGRAM_CLASSIC = 'classic'

function storeKey(s) {
  return `${s.distributorCode || ''}|${s.storeCode || ''}`
}

function formatUpdatedAt(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function draftFromStore(s) {
  const programMode = s.programMode === PROGRAM_CLASSIC || s.isClassic ? PROGRAM_CLASSIC : PROGRAM_GIVE_GET
  return {
    programMode,
    friendSignupBonusSc: s.friendSignupBonusSc != null ? String(s.friendSignupBonusSc) : programMode === PROGRAM_CLASSIC ? '5' : '15',
    referrerRewardSc: s.referrerRewardSc != null ? String(s.referrerRewardSc) : '15',
    minQualifyingDepositUsd: s.minQualifyingDepositUsd != null ? String(s.minQualifyingDepositUsd) : programMode === PROGRAM_CLASSIC ? '0' : '20',
    payoutDelayHours: s.payoutDelayHours != null ? String(s.payoutDelayHours) : '24',
    weeklyCapSc: s.weeklyCapSc != null ? String(s.weeklyCapSc) : '100',
    rewardPercentage: s.rewardPercentage != null ? String(s.rewardPercentage) : '10',
    rewardMaxSc: s.rewardMaxSc != null ? String(s.rewardMaxSc) : '0',
    maxRewardsPerReferral: s.maxRewardsPerReferral != null ? String(s.maxRewardsPerReferral) : '3'
  }
}

function numOk(raw, min = 0, max = MAX_AMOUNT_SC) {
  if (raw === '' || raw == null) return false
  const n = Number(raw)
  return Number.isFinite(n) && n >= min && n <= max
}

function isDirty(draft, store) {
  const baseline = draftFromStore(store)
  return Object.keys(baseline).some((k) => String(draft[k]) !== String(baseline[k]))
}

function programSummary(draft, currency) {
  if (draft.programMode === PROGRAM_CLASSIC) {
    return `${draft.friendSignupBonusSc} ${currency} signup · ${draft.rewardPercentage}% × ${draft.maxRewardsPerReferral} deposits`
  }
  return `Give ${draft.friendSignupBonusSc} / Get ${draft.referrerRewardSc} ${currency}`
}

export default function Affiliate() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [currency, setCurrency] = useState('SC')
  const [drafts, setDrafts] = useState({})
  const [expanded, setExpanded] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await affiliateApi.listAffiliateStores()
      const list = Array.isArray(data?.stores) ? data.stores : []
      setStores(list)
      setCurrency(data?.currency || 'SC')
      const nextDrafts = {}
      list.forEach((s) => {
        nextDrafts[storeKey(s)] = draftFromStore(s)
      })
      setDrafts(nextDrafts)
    } catch (err) {
      toast.error(err.message || 'Unable to load Refer & Earn settings.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => {
      const hay = [s.storeCode, s.distributorCode, s.username, s.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [stores, search])

  function updateDraft(key, patch) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch }
    }))
  }

  async function saveRow(store) {
    const key = storeKey(store)
    const draft = drafts[key]
    if (!draft) return

    const programMode = isMasterAdmin
      ? draft.programMode === PROGRAM_CLASSIC
        ? PROGRAM_CLASSIC
        : PROGRAM_GIVE_GET
      : store.programMode === PROGRAM_CLASSIC
        ? PROGRAM_CLASSIC
        : PROGRAM_GIVE_GET

    if (!numOk(draft.friendSignupBonusSc)) {
      toast.error(`Friend signup bonus must be between 0 and ${MAX_AMOUNT_SC}.`)
      return
    }

    if (programMode === PROGRAM_CLASSIC) {
      if (!numOk(draft.rewardPercentage, 0.01, 100)) {
        toast.error('Commission percent must be between 0.01 and 100.')
        return
      }
      if (!numOk(draft.maxRewardsPerReferral, 1, 20)) {
        toast.error('First N deposits must be between 1 and 20.')
        return
      }
      if (!numOk(draft.rewardMaxSc, 0, MAX_AMOUNT_SC)) {
        toast.error(`Max SC per deposit must be between 0 and ${MAX_AMOUNT_SC}.`)
        return
      }
    } else {
      if (!numOk(draft.referrerRewardSc)) {
        toast.error(`Referrer bonus must be between 0 and ${MAX_AMOUNT_SC}.`)
        return
      }
      if (!(Number(draft.friendSignupBonusSc) > 0) && !(Number(draft.referrerRewardSc) > 0)) {
        toast.error('At least one of friend or referrer bonus must be greater than 0.')
        return
      }
      if (!numOk(draft.minQualifyingDepositUsd, 0, 100000)) {
        toast.error('Min deposit must be a valid number.')
        return
      }
      if (!numOk(draft.payoutDelayHours, 0, 720)) {
        toast.error('Payout delay hours must be between 0 and 720.')
        return
      }
      if (!numOk(draft.weeklyCapSc)) {
        toast.error(`Weekly cap must be between 0 and ${MAX_AMOUNT_SC}.`)
        return
      }
    }

    setSavingKey(key)
    try {
      const payload = {
        programMode,
        friendSignupBonusSc: Number(draft.friendSignupBonusSc) || 0,
        referrerRewardSc: Number(draft.referrerRewardSc) || 0,
        minQualifyingDepositUsd: Number(draft.minQualifyingDepositUsd) || 0,
        payoutDelayHours: Number(draft.payoutDelayHours) || 0,
        weeklyCapSc: Number(draft.weeklyCapSc) || 0,
        rewardPercentage: Number(draft.rewardPercentage) || 0,
        rewardMaxSc: Number(draft.rewardMaxSc) || 0,
        maxRewardsPerReferral: Number(draft.maxRewardsPerReferral) || 3
      }
      if (isMasterAdmin) {
        payload.storeCode = store.storeCode
        if (store.distributorCode != null) payload.distributorCode = store.distributorCode
      }
      await affiliateApi.updateAffiliateStore(payload)
      toast.success(`Saved ${store.storeCode}: ${programSummary({ ...draft, programMode }, currency)}.`)
      await load()
    } catch (err) {
      toast.error(err.message || 'Unable to save Refer & Earn settings.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="wallet-limits-page welcome-signup-bonus-page affiliate-dynamic-page">
      <header className="wallet-limits-header">
        <h1>Refer &amp; Earn</h1>
        <p>
          Pick a rule for each store. Numbers are yours to set — nothing is locked in code.
          {isMasterAdmin
            ? ' Super admin can change the rule and the numbers for every store.'
            : ' You can change the numbers for your store. Super admin picks the rule.'}
        </p>
      </header>

      <div className="affiliate-guide" aria-label="How Refer & Earn works">
        <div className="affiliate-guide-card">
          <h2>Give / Get</h2>
          <p>You and your friend both get a gift.</p>
          <ol>
            <li>You send your link.</li>
            <li>Friend joins → they get coins right away.</li>
            <li>Friend buys and plays → you get coins too.</li>
          </ol>
          <p className="affiliate-guide-example">
            Example: Give 15 / Get 15. Friend gets 15. You get 15 after they buy and play.
          </p>
        </div>
        <div className="affiliate-guide-card">
          <h2>Commission</h2>
          <p>Friend gets a small gift. You get a slice when they buy.</p>
          <ol>
            <li>You send your link.</li>
            <li>Friend joins → they get coins. You get nothing yet.</li>
            <li>Friend buys → you get a % of that buy.</li>
            <li>Only the first few buys. Then it stops.</li>
          </ol>
          <p className="affiliate-guide-example">
            Example: Friend gets 5 on join. You get 10% of their first 3 deposits.
          </p>
        </div>
      </div>

      {isMasterAdmin && (
        <div className="wsb-toolbar">
          <label className="wl-field">
            <span>Search stores</span>
            <input
              type="search"
              placeholder="Store code, distributor, username, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button type="button" className="wsb-refresh" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      )}

      {loading ? (
        <p className="wallet-limits-loading">Loading…</p>
      ) : (
        <div className="wl-table-wrap">
          <table className="wl-table affiliate-stores-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Program</th>
                <th>Summary</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="wsb-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const key = storeKey(s)
                  const draft = drafts[key] || draftFromStore(s)
                  const dirty = isDirty(draft, s)
                  const saving = savingKey === key
                  const open = expanded[key] === true || !isMasterAdmin
                  const isClassic = draft.programMode === PROGRAM_CLASSIC
                  return (
                    <Fragment key={key}>
                      <tr className={open ? 'affiliate-row--open' : undefined}>
                        <td>
                          <strong>{s.storeCode || '—'}</strong>
                          {s.username ? <span className="wl-muted"> · {s.username}</span> : null}
                          {s.isActive === false ? (
                            <span className="wl-pill wl-pill--warn">Inactive</span>
                          ) : null}
                          {!s.hasOverride ? <span className="wl-pill">Default</span> : null}
                        </td>
                        <td>
                          {isMasterAdmin ? (
                            <select
                              className="store-features-input affiliate-program-select"
                              value={draft.programMode}
                              onChange={(e) => updateDraft(key, { programMode: e.target.value })}
                              disabled={saving}
                              aria-label="Referral program"
                            >
                              <option value={PROGRAM_GIVE_GET}>Give / Get</option>
                              <option value={PROGRAM_CLASSIC}>Commission</option>
                            </select>
                          ) : (
                            <span>{isClassic ? 'Commission' : 'Give / Get'}</span>
                          )}
                        </td>
                        <td className="affiliate-summary-cell">{programSummary(draft, currency)}</td>
                        <td>
                          <div>{formatUpdatedAt(s.updatedAt)}</div>
                          {s.updatedBy ? <span className="wl-muted">{s.updatedBy}</span> : null}
                        </td>
                        <td>
                          <div className="affiliate-row-actions">
                            {isMasterAdmin && (
                              <button
                                type="button"
                                className="wsb-refresh"
                                onClick={() =>
                                  setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                                }
                              >
                                {open ? 'Hide' : 'More'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="wsb-save"
                              disabled={saving || !dirty}
                              onClick={() => saveRow(s)}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="affiliate-expand-row">
                          <td colSpan={5}>
                            <div className="affiliate-edit-card affiliate-edit-card--inline">
                              <h3>
                                {s.storeCode} — {programSummary(draft, currency)}
                              </h3>
                              <div className="affiliate-edit-grid">
                                <label className="wl-field">
                                  <span>Friend signup bonus ({currency})</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={MAX_AMOUNT_SC}
                                    step="0.01"
                                    value={draft.friendSignupBonusSc}
                                    onChange={(e) =>
                                      updateDraft(key, { friendSignupBonusSc: e.target.value })
                                    }
                                    disabled={saving}
                                  />
                                </label>
                                {isClassic ? (
                                  <>
                                    <label className="wl-field">
                                      <span>Referrer commission (%)</span>
                                      <input
                                        type="number"
                                        min={0.01}
                                        max={100}
                                        step="0.01"
                                        value={draft.rewardPercentage}
                                        onChange={(e) =>
                                          updateDraft(key, { rewardPercentage: e.target.value })
                                        }
                                        disabled={saving}
                                      />
                                    </label>
                                    <label className="wl-field">
                                      <span>First N deposits</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        step="1"
                                        value={draft.maxRewardsPerReferral}
                                        onChange={(e) =>
                                          updateDraft(key, { maxRewardsPerReferral: e.target.value })
                                        }
                                        disabled={saving}
                                      />
                                    </label>
                                    <label className="wl-field">
                                      <span>Max SC from 1 deposit</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={MAX_AMOUNT_SC}
                                        step="0.01"
                                        value={draft.rewardMaxSc}
                                        onChange={(e) =>
                                          updateDraft(key, { rewardMaxSc: e.target.value })
                                        }
                                        disabled={saving}
                                      />
                                      <small>You never get more than this from one deposit. 0 = no max.</small>
                                    </label>
                                    <label className="wl-field">
                                      <span>Min friend deposit ($)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={draft.minQualifyingDepositUsd}
                                        onChange={(e) =>
                                          updateDraft(key, {
                                            minQualifyingDepositUsd: e.target.value
                                          })
                                        }
                                        disabled={saving}
                                      />
                                      <small>If they deposit less than this, you get 0. 0 = any amount is OK.</small>
                                    </label>
                                  </>
                                ) : (
                                  <>
                                    <label className="wl-field">
                                      <span>Referrer reward ({currency})</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={MAX_AMOUNT_SC}
                                        step="0.01"
                                        value={draft.referrerRewardSc}
                                        onChange={(e) =>
                                          updateDraft(key, { referrerRewardSc: e.target.value })
                                        }
                                        disabled={saving}
                                      />
                                    </label>
                                    <label className="wl-field">
                                      <span>Min qualifying deposit (USD)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={draft.minQualifyingDepositUsd}
                                        onChange={(e) =>
                                          updateDraft(key, {
                                            minQualifyingDepositUsd: e.target.value
                                          })
                                        }
                                        disabled={saving}
                                      />
                                    </label>
                                    <label className="wl-field">
                                      <span>Payout delay (hours after deposit)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={720}
                                        step="1"
                                        value={draft.payoutDelayHours}
                                        onChange={(e) =>
                                          updateDraft(key, { payoutDelayHours: e.target.value })
                                        }
                                        disabled={saving}
                                      />
                                    </label>
                                    <label className="wl-field">
                                      <span>Weekly cap for referrer ({currency})</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={MAX_AMOUNT_SC}
                                        step="0.01"
                                        value={draft.weeklyCapSc}
                                        onChange={(e) =>
                                          updateDraft(key, { weeklyCapSc: e.target.value })
                                        }
                                        disabled={saving}
                                      />
                                    </label>
                                  </>
                                )}
                              </div>
                              <p className="affiliate-edit-hint">
                                {isClassic
                                  ? 'Friend gets coins when they join. You get a slice only when they buy — and only for the first few buys.'
                                  : 'Friend gets coins when they join. You get your coins after they buy and play.'}
                              </p>
                              <div className="affiliate-edit-footer">
                                <button
                                  type="button"
                                  className="wsb-save"
                                  disabled={saving || !dirty}
                                  onClick={() => saveRow(s)}
                                >
                                  {saving ? 'Saving…' : `Save ${s.storeCode}`}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
