import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  listSupportTickets,
  getSupportTicket,
  createSupportTicket,
  replySupportTicket,
  uploadSupportTicketImage,
} from '../../api/supportTickets';
import { usePageContentReady } from '../../context/PageReadyContext';
import { useToast } from '../../context/ToastContext';
import { onRealtimeEvent } from '../../services/realtimeSocket';
import './supportTickets.css';

const CATEGORIES = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'games', label: 'Games' },
  { value: 'account', label: 'Account' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'other', label: 'Other' },
];

function statusLabel(status) {
  const map = {
    open: 'Open',
    in_progress: 'In progress',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return map[status] || status || '—';
}

function categoryLabel(c) {
  return CATEGORIES.find((x) => x.value === c)?.label || c || '—';
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '—';
  }
}

function AttachmentList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="pj-st-attachments">
      {items.map((a, i) => (
        <a key={`${a.url}-${i}`} href={a.url} target="_blank" rel="noreferrer">
          <img src={a.url} alt={a.fileName || 'attachment'} />
        </a>
      ))}
    </div>
  );
}

function PendingAttachments({ items, onRemove }) {
  if (!items.length) return null;
  return (
    <div className="pj-st-pending">
      {items.map((a, i) => (
        <span key={a.url} className="pj-st-pending-chip">
          <img src={a.url} alt="" />
          <button type="button" aria-label="Remove" onClick={() => onRemove(i)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function SupportTicketsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  usePageContentReady(!loading);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSupportTickets({ page: 1, limit: 50 });
      setTickets(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (attachments.length >= 5) {
      toast.error('Maximum 5 images per message');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadSupportTicketImage(file);
      const data = res?.data || {};
      if (!data.url) throw new Error('Upload failed');
      setAttachments((prev) => [
        ...prev,
        {
          url: data.url,
          contentType: data.contentType || file.type,
          fileName: data.fileName || file.name,
        },
      ]);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!body.trim() && attachments.length === 0) {
      toast.error('Add a description or attach an image');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createSupportTicket({
        category,
        subject: subject.trim(),
        body: body.trim(),
        attachments,
      });
      const id = res?.data?.id;
      toast.success('Ticket submitted');
      setCreating(false);
      setSubject('');
      setBody('');
      setAttachments([]);
      setCategory('other');
      if (id) navigate(`/support/tickets/${id}`);
      else await load();
    } catch (err) {
      toast.error(err.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dash-page pj-st-page">
      <div className="pj-st-header">
        <div>
          <h1>Support tickets</h1>
          <p>Raise an issue and chat with our support team.</p>
        </div>
        <button
          type="button"
          className="pj-st-btn primary"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? 'Cancel' : 'Raise a ticket'}
        </button>
      </div>

      {creating && (
        <form className="pj-st-card pj-st-form" onSubmit={handleCreate}>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Brief summary of your issue"
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Describe what happened…"
            />
          </label>
          <PendingAttachments
            items={attachments}
            onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
          />
          <div className="pj-st-form-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              hidden
              onChange={handleUpload}
            />
            <button
              type="button"
              className="pj-st-btn"
              disabled={uploading || attachments.length >= 5}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Attach screenshot'}
            </button>
            <button type="submit" className="pj-st-btn primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit ticket'}
            </button>
          </div>
        </form>
      )}

      <div className="pj-st-card">
        {loading ? (
          <p className="pj-st-muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="pj-st-muted">You have not raised any tickets yet.</p>
        ) : (
          <ul className="pj-st-list">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link to={`/support/tickets/${t.id}`} className="pj-st-list-item">
                  <div className="pj-st-list-top">
                    <strong>#{t.id} · {t.subject}</strong>
                    <span className={`pj-st-status pj-st-status-${t.status}`}>
                      {statusLabel(t.status)}
                    </span>
                  </div>
                  <div className="pj-st-list-meta">
                    <span>{categoryLabel(t.category)}</span>
                    <span>{formatDate(t.lastMessageAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SupportTicketDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  usePageContentReady(!loading);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSupportTicket(id);
      setTicket(res?.data || null);
    } catch (err) {
      toast.error(err.message || 'Failed to load ticket');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) return undefined;

    const offMessage = onRealtimeEvent('support_ticket:message', (payload) => {
      if (!payload || Number(payload.ticketId) !== ticketId) return;
      const incoming = payload.message;
      if (!incoming?.id) return;
      setTicket((prev) => {
        if (!prev) return prev;
        const messages = Array.isArray(prev.messages) ? prev.messages : [];
        if (messages.some((m) => Number(m.id) === Number(incoming.id))) return prev;
        return {
          ...prev,
          status: payload.status || prev.status,
          lastMessageAt: payload.lastMessageAt || prev.lastMessageAt,
          messages: [...messages, incoming],
        };
      });
    });

    const offStatus = onRealtimeEvent('support_ticket:status', (payload) => {
      if (!payload || Number(payload.ticketId) !== ticketId) return;
      if (!payload.status) return;
      setTicket((prev) => (prev ? { ...prev, status: payload.status } : prev));
    });

    return () => {
      offMessage();
      offStatus();
    };
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (attachments.length >= 5) {
      toast.error('Maximum 5 images per message');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadSupportTicketImage(file);
      const data = res?.data || {};
      if (!data.url) throw new Error('Upload failed');
      setAttachments((prev) => [
        ...prev,
        {
          url: data.url,
          contentType: data.contentType || file.type,
          fileName: data.fileName || file.name,
        },
      ]);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyBody.trim() && attachments.length === 0) {
      toast.error('Enter a message or attach an image');
      return;
    }
    setSending(true);
    try {
      await replySupportTicket(id, {
        body: replyBody.trim(),
        attachments,
      });
      setReplyBody('');
      setAttachments([]);
      toast.success('Reply sent');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="dash-page pj-st-page pj-st-detail">
        <p className="pj-st-muted">Loading…</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="dash-page pj-st-page pj-st-detail">
        <p className="pj-st-muted">Ticket not found.</p>
        <button type="button" className="pj-st-btn" onClick={() => navigate('/support/tickets')}>
          Back to tickets
        </button>
      </div>
    );
  }

  const closed = ticket.status === 'closed';

  return (
    <div className="dash-page pj-st-page pj-st-detail">
      <div className="pj-st-header">
        <div>
          <button type="button" className="pj-st-back" onClick={() => navigate('/support/tickets')}>
            ← My tickets
          </button>
          <h1>#{ticket.id}: {ticket.subject}</h1>
          <div className="pj-st-list-meta">
            <span className={`pj-st-status pj-st-status-${ticket.status}`}>
              {statusLabel(ticket.status)}
            </span>
            <span>{categoryLabel(ticket.category)}</span>
            <span>Opened {formatDate(ticket.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="pj-st-card pj-st-thread-card">
        <div className="pj-st-thread">
          {(ticket.messages || []).map((m) => (
            <div
              key={m.id}
              className={`pj-st-msg ${m.authorRole === 'admin' ? 'is-admin' : 'is-user'}`}
            >
              <div className="pj-st-msg-head">
                <strong>{m.authorRole === 'admin' ? 'Support' : 'You'}</strong>
                <span>{formatDate(m.createdAt)}</span>
              </div>
              {m.body ? <p>{m.body}</p> : null}
              <AttachmentList items={m.attachments} />
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {closed ? (
          <p className="pj-st-muted pj-st-closed">This ticket is closed. Raise a new ticket if you still need help.</p>
        ) : (
          <form className="pj-st-reply" onSubmit={handleReply}>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              placeholder="Write a reply…"
              maxLength={5000}
            />
            <PendingAttachments
              items={attachments}
              onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
            />
            <div className="pj-st-form-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                hidden
                onChange={handleUpload}
              />
              <button
                type="button"
                className="pj-st-btn"
                disabled={uploading || attachments.length >= 5}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Attach image'}
              </button>
              <button type="submit" className="pj-st-btn primary" disabled={sending}>
                {sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
