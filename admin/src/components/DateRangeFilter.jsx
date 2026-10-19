/**
 * Reusable date range filter: presets (Today / Yesterday / 7D / 30D) + custom start/end.
 */
import { PRESETS, getPresetRange, getPresetRangeInTimeZone, getTodayDateStr, getCalendarDateInTimeZone } from '../utils/dateRange'
import './DateRangeFilter.css'

function presetRange(preset, timeZone) {
  return timeZone ? getPresetRangeInTimeZone(preset, timeZone) : getPresetRange(preset)
}

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onPresetClick,
  label = 'Date range',
  /** When true, render only inner fields (no outer dashboard-filter-bar). Use inside a parent filter bar. */
  embedded = false,
  /** IANA timezone. Presets and the latest selectable date use this calendar. */
  timeZone
}) {
  const handleStartDateChange = (value) => {
    if (onStartDateChange) onStartDateChange(value)
    if (onEndDateChange && value && endDate && endDate < value) {
      onEndDateChange(value)
    }
  }

  const handleEndDateChange = (value) => {
    if (onEndDateChange) onEndDateChange(value)
    if (onStartDateChange && value && startDate && value < startDate) {
      onStartDateChange(value)
    }
  }

  const handlePreset = (preset) => {
    const range = presetRange(preset, timeZone)
    if (onPresetClick) {
      onPresetClick(range)
    } else {
      if (onStartDateChange) onStartDateChange(range.startDate)
      if (onEndDateChange) onEndDateChange(range.endDate)
    }
  }

  const matchesPreset = (preset) => {
    const range = presetRange(preset, timeZone)
    return startDate === range.startDate && endDate === range.endDate
  }
  const isToday = matchesPreset(PRESETS.TODAY)
  const isYesterday = matchesPreset(PRESETS.YESTERDAY)
  const is7D = matchesPreset(PRESETS.LAST_7)
  const is30D = matchesPreset(PRESETS.LAST_30)
  const maxSelectableDate = timeZone ? getCalendarDateInTimeZone(timeZone) : getTodayDateStr()

  const inner = (
    <>
      {label ? <span className="dashboard-filter-bar-label">{label}</span> : null}
      <div className="dashboard-filter-bar-fields">
        <button
          type="button"
          className="dashboard-filter-preset"
          onClick={() => handlePreset(PRESETS.TODAY)}
          aria-pressed={isToday}
        >
          Today
        </button>
        <button
          type="button"
          className="dashboard-filter-preset"
          onClick={() => handlePreset(PRESETS.YESTERDAY)}
          aria-pressed={isYesterday}
        >
          Yesterday
        </button>
        <button
          type="button"
          className="dashboard-filter-preset"
          onClick={() => handlePreset(PRESETS.LAST_7)}
          aria-pressed={is7D}
        >
          7D
        </button>
        <button
          type="button"
          className="dashboard-filter-preset"
          onClick={() => handlePreset(PRESETS.LAST_30)}
          aria-pressed={is30D}
        >
          30D
        </button>
        <label className="dashboard-filter-field">
          <span className="dashboard-filter-field-label">From</span>
          <input
            type="date"
            className="dashboard-filter-input"
            value={startDate || ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
            max={endDate && endDate < maxSelectableDate ? endDate : maxSelectableDate}
          />
        </label>
        <label className="dashboard-filter-field">
          <span className="dashboard-filter-field-label">To</span>
          <input
            type="date"
            className="dashboard-filter-input"
            value={endDate || ''}
            onChange={(e) => handleEndDateChange(e.target.value)}
            min={startDate || undefined}
            max={maxSelectableDate}
          />
        </label>
      </div>
    </>
  )

  if (embedded) return inner

  return <div className="dashboard-filter-bar">{inner}</div>
}
