import { useMemo, useState } from 'react'
import './TimezoneSelect.css'

export default function TimezoneSelect({
  id,
  value,
  onChange,
  timezones = [],
  disabled = false,
  required = false
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[_/]+/g, ' ')
    if (!q) return timezones
    return timezones.filter((tz) => {
      const haystack = [
        tz.searchText,
        tz.label,
        tz.value,
        String(tz.value || '').replace(/[_/]/g, ' ')
      ].join(' ').toLowerCase()
      return haystack.includes(q) || q.split(/\s+/).every((part) => haystack.includes(part))
    })
  }, [timezones, query])

  return (
    <div className="timezone-select">
      <input
        type="search"
        className="timezone-select-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search CST, EST, India, Chicago…"
        disabled={disabled}
        aria-label="Search timezone"
      />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      >
        <option value="">Select timezone</option>
        {filtered.map((tz) => (
          <option key={tz.value} value={tz.value}>{tz.label || tz.value}</option>
        ))}
      </select>
    </div>
  )
}
