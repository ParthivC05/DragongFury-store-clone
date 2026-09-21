import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as walletApi from '../../api/wallet';
import * as kycApi from '../../api/kyc';
import { usePageContentReady } from '../../context/PageReadyContext';
import { ChimeCashappWithdrawModal } from '../../components/withdraw/ChimeCashappWithdrawModal';
import { KycVerificationModal } from '../../components/withdraw/KycVerificationModal';
import { KycIdentityGateModal } from '../../components/withdraw/KycIdentityGateModal';
import { ChimeLogoMark } from '../../components/payment/ChimeLogo';
import { showIntercomLauncher } from '../../components/intercomApi';
import { CashAppIcon, PayPalIcon, ZelleIcon } from '../../assets/icons';
import { site } from '../../config/site';
import { SCCoinIcon } from '../../assets/icons';
import { formatSc, roundTo2, constrainAmountInput } from '../../utils/currency';
import { XXPAY_WITHDRAW_MIN } from '../../utils/xxpayAmounts';

/** Same SC amount packages as the deposit page */
const PRESETS = [9.99, 19.99, 24.99, 29.99, 49.99, 74.99, 99.99, 149.99];

const MANUAL_PAYOUT_KEYS = new Set([
  'chime',
  'cashapp',
  'paypal',
  'venmo',
  'zelle',
  'card',
  'bank_transfer'
]);

const PAYOUT_META = {
  chime: { label: 'Chime', sublabel: 'Send to your Chime account', Icon: ChimeLogoMark },
  cashapp: { label: 'Cash App', sublabel: 'Send to your Cash App', Icon: CashAppIcon },
  paypal: { label: 'PayPal', sublabel: 'Send to your PayPal', Icon: PayPalIcon },
  venmo: { label: 'Venmo', sublabel: 'Send to your Venmo email', Icon: PayPalIcon },
  zelle: { label: 'Zelle', sublabel: 'Send to email or phone', Icon: ZelleIcon },
  card: { label: 'Debit Card', sublabel: 'Send to a debit card', Icon: null },
  bank_transfer: { label: 'Bank (ACH)', sublabel: 'Send to a US bank account', Icon: null }
};

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { dateStyle: 'short' }) + ' ' + date.toLocaleTimeString(undefined, { timeStyle: 'short' });
}

function withdrawMethodLabel(method) {
  if (method === 'scrypto') return 'Crypto';
  if (method === 'payment-api' || method === 'linked-account' || method === 'orionstarspay') return 'Card / Bank';
  return method || 'Card / Bank';
}

function buildPayoutOptions(paymentTypes) {
  const types = Array.isArray(paymentTypes) ? paymentTypes : [];
  const fromApi = types
    .filter((pt) => MANUAL_PAYOUT_KEYS.has(pt.key))
    .map((pt) => {
      const meta = PAYOUT_META[pt.key] || { label: pt.label || pt.key, sublabel: 'Payout', Icon: null };
      return {
        key: pt.key,
        label: meta.label,
        sublabel: meta.sublabel,
        Icon: meta.Icon,
        providerCode: pt.providers?.[0]?.providerCode || null
      };
    });
  if (fromApi.length > 0) return fromApi;
  return [
    { key: 'chime', label: 'Chime', sublabel: 'Send to your Chime account', Icon: ChimeLogoMark, providerCode: 'manual-chime' }
  ];
}

export function Withdraw() {
  const { user, refreshBalance } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [balance, setBalance] = useState(null);
  const [legacyRequests, setLegacyRequests] = useState([]);
  const [chimeRequests, setChimeRequests] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [payoutType, setPayoutType] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  /** 1 = balance + payout method, 2 = amount + withdraw */
  const [withdrawStep, setWithdrawStep] = useState(1);
  const [payoutOptions, setPayoutOptions] = useState(() => buildPayoutOptions([]));
  const [kyc, setKyc] = useState(null);
  const [kycStarting, setKycStarting] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalUrl, setKycModalUrl] = useState('');
  const [kycGateDismissed, setKycGateDismissed] = useState(false);

  usePageContentReady(!(loading && balance == null));

  // Hide the Intercom launcher on the withdraw page; restore it when leaving.
  useEffect(() => {
    document.body.classList.add('hide-intercom-launcher');
    return () => {
      document.body.classList.remove('hide-intercom-launcher');
      showIntercomLauncher();
    };
  }, []);

  const isAdmin = Boolean(user?.isAdmin);
  const profileComplete = user && (user.firstName || '').trim() && (user.lastName || '').trim();
  const kycRequired = Boolean(kyc?.required);
  const kycApproved = Boolean(kyc?.approved) || !kycRequired;
  const kycBlocking = kycRequired && !kycApproved;

  useEffect(() => {
    if (!kycBlocking) setKycGateDismissed(false);
  }, [kycBlocking]);
  const selectedPayout = payoutOptions.find((o) => o.key === payoutType) || null;
  const isXxpayPayout = String(selectedPayout?.providerCode || '').toLowerCase() === 'xxpay';
  const withdrawMin = Math.max(
    limits?.withdrawMin ?? 10,
    isXxpayPayout ? XXPAY_WITHDRAW_MIN : 0
  );
  const withdrawMax = limits?.withdrawMax ?? 50;
  const neverDeposited = Boolean(limits?.neverDeposited);
  const dailyWithdrawMax =
    limits?.dailyWithdrawMax != null && Number(limits.dailyWithdrawMax) > 0
      ? Number(limits.dailyWithdrawMax)
      : null;
  const dailyWithdrawRemaining =
    dailyWithdrawMax != null
      ? Math.max(
          0,
          limits?.dailyWithdrawRemaining != null
            ? Number(limits.dailyWithdrawRemaining)
            : dailyWithdrawMax
        )
      : null;
  const currency = limits?.currency || 'SC';
  const amountNum = parseFloat(amount) || 0;
  const availableSc = balance?.available_to_withdraw_sc != null ? Number(balance.available_to_withdraw_sc) : 0;
  const spinWheelMaxWithdraw =
    balance?.spin_wheel_max_withdraw_sc != null ? Number(balance.spin_wheel_max_withdraw_sc) : availableSc;
  const spinWheelPlaythroughApplies = Boolean(balance?.spin_wheel_playthrough_applies);
  const spinWheelRemainingWager =
    balance?.spin_wheel_remaining_wager_sc != null ? Number(balance.spin_wheel_remaining_wager_sc) : 0;
  const spinWheelMultiplier =
    balance?.spin_wheel_playthrough_multiplier != null ? Number(balance.spin_wheel_playthrough_multiplier) : 5;
  const effectiveAvailableSc = Math.max(
    0,
    Math.min(
      availableSc,
      spinWheelMaxWithdraw,
      dailyWithdrawRemaining != null ? dailyWithdrawRemaining : Infinity
    )
  );
  const effectiveWithdrawMax =
    dailyWithdrawRemaining != null
      ? Math.min(withdrawMax, dailyWithdrawRemaining)
      : withdrawMax;
  const usablePsc =
    balance?.usable_balance_psc != null ? Number(balance.usable_balance_psc) : 0;
  const usableBsc =
    balance?.usable_balance_bsc != null ? Number(balance.usable_balance_bsc) : 0;
  const lockedBsc =
    balance?.locked_balance_sc != null
      ? Number(balance.locked_balance_sc)
      : balance?.locked_balance_bsc != null
        ? Number(balance.locked_balance_bsc)
        : 0;
  const usableScWallet =
    balance?.usable_balance_sc != null
      ? Number(balance.usable_balance_sc)
      : balance?.balance_sc != null && balance?.frozen_balance_sc != null
        ? Math.max(0, Number(balance.balance_sc) - Number(balance.frozen_balance_sc))
        : balance?.balance_sc != null
          ? Number(balance.balance_sc)
          : usablePsc + usableBsc;
  const usableRsc =
    balance?.usable_balance_rsc != null ? Number(balance.usable_balance_rsc) : balance?.balance_rsc != null ? Number(balance.balance_rsc) : 0;
  const frozenRsc = balance?.frozen_balance_rsc != null ? Number(balance.frozen_balance_rsc) : 0;

  const presetsToShow = PRESETS.filter((p) => p >= withdrawMin && p <= effectiveWithdrawMax);
  if (presetsToShow.length === 0 && withdrawMin <= effectiveWithdrawMax) presetsToShow.push(withdrawMin);

  const paymentStepComplete = profileComplete && kycApproved && !!payoutType;

  useEffect(() => {
    if (!paymentStepComplete && withdrawStep === 2) {
      setWithdrawStep(1);
    }
  }, [paymentStepComplete, withdrawStep]);

  const handleBackToPaymentStep = useCallback(() => {
    setWithdrawStep(1);
    setAmount('');
  }, []);

  const handleContinueToAmountStep = useCallback(() => {
    if (!profileComplete || !kycApproved || !payoutType) return;
    setWithdrawStep(2);
  }, [profileComplete, kycApproved, payoutType]);

  const canOpenModal =
    profileComplete &&
    kycApproved &&
    amountNum >= withdrawMin &&
    amountNum <= effectiveWithdrawMax &&
    amountNum <= effectiveAvailableSc &&
    (dailyWithdrawRemaining == null || amountNum <= dailyWithdrawRemaining + 0.004) &&
    !submitting;

  const mergedRequests = useMemo(() => {
    const legacy = (legacyRequests || []).map((r) => ({
      ...r,
      _kind: 'legacy',
      _sort: new Date(r.createdAt || r.created_at || 0).getTime()
    }));
    const chime = (chimeRequests || []).map((r) => ({
      id: `chime-${r.id}`,
      rawId: r.id,
      amount: r.amount,
      currency: r.currency || currency,
      method:
        r.payoutType === 'chime'
          ? 'Chime'
          : r.payoutType === 'paypal'
            ? 'PayPal'
            : r.payoutType === 'venmo'
              ? 'Venmo'
              : r.payoutType === 'zelle'
                ? 'Zelle'
                : r.payoutType === 'card'
                  ? 'Debit Card'
                  : r.payoutType === 'bank_transfer'
                    ? 'Bank (ACH)'
                    : 'Cash App',
      status: r.status,
      destination: r.destinationUsername,
      createdAt: r.createdAt,
      rejectionReason: r.rejectionReason,
      _kind: 'chime',
      _sort: new Date(r.createdAt || 0).getTime()
    }));
    return [...legacy, ...chime].sort((a, b) => b._sort - a._sort);
  }, [legacyRequests, chimeRequests, currency]);

  const loadData = useCallback(async () => {
    try {
      const [limitsRes, balRes, reqRes, chimeRes, methodsRes, kycRes] = await Promise.all([
        walletApi.getWalletLimits(),
        walletApi.getBalance(),
        walletApi.getWithdrawalRequests({ limit: 50 }),
        walletApi.getChimeCashappWithdrawalRequests({ limit: 50 }).catch(() => ({ data: [], total: 0 })),
        walletApi.getWithdrawMethods().catch(() => ({ paymentTypes: [] })),
        kycApi.getKycStatus().catch(() => null)
      ]);
      setLimits(limitsRes);
      setBalance(balRes);
      setLegacyRequests(Array.isArray(reqRes?.data) ? reqRes.data : []);
      setChimeRequests(Array.isArray(chimeRes?.data) ? chimeRes.data : []);
      const nextOptions = buildPayoutOptions(methodsRes?.paymentTypes || []);
      setPayoutOptions(nextOptions);
      setPayoutType((prev) => (prev && nextOptions.some((o) => o.key === prev) ? prev : null));
      if (kycRes) setKyc(kycRes);
    } catch (err) {
      toast.error(err.message || 'Failed to load.');
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadData]);

  useEffect(() => {
    const flag = searchParams.get('kyc');
    if (flag !== 'return' && flag !== 'done') return;
    let cancelled = false;
    kycApi
      .getKycStatus({ refresh: '1' })
      .then((res) => {
        if (cancelled) return;
        setKyc(res);
        if (res?.approved) toast.success('Identity verified. You can withdraw now.');
        else if (res?.kycStatus === 'pending' || res?.kycStatus === 'in_review') {
          toast.info('Verification submitted. We’ll unlock withdraw once it’s approved.');
        } else if (res?.kycStatus === 'declined') {
          toast.error(res?.declineReason || 'Verification was declined. You can try again.');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete('kyc');
        setSearchParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, toast]);

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
      if (result?.closed) setKycGateDismissed(true);
      try {
        const res = await kycApi.getKycStatus({ refresh: '1' });
        setKyc(res);
        if (res?.approved) {
          toast.success('Identity verified. You can withdraw now.');
        } else if (result?.declined || res?.kycStatus === 'declined') {
          toast.error(res?.declineReason || 'Verification was declined. You can try again.');
        } else if (result?.inReview || res?.kycStatus === 'in_review' || res?.kycStatus === 'pending') {
          if (!result?.closed) {
            toast.info('Verification submitted. We’ll unlock withdraw once it’s approved.');
          }
        }
      } catch {
        /* ignore */
      }
    },
    [toast]
  );

  const hasPendingChime = chimeRequests.some((r) => r.status === 'pending' || r.status === 'processing');
  const hasPendingLegacy = legacyRequests.some((r) => r.status === 'pending');
  useEffect(() => {
    if (!hasPendingChime && !hasPendingLegacy) return;
    const interval = setInterval(() => {
      Promise.all([walletApi.getWithdrawalRequests({ limit: 50 }), walletApi.getChimeCashappWithdrawalRequests({ limit: 50 }), walletApi.getBalance(), walletApi.getWalletLimits()])
        .then(([reqRes, chRes, balRes, limitsRes]) => {
          setLegacyRequests(Array.isArray(reqRes?.data) ? reqRes.data : []);
          setChimeRequests(Array.isArray(chRes?.data) ? chRes.data : []);
          setBalance(balRes);
          if (limitsRes) setLimits(limitsRes);
          refreshBalance?.();
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [hasPendingChime, hasPendingLegacy, refreshBalance]);

  async function handleModalSubmit(destinationUsername, destinationMeta) {
    if (!destinationUsername || destinationUsername.length < 2) {
      toast.error('Enter a valid account.');
      return;
    }
    if (dailyWithdrawRemaining != null && amountNum > dailyWithdrawRemaining + 0.004) {
      toast.error(
        dailyWithdrawRemaining <= 0
          ? `You have reached your daily withdrawal limit of ${currency} ${formatSc(dailyWithdrawMax)}. Please try again tomorrow.`
          : `Your daily withdrawal limit is ${currency} ${formatSc(dailyWithdrawMax)}. You can withdraw ${currency} ${formatSc(dailyWithdrawRemaining)} more today.`
      );
      return;
    }
    setSubmitting(true);
    try {
      await walletApi.createChimeCashappWithdrawal({
        payoutType,
        amount: roundTo2(amountNum),
        destinationUsername,
        ...(destinationMeta ? { destinationMeta } : {}),
        currency: currency === 'SC' ? 'USD' : currency || 'USD'
      });
      toast.success('Withdrawal request submitted. We’ll hold that amount until it’s reviewed.');
      setModalOpen(false);
      setAmount('');
      await refreshBalance?.();
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id) {
    setApprovingId(id);
    try {
      await walletApi.approveWithdrawalRequest(id);
      toast.success('Withdrawal approved.');
      await refreshBalance?.();
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Approve failed.');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(id) {
    if (rejectingId !== id) {
      setRejectingId(id);
      setRejectReason('');
      return;
    }
    try {
      await walletApi.rejectWithdrawalRequest(id, rejectReason.trim());
      toast.success('Withdrawal rejected.');
      setRejectingId(null);
      setRejectReason('');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Reject failed.');
    }
  }

  const pendingLegacy = legacyRequests.filter((r) => r.status === 'pending');
  const payoutLabel =
    payoutType === 'chime'
      ? 'Chime'
      : payoutType === 'paypal'
        ? 'PayPal'
        : payoutType === 'venmo'
          ? 'Venmo'
          : payoutType === 'zelle'
            ? 'Zelle'
            : payoutType === 'card'
              ? 'Debit Card'
              : payoutType === 'bank_transfer'
                ? 'Bank (ACH)'
                : 'Cash App';

  return (
    <div className="dash-page dash-withdraw-page w-full min-w-0">
      <header className="dash-deposit-header dash-animate-in">
        <h1 className="dash-deposit-title">Withdraw Funds</h1>
        <p className="dash-deposit-sub">
          {withdrawStep === 1
            ? 'Choose your payout method, then enter your withdrawal amount.'
            : 'Select your amount and confirm your withdrawal.'}
        </p>
      </header>

      {profileComplete && (
        <nav className="dash-deposit-stepper dash-animate-in dash-delay-1" aria-label="Withdraw steps">
          <div className="dash-deposit-stepper-track w-full">
            <div
              className={`dash-deposit-stepper-item ${withdrawStep === 1 ? 'dash-deposit-stepper-item--active' : paymentStepComplete ? 'dash-deposit-stepper-item--done' : ''}`}
            >
              <span className="dash-deposit-stepper-dot" aria-hidden>
                {withdrawStep > 1 && paymentStepComplete ? '✓' : '1'}
              </span>
              <span className="dash-deposit-stepper-label">Payout</span>
            </div>
            <div
              className={`dash-deposit-stepper-item ${withdrawStep === 2 ? 'dash-deposit-stepper-item--active' : ''}`}
            >
              <span className="dash-deposit-stepper-dot" aria-hidden>2</span>
              <span className="dash-deposit-stepper-label">Amount</span>
            </div>
          </div>
        </nav>
      )}

      {!profileComplete && (
        <section className="dash-alert dash-alert--warning dash-animate-in dash-delay-1">
          <h2 className="dash-alert-title">Complete your profile to withdraw</h2>
          <p className="dash-alert-text">
            Please complete your profile details first. After updating, you can request withdrawals.
          </p>
          <Link to="/settings?returnTo=withdraw" className="dash-btn-cta no-underline inline-flex">
            Complete Profile
          </Link>
        </section>
      )}

      {profileComplete && kycBlocking && (
        <section className="dash-alert dash-alert--warning dash-animate-in dash-delay-1">
          <h2 className="dash-alert-title">Verify your identity to withdraw</h2>
          <p className="dash-alert-text">
            {kyc?.kycStatus === 'pending' || kyc?.kycStatus === 'in_review'
              ? 'Your verification is in progress. Withdrawals unlock once it’s approved (usually within a few minutes).'
              : kyc?.kycStatus === 'declined'
                ? (kyc?.declineReason || 'Verification was declined. You can try again with a clear ID photo.')
                : 'Complete a one-time identity check before your first withdrawal. It only takes a couple of minutes.'}
          </p>
          {kycGateDismissed && (
            <>
              {(kyc?.canStart || kyc?.kycStatus === 'declined' || kyc?.kycStatus === 'not_started' || !kyc?.kycStatus) && (
                <button
                  type="button"
                  className="dash-btn-cta"
                  disabled={kycStarting}
                  onClick={() => {
                    setKycGateDismissed(false);
                    handleStartKyc();
                  }}
                >
                  {kycStarting ? 'Starting…' : kyc?.kycStatus === 'declined' ? 'Retry verification' : 'Verify identity'}
                </button>
              )}
              {(kyc?.kycStatus === 'pending' || kyc?.kycStatus === 'in_review') && (
                <button
                  type="button"
                  className="dash-btn-secondary"
                  style={{ marginLeft: '0.5rem' }}
                  onClick={() => {
                    setKycGateDismissed(false);
                    kycApi.getKycStatus({ refresh: '1' }).then(setKyc).catch(() => {});
                  }}
                >
                  View status
                </button>
              )}
            </>
          )}
        </section>
      )}

      <KycIdentityGateModal
        open={Boolean(profileComplete && kycBlocking && !kycModalOpen && kyc && !kycGateDismissed)}
        status={kyc?.kycStatus}
        declineReason={kyc?.declineReason}
        starting={kycStarting}
        onVerify={handleStartKyc}
        onRefresh={() => {
          kycApi.getKycStatus({ refresh: '1' }).then(setKyc).catch(() => {});
        }}
        onClose={() => setKycGateDismissed(true)}
      />

      <section className="dash-alert dash-alert--info dash-withdraw-tip dash-animate-in dash-delay-1" role="note">
        <h2 className="dash-alert-title">
          Before you withdraw
        </h2>
        <p className="dash-alert-text m-0">
          Withdraw from Redeemable SC only. After approval, money usually arrives in your Chime, Cash App, or
          PayPal within 3 hours.
        </p>
      </section>

      {withdrawStep === 1 && (
        <>
      <section className="dash-panel dash-animate-in dash-delay-2 min-w-0">
        <h2 className="dash-panel-title">Account Balance</h2>
        <div className="dash-withdraw-balance-grid">
          <div className="dash-balance-card dash-balance-card--sc">
            <div className="dash-balance-card-head">
              <span className="dash-balance-label">Purchased SC</span>
              <span className="dash-balance-unit-badge dash-balance-unit-badge--sc" aria-hidden>SC</span>
            </div>
            <p className="dash-balance-value dash-balance-sc m-0">
              <SCCoinIcon className="dash-balance-coin-icon" />
              <span>{formatSc(usablePsc)}</span>
              <span className="dash-balance-unit">SC</span>
            </p>
            <p className="dash-balance-hint">From deposits</p>
          </div>
          <div className="dash-balance-card dash-balance-card--sc">
            <div className="dash-balance-card-head">
              <span className="dash-balance-label">Bonus SC</span>
              <span className="dash-balance-unit-badge dash-balance-unit-badge--sc" aria-hidden>SC</span>
            </div>
            <p className="dash-balance-value dash-balance-sc m-0">
              <SCCoinIcon className="dash-balance-coin-icon" />
              <span>{formatSc(usableBsc)}</span>
              <span className="dash-balance-unit">SC</span>
            </p>
            <p className="dash-balance-hint">
              {lockedBsc > 0
                ? `Locked: ${formatSc(lockedBsc)} SC — verify phone to unlock`
                : `From promos (${formatSc(usableScWallet)} total playable)`}
            </p>
          </div>
          <div className="dash-balance-card dash-balance-card--rsc">
            <div className="dash-balance-card-head">
              <span className="dash-balance-label">Redeemable SC</span>
              <span className="dash-balance-unit-badge dash-balance-unit-badge--rsc" aria-hidden>SC</span>
            </div>
            <p className="dash-balance-value dash-balance-rsc m-0">
              <span>{formatSc(usableRsc)}</span>
              <span className="dash-balance-unit">SC</span>
            </p>
            {frozenRsc > 0 ? (
              <p className="dash-balance-locked">On hold: {formatSc(frozenRsc)} SC</p>
            ) : (
              <p className="dash-balance-hint">
                {spinWheelPlaythroughApplies && effectiveAvailableSc + 0.004 < availableSc
                  ? `You can withdraw up to ${formatSc(effectiveAvailableSc)} SC right now`
                  : 'Ready to withdraw'}
              </p>
            )}
          </div>
        </div>
        {spinWheelPlaythroughApplies && effectiveAvailableSc + 0.004 < availableSc && (
          <div
            className="mt-4 rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: 'rgba(255, 193, 7, 0.45)', background: 'rgba(255, 193, 7, 0.08)', color: '#ffe8a3' }}
            role="status"
          >
            Some bonus winnings need more play in games before they can be withdrawn.
            You can withdraw up to {currency} {formatSc(effectiveAvailableSc)} right now
            {availableSc > effectiveAvailableSc ? ` (of ${formatSc(availableSc)} SC total)` : ''}.
            {spinWheelRemainingWager > 0 && (
              <> Play at least {currency} {formatSc(spinWheelRemainingWager)} more in games to unlock the rest.</>
            )}
          </div>
        )}
      </section>

      <section className={`dash-panel dash-animate-in dash-delay-3 min-w-0 ${!profileComplete || kycBlocking ? 'dash-panel--disabled' : ''}`}>
        <h2 className="dash-panel-title">Payout method</h2>
        <p className="dash-panel-desc">
          {!profileComplete
            ? 'Complete your profile above to choose a payout method.'
            : kycBlocking
              ? 'Verify your identity above to choose a payout method.'
              : 'Choose your payout method, then tap Continue.'}
        </p>
        <div className="dash-pay-grid dash-pay-grid--withdraw">
          {payoutOptions.map((opt) => {
            const Icon = opt.Icon;
            const selected = payoutType === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setPayoutType((prev) => (prev === opt.key ? null : opt.key));
                  setAmount('');
                }}
                className={`dash-pay-tile dash-pay-tile--withdraw-payout ${selected ? 'dash-pay-tile--active' : ''}`}
              >
                <span
                  className={`dash-pay-tile-withdraw-icon ${
                    opt.key === 'paypal'
                      ? 'dash-pay-tile-withdraw-icon--paypal'
                      : opt.key === 'zelle'
                        ? 'dash-pay-tile-withdraw-icon--zelle'
                        : opt.key === 'cashapp'
                          ? 'dash-pay-tile-withdraw-icon--cashapp'
                          : 'dash-pay-tile-withdraw-icon--chime'
                  }`}
                >
                  {Icon ? <Icon /> : null}
                </span>
                <div className="dash-pay-tile-body">
                  <p className="dash-pay-tile-label m-0">{opt.label}</p>
                  <p className="dash-pay-tile-sublabel m-0">{opt.sublabel}</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="dash-withdraw-continue-wrap">
          <button
            type="button"
            onClick={handleContinueToAmountStep}
            disabled={!paymentStepComplete}
            className="dash-btn-cta dash-deposit-submit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </section>
        </>
      )}

      {withdrawStep === 2 && profileComplete && kycApproved && (
        <>
      <section className={`dash-panel dash-animate-in min-w-0 ${!profileComplete ? 'dash-panel--disabled' : ''}`}>
        <div className="dash-withdraw-step-actions">
          <button
            type="button"
            onClick={handleBackToPaymentStep}
            className="dash-withdraw-back-btn"
            title="Change payout method"
            aria-label="Change payout method"
          >
            <span className="dash-withdraw-back-btn-full">← Change payout</span>
            <span className="dash-withdraw-back-btn-short">← Back</span>
          </button>
        </div>

        <div className="dash-withdraw-rsc-available" role="status">
          <p className="dash-withdraw-rsc-available-kicker m-0">Available to withdraw</p>
          <p className="dash-withdraw-rsc-available-title m-0">
            You have <strong>{formatSc(effectiveAvailableSc)} SC</strong> available
          </p>
          <p className="dash-withdraw-rsc-available-desc m-0">
            Min {formatSc(withdrawMin)} SC · Max {formatSc(effectiveWithdrawMax)} {neverDeposited ? 'RSC' : 'SC'} per request
            {dailyWithdrawMax != null
              ? ` · Up to ${formatSc(dailyWithdrawMax)} SC per day (${formatSc(dailyWithdrawRemaining)} left today)`
              : ''}
            .
          </p>
        </div>

        {neverDeposited && (
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: 'rgba(255, 51, 85, 0.45)', background: 'rgba(255, 51, 85, 0.08)', color: '#ffb3c0' }}
            role="alert"
          >
            Max limit is 30 RSC because you haven&apos;t deposited yet.
          </div>
        )}

        {dailyWithdrawMax != null && dailyWithdrawRemaining != null && dailyWithdrawRemaining <= 0 && (
          <div
            className="mb-4 rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: 'rgba(255, 51, 85, 0.45)', background: 'rgba(255, 51, 85, 0.08)', color: '#ffb3c0' }}
            role="alert"
          >
            You have reached your daily withdrawal limit of {currency} {formatSc(dailyWithdrawMax)}. Please try again tomorrow.
          </div>
        )}

        <h2 className="dash-panel-title">Select Amount</h2>
        <div className="dash-amount-grid">
          {presetsToShow.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              disabled={p > effectiveAvailableSc || p < withdrawMin || p > effectiveWithdrawMax}
              className={`dash-amount-chip ${amountNum === p ? 'dash-amount-chip--active' : ''}`}
            >
              SC {p}
            </button>
          ))}
        </div>
        <div className="dash-withdraw-custom-amount">
          <label className="dash-withdraw-custom-amount-label" htmlFor="withdraw-custom-amount">
            Or enter custom amount
          </label>
          <div className="dash-withdraw-custom-amount-field">
            <span className="dash-withdraw-custom-amount-prefix" aria-hidden>
              RSC
            </span>
            <input
              id="withdraw-custom-amount"
              type="number"
              min={withdrawMin}
              max={Math.min(effectiveAvailableSc, effectiveWithdrawMax)}
              step="0.01"
              placeholder={`${formatSc(withdrawMin)} – ${formatSc(effectiveWithdrawMax)}`}
              value={amount}
              onChange={(e) => {
                const next = constrainAmountInput(e.target.value);
                if (next !== null) setAmount(next);
              }}
              className="dash-withdraw-custom-amount-input"
            />
          </div>
          <p className="dash-withdraw-custom-amount-hint">
            Min {formatSc(withdrawMin)} SC · Max {formatSc(effectiveWithdrawMax)} {neverDeposited ? 'RSC' : 'SC'}
            {neverDeposited ? ' because you haven\'t deposited yet' : ''}
            {dailyWithdrawMax != null ? ` · ${formatSc(dailyWithdrawRemaining)} SC left today` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={!canOpenModal}
          className="dash-btn-cta dash-deposit-submit disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? 'Submitting…'
            : amountNum > 0
              ? `Withdraw ${formatSc(amountNum)} SC`
              : 'Withdraw'}
        </button>
      </section>
        </>
      )}

      {isAdmin && pendingLegacy.length > 0 && (
        <section className="dash-panel dash-animate-in dash-delay-2 min-w-0">
          <h2 className="dash-panel-title" style={{ color: 'var(--dash-gold)' }}>Pending requests (Admin)</h2>
          <p className="dash-panel-desc">Approve or reject legacy withdrawal requests.</p>
          <div className="dash-data-table-wrap">
            <table className="dash-data-table min-w-[600px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Destination</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingLegacy.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td>
                      {r.user ? `${(r.user.firstName || '')} ${(r.user.lastName || '').trim() || r.user.email || r.userId}` : `User #${r.userId}`}
                    </td>
                    <td className="dash-td-amount">${formatSc(r.amount)}</td>
                    <td>{withdrawMethodLabel(r.method)}</td>
                    <td className="text-xs max-w-[120px] truncate" title={r.cryptoAddress || r.linkedAccountId}>
                      {r.method === 'speed' && (r.cryptoAddress || r.linkedAccountId)
                        ? `${(r.cryptoAddress || r.linkedAccountId).slice(0, 10)}...${(r.cryptoAddress || r.linkedAccountId).slice(-6)}`
                        : (r.linkedAccountId || '—')}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(r.id)}
                          disabled={approvingId === r.id}
                          className="dash-btn-play px-3 py-1.5 text-sm disabled:opacity-50"
                        >
                          {approvingId === r.id ? '…' : 'Approve'}
                        </button>
                        {rejectingId !== r.id ? (
                          <button
                            type="button"
                            onClick={() => handleReject(r.id)}
                            className="dash-btn-outline px-3 py-1.5 text-sm"
                            style={{ borderColor: 'rgba(255, 51, 85, 0.5)', color: '#ff8a9e' }}
                          >
                            Reject
                          </button>
                        ) : (
                          <span className="flex items-center gap-2 flex-wrap">
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="dash-input-field !max-w-[9rem] !py-1.5 !text-sm"
                            />
                            <button type="button" onClick={() => handleReject(r.id)} className="dash-btn-outline px-3 py-1.5 text-sm">
                              Confirm
                            </button>
                            <button type="button" onClick={() => { setRejectingId(null); setRejectReason(''); }} className="dash-btn-outline px-3 py-1.5 text-sm">
                              Cancel
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="dash-panel dash-animate-in dash-delay-3 min-w-0">
        <h2 className="dash-panel-title">Withdrawal History</h2>
        <p className="dash-panel-desc !mb-4">Your recent withdrawal requests.</p>
        {mergedRequests.length === 0 ? (
          <p className="dash-empty-state">No withdrawal requests yet.</p>
        ) : (
          <div className="dash-data-table-wrap">
            <table className="dash-data-table min-w-[600px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {mergedRequests.map((w) => (
                  <tr key={w.id}>
                    <td className="whitespace-nowrap">{formatDate(w.createdAt)}</td>
                    <td className="dash-td-amount">${formatSc(w.amount)}</td>
                    <td>{w._kind === 'chime' ? w.method : withdrawMethodLabel(w.method)}</td>
                    <td className="text-xs max-w-[140px] truncate" title={w._kind === 'chime' ? w.destination : (w.cryptoAddress || w.linkedAccountId)}>
                      {w._kind === 'chime'
                        ? (w.destination || '—')
                        : w.method === 'scrypto' && (w.cryptoAddress || w.linkedAccountId)
                          ? `${(w.cryptoAddress || w.linkedAccountId).slice(0, 8)}...${(w.cryptoAddress || w.linkedAccountId).slice(-6)}`
                          : (w.linkedAccountId || '—')}
                    </td>
                    <td>
                      <span className={
                        w.status === 'pending' || w.status === 'processing'
                          ? 'dash-status-pending'
                          : w.status === 'rejected' || w.status === 'failed'
                            ? 'dash-status-default'
                            : 'dash-status-default'
                      }>
                        {w.status === 'processing' ? 'Processing' : w.status}
                      </span>
                    </td>
                    <td className="text-xs max-w-[140px] truncate" title={w.rejectionReason}>{w.rejectionReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="dash-deposit-footer dash-animate-in dash-delay-3">
        Need help? Contact <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>

      <ChimeCashappWithdrawModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        payoutLabel={payoutLabel}
        payoutType={payoutType}
        currency={currency}
        withdrawMin={withdrawMin}
        amountNum={amountNum}
        availableSc={effectiveAvailableSc}
        submitting={submitting}
        onSubmit={handleModalSubmit}
      />

      <KycVerificationModal
        open={kycModalOpen}
        url={kycModalUrl}
        onClose={handleKycModalClose}
      />
    </div>
  );
}
