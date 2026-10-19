import { useEffect, useMemo, useState } from 'react'
import { getStaffShiftTimezones } from '../api/admin'
import TimezoneSelect from './TimezoneSelect'
import './ReportTimezoneFilter.css'

/**
 * Timezone picker for admin reports. Uses the same IANA list as staff shift allocation.
 */
export default function ReportTimezoneFilter({
  value,
  onChange,
  disabled = false,
  id = 'report-timezone'
}) {
  const [timezones, setTimezones] = useState([])

  useEffect(() => {
    let cancelled = false
    getStaffShiftTimezones()
      .then((res) => {
        if (!cancelled) setTimezones(Array.isArray(res?.list) ? res.list : [])
      })
      .catch(() => {
        if (!cancelled) setTimezones([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const options = useMemo(() => {
    if (!value || timezones.some((tz) => tz.value === value)) return timezones
    return [{ value, label: value }, ...timezones]
  }, [timezones, value])

  return (
    <div className="report-timezone-filter">
      <span className="dashboard-filter-field-label" id={`${id}-label`}>Timezone</span>
      <TimezoneSelect
        id={id}
        value={value || ''}
        onChange={onChange}
        timezones={options}
        disabled={disabled}
      />
    </div>
  )
}
