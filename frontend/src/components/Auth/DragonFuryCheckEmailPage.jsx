import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as authApi from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { AuthBackground } from './AuthBackground';
import { SiteLogo } from '../SiteLogo';
import './auth-dragonfury.css';

const EMAIL_VERIFIED_CHANNEL = 'auth:email_verified';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DragonFuryCheckEmailPage() {
  const [searchParams] = useSearchParams();
  const emailToken = searchParams.get('emailToken');
  const emailFromQuery = searchParams.get('email');
  const navigate = useNavigate();
  const { setUserAndToken, refreshUser } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState(emailFromQuery || '');
  const [verifying, setVerifying] = useState(!!emailToken);
  const [resendLoading, setResendLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const verifiedRef = useRef(false);
  const redirectedByOtherTabRef = useRef(false);

  const emailVal = email ?? '';
  const emailLen = emailVal.length;
  const emailOk = EMAIL_RE.test(emailVal.trim());
  const emailShowIcon = emailLen > 4;
  const emailErr = emailLen > 4 && !emailOk;

  usePageContentReady(!verifying);

  useEffect(() => {
    if (emailFromQuery && !email) setEmail(emailFromQuery);
  }, [emailFromQuery, email]);

  useEffect(() => {
    if (!emailToken || verifiedRef.current) return;
    verifiedRef.current = true;
    setVerifying(true);
    authApi
      .verifyEmail(emailToken)
      .then((data) => {
        setVerifying(false);
        if (data.token) authApi.setToken(data.token);
        if (data.user) setUserAndToken(data.user, data.token);
        try {
          const bc = new BroadcastChannel(EMAIL_VERIFIED_CHANNEL);
          bc.postMessage({ type: 'verified' });
          bc.close();
        } catch (_) { /* BroadcastChannel not supported */ }
        toast.success(data.message || 'Email verified. Redirecting...');
        navigate(searchParams.get('redirect') || '/', { replace: true });
      })
      .catch((err) => {
        verifiedRef.current = false;
        setVerifying(false);
        toast.error(err.message || 'Verification link expired or invalid. Request a new one below.');
      });
  }, [emailToken, setUserAndToken, toast, searchParams, navigate]);

  useEffect(() => {
    if (emailToken) return;
    const redirectToDashboard = () => {
      if (redirectedByOtherTabRef.current) return;
      redirectedByOtherTabRef.current = true;
      refreshUser().then(() => {
        toast.success('Email verified. Redirecting...');
        navigate(searchParams.get('redirect') || '/', { replace: true });
      });
    };
    let bc;
    try {
      bc = new BroadcastChannel(EMAIL_VERIFIED_CHANNEL);
      bc.onmessage = redirectToDashboard;
    } catch (_) { /* BroadcastChannel not supported */ }
    const onStorage = (e) => {
      if (e.key === 'token' && e.newValue) redirectToDashboard();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      try { bc?.close(); } catch (_) {}
      window.removeEventListener('storage', onStorage);
    };
  }, [emailToken, refreshUser, navigate, searchParams, toast]);

  const handleResend = async () => {
    const emailToUse = email?.trim();
    if (!emailToUse) {
      toast.error('Please enter your email address.');
      return;
    }
    setResendLoading(true);
    try {
      await authApi.refreshEmailToken(emailToUse);
      toast.success('Verification email sent. Please check your inbox.');
    } catch (err) {
      const msg = (err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503)
        ? 'Please try again later.'
        : (err.message || 'Failed to send verification email.');
      toast.error(msg);
    } finally {
      setResendLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="pj-auth-root pj-auth-no-neon">
        <AuthBackground />
      </div>
    );
  }

  return (
    <div className="pj-auth-root pj-auth-no-neon">
      <AuthBackground />

      <div className="pj-auth-scroll">
        <div className="pj-page">
          <div className="pj-logo-area">
            <SiteLogo variant="auth" />

            <h1 className="pj-page-title">Check Your Email!</h1>
            <p className="pj-page-sub">📬 We sent you a link to verify your account</p>
          </div>

          <div className="pj-card">
            <div className="pj-corner tl" aria-hidden>
              ♠
            </div>
            <div className="pj-corner tr" aria-hidden>
              ♥
            </div>
            <div className="pj-corner bl" aria-hidden>
              ♦
            </div>
            <div className="pj-corner br" aria-hidden>
              ♣
            </div>
            <div className="pj-shine" aria-hidden />

            <div className="pj-back-row">
              <Link to="/" className="pj-back-lnk" aria-label="Back to home">
                ← Back
              </Link>
            </div>

            <div className="pj-forgot-success" style={{ textAlign: 'left' }}>
              <div className="pj-success-icon" style={{ textAlign: 'center' }} aria-hidden>
                📧
              </div>

              <div className="pj-verify-status" role="status" aria-live="polite">
                <p className="pj-verify-status-label">Verification email sent</p>
                <p className="pj-verify-status-text">
                  Check your inbox{email ? (
                    <>
                      {' '}
                      (<span className="pj-email-highlight">{email}</span>)
                    </>
                  ) : (
                    ''
                  )}{' '}
                  and spam folder for the verification link.
                </p>
              </div>

              <div className="pj-field">
                <label htmlFor="pj-check-email" className={`pj-f-label${emailFocused ? ' focused' : ''}`}>
                  <span className="ico" aria-hidden>
                    ✉️
                  </span>
                  Email Address
                </label>
                <div className="pj-inp-wrap">
                  <input
                    id="pj-check-email"
                    type="email"
                    value={emailVal}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    placeholder="Enter your email address"
                    autoComplete="email"
                    className={emailErr ? 'err' : emailOk && emailLen > 4 ? 'ok' : ''}
                  />
                  <div className="pj-inp-side">
                    <span className={`pj-v-ico${emailShowIcon ? ' show' : ''}`} aria-hidden>
                      {emailOk ? '✅' : emailLen > 4 ? '❌' : ''}
                    </span>
                  </div>
                </div>
              </div>

              <p className="pj-verify-footnote">
                Didn’t receive the email? Check spam first, or{' '}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || !email?.trim()}
                  className="pj-verify-resend"
                >
                  {resendLoading ? 'sending…' : 'resend'}
                </button>{' '}
                only if needed.
              </p>

              <Link to="/login" className="pj-btn-login pj-btn-login-link">
                <span className="pj-btn-txt">🎮 BACK TO LOGIN</span>
              </Link>
            </div>
          </div>

          <nav className="pj-b-links" aria-label="Legal links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/help">Support</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
