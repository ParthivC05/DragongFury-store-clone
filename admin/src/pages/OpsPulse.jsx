import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isTechnicalStaff } from '../constants/roles'
import PaymentTotalsSection from '../components/PaymentTotalsSection'
import './Dashboard.css'

/** Unlisted technical-staff page. Not in sidebar. */
export default function OpsPulse() {
  const { user } = useAuth()
  if (!isTechnicalStaff(user)) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="dashboard">
      <PaymentTotalsSection
        enabled
        showStoreDropdown
        title="Payment totals (All stores)"
      />
    </div>
  )
}
