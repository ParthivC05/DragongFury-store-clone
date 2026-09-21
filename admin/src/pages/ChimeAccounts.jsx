import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getChimeDepositReceiveAccounts,
  putChimeDepositReceiveAccounts,
  uploadChimeDepositQr,
  getStores
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './ChimeCashappWithdrawals.css'
import './ChimeDeposits.css'
import './Users.css'

function newRowId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export default function ChimeAccounts() {
  const { user } = useAuth()
  const toast = useToast()

  const [storeList, setStoreList] = useState([])
  const [storePickerIndex, setStorePickerIndex] = useState(-1)
  const [accountRows, setAccountRows] = useState([])
  const [receiveLoading, setReceiveLoading] = useState(false)
  const [receiveSaving, setReceiveSaving] = useState(false)
  const [deletingAccountId, setDeletingAccountId] = useState(null)
  const [uploadingQrId, setUploadingQrId] = useState(null)
  const storesFetched = useRef(false)

  const needsStorePicker = user?.role === ROLES.MASTER_ADMIN || user?.role === ROLES.DISTRIBUTOR_ADMIN
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN

  const canManagePayToAccounts = useMemo(() => {
    if (!user) return false
    return user.role === ROLES.MASTER_ADMIN || user.role === ROLES.DISTRIBUTOR_ADMIN || user.role === ROLES.STORE_ADMIN
  }, [user])

  useEffect(() => {
    if (!user || !needsStorePicker || storesFetched.current) return
    storesFetched.current = true
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((res) => setStoreList(Array.isArray(res.list) ? res.list : []))
      .catch(() => setStoreList([]))
  }, [user, needsStorePicker])

  function accountsFromRows() {
    return accountRows
      .map((r) => ({
        username: String(r.value || '').trim(),
        qrUrl: String(r.qrUrl || '').trim(),
        appLink: String(r.appLink || '').trim()
      }))
      .filter((a) => a.username.length >= 2)
  }

  function applyLoadedAccounts(data) {
    const accounts = Array.isArray(data?.accounts)
      ? data.accounts
      : Array.isArray(data?.usernames)
        ? data.usernames.map((u) => ({ username: u, qrUrl: '', appLink: '' }))
        : []
    if (accounts.length === 0) {
      setAccountRows([])
      return
    }
    setAccountRows(
      accounts.map((acc) => {
        const value = typeof acc === 'string' ? acc : acc.username
        const qrUrl = typeof acc === 'string' ? '' : acc.qrUrl || ''
        const appLink = typeof acc === 'string' ? '' : acc.appLink || ''
        return {
          id: newRowId(),
          value,
          qrUrl,
          appLink,
          persistedValue: value,
          isPersisted: true
        }
      })
    )
  }

  const fetchReceiveAccounts = useCallback(() => {
    if (needsStorePicker) {
      if (storePickerIndex < 0 || !storeList[storePickerIndex]) {
        setAccountRows([])
        return Promise.resolve()
      }
      const s = storeList[storePickerIndex]
      setReceiveLoading(true)
      return getChimeDepositReceiveAccounts({
        storeCode: s.storeCode,
        distributorCode: s.distributorCode
      })
        .then((res) => {
          applyLoadedAccounts(res?.data)
        })
        .catch((err) => {
          toast.error(err.message || 'Failed to load pay-to accounts')
          setAccountRows([])
        })
        .finally(() => setReceiveLoading(false))
    }
    setReceiveLoading(true)
    return getChimeDepositReceiveAccounts({})
      .then((res) => {
        applyLoadedAccounts(res?.data)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load pay-to accounts')
        setAccountRows([])
      })
      .finally(() => setReceiveLoading(false))
  }, [needsStorePicker, storePickerIndex, storeList, toast])

  useEffect(() => {
    if (!user || !canManagePayToAccounts) return
    if (needsStorePicker && storePickerIndex < 0) {
      setAccountRows([])
      return
    }
    fetchReceiveAccounts()
  }, [user, canManagePayToAccounts, needsStorePicker, storePickerIndex, fetchReceiveAccounts])

  function addAccountRow() {
    setAccountRows((rows) => [
      ...rows,
      { id: newRowId(), value: '', qrUrl: '', appLink: '', persistedValue: '', isPersisted: false }
    ])
  }

  function updateAccountRow(id, value) {
    setAccountRows((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)))
  }

  function updateAccountField(id, field, value) {
    setAccountRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  async function handleQrFileChange(id, file) {
    if (!file) return
    setUploadingQrId(id)
    try {
      const res = await uploadChimeDepositQr(file)
      const url = res?.data?.url
      if (!url) throw new Error('Upload did not return a URL.')
      updateAccountField(id, 'qrUrl', url)
      toast.success('QR uploaded. Remember to save.')
    } catch (err) {
      toast.error(err.message || 'QR upload failed.')
    } finally {
      setUploadingQrId(null)
    }
  }

  function buildReceiveAccountsBody(accounts) {
    const body = { accounts }
    if (needsStorePicker) {
      if (storePickerIndex < 0 || !storeList[storePickerIndex]) {
        toast.error('Select a store first.')
        return null
      }
      const s = storeList[storePickerIndex]
      body.storeCode = s.storeCode
      body.distributorCode = s.distributorCode
    }
    return body
  }

  async function removeAccountRow(id) {
    const row = accountRows.find((r) => r.id === id)
    if (!row) return

    if (!row.isPersisted) {
      setAccountRows((rows) => rows.filter((r) => r.id !== id))
      return
    }

    const persistedRowsAfterDelete = accountRows.filter((r) => r.isPersisted && r.id !== id)
    const accounts = persistedRowsAfterDelete
      .map((r) => ({
        username: String(r.persistedValue || r.value || '').trim(),
        qrUrl: String(r.qrUrl || '').trim(),
        appLink: String(r.appLink || '').trim()
      }))
      .filter((a) => a.username.length >= 2)
    const body = buildReceiveAccountsBody(accounts)
    if (!body) return

    setDeletingAccountId(id)
    try {
      await putChimeDepositReceiveAccounts(body)
      toast.success('Chime account deleted.')
      await fetchReceiveAccounts()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    } finally {
      setDeletingAccountId(null)
    }
  }

  async function saveReceiveAccounts() {
    const accounts = accountsFromRows()
    setReceiveSaving(true)
    try {
      const body = buildReceiveAccountsBody(accounts)
      if (!body) return
      await putChimeDepositReceiveAccounts(body)
      toast.success('Pay-to Chime accounts saved.')
      await fetchReceiveAccounts()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setReceiveSaving(false)
    }
  }

  const canEditAccounts = !needsStorePicker || storePickerIndex >= 0
  const saveDisabled = receiveSaving || !canEditAccounts || receiveLoading || deletingAccountId != null

  if (!canManagePayToAccounts) {
    return (
      <div className="ccw-page ccd-page">
        <header className="ccw-header">
          <h1 className="ccw-title">Chime accounts</h1>
          <p className="ccw-subtitle">You do not have permission to manage pay-to Chime accounts.</p>
        </header>
      </div>
    )
  }

  return (
    <div className="ccw-page ccd-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Chime accounts</h1>
        <p className="ccw-subtitle">
          Configure pay-to Chime accounts. Players are assigned one at random when they open the Chime deposit flow.
        </p>
      </header>

      <section className="ccd-accounts-panel" aria-label="Manage pay-to Chime accounts">
        <p className="ccd-accounts-hint">
          Add Chime $Cashtags or display names. Players see one account at random each time they open the deposit flow. Each request stores which account they were told to pay.
        </p>

        {needsStorePicker && (
          <label className="ccw-filter-label" style={{ display: 'block', width: '100%' }}>
            Select store
            <select
              className="ccw-select ccd-store-select"
              value={storePickerIndex}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setStorePickerIndex(Number.isFinite(v) ? v : -1)
              }}
              aria-label="Select distributor and store"
            >
              <option value={-1}>Choose a store…</option>
              {storeList.map((s, idx) => (
                <option key={s.userId ?? `${s.distributorCode}-${s.storeCode}-${idx}`} value={idx}>
                  {s.storeCode || '—'} · {s.distributorCode || '—'}
                  {s.firstName || s.lastName
                    ? ` — ${[s.firstName, s.lastName].filter(Boolean).join(' ')}`
                    : s.email
                      ? ` — ${s.email}`
                      : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {needsStorePicker && storePickerIndex < 0 ? (
          <div className="ccd-empty-scope">Select a store to view and edit pay-to Chime accounts.</div>
        ) : receiveLoading ? (
          <p className="ccw-loading">Loading accounts…</p>
        ) : (
          <>
            {accountRows.length === 0 && (
              <div className="ccd-onboard-empty" role="status">
                <strong>
                  {isStoreAdmin
                    ? 'Add your Chime pay-to accounts'
                    : 'No Chime accounts for this store yet'}
                </strong>
                <p>
                  {isStoreAdmin
                    ? 'You have not added any pay-to Chime names yet. Players cannot use Chime deposits until you add at least one $Cashtag or display name below. Click “Add new Chime account”, enter where players should send money, then save.'
                    : 'This store has no pay-to accounts configured. Add at least one $Cashtag or display name so players can use Chime deposits. Use “Add new Chime account”, fill in the details, then save.'}
                </p>
              </div>
            )}

            <button
              type="button"
              className="ccd-add-chime-btn"
              onClick={addAccountRow}
              disabled={!canEditAccounts}
            >
              Add new Chime account
            </button>

            {accountRows.map((row) => (
              <div key={row.id} className="ccd-account-row ccd-account-row--rich">
                <div className="ccd-account-main">
                  <input
                    type="text"
                    className="ccd-account-input"
                    placeholder="$YourChimeHandle"
                    value={row.value}
                    onChange={(e) => updateAccountRow(row.id, e.target.value)}
                    disabled={!canEditAccounts}
                    autoComplete="off"
                    aria-label="Chime pay-to name"
                  />
                  <button
                    type="button"
                    className="ccd-delete-chime-btn"
                    onClick={() => removeAccountRow(row.id)}
                    disabled={!canEditAccounts || deletingAccountId != null}
                    title="Remove"
                    aria-label="Remove this account"
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div className="ccd-account-extra">
                  <label className="ccd-account-field">
                    <span className="ccd-account-field-label">Open Chime App link</span>
                    <input
                      type="url"
                      className="ccd-account-input"
                      placeholder="https://..."
                      value={row.appLink || ''}
                      onChange={(e) => updateAccountField(row.id, 'appLink', e.target.value)}
                      disabled={!canEditAccounts}
                      autoComplete="off"
                    />
                  </label>

                  <div className="ccd-account-field">
                    <span className="ccd-account-field-label">Deposit QR code</span>
                    <div className="ccd-account-qr">
                      {row.qrUrl ? (
                        <img src={row.qrUrl} alt="Chime QR preview" className="ccd-account-qr-preview" />
                      ) : (
                        <div className="ccd-account-qr-placeholder">No QR</div>
                      )}
                      <div className="ccd-account-qr-actions">
                        <label className="admin-btn admin-btn-sm admin-btn-secondary ccd-account-qr-upload">
                          {uploadingQrId === row.id ? 'Uploading…' : row.qrUrl ? 'Replace QR' : 'Upload QR'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            hidden
                            disabled={!canEditAccounts || uploadingQrId != null}
                            onChange={(e) => {
                              handleQrFileChange(row.id, e.target.files?.[0])
                              e.target.value = ''
                            }}
                          />
                        </label>
                        {row.qrUrl ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-outline"
                            onClick={() => updateAccountField(row.id, 'qrUrl', '')}
                            disabled={!canEditAccounts}
                          >
                            Remove QR
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="ccd-save-row">
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-success"
                disabled={saveDisabled}
                onClick={() => saveReceiveAccounts()}
              >
                {receiveSaving ? 'Saving…' : 'Save accounts'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
