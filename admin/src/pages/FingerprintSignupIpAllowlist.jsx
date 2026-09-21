import { useCallback, useEffect, useState } from 'react'
import {
  getFingerprintSignupIpAllowlist,
  createFingerprintSignupIpAllowlistEntry,
  deleteFingerprintSignupIpAllowlistEntry,
  getStores
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './ChimeCashappWithdrawals.css'
import './GeoIpAllowlist.css'

const PAGE_SIZE = 50
/** Sentinel store code: IP applies to every partner store. */
const ALL_STORES_VALUE = '*'

function isAllStoresEntry(storeCode) {
  return String(storeCode || '').trim() === ALL_STORES_VALUE
}

function formatStoreLabel(storeCode) {
  if (isAllStoresEntry(storeCode)) return 'All stores'
  return storeCode || '—'
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return `${date.toLocaleDateString(undefined, { dateStyle: 'short' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function formatAddedBy(entry) {
  const by = entry?.createdBy
  if (!by) return '—'
  if (by.username) return by.username
  if (by.email) return by.email
  if (by.firstName) return by.firstName
  if (by.userId != null) return `User #${by.userId}`
  return '—'
}

export default function FingerprintSignupIpAllowlist() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [entries, setEntries] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  const [stores, setStores] = useState([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [filterStoreDraft, setFilterStoreDraft] = useState('')
  const [appliedStoreFilter, setAppliedStoreFilter] = useState('')
  const [formStoreCode, setFormStoreCode] = useState('')

  const [ipAddress, setIpAddress] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isMaster) return
    setStoresLoading(true)
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((res) => {
        const rows = Array.isArray(res?.list) ? res.list : []
        setStores(rows)
        setFormStoreCode((prev) => {
          if (prev) return prev
          return rows[0]?.storeCode ? String(rows[0].storeCode) : ''
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load stores')
        setStores([])
      })
      .finally(() => setStoresLoading(false))
  }, [isMaster, toast])

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: PAGE_SIZE }
    if (appliedSearch.trim()) params.search = appliedSearch.trim()
    if (isMaster && appliedStoreFilter.trim()) params.storeCode = appliedStoreFilter.trim()
    getFingerprintSignupIpAllowlist(params)
      .then((res) => {
        setEntries(res.entries || [])
        setTotal(res.total ?? 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load IP allowlist')
        setEntries([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, appliedSearch, appliedStoreFilter, isMaster, toast])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1)

  async function handleAdd(e) {
    e.preventDefault()
    const ip = ipAddress.trim()
    if (!ip) {
      toast.error('Enter an IP address or CIDR range')
      return
    }
    if (isMaster && !formStoreCode.trim()) {
      toast.error('Select a store or All stores')
      return
    }
    setSaving(true)
    try {
      const body = {
        ipAddress: ip,
        note: note.trim() || undefined
      }
      if (isMaster) body.storeCode = formStoreCode.trim()
      await createFingerprintSignupIpAllowlistEntry(body)
      toast.success(
        isAllStoresEntry(formStoreCode)
          ? 'IP added — this address can create multiple accounts on every store'
          : 'IP added — this address can create multiple accounts on that store'
      )
      setIpAddress('')
      setNote('')
      setPage(1)
      if (isMaster) {
        setAppliedStoreFilter(formStoreCode.trim())
        setFilterStoreDraft(formStoreCode.trim())
      }
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to add IP')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry) {
    const allStores = isAllStoresEntry(entry.storeCode)
    const ok = await confirm({
      title: 'Remove allowlisted IP?',
      message: allStores
        ? `Remove ${entry.ipAddress} from the signup allowlist for all stores? New signups from this IP will be limited to one account per device again.`
        : `Remove ${entry.ipAddress} from the signup allowlist for store "${entry.storeCode}"? New signups from this IP will be limited to one account per device again on that store.`,
      confirmLabel: 'Remove',
      variant: 'danger'
    })
    if (!ok) return
    try {
      await deleteFingerprintSignupIpAllowlistEntry(entry.id)
      toast.success('IP removed from allowlist')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to remove IP')
    }
  }

  return (
    <div className="ccw-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Signup device IP allowlist</h1>
        <p className="ccw-subtitle">
          IPs on this list skip the one-account-per-device signup block (used for QA and office testing).
          This does not bypass geo-blocking. Choose a single store, or All stores to apply everywhere.
          Who added each entry is recorded automatically.
        </p>
      </header>

      {!isMaster && user?.storeCode ? (
        <p className="bonus-store-banner">Managing allowlist for store: <strong>{user.storeCode}</strong></p>
      ) : null}

      <form className="geo-allowlist-form" onSubmit={handleAdd}>
        {isMaster ? (
          <div className="geo-allowlist-form-row">
            <label className="ccw-filter-label" htmlFor="fp-ip-store">
              Store
            </label>
            <select
              id="fp-ip-store"
              className="ccw-filter-input"
              value={formStoreCode}
              onChange={(e) => setFormStoreCode(e.target.value)}
              disabled={saving || storesLoading}
            >
              {storesLoading ? (
                <option value="">Loading stores…</option>
              ) : stores.length === 0 ? (
                <option value="">No stores found</option>
              ) : (
                <>
                  <option value="">Select store…</option>
                  <option value={ALL_STORES_VALUE}>All stores</option>
                  {stores.map((s) => (
                    <option key={s.userId ?? s.storeCode} value={s.storeCode || ''}>
                      {s.storeCode || '—'}
                      {s.username ? ` (${s.username})` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        ) : null}
        <div className="geo-allowlist-form-row">
          <label className="ccw-filter-label" htmlFor="fp-ip-input">
            IP address / CIDR
          </label>
          <input
            id="fp-ip-input"
            className="ccw-filter-input"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="e.g. 203.0.113.10 or 27.34.66.0/24"
            autoComplete="off"
            disabled={saving}
          />
        </div>
        <div className="geo-allowlist-form-row">
          <label className="ccw-filter-label" htmlFor="fp-ip-note">
            Note (optional)
          </label>
          <input
            id="fp-ip-note"
            className="ccw-filter-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. QA office Wi‑Fi, Staging VPN"
            maxLength={255}
            disabled={saving}
          />
        </div>
        <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add IP'}
        </button>
      </form>

      <div className="ccw-toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {isMaster ? (
          <>
            <label className="ccw-filter-label" htmlFor="fp-ip-filter-store">
              Filter store
            </label>
            <select
              id="fp-ip-filter-store"
              className="ccw-filter-input"
              value={filterStoreDraft}
              onChange={(e) => {
                const next = e.target.value
                setFilterStoreDraft(next)
                setPage(1)
                setAppliedStoreFilter(next)
              }}
              disabled={storesLoading}
            >
              <option value="">All stores</option>
              <option value={ALL_STORES_VALUE}>All stores (global)</option>
              {storesLoading ? (
                <option value="" disabled>
                  Loading stores…
                </option>
              ) : (
                stores.map((s) =>
                  s.storeCode ? (
                    <option key={`filter-${s.userId ?? s.storeCode}`} value={s.storeCode}>
                      {s.storeCode}
                      {s.username ? ` (${s.username})` : ''}
                    </option>
                  ) : null
                )
              )}
            </select>
          </>
        ) : null}
        <label className="ccw-filter-label" htmlFor="fp-ip-search">
          Search
        </label>
        <input
          id="fp-ip-search"
          className="ccw-filter-input"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="IP or note"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1)
              setAppliedSearch(searchDraft)
            }
          }}
        />
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={() => {
            setPage(1)
            setAppliedSearch(searchDraft)
          }}
        >
          Apply
        </button>
      </div>

      {loading ? (
        <p className="ccw-subtitle">Loading…</p>
      ) : (
        <>
          <div className="ccw-table-wrap">
            <table className="ccw-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>IP / CIDR</th>
                  <th>Note</th>
                  <th>Added by</th>
                  <th>Added at</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {isAllStoresEntry(entry.storeCode) ? (
                        <span className="geo-allowlist-all-stores">{formatStoreLabel(entry.storeCode)}</span>
                      ) : (
                        formatStoreLabel(entry.storeCode)
                      )}
                    </td>
                    <td>
                      <code className="geo-allowlist-ip">{entry.ipAddress}</code>
                    </td>
                    <td>{entry.note || '—'}</td>
                    <td>
                      <div className="geo-allowlist-who">
                        <span>{formatAddedBy(entry)}</span>
                        {entry.createdBy?.email && entry.createdBy?.username ? (
                          <span className="geo-allowlist-who-email">{entry.createdBy.email}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>
                      {isMaster || !isAllStoresEntry(entry.storeCode) ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          onClick={() => handleDelete(entry)}
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="geo-allowlist-who-email">Global</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length === 0 && (
            <p className="ccw-subtitle">No allowlisted IPs yet. Add one above so that IP can create multiple accounts for testing.</p>
          )}
          <div className="ccw-toolbar" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="ccw-subtitle">
              Page {page} of {totalPages} ({total} total)
            </span>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
