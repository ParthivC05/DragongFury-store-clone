import { useState, useEffect, useCallback, useRef } from 'react';
import { PaymentQRCode } from '../deposit/PaymentQRCode';
import * as walletApi from '../../api/wallet';
import '../deposit/SecurePaymentModal.css';

const POLL_INTERVAL_MS = 5000;

/** Countdown seconds until expiresAt; updates every second. */
function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!expiresAt) return setRemaining(null);
    const tick = () => {
      const end = new Date(expiresAt).getTime();
      const sec = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRemaining(sec);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

/** Format countdown as MM:SS (e.g. 600 sec → "10:00", 90 → "1:30"). */
function formatMmSs(seconds) {
  if (seconds == null || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** User-friendly time label: e.g. 600 → "10 min", 90 → "1 min 30 sec". */
function formatTimeLabel(seconds) {
  if (seconds == null || seconds < 0) return '';
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (s === 0) return `${m} min`;
    return `${m} min ${s} sec`;
  }
  return `${seconds} sec`;
}

export function SpeedWithdrawModal({ data, onClose, onRetry }) {
  const withdrawId = data?.withdrawId;
  const withdrawRequest = data?.withdrawRequest ?? data?.qrValue;
  const expiresAt = data?.expiresAt;
  const amount = data?.amount;
  const currency = data?.currency ?? data?.targetCurrency;
  const [pollStatus, setPollStatus] = useState(data?.status ?? 'active');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  const remaining = useCountdown(expiresAt);
  const isExpired = remaining !== null && remaining <= 0;
  const isPaid = pollStatus === 'paid';
  const isDeactivated = pollStatus === 'deactivated';
  const isFinal = isPaid || isDeactivated || isExpired;

  const fetchStatus = useCallback(async () => {
    if (!withdrawId || isFinal) return;
    try {
      const res = await walletApi.getSpeedWithdrawStatus(withdrawId);
      const status = res?.data?.status;
      if (status) setPollStatus(status);
    } catch {
      // keep previous status
    }
  }, [withdrawId, isFinal]);

  useEffect(() => {
    if (!withdrawId || isFinal) return;
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [withdrawId, isFinal, fetchStatus]);

  const copyLnurl = useCallback(() => {
    if (!withdrawRequest) return;
    navigator.clipboard.writeText(withdrawRequest).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [withdrawRequest]);

  if (isPaid) {
    return (
      <div className="secure-payment-modal speed-withdraw-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent">
        <div className="spm-container speed-withdraw-modal-content bg-[var(--spm-card)] border border-[var(--spm-border)] rounded-[var(--spm-radius)] shadow-[var(--spm-shadow)] max-h-[90vh] overflow-y-auto">
          <h2 className="spm-title">Withdrawal completed successfully</h2>
          <div className="spm-status-badge spm-status-completed">
            <span>✅</span>
            <span>Paid</span>
          </div>
          <p className="text-center text-[var(--spm-muted)] text-sm mb-6">
            Funds have been sent to your Lightning wallet.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="spm-btn-primary w-full"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (isDeactivated || isExpired) {
    return (
      <div className="secure-payment-modal speed-withdraw-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent">
        <div className="spm-container speed-withdraw-modal-content bg-[var(--spm-card)] border border-[var(--spm-border)] rounded-[var(--spm-radius)] shadow-[var(--spm-shadow)] max-h-[90vh] overflow-y-auto">
          <h2 className="spm-title">Withdrawal request expired</h2>
          <div className="spm-status-badge spm-status-expired">
            <span>⏹</span>
            <span>{isDeactivated ? 'Deactivated' : 'Expired'}</span>
          </div>
          <p className="text-center text-[var(--spm-muted)] text-sm mb-6">
            This withdrawal request has expired or is no longer active.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={onRetry} className="spm-btn-primary flex-1">
              Create new request
            </button>
            <button type="button" onClick={onClose} className="w-full flex-1 py-2.5 px-4 rounded-xl border border-gray-500 text-gray-200 font-medium hover:bg-gray-700/50 transition">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="secure-payment-modal speed-withdraw-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent">
      <div className="spm-container speed-withdraw-modal-content bg-[var(--spm-card)] border border-[var(--spm-border)] rounded-[var(--spm-radius)] shadow-[var(--spm-shadow)] max-h-[90vh] overflow-y-auto">
        <h2 className="spm-title">Receive via Lightning</h2>

        <div className="spm-amount-block">
          <p className="spm-amount-fiat">
            {currency} {Number(amount).toLocaleString()}
          </p>
          <p className="spm-amount-crypto">Scan the QR code with your Lightning wallet to receive your withdrawal.</p>
        </div>

        <div className="flex justify-center my-4">
          <div className="spm-status-badge spm-status-pending">
            <span>🟡</span>
            <span>Active — waiting for claim</span>
          </div>
        </div>

        <p className="spm-instruction">
          Scan this QR code with your Lightning wallet to receive your withdrawal.
        </p>

        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="spm-qr-card">
            <p className="text-sm font-medium text-[var(--spm-muted)] mb-2">Scan to receive</p>
            <PaymentQRCode payload={withdrawRequest} size={220} theme="light" />
          </div>

          {remaining != null && (
            <p className={`text-sm font-medium ${remaining <= 60 ? 'text-[var(--spm-red)] animate-pulse' : 'text-[var(--spm-muted)]'}`}>
              ⏳ Request expires in {formatMmSs(remaining)}
            </p>
          )}

          <button
            type="button"
            onClick={copyLnurl}
            disabled={!withdrawRequest}
            className={`spm-copy-btn ${copied ? 'copied' : ''}`}
          >
            {copied ? '✔ Copied!' : '📋 Copy LNURL'}
          </button>
        </div>

        <div className="rounded-xl bg-[var(--spm-bg)] border border-[var(--spm-border)] p-4 mb-6">
          <p className="text-xs font-semibold text-[var(--spm-muted)] uppercase tracking-wide mb-2">How to receive</p>
          <ol className="text-sm text-[var(--spm-muted)] list-decimal list-inside space-y-1">
            <li>Open your Lightning wallet</li>
            <li>Tap &quot;Withdraw&quot; or &quot;Receive&quot;</li>
            <li>Scan the QR code above</li>
            <li>Confirm the amount and complete</li>
          </ol>
        </div>

        <button type="button" onClick={onClose} className="w-full py-2.5 px-4 rounded-xl border border-gray-500 text-gray-200 font-medium hover:bg-gray-700/50 transition">
          Close (request remains active until claimed or expired)
        </button>
      </div>
    </div>
  );
}
