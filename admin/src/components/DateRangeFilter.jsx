/**
 * Reusable date range filter: presets (Today / Yesterday / 7D / 30D) + custom start/end.
 */
import { PRESETS, getPresetRange, getTodayDateStr, isPresetRange } from '../utils/dateRange'
import './DateRangeFilter.css'

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onPresetClick,
  label = 'Date range',
  /** When true, render only inner fields (no outer dashboard-filter-bar). Use inside a parent filter bar. */
  embedded = false
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
    const range = getPresetRange(preset)
    if (onPresetClick) {
      onPresetClick(range)
    } else {
      if (onStartDateChange) onStartDateChange(range.startDate)
      if (onEndDateChange) onEndDateChange(range.endDate)
    }
  }

  const isToday = isPresetRange(startDate, endDate, PRESETS.TODAY)
  const isYesterday = isPresetRange(startDate, endDate, PRESETS.YESTERDAY)
  const is7D = isPresetRange(startDate, endDate, PRESETS.LAST_7)
  const is30D = isPresetRange(startDate, endDate, PRESETS.LAST_30)
  const maxSelectableDate = getTodayDateStr()

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
