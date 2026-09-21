import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import * as authApi from '../api/auth';
import * as userApi from '../api/user';
import * as kycApi from '../api/kyc';
import * as phoneApi from '../api/phone';
import { usePageContentReady, usePageReady } from '../context/PageReadyContext';
import { LockIcon, EnvelopeIcon } from '../assets/icons';
import { PaymentAccountSection } from '../components/PaymentAccount/PaymentAccountSection';
import { KycVerificationModal } from '../components/withdraw/KycVerificationModal';
import { PhoneNumberField } from '../components/Auth/PhoneNumberField';
import { isCompleteNational, parseE164 } from '../components/Auth/phoneCountry';
import {
  isPurchaseProfileComplete,
  needsPhoneVerification,
  storeRequiresPhoneVerification
} from '../utils/purchaseProfile';
import { phoneOtpErrorMessage } from '../utils/phoneOtpErrors';
import '../components/Auth/PhoneNumberField.css';

const inputClass = 'dash-input-field w-full';
const inputClassError = `${inputClass} dash-input-field--error`;
const inputClassReadonly = `${inputClass} dash-input-field--readonly pr-10`;
const labelClass = 'dash-field-label';

function kycStatusLabel(status) {
  const s = String(status || 'not_started').toLowerCase();
  if (s === 'approved') return 'Verified';
  if (s === 'pending') return 'Pending';
  if (s === 'in_review') return 'In review';
  if (s === 'declined') return 'Declined';
  return 'Not started';
}

function kycBadgeClass(status) {
  const s = String(status || 'not_started').toLowerCase();
  if (s === 'approved') return 'dash-badge dash-badge--success';
  if (s === 'declined') return 'dash-badge dash-badge--danger';
  if (s === 'pending' || s === 'in_review') return 'dash-badge dash-badge--warning';
  return 'dash-badge dash-badge--warning';
}

const NAME_LETTERS_ONLY = /^[a-zA-Z]+$/;
const NAME_LETTERS_MSG = 'Only letters (a–z, A–Z) are allowed; no numbers, spaces, hyphens, or special characters.';

/**
 * Validates that a YYYY-MM-DD string is a real calendar date.
 * Rejects invalid dates (e.g. Feb 30, Apr 31, Feb 29 in non-leap years).
 */
function isValidCalendarDate(str) {
  if (!str || typeof str !== 'string') return false;
  const match = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Converts invalid calendar date (e.g. Feb 30) to nearest valid date.
 */
function clampToValidCalendarDate(str) {
  if (!str || typeof str !== 'string') return str;
  const match = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return str;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12) return str;
  if (isValidCalendarDate(str)) return str;
  const d = new Date(year, month - 1, day);
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DATE_MIN = '1900-01-01';

/**
 * Moves date by delta days (+1 for ArrowUp, -1 for ArrowDown). Returns YYYY-MM-DD within [min, max].
 * Example: 28-02-2026 + up -> 01-03-2026; 01-03-2026 + down -> 28-02-2026.
 */
function addDaysToDate(str, delta, maxStr) {
  const current = clampToValidCalendarDate(str || '');
  if (!current || !current.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  const d = new Date(current);
  if (Number.isNaN(d.getTime())) return str;
  d.setDate(d.getDate() + delta);
  const next = `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (next < DATE_MIN) return DATE_MIN;
  if (maxStr && next > maxStr) return maxStr;
  return next;
}

const PROFILE_VALIDATION = Yup.object().shape({
  firstName: Yup.string()
    .trim()
    .test('letters', NAME_LETTERS_MSG, (v) => !v || NAME_LETTERS_ONLY.test(v))
    .max(100, 'First name must be at most 100 characters.'),
  lastName: Yup.string()
    .trim()
    .test('letters', NAME_LETTERS_MSG, (v) => !v || NAME_LETTERS_ONLY.test(v))
    .max(100, 'Last name must be at most 100 characters.'),
  phone: Yup.string()
    .trim()
    .required('Phone number is required.')
    .matches(/^\+1\d{10}$/, 'Enter a valid 10-digit US phone number.'),
  dateOfBirth: Yup.string()
    .trim()
    .test('valid-calendar-date', 'Please enter a valid calendar date (e.g. Feb has 28 or 29 days, not 30 or 31).', (v) => {
      if (!v) return true;
      return isValidCalendarDate(v);
    })
    .test('year-range', 'Year must be between 1900 and the current year.', (v) => {
      if (!v || !isValidCalendarDate(v)) return true;
      const year = parseInt(String(v).slice(0, 4), 10);
      const currentYear = new Date().getFullYear();
      return year >= 1900 && year <= currentYear;
    })
    .test('not-future', 'Date of birth cannot be in the future.', (v) => {
      if (!v || !isValidCalendarDate(v)) return true;
      const today = new Date().toISOString().slice(0, 10);
      return v <= today;
    }),
  streetAddress: Yup.string().trim().max(255, 'Street address must be at most 255 characters.'),
  city: Yup.string().trim().max(100, 'City must be at most 100 characters.'),
  state: Yup.string().trim().max(100, 'State must be at most 100 characters.'),
  country: Yup.string().trim().max(100, 'Country must be at most 100 characters.'),
  zipCode: Yup.string().trim().max(20, 'Zip code must be at most 20 characters.')
});

const PASSWORD_MIN = 8;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const PASSWORD_STRENGTH_MSG =
  'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';

const CHANGE_PASSWORD_VALIDATION = Yup.object().shape({
  currentPassword: Yup.string().required('Current password is required.'),
  newPassword: Yup.string()
    .required('New password is required.')
    .min(PASSWORD_MIN, PASSWORD_STRENGTH_MSG)
    .matches(PASSWORD_PATTERN, PASSWORD_STRENGTH_MSG)
    .test('different', 'New password must be different from your current password.', function (value) {
      const current = this.parent.currentPassword;
      return value != null && current != null && String(value).trim() !== String(current).trim();
    }),
  confirmPassword: Yup.string()
    .required('Confirm new password is required.')
    .oneOf([Yup.ref('newPassword')], 'New password and confirm password do not match.')
});

const PROFILE_PHOTO_VALIDATION = Yup.object().shape({
  profileImageUrl: Yup.string()
    .trim()
    .required('Profile image URL is required.')
    .url('Profile image URL must be a valid URL.')
    .max(2048, 'Profile image URL must not exceed 2048 characters.')
    .test('protocol', 'Profile image URL must start with http:// or https://.', (v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    })
});

/** Default avatar URL (DiceBear) with username as seed; used when user has no custom profile image. */
function getDefaultAvatarUrl(user) {
  const seed = encodeURIComponent(user?.username || user?.email || 'user');
  return `https://api.dicebear.com/9.x/dylan/png?seed=${seed}`;
}

const initialProfileValues = (user) => ({
  firstName: user?.firstName ?? '',
  lastName: user?.lastName ?? '',
  phone: user?.phone ?? '',
  dateOfBirth: user?.dateOfBirth ? clampToValidCalendarDate(String(user.dateOfBirth).slice(0, 10)) || '' : '',
  streetAddress: user?.streetAddress ?? '',
  city: user?.city ?? '',
  state: user?.state ?? '',
  country: user?.country ?? '',
  zipCode: user?.zipCode ?? ''
});

const PROFILE_COMPLETION_KEYS = [
  'firstName',
  'lastName',
  'phone',
  'dateOfBirth',
  'streetAddress',
  'city',
  'state',
  'country',
  'zipCode'
];

function getProfileCompletion(user) {
  const filled = PROFILE_COMPLETION_KEYS.filter((k) => String(user?.[k] ?? '').trim()).length;
  const total = PROFILE_COMPLETION_KEYS.length;
  const storeRequiresPhone = storeRequiresPhoneVerification(user);
  const phoneVerified = Boolean(user?.isPhoneVerified) || !storeRequiresPhone;
  const fieldsFilled = filled === total;
  const profileComplete = isPurchaseProfileComplete(user);
  const phoneSlot = storeRequiresPhone ? 1 : 0;
  const percent = total
    ? Math.round(((filled + (storeRequiresPhone && phoneVerified ? 1 : 0)) / (total + phoneSlot)) * 100)
    : 0;
  const isVerified = user?.isEmailVerified === true;
  const hasPayment = user?.hasPaymentAccount === true;

  const quests = [
    { id: 'email', label: 'Verify email', done: isVerified, icon: '✉️' },
    { id: 'profile', label: 'Complete profile', done: fieldsFilled, icon: '📝' },
    ...(storeRequiresPhone
      ? [{ id: 'phone', label: 'Verify phone', done: phoneVerified, icon: '📱' }]
      : []),
    { id: 'payment', label: 'Link payment account', done: hasPayment, icon: '💳' }
  ];

  return {
    filled,
    total,
    percent,
    profileComplete,
    isVerified,
    hasPayment,
    quests,
    questsDone: quests.filter((q) => q.done).length
  };
}

export function Settings() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnToDeposit = searchParams.get('returnTo') === 'deposit';
  const returnTo = searchParams.get('returnTo');
  const [loading, setLoading] = useState(true);
  const [verificationSending, setVerificationSending] = useState(false);
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const hasRefreshedForPaymentAccount = useRef(false);
  const [kyc, setKyc] = useState(null);
  const [kycStarting, setKycStarting] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalUrl, setKycModalUrl] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  usePageContentReady(!loading);
  const { showLoader } = usePageReady();
  const didCenterPhoneRef = useRef(false);

  // After the page loader is gone, scroll phone to the center of the *visible*
  // viewport (between fixed nav and mobile bottom bar) exactly once.
  useEffect(() => {
    if (loading || showLoader || !returnToDeposit) return;
    if (didCenterPhoneRef.current) return;

    const el = document.getElementById('verify-phone');
    if (!el) return;

    const visibleRect = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      // display:none / md:hidden nodes report 0×0 — ignore them
      if (rect.width <= 0 || rect.height <= 0) return null;
      return rect;
    };

    const getVisibleCenterY = () => {
      const navRect = visibleRect(document.querySelector('.dash-nav'));
      const bottomRect = visibleRect(document.querySelector('.dash-bottom-wrap'));
      const topInset = navRect ? Math.max(0, navRect.bottom) : 0;
      const bottomInset = bottomRect
        ? Math.max(0, window.innerHeight - bottomRect.top)
        : 0;
      const usable = Math.max(0, window.innerHeight - topInset - bottomInset);
      return topInset + usable / 2;
    };

    const rect = el.getBoundingClientRect();
    const elCenter = rect.top + rect.height / 2;
    const visibleCenter = getVisibleCenterY();
    // Skip if already centered (e.g. React Strict Mode remount).
    if (Math.abs(elCenter - visibleCenter) < 48) {
      didCenterPhoneRef.current = true;
      return;
    }

    didCenterPhoneRef.current = true;
    const absoluteCenter = window.scrollY + elCenter;
    const top = Math.max(0, absoluteCenter - visibleCenter);
    window.scrollTo({ top, behavior: 'smooth' });
  }, [loading, showLoader, returnToDeposit]);

  const isVerified = user?.isEmailVerified === true;
  const profileStats = getProfileCompletion(user);
  const phoneAlreadyVerified = Boolean(user?.isPhoneVerified);
  const storeRequiresPhoneOtp = storeRequiresPhoneVerification(user);


  useEffect(() => {
    if (phoneAlreadyVerified) {
      setOtpOpen(false);
      setOtpCode('');
    }
  }, [phoneAlreadyVerified]);

  useEffect(() => {
    setLoading(!user);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    kycApi
      .getKycStatus()
      .then((res) => {
        if (!cancelled) setKyc(res);
      })
      .catch(() => {
        if (!cancelled) setKyc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  // Ensure we have full user (hasPaymentAccount) so payment section shows correctly on first load.
  // Only refresh once to avoid repeated refresh loop when API omits hasPaymentAccount.
  useEffect(() => {
    if (!user || user.hasPaymentAccount !== undefined || !refreshUser || hasRefreshedForPaymentAccount.current) return;
    hasRefreshedForPaymentAccount.current = true;
    refreshUser();
  }, [user?.userId, user?.hasPaymentAccount, refreshUser]);

  async function handleSendVerification() {
    setVerificationSending(true);
    try {
      await authApi.sendVerificationEmail();
      toast.success('Verification email sent. Please check your inbox.');
      await refreshUser();
    } catch (err) {
      const msg = (err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503)
        ? "Please try again later."
        : (err.message || 'Something went wrong. Please try again.');
      toast.error(msg);
    } finally {
      setVerificationSending(false);
    }
  }

  async function handleSendResetEmail() {
    if (!user?.email) {
      toast.error('No email on file.');
      return;
    }
    setResetEmailSending(true);
    try {
      await authApi.forgotPassword(user.email);
      toast.success('If an account exists with this email, you will receive a password reset link.');
    } catch (err) {
      toast.error(err.message || 'Something went wrong.');
    } finally {
      setResetEmailSending(false);
    }
  }

  const handleStartKyc = useCallback(async () => {
    setKycStarting(true);
    try {
      const res = await kycApi.startKycSession();
      if (res?.alreadyApproved) {
        setKyc((prev) => ({ ...(prev || {}), approved: true, kycStatus: 'approved', canStart: false }));
        toast.success('Identity already verified.');
        return;
      }
      if (res?.url) {
        setKycModalUrl(res.url);
        setKycModalOpen(true);
        return;
      }
      toast.error('Could not start verification. Please try again.');
    } catch (err) {
      toast.error(err.message || 'Could not start verification.');
    } finally {
      setKycStarting(false);
    }
  }, [toast]);

  const handleKycModalClose = useCallback(
    async (result) => {
      setKycModalOpen(false);
      setKycModalUrl('');
      try {
        const res = await kycApi.getKycStatus({ refresh: '1' });
        setKyc(res);
        if (res?.approved) toast.success('Identity verified.');
        else if (result?.declined || res?.kycStatus === 'declined') {
          toast.error(res?.declineReason || 'Verification was declined.');
        } else if (!result?.closed && (result?.inReview || res?.kycStatus === 'in_review' || res?.kycStatus === 'pending')) {
          toast.info('Verification submitted. Status will update when approved.');
        }
      } catch {
        /* ignore */
      }
    },
    [toast]
  );

  return (
    <div className="dash-page dash-settings-page w-full min-w-0 max-w-full">
      <header className="dash-deposit-header dash-animate-in">
        <h1 className="dash-deposit-title">Profile</h1>
        <p className="dash-deposit-sub">Manage your account settings and preferences.</p>
      </header>

      {/* Email verification – when not verified */}
      {!isVerified && (
        <section className="dash-panel dash-animate-in dash-delay-1 min-w-0">
          <div className="dash-panel-head--icon">
            <span className="dash-panel-icon dash-panel-icon--warn" aria-hidden>
              <LockIcon className="w-4 h-4" />
            </span>
            <h2 className="dash-panel-title min-w-0">Email Verification</h2>
            <span className="dash-badge dash-badge--warning">Not Verified</span>
          </div>
          <p className="dash-panel-desc min-w-0 break-words">
            Verify your email address to update your profile. Until then, you can view your details but cannot save changes.
          </p>
          <div className="dash-settings-actions min-w-0">
            <input
              type="text"
              readOnly
              value={user?.email ?? ''}
              className={`${inputClassReadonly} flex-1 min-w-0 w-full sm:min-w-[200px] max-w-full`}
            />
            <button
              type="button"
              onClick={handleSendVerification}
              disabled={verificationSending}
              className="dash-btn-cta inline-flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <EnvelopeIcon className="w-5 h-5" />
              {verificationSending ? 'Sending…' : 'Send Verification Email'}
            </button>
          </div>
        </section>
      )}

      {/* KYC verification status */}
      {kyc && (
        <section className="dash-panel dash-animate-in dash-delay-1 min-w-0">
          <div className="dash-panel-head--icon">
            <span className="dash-panel-icon" aria-hidden>
              <LockIcon className="w-4 h-4" />
            </span>
            <h2 className="dash-panel-title min-w-0">KYC Verification</h2>
            <span className={kycBadgeClass(kyc.approved ? 'approved' : kyc.kycStatus)}>
              {kyc.approved ? 'Verified' : kycStatusLabel(kyc.kycStatus)}
            </span>
          </div>
          <p className="dash-panel-desc min-w-0 break-words">
            {kyc.approved
              ? `Your identity is verified${kyc.verifiedAt ? ` (since ${new Date(kyc.verifiedAt).toLocaleDateString()})` : ''}. You can withdraw when eligible.`
              : kyc.required
                ? kyc.kycStatus === 'pending' || kyc.kycStatus === 'in_review'
                  ? 'Your verification is in progress. Withdrawals unlock once it’s approved.'
                  : kyc.kycStatus === 'declined'
                    ? (kyc.declineReason || 'Verification was declined. You can try again with a clear ID photo.')
                    : 'Complete a one-time identity check before you can withdraw.'
                : 'Identity verification is not currently required for withdrawals.'}
          </p>
          {(kyc.canStart || kyc.kycStatus === 'declined' || (kyc.required && (kyc.kycStatus === 'not_started' || !kyc.kycStatus))) && (
            <div className="dash-settings-actions min-w-0">
              <button
                type="button"
                onClick={handleStartKyc}
                disabled={kycStarting}
                className="dash-btn-cta disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {kycStarting
                  ? 'Starting…'
                  : kyc.kycStatus === 'declined'
                    ? 'Retry verification'
                    : 'Verify identity'}
              </button>
            </div>
          )}
          {(kyc.kycStatus === 'pending' || kyc.kycStatus === 'in_review') && (
            <div className="dash-settings-actions min-w-0">
              <button
                type="button"
                className="dash-btn-outline"
                onClick={() => {
                  kycApi.getKycStatus({ refresh: '1' }).then(setKyc).catch(() => {});
                }}
              >
                Refresh status
              </button>
            </div>
          )}
        </section>
      )}

      {/* Profile – avatar + gamification sidebar + details in one card */}
      <section className="dash-panel dash-profile-card dash-animate-in dash-delay-2 min-w-0">
        <div className="dash-profile-card-head">
          <h2 className="dash-panel-title mb-0">Profile</h2>
        </div>
        {!isVerified && (
          <div className="dash-settings-notice min-w-0">
            <LockIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--dash-gold)]" />
            <span className="min-w-0 break-words">Email verification is needed for profile update. Verify your email above to enable the Update Profile button.</span>
          </div>
        )}

        <div className="dash-profile-card-layout">
          <aside className="dash-profile-card-aside" aria-label="Player profile">
            <div className="dash-profile-avatar-ring">
              <img
                src={user?.profileImageUrl || getDefaultAvatarUrl(user)}
                alt=""
                className="dash-profile-avatar"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = getDefaultAvatarUrl(user);
                }}
              />
            </div>
            {user?.userId != null ? (
              <p className="dash-profile-card-username">ID {user.userId}</p>
            ) : null}
            {user?.username ? (
              <p className="dash-profile-xp-sub" style={{ textAlign: 'center', marginTop: 4 }}>@{user.username}</p>
            ) : null}

            <div className="dash-profile-xp-block">
              <div className="dash-profile-xp-head">
                <span className="dash-profile-xp-label">Profile Power</span>
                <span className="dash-profile-xp-value tabular-nums">{profileStats.percent}%</span>
              </div>
              <div className="dash-profile-progress" role="progressbar" aria-valuenow={profileStats.percent} aria-valuemin={0} aria-valuemax={100}>
                <span
                  className="dash-profile-progress-fill"
                  style={{ width: `${profileStats.percent}%` }}
                />
              </div>
              <p className="dash-profile-xp-sub">
                {profileStats.filled}/{profileStats.total} fields · {profileStats.questsDone}/{profileStats.quests.length} quests
              </p>
            </div>

            <ul className="dash-profile-quests" aria-label="Account quests">
              {profileStats.quests.map((quest, index) => (
                <li
                  key={quest.id}
                  className={`dash-profile-quest${quest.done ? ' dash-profile-quest--done' : ''}`}
                  style={{ animationDelay: `${0.08 * index}s` }}
                >
                  <span className="dash-profile-quest-icon" aria-hidden>{quest.icon}</span>
                  <span className="dash-profile-quest-label">{quest.label}</span>
                  <span className="dash-profile-quest-status">{quest.done ? '✓' : '…'}</span>
                </li>
              ))}
            </ul>
          </aside>

          <div className="dash-profile-card-body">
        <Formik
          initialValues={initialProfileValues(user)}
          validationSchema={PROFILE_VALIDATION}
          enableReinitialize
          onSubmit={async (values) => {
            const payload = {
              firstName: values.firstName.trim(),
              lastName: values.lastName.trim(),
              phone: values.phone.trim(),
              dateOfBirth: values.dateOfBirth.trim()
                ? clampToValidCalendarDate(values.dateOfBirth.trim()) || values.dateOfBirth.trim()
                : '',
              streetAddress: values.streetAddress.trim(),
              city: values.city.trim(),
              state: values.state.trim(),
              country: values.country.trim(),
              zipCode: values.zipCode.trim()
            };
            const initial = initialProfileValues(user);
            const profileKeys = ['firstName', 'lastName', 'phone', 'dateOfBirth', 'streetAddress', 'city', 'state', 'country', 'zipCode'];
            const hasNoChange = profileKeys.every((k) => String(payload[k] || '') === String(initial[k] || ''));
            if (hasNoChange) return;
            try {
              const res = await userApi.updateProfile(payload);
              await refreshUser();
              if (returnToDeposit && isPurchaseProfileComplete({ ...user, ...payload, isPhoneVerified: user?.isPhoneVerified })) {
                toast.success('Profile updated. You can now complete your deposit.');
                navigate('/deposit', { replace: true });
              } else if (returnToDeposit) {
                toast.success('Profile updated. Verify your phone number to continue depositing.');
              } else if (res?.firstTimeProfileComplete) {
                toast.success('First step complete for depositing money. Complete all steps and you can deposit.');
                try {
                  window.dispatchEvent(new CustomEvent('notifications:refresh'));
                } catch (_) {}
              } else {
                toast.success('Profile updated.');
              }
            } catch (err) {
              toast.error(err.message || 'Failed to update profile.');
            }
          }}
        >
          {({ errors, touched, isSubmitting, dirty, values, setFieldValue, setFieldTouched }) => {
            const phoneParts = parseE164(values.phone);
            const phoneReady = isCompleteNational(phoneParts.countryIso, phoneParts.national);
            const phoneLocked = phoneAlreadyVerified || otpOpen;

            const handleSendPhoneOtp = async () => {
              if (sendingOtp || phoneAlreadyVerified || !storeRequiresPhoneOtp) return;
              if (!phoneReady) {
                toast.error('Enter a valid 10-digit Phone number.');
                setFieldTouched('phone', true);
                return;
              }
              setSendingOtp(true);
              try {
                const res = await phoneApi.sendPhoneOtp(String(values.phone || '').trim());
                if (res?.skipped || res?.required === false) {
                  await refreshUser();
                  return;
                }
                if (res?.phone) setFieldValue('phone', res.phone);
                setOtpOpen(true);
                setOtpCode('');
                toast.success('Verification code sent.');
              } catch (err) {
                if (err?.code === 'PHONE_NOT_REQUIRED' || err?.body?.code === 'PHONE_NOT_REQUIRED') {
                  await refreshUser();
                  return;
                }
                toast.error(phoneOtpErrorMessage(err));
              } finally {
                setSendingOtp(false);
              }
            };

            const handleConfirmPhoneOtp = async () => {
              if (verifyingOtp || phoneAlreadyVerified || !storeRequiresPhoneOtp) return;
              setVerifyingOtp(true);
              try {
                const res = await phoneApi.checkPhoneOtp(String(values.phone || '').trim(), otpCode.trim());
                if (res?.skipped || res?.required === false) {
                  setOtpOpen(false);
                  setOtpCode('');
                  await refreshUser();
                  return;
                }
                if (!res?.verified && !res?.phoneVerificationToken) {
                  toast.error('Verification failed. Please try again.');
                  return;
                }
                if (res.phone) setFieldValue('phone', res.phone);
                setOtpOpen(false);
                setOtpCode('');
                await refreshUser();
                toast.success(
                  returnToDeposit
                    ? 'Phone verified. Returning to deposit…'
                    : 'Phone verified.'
                );
                if (returnToDeposit) {
                  navigate('/deposit', { replace: true });
                }
              } catch (err) {
                if (err?.code === 'PHONE_NOT_REQUIRED' || err?.body?.code === 'PHONE_NOT_REQUIRED') {
                  setOtpOpen(false);
                  setOtpCode('');
                  await refreshUser();
                  return;
                }
                toast.error(err.message || 'Could not verify code.');
              } finally {
                setVerifyingOtp(false);
              }
            };

            return (
            <Form>
              <div className="dash-settings-form-grid dash-settings-form-grid--2">
                <div className="min-w-0">
                  <label className={labelClass}>User ID</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={user?.userId != null ? String(user.userId) : ''}
                      className={`${inputClassReadonly} min-w-0`}
                    />
                    <span className="dash-input-lock" title="User ID cannot be changed">
                      <LockIcon className="w-5 h-5" />
                    </span>
                  </div>
                  <p className="dash-field-hint break-words">Use this ID when contacting support.</p>
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Username</label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={user?.username ?? ''}
                      className={`${inputClassReadonly} min-w-0`}
                    />
                    <span className="dash-input-lock" title="Username cannot be changed">
                      <LockIcon className="w-5 h-5" />
                    </span>
                  </div>
                  <p className="dash-field-hint break-words">Username cannot be changed.</p>
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Email</label>
                  <div className="relative">
                    <input
                      type="email"
                      readOnly
                      value={user?.email ?? ''}
                      className={`${inputClassReadonly} min-w-0`}
                    />
                    <span className="dash-input-lock" title="Email cannot be changed">
                      <LockIcon className="w-5 h-5" />
                    </span>
                  </div>
                  <p className="dash-field-hint break-words">Email cannot be changed for security reasons.</p>
                </div>
              </div>

              <div className="dash-settings-form-grid dash-settings-form-grid--2 mt-4">
                <div className="min-w-0">
                  <label className={labelClass}>First name</label>
                  <Field
                    name="firstName"
                    type="text"
                    placeholder="Letters only (e.g. John)"
                    maxLength={100}
                    disabled={!isVerified}
                    className={touched.firstName && errors.firstName ? inputClassError : inputClass}
                    autoComplete="given-name"
                  />
                  {touched.firstName && errors.firstName && <p className="dash-field-error">{errors.firstName}</p>}
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>Last name</label>
                  <Field
                    name="lastName"
                    type="text"
                    placeholder="Letters only (e.g. Doe)"
                    maxLength={100}
                    disabled={!isVerified}
                    className={touched.lastName && errors.lastName ? inputClassError : inputClass}
                    autoComplete="family-name"
                  />
                  {touched.lastName && errors.lastName && <p className="dash-field-error">{errors.lastName}</p>}
                </div>
              </div>

              <div className="mt-4" id="verify-phone">
                <label className={labelClass}>Phone number *</label>
                <div className="dash-phone-verify-row">
                  <PhoneNumberField
                    id="settings-phone"
                    name="phone"
                    variant="gate"
                    value={values.phone ?? ''}
                    onChange={(e164) => {
                      if (phoneLocked) return;
                      setFieldValue('phone', e164);
                      if (otpOpen) {
                        setOtpOpen(false);
                        setOtpCode('');
                      }
                    }}
                    onBlur={() => setFieldTouched('phone', true)}
                    readOnly={phoneLocked}
                    disabled={!isVerified || sendingOtp || verifyingOtp}
                    inputClassName={
                      touched.phone && errors.phone
                        ? 'err'
                        : phoneAlreadyVerified
                          ? 'ok'
                          : ''
                    }
                  />
                  <div className="dash-phone-verify-side">
                    {phoneAlreadyVerified ? (
                      <span className="dash-phone-verified-pill" aria-label="Phone verified">
                        Verified
                      </span>
                    ) : storeRequiresPhoneOtp ? (
                      otpOpen ? (
                        <button
                          type="button"
                          className="dash-btn-outline dash-phone-verify-btn"
                          onClick={() => {
                            setOtpOpen(false);
                            setOtpCode('');
                          }}
                          disabled={sendingOtp || verifyingOtp}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="dash-btn-cta dash-phone-verify-btn"
                          onClick={handleSendPhoneOtp}
                          disabled={!isVerified || sendingOtp || !phoneReady}
                        >
                          {sendingOtp ? 'Sending…' : 'Verify'}
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
                {otpOpen && storeRequiresPhoneOtp && !phoneAlreadyVerified ? (
                  <div className="dash-phone-otp-row mt-3">
                    <input
                      className={inputClass}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      disabled={verifyingOtp || sendingOtp}
                    />
                    <button
                      type="button"
                      className="dash-btn-cta dash-phone-verify-btn"
                      disabled={verifyingOtp || sendingOtp || otpCode.length < 4}
                      onClick={handleConfirmPhoneOtp}
                    >
                      {verifyingOtp ? 'Checking…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      className="dash-btn-outline dash-phone-verify-btn"
                      disabled={verifyingOtp || sendingOtp}
                      onClick={handleSendPhoneOtp}
                    >
                      {sendingOtp ? 'Sending…' : 'Resend'}
                    </button>
                  </div>
                ) : null}
                {phoneAlreadyVerified ? (
                  <p className="dash-field-hint mt-1 mb-0">
                    Verified phone numbers can’t be changed for security. Contact support if you need an update.
                  </p>
                ) : (
                  <p className="dash-field-hint mt-1 mb-0">
                    Verify your phone to unlock purchases. You’ll receive a one-time code by SMS.
                  </p>
                )}
                {touched.phone && errors.phone && <p className="dash-field-error">{errors.phone}</p>}
              </div>

              <div className="mt-4">
                <label className={labelClass}>Date of birth</label>
                <Field name="dateOfBirth">
                  {({ field, form }) => {
                    const maxDate = new Date().toISOString().slice(0, 10);
                    const handleChange = (e) => {
                      const corrected = clampToValidCalendarDate(e.target.value);
                      form.setFieldValue('dateOfBirth', corrected);
                    };
                    const handleBlur = (e) => {
                      const corrected = clampToValidCalendarDate(e.target.value);
                      if (corrected !== e.target.value) form.setFieldValue('dateOfBirth', corrected);
                      field.onBlur(e);
                    };
                    const handleKeyDown = (e) => {
                      const val = clampToValidCalendarDate(field.value || '') || field.value || '';
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        form.setFieldValue('dateOfBirth', val ? addDaysToDate(val, 1, maxDate) : maxDate);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        form.setFieldValue('dateOfBirth', val ? addDaysToDate(val, -1, maxDate) : DATE_MIN);
                      }
                    };
                    const displayValue = clampToValidCalendarDate(field.value || '') || field.value || '';
                    return (
                      <input
                        type="date"
                        {...field}
                        value={displayValue}
                        min="1900-01-01"
                        max={maxDate}
                        disabled={!isVerified}
                        className={touched.dateOfBirth && errors.dateOfBirth ? inputClassError : inputClass}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                      />
                    );
                  }}
                </Field>
                <p className="dash-field-hint">Year must be between 1900 and {new Date().getFullYear()}.</p>
                {touched.dateOfBirth && errors.dateOfBirth && <p className="dash-field-error">{errors.dateOfBirth}</p>}
              </div>

              <div className="mt-4">
                <label className={labelClass}>Street address</label>
                <Field
                  name="streetAddress"
                  type="text"
                  placeholder="Enter street address"
                  maxLength={255}
                  disabled={!isVerified}
                  className={touched.streetAddress && errors.streetAddress ? inputClassError : inputClass}
                />
                {touched.streetAddress && errors.streetAddress && (
                  <p className="dash-field-error">{errors.streetAddress}</p>
                )}
              </div>

              <div className="dash-settings-form-grid dash-settings-form-grid--3 mt-4">
                <div className="min-w-0">
                  <label className={labelClass}>City</label>
                  <Field
                    name="city"
                    type="text"
                    placeholder="Enter city"
                    maxLength={100}
                    disabled={!isVerified}
                    className={touched.city && errors.city ? inputClassError : inputClass}
                  />
                  {touched.city && errors.city && <p className="dash-field-error">{errors.city}</p>}
                </div>
                <div className="min-w-0">
                  <label className={labelClass}>State</label>
                  <Field
                    name="state"
                    type="text"
                    placeholder="Enter state"
                    maxLength={100}
                    disabled={!isVerified}
                    className={touched.state && errors.state ? inputClassError : inputClass}
                  />
                  {touched.state && errors.state && <p className="dash-field-error">{errors.state}</p>}
                </div>
                <div className="min-w-0 md:col-span-2 lg:col-span-1">
                  <label className={labelClass}>Zip code</label>
                  <Field
                    name="zipCode"
                    type="text"
                    placeholder="Enter zip code"
                    maxLength={20}
                    disabled={!isVerified}
                    className={touched.zipCode && errors.zipCode ? inputClassError : inputClass}
                  />
                  {touched.zipCode && errors.zipCode && <p className="dash-field-error">{errors.zipCode}</p>}
                </div>
              </div>

              <div className="mt-4">
                <label className={labelClass}>Country</label>
                <Field
                  name="country"
                  type="text"
                  placeholder="Enter country"
                  maxLength={100}
                  disabled={!isVerified}
                  className={touched.country && errors.country ? inputClassError : inputClass}
                />
                {touched.country && errors.country && <p className="dash-field-error">{errors.country}</p>}
              </div>

              <button
                type="submit"
                disabled={!isVerified || isSubmitting || !dirty}
                className="dash-btn-cta mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !isVerified
                    ? 'Verify your email to update profile'
                    : !dirty
                      ? 'Change a field to update profile'
                      : undefined
                }
              >
                {isSubmitting ? 'Saving…' : 'Update Profile'}
              </button>
            </Form>
            );
          }}
        </Formik>
          </div>
        </div>
      </section>

      {/* Password – change + reset */}
      <section className="dash-panel dash-settings-section dash-settings-section--password dash-animate-in dash-delay-4 min-w-0">
        <div className="dash-settings-section-head">
          <span className="dash-settings-section-icon" aria-hidden>🔐</span>
          <div className="min-w-0">
            <h2 className="dash-panel-title mb-0">Update Password</h2>
            <p className="dash-settings-section-sub">Change your password or send a reset link to your email.</p>
          </div>
        </div>

        <div className="dash-settings-section-body">
          <Formik
            initialValues={{ currentPassword: '', newPassword: '', confirmPassword: '' }}
            validationSchema={CHANGE_PASSWORD_VALIDATION}
            onSubmit={async (values, { resetForm }) => {
              try {
                await userApi.changePassword(values.currentPassword, values.newPassword);
                toast.success('Password updated successfully.');
                resetForm();
              } catch (err) {
                toast.error(err.message || 'Failed to change password.');
              }
            }}
          >
            {({ errors, touched, isSubmitting }) => (
              <Form>
                <div className="dash-settings-form-grid dash-settings-form-grid--3">
                  <div className="min-w-0">
                    <label className={labelClass}>Current password</label>
                    <Field
                      name="currentPassword"
                      type="password"
                      placeholder="Enter current password"
                      autoComplete="current-password"
                      className={touched.currentPassword && errors.currentPassword ? inputClassError : inputClass}
                    />
                    {touched.currentPassword && errors.currentPassword && (
                      <p className="dash-field-error">{errors.currentPassword}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass}>New password</label>
                    <Field
                      name="newPassword"
                      type="password"
                      placeholder="Min 8: upper, lower, number, special"
                      autoComplete="new-password"
                      className={touched.newPassword && errors.newPassword ? inputClassError : inputClass}
                    />
                    {touched.newPassword && errors.newPassword && (
                      <p className="dash-field-error">{errors.newPassword}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass}>Confirm new password</label>
                    <Field
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      className={touched.confirmPassword && errors.confirmPassword ? inputClassError : inputClass}
                    />
                    {touched.confirmPassword && errors.confirmPassword && (
                      <p className="dash-field-error">{errors.confirmPassword}</p>
                    )}
                  </div>
                </div>
                <button type="submit" disabled={isSubmitting} className="dash-btn-cta mt-5 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? 'Updating…' : 'Change Password'}
                </button>
              </Form>
            )}
          </Formik>

          <div className="dash-settings-subpanel">
            <h3 className="dash-settings-subpanel-title">
              <EnvelopeIcon className="w-4 h-4 text-[var(--dash-gold)]" />
              Forgot password?
            </h3>
            <p className="dash-settings-subpanel-desc">Send a password reset link to your email address.</p>
            <button
              type="button"
              onClick={handleSendResetEmail}
              disabled={resetEmailSending}
              className="dash-btn-outline disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {resetEmailSending ? 'Sending…' : 'Send Reset Email'}
            </button>
          </div>
        </div>
      </section>

      <PaymentAccountSection
        user={user}
        refreshUser={refreshUser}
        toast={toast}
        returnTo={returnTo}
      />

      <KycVerificationModal
        open={kycModalOpen}
        url={kycModalUrl}
        onClose={handleKycModalClose}
      />
    </div>
  );
}
