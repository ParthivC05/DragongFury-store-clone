import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { login, verifyLoginOtp, resendLoginOtp, invalidateLoginOtp, getMe, TOKEN_KEY, requestOffShiftLogin } from '../api/auth'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('credentials') // 'credentials' | 'otp' | 'off-shift'
  const [offShiftInfo, setOffShiftInfo] = useState(null)
  const [offShiftReason, setOffShiftReason] = useState('')
  const [offShiftSent, setOffShiftSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0) // seconds remaining (2 mins = 120)
  const otpInputRefs = useRef([])
  const { user, setUser, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  // Redirect only after a valid session is confirmed — leftover tokens must not reload /.
  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, navigate])

  // Countdown timer for resend cooldown - must be before any early returns (hooks rule)
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  if (loading) return <div className="login-page"><div className="login-box">Loading…</div></div>
  if (user) return <div className="login-page"><div className="login-box">Redirecting…</div></div>

  async function handleCredentialsSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = await login(email, password)
      if (data.requiresOtp) {
        setStep('otp')
        setOtp('')
        setResendCooldown(120) // 2 min cooldown after initial code send
      } else {
        if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
        const me = await getMe()
        setUser(me)
        navigate('/', { replace: true })
      }
    } catch (err) {
      if (err.code === 'STAFF_OFF_SHIFT') {
        setOffShiftInfo(err.body || {})
        setOffShiftSent(Boolean(err.body?.pendingRequest))
        setStep('off-shift')
      } else {
        toast.error(err.message || 'Login failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await verifyLoginOtp(email, otp)
      const me = await getMe()
      setUser(me)
      navigate('/', { replace: true })
    } catch (err) {
      if (err.code === 'STAFF_OFF_SHIFT') {
        setOffShiftInfo(err.body || {})
        setOffShiftSent(Boolean(err.body?.pendingRequest))
        setStep('off-shift')
      } else {
        toast.error(err.message || 'Verification failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendCode() {
    if (resendLoading || submitting || resendCooldown > 0 || !email?.trim()) return
    setResendLoading(true)
    try {
      await resendLoginOtp(email)
      toast.success('A new code has been sent to your email.')
      setResendCooldown(120) // 2 min cooldown after resend
    } catch (err) {
      toast.error(err.message || 'Failed to resend code')
    } finally {
      setResendLoading(false)
    }
  }

  function formatCooldown(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function handleOtpChange(idx, value) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = otp.split('')
    next[idx] = digit
    const joined = next.join('').slice(0, 6)
    setOtp(joined)
    if (digit && idx < 5) otpInputRefs.current[idx + 1]?.focus()
  }

  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpInputRefs.current[idx - 1]?.focus()
      setOtp((s) => s.slice(0, idx - 1))
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    setOtp(pasted)
    const nextIdx = Math.min(pasted.length, 5)
    otpInputRefs.current[nextIdx]?.focus()
  }

  async function handleOffShiftRequest(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = await requestOffShiftLogin(email, password, offShiftReason)
      setOffShiftSent(true)
      toast.success(data.message || 'Request sent.')
    } catch (err) {
      toast.error(err.message || 'Failed to send request')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'off-shift') {
    const shift = offShiftInfo?.shift
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>Outside your shift</h1>
          <p className="login-subtitle">
            {shift
              ? `Your allocated shift is ${shift.startTime}–${shift.endTime} (${shift.timezone}).`
              : 'You are outside your allocated shift time.'}
          </p>
          {offShiftSent || offShiftInfo?.pendingRequest ? (
            <p className="login-success">
              Your off-shift request is pending. Super admin or technical staff will review it. After approval, sign in again.
            </p>
          ) : (
            <form onSubmit={handleOffShiftRequest}>
              <label>
                Reason (optional)
                <textarea
                  value={offShiftReason}
                  onChange={(e) => setOffShiftReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Why do you need to log in outside your shift?"
                />
              </label>
              <button type="submit" className="login-btn" disabled={submitting}>
                {submitting ? 'Sending…' : 'Request off-shift login'}
              </button>
            </form>
          )}
          <button
            type="button"
            className="login-link"
            onClick={() => {
              setStep('credentials')
              setOffShiftInfo(null)
              setOffShiftSent(false)
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  if (step === 'otp') {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>Partner Platform Admin</h1>
          <p className="login-subtitle">Enter the 6-digit code sent to your email</p>
          <form onSubmit={handleOtpSubmit}>
            <label className="login-otp-label">Verification code</label>
            <div className="login-otp-boxes">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <input
                  key={idx}
                  ref={(el) => { otpInputRefs.current[idx] = el }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={otp[idx] ?? ''}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  onPaste={handleOtpPaste}
                  className="login-otp-box"
                  autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                  autoFocus={idx === 0}
                  aria-label={`Digit ${idx + 1}`}
                />
              ))}
            </div>
            <button type="submit" className="login-btn" disabled={submitting || otp.length !== 6}>
              {submitting ? 'Verifying…' : 'Verify and sign in'}
            </button>
            <div className="login-otp-actions">
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  invalidateLoginOtp(email).catch(() => {})
                  setStep('credentials')
                  setOtp('')
                  setResendCooldown(0)
                }}
              >
                Sign in with different email
              </button>
              <button
                type="button"
                className="login-link"
                onClick={handleResendCode}
                disabled={resendLoading || submitting || resendCooldown > 0}
              >
                {resendLoading
                  ? 'Sending…'
                  : resendCooldown > 0
                    ? `Resend code in ${formatCooldown(resendCooldown)}`
                    : 'Resend verify code'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Partner Platform Admin</h1>
        <p className="login-subtitle">Sign in with an admin account</p>
        <form onSubmit={handleCredentialsSubmit}>
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
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
