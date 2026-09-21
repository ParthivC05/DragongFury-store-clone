import { useState, useRef, useEffect } from 'react'

/**
 * Multi-select dropdown: trigger button opens a panel with checkboxes.
 * Options: { value, label }[]. Selected values: string[].
 * Placeholder when none selected; shows "Label (N selected)" when N > 0.
 */
export default function MultiSelectDropdown({
  options = [],
  selected = [],
  onChange,
  label = 'Select',
  placeholder = 'All',
  className = '',
  id
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const toggle = (value) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(next)
  }

  const selectAll = () => onChange(options.map((o) => o.value))
  const clear = () => onChange([])

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? 'All'
        : `${label} (${selected.length} selected)`

  return (
    <div ref={ref} className={`reports-multiselect ${className}`}>
      <button
        type="button"
        id={id}
        className="reports-multiselect-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="reports-multiselect-trigger-label">{triggerLabel}</span>
        <span className="reports-multiselect-chevron" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="reports-multiselect-dropdown" role="listbox">
          <div className="reports-multiselect-actions">
            <button type="button" className="reports-multiselect-action" onClick={selectAll}>
              Select all
            </button>
            <button type="button" className="reports-multiselect-action" onClick={clear}>
              Clear
            </button>
          </div>
          <div className="reports-multiselect-options">
            {options.map((opt) => (
              <label key={opt.value} className="reports-multiselect-option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
