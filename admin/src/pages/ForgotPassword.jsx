import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import './Login.css'

export default function ForgotPassword() {
  const { user } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) window.location.replace('/')
  }, [user])

  if (user) return <div className="login-page"><div className="login-box">Redirecting…</div></div>

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = await forgotPassword(email)
      toast.success(data.message || 'Check your email for the reset link.')
    } catch (err) {
      toast.error(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Forgot password</h1>
        <p className="login-subtitle">Enter your admin email and we’ll send you a reset link.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
