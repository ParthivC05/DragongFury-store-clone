import { useState, useEffect, useCallback, useMemo } from 'react'
import { getStores } from '../api/admin'
import * as depositPackagesApi from '../api/depositPackages'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './StoreFeatures.css'
import './DepositPackages.css'

const inputClass = 'store-features-input'

const EMPTY_PKG_FORM = {
  group_id: '',
  title: '',
  final_sc: '',
  actual_price: '',
  final_price: '',
  discount_label: '',
  max_purchases_per_user: '',
  sort_order: '0',
  starts_at: '',
  ends_at: '',
  is_active: true
}

function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const GROUP_KEY_LABELS = {
  flash_sale: 'Flash sale',
  welcome: 'Welcome',
  featured: 'Featured',
  limited_time: 'Limited time',
  general: 'General'
}

function groupKeyLabel(key) {
  return GROUP_KEY_LABELS[key] || key || 'Group'
}

function normalizeStoreRow(s) {
  const code = String(s?.storeCode || s?.store_code || '').trim()
  const distributorCode = String(s?.distributorCode || s?.distributor_code || '').trim()
  const email = String(s?.email || '').trim()
  const username = String(s?.username || '').trim()
  return {
    storeCode: code.toLowerCase(),
    distributorCode: distributorCode.toLowerCase(),
    label: code || username || email || 'Unknown store',
    sub: [email, username].filter(Boolean).join(' · ')
  }
}

export default function DepositPackages() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [groups, setGroups] = useState([])
  const [storeOptions, setStoreOptions] = useState([])
  const [selectedStore, setSelectedStore] = useState(null)
  const [pkgForm, setPkgForm] = useState(EMPTY_PKG_FORM)
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [editingPackageId, setEditingPackageId] = useState(null)
  const [groupEdits, setGroupEdits] = useState({})

  const scope = useMemo(() => {
    if (isStoreAdmin && user?.distributorCode && user?.storeCode) {
      return {
        distributorCode: String(user.distributorCode).trim().toLowerCase(),
        storeCode: String(user.storeCode).trim().toLowerCase()
      }
    }
    if (selectedStore?.distributorCode && selectedStore?.storeCode) {
      return {
        distributorCode: selectedStore.distributorCode,
        storeCode: selectedStore.storeCode
      }
    }
    return null
  }, [isStoreAdmin, user, selectedStore])

  const loadStores = useCallback(async () => {
    if (!isMaster) {
      setStoreOptions([])
      return
    }
    try {
      const res = await getStores({ limit: 200, sortBy: 'storeCode', sortOrder: 'ASC' })
      const rows = Array.isArray(res?.list) ? res.list : []
      const unique = new Map()
      rows.forEach((row) => {
        const norm = normalizeStoreRow(row)
        if (norm.storeCode && norm.distributorCode && !unique.has(`${norm.distributorCode}:${norm.storeCode}`)) {
          unique.set(`${norm.distributorCode}:${norm.storeCode}`, norm)
        }
      })
      const list = [...unique.values()].sort((a, b) => a.label.localeCompare(b.label))
      setStoreOptions(list)
      if (list.length && !selectedStore) setSelectedStore(list[0])
    } catch {
      toast.error('Could not load stores.')
    }
  }, [isMaster, selectedStore, toast])

  const loadCatalog = useCallback(async () => {
    if (!scope) {
      setGroups([])
      setEnabled(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await depositPackagesApi.getDepositPackagesCatalog(scope)
      setEnabled(data?.enabled === true)
      setGroups(Array.isArray(data?.groups) ? data.groups : [])
      const edits = {}
      ;(data?.groups || []).forEach((g) => {
        edits[g.id] = {
          starts_at: toLocalInputValue(g.starts_at),
          ends_at: toLocalInputValue(g.ends_at),
          is_active: g.is_active !== false,
          max_purchases_per_user: g.max_purchases_per_user != null ? String(g.max_purchases_per_user) : ''
        }
      })
      setGroupEdits(edits)
      setActiveGroupId(null)
      setEditingPackageId(null)
      setPkgForm(EMPTY_PKG_FORM)
    } catch (err) {
      toast.error(err.message || 'Failed to load packages.')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [scope, toast])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  async function handleToggleEnabled(next) {
    if (!scope) return
    setSaving(true)
    try {
      await depositPackagesApi.updateDepositPackageSettings(scope, { enabled: next })
      setEnabled(next)
      toast.success(next ? 'Package deposit flow enabled.' : 'Package deposit flow disabled.')
      await loadCatalog()
    } catch (err) {
      toast.error(err.message || 'Could not update setting.')
    } finally {
      setSaving(false)
    }
  }

  async function saveGroup(group) {
    if (!scope) return
    const edit = groupEdits[group.id] || {}
    setSaving(true)
    try {
      await depositPackagesApi.patchDepositPackageGroup(scope, group.id, {
        starts_at: fromLocalInputValue(edit.starts_at),
        ends_at: fromLocalInputValue(edit.ends_at),
        is_active: edit.is_active !== false,
        ...(group.group_key === 'welcome'
          ? {
            max_purchases_per_user: String(edit.max_purchases_per_user || '').trim()
              ? Number(edit.max_purchases_per_user)
              : null
          }
          : {})
      })
      toast.success(group.group_key === 'welcome'
        ? `Saved ${group.title}.`
        : `Saved ${group.title} schedule.`)
      await loadCatalog()
    } catch (err) {
      toast.error(err.message || 'Could not save group.')
    } finally {
      setSaving(false)
    }
  }

  function startEditPackage(pkg, groupId) {
    setActiveGroupId(groupId)
    setEditingPackageId(pkg?.id ?? null)
    setPkgForm({
      group_id: String(groupId),
      title: pkg?.title || '',
      final_sc: pkg?.final_sc != null ? String(pkg.final_sc) : '',
      actual_price: pkg?.actual_price != null ? String(pkg.actual_price) : '',
      final_price: pkg?.final_price != null ? String(pkg.final_price) : '',
      discount_label: pkg?.discount_label || '',
      max_purchases_per_user: pkg?.max_purchases_per_user != null ? String(pkg.max_purchases_per_user) : '',
      sort_order: pkg?.sort_order != null ? String(pkg.sort_order) : '0',
      starts_at: toLocalInputValue(pkg?.starts_at),
      ends_at: toLocalInputValue(pkg?.ends_at),
      is_active: pkg?.is_active !== false
    })
  }

  function resetPkgForm(groupId) {
    setEditingPackageId(null)
    setActiveGroupId(groupId)
    setPkgForm({ ...EMPTY_PKG_FORM, group_id: String(groupId) })
  }

  async function submitPackage(e, group) {
    e.preventDefault()
    if (!scope || !group?.id) return
    setSaving(true)
    try {
      const isGeneral = group.group_key === 'general'
      const isWelcome = group.group_key === 'welcome'
      const usesSchedule = group.supports_schedule !== false && !isGeneral && !isWelcome
      const body = {
        group_id: Number(group.id),
        title: pkgForm.title.trim() || null,
        final_sc: Number(pkgForm.final_sc),
        actual_price: Number(pkgForm.actual_price),
        final_price: Number(pkgForm.final_price),
        discount_label: pkgForm.discount_label.trim() || null,
        max_purchases_per_user: isGeneral
          ? (pkgForm.max_purchases_per_user.trim() ? Number(pkgForm.max_purchases_per_user) : null)
          : Number(pkgForm.max_purchases_per_user),
        sort_order: parseInt(pkgForm.sort_order, 10) || 0,
        starts_at: usesSchedule ? fromLocalInputValue(pkgForm.starts_at) : null,
        ends_at: usesSchedule ? fromLocalInputValue(pkgForm.ends_at) : null,
        is_active: pkgForm.is_active
      }
      if (!isGeneral && (!body.max_purchases_per_user || body.max_purchases_per_user < 1)) {
        toast.error('Max purchases per user is required for this group.')
        setSaving(false)
        return
      }
      if (editingPackageId) {
        await depositPackagesApi.patchDepositPackage(scope, editingPackageId, body)
        toast.success('Package updated.')
      } else {
        await depositPackagesApi.createDepositPackage(scope, body)
        toast.success('Package created.')
      }
      resetPkgForm(group.id)
      await loadCatalog()
    } catch (err) {
      toast.error(err.message || 'Could not save package.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePackage(pkg) {
    if (!scope) return
    const ok = await confirm(`Delete package "${pkg.title || pkg.final_sc + ' SC'}"?`)
    if (!ok) return
    setSaving(true)
    try {
      await depositPackagesApi.deleteDepositPackage(scope, pkg.id)
      toast.success('Package deleted.')
      await loadCatalog()
    } catch (err) {
      toast.error(err.message || 'Could not delete package.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="store-features-page deposit-packages-page">
      <h2>Deposit packages</h2>
      <p className="store-features-intro">
        Configure grouped deposit packages for your store. Users pick a package first, then choose a payment method.
        General packages appear last; other groups appear first.
      </p>

      {isMaster && (
        <section className="deposit-packages-section spin-wheel-card">
          <h3 className="deposit-packages-section-title">Select store</h3>
          <select
            className={inputClass}
            value={selectedStore ? `${selectedStore.distributorCode}:${selectedStore.storeCode}` : ''}
            onChange={(e) => {
              const [distributorCode, storeCode] = e.target.value.split(':')
              const found = storeOptions.find(
                (s) => s.distributorCode === distributorCode && s.storeCode === storeCode
              )
              setSelectedStore(found || null)
            }}
          >
            {storeOptions.map((s) => (
              <option key={`${s.distributorCode}:${s.storeCode}`} value={`${s.distributorCode}:${s.storeCode}`}>
                {s.label}{s.sub ? ` (${s.sub})` : ''}
              </option>
            ))}
          </select>
        </section>
      )}

      {!scope && isMaster && (
        <p className="store-features-hint">Select a store to manage packages.</p>
      )}

      {scope && (
        <>
          <section className="deposit-packages-section spin-wheel-card">
            <label className="deposit-packages-switch-card">
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(e) => handleToggleEnabled(e.target.checked)}
              />
              <span>
                <strong>Enable package-first deposit flow</strong>
                <small>When off, users see the classic amount/payment flow.</small>
              </span>
            </label>
          </section>

          {loading ? (
            <p className="store-features-hint">Loading…</p>
          ) : (
            groups.map((group) => {
              const isGeneral = group.group_key === 'general'
              const isWelcome = group.group_key === 'welcome'
              const usesSchedule = group.supports_schedule !== false && !isGeneral && !isWelcome
              const formOpen = activeGroupId === group.id
              const packages = group.packages || []
              const groupHint = isGeneral
                ? 'Always available — no start/end dates'
                : isWelcome
                  ? `Available for ${group.signup_window_hours || 24} hours after user signup`
                  : 'Schedule when this group is visible to users'
              return (
              <section key={group.id} className="deposit-packages-section spin-wheel-card">
                <header className="deposit-packages-group-head">
                  <div>
                    <h3 className="deposit-packages-section-title">{group.title}</h3>
                    <p className="store-features-hint m-0">{groupHint}</p>
                    <span className="deposit-packages-group-key">{groupKeyLabel(group.group_key)}</span>
                  </div>
                  {usesSchedule && (
                    <button
                      type="button"
                      className="store-features-btn store-features-btn-primary"
                      disabled={saving}
                      onClick={() => saveGroup(group)}
                    >
                      {saving ? 'Saving…' : 'Save group schedule'}
                    </button>
                  )}
                </header>

                {!usesSchedule ? (
                  <div className="deposit-packages-group-fields">
                    <label className="deposit-packages-check">
                      <input
                        type="checkbox"
                        checked={groupEdits[group.id]?.is_active !== false}
                        onChange={(e) =>
                          setGroupEdits((prev) => ({
                            ...prev,
                            [group.id]: { ...prev[group.id], is_active: e.target.checked }
                          }))
                        }
                      />
                      Group active
                    </label>
                    {isWelcome && (
                      <label className="deposit-packages-welcome-limit">
                        <span>Welcome purchase limit (per user)</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className={inputClass}
                          placeholder="No section limit"
                          value={groupEdits[group.id]?.max_purchases_per_user || ''}
                          onChange={(e) =>
                            setGroupEdits((prev) => ({
                              ...prev,
                              [group.id]: {
                                ...prev[group.id],
                                max_purchases_per_user: e.target.value
                              }
                            }))
                          }
                        />
                        <small className="store-features-hint">
                          How many Welcome packages this player may buy in total. After they hit this number, the Welcome section hides on Deposit. Leave blank for no section limit.
                        </small>
                      </label>
                    )}
                    <button
                      type="button"
                      className="store-features-btn store-features-btn-secondary"
                      disabled={saving}
                      onClick={() => saveGroup(group)}
                    >
                      {saving ? 'Saving…' : 'Save group'}
                    </button>
                  </div>
                ) : (
                <div className="deposit-packages-group-fields">
                  <label>
                    <span>Starts (optional)</span>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={groupEdits[group.id]?.starts_at || ''}
                      onChange={(e) =>
                        setGroupEdits((prev) => ({
                          ...prev,
                          [group.id]: { ...prev[group.id], starts_at: e.target.value }
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Ends (optional)</span>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={groupEdits[group.id]?.ends_at || ''}
                      onChange={(e) =>
                        setGroupEdits((prev) => ({
                          ...prev,
                          [group.id]: { ...prev[group.id], ends_at: e.target.value }
                        }))
                      }
                    />
                  </label>
                  <label className="deposit-packages-check">
                    <input
                      type="checkbox"
                      checked={groupEdits[group.id]?.is_active !== false}
                      onChange={(e) =>
                        setGroupEdits((prev) => ({
                          ...prev,
                          [group.id]: { ...prev[group.id], is_active: e.target.checked }
                        }))
                      }
                    />
                    Group active
                  </label>
                </div>
                )}

                <div className="deposit-packages-table-card">
                  <div className="deposit-packages-table-header">
                    <span className="deposit-packages-table-title">Packages in this group</span>
                    <span className="deposit-packages-table-count">
                      {packages.length} package{packages.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="deposit-packages-table-wrap">
                    <table className="deposit-packages-table">
                      <thead>
                        <tr>
                          <th>SC</th>
                          <th>Actual</th>
                          <th>Price</th>
                          <th>Label</th>
                          <th>Max/user</th>
                          <th>Active</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packages.length === 0 ? (
                          <tr className="deposit-packages-table-empty">
                            <td colSpan={7}>No packages yet. Add one below.</td>
                          </tr>
                        ) : packages.map((pkg) => (
                          <tr key={pkg.id}>
                            <td><strong>{pkg.final_sc}</strong></td>
                            <td><s>{pkg.actual_price}</s></td>
                            <td>{pkg.final_price}</td>
                            <td>{pkg.discount_label || '—'}</td>
                            <td>{pkg.max_purchases_per_user ?? (isGeneral ? '∞' : '—')}</td>
                            <td>
                              <span className={`deposit-packages-status ${pkg.is_active ? 'deposit-packages-status--on' : 'deposit-packages-status--off'}`}>
                                {pkg.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="deposit-packages-row-actions">
                              <button
                                type="button"
                                className="store-features-btn store-features-btn-sm store-features-btn-outline"
                                onClick={() => startEditPackage(pkg, group.id)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="store-features-btn store-features-btn-sm store-features-btn-danger"
                                disabled={saving}
                                onClick={() => handleDeletePackage(pkg)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <form className="deposit-packages-form" onSubmit={(e) => submitPackage(e, group)}>
                  {formOpen ? (
                    <div className="deposit-packages-form-panel">
                      <h4>{editingPackageId ? 'Edit package' : 'Add package'}</h4>
                      <div className="deposit-packages-form-grid">
                        <label>
                          Title (optional)
                          <input className={inputClass} value={pkgForm.title} onChange={(e) => setPkgForm((f) => ({ ...f, title: e.target.value }))} />
                        </label>
                        <label>
                          Final SC *
                          <input className={inputClass} required type="number" step="0.01" min="0" value={pkgForm.final_sc} onChange={(e) => setPkgForm((f) => ({ ...f, final_sc: e.target.value }))} />
                        </label>
                        <label>
                          Actual price (strikethrough) *
                          <input className={inputClass} required type="number" step="0.01" min="0" value={pkgForm.actual_price} onChange={(e) => setPkgForm((f) => ({ ...f, actual_price: e.target.value }))} />
                        </label>
                        <label>
                          Final price (charge) *
                          <input className={inputClass} required type="number" step="0.01" min="0" value={pkgForm.final_price} onChange={(e) => setPkgForm((f) => ({ ...f, final_price: e.target.value }))} />
                        </label>
                        <label>
                          Discount label
                          <input className={inputClass} placeholder="50% OFF" value={pkgForm.discount_label} onChange={(e) => setPkgForm((f) => ({ ...f, discount_label: e.target.value }))} />
                        </label>
                        <label>
                          Max purchases per user{isGeneral ? ' (optional)' : ' *'}
                          <input
                            className={inputClass}
                            required={!isGeneral}
                            type="number"
                            min="1"
                            step="1"
                            placeholder={isGeneral ? 'Unlimited' : '1'}
                            value={pkgForm.max_purchases_per_user}
                            onChange={(e) => setPkgForm((f) => ({ ...f, max_purchases_per_user: e.target.value }))}
                          />
                        </label>
                        <label>
                          Sort order
                          <input className={inputClass} type="number" value={pkgForm.sort_order} onChange={(e) => setPkgForm((f) => ({ ...f, sort_order: e.target.value }))} />
                        </label>
                        {!usesSchedule ? null : (
                          <>
                            <label>
                              Starts
                              <input className={inputClass} type="datetime-local" value={pkgForm.starts_at} onChange={(e) => setPkgForm((f) => ({ ...f, starts_at: e.target.value }))} />
                            </label>
                            <label>
                              Ends
                              <input className={inputClass} type="datetime-local" value={pkgForm.ends_at} onChange={(e) => setPkgForm((f) => ({ ...f, ends_at: e.target.value }))} />
                            </label>
                          </>
                        )}
                      </div>
                      <div className="deposit-packages-form-actions">
                        <label className="deposit-packages-check">
                          <input type="checkbox" checked={pkgForm.is_active} onChange={(e) => setPkgForm((f) => ({ ...f, is_active: e.target.checked }))} />
                          Active
                        </label>
                        <button type="submit" className="store-features-btn store-features-btn-primary" disabled={saving}>
                          {saving ? 'Saving…' : (editingPackageId ? 'Update package' : 'Add package')}
                        </button>
                        {editingPackageId && (
                          <button type="button" className="store-features-btn store-features-btn-secondary" onClick={() => resetPkgForm(group.id)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="deposit-packages-add-row">
                      <button
                        type="button"
                        className="store-features-btn store-features-btn-outline"
                        onClick={() => resetPkgForm(group.id)}
                      >
                        + Add package to this group
                      </button>
                    </div>
                  )}
                </form>
              </section>
            )})
          )}
        </>
      )}
    </div>
  )
}
