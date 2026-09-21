import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../api/pushCampaigns'
import { getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import './PushCampaigns.css'

const TABS = [
  { id: 'setup', label: 'Message' },
  { id: 'testers', label: 'Test users' },
  { id: 'sends', label: 'Results' }
]

const EMPTY_DRAFT = {
  name: '',
  title: '',
  body: '',
  imageUrl: '',
  iconUrl: '',
  actionUrl: '/',
  testMode: true
}

function toDraft(c) {
  if (!c) return { ...EMPTY_DRAFT }
  return {
    name: c.name || '',
    title: c.title || '',
    body: c.body || '',
    imageUrl: c.imageUrl || '',
    iconUrl: c.iconUrl || '',
    actionUrl: c.actionUrl || '/',
    testMode: c.testMode !== false
  }
}

function payloadFromDraft(draft) {
  return {
    name: draft.name.trim(),
    title: draft.title.trim(),
    body: draft.body,
    imageUrl: draft.imageUrl.trim() || null,
    iconUrl: draft.iconUrl.trim() || null,
    actionUrl: draft.actionUrl.trim() || '/',
    testMode: draft.testMode === true
  }
}

function statusMeta(status) {
  if (status === 'sending') return { label: 'Sending…', className: 'pc-pill--sending' }
  if (status === 'sent') return { label: 'Last send done', className: 'pc-pill--sent' }
  if (status === 'failed') return { label: 'Last send failed', className: 'pc-pill--failed' }
  return { label: 'Ready', className: 'pc-pill--ready' }
}

function FileButton({ children, disabled, onFile }) {
  return (
    <label className={`pc-btn pc-btn-file ${disabled ? 'is-disabled' : ''}`}>
      {children}
      <input
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

function BrowserPreview({ draft }) {
  return (
    <div className="pc-preview-col">
      <div className="pc-preview-label">How it looks in the browser</div>
      <div className="pc-toast">
        {draft.iconUrl ? (
          <img src={draft.iconUrl} alt="" className="pc-toast-icon" />
        ) : (
          <div className="pc-toast-icon pc-toast-icon--empty" />
        )}
        <div className="pc-toast-copy">
          <div className="pc-toast-site">{typeof window !== 'undefined' ? window.location.host : 'your store'}</div>
          <div className="pc-toast-title">{draft.title || 'Notification title'}</div>
          <div className="pc-toast-body">{draft.body || 'Notification text'}</div>
        </div>
        {draft.imageUrl ? <img src={draft.imageUrl} alt="" className="pc-toast-image" /> : null}
      </div>
      <p className="pc-preview-note">
        Chrome and Windows control colors, fonts, and layout. You only choose title, text, icon, banner, and where a click opens.
      </p>
    </div>
  )
}

export default function PushCampaigns() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const [filterStore, setFilterStore] = useState('')
  const [storeOptions, setStoreOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState([])
  const [permissions, setPermissions] = useState({ granted: 0, denied: 0, default: 0, unsupported: 0, reachable: 0 })
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(() => toDraft(null))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [sending, setSending] = useState(false)
  const [testUserEmail, setTestUserEmail] = useState('')
  const [testUsers, setTestUsers] = useState([])
  const [sends, setSends] = useState([])
  const [sendStatus, setSendStatus] = useState('')
  const [sendPage, setSendPage] = useState(1)
  const [sendTotal, setSendTotal] = useState(0)
  const [sendCounts, setSendCounts] = useState({ sent: 0, failed: 0, no_token: 0, clicked: 0 })
  const [sendsLoading, setSendsLoading] = useState(false)
  const [eligibleCount, setEligibleCount] = useState(null)
  const [tab, setTab] = useState('setup')
  const sendPageSize = 25
  const sendTotalPages = Math.max(1, Math.ceil(sendTotal / sendPageSize))

  const selected = useMemo(
    () => campaigns.find((c) => c.id === selectedId) || null,
    [campaigns, selectedId]
  )

  const load = useCallback(async () => {
    try {
      const data = await api.listPushCampaigns(
        isMasterAdmin && filterStore ? { storeCode: filterStore } : {}
      )
      const list = Array.isArray(data?.campaigns) ? data.campaigns : []
      setCampaigns(list)
      if (data?.permissions) setPermissions(data.permissions)
    } catch (err) {
      toast.error(err.message || 'Failed to load push notifications.')
    } finally {
      setLoading(false)
    }
  }, [toast, isMasterAdmin, filterStore])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!isMasterAdmin) return undefined
    let cancelled = false
    getStores({ limit: 200 })
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : []
        const codes = [...new Set(list.map((s) => s.storeCode || s.store_code).filter(Boolean))].sort()
        setStoreOptions(codes)
      })
      .catch(() => {
        if (!cancelled) setStoreOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [isMasterAdmin])

  const loadSide = useCallback(
    async (id) => {
      if (!id) {
        setTestUsers([])
        setSends([])
        setSendTotal(0)
        setEligibleCount(null)
        return
      }
      try {
        const [tu, el] = await Promise.all([
          api.listPushCampaignTestUsers(id),
          api.getPushCampaignEligibleCount(id)
        ])
        setTestUsers(tu?.testUsers || [])
        setEligibleCount(el?.eligibleCount ?? null)
        if (el?.permissions) setPermissions(el.permissions)
      } catch (err) {
        toast.error(err.message || 'Failed to load notification details.')
      }
    },
    [toast]
  )

  const loadSends = useCallback(
    async (id, page = 1, status = '') => {
      if (!id) return
      setSendsLoading(true)
      try {
        const data = await api.listPushCampaignSends(id, { page, pageSize: sendPageSize, status })
        setSends(data?.sends || [])
        setSendTotal(data?.total || 0)
        if (data?.sendCounts) setSendCounts(data.sendCounts)
      } catch (err) {
        toast.error(err.message || 'Failed to load send log.')
      } finally {
        setSendsLoading(false)
      }
    },
    [toast]
  )

  function selectCampaign(c) {
    setSelectedId(c.id)
    setDraft(toDraft(c))
    setTab('setup')
    setSendPage(1)
    loadSide(c.id)
  }

  function startNew() {
    setSelectedId(null)
    setDraft(toDraft(null))
    setTestUsers([])
    setSends([])
    setEligibleCount(null)
    setTab('setup')
    setSendPage(1)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = payloadFromDraft(draft)
      if (isMasterAdmin) {
        if (!filterStore) throw new Error('Select a store first.')
        payload.storeCode = filterStore
      }
      if (selectedId) {
        const data = await api.updatePushCampaign(selectedId, payload)
        setDraft(toDraft(data?.campaign))
        toast.success('Notification saved.')
        await load()
        await loadSide(selectedId)
      } else {
        const data = await api.createPushCampaign(payload)
        const created = data?.campaign
        setSelectedId(created.id)
        setDraft(toDraft(created))
        toast.success('Notification created. Add a test user, then send a test.')
        await load()
        await loadSide(created.id)
      }
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function setAudience(testMode) {
    setDraft((prev) => ({ ...prev, testMode }))
    if (!selectedId) return
    try {
      await api.updatePushCampaign(selectedId, { testMode })
      toast.success(
        testMode
          ? 'Test mode — Send only goes to testers.'
          : 'Live mode — Send goes to everyone who allowed notifications.'
      )
      await load()
      await loadSide(selectedId)
    } catch (err) {
      toast.error(err.message || 'Could not update mode.')
      setDraft((prev) => ({ ...prev, testMode: !testMode }))
    }
  }

  async function uploadImage(field, file) {
    setUploading(field)
    try {
      const data = await api.uploadPushCampaignImage(file)
      const url = data?.url
      if (!url) throw new Error('Upload did not return a URL.')
      setDraft((prev) => ({ ...prev, [field]: url }))
      toast.success(field === 'iconUrl' ? 'Icon uploaded. Save to keep it.' : 'Banner uploaded. Save to keep it.')
    } catch (err) {
      toast.error(err.message || 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  async function addTestUser() {
    if (!selectedId) return
    const value = testUserEmail.trim()
    const asId = parseInt(value, 10)
    const body = Number.isFinite(asId) && String(asId) === value ? { userId: asId } : { email: value }
    try {
      await api.addPushCampaignTestUser(selectedId, body)
      setTestUserEmail('')
      await loadSide(selectedId)
      toast.success('Test user added.')
    } catch (err) {
      toast.error(err.message || 'Could not add user.')
    }
  }

  async function removeTestUser(id) {
    if (!selectedId) return
    try {
      await api.removePushCampaignTestUser(selectedId, id)
      await loadSide(selectedId)
    } catch (err) {
      toast.error(err.message || 'Could not remove user.')
    }
  }

  async function afterSend() {
    setTab('sends')
    setSendPage(1)
    setTimeout(() => {
      load()
      loadSide(selectedId)
      loadSends(selectedId, 1, sendStatus)
    }, 800)
  }

  async function sendToTesters() {
    if (!selectedId) return
    setSending(true)
    try {
      const data = await api.sendPushCampaignToTestUsers(selectedId)
      toast.success(data?.message || 'Sending to test users.')
      await afterSend()
    } catch (err) {
      toast.error(err.message || 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  async function deleteNotification() {
    if (!selectedId || deleting) return
    const name = draft.name || selected?.name || 'this notification'
    const ok = await confirm({
      title: 'Delete notification?',
      message: `Remove "${name}"? Send history for it is also removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    setDeleting(true)
    try {
      await api.deletePushCampaign(selectedId)
      toast.success('Notification deleted.')
      startNew()
      await load()
    } catch (err) {
      toast.error(err.message || 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  async function sendAll() {
    if (!selectedId) return
    if (draft.testMode) {
      await sendToTesters()
      return
    }
    const count = eligibleCount ?? permissions.reachable
    const ok = await confirm({
      title: 'Send to everyone who allowed?',
      message: `This sends the browser notification to about ${count} browsers that already allowed notifications. It does not send automatically later — only this click.`,
      confirmLabel: 'Send now',
      cancelLabel: 'Cancel',
      variant: 'primary'
    })
    if (!ok) return
    setSending(true)
    try {
      const data = await api.sendPushCampaign(selectedId)
      toast.success(data?.message || 'Sending.')
      await afterSend()
    } catch (err) {
      toast.error(err.message || 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  async function sendOneTest() {
    if (!selectedId || !testUserEmail.trim()) return
    const value = testUserEmail.trim()
    const asId = parseInt(value, 10)
    const body = Number.isFinite(asId) && String(asId) === value ? { userId: asId } : { email: value }
    setSending(true)
    try {
      await api.sendPushCampaignTest(selectedId, body)
      toast.success('Test notification sent.')
      await afterSend()
    } catch (err) {
      toast.error(err.message || 'Test send failed.')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (tab === 'sends' && selectedId) loadSends(selectedId, sendPage, sendStatus)
  }, [tab, selectedId, sendPage, sendStatus, loadSends])

  const isSending = sending || selected?.status === 'sending'
  useEffect(() => {
    if (!isSending) return undefined
    const timer = setInterval(() => {
      load()
      if (selectedId) {
        loadSide(selectedId)
        if (tab === 'sends') loadSends(selectedId, sendPage, sendStatus)
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [isSending, load, loadSide, loadSends, selectedId, tab, sendPage, sendStatus])

  const sendLabel = draft.testMode
    ? `Send to testers (${testUsers.length})`
    : `Send to everyone (${eligibleCount ?? permissions.reachable})`
  const sendDisabled = !selectedId || sending || (draft.testMode && !testUsers.length)

  if (loading && !campaigns.length) {
    return (
      <div className="push-campaigns-page">
        <h1>Push notifications</h1>
        <p className="pc-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="push-campaigns-page">
      <div className="pc-header">
        <div>
          <h1>Push notifications</h1>
          <p>
            Browser notifications for this store. Guests and logged-in players can receive them if they allowed once — even with the tab closed.
          </p>
        </div>
        <button type="button" className="pc-btn pc-btn-primary" onClick={startNew}>
          + New notification
        </button>
      </div>

      {isMasterAdmin ? (
        <div className="pc-guide" style={{ marginBottom: 16 }}>
          <label className="pc-field" style={{ margin: 0, maxWidth: 280 }}>
            Store
            <select value={filterStore} onChange={(e) => { setFilterStore(e.target.value); startNew() }}>
              <option value="">All stores</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <span className="pc-field-hint">Pick a store to create or send notifications for that store only.</span>
          </label>
        </div>
      ) : null}

      <div className="pc-guide">
        <div className="pc-guide-item">
          <span className="pc-guide-num">1</span>
          <div>
            <strong>Write the message</strong>
            <p>Title, text, icon, optional banner, and the page to open on click.</p>
          </div>
        </div>
        <div className="pc-guide-item">
          <span className="pc-guide-num">2</span>
          <div>
            <strong>Test on yourself</strong>
            <p>Stay in Test mode, add your user, then send. Only testers get it.</p>
          </div>
        </div>
        <div className="pc-guide-item">
          <span className="pc-guide-num">3</span>
          <div>
            <strong>Send to players</strong>
            <p>Switch to Live, then click Send. Nothing goes out until you click.</p>
          </div>
        </div>
      </div>

      <div className="pc-perm-row">
        <div className="pc-perm-card">
          <strong>{permissions.reachable}</strong>
          <span>Ready to receive</span>
        </div>
        <div className="pc-perm-card">
          <strong>{permissions.granted}</strong>
          <span>Allowed in browser</span>
        </div>
        <div className="pc-perm-card">
          <strong>{permissions.denied}</strong>
          <span>Blocked</span>
        </div>
        <div className="pc-perm-card">
          <strong>{permissions.default}</strong>
          <span>Not asked yet</span>
        </div>
        <div className="pc-perm-card">
          <strong>{permissions.unsupported || 0}</strong>
          <span>Can’t on this browser</span>
        </div>
      </div>

      <div className="pc-layout">
        <aside className="pc-list">
          <div className="pc-aside-title">Notifications</div>
          {campaigns.length === 0 && <p className="pc-empty">No notifications yet.</p>}
          {campaigns.map((c) => {
            const st = statusMeta(c.status)
            return (
              <button
                key={c.id}
                type="button"
                className={`pc-list-item ${selectedId === c.id ? 'active' : ''}`}
                onClick={() => selectCampaign(c)}
              >
                <strong>{c.name || 'Untitled'}</strong>
                <span className="pc-list-meta">
                  {isMasterAdmin && c.storeCode ? <span>{c.storeCode}</span> : null}
                  <span className={`pc-pill ${c.testMode ? 'pc-pill--test' : 'pc-pill--live'}`}>
                    {c.testMode ? 'TEST' : 'LIVE'}
                  </span>
                  <span className={`pc-pill ${st.className}`}>{st.label}</span>
                </span>
                <span className="pc-list-meta">
                  {c.sendCounts?.sent || 0} sent · {c.sendCounts?.clicked || 0} clicked
                </span>
              </button>
            )
          })}
        </aside>

        <section className="pc-main">
          <div className="pc-status-bar">
            <div>
              <div className="pc-status-name">{draft.name || (selectedId ? 'Untitled' : 'New notification')}</div>
              <div className="pc-status-sub">
                {selectedId
                  ? `${eligibleCount ?? '—'} browsers would get this send${draft.testMode ? ' after you switch to Live' : ''}`
                  : 'Save first, then test, then send.'}
              </div>
            </div>
          </div>

          <div className="pc-mode-row">
            <button
              type="button"
              className={`pc-mode-card ${draft.testMode ? 'is-on' : ''}`}
              onClick={() => setAudience(true)}
            >
              <strong>Test first</strong>
              <p>Only people on the Test users list receive a send.</p>
            </button>
            <button
              type="button"
              className={`pc-mode-card ${!draft.testMode ? 'is-live' : ''}`}
              onClick={() => setAudience(false)}
            >
              <strong>Live — everyone who allowed</strong>
              <p>Send still needs a click. Turning this on does not send by itself.</p>
            </button>
          </div>

          {draft.testMode ? (
            <div className="pc-banner pc-banner--test">
              Test mode is on. Send only goes to test users until you choose Live, then click Send.
            </div>
          ) : (
            <div className="pc-banner pc-banner--live">
              Live mode. Click Send when you are ready — it will go to about {eligibleCount ?? permissions.reachable} browsers that allowed notifications.
            </div>
          )}

          <div className="pc-tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'setup' && (
            <div className="pc-setup">
              <div className="pc-form">
                <label className="pc-field">
                  Internal name
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Weekend deposit promo"
                  />
                  <span className="pc-field-hint">Only you see this in the list on the left.</span>
                </label>
                <label className="pc-field">
                  <span className="pc-label-row">
                    Notification title
                    <span className="pc-char">{draft.title.length}/128</span>
                  </span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    maxLength={128}
                    placeholder="Bonus waiting for you"
                  />
                </label>
                <label className="pc-field">
                  Notification text
                  <textarea
                    rows={4}
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    placeholder="Come back and claim your bonus today."
                  />
                </label>
                <label className="pc-field">
                  Open this page when they click
                  <input
                    value={draft.actionUrl}
                    onChange={(e) => setDraft({ ...draft, actionUrl: e.target.value })}
                    placeholder="/deposit"
                  />
                  <span className="pc-field-hint">Use a site path like /deposit or a full https URL.</span>
                </label>

                <div className="pc-media-row">
                  <div className="pc-media-card">
                    <div className="pc-media-title">Small icon</div>
                    <p className="pc-media-hint">Square, shown next to the title.</p>
                    <div className="pc-icon-box">
                      {draft.iconUrl ? (
                        <img src={draft.iconUrl} alt="" />
                      ) : (
                        <span className="pc-media-placeholder">No icon</span>
                      )}
                    </div>
                    <div className="pc-media-actions">
                      <FileButton disabled={uploading === 'iconUrl'} onFile={(f) => uploadImage('iconUrl', f)}>
                        {uploading === 'iconUrl' ? 'Uploading…' : 'Upload icon'}
                      </FileButton>
                      {draft.iconUrl ? (
                        <button type="button" className="pc-btn pc-btn-danger" onClick={() => setDraft({ ...draft, iconUrl: '' })}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="pc-media-card">
                    <div className="pc-media-title">Banner</div>
                    <p className="pc-media-hint">Optional large image. Chrome and Android show it; some desktops hide it.</p>
                    <div className="pc-banner-box">
                      {draft.imageUrl ? (
                        <img src={draft.imageUrl} alt="" />
                      ) : (
                        <span className="pc-media-placeholder">No banner</span>
                      )}
                    </div>
                    <div className="pc-media-actions">
                      <FileButton disabled={uploading === 'imageUrl'} onFile={(f) => uploadImage('imageUrl', f)}>
                        {uploading === 'imageUrl' ? 'Uploading…' : 'Upload banner'}
                      </FileButton>
                      {draft.imageUrl ? (
                        <button type="button" className="pc-btn pc-btn-danger" onClick={() => setDraft({ ...draft, imageUrl: '' })}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <BrowserPreview draft={draft} />
            </div>
          )}

          {tab === 'testers' && (
            <div className="pc-section">
              <div className="pc-testers-head">
                <div>
                  <h3>Who gets a test send</h3>
                  <p className="pc-muted">
                    Add an account that already allowed notifications in their browser. Guests without a login cannot be added here.
                  </p>
                </div>
                <button
                  type="button"
                  className="pc-btn pc-btn-send"
                  disabled={!selectedId || !testUsers.length || sending}
                  onClick={sendToTesters}
                >
                  {sending ? 'Sending…' : `Send to all testers (${testUsers.length})`}
                </button>
              </div>
              {!selectedId && <div className="pc-banner">Save the notification first, then add testers.</div>}
              <div className="pc-test-row">
                <input
                  value={testUserEmail}
                  onChange={(e) => setTestUserEmail(e.target.value)}
                  placeholder="email or user id"
                  disabled={!selectedId}
                />
                <button type="button" className="pc-btn" onClick={addTestUser} disabled={!selectedId}>
                  Add
                </button>
                <button
                  type="button"
                  className="pc-btn pc-btn-primary"
                  onClick={sendOneTest}
                  disabled={!selectedId || !testUserEmail.trim() || sending}
                >
                  Send to this user
                </button>
              </div>
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>{showPlayerEmail ? 'Email' : 'User ID'}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {testUsers.map((t) => (
                    <tr key={t.id}>
                      <td>{t.user?.username || t.userId}</td>
                      <td>{showPlayerEmail ? t.user?.email || '—' : t.userId || '—'}</td>
                      <td>
                        <button type="button" className="pc-btn pc-btn-danger" onClick={() => removeTestUser(t.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!testUsers.length && (
                    <tr>
                      <td colSpan={3} className="pc-muted">
                        No test users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'sends' && (
            <div>
              <div className="pc-sends-toolbar">
                <div className="pc-send-stats">
                  <span className="pc-stat-chip">Sent {sendCounts.sent || 0}</span>
                  <span className="pc-stat-chip">Clicked {sendCounts.clicked || 0}</span>
                  <span className="pc-stat-chip">Failed {sendCounts.failed || 0}</span>
                  <span className="pc-stat-chip">No token {sendCounts.no_token || 0}</span>
                </div>
                <select
                  value={sendStatus}
                  onChange={(e) => {
                    setSendStatus(e.target.value)
                    setSendPage(1)
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="sent">Sent</option>
                  <option value="clicked">Clicked</option>
                  <option value="failed">Failed</option>
                  <option value="no_token">No token</option>
                </select>
                <button
                  type="button"
                  className="pc-btn"
                  onClick={() => loadSends(selectedId, sendPage, sendStatus)}
                  disabled={!selectedId || sendsLoading}
                >
                  Refresh
                </button>
              </div>
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th>Clicked</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((s) => (
                    <tr key={s.id}>
                      <td>{showPlayerEmail ? s.user?.email || s.userId || 'Guest browser' : s.userId || 'Guest'}</td>
                      <td>{s.status}</td>
                      <td>{s.sentAt ? new Date(s.sentAt).toLocaleString() : '—'}</td>
                      <td>{s.clickedAt ? new Date(s.clickedAt).toLocaleString() : '—'}</td>
                      <td className="pc-muted">{s.error || ''}</td>
                    </tr>
                  ))}
                  {!sends.length && (
                    <tr>
                      <td colSpan={5} className="pc-muted">
                        {sendsLoading ? 'Loading…' : 'No sends yet. Use Send at the bottom after you save.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {sendTotalPages > 1 && (
                <div className="pc-pager">
                  <button type="button" className="pc-btn" disabled={sendPage <= 1} onClick={() => setSendPage((p) => p - 1)}>
                    Prev
                  </button>
                  <span className="pc-muted">
                    Page {sendPage} / {sendTotalPages}
                  </span>
                  <button
                    type="button"
                    className="pc-btn"
                    disabled={sendPage >= sendTotalPages}
                    onClick={() => setSendPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="pc-actions">
            <button type="button" className="pc-btn pc-btn-primary" onClick={save} disabled={saving || deleting}>
              {saving ? 'Saving…' : selectedId ? 'Save' : 'Create notification'}
            </button>
            <button type="button" className="pc-btn pc-btn-send" onClick={sendAll} disabled={sendDisabled || deleting}>
              {sending ? 'Sending…' : sendLabel}
            </button>
            {draft.testMode && selectedId && !testUsers.length ? (
              <span className="pc-muted">Add a test user first, or switch to Live to send to everyone.</span>
            ) : null}
            {selectedId ? (
              <button
                type="button"
                className="pc-btn pc-btn-danger"
                onClick={deleteNotification}
                disabled={deleting || sending || selected?.status === 'sending'}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
