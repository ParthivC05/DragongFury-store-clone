import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVipStatus } from '../../context/VipStatusContext';
import * as walletApi from '../../api/wallet';
import * as kycApi from '../../api/kyc';
import { usePageContentReady } from '../../context/PageReadyContext';
import { ChimeCashappWithdrawModal } from '../../components/withdraw/ChimeCashappWithdrawModal';
import { KycVerificationModal } from '../../components/withdraw/KycVerificationModal';
import { KycIdentityGateModal } from '../../components/withdraw/KycIdentityGateModal';
import {
  DfRedeemView,
  buildRedeemMethods,
  buildRedeemPresets,
  recipientError
} from '../../components/withdraw/DfRedeemView';
import { showIntercomLauncher } from '../../components/intercomApi';
import { site } from '../../config/site';
import { formatSc, roundTo2 } from '../../utils/currency';
import { XXPAY_WITHDRAW_MIN } from '../../utils/xxpayAmounts';

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return (
    date.toLocaleDateString(undefined, { dateStyle: 'short' }) +
    ' ' +
    date.toLocaleTimeString(undefined, { timeStyle: 'short' })
  );
}

function withdrawMethodLabel(method) {
  if (method === 'scrypto') return 'Crypto';
  if (method === 'payment-api' || method === 'linked-account' || method === 'orionstarspay') return 'Card / Bank';
  return method || 'Card / Bank';
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending' || s === 'processing') return 'pending';
  if (s === 'rejected' || s === 'failed' || s === 'cancelled') return 'bad';
  return 'done';
}

/**
 * /redeem (and legacy /withdraw): loads balances, limits, payout methods and KYC state,
 * then hands everything to DfRedeemView. Submission still goes through the
 * Chime/Cash App manual withdrawal endpoint via the confirm modal.
 */
export function Withdraw() {
  const { user, refreshBalance } = useAuth();
  const { toast } = useToast();
  const { vipStatus } = useVipStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [balance, setBalance] = useState(null);
  const [legacyRequests, setLegacyRequests] = useState([]);
  const [chimeRequests, setChimeRequests] = useState([]);
  const [limits, setLimits] = useState(null);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [cardValid, setCardValid] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [payoutType, setPayoutType] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [kyc, setKyc] = useState(null);
  const [kycStarting, setKycStarting] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [kycModalUrl, setKycModalUrl] = useState('');
  const [kycGateDismissed, setKycGateDismissed] = useState(false);

  usePageContentReady(!(loading && balance == null));

  // Hide the Intercom launcher on the redeem page; restore it when leaving.
  useEffect(() => {
    document.body.classList.add('hide-intercom-launcher');
    return () => {
      document.body.classList.remove('hide-intercom-launcher');
      showIntercomLauncher();
    };
  }, []);

  const isAdmin = Boolean(user?.isAdmin);
  const profileComplete = Boolean(user && (user.firstName || '').trim() && (user.lastName || '').trim());
  const kycRequired = Boolean(kyc?.required);
  const kycApproved = Boolean(kyc?.approved) || !kycRequired;
  const kycBlocking = kycRequired && !kycApproved;

  useEffect(() => {
    if (!kycBlocking) setKycGateDismissed(false);
  }, [kycBlocking]);

  const currency = limits?.currency || 'SC';
  const withdrawMin = limits?.withdrawMin ?? 10;
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
          limits?.dailyWithdrawRemaining != null ? Number(limits.dailyWithdrawRemaining) : dailyWithdrawMax
        )
      : null;

  const methods = useMemo(
    () =>
      buildRedeemMethods(paymentTypes, {
        withdrawMin,
        withdrawMax: dailyWithdrawRemaining != null ? Math.min(withdrawMax, dailyWithdrawRemaining) : withdrawMax,
        xxpayMin: XXPAY_WITHDRAW_MIN
      }),
    [paymentTypes, withdrawMin, withdrawMax, dailyWithdrawRemaining]
  );

  const selectedMethod = useMemo(() => methods.find((m) => m.key === payoutType) || null, [methods, payoutType]);

  const amountNum = parseFloat(amount) || 0;
  const availableSc = balance?.available_to_withdraw_sc != null ? Number(balance.available_to_withdraw_sc) : 0;
  const spinWheelMaxWithdraw =
    balance?.spin_wheel_max_withdraw_sc != null ? Number(balance.spin_wheel_max_withdraw_sc) : availableSc;
  const spinWheelPlaythroughApplies = Boolean(balance?.spin_wheel_playthrough_applies);
  const spinWheelRemainingWager =
    balance?.spin_wheel_remaining_wager_sc != null ? Number(balance.spin_wheel_remaining_wager_sc) : 0;

  const effectiveAvailableSc = Math.max(
    0,
    Math.min(
      availableSc,
      spinWheelMaxWithdraw,
      dailyWithdrawRemaining != null ? dailyWithdrawRemaining : Infinity
    )
  );
  const effectiveWithdrawMax =
    dailyWithdrawRemaining != null ? Math.min(withdrawMax, dailyWithdrawRemaining) : withdrawMax;
  const effectiveWithdrawMin = selectedMethod?.min ?? withdrawMin;

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
          : Number(balance?.usable_balance_psc || 0) + Number(balance?.usable_balance_bsc || 0);
  const usableRsc =
    balance?.usable_balance_rsc != null
      ? Number(balance.usable_balance_rsc)
      : balance?.balance_rsc != null
        ? Number(balance.balance_rsc)
        : 0;
  const frozenRsc = balance?.frozen_balance_rsc != null ? Number(balance.frozen_balance_rsc) : 0;

  const presets = useMemo(
    () => buildRedeemPresets(effectiveWithdrawMin, effectiveWithdrawMax),
    [effectiveWithdrawMin, effectiveWithdrawMax]
  );

  const pendingToday = useMemo(() => {
    const pendingStatuses = new Set(['pending', 'processing']);
    const legacy = (legacyRequests || [])
      .filter((r) => pendingStatuses.has(String(r.status || '').toLowerCase()))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const chime = (chimeRequests || [])
      .filter((r) => pendingStatuses.has(String(r.status || '').toLowerCase()))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    return Math.round((legacy + chime) * 100) / 100;
  }, [legacyRequests, chimeRequests]);

  const mergedRequests = useMemo(() => {
    const legacy = (legacyRequests || []).map((r) => ({
      id: `legacy-${r.id}`,
      amount: r.amount,
      method: withdrawMethodLabel(r.method),
      status: r.status,
      destination: r.linkedAccountId || r.cryptoAddress || null,
      createdAt: r.createdAt || r.created_at,
      rejectionReason: r.rejectionReason,
      _sort: new Date(r.createdAt || r.created_at || 0).getTime()
    }));
    const chime = (chimeRequests || []).map((r) => ({
      id: `chime-${r.id}`,
      amount: r.amount,
      method:
        methods.find((m) => m.key === r.payoutType)?.label ||
        (r.payoutType ? String(r.payoutType).replace(/_/g, ' ') : 'Cash App'),
      status: r.status,
      destination: r.destinationUsername,
      createdAt: r.createdAt,
      rejectionReason: r.rejectionReason,
      _sort: new Date(r.createdAt || 0).getTime()
    }));
    return [...legacy, ...chime].sort((a, b) => b._sort - a._sort);
  }, [legacyRequests, chimeRequests, methods]);

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
      setPaymentTypes(Array.isArray(methodsRes?.paymentTypes) ? methodsRes.paymentTypes : []);
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
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Drop a selection that is no longer offered by the API; auto-pick the first when empty.
  useEffect(() => {
    setPayoutType((prev) => {
      if (prev && methods.some((m) => m.key === prev)) return prev;
      return methods[0]?.key || null;
    });
  }, [methods]);

  useEffect(() => {
    const flag = searchParams.get('kyc');
    if (flag !== 'return' && flag !== 'done') return;
    let cancelled = false;
    kycApi
      .getKycStatus({ refresh: '1' })
      .then((res) => {
        if (cancelled) return;
        setKyc(res);
        if (res?.approved) toast.success('Identity verified. You can redeem now.');
        else if (res?.kycStatus === 'pending' || res?.kycStatus === 'in_review') {
          toast.info('Verification submitted. We’ll unlock redeem once it’s approved.');
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
          toast.success('Identity verified. You can redeem now.');
        } else if (result?.declined || res?.kycStatus === 'declined') {
          toast.error(res?.declineReason || 'Verification was declined. You can try again.');
        } else if (result?.inReview || res?.kycStatus === 'in_review' || res?.kycStatus === 'pending') {
          if (!result?.closed) {
            toast.info('Verification submitted. We’ll unlock redeem once it’s approved.');
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
      Promise.all([
        walletApi.getWithdrawalRequests({ limit: 50 }),
        walletApi.getChimeCashappWithdrawalRequests({ limit: 50 }),
        walletApi.getBalance(),
        walletApi.getWalletLimits()
      ])
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

  const handleOpenConfirm = useCallback(() => {
    if (!selectedMethod) return;
    if (recipientError(selectedMethod.key, recipient)) return;
    setModalOpen(true);
  }, [selectedMethod, recipient]);

  async function handleModalSubmit(destinationUsername, destinationMeta) {
    const pendingDest = Boolean(destinationMeta?.destinationPending);
    const isCardOrBank = payoutType === 'card' || payoutType === 'bank_transfer';
    if (!pendingDest && (!destinationUsername || destinationUsername.length < 2)) {
      toast.error('Enter a valid account.');
      return;
    }
    if (dailyWithdrawRemaining != null && amountNum > dailyWithdrawRemaining + 0.004) {
      toast.error(
        dailyWithdrawRemaining <= 0
          ? `You have reached your daily redeem limit of ${currency} ${formatSc(dailyWithdrawMax)}. Please try again tomorrow.`
          : `Your daily redeem limit is ${currency} ${formatSc(dailyWithdrawMax)}. You can redeem ${currency} ${formatSc(dailyWithdrawRemaining)} more today.`
      );
      return;
    }
    const meta = {
      ...(destinationMeta && typeof destinationMeta === 'object' ? destinationMeta : {})
    };
    setSubmitting(true);
    try {
      await walletApi.createChimeCashappWithdrawal({
        payoutType,
        amount: roundTo2(amountNum),
        destinationUsername: destinationUsername || (isCardOrBank ? 'Pending' : ''),
        ...(Object.keys(meta).length ? { destinationMeta: meta } : {}),
        currency: currency === 'SC' ? 'USD' : currency || 'USD'
      });
      toast.success('Redeem request submitted. We’ll hold that amount until it’s reviewed.');
      setModalOpen(false);
      setAmount('');
      setRecipient('');
      setCardValid('');
      setRoutingNumber('');
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

  const notices = (
    <>
      {!profileComplete && (
        <p className="df-redeem-notice df-redeem-notice--bad">
          Add your first and last name before you can cash out.{' '}
          <Link to="/settings?returnTo=withdraw">Complete profile</Link>
        </p>
      )}

      {profileComplete && kycBlocking && (
        <p className="df-redeem-notice">
          {kyc?.kycStatus === 'pending' || kyc?.kycStatus === 'in_review'
            ? 'Your verification is in progress. Redeem unlocks as soon as it’s approved.'
            : kyc?.kycStatus === 'declined'
              ? kyc?.declineReason || 'Verification was declined. You can try again with a clear ID photo.'
              : 'A one-time identity check is required before your first redeem.'}{' '}
          {kycGateDismissed ? (
            <button
              type="button"
              onClick={() => {
                setKycGateDismissed(false);
                if (kyc?.kycStatus !== 'pending' && kyc?.kycStatus !== 'in_review') handleStartKyc();
              }}
            >
              {kyc?.kycStatus === 'pending' || kyc?.kycStatus === 'in_review' ? 'View status' : 'Verify identity'}
            </button>
          ) : null}
        </p>
      )}

      {neverDeposited && (
        <p className="df-redeem-notice df-redeem-notice--bad">
          Your per-request cap is {currency} {formatSc(withdrawMax)} until you make your first purchase.
        </p>
      )}

      {dailyWithdrawMax != null && dailyWithdrawRemaining != null && dailyWithdrawRemaining <= 0 && (
        <p className="df-redeem-notice df-redeem-notice--bad">
          You’ve used your daily allowance of {currency} {formatSc(dailyWithdrawMax)}. It resets at midnight.
        </p>
      )}

      {spinWheelPlaythroughApplies && effectiveAvailableSc + 0.004 < availableSc && (
        <p className="df-redeem-notice">
          Some bonus winnings still need play before they unlock. You can redeem {currency}{' '}
          {formatSc(effectiveAvailableSc)} right now
          {availableSc > effectiveAvailableSc ? ` of ${formatSc(availableSc)} SC total` : ''}.
          {spinWheelRemainingWager > 0
            ? ` Play ${currency} ${formatSc(spinWheelRemainingWager)} more in games to unlock the rest.`
            : ''}
        </p>
      )}
    </>
  );

  const history = (
    <>
      <section className="redeem-history" aria-label="Redeem history">
        <h2 className="redeem-history__title">Redeem history</h2>
        {mergedRequests.length === 0 ? (
          <p className="redeem-history__empty">No redeem requests yet.</p>
        ) : (
          <ul className="redeem-history__list">
            {mergedRequests.map((r) => (
              <li key={r.id} className="redeem-history__row">
                <strong>
                  {formatSc(r.amount)} {currency}
                </strong>
                <span className={`redeem-history__status redeem-history__status--${statusTone(r.status)}`}>
                  {r.status === 'processing' ? 'Processing' : r.status}
                </span>
                <span>
                  {r.method}
                  {r.destination ? ` · ${r.destination}` : ''} · {formatDate(r.createdAt)}
                  {r.rejectionReason ? ` · ${r.rejectionReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="df-redeem-footnote">
        Need help? Contact <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>
    </>
  );

  const adminPanel =
    isAdmin && pendingLegacy.length > 0 ? (
      <section className="redeem-history" aria-label="Pending requests (admin)">
        <h2 className="redeem-history__title">Pending requests (admin)</h2>
        <div className="dash-data-table-wrap">
          <table className="dash-data-table min-w-[560px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLegacy.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td>
                    {r.user
                      ? `${r.user.firstName || ''} ${(r.user.lastName || '').trim() || r.user.email || r.userId}`
                      : `User #${r.userId}`}
                  </td>
                  <td className="dash-td-amount">${formatSc(r.amount)}</td>
                  <td>{withdrawMethodLabel(r.method)}</td>
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
                          <button
                            type="button"
                            onClick={() => handleReject(r.id)}
                            className="dash-btn-outline px-3 py-1.5 text-sm"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason('');
                            }}
                            className="dash-btn-outline px-3 py-1.5 text-sm"
                          >
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
    ) : null;

  return (
    <div className="dash-page dash-withdraw-page w-full min-w-0">
      <DfRedeemView
        currency={currency}
        loading={loading}
        methods={methods}
        selectedMethod={payoutType}
        onSelectMethod={(key) => {
          setPayoutType(key);
          setRecipient('');
          setCardValid('');
          setRoutingNumber('');
        }}
        amount={amount}
        onAmountChange={setAmount}
        presets={presets}
        recipient={recipient}
        onRecipientChange={setRecipient}
        cardValid={cardValid}
        onCardValidChange={setCardValid}
        routingNumber={routingNumber}
        onRoutingNumberChange={setRoutingNumber}
        withdrawMin={effectiveWithdrawMin}
        withdrawMax={effectiveWithdrawMax}
        availableNow={effectiveAvailableSc}
        totalPlaySc={usableScWallet}
        redeemableSc={usableRsc}
        frozenRsc={frozenRsc}
        lockedBsc={lockedBsc}
        dailyMax={dailyWithdrawMax}
        dailyRemaining={dailyWithdrawRemaining}
        pendingToday={pendingToday}
        tierNumber={(vipStatus?.level_index ?? 0) + 1}
        tierName={vipStatus?.level_name || ''}
        tierXp={Number(vipStatus?.current_xp) || 0}
        tierXpTarget={Number(vipStatus?.next_level_xp) || 0}
        tierIsMax={Boolean(vipStatus?.is_max_level)}
        profileComplete={profileComplete}
        kycBlocking={kycBlocking}
        neverDeposited={neverDeposited}
        playthroughPending={spinWheelPlaythroughApplies ? spinWheelRemainingWager : 0}
        submitting={submitting}
        onSubmit={handleOpenConfirm}
        noticeSlot={notices}
        adminSlot={adminPanel}
        historySlot={history}
      />

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

      <ChimeCashappWithdrawModal
        open={modalOpen}
        className="df-redeem-modal"
        onClose={() => setModalOpen(false)}
        payoutLabel={selectedMethod?.label || ''}
        payoutType={payoutType}
        currency={currency}
        withdrawMin={effectiveWithdrawMin}
        amountNum={amountNum}
        availableSc={effectiveAvailableSc}
        submitting={submitting}
        initialDestination={recipient}
        onSubmit={handleModalSubmit}
      />

      <KycVerificationModal open={kycModalOpen} url={kycModalUrl} onClose={handleKycModalClose} />
    </div>
  );
}
