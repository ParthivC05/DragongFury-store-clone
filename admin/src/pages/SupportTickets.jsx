import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getSupportTickets,
  getSupportTicket,
  replySupportTicket,
  updateSupportTicketStatus,
  uploadSupportTicketImage
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { canViewPlayerEmail, canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { formatTransactionDateTime } from '../utils/dateRange'
import { onRealtimeEvent } from '../services/realtimeSocket'
import './SupportTickets.css'

const DEFAULT_PAGE_SIZE = 30

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
]

const STATUS_ACTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
]

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'games', label: 'Games' },
  { value: 'account', label: 'Account' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'other', label: 'Other' }
]

function formatDate(d) {
  return formatTransactionDateTime(d)
}

function formatShortDate(d) {
  if (!d) return '—'
  try {
    const date = new Date(d)
    const now = new Date()
    const sameDay = date.toDateString() === now.toDateString()
    if (sameDay) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function playerLabel(ticket) {
  if (ticket?.userId != null) return `ID ${ticket.userId}`
  if (ticket?.user?.userId != null) return `ID ${ticket.user.userId}`
  return '—'
}

function playerSubLabel(ticket) {
  const username = ticket?.user?.username
  if (username) return `@${username}`
  const full = `${ticket?.user?.firstName || ''} ${ticket?.user?.lastName || ''}`.trim()
  return full || null
}

function playerInitials(ticket) {
  const sub = playerSubLabel(ticket)
  if (sub) {
    const parts = String(sub).replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return (parts[0] || '?').slice(0, 2).toUpperCase()
  }
  const id = String(ticket?.userId || ticket?.user?.userId || '?')
  return id.slice(0, 2)
}

function categoryLabel(c) {
  const found = CATEGORY_OPTIONS.find((o) => o.value === c)
  return found?.label || c || '—'
}

function StatusBadge({ status }) {
  const map = {
    open: { label: 'Open', cls: 'st-badge-open' },
    in_progress: { label: 'In progress', cls: 'st-badge-progress' },
    resolved: { label: 'Resolved', cls: 'st-badge-resolved' },
    closed: { label: 'Closed', cls: 'st-badge-closed' }
  }
  const s = map[status] || { label: status || '—', cls: '' }
  return <span className={`st-badge ${s.cls}`}>{s.label}</span>
}

export default function SupportTickets() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const canSearchByEmail = canViewPlayerEmail(user?.role)

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [storeCode, setStoreCode] = useState('')

  const [selectedId, setSelectedId] = useState(() => {
    const id = searchParams.get('id')
    return id ? parseInt(id, 10) : null
  })
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const threadEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const replyRef = useRef(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit }
      if (status) params.status = status
      if (category) params.category = category
      if (search.trim()) params.search = search.trim()
      if (isMaster && storeCode.trim()) params.storeCode = storeCode.trim()
      const res = await getSupportTickets(params)
      setRows(Array.isArray(res?.data) ? res.data : [])
      setTotal(Number(res?.total) || 0)
    } catch (err) {
      toast.error(err.message || 'Failed to load tickets')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, status, category, search, storeCode, isMaster, toast])

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const res = await getSupportTicket(id)
      setDetail(res?.data || null)
    } catch (err) {
      toast.error(err.message || 'Failed to load ticket')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  useEffect(() => {
    const offMessage = onRealtimeEvent('support_ticket:message', (payload) => {
      if (!payload?.ticketId || !payload?.message?.id) return
      const ticketId = Number(payload.ticketId)
      const incoming = payload.message

      setRows((prev) => {
        const idx = prev.findIndex((r) => Number(r.id) === ticketId)
        if (idx < 0) return prev
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          status: payload.status || next[idx].status,
          lastMessageAt: payload.lastMessageAt || next[idx].lastMessageAt,
          subject: payload.subject || next[idx].subject
        }
        const [row] = next.splice(idx, 1)
        return [row, ...next]
      })

      setDetail((prev) => {
        if (!prev || Number(prev.id) !== ticketId) return prev
        const messages = Array.isArray(prev.messages) ? prev.messages : []
        if (messages.some((m) => Number(m.id) === Number(incoming.id))) return prev
        return {
          ...prev,
          status: payload.status || prev.status,
          lastMessageAt: payload.lastMessageAt || prev.lastMessageAt,
          messages: [...messages, incoming]
        }
      })
    })

    const offStatus = onRealtimeEvent('support_ticket:status', (payload) => {
      if (!payload?.ticketId || !payload?.status) return
      const ticketId = Number(payload.ticketId)
      setRows((prev) =>
        prev.map((r) =>
          Number(r.id) === ticketId ? { ...r, status: payload.status } : r
        )
      )
      setDetail((prev) => {
        if (!prev || Number(prev.id) !== ticketId) return prev
        return { ...prev, status: payload.status }
      })
    })

    const offCreated = onRealtimeEvent('support_ticket:created', (payload) => {
      const ticket = payload?.ticket
      if (!ticket?.id) return
      setRows((prev) => {
        if (prev.some((r) => Number(r.id) === Number(ticket.id))) return prev
        return [ticket, ...prev]
      })
      setTotal((t) => t + 1)
    })

    return () => {
      offMessage()
      offStatus()
      offCreated()
    }
  }, [])

  useEffect(() => {
    if (!detailLoading && detail?.messages?.length) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [detail?.messages?.length, detailLoading, selectedId])

  function openTicket(id) {
    setSelectedId(id)
    setReplyBody('')
    setAttachments([])
    setSearchParams(id ? { id: String(id) } : {})
    setTimeout(() => replyRef.current?.focus(), 100)
  }

  function closeDetail() {
    setSelectedId(null)
    setDetail(null)
    setReplyBody('')
    setAttachments([])
    setSearchParams({})
  }

  async function handleStatusChange(next) {
    if (!selectedId || !next || next === detail?.status) return
    setStatusSaving(true)
    try {
      await updateSupportTicketStatus(selectedId, next)
      toast.success(`Ticket marked ${next.replace('_', ' ')}`)
      await loadDetail(selectedId)
      await loadList()
    } catch (err) {
      toast.error(err.message || 'Failed to update status')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (attachments.length >= 5) {
      toast.error('Maximum 5 attachments per message')
      return
    }
    setUploading(true)
    try {
      const res = await uploadSupportTicketImage(file)
      const data = res?.data || {}
      if (!data.url) throw new Error('Upload failed')
      setAttachments((prev) => [...prev, {
        url: data.url,
        contentType: data.contentType || file.type,
        fileName: data.fileName || file.name
      }])
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleReply(e) {
    e.preventDefault()
    if (!selectedId) return
    if (!replyBody.trim() && attachments.length === 0) {
      toast.error('Enter a message or attach an image')
      return
    }
    setSending(true)
    try {
      await replySupportTicket(selectedId, {
        body: replyBody.trim(),
        attachments
      })
      setReplyBody('')
      setAttachments([])
      toast.success('Reply sent')
      await loadDetail(selectedId)
      await loadList()
      replyRef.current?.focus()
    } catch (err) {
      toast.error(err.message || 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const closed = detail?.status === 'closed'
  const chatOpen = Boolean(selectedId)

  return (
    <div className="st-page">
      <header className="st-page-header">
        <div>
          <h1 className="st-page-title">Support tickets</h1>
          <p className="st-page-subtitle">
            Open a ticket to view the full chat, reply to the player, and update status.
          </p>
        </div>
        <div className="st-page-stats">
          <span className="st-stat">{total} ticket{total === 1 ? '' : 's'}</span>
        </div>
      </header>

      <div className="st-toolbar">
        <label className="st-field">
          <span>Status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="st-field">
          <span>Category</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {isMaster && (
          <label className="st-field">
            <span>Store</span>
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder="store code"
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadList() } }}
            />
          </label>
        )}
        <label className="st-field st-field-grow">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={canSearchByEmail ? 'Subject, user, email, #id' : 'Subject, user, #id'}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); loadList() } }}
          />
        </label>
        <button type="button" className="st-btn st-btn-secondary" onClick={() => { setPage(1); loadList() }}>
          Refresh
        </button>
      </div>

      <div className={`st-inbox ${chatOpen ? 'st-inbox-open' : ''}`}>
        <section className="st-list-pane" aria-label="Ticket list">
          <div className="st-list-scroll">
            {loading ? (
              <p className="st-empty">Loading tickets…</p>
            ) : rows.length === 0 ? (
              <p className="st-empty">No support tickets found.</p>
            ) : (
              <ul className="st-ticket-list">
                {rows.map((r) => {
                  const active = selectedId === r.id
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`st-ticket-item ${active ? 'is-active' : ''} ${r.status === 'open' ? 'is-unread' : ''}`}
                        onClick={() => openTicket(r.id)}
                      >
                        <div className="st-ticket-avatar" aria-hidden>{playerInitials(r)}</div>
                        <div className="st-ticket-body">
                          <div className="st-ticket-top">
                            <strong className="st-ticket-user">{playerLabel(r)}</strong>
                            <time className="st-ticket-time">{formatShortDate(r.lastMessageAt)}</time>
                          </div>
                          {playerSubLabel(r) ? (
                            <div className="st-ticket-subject" style={{ opacity: 0.75 }}>
                              {playerSubLabel(r)}
                            </div>
                          ) : null}
                          <div className="st-ticket-subject">
                            <span className="st-ticket-id">#{r.id}</span>
                            {r.subject}
                          </div>
                          <div className="st-ticket-meta">
                            <StatusBadge status={r.status} />
                            <span className="st-chip">{categoryLabel(r.category)}</span>
                            {isMaster && r.storeCode ? <span className="st-chip">{r.storeCode}</span> : null}
                          </div>
                        </div>
                        <span className="st-ticket-open-label">{active ? 'Open' : 'Open chat'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {totalPages > 1 && (
            <div className="st-pagination">
              <button type="button" className="st-btn st-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" className="st-btn st-btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </section>

        <section className="st-chat-pane" aria-label="Ticket conversation">
          {!chatOpen ? (
            <div className="st-chat-placeholder">
              <div className="st-chat-placeholder-icon" aria-hidden />
              <h2>Select a ticket</h2>
              <p>Click <strong>Open chat</strong> on a ticket to view the full conversation and reply.</p>
            </div>
          ) : detailLoading && !detail ? (
            <div className="st-chat-placeholder">
              <p className="st-empty">Loading conversation…</p>
            </div>
          ) : !detail ? (
            <div className="st-chat-placeholder">
              <p className="st-empty">Ticket not found.</p>
              <button type="button" className="st-btn st-btn-secondary" onClick={closeDetail}>Back to list</button>
            </div>
          ) : (
            <>
              <header className="st-chat-header">
                <button type="button" className="st-btn st-btn-ghost st-chat-back" onClick={closeDetail} aria-label="Close chat">
                  ← Back
                </button>
                <div className="st-chat-heading">
                  <h2>#{detail.id}: {detail.subject}</h2>
                  <div className="st-chat-sub">
                    <StatusBadge status={detail.status} />
                    <span>{categoryLabel(detail.category)}</span>
                    <span>·</span>
                    <span>{playerLabel(detail)}</span>
                    {playerSubLabel(detail) ? (
                      <>
                        <span>·</span>
                        <span>{playerSubLabel(detail)}</span>
                      </>
                    ) : null}
                    {showPlayerEmail && detail.user?.email ? (
                      <>
                        <span>·</span>
                        <span>{detail.user.email}</span>
                      </>
                    ) : null}
                    {isMaster && detail.storeCode ? (
                      <>
                        <span>·</span>
                        <span>{detail.storeCode}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="st-chat-controls">
                  {detail.userId ? (
                    <Link className="st-btn st-btn-secondary" to={`/users/${detail.userId}`}>
                      View user
                    </Link>
                  ) : null}
                  <label className="st-status-select">
                    <span>Status</span>
                    <select
                      value={detail.status}
                      disabled={statusSaving}
                      onChange={(e) => handleStatusChange(e.target.value)}
                    >
                      {STATUS_ACTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </header>

              <div className="st-chat-thread">
                {(detail.messages || []).map((m) => {
                  const isAdmin = m.authorRole === 'admin'
                  return (
                    <div key={m.id} className={`st-bubble-row ${isAdmin ? 'is-admin' : 'is-user'}`}>
                      {!isAdmin && (
                        <div className="st-bubble-avatar" aria-hidden>{playerInitials(detail)}</div>
                      )}
                      <div className={`st-bubble ${isAdmin ? 'st-bubble-admin' : 'st-bubble-user'}`}>
                        <div className="st-bubble-meta">
                          <strong>{isAdmin ? (m.author?.username || 'Support') : (m.author?.username || playerLabel(detail))}</strong>
                          <time>{formatDate(m.createdAt)}</time>
                        </div>
                        {m.body ? <p className="st-bubble-text">{m.body}</p> : null}
                        {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                          <div className="st-bubble-attachments">
                            {m.attachments.map((a, i) => (
                              <button
                                key={`${a.url}-${i}`}
                                type="button"
                                className="st-attach-thumb"
                                onClick={() => setPreviewUrl(a.url)}
                              >
                                <img src={a.url} alt={a.fileName || 'attachment'} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>

              {closed ? (
                <div className="st-chat-composer st-chat-composer-closed">
                  <p>This ticket is closed. Change status to Open or In progress to reply again.</p>
                  <button
                    type="button"
                    className="st-btn st-btn-primary"
                    onClick={() => handleStatusChange('open')}
                    disabled={statusSaving}
                  >
                    Reopen ticket
                  </button>
                </div>
              ) : (
                <form className="st-chat-composer" onSubmit={handleReply}>
                  {attachments.length > 0 && (
                    <div className="st-pending-attachments">
                      {attachments.map((a, i) => (
                        <span key={a.url} className="st-pending-chip">
                          <img src={a.url} alt="" />
                          <button
                            type="button"
                            aria-label="Remove attachment"
                            onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={replyRef}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type your reply to the player…"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        e.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <div className="st-composer-actions">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      hidden
                      onChange={handleFileChange}
                    />
                    <button
                      type="button"
                      className="st-btn st-btn-secondary"
                      disabled={uploading || attachments.length >= 5}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? 'Uploading…' : 'Attach image'}
                    </button>
                    <span className="st-composer-hint">Ctrl+Enter to send</span>
                    <button type="submit" className="st-btn st-btn-primary" disabled={sending}>
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {previewUrl && (
        <div className="st-lightbox" role="dialog" aria-modal="true" onClick={() => setPreviewUrl(null)}>
          <button type="button" className="st-lightbox-close" aria-label="Close preview" onClick={() => setPreviewUrl(null)}>
            ×
          </button>
          <img src={previewUrl} alt="Attachment preview" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
