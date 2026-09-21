import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../api/emailCampaigns'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import './WalletLimits.css'
import './EmailCampaigns.css'

const TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'preview', label: 'Preview' },
  { id: 'testers', label: 'Test users' },
  { id: 'sends', label: 'Send log' }
]

const EMPTY_DRAFT = {
  name: '',
  triggerDays: 3,
  isEnabled: false,
  testMode: true,
  subject: '{{firstName}}, your DragonFury bonus is waiting',
  preheader: 'Claim your exclusive deposit bonus today.',
  discountCode: '',
  discountValueType: 'percentage',
  discountValue: '',
  logoUrl: '',
  bannerUrl: ''
}

function toDraft(c) {
  if (!c) return { ...EMPTY_DRAFT }
  return {
    name: c.name || '',
    triggerDays: c.triggerDays ?? 3,
    isEnabled: c.isEnabled === true,
    testMode: c.testMode !== false,
    subject: c.subject || EMPTY_DRAFT.subject,
    preheader: c.preheader || EMPTY_DRAFT.preheader,
    discountCode: c.discountCode || '',
    discountValueType: c.discountValueType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: c.discountValue != null ? String(c.discountValue) : '',
    logoUrl: c.logoUrl || '',
    bannerUrl: c.bannerUrl || ''
  }
}

function payloadFromDraft(draft) {
  return {
    name: draft.name.trim(),
    triggerDays: Number(draft.triggerDays) || 3,
    isEnabled: draft.isEnabled === true,
    testMode: draft.testMode === true,
    subject: draft.subject,
    preheader: draft.preheader || null,
    discountCode: draft.discountCode.trim().toUpperCase() || null,
    discountValueType: draft.discountValueType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: draft.discountValue !== '' ? Number(draft.discountValue) : null,
    logoUrl: draft.logoUrl.trim() || null,
    bannerUrl: draft.bannerUrl.trim() || null,
    contentMode: 'global',
    bodyHtml: null,
    blocks: []
  }
}

function StatusPill({ on, onLabel, offLabel }) {
  return <span className={`ec-pill ${on ? 'ec-pill--on' : 'ec-pill--off'}`}>{on ? onLabel : offLabel}</span>
}

export default function EmailCampaigns() {
  const toast = useToast()
  const { user } = useAuth()
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(() => toDraft(null))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [sendingTests, setSendingTests] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewMode, setPreviewMode] = useState('desktop')
  const [testUserEmail, setTestUserEmail] = useState('')
  const [testUsers, setTestUsers] = useState([])
  const [sends, setSends] = useState([])
  const [sendStatus, setSendStatus] = useState('')
  const [sendSearch, setSendSearch] = useState('')
  const [sendSearchApplied, setSendSearchApplied] = useState('')
  const [sendPage, setSendPage] = useState(1)
  const [sendTotal, setSendTotal] = useState(0)
  const [sendsLoading, setSendsLoading] = useState(false)
  const sendPageSize = 25
  const [expandedSendId, setExpandedSendId] = useState(null)
  const [syncingDelivery, setSyncingDelivery] = useState(false)
  const [eligibleCount, setEligibleCount] = useState(null)
  const [tab, setTab] = useState('setup')

  const sendTotalPages = Math.max(1, Math.ceil(sendTotal / sendPageSize))

  const codePreview = (draft.discountCode || 'YOURCODE').trim().toUpperCase() || 'YOURCODE'
  const discountSummary = useMemo(() => {
    const code = draft.discountCode.trim().toUpperCase()
    if (!code || draft.discountValue === '') return 'Add a discount code below'
    if (draft.discountValueType === 'fixed') return `${code} · +${draft.discountValue} SC`
    return `${code} · ${draft.discountValue}% bonus`
  }, [draft.discountCode, draft.discountValue, draft.discountValueType])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listEmailCampaigns()
      const list = Array.isArray(data?.campaigns) ? data.campaigns : []
      setCampaigns(list)
      if (selectedId) {
        const cur = list.find((c) => c.id === selectedId)
        if (cur) setDraft(toDraft(cur))
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load campaigns.')
    } finally {
      setLoading(false)
    }
  }, [toast, selectedId])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          api.listEmailCampaignTestUsers(id),
          api.getEmailCampaignEligibleCount(id)
        ])
        setTestUsers(tu?.testUsers || [])
        setEligibleCount(el?.eligibleCount ?? null)
      } catch (err) {
        toast.error(err.message || 'Failed to load campaign details.')
      }
    },
    [toast]
  )

  useEffect(() => {
    if (selectedId) loadSide(selectedId)
  }, [selectedId, loadSide])

  const refreshSends = useCallback(async () => {
    if (!selectedId) {
      setSends([])
      setSendTotal(0)
      return
    }
    setSendsLoading(true)
    try {
      const sd = await api.listEmailCampaignSends(selectedId, {
        page: sendPage,
        limit: sendPageSize,
        status: sendStatus || undefined,
        search: sendSearchApplied || undefined
      })
      setSends(sd?.list || [])
      setSendTotal(Number(sd?.total) || 0)
    } catch (err) {
      toast.error(err.message || 'Failed to load sends.')
    } finally {
      setSendsLoading(false)
    }
  }, [selectedId, sendPage, sendPageSize, sendStatus, sendSearchApplied, toast])

  // Auto-load when opening Send log (and when filters/page change)
  useEffect(() => {
    if (tab === 'sends' && selectedId) {
      refreshSends()
    }
  }, [tab, selectedId, refreshSends])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSendPage(1)
      setSendSearchApplied(sendSearch.trim())
    }, 350)
    return () => clearTimeout(t)
  }, [sendSearch])

  useEffect(() => {
    setSendPage(1)
  }, [sendStatus, selectedId])

  const selectCampaign = (c) => {
    setSelectedId(c.id)
    setDraft(toDraft(c))
    setTab('setup')
    setPreviewHtml('')
  }

  const startNew = () => {
    setSelectedId(null)
    setDraft(toDraft(null))
    setPreviewHtml('')
    setTestUsers([])
    setSends([])
    setSendTotal(0)
    setSendPage(1)
    setSendSearch('')
    setSendSearchApplied('')
    setEligibleCount(null)
    setTab('setup')
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = payloadFromDraft(draft)
      if (!body.name) throw new Error('Give the campaign a name.')
      if (!body.discountCode || body.discountValue == null || Number.isNaN(body.discountValue)) {
        throw new Error('Enter a discount code and value.')
      }
      let res
      if (selectedId) {
        res = await api.updateEmailCampaign(selectedId, body)
      } else {
        res = await api.createEmailCampaign(body)
      }
      const campaign = res?.campaign
      toast.success(selectedId ? 'Saved.' : 'Campaign created.')
      await load()
      if (campaign?.id) {
        setSelectedId(campaign.id)
        setDraft(toDraft(campaign))
        await loadSide(campaign.id)
      }
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const runPreview = async () => {
    try {
      const body = payloadFromDraft(draft)
      const res = await api.previewEmailCampaign(null, body)
      setPreviewHtml(res?.htmlPart || '')
      setTab('preview')
    } catch (err) {
      toast.error(err.message || 'Preview failed.')
    }
  }

  const addTestUser = async () => {
    if (!selectedId) {
      toast.error('Save the campaign first.')
      return
    }
    try {
      await api.addEmailCampaignTestUser(selectedId, { email: testUserEmail })
      setTestUserEmail('')
      toast.success('Test user added.')
      await loadSide(selectedId)
    } catch (err) {
      toast.error(err.message || 'Failed to add test user.')
    }
  }

  const removeTestUser = async (testUserId) => {
    try {
      await api.removeEmailCampaignTestUser(selectedId, testUserId)
      await loadSide(selectedId)
    } catch (err) {
      toast.error(err.message || 'Remove failed.')
    }
  }

  const sendToAllTestUsers = async () => {
    if (!selectedId) {
      toast.error('Save the campaign first.')
      return
    }
    if (!testUsers.length) {
      toast.error('Add at least one test user first.')
      return
    }
    setSendingTests(true)
    try {
      const res = await api.sendEmailCampaignToTestUsers(selectedId, {})
      toast.success(`Sent ${res?.sent || 0} of ${res?.total || 0} emails.`)
      await loadSide(selectedId)
      setTab('sends')
    } catch (err) {
      toast.error(err.message || 'Send failed.')
    } finally {
      setSendingTests(false)
    }
  }

  const sendToOneTestUser = async (testUserId) => {
    if (!selectedId) return
    setSendingTests(true)
    try {
      const res = await api.sendEmailCampaignToTestUsers(selectedId, { testUserId })
      toast.success(res?.sent ? 'Email sent.' : 'Send finished.')
      await loadSide(selectedId)
    } catch (err) {
      toast.error(err.message || 'Send failed.')
    } finally {
      setSendingTests(false)
    }
  }

  const uploadImage = async (field, file) => {
    if (!file) return
    setUploading(field)
    try {
      const data = await api.uploadEmailCampaignImage(file)
      const url = data?.url || data?.data?.url
      if (!url) throw new Error('Upload did not return a URL.')
      setDraft((d) => ({ ...d, [field]: url }))
      toast.success(field === 'logoUrl' ? 'Logo uploaded.' : 'Banner uploaded.')
    } catch (err) {
      toast.error(err.message || 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  const syncCampaignDeliveryLogs = async () => {
    if (!selectedId) return
    setSyncingDelivery(true)
    try {
      const res = await api.syncEmailCampaignDelivery(selectedId)
      toast.success(`Synced delivery for ${res?.checked ?? 0} recent send(s).`)
      await refreshSends()
    } catch (err) {
      toast.error(err.message || 'Delivery sync failed.')
    } finally {
      setSyncingDelivery(false)
    }
  }

  const syncOneSendDelivery = async (sendId) => {
    if (!selectedId || !sendId) return
    setSyncingDelivery(true)
    try {
      const res = await api.syncEmailCampaignSendDelivery(selectedId, sendId)
      const updated = res?.send
      if (updated) {
        setSends((list) => list.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
      }
      toast.success(res?.imported ? `Imported ${res.imported} delivery event(s).` : 'Delivery refreshed.')
    } catch (err) {
      toast.error(err.message || 'Delivery sync failed.')
    } finally {
      setSyncingDelivery(false)
    }
  }

  const quickToggle = async (patch) => {
    if (!selectedId) {
      setDraft((d) => ({ ...d, ...patch }))
      return
    }
    try {
      const body = { ...payloadFromDraft(draft), ...patch }
      const res = await api.updateEmailCampaign(selectedId, body)
      const campaign = res?.campaign
      if (campaign) {
        setDraft(toDraft(campaign))
        setCampaigns((list) => list.map((c) => (c.id === campaign.id ? { ...c, ...campaign } : c)))
      }
      toast.success('Updated.')
    } catch (err) {
      toast.error(err.message || 'Update failed.')
    }
  }

  if (loading) {
    return (
      <div className="page-wrap">
        <h1>Email campaigns</h1>
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="page-wrap email-campaigns-page">
      <div className="email-campaigns-header">
        <div>
          <h1>Email campaigns</h1>
          <p className="muted">DragonFury only · set code + optional images · preview · send to test users</p>
        </div>
        <button type="button" className="btn primary" onClick={startNew}>
          + New campaign
        </button>
      </div>

      <div className="email-campaigns-layout">
        <aside className="email-campaigns-list">
          <div className="ec-aside-title">Campaigns</div>
          {campaigns.length === 0 && <p className="muted ec-empty">No campaigns yet.</p>}
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`email-campaigns-list-item ${selectedId === c.id ? 'active' : ''}`}
              onClick={() => selectCampaign(c)}
            >
              <strong>{c.name}</strong>
              <span className="ec-list-meta">
                <StatusPill on={c.isEnabled} onLabel="ON" offLabel="OFF" />
                <StatusPill on={c.testMode} onLabel="TEST" offLabel="LIVE" />
                <span>Day {c.triggerDays}</span>
              </span>
              {c.discountCode && <span className="ec-list-code">{c.discountCode}</span>}
            </button>
          ))}
        </aside>

        <section className="email-campaigns-main panel">
          <div className="ec-status-bar">
            <div className="ec-status-bar-left">
              <div className="ec-status-name">{draft.name || (selectedId ? 'Untitled' : 'New campaign')}</div>
              <div className="ec-status-sub">{discountSummary}</div>
              {selectedId != null && <div className="ec-status-sub">Eligible: {eligibleCount ?? '—'}</div>}
            </div>
            <div className="ec-toggles">
              <label className={`ec-switch ${draft.isEnabled ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={draft.isEnabled}
                  onChange={(e) => quickToggle({ isEnabled: e.target.checked })}
                />
                <span>{draft.isEnabled ? 'ON' : 'OFF'}</span>
              </label>
              <label className={`ec-switch ${draft.testMode ? 'on test' : ''}`}>
                <input
                  type="checkbox"
                  checked={draft.testMode}
                  onChange={(e) => quickToggle({ testMode: e.target.checked })}
                />
                <span>{draft.testMode ? 'Test' : 'Live'}</span>
              </label>
            </div>
          </div>

          {draft.testMode && (
            <div className="ec-banner ec-banner--test">Test mode — only Test users get mail from cron / manual send.</div>
          )}
          {!draft.isEnabled && <div className="ec-banner">Campaign is OFF — cron will not send.</div>}

          <div className="email-campaigns-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'setup' && (
            <div className="email-campaigns-editor">
              <div className="ec-section ec-section--offer">
                <h3>Discount code</h3>
                <div className="ec-code-hero">
                  <div className="ec-code-hero-label">Shown in email</div>
                  <div className="ec-code-hero-value">{codePreview}</div>
                </div>
                <div className="form-grid form-grid--3">
                  <label>
                    Code
                    <input
                      value={draft.discountCode}
                      onChange={(e) => setDraft({ ...draft, discountCode: e.target.value.toUpperCase() })}
                      placeholder="COMEBACK20"
                      className="ec-code-input"
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={draft.discountValueType}
                      onChange={(e) => setDraft({ ...draft, discountValueType: e.target.value })}
                    >
                      <option value="percentage">% of deposit</option>
                      <option value="fixed">Fixed SC</option>
                    </select>
                  </label>
                  <label>
                    {draft.discountValueType === 'fixed' ? 'SC amount' : 'Percent'}
                    <input
                      type="number"
                      min={0}
                      value={draft.discountValue}
                      onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })}
                      placeholder="20"
                    />
                  </label>
                </div>
              </div>

              <div className="ec-section">
                <h3>Campaign</h3>
                <div className="form-grid">
                  <label className="ec-span-2">
                    Name
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="No deposit day 3"
                    />
                  </label>
                  <label>
                    Days after signup
                    <input
                      type="number"
                      min={1}
                      value={draft.triggerDays}
                      onChange={(e) => setDraft({ ...draft, triggerDays: e.target.value })}
                    />
                  </label>
                  <label className="ec-span-2">
                    Subject
                    <input
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="ec-section">
                <h3>Images (optional)</h3>
                <p className="muted">Skip to hide. No logo → “DRAGONFURY” text. No banner → hidden.</p>
                <div className="ec-media-grid">
                  <div className="ec-media-card">
                    <div className="ec-media-title">Logo</div>
                    {draft.logoUrl ? (
                      <img src={draft.logoUrl} alt="" className="ec-media-preview ec-media-preview--logo" />
                    ) : (
                      <div className="ec-media-placeholder">No logo</div>
                    )}
                    <label className="ec-file-label">
                      {uploading === 'logoUrl' ? 'Uploading…' : 'Upload logo'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={!!uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadImage('logoUrl', f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {draft.logoUrl && (
                      <button type="button" className="btn ec-btn-danger" onClick={() => setDraft({ ...draft, logoUrl: '' })}>
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="ec-media-card">
                    <div className="ec-media-title">Banner</div>
                    {draft.bannerUrl ? (
                      <img src={draft.bannerUrl} alt="" className="ec-media-preview" />
                    ) : (
                      <div className="ec-media-placeholder">No banner</div>
                    )}
                    <label className="ec-file-label">
                      {uploading === 'bannerUrl' ? 'Uploading…' : 'Upload banner'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={!!uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadImage('bannerUrl', f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {draft.bannerUrl && (
                      <button type="button" className="btn ec-btn-danger" onClick={() => setDraft({ ...draft, bannerUrl: '' })}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'preview' && (
            <div>
              <div className="email-campaigns-actions">
                <button type="button" className={`btn ${previewMode === 'desktop' ? 'primary' : ''}`} onClick={() => setPreviewMode('desktop')}>Desktop</button>
                <button type="button" className={`btn ${previewMode === 'mobile' ? 'primary' : ''}`} onClick={() => setPreviewMode('mobile')}>Mobile</button>
                <button type="button" className="btn" onClick={runPreview}>Refresh preview</button>
              </div>
              <div className={`email-preview-frame ${previewMode}`}>
                {previewHtml ? (
                  <iframe title="preview" srcDoc={previewHtml} />
                ) : (
                  <p className="muted ec-empty">Click Refresh preview.</p>
                )}
              </div>
            </div>
          )}

          {tab === 'testers' && (
            <div>
              <div className="ec-section">
                <div className="ec-testers-head">
                  <div>
                    <h3>Test users</h3>
                    <p className="muted">Add DragonFury users, then send the campaign email manually.</p>
                  </div>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!selectedId || !testUsers.length || sendingTests}
                    onClick={sendToAllTestUsers}
                  >
                    {sendingTests ? 'Sending…' : `Send email to all (${testUsers.length})`}
                  </button>
                </div>
                {!selectedId && <p className="ec-banner">Save the campaign first.</p>}
                <div className="ec-test-row">
                  <input
                    value={testUserEmail}
                    onChange={(e) => setTestUserEmail(e.target.value)}
                    placeholder="user@email.com"
                    disabled={!selectedId}
                  />
                  <button type="button" className="btn primary" onClick={addTestUser} disabled={!selectedId}>
                    Add
                  </button>
                </div>
                <table className="data-table">
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
                        <td>
                          {showPlayerEmail ? (
                            t.user?.username || t.userId
                          ) : (
                            <>
                              <div>{t.userId || t.user?.userId || '—'}</div>
                              {t.user?.username ? (
                                <div className="muted">@{t.user.username}</div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td>
                          {showPlayerEmail
                            ? (t.user?.email || t.email || '—')
                            : (t.userId || t.user?.userId || '—')}
                        </td>
                        <td className="ec-row-actions">
                          <button
                            type="button"
                            className="btn"
                            disabled={sendingTests}
                            onClick={() => sendToOneTestUser(t.id)}
                          >
                            Send
                          </button>
                          <button type="button" className="btn ec-btn-danger" onClick={() => removeTestUser(t.id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!testUsers.length && <p className="muted">No test users yet.</p>}
              </div>
            </div>
          )}

          {tab === 'sends' && (
            <div>
              <div className="email-campaigns-actions ec-sends-toolbar">
                <input
                  type="search"
                  className="ec-sends-search"
                  placeholder="Search email, username, user id, error…"
                  value={sendSearch}
                  onChange={(e) => setSendSearch(e.target.value)}
                  disabled={!selectedId}
                />
                <select
                  value={sendStatus}
                  onChange={(e) => setSendStatus(e.target.value)}
                  disabled={!selectedId}
                >
                  <option value="">All</option>
                  <option value="pending">pending</option>
                  <option value="pending_retry">pending_retry</option>
                  <option value="sent">sent</option>
                  <option value="failed">failed</option>
                  <option value="failed_final">failed_final</option>
                  <option value="skipped">skipped</option>
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={refreshSends}
                  disabled={!selectedId || sendsLoading}
                >
                  {sendsLoading ? 'Loading…' : 'Refresh'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={syncCampaignDeliveryLogs}
                  disabled={!selectedId || syncingDelivery}
                >
                  {syncingDelivery ? 'Syncing…' : 'Pull Mailgun delivery'}
                </button>
              </div>
              <div className="ec-sends-meta muted">
                {selectedId
                  ? sendsLoading
                    ? 'Loading send log…'
                    : `${sendTotal.toLocaleString()} total · newest activity first · page ${sendPage} of ${sendTotalPages}`
                  : 'Select a campaign to view send logs.'}
              </div>
              <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>User</th>
                      <th>{showPlayerEmail ? 'Email' : 'User ID'}</th>
                      <th>Mail</th>
                      <th>Delivery</th>
                      <th>Attempts</th>
                      <th>Claim</th>
                      <th>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sends.map((s) => {
                      const open = expandedSendId === s.id
                      const deliveryText =
                        s.error ||
                        (Array.isArray(s.deliveryMessages) && s.deliveryMessages[0]?.error) ||
                        null
                      const activityAt = s.lastAttemptAt || s.sentAt || s.createdAt
                      return (
                        <Fragment key={s.id}>
                          <tr>
                            <td>
                              <button
                                type="button"
                                className="btn ec-btn-tiny"
                                onClick={() => setExpandedSendId(open ? null : s.id)}
                              >
                                {open ? 'Hide' : 'Logs'}
                              </button>
                            </td>
                            <td>
                              {showPlayerEmail ? (
                                s.user?.username || s.userId
                              ) : (
                                <>
                                  <div>{s.userId || s.user?.userId || '—'}</div>
                                  {s.user?.username ? (
                                    <div className="muted">@{s.user.username}</div>
                                  ) : null}
                                </>
                              )}
                            </td>
                            <td>
                              {showPlayerEmail
                                ? (s.email || '—')
                                : (s.userId || s.user?.userId || '—')}
                            </td>
                            <td>
                              <span className={`ec-pill ec-pill--${String(s.status || '').replace(/_/g, '-')}`}>
                                {s.status}
                              </span>
                              {s.errorClass ? (
                                <div className="muted">{s.errorClass}{s.errorCode ? ` · ${s.errorCode}` : ''}</div>
                              ) : null}
                            </td>
                            <td>
                              <div>{s.deliveryStatus || '—'}</div>
                              {deliveryText ? (
                                <div className="ec-delivery-snippet" title={deliveryText}>
                                  {deliveryText}
                                </div>
                              ) : null}
                            </td>
                            <td>{s.attemptCount != null ? `${s.attemptCount}/${s.maxAttempts || 2}` : '—'}</td>
                            <td>{s.claimStatus}{s.codeAppliedAt ? ' · applied' : ''}</td>
                            <td>
                              {activityAt ? new Date(activityAt).toLocaleString() : '—'}
                              {s.sentAt && s.lastAttemptAt && s.sentAt !== s.lastAttemptAt ? (
                                <div className="muted">sent {new Date(s.sentAt).toLocaleString()}</div>
                              ) : null}
                            </td>
                          </tr>
                          {open ? (
                            <tr className="ec-send-log-row">
                              <td colSpan={8}>
                                <div className="ec-send-log-panel">
                                  <div className="ec-send-log-head">
                                    <strong>Provider / attempt logs</strong>
                                    <button
                                      type="button"
                                      className="btn"
                                      disabled={syncingDelivery}
                                      onClick={() => syncOneSendDelivery(s.id)}
                                    >
                                      Refresh from Mailgun
                                    </button>
                                  </div>
                                  {(Array.isArray(s.attempts) ? s.attempts : []).length === 0 && (
                                    <p className="muted">No attempt logs yet. Pull Mailgun delivery if the email was accepted.</p>
                                  )}
                                  <ul className="ec-attempt-list">
                                    {(Array.isArray(s.attempts) ? s.attempts : []).map((a, idx) => (
                                      <li key={a.id || `${a.attemptNo}-${idx}`}>
                                        <div className="ec-attempt-meta">
                                          <span className={`ec-pill ec-pill--${a.result || 'failed'}`}>{a.result || '—'}</span>
                                          <span className="muted">{a.source || 'api'}</span>
                                          {a.errorClass ? <span className="muted">{a.errorClass}</span> : null}
                                          {a.errorCode ? <code>{a.errorCode}</code> : null}
                                          <span className="muted">
                                            {a.at ? new Date(a.at).toLocaleString() : ''}
                                          </span>
                                        </div>
                                        {a.error ? <pre className="ec-attempt-error">{a.error}</pre> : null}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
              </table>
              {!sendsLoading && !sends.length && (
                <p className="muted">{selectedId ? 'No sends match.' : 'No sends yet.'}</p>
              )}
              {sendTotalPages > 1 && (
                <div className="ec-sends-pager">
                  <button
                    type="button"
                    className="btn"
                    disabled={sendPage <= 1 || sendsLoading}
                    onClick={() => setSendPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {sendPage} / {sendTotalPages}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={sendPage >= sendTotalPages || sendsLoading}
                    onClick={() => setSendPage((p) => Math.min(sendTotalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="ec-sticky-actions">
            <button type="button" className="btn primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : selectedId ? 'Save' : 'Create'}
            </button>
            <button type="button" className="btn" onClick={runPreview}>
              Preview
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
