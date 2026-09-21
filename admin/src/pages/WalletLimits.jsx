import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAdminWalletLimits,
  updateAdminWalletLimits,
  getAdminStoreDailyWithdrawLimits,
  updateAdminStoreDailyWithdrawLimit,
  getAdminRedeemPercentage,
  getAdminStoreRedeemPercentages,
  updateAdminRedeemPercentage,
  resetAdminRedeemPercentage
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './WalletLimits.css'

function formatLimit(value, currency) {
  if (value == null || Number(value) <= 0) return 'Unlimited'
  return `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function WalletLimits() {
  const toast = useToast()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [loading, setLoading] = useState(true)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [savingDaily, setSavingDaily] = useState(false)
  const [savingStore, setSavingStore] = useState(false)

  const [currency, setCurrency] = useState('SC')
  const [meta, setMeta] = useState({ lastUpdatedBy: '', lastUpdatedAt: '' })

  const [platform, setPlatform] = useState({
    depositMin: 10,
    depositMax: 5000,
    withdrawMin: 10,
    withdrawMax: 50
  })
  const [platformDaily, setPlatformDaily] = useState('')

  const [storeDaily, setStoreDaily] = useState('')
  const [storeList, setStoreList] = useState([])
  const [platformDailyFromList, setPlatformDailyFromList] = useState(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [storeSearch, setStoreSearch] = useState('')
  const [storeDraftLimit, setStoreDraftLimit] = useState('')

  const [redeemPct, setRedeemPct] = useState('15')
  const [redeemPctMeta, setRedeemPctMeta] = useState({
    isStoreOverride: false,
    source: 'default',
    defaultPercentage: 15,
    platformPercentage: 15
  })
  const [savingRedeemPct, setSavingRedeemPct] = useState(false)

  const [redeemStoreList, setRedeemStoreList] = useState([])
  const [platformRedeemFromList, setPlatformRedeemFromList] = useState(15)
  const [selectedRedeemKey, setSelectedRedeemKey] = useState('')
  const [redeemStoreSearch, setRedeemStoreSearch] = useState('')
  const [storeRedeemDraft, setStoreRedeemDraft] = useState('')
  const [savingStoreRedeem, setSavingStoreRedeem] = useState(false)

  const selectedStore = useMemo(
    () => storeList.find((s) => `${s.distributorCode || ''}|${s.storeCode || ''}` === selectedKey) || null,
    [storeList, selectedKey]
  )

  const selectedRedeemStore = useMemo(
    () =>
      redeemStoreList.find(
        (s) => `${s.distributorCode || ''}|${s.storeCode || ''}` === selectedRedeemKey
      ) || null,
    [redeemStoreList, selectedRedeemKey]
  )

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return storeList
    return storeList.filter((s) => {
      const hay = `${s.storeCode || ''} ${s.username || ''} ${s.email || ''} ${s.distributorCode || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [storeList, storeSearch])

  const filteredRedeemStores = useMemo(() => {
    const q = redeemStoreSearch.trim().toLowerCase()
    if (!q) return redeemStoreList
    return redeemStoreList.filter((s) => {
      const hay = `${s.storeCode || ''} ${s.username || ''} ${s.email || ''} ${s.distributorCode || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [redeemStoreList, redeemStoreSearch])

  const loadPlatform = useCallback(async () => {
    const data = await getAdminWalletLimits()
    setCurrency(data?.currency || 'SC')
    setMeta({
      lastUpdatedBy: data?.lastUpdatedBy || '',
      lastUpdatedAt: data?.lastUpdatedAt || ''
    })
    setPlatform({
      depositMin: Number(data?.depositMin) >= 0 ? Number(data.depositMin) : 10,
      depositMax: Number(data?.depositMax) > 0 ? Number(data.depositMax) : 5000,
      withdrawMin: Number(data?.withdrawMin) >= 0 ? Number(data.withdrawMin) : 10,
      withdrawMax: Number(data?.withdrawMax) > 0 ? Number(data.withdrawMax) : 50
    })
    const daily =
      data?.dailyWithdrawMax != null && Number(data.dailyWithdrawMax) > 0
        ? Number(data.dailyWithdrawMax)
        : ''
    if (isStoreAdmin) {
      setStoreDaily(daily)
    } else {
      setPlatformDaily(daily)
    }
    return data
  }, [isStoreAdmin])

  const loadStoreList = useCallback(async () => {
    if (!isMaster) return null
    const data = await getAdminStoreDailyWithdrawLimits()
    setStoreList(Array.isArray(data?.stores) ? data.stores : [])
    setPlatformDailyFromList(
      data?.platformDailyWithdrawMax != null && Number(data.platformDailyWithdrawMax) > 0
        ? Number(data.platformDailyWithdrawMax)
        : null
    )
    if (data?.currency) setCurrency(data.currency)
    return data
  }, [isMaster])

  const applyRedeemPctResponse = useCallback((data) => {
    const pct = data?.percentage != null && Number.isFinite(Number(data.percentage))
      ? Number(data.percentage)
      : 15
    const platformPct =
      data?.platformPercentage != null && Number.isFinite(Number(data.platformPercentage))
        ? Number(data.platformPercentage)
        : (data?.defaultPercentage != null && Number.isFinite(Number(data.defaultPercentage))
          ? Number(data.defaultPercentage)
          : 15)
    setRedeemPct(String(pct))
    setRedeemPctMeta({
      isStoreOverride: Boolean(data?.isStoreOverride),
      source: data?.source || 'default',
      defaultPercentage:
        data?.defaultPercentage != null && Number.isFinite(Number(data.defaultPercentage))
          ? Number(data.defaultPercentage)
          : 15,
      platformPercentage: platformPct
    })
  }, [])

  const loadRedeemPct = useCallback(async () => {
    const data = await getAdminRedeemPercentage()
    applyRedeemPctResponse(data)
    return data
  }, [applyRedeemPctResponse])

  const loadRedeemStoreList = useCallback(async () => {
    if (!isMaster) return null
    const data = await getAdminStoreRedeemPercentages()
    setRedeemStoreList(Array.isArray(data?.stores) ? data.stores : [])
    setPlatformRedeemFromList(
      data?.platformPercentage != null && Number.isFinite(Number(data.platformPercentage))
        ? Number(data.platformPercentage)
        : 15
    )
    return data
  }, [isMaster])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    ;(async () => {
      try {
        await loadPlatform()
      } catch (err) {
        if (mounted) toast.error(err.message || 'Failed to load wallet limits.')
      }
      // Redeem settings are additive — failures must not block wallet limits UI.
      await Promise.all([
        loadStoreList().catch(() => null),
        loadRedeemPct().catch((err) => {
          if (mounted) toast.error(err.message || 'Failed to load redeem percentage.')
          return null
        }),
        loadRedeemStoreList().catch((err) => {
          if (mounted) toast.error(err.message || 'Failed to load store redeem percentages.')
          return null
        })
      ])
      if (mounted) setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [loadPlatform, loadStoreList, loadRedeemPct, loadRedeemStoreList, toast])

  async function saveRedeemPercentage(e) {
    e.preventDefault()
    const n = Number(redeemPct)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('Redeem percentage must be between 0 and 100.')
      return
    }
    setSavingRedeemPct(true)
    try {
      const updated = await updateAdminRedeemPercentage({ percentage: n })
      applyRedeemPctResponse(updated)
      if (isMaster) await loadRedeemStoreList()
      toast.success(
        isStoreAdmin
          ? 'Redeem win % saved for your store.'
          : 'Platform redeem win % saved.'
      )
    } catch (err) {
      toast.error(err.message || 'Failed to save redeem percentage.')
    } finally {
      setSavingRedeemPct(false)
    }
  }

  async function resetRedeemPercentage() {
    setSavingRedeemPct(true)
    try {
      const updated = await resetAdminRedeemPercentage()
      applyRedeemPctResponse(updated)
      toast.success('Redeem win % reset to platform default.')
    } catch (err) {
      toast.error(err.message || 'Failed to reset redeem percentage.')
    } finally {
      setSavingRedeemPct(false)
    }
  }

  async function saveSelectedStoreRedeem(e) {
    e.preventDefault()
    if (!selectedRedeemStore?.storeCode) {
      toast.error('Select a store first.')
      return
    }
    const n = Number(storeRedeemDraft)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('Redeem percentage must be between 0 and 100.')
      return
    }
    setSavingStoreRedeem(true)
    try {
      await updateAdminRedeemPercentage({
        percentage: n,
        distributorCode: selectedRedeemStore.distributorCode,
        storeCode: selectedRedeemStore.storeCode
      })
      await loadRedeemStoreList()
      toast.success(`Redeem win % for ${selectedRedeemStore.storeCode} set to ${n}%.`)
    } catch (err) {
      toast.error(err.message || 'Failed to save store redeem percentage.')
    } finally {
      setSavingStoreRedeem(false)
    }
  }

  async function clearSelectedStoreRedeem() {
    if (!selectedRedeemStore?.storeCode) return
    setSavingStoreRedeem(true)
    try {
      await resetAdminRedeemPercentage({
        distributorCode: selectedRedeemStore.distributorCode,
        storeCode: selectedRedeemStore.storeCode
      })
      await loadRedeemStoreList()
      toast.success(`${selectedRedeemStore.storeCode} now uses the platform default redeem %.`)
    } catch (err) {
      toast.error(err.message || 'Failed to clear store redeem override.')
    } finally {
      setSavingStoreRedeem(false)
    }
  }

  useEffect(() => {
    if (!selectedStore) {
      setStoreDraftLimit('')
      return
    }
    if (selectedStore.hasStoreOverride && selectedStore.storeDailyWithdrawMax != null) {
      setStoreDraftLimit(String(selectedStore.storeDailyWithdrawMax))
    } else if (selectedStore.hasStoreOverride) {
      setStoreDraftLimit('')
    } else {
      setStoreDraftLimit(
        selectedStore.effectiveDailyWithdrawMax != null
          ? String(selectedStore.effectiveDailyWithdrawMax)
          : ''
      )
    }
  }, [selectedStore])

  useEffect(() => {
    if (!selectedRedeemStore) {
      setStoreRedeemDraft('')
      return
    }
    setStoreRedeemDraft(
      selectedRedeemStore.effectivePercentage != null
        ? String(selectedRedeemStore.effectivePercentage)
        : String(platformRedeemFromList)
    )
  }, [selectedRedeemStore, platformRedeemFromList])

  async function savePlatformAmounts(e) {
    e.preventDefault()
    const payload = {
      depositMin: Math.max(0, Number(platform.depositMin) || 0),
      depositMax: Math.max(0, Number(platform.depositMax) || 0),
      withdrawMin: Math.max(0, Number(platform.withdrawMin) || 0),
      withdrawMax: Math.max(0, Number(platform.withdrawMax) || 0),
      dailyWithdrawMax:
        platformDaily === '' || platformDaily == null
          ? 0
          : Math.max(0, Number(platformDaily) || 0)
    }
    if (payload.depositMax < payload.depositMin) {
      toast.error('Deposit max must be ≥ deposit min.')
      return
    }
    if (payload.withdrawMax < payload.withdrawMin) {
      toast.error('Withdrawal max must be ≥ withdrawal min.')
      return
    }
    setSavingPlatform(true)
    try {
      const updated = await updateAdminWalletLimits(payload)
      setPlatform({
        depositMin: Number(updated?.depositMin) >= 0 ? Number(updated.depositMin) : payload.depositMin,
        depositMax: Number(updated?.depositMax) > 0 ? Number(updated.depositMax) : payload.depositMax,
        withdrawMin: Number(updated?.withdrawMin) >= 0 ? Number(updated.withdrawMin) : payload.withdrawMin,
        withdrawMax: Number(updated?.withdrawMax) > 0 ? Number(updated.withdrawMax) : payload.withdrawMax
      })
      setPlatformDaily(
        updated?.dailyWithdrawMax != null && Number(updated.dailyWithdrawMax) > 0
          ? Number(updated.dailyWithdrawMax)
          : ''
      )
      setMeta({
        lastUpdatedBy: updated?.lastUpdatedBy || meta.lastUpdatedBy || '',
        lastUpdatedAt: updated?.lastUpdatedAt || meta.lastUpdatedAt || ''
      })
      await loadStoreList()
      toast.success('Platform limits saved.')
    } catch (err) {
      toast.error(err.message || 'Failed to save platform limits.')
    } finally {
      setSavingPlatform(false)
    }
  }

  async function saveSelectedStoreLimit(e) {
    e.preventDefault()
    if (!selectedStore?.storeCode) {
      toast.error('Select a store first.')
      return
    }
    const dailyVal =
      storeDraftLimit === '' || storeDraftLimit == null
        ? 0
        : Math.max(0, Number(storeDraftLimit) || 0)
    setSavingStore(true)
    try {
      await updateAdminStoreDailyWithdrawLimit({
        distributorCode: selectedStore.distributorCode,
        storeCode: selectedStore.storeCode,
        dailyWithdrawMax: dailyVal
      })
      await loadStoreList()
      toast.success(
        dailyVal > 0
          ? `Daily limit for ${selectedStore.storeCode} set to ${currency} ${dailyVal}.`
          : `Daily limit for ${selectedStore.storeCode} set to unlimited.`
      )
    } catch (err) {
      toast.error(err.message || 'Failed to save store daily limit.')
    } finally {
      setSavingStore(false)
    }
  }

  async function clearSelectedStoreOverride() {
    if (!selectedStore?.storeCode) return
    setSavingStore(true)
    try {
      await updateAdminStoreDailyWithdrawLimit({
        distributorCode: selectedStore.distributorCode,
        storeCode: selectedStore.storeCode,
        usePlatformDefault: true
      })
      await loadStoreList()
      toast.success(`${selectedStore.storeCode} now uses the platform default daily limit.`)
    } catch (err) {
      toast.error(err.message || 'Failed to clear store override.')
    } finally {
      setSavingStore(false)
    }
  }

  const lastUpdatedText = meta.lastUpdatedAt ? new Date(meta.lastUpdatedAt).toLocaleString() : ''

  if (loading) {
    return (
      <div className="wallet-limits-page">
        <header className="wallet-limits-header">
          <h1>Wallet Limits</h1>
        </header>
        <p className="wallet-limits-loading">Loading limits…</p>
      </div>
    )
  }

  /* ——— Store admin: full wallet limits for this store only ——— */
  if (isStoreAdmin) {
    return (
      <div className="wallet-limits-page">
        <header className="wallet-limits-header">
          <h1>Wallet Limits</h1>
          <p>
            Set deposit and withdrawal rules for players in <strong>your store only</strong>.
            Other stores are not affected. Currency: <strong>{currency}</strong>.
          </p>
        </header>

        <form
          className="wl-card"
          onSubmit={async (e) => {
            e.preventDefault()
            const payload = {
              withdrawMin: Math.max(0, Number(platform.withdrawMin) || 0),
              withdrawMax: Math.max(0, Number(platform.withdrawMax) || 0)
            }
            if (payload.withdrawMax < payload.withdrawMin) {
              toast.error('Withdrawal max must be ≥ withdrawal min.')
              return
            }
            // Blank = unlimited for this store. Explicit value = store override.
            // Daily 0 is unlimited (store override), not "inherit platform".
            const dailyRaw = storeDaily
            const hasDailyValue = dailyRaw !== '' && dailyRaw != null
            if (hasDailyValue) {
              payload.dailyWithdrawMax = Math.max(0, Number(dailyRaw) || 0)
              if (payload.dailyWithdrawMax > 0 && payload.dailyWithdrawMax < payload.withdrawMin) {
                toast.error('Daily withdrawal limit should be ≥ minimum withdrawal per request (or leave blank for unlimited).')
                return
              }
            } else {
              // Blank field: set unlimited store override so behavior is explicit
              payload.dailyWithdrawMax = 0
            }
            setSavingDaily(true)
            try {
              const updated = await updateAdminWalletLimits(payload)
              setPlatform({
                depositMin: Number(updated?.depositMin) >= 0 ? Number(updated.depositMin) : platform.depositMin,
                depositMax: Number(updated?.depositMax) > 0 ? Number(updated.depositMax) : platform.depositMax,
                withdrawMin: Number(updated?.withdrawMin) >= 0 ? Number(updated.withdrawMin) : payload.withdrawMin,
                withdrawMax: Number(updated?.withdrawMax) > 0 ? Number(updated.withdrawMax) : payload.withdrawMax
              })
              setStoreDaily(
                updated?.dailyWithdrawMax != null && Number(updated.dailyWithdrawMax) > 0
                  ? Number(updated.dailyWithdrawMax)
                  : ''
              )
              setMeta({
                lastUpdatedBy: updated?.lastUpdatedBy || '',
                lastUpdatedAt: updated?.lastUpdatedAt || ''
              })
              toast.success('Wallet limits saved for your store.')
            } catch (err) {
              toast.error(err.message || 'Failed to save wallet limits.')
            } finally {
              setSavingDaily(false)
            }
          }}
        >
          <div className="wl-card-head">
            <span className="wl-badge wl-badge--store">Your store</span>
            <h2>Deposit &amp; withdrawal limits</h2>
            <p>
              Deposit min/max follow the <strong>platform-wide</strong> setting for every store.
              You can set withdrawal limits and daily cap for your store only.
            </p>
          </div>

          <div className="wl-subsection">
            <h3>Deposit (per request) · platform-wide</h3>
            <div className="wl-grid-2">
              <label className="wl-field">
                <span>Minimum deposit</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={platform.depositMin}
                  disabled
                  readOnly
                />
              </label>
              <label className="wl-field">
                <span>Maximum deposit</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={platform.depositMax}
                  disabled
                  readOnly
                />
              </label>
            </div>
            <p className="wl-subsection-desc">Managed by master admin. Changes apply to all stores automatically.</p>
          </div>

          <div className="wl-subsection">
            <h3>Withdrawal (per request)</h3>
            <div className="wl-grid-2">
              <label className="wl-field">
                <span>Minimum withdrawal</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={platform.withdrawMin}
                  onChange={(e) => setPlatform((p) => ({ ...p, withdrawMin: e.target.value }))}
                />
              </label>
              <label className="wl-field">
                <span>Maximum withdrawal</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={platform.withdrawMax}
                  onChange={(e) => setPlatform((p) => ({ ...p, withdrawMax: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="wl-subsection wl-subsection--highlight">
            <h3>Daily withdrawal limit (per user)</h3>
            <p className="wl-subsection-desc">
              Maximum total a player can request to withdraw per calendar day (UTC).
              Pending and completed requests count. Leave blank or enter <strong>0</strong> for
              <strong> unlimited</strong> on this store (overrides any platform daily default).
            </p>
            <div className="wl-field-row">
              <label className="wl-field">
                <span>Daily limit ({currency})</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0 = unlimited"
                  value={storeDaily}
                  onChange={(e) => setStoreDaily(e.target.value)}
                />
              </label>
              <div className="wl-hint-box">
                <strong>Current:</strong> {formatLimit(storeDaily === '' ? null : storeDaily, currency)}
              </div>
            </div>
            <div className="wl-actions wl-actions--split" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="wl-btn-secondary"
                disabled={savingDaily}
                onClick={async () => {
                  setSavingDaily(true)
                  try {
                    const updated = await updateAdminWalletLimits({
                      withdrawMin: Math.max(0, Number(platform.withdrawMin) || 0),
                      withdrawMax: Math.max(0, Number(platform.withdrawMax) || 0),
                      usePlatformDefault: true,
                      clearOverride: true
                    })
                    setPlatform({
                      depositMin: Number(updated?.depositMin) >= 0 ? Number(updated.depositMin) : platform.depositMin,
                      depositMax: Number(updated?.depositMax) > 0 ? Number(updated.depositMax) : platform.depositMax,
                      withdrawMin: Number(updated?.withdrawMin) >= 0 ? Number(updated.withdrawMin) : platform.withdrawMin,
                      withdrawMax: Number(updated?.withdrawMax) > 0 ? Number(updated.withdrawMax) : platform.withdrawMax
                    })
                    setStoreDaily(
                      updated?.dailyWithdrawMax != null && Number(updated.dailyWithdrawMax) > 0
                        ? Number(updated.dailyWithdrawMax)
                        : ''
                    )
                    setMeta({
                      lastUpdatedBy: updated?.lastUpdatedBy || '',
                      lastUpdatedAt: updated?.lastUpdatedAt || ''
                    })
                    toast.success('Daily limit now follows the platform default for your store.')
                  } catch (err) {
                    toast.error(err.message || 'Failed to reset daily limit.')
                  } finally {
                    setSavingDaily(false)
                  }
                }}
              >
                Use platform daily default
              </button>
            </div>
          </div>

          <div className="wl-actions">
            <button type="submit" disabled={savingDaily}>
              {savingDaily ? 'Saving…' : 'Save limits'}
            </button>
          </div>
          {lastUpdatedText && (
            <p className="wl-meta">Last updated by {meta.lastUpdatedBy || 'N/A'} on {lastUpdatedText}</p>
          )}
        </form>

        <form className="wl-card" onSubmit={saveRedeemPercentage}>
          <div className="wl-card-head">
            <span className="wl-badge wl-badge--store">Your store</span>
            <h2>Game redeem win requirement</h2>
            <p>
              Players need game balance of at least <strong>last top-up + this %</strong> before they can redeem
              from a game. Example: last top-up 100 SC at 15% → need 115 SC in the game.
            </p>
          </div>
          <div className="wl-field-row">
            <label className="wl-field">
              <span>Win percentage (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={redeemPct}
                onChange={(e) => setRedeemPct(e.target.value)}
              />
            </label>
            <div className="wl-hint-box">
              <strong>Source:</strong>{' '}
              {redeemPctMeta.isStoreOverride
                ? 'Store override'
                : redeemPctMeta.source === 'global'
                  ? 'Platform default'
                  : redeemPctMeta.source === 'distributor'
                    ? 'Distributor default'
                    : 'Built-in default'}
              {' · '}
              Platform default: {redeemPctMeta.platformPercentage ?? redeemPctMeta.defaultPercentage}%
            </div>
          </div>
          <div className="wl-actions wl-actions--split">
            <button
              type="button"
              className="wl-btn-secondary"
              disabled={!redeemPctMeta.isStoreOverride || savingRedeemPct}
              onClick={resetRedeemPercentage}
            >
              Use platform default
            </button>
            <button type="submit" disabled={savingRedeemPct}>
              {savingRedeemPct ? 'Saving…' : 'Save redeem %'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  /* ——— Super admin / technical staff ——— */
  return (
    <div className="wallet-limits-page">
      <header className="wallet-limits-header">
        <h1>Wallet Limits</h1>
        <p>
          Control how much players can deposit and withdraw. Use section 3 to set a daily
          withdrawal cap for a <strong>specific store</strong> (e.g. DragonFury = 500).
          Currency: <strong>{currency}</strong>.
        </p>
      </header>

      <div className="wl-guide">
        <div className="wl-guide-item">
          <span className="wl-guide-num">1</span>
          <div>
            <strong>Per request</strong>
            <p>Min / max for a single deposit or withdrawal</p>
          </div>
        </div>
        <div className="wl-guide-item">
          <span className="wl-guide-num">2</span>
          <div>
            <strong>Platform daily default</strong>
            <p>Fallback when a store has no own daily limit</p>
          </div>
        </div>
        <div className="wl-guide-item">
          <span className="wl-guide-num">3</span>
          <div>
            <strong>Per-store daily limit</strong>
            <p>Override for one store only — other stores stay unchanged</p>
          </div>
        </div>
      </div>

      <form className="wl-card" onSubmit={savePlatformAmounts}>
        <div className="wl-card-head">
          <span className="wl-badge">Section 1 &amp; 2 · Platform</span>
          <h2>Platform-wide rules</h2>
          <p>
            Deposit min/max apply to <strong>all stores</strong>. Withdrawal per-request limits apply
            platform-wide unless a store sets its own. Daily withdrawal can also be overridden per store below.
          </p>
        </div>

        <div className="wl-subsection">
          <h3>Deposit (per request)</h3>
          <div className="wl-grid-2">
            <label className="wl-field">
              <span>Minimum deposit</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={platform.depositMin}
                onChange={(e) => setPlatform((p) => ({ ...p, depositMin: e.target.value }))}
              />
            </label>
            <label className="wl-field">
              <span>Maximum deposit</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={platform.depositMax}
                onChange={(e) => setPlatform((p) => ({ ...p, depositMax: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="wl-subsection">
          <h3>Withdrawal (per request)</h3>
          <div className="wl-grid-2">
            <label className="wl-field">
              <span>Minimum withdrawal</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={platform.withdrawMin}
                onChange={(e) => setPlatform((p) => ({ ...p, withdrawMin: e.target.value }))}
              />
            </label>
            <label className="wl-field">
              <span>Maximum withdrawal</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={platform.withdrawMax}
                onChange={(e) => setPlatform((p) => ({ ...p, withdrawMax: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="wl-subsection wl-subsection--highlight">
          <h3>Platform daily withdrawal default (per user)</h3>
          <p className="wl-subsection-desc">
            Used when a store has <em>not</em> set its own daily limit. Enter <strong>0</strong> or leave blank for unlimited.
          </p>
          <div className="wl-field-row">
            <label className="wl-field">
              <span>Daily limit ({currency})</span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0 = unlimited"
                value={platformDaily}
                onChange={(e) => setPlatformDaily(e.target.value)}
              />
            </label>
            <div className="wl-hint-box">
              <strong>Default:</strong>{' '}
              {formatLimit(platformDaily === '' ? null : platformDaily, currency)}
            </div>
          </div>
        </div>

        <div className="wl-actions">
          <button type="submit" disabled={savingPlatform}>
            {savingPlatform ? 'Saving…' : 'Save platform limits'}
          </button>
        </div>
        {lastUpdatedText && (
          <p className="wl-meta">Last updated by {meta.lastUpdatedBy || 'N/A'} on {lastUpdatedText}</p>
        )}
      </form>

      <form className="wl-card" onSubmit={saveRedeemPercentage}>
        <div className="wl-card-head">
          <span className="wl-badge">Platform</span>
          <h2>Game redeem win requirement</h2>
          <p>
            Platform default for all stores. Players need game balance ≥ last top-up + this % to redeem.
            Use the section below to view or override a specific store.
          </p>
        </div>
        <div className="wl-field-row">
          <label className="wl-field">
            <span>Win percentage (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={redeemPct}
              onChange={(e) => setRedeemPct(e.target.value)}
            />
          </label>
          <div className="wl-hint-box">
            <strong>Applies as:</strong> platform default for stores without an override
          </div>
        </div>
        <div className="wl-actions">
          <button type="submit" disabled={savingRedeemPct}>
            {savingRedeemPct ? 'Saving…' : 'Save platform redeem %'}
          </button>
        </div>
      </form>

      <form className="wl-card wl-card--accent" onSubmit={saveSelectedStoreRedeem}>
        <div className="wl-card-head">
          <span className="wl-badge wl-badge--store">Per store · Redeem win %</span>
          <h2>Set game redeem win requirement for a store</h2>
          <p>
            Pick a store (e.g. dragonfury), set its redeem win %, then save.
            Only that store’s players are affected.
          </p>
        </div>

        <div className="wl-grid-2">
          <label className="wl-field">
            <span>Search stores</span>
            <input
              type="search"
              placeholder="Store code, username, or email…"
              value={redeemStoreSearch}
              onChange={(e) => setRedeemStoreSearch(e.target.value)}
            />
          </label>
          <label className="wl-field">
            <span>Select store</span>
            <select
              value={selectedRedeemKey}
              onChange={(e) => setSelectedRedeemKey(e.target.value)}
            >
              <option value="">Choose a store…</option>
              {filteredRedeemStores.map((s) => {
                const key = `${s.distributorCode || ''}|${s.storeCode || ''}`
                const label = `${s.storeCode || '—'}${s.username ? ` (${s.username})` : ''}`
                return (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              })}
            </select>
          </label>
        </div>

        {selectedRedeemStore && (
          <div className="wl-store-status">
            <div>
              <span className="wl-status-label">Store</span>
              <strong>{selectedRedeemStore.storeCode}</strong>
              {selectedRedeemStore.distributorCode ? (
                <span className="wl-muted"> · dist {selectedRedeemStore.distributorCode}</span>
              ) : null}
            </div>
            <div>
              <span className="wl-status-label">Effective redeem win %</span>
              <strong>{selectedRedeemStore.effectivePercentage}%</strong>
              <span
                className={`wl-pill ${
                  selectedRedeemStore.hasStoreOverride ? 'wl-pill--override' : 'wl-pill--default'
                }`}
              >
                {selectedRedeemStore.hasStoreOverride ? 'Store override' : 'Platform default'}
              </span>
            </div>
            {!selectedRedeemStore.hasStoreOverride && (
              <p className="wl-muted wl-store-status-note">
                Platform default is {platformRedeemFromList}%. Saving below creates a store-specific override.
              </p>
            )}
          </div>
        )}

        <div className="wl-field-row">
          <label className="wl-field">
            <span>Redeem win % for selected store</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="e.g. 15"
              value={storeRedeemDraft}
              onChange={(e) => setStoreRedeemDraft(e.target.value)}
              disabled={!selectedRedeemStore}
            />
          </label>
        </div>

        <div className="wl-actions wl-actions--split">
          <button
            type="button"
            className="wl-btn-secondary"
            disabled={
              !selectedRedeemStore || !selectedRedeemStore.hasStoreOverride || savingStoreRedeem
            }
            onClick={clearSelectedStoreRedeem}
          >
            Use platform default
          </button>
          <button type="submit" disabled={!selectedRedeemStore || savingStoreRedeem}>
            {savingStoreRedeem ? 'Saving…' : 'Save store redeem %'}
          </button>
        </div>
      </form>

      {redeemStoreList.length > 0 && (
        <section className="wl-card">
          <div className="wl-card-head">
            <h2>Store redeem win % overview</h2>
            <p>All stores and their effective game redeem requirement. Click a row to edit above.</p>
          </div>
          <div className="wl-table-wrap">
            <table className="wl-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Distributor</th>
                  <th>Effective win %</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {redeemStoreList.map((s) => {
                  const key = `${s.distributorCode || ''}|${s.storeCode || ''}`
                  return (
                    <tr
                      key={key}
                      className={selectedRedeemKey === key ? 'is-selected' : ''}
                      onClick={() => setSelectedRedeemKey(key)}
                    >
                      <td>
                        <strong>{s.storeCode || '—'}</strong>
                        {s.username ? <span className="wl-muted"> · {s.username}</span> : null}
                      </td>
                      <td>{s.distributorCode || '—'}</td>
                      <td>{s.effectivePercentage}%</td>
                      <td>
                        <span
                          className={`wl-pill ${
                            s.hasStoreOverride ? 'wl-pill--override' : 'wl-pill--default'
                          }`}
                        >
                          {s.hasStoreOverride ? 'Override' : 'Default'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <form className="wl-card wl-card--accent" onSubmit={saveSelectedStoreLimit}>
        <div className="wl-card-head">
          <span className="wl-badge wl-badge--store">Section 3 · Per store</span>
          <h2>Set daily withdrawal limit for a particular store</h2>
          <p>
            Pick a store (e.g. dragonfury), set the daily limit for its players, then save.
            Only that store’s users are affected.
          </p>
        </div>

        <div className="wl-grid-2">
          <label className="wl-field">
            <span>Search stores</span>
            <input
              type="search"
              placeholder="Store code, username, or email…"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
            />
          </label>
          <label className="wl-field">
            <span>Select store</span>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              <option value="">Choose a store…</option>
              {filteredStores.map((s) => {
                const key = `${s.distributorCode || ''}|${s.storeCode || ''}`
                const label = `${s.storeCode || '—'}${s.username ? ` (${s.username})` : ''}`
                return (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              })}
            </select>
          </label>
        </div>

        {selectedStore && (
          <div className="wl-store-status">
            <div>
              <span className="wl-status-label">Store</span>
              <strong>{selectedStore.storeCode}</strong>
              {selectedStore.distributorCode ? (
                <span className="wl-muted"> · dist {selectedStore.distributorCode}</span>
              ) : null}
            </div>
            <div>
              <span className="wl-status-label">Effective daily limit</span>
              <strong>{formatLimit(selectedStore.effectiveDailyWithdrawMax, currency)}</strong>
              <span className={`wl-pill ${selectedStore.hasStoreOverride ? 'wl-pill--override' : 'wl-pill--default'}`}>
                {selectedStore.hasStoreOverride ? 'Store override' : 'Platform default'}
              </span>
            </div>
            {!selectedStore.hasStoreOverride && (
              <p className="wl-muted wl-store-status-note">
                Platform default is {formatLimit(platformDailyFromList, currency)}. Saving below creates a store-specific override.
              </p>
            )}
          </div>
        )}

        <div className="wl-field-row">
          <label className="wl-field">
            <span>Daily limit for selected store ({currency})</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0 = unlimited for this store"
              value={storeDraftLimit}
              onChange={(e) => setStoreDraftLimit(e.target.value)}
              disabled={!selectedStore}
            />
          </label>
        </div>

        <div className="wl-actions wl-actions--split">
          <button
            type="button"
            className="wl-btn-secondary"
            disabled={!selectedStore || !selectedStore.hasStoreOverride || savingStore}
            onClick={clearSelectedStoreOverride}
          >
            Use platform default
          </button>
          <button type="submit" disabled={!selectedStore || savingStore}>
            {savingStore ? 'Saving…' : 'Save store daily limit'}
          </button>
        </div>
      </form>

      {storeList.length > 0 && (
        <section className="wl-card">
          <div className="wl-card-head">
            <h2>Store daily limits overview</h2>
            <p>Quick view of overrides. Click a row to edit in the section above.</p>
          </div>
          <div className="wl-table-wrap">
            <table className="wl-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Distributor</th>
                  <th>Effective daily limit</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {storeList.map((s) => {
                  const key = `${s.distributorCode || ''}|${s.storeCode || ''}`
                  return (
                    <tr
                      key={key}
                      className={selectedKey === key ? 'is-selected' : ''}
                      onClick={() => setSelectedKey(key)}
                    >
                      <td>
                        <strong>{s.storeCode || '—'}</strong>
                        {s.username ? <span className="wl-muted"> · {s.username}</span> : null}
                      </td>
                      <td>{s.distributorCode || '—'}</td>
                      <td>{formatLimit(s.effectiveDailyWithdrawMax, currency)}</td>
                      <td>
                        <span className={`wl-pill ${s.hasStoreOverride ? 'wl-pill--override' : 'wl-pill--default'}`}>
                          {s.hasStoreOverride ? 'Override' : 'Default'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
