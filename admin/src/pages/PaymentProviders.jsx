import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getStorePaymentProviders,
  updateStorePaymentProvider,
  updateStorePaymentBestDeals,
  getStores
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './PaymentProviders.css'

const PROVIDER_LABELS = {
  scrypto: 'Crypto (Speed)',
  selfcrypto: 'Crypto (Direct)',
  orionstarspay: 'Orionstars Pay',
  dollarpay: 'Dpay — Automatic',
  xxpay: 'Xpay — Automatic',
  manual: 'Manual — Staff pays by hand'
}

/** Deposit dropdown labels (same Automatic wording for Xpay as withdraw). */
const PROVIDER_LABELS_DEPOSIT = {
  ...PROVIDER_LABELS
}

const PROVIDER_MODE = {
  manual: { key: 'manual', label: 'Manual', hint: 'Staff approves and pays outside the system' },
  dollarpay: { key: 'auto', label: 'Automatic', hint: 'Dpay pays automatically after approve' },
  xxpay: { key: 'auto', label: 'Automatic', hint: 'Admin approves, then Xpay pays out via API' },
  orionstarspay: { key: 'auto', label: 'Automatic', hint: 'Orionstars Pay API' },
  scrypto: { key: 'auto', label: 'Automatic', hint: 'Speed crypto processor' },
  selfcrypto: { key: 'auto', label: 'Direct', hint: 'Self-hosted BTC / ETH / TRX / SOL / Lightning' }
}

const PROVIDER_MODE_DEPOSIT = {
  ...PROVIDER_MODE,
  xxpay: { key: 'auto', label: 'Automatic', hint: 'Xpay cashier; status via webhook' }
}

/** Fixed product matrix — which providers can serve each method.
 * XXPay (allowlisted stores): Cash App + Chime; Card pay-in; PayPal payout.
 * Apple Pay / Google Pay on XXPay: deposit only for dragonfury / myvepower / goodgdragon / goodwork.
 */
const METHOD_MATRIX = {
  deposit: [
    { key: 'card', label: 'Credit/Debit Card', providers: ['orionstarspay', 'dollarpay', 'xxpay'] },
    { key: 'cashapp', label: 'Cash App', providers: ['orionstarspay', 'dollarpay', 'xxpay'] },
    { key: 'apple_pay', label: 'Apple Pay', providers: ['orionstarspay', 'dollarpay', 'xxpay'] },
    { key: 'google_pay', label: 'Google Pay', providers: ['orionstarspay', 'dollarpay', 'xxpay'] },
    { key: 'chime', label: 'Chime', providers: ['manual', 'xxpay'] },
    { key: 'crypto', label: 'Crypto (Speed)', providers: ['scrypto'] },
    { key: 'crypto_direct', methodFlag: 'crypto', label: 'Crypto (Direct)', providers: ['selfcrypto'] }
  ],
  withdraw: [
    { key: 'card', label: 'Card', providers: ['orionstarspay'] },
    { key: 'cashapp', label: 'Cash App', providers: ['manual', 'dollarpay', 'xxpay'] },
    { key: 'chime', label: 'Chime', providers: ['manual', 'dollarpay', 'xxpay'] },
    { key: 'paypal', label: 'PayPal', providers: ['dollarpay', 'xxpay'] },
    { key: 'crypto', label: 'Crypto', providers: ['scrypto'] }
  ]
}

/** Keep in sync with backend xxpay.storeAccess.js — XXPay admin toggles only for these stores. */
const XXPAY_ALLOWED_STORE_CODES = new Set([
  'sweepstakebet',
  'dragonfury',
  'myvepower',
  'goodgdragon',
  'casinoslots',
  'goodwork',
  'winners4'
])

function storeAllowsXxpay(storeCode) {
  return XXPAY_ALLOWED_STORE_CODES.has(String(storeCode || '').trim().toLowerCase())
}

/** Keep in sync with backend xxpay.storeAccess.js XXPAY_APPLE_GOOGLE_STORE_CODES. lucky winners = goodwork. */
const XXPAY_APPLE_GOOGLE_STORE_CODES = new Set([
  'dragonfury',
  'myvepower',
  'goodgdragon',
  'goodwork'
])

function storeAllowsXxpayAppleGooglePay(storeCode) {
  return XXPAY_APPLE_GOOGLE_STORE_CODES.has(String(storeCode || '').trim().toLowerCase())
}

function providerLabel(code, name, direction = 'withdraw') {
  const c = (code || '').toLowerCase()
  const map = direction === 'deposit' ? PROVIDER_LABELS_DEPOSIT : PROVIDER_LABELS
  return map[c] || name || code || '—'
}

function providerMode(code, direction = 'withdraw') {
  const c = (code || '').toLowerCase()
  const map = direction === 'deposit' ? PROVIDER_MODE_DEPOSIT : PROVIDER_MODE
  return map[c] || { key: 'other', label: 'Provider', hint: '' }
}

function hasExactDeal(methods, key) {
  const want = String(key || '').trim().toLowerCase()
  if (!want) return false
  return (Array.isArray(methods) ? methods : []).some(
    (item) => String(item || '').trim().toLowerCase() === want
  )
}

function Switch({ checked, disabled, onChange, id, className = '' }) {
  return (
    <button
      type="button"
      id={id}
      className={`pp-switch${checked ? ' pp-switch--on' : ''}${className ? ` ${className}` : ''}`}
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      disabled={!!disabled}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (disabled) return
        onChange(!checked)
      }}
    >
      <span className="pp-switch__slider" />
    </button>
  )
}

/**
 * Build method rows from the product matrix + live provider list from API.
 * Dropdown lists every allowed provider for that method (not only the active one).
 * XXPay is omitted unless the selected store is allowlisted.
 * Apple Pay / Google Pay on XXPay appear only for dragonfury / myvepower / goodgdragon / goodwork.
 */
function buildMethodRows(list, direction, storeCode = '') {
  const byCode = new Map((list || []).map((p) => [(p.code || '').toLowerCase(), p]))
  const matrix = METHOD_MATRIX[direction] || []
  const allowXxpay = storeAllowsXxpay(storeCode)
  const allowXxpayAppleGoogle = storeAllowsXxpayAppleGooglePay(storeCode)

  return matrix
    .map((def) => {
      const candidates = def.providers
        .filter((code) => {
          if (code !== 'xxpay') return true
          if (!allowXxpay) return false
          if (def.key === 'apple_pay' || def.key === 'google_pay') return allowXxpayAppleGoogle
          return true
        })
        .map((code) => {
          const p = byCode.get(code)
          if (!p) return null
          const masterOk =
            direction === 'deposit'
              ? p.masterDepositEnabled !== false
              : p.masterWithdrawEnabled !== false
          if (!masterOk) return null
          return {
            code,
            name: providerLabel(code, p.name, direction),
            storeOn:
              direction === 'deposit'
                ? p.storeEnabled !== false && p.storeDepositEnabled !== false
                : p.storeEnabled !== false && p.storeWithdrawEnabled !== false,
            methodOn: (() => {
              const flag = def.methodFlag || def.key
              if (direction === 'deposit') {
                if (
                  code === 'xxpay' &&
                  (def.key === 'apple_pay' || def.key === 'google_pay' || def.key === 'card')
                ) {
                  return p.depositMethodsEnabled?.[flag] === true
                }
                return p.depositMethodsEnabled?.[flag] !== false
              }
              if (direction === 'withdraw' && code === 'xxpay' && def.key === 'paypal') {
                return p.withdrawMethodsEnabled?.[flag] === true
              }
              return p.withdrawMethodsEnabled?.[flag] !== false
            })()
          }
        })
        .filter(Boolean)

      if (candidates.length === 0) return null

      const activeOnes = candidates.filter((c) => c.storeOn && c.methodOn)
      // Prefer XXPay, then DollarPay when multiple accidentally ON (matches user API ranking).
      const active =
        activeOnes.find((c) => c.code === 'xxpay') ||
        activeOnes.find((c) => c.code === 'dollarpay') ||
        activeOnes[0] ||
        null
      return {
        key: def.key,
        methodFlag: def.methodFlag || def.key,
        label: def.label,
        direction,
        providers: candidates,
        selectedCode: active?.code || candidates[0].code,
        enabled: Boolean(active)
      }
    })
    .filter(Boolean)
}

export default function PaymentProviders() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [list, setList] = useState([])
  const [bestDealMethods, setBestDealMethods] = useState(['cashapp'])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState(null)
  const [stores, setStores] = useState([])
  const [selectedKey, setSelectedKey] = useState('')

  const selectedStore = useMemo(() => {
    if (!isMasterAdmin) return null
    return stores.find((s) => `${s.distributorCode || ''}|${s.storeCode || ''}` === selectedKey) || null
  }, [isMasterAdmin, stores, selectedKey])

  const storeContext = useMemo(() => {
    if (!isMasterAdmin) return {}
    if (!selectedStore?.storeCode) return null
    return {
      distributorCode: selectedStore.distributorCode,
      storeCode: selectedStore.storeCode
    }
  }, [isMasterAdmin, selectedStore])

  const loadStores = useCallback(async () => {
    if (!isMasterAdmin) return
    try {
      const res = await getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      const rows = Array.isArray(res?.list) ? res.list : Array.isArray(res?.data) ? res.data : []
      setStores(rows)
      setSelectedKey((prev) => {
        if (prev) return prev
        if (rows[0]?.storeCode) return `${rows[0].distributorCode || ''}|${rows[0].storeCode || ''}`
        return ''
      })
    } catch (err) {
      toast.error(err.message || 'Failed to load stores')
      setStores([])
    }
  }, [isMasterAdmin, toast])

  const load = useCallback(async () => {
    if (isMasterAdmin && !storeContext) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getStorePaymentProviders(storeContext || {})
      setList(data.list || [])
      setBestDealMethods(
        Array.isArray(data.depositBestDealMethods) ? data.depositBestDealMethods.map(String) : ['cashapp']
      )
    } catch (err) {
      toast.error(err.message || 'Failed to load payment settings')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [isMasterAdmin, storeContext, toast])

  useEffect(() => {
    if (!user) return
    if (isMasterAdmin) loadStores()
  }, [user, isMasterAdmin, loadStores])

  useEffect(() => {
    if (!user) return
    load()
  }, [user, load])

  const depositRows = useMemo(
    () => buildMethodRows(list, 'deposit', selectedStore?.storeCode || user?.storeCode || ''),
    [list, selectedStore?.storeCode, user?.storeCode]
  )
  const withdrawRows = useMemo(
    () => buildMethodRows(list, 'withdraw', selectedStore?.storeCode || user?.storeCode || ''),
    [list, selectedStore?.storeCode, user?.storeCode]
  )

  async function applyMethodChoice(row, nextCode, nextEnabled) {
    const saveId = `${row.direction}:${row.key}`
    setSavingKey(saveId)
    const methodKey = row.methodFlag || row.key
    const chosen = (nextCode || row.selectedCode || '').toLowerCase()

    try {
      // Exclusive: only the chosen provider has this method ON; others OFF.
      for (const cand of row.providers) {
        const provider = list.find((p) => (p.code || '').toLowerCase() === cand.code)
        if (!provider) continue

        const isChosen = cand.code === chosen
        const wantOn = nextEnabled && isChosen

        // Seed from master map when store map is empty so saves persist real flags.
        const seedDeposit =
          Object.keys(provider.depositMethodsEnabled || {}).length > 0
            ? provider.depositMethodsEnabled
            : provider.masterDepositMethodsEnabled || {}
        const seedWithdraw =
          Object.keys(provider.withdrawMethodsEnabled || {}).length > 0
            ? provider.withdrawMethodsEnabled
            : provider.masterWithdrawMethodsEnabled || {}

        const depositMap = { ...seedDeposit }
        const withdrawMap = { ...seedWithdraw }
        if (row.direction === 'deposit') depositMap[methodKey] = wantOn
        else withdrawMap[methodKey] = wantOn

        const payload = {
          enabled: wantOn ? true : provider.storeEnabled !== false,
          ...(row.direction === 'deposit'
            ? {
                depositEnabled: wantOn ? true : provider.storeDepositEnabled !== false,
                depositMethodsEnabled: depositMap
              }
            : {
                withdrawEnabled: wantOn ? true : provider.storeWithdrawEnabled !== false,
                withdrawMethodsEnabled: withdrawMap
              })
        }

        if (wantOn) {
          payload.enabled = true
          if (row.direction === 'deposit') payload.depositEnabled = true
          else payload.withdrawEnabled = true
        }

        await updateStorePaymentProvider(provider.code, payload, storeContext || {})
      }

      await load()
      toast.success(
        nextEnabled
          ? `${row.label} now uses ${providerLabel(chosen, null, row.direction)}.`
          : `${row.label} turned off.`
      )
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSavingKey(null)
    }
  }

  async function toggleBestDeal(label, methodKey, nextEnabled) {
    const saveId = `bestdeal:${methodKey}`
    setSavingKey(saveId)
    try {
      const data = await updateStorePaymentBestDeals(methodKey, nextEnabled, storeContext || {})
      setBestDealMethods(
        Array.isArray(data.depositBestDealMethods) ? data.depositBestDealMethods.map(String) : []
      )
      toast.success(
        nextEnabled
          ? `BEST DEALS label added to ${label}.`
          : `BEST DEALS label removed from ${label}.`
      )
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSavingKey(null)
    }
  }

  async function toggleCryptoRail(row, rail, nextEnabled) {
    const saveId = `${row.direction}:${row.key}:${rail.key}`
    setSavingKey(saveId)
    const provider = list.find((p) => (p.code || '').toLowerCase() === (row.selectedCode || '').toLowerCase())
    if (!provider) {
      setSavingKey(null)
      return
    }
    const seed =
      Object.keys(provider.depositMethodsEnabled || {}).length > 0
        ? { ...provider.depositMethodsEnabled }
        : { ...(provider.masterDepositMethodsEnabled || {}) }
    seed[rail.key] = nextEnabled
    seed.crypto = true
    try {
      await updateStorePaymentProvider(
        provider.code,
        {
          enabled: true,
          depositEnabled: true,
          depositMethodsEnabled: seed
        },
        storeContext || {}
      )
      await load()
      toast.success(`${rail.label} ${nextEnabled ? 'turned on' : 'turned off'}.`)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSavingKey(null)
    }
  }

  function renderSection(title, help, rows, { showBestDeals = false } = {}) {
    return (
      <section className="pp-section">
        <h2 className="pp-section__title">{title}</h2>
        <p className="pp-section__help">{help}</p>
        {rows.length === 0 ? (
          <p className="pp-empty">No methods available for this store yet.</p>
        ) : (
          <div className={`pp-table${showBestDeals ? ' pp-table--deals' : ''}`}>
            <div className="pp-table__head">
              <span>Method</span>
              <span>Provider / mode</span>
              {showBestDeals ? <span>Best deals</span> : null}
              <span>On / Off</span>
            </div>
            {rows.map((row) => {
              const busy = savingKey === `${row.direction}:${row.key}`
              const canChangeProvider = row.providers.length > 1
              const mode = providerMode(row.selectedCode, row.direction)
              const provider = list.find((p) => (p.code || '').toLowerCase() === (row.selectedCode || '').toLowerCase())
              const cryptoRails = row.direction === 'deposit' && Array.isArray(provider?.cryptoRails) ? provider.cryptoRails : []
              const chimeManualDeal =
                showBestDeals &&
                row.direction === 'deposit' &&
                row.key === 'chime' &&
                row.selectedCode === 'xxpay' &&
                row.providers.some((p) => p.code === 'manual')
              const dealKey = row.key === 'chime' && row.selectedCode === 'manual' ? 'chime_manual' : row.key
              const bestDealOn = hasExactDeal(bestDealMethods, dealKey)
              const dealBusy = savingKey === `bestdeal:${dealKey}`
              const chimeManualDealOn = hasExactDeal(bestDealMethods, 'chime_manual')
              const chimeManualDealBusy = savingKey === 'bestdeal:chime_manual'
              return (
                <Fragment key={`${row.direction}-${row.key}`}>
                <div className="pp-table__row">
                  <span className="pp-table__method">{row.label}</span>
                  <div className="pp-provider-cell">
                    <select
                      className="pp-select"
                      value={row.selectedCode}
                      disabled={busy || !canChangeProvider}
                      title={
                        canChangeProvider
                          ? 'Choose provider / mode for this method'
                          : mode.hint || 'Only one provider is available for this method'
                      }
                      onChange={(e) => {
                        const code = e.target.value
                        applyMethodChoice(row, code, true)
                      }}
                    >
                      {row.providers.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <span
                      className={`pp-mode-flag pp-mode-flag--${mode.key}`}
                      title={mode.hint}
                    >
                      {mode.label}
                    </span>
                  </div>
                  {showBestDeals ? (
                    <Switch
                      id={row.key === 'chime' && dealKey === 'chime' ? 'pp-bestdeal-chime-auto' : `pp-bestdeal-${dealKey}`}
                      className="pp-switch--deal"
                      checked={bestDealOn}
                      disabled={dealBusy}
                      onChange={(on) => toggleBestDeal(row.selectedCode === 'xxpay' && row.key === 'chime' ? 'Chime Auto' : row.label, dealKey, on)}
                    />
                  ) : null}
                  <Switch
                    id={`pp-${row.direction}-${row.key}`}
                    className="pp-switch--power"
                    checked={row.enabled}
                    disabled={busy}
                    onChange={(on) => applyMethodChoice(row, row.selectedCode, on)}
                  />
                </div>
                {chimeManualDeal ? (
                  <div className="pp-table__row pp-table__row--sub">
                    <span className="pp-table__method pp-table__method--sub">Chime Manual</span>
                    <span className="pp-sub-hint">BEST DEALS on Chime Manual only</span>
                    <Switch
                      id="pp-bestdeal-chime-manual"
                      className="pp-switch--deal"
                      checked={chimeManualDealOn}
                      disabled={chimeManualDealBusy}
                      onChange={(on) => toggleBestDeal('Chime Manual', 'chime_manual', on)}
                    />
                    <span />
                  </div>
                ) : null}
                {row.enabled && cryptoRails.map((rail) => {
                  const railBusy = savingKey === `${row.direction}:${row.key}:${rail.key}`
                  return (
                    <div key={`${row.key}-${rail.key}`} className="pp-table__row pp-table__row--sub">
                      <span className="pp-table__method pp-table__method--sub">{rail.label}</span>
                      <span className="pp-sub-hint">Coin / network</span>
                      {showBestDeals ? <span /> : null}
                      <Switch
                        id={`pp-${row.direction}-${row.key}-${rail.key}`}
                        className="pp-switch--power"
                        checked={rail.enabled !== false}
                        disabled={railBusy}
                        onChange={(on) => toggleCryptoRail(row, rail, on)}
                      />
                    </div>
                  )
                })}
                </Fragment>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="pp-page">
      <header className="pp-header">
        <h1 className="pp-title">Payment methods</h1>
        <p className="pp-desc">
          Choose how each method works for this store.
          <strong> Manual</strong> = staff approves and pays by hand.
          <strong> Automatic (Dpay / Xpay)</strong> = system pays via Dpay or Xpay after approve.
          <strong> Best deals</strong> = show a BEST DEALS badge on the user deposit page (multiple methods allowed).
        </p>
        <div className="pp-legend" aria-label="Mode legend">
          <span className="pp-mode-flag pp-mode-flag--manual">Manual</span>
          <span className="pp-legend__text">Staff pays by hand</span>
          <span className="pp-mode-flag pp-mode-flag--auto">Automatic</span>
          <span className="pp-legend__text">Dpay / Xpay / API</span>
        </div>
      </header>

      {isMasterAdmin && (
        <div className="pp-store-bar">
          <label className="pp-store-bar__label" htmlFor="pp-store-select">
            Store
          </label>
          <select
            id="pp-store-select"
            className="pp-select pp-select--wide"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
          >
            <option value="">Select a store…</option>
            {stores.map((s) => {
              const key = `${s.distributorCode || ''}|${s.storeCode || ''}`
              return (
                <option key={key} value={key}>
                  {s.storeCode || '—'}
                  {s.username ? ` (${s.username})` : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}

      {isMasterAdmin && !selectedStore ? (
        <p className="pp-empty">Select a store to edit its payment methods.</p>
      ) : loading ? (
        <p className="pp-empty">Loading…</p>
      ) : (
        <>
          {renderSection(
            'Pay-in (deposit)',
            'Card → Orionstars, Dpay, or Xpay (allowlisted stores). Cash App → Orionstars, Dpay, or Xpay. Apple Pay / Google Pay → Orionstars, Dpay, or Xpay (dragonfury / myvepower / goodgdragon / lucky winners only). Chime → Manual or Xpay. Crypto (Speed) and Crypto (Direct) can both be on. Turn individual coins off under each crypto method. Best deals shows a BEST DEALS badge on that method on the user deposit page — you can turn it on for more than one method.',
            depositRows,
            { showBestDeals: true }
          )}
          {renderSection(
            'Payout (withdraw)',
            'For Cash App and Chime: pick Manual (staff pays) or Automatic (Dpay / Xpay). PayPal → Dpay or Xpay (allowlisted stores). Card → Orionstars.',
            withdrawRows
          )}
        </>
      )}
    </div>
  )
}
