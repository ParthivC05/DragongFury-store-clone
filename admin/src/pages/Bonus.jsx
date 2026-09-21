import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getAdminBonusCodes,
  getStores,
  createAdminBonusCode,
  updateAdminBonusCode,
  deleteAdminBonusCode,
  getAdminBonusTransactions
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import './ChimeCashappWithdrawals.css'
import './Bonus.css'

const PAGE_SIZE = 20

const EMPTY_FORM = {
  code: '',
  storeCode: '',
  claimScope: 'every_deposit',
  maxClaimsPerUser: '1',
  valueType: 'percentage',
  value: '10',
  maxBonusCap: '',
  minDeposit: '',
  isActive: true
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return `${date.toLocaleDateString(undefined, { dateStyle: 'short' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function rowToForm(row) {
  return {
    code: row.code || '',
    storeCode: row.storeCode || '',
    claimScope: row.claimScope || 'every_deposit',
    maxClaimsPerUser:
      row.maxClaimsPerUser != null && row.claimScope === 'fixed_count' ? String(row.maxClaimsPerUser) : '1',
    valueType: row.valueType || 'percentage',
    value: row.value != null ? String(row.value) : '',
    maxBonusCap: row.maxBonusCap != null && row.maxBonusCap !== '' ? String(row.maxBonusCap) : '',
    minDeposit: row.minDeposit != null && row.minDeposit !== '' ? String(row.minDeposit) : '',
    isActive: Boolean(row.isActive)
  }
}

function buildCreateBody(form, isMaster) {
  const body = {
    code: form.code.trim(),
    claimScope: form.claimScope,
    valueType: form.valueType,
    value: Number(form.value),
    isActive: form.isActive
  }
  if (form.claimScope === 'fixed_count') {
    body.maxClaimsPerUser = parseInt(form.maxClaimsPerUser, 10)
  }
  if (form.maxBonusCap !== '') body.maxBonusCap = Number(form.maxBonusCap)
  if (form.minDeposit !== '') body.minDeposit = Number(form.minDeposit)
  if (isMaster) body.storeCode = form.storeCode.trim()
  return body
}

function buildUpdateBody(form, isMaster) {
  const body = {
    isActive: Boolean(form.isActive),
    valueType: form.valueType,
    value: Number(form.value),
    claimScope: form.claimScope
  }
  if (form.claimScope === 'fixed_count') {
    body.maxClaimsPerUser = parseInt(form.maxClaimsPerUser, 10)
  }
  body.maxBonusCap = form.maxBonusCap !== '' ? Number(form.maxBonusCap) : null
  body.minDeposit = form.minDeposit !== '' ? Number(form.minDeposit) : null
  if (isMaster && form.storeCode.trim()) body.storeCode = form.storeCode.trim()
  return body
}

export default function Bonus() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const [tab, setTab] = useState('codes')
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)

  const [codes, setCodes] = useState([])
  const [codesPage, setCodesPage] = useState(1)
  const [codesTotal, setCodesTotal] = useState(0)
  const [codesLoading, setCodesLoading] = useState(true)
  const [filterStoreDraft, setFilterStoreDraft] = useState('')
  const [filterCodeDraft, setFilterCodeDraft] = useState('')
  const [appliedStoreFilter, setAppliedStoreFilter] = useState('')
  const [appliedCodeSearch, setAppliedCodeSearch] = useState('')

  const [grants, setGrants] = useState([])
  const [grantsPage, setGrantsPage] = useState(1)
  const [grantsTotal, setGrantsTotal] = useState(0)
  const [grantsLoading, setGrantsLoading] = useState(false)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState('create')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM }))
  const [sheetSaving, setSheetSaving] = useState(false)

  const loadCodes = useCallback(() => {
    setCodesLoading(true)
    const params = { page: codesPage, limit: PAGE_SIZE }
    if (isMaster && appliedStoreFilter.trim()) params.storeCode = appliedStoreFilter.trim()
    if (appliedCodeSearch.trim()) params.search = appliedCodeSearch.trim()
    getAdminBonusCodes(params)
      .then((res) => {
        setCodes(res.bonus_codes || [])
        setCodesTotal(res.total ?? 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load bonus codes')
        setCodes([])
        setCodesTotal(0)
      })
      .finally(() => setCodesLoading(false))
  }, [codesPage, isMaster, appliedStoreFilter, appliedCodeSearch, toast])

  const loadGrants = useCallback(() => {
    setGrantsLoading(true)
    getAdminBonusTransactions({ page: grantsPage, limit: PAGE_SIZE })
      .then((res) => {
        setGrants(res.grants || [])
        setGrantsTotal(res.total ?? 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load bonus transactions')
        setGrants([])
        setGrantsTotal(0)
      })
      .finally(() => setGrantsLoading(false))
  }, [grantsPage, toast])

  useEffect(() => {
    if (tab === 'codes') loadCodes()
  }, [tab, loadCodes])

  useEffect(() => {
    if (tab === 'transactions') loadGrants()
  }, [tab, loadGrants])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const codesTotalPages = Math.max(1, Math.ceil(codesTotal / PAGE_SIZE))
  const grantsTotalPages = Math.max(1, Math.ceil(grantsTotal / PAGE_SIZE))

  function openCreate() {
    setSheetMode('create')
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setSheetOpen(true)
  }

  function openEdit(row) {
    setSheetMode('edit')
    setEditingId(row.id)
    setForm(rowToForm(row))
    setSheetOpen(true)
  }

  function closeSheet(opts) {
    const force = opts && opts.force
    if (sheetSaving && !force) return
    setSheetOpen(false)
    setEditingId(null)
  }

  function applyCodeFilters() {
    if (isMaster) setAppliedStoreFilter(filterStoreDraft.trim())
    setAppliedCodeSearch(filterCodeDraft.trim())
    setCodesPage(1)
  }

  function handleCodeDraftChange(e) {
    const nextValue = e.target.value
    setFilterCodeDraft(nextValue)

    // Auto-clear the applied search when the input is fully erased.
    if (!nextValue.trim() && appliedCodeSearch) {
      setAppliedCodeSearch('')
      setCodesPage(1)
    }
  }

  function handleStoreDraftChange(e) {
    const nextValue = e.target.value
    setFilterStoreDraft(nextValue)

    // Auto-clear the applied store filter when the input is fully erased.
    if (!nextValue.trim() && appliedStoreFilter) {
      setAppliedStoreFilter('')
      setCodesPage(1)
    }
  }

  async function handleSheetSubmit(e) {
    e.preventDefault()
    setSheetSaving(true)
    try {
      if (sheetMode === 'create') {
        await createAdminBonusCode(buildCreateBody(form, isMaster))
        toast.success('Bonus code created.')
        setForm({ ...EMPTY_FORM })
        closeSheet({ force: true })
        loadCodes()
      } else if (editingId != null) {
        await updateAdminBonusCode(editingId, buildUpdateBody(form, isMaster))
        toast.success('Bonus code updated.')
        closeSheet({ force: true })
        loadCodes()
      }
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSheetSaving(false)
    }
  }

  async function toggleActive(row) {
    try {
      await updateAdminBonusCode(row.id, { isActive: !row.isActive })
      toast.success(row.isActive ? 'Deactivated.' : 'Activated.')
      loadCodes()
    } catch (err) {
      toast.error(err.message || 'Update failed')
    }
  }

async function copyBonusLink(row) {
  try {
    const storeCode = isMaster ? row.storeCode : user?.storeCode;
    if (!storeCode) {
      toast.error('No store code available.');
      return;
    }

    let userSiteUrl = '';
    if (!isMaster) {
      userSiteUrl = user?.userSiteUrl || user?.customerSiteUrl || '';
    } else {
      const res = await getStores({ storeCode, limit: 1 });
      const store = res?.list?.[0];
      userSiteUrl = store?.userSiteUrl || store?.customerSiteUrl || '';
    }

    if (!userSiteUrl.trim()) {
      toast.error('Add your site URL first in Profile.');
      return;
    }

    const cleanUrl = userSiteUrl.replace(/\/+$/, '');
    const link = `${cleanUrl}/register?bonusCode=${encodeURIComponent(row.code)}`;
    await navigator.clipboard.writeText(link);
    toast.success(`Link copied to clipboard: ${link}`);
  } catch (err) {
    console.error('Copy link failed:', err);
    toast.error('Failed to copy link. Please try again.');
  }
}

async function handleDelete(row) {
    const ok = await confirm({
      title: 'Delete bonus code',
      message: `Remove "${row.code}"? This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete'
    })
    if (!ok) return
    try {
      await deleteAdminBonusCode(row.id)
      toast.success('Deleted.')
      loadCodes()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const showStoreColumn = isMaster

  return (
    <div className="ccw-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Bonus codes</h1>
        <p className="ccw-subtitle">
          URL-based signup codes and deposit bonuses. Deposit bonuses from a code take priority over platform promotions—only one
          applies per deposit.
        </p>
      </header>

      <div className="ccd-tabs" role="tablist" aria-label="Bonus sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'codes'}
          className={`ccd-tab ${tab === 'codes' ? 'is-active' : ''}`}
          onClick={() => setTab('codes')}
        >
          Bonus codes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'transactions'}
          className={`ccd-tab ${tab === 'transactions' ? 'is-active' : ''}`}
          onClick={() => setTab('transactions')}
        >
          Bonus transactions
        </button>
      </div>

      {tab === 'codes' && (
        <>
          {!isMaster && user?.storeCode && (
            <p className="bonus-store-banner">
              Managing codes for store <strong>{user.storeCode}</strong>
            </p>
          )}

          <div className="ccw-toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {isMaster && (
              <>
                <label className="ccw-filter-label" htmlFor="bonus-filter-store">
                  Store code
                </label>
                <input
                  id="bonus-filter-store"
                  className="ccw-filter-input"
                  value={filterStoreDraft}
                  onChange={handleStoreDraftChange}
                  placeholder="Filter by store"
                />
              </>
            )}
            <label className="ccw-filter-label" htmlFor="bonus-filter-code">
              Code contains
            </label>
            <input
              id="bonus-filter-code"
              className="ccw-filter-input"
              value={filterCodeDraft}
              onChange={handleCodeDraftChange}
              placeholder="Search code"
            />
            <button type="button" className="admin-btn admin-btn-secondary" onClick={applyCodeFilters}>
              Apply filters
            </button>
            <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
              New bonus code
            </button>
          </div>

          {codesLoading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <>
              <div className="ccw-table-wrap">
                <table className="ccw-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      {showStoreColumn && <th>Store</th>}
                      <th>Scope</th>
                      <th>Value</th>
                      <th>Min dep.</th>
                      <th>Cap</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <code style={{ fontSize: '0.85em' }}>{row.code}</code>
                        </td>
                        {showStoreColumn && <td>{row.storeCode}</td>}
                        <td>
                          {row.claimScope === 'every_deposit' ? 'Every deposit' : `Up to ${row.maxClaimsPerUser}×`}
                        </td>
                        <td>{row.valueType === 'percentage' ? `${row.value}%` : `SC ${row.value}`}</td>
                        <td>{row.minDeposit != null ? row.minDeposit : '—'}</td>
                        <td>{row.maxBonusCap != null ? row.maxBonusCap : '—'}</td>
                        <td>
                          <span
                            className={`ccw-badge ${row.isActive ? 'ccw-badge-completed' : 'ccw-badge-rejected'}`}
                            style={{ fontSize: '0.7rem' }}
                          >
                            {row.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div className="bonus-row-actions">
                            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => openEdit(row)}>
                              Edit
                            </button>
                            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => handleDelete(row)}>
                              Delete
                            </button>
                            <button type="button" className={`admin-btn ${ row?.isActive ? "admin-btn-danger" : "admin-btn-success"}`} onClick={() => toggleActive(row)}>
                              {row.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button type="button" className="admin-btn admin-btn-primary" onClick={() => copyBonusLink(row)}>
                              Copy Link
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {codes.length === 0 && <p className="ccw-subtitle">No bonus codes match your filters.</p>}
              <div className="ccw-toolbar" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={codesPage <= 1}
                  onClick={() => setCodesPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ alignSelf: 'center' }}>
                  Page {codesPage} / {codesTotalPages}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={codesPage >= codesTotalPages}
                  onClick={() => setCodesPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'transactions' && (
        <>
          {grantsLoading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <>
              <div className="ccw-table-wrap">
                <table className="ccw-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>User</th>
                      <th>Code</th>
                      <th>Amount</th>
                      <th>Deposit req</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((g) => (
                      <tr key={g.id}>
                        <td>{formatDate(g.created_at)}</td>
                        <td>
                          {showPlayerEmail
                            ? (g.user?.email || g.user?.username || g.user?.user_id)
                            : (
                              <>
                                <span className="ccw-user-name">ID {g.user?.user_id || '—'}</span>
                                {g.user?.username ? (
                                  <span className="ccw-user-email">@{g.user.username}</span>
                                ) : null}
                              </>
                            )}
                        </td>
                        <td>{g.bonus_code?.code}</td>
                        <td>
                          {g.currency_code} {Number(g.amount).toFixed(2)}
                        </td>
                        <td>{g.deposit_request_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {grants.length === 0 && <p className="ccw-subtitle">No bonus payouts yet.</p>}
              <div className="ccw-toolbar" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={grantsPage <= 1}
                  onClick={() => setGrantsPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ alignSelf: 'center' }}>
                  Page {grantsPage} / {grantsTotalPages}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={grantsPage >= grantsTotalPages}
                  onClick={() => setGrantsPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}

      {sheetOpen && (
        <div
          className="bonus-sheet-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet()
          }}
        >
          <div className="bonus-sheet" role="dialog" aria-modal="true" aria-labelledby="bonus-sheet-title">
            <div className="bonus-sheet-header">
              <div>
                <h2 id="bonus-sheet-title" className="bonus-sheet-title">
                  {sheetMode === 'create' ? 'Create bonus code' : 'Edit bonus code'}
                </h2>
                <p className="bonus-sheet-sub">
                  {sheetMode === 'create'
                    ? 'Players can append ?bonusCode= or ?bc= to your signup URL. Deposit rules apply after signup.'
                    : 'The public code string cannot be changed. Adjust reward rules, limits, and visibility below.'}
                </p>
              </div>
              <button type="button" className="bonus-sheet-close" onClick={closeSheet} aria-label="Close">
                ×
              </button>
            </div>
            <form className="bonus-sheet-body" onSubmit={handleSheetSubmit}>
              <div className="bonus-form-grid">
                {sheetMode === 'edit' && (
                  <div className="bonus-field bonus-field-span-2">
                    <label>Code</label>
                    <span className="bonus-readonly">{form.code}</span>
                    <p className="bonus-field-hint">Immutable after creation (used in URLs and ledgers).</p>
                  </div>
                )}
                {sheetMode === 'create' && (
                  <div className="bonus-field bonus-field-span-2">
                    <label htmlFor="bonus-f-code">Code</label>
                    <input
                      id="bonus-f-code"
                      className="ccw-filter-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="e.g. SPRING25"
                      required
                      autoComplete="off"
                    />
                    <p className="bonus-field-hint">Letters and numbers; normalized to uppercase on save.</p>
                  </div>
                )}
                {isMaster && (
                  <div className="bonus-field bonus-field-span-2">
                    <label htmlFor="bonus-f-store">Store code {sheetMode === 'create' ? '(required)' : ''}</label>
                    <input
                      id="bonus-f-store"
                      className="ccw-filter-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={form.storeCode}
                      onChange={(e) => setForm((f) => ({ ...f, storeCode: e.target.value }))}
                      placeholder="Store this code belongs to"
                      required={sheetMode === 'create'}
                    />
                  </div>
                )}
                <div className="bonus-field bonus-field-span-2">
                  <label htmlFor="bonus-f-scope">Claim scope</label>
                  <select
                    id="bonus-f-scope"
                    className="ccw-select"
                    style={{ width: '100%' }}
                    value={form.claimScope}
                    onChange={(e) => setForm((f) => ({ ...f, claimScope: e.target.value }))}
                  >
                    <option value="every_deposit">Every qualifying deposit</option>
                    <option value="fixed_count">Limited number of deposits per user</option>
                  </select>
                  <p className="bonus-field-hint">
                    &quot;Every deposit&quot; reapplies the bonus on each deposit that meets the minimum. &quot;Limited&quot; stops after N
                    successful claims.
                  </p>
                </div>
                {form.claimScope === 'fixed_count' && (
                  <div className="bonus-field">
                    <label htmlFor="bonus-f-max">Max claims per user</label>
                    <input
                      id="bonus-f-max"
                      className="ccw-filter-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      type="number"
                      min={1}
                      max={9999}
                      value={form.maxClaimsPerUser}
                      onChange={(e) => setForm((f) => ({ ...f, maxClaimsPerUser: e.target.value }))}
                      required={form.claimScope === 'fixed_count'}
                    />
                  </div>
                )}
                <div className="bonus-field">
                  <label htmlFor="bonus-f-vtype">Bonus value type</label>
                  <select
                    id="bonus-f-vtype"
                    className="ccw-select"
                    style={{ width: '100%' }}
                    value={form.valueType}
                    onChange={(e) => setForm((f) => ({ ...f, valueType: e.target.value }))}
                  >
                    <option value="percentage">Percentage of deposit</option>
                    <option value="fixed">Fixed SC amount</option>
                  </select>
                </div>
                <div className="bonus-field">
                  <label htmlFor="bonus-f-value">Value</label>
                  <input
                    id="bonus-f-value"
                    className="ccw-filter-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    required
                  />
                  <p className="bonus-field-hint">
                    {form.valueType === 'percentage' ? 'Percent of the deposit (e.g. 10 = 10%).' : 'Sweep coins credited as a flat bonus.'}
                  </p>
                </div>
                <div className="bonus-field">
                  <label htmlFor="bonus-f-cap">Max bonus cap</label>
                  <input
                    id="bonus-f-cap"
                    className="ccw-filter-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.maxBonusCap}
                    onChange={(e) => setForm((f) => ({ ...f, maxBonusCap: e.target.value }))}
                    placeholder="Optional"
                  />
                  <p className="bonus-field-hint">Useful for percentage bonuses; leave empty for no cap.</p>
                </div>
                <div className="bonus-field">
                  <label htmlFor="bonus-f-min">Minimum deposit</label>
                  <input
                    id="bonus-f-min"
                    className="ccw-filter-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minDeposit}
                    onChange={(e) => setForm((f) => ({ ...f, minDeposit: e.target.value }))}
                    placeholder="Optional"
                  />
                  <p className="bonus-field-hint">Deposit must be at least this amount to qualify.</p>
                </div>
                <div className="bonus-field bonus-field-span-2">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    Code is active (inactive codes cannot be used for new signups or deposits)
                  </label>
                </div>
              </div>
              <div className="bonus-sheet-actions">
                <button type="submit" className="admin-btn admin-btn-primary" disabled={sheetSaving}>
                  {sheetSaving ? 'Saving…' : sheetMode === 'create' ? 'Create code' : 'Save changes'}
                </button>
                <button type="button" className="admin-btn admin-btn-secondary" disabled={sheetSaving} onClick={closeSheet}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
