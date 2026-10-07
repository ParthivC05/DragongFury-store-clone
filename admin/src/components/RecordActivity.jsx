function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function RecordActivity({ item }) {
  if (!item) return null
  const lines = []
  if (item.deletedAt) {
    lines.push(`Deleted ${formatWhen(item.deletedAt)}${item.deletedByName ? ` by ${item.deletedByName}` : ''}`)
  }
  if (item.restoredAt) {
    lines.push(`Restored ${formatWhen(item.restoredAt)}${item.restoredByName ? ` by ${item.restoredByName}` : ''}`)
  }
  if (!lines.length) return null
  return (
    <p className="blog-studio-date">
      {lines.map((line) => (
        <span key={line} style={{ display: 'block' }}>{line}</span>
      ))}
    </p>
  )
}

export function PermanentRedirectField({ value, onChange }) {
  return (
    <label className="blog-admin-field permanent-redirect-field">
      <span>Permanent redirect (301)</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/blog/new-post or https://example.com/page"
        maxLength={1024}
        spellCheck={false}
      />
      <span className="blog-admin-hint">
        Leave this empty to show the page. A path or full link here permanently sends visitors to that address. It works on live pages and on pages you delete.
      </span>
    </label>
  )
}

export function isPlayjuwaStore(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') === 'playjuwa'
}
