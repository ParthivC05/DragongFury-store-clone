import { useEffect, useState } from 'react';
import {
  applyDiscountCode,
  getAppliedDiscountCode,
  removeDiscountCode
} from '../../api/emailCampaigns';
import { getSpinWheelStatus } from '../../api/spinwheel';
import { useToast } from '../../context/ToastContext';
import { formatSc, roundTo2 } from '../../utils/currency';
import './ApplyCampaignCodePanel.css';

function estimatePaySavings(applied, depositUsd) {
  if (!applied?.applied) return null;
  const amount = Number(depositUsd);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const value = Number(applied.discountValue) || 0;
  if (!(value > 0)) return null;
  let discountAmount = 0;
  if (applied.discountValueType === 'percentage') {
    discountAmount = roundTo2((amount * value) / 100);
  } else if (applied.discountValueType === 'fixed') {
    discountAmount = roundTo2(Math.min(value, amount - 0.01));
  }
  if (!(discountAmount > 0)) return null;
  const payAmount = Math.max(0.01, roundTo2(amount - discountAmount));
  return { discountAmount: roundTo2(amount - payAmount), payAmount };
}

/**
 * Inline offer-code field: input + Apply (no popup). Remove when applied.
 */
export function ApplyCampaignCodePanel({
  openModal: _openModal,
  onOpenModalChange,
  depositAmount,
  onAppliedChange
}) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(null);
  const [booting, setBooting] = useState(true);
  const [usableCoupons, setUsableCoupons] = useState([]);

  const loadUsableCoupons = async () => {
    try {
      const status = await getSpinWheelStatus();
      setUsableCoupons(Array.isArray(status?.usable_coupons) ? status.usable_coupons : []);
    } catch {
      setUsableCoupons([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res] = await Promise.all([
          getAppliedDiscountCode().catch(() => null),
          loadUsableCoupons()
        ]);
        if (cancelled) return;
        if (res?.applied) {
          setApplied(res);
          onAppliedChange?.(res);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Claim page deep-link (?offerCode=1) — keep focus on the inline input.
  useEffect(() => {
    if (!_openModal) return;
    onOpenModalChange?.(false);
    const el = document.getElementById('accp-code');
    if (el) el.focus();
  }, [_openModal, onOpenModalChange]);

  const applyCodeValue = async (rawCode) => {
    const trimmed = String(rawCode || '').trim();
    if (!trimmed) {
      toast.error('Enter your discount code.');
      return;
    }
    setBusy(true);
    try {
      const res = await applyDiscountCode(trimmed);
      setApplied(res);
      setCode('');
      toast.success(res?.message || 'Code applied.');
      onAppliedChange?.(res);
      await loadUsableCoupons();
    } catch (err) {
      toast.error(err.message || 'Could not apply code.');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    await applyCodeValue(code);
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      const res = await removeDiscountCode();
      setApplied(null);
      setCode('');
      toast.success(res?.message || 'Code removed.');
      onAppliedChange?.(null);
      await loadUsableCoupons();
    } catch (err) {
      toast.error(err.message || 'Could not remove code.');
    } finally {
      setBusy(false);
    }
  };

  const savings = estimatePaySavings(applied, depositAmount);

  const appliedCode = String(applied?.discountCode || '').trim().toUpperCase();
  const availableCoupons = usableCoupons.filter((c) => {
    const couponCode = String(c?.code || '').trim().toUpperCase();
    return couponCode && couponCode !== appliedCode;
  });

  const couponList = availableCoupons.length > 0 ? (
    <div className="accp-coupons">
      <p className="accp-coupons-title">Your spin coupons</p>
      <ul className="accp-coupons-list">
        {availableCoupons.map((c) => (
          <li key={c.id || c.code} className="accp-coupons-item">
            <div className="accp-coupons-meta">
              <code>{c.code}</code>
              <span>{c.label || `${c.discount_percent}% off next deposit`}</span>
            </div>
            <button
              type="button"
              className="accp-coupons-use"
              disabled={busy}
              onClick={() => applyCodeValue(c.code)}
            >
              Use
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  if (booting) {
    return (
      <div className="accp accp--inline">
        <p className="accp-muted">Checking offer…</p>
      </div>
    );
  }

  if (applied?.applied) {
    return (
      <div className="accp accp--inline accp--applied">
        <div className="accp-applied">
          <div className="accp-applied-main">
            <span className="accp-applied-label">Applied</span>
            <strong className="accp-applied-value">{applied.label || applied.discountCode}</strong>
            {applied.discountCode && (
              <code className="accp-applied-code">{applied.discountCode}</code>
            )}
            {savings ? (
              <span className="accp-bonus-preview">
                Pay ~${formatSc(savings.payAmount)} (save ${formatSc(savings.discountAmount)})
              </span>
            ) : null}
          </div>
          <button type="button" className="accp-remove" disabled={busy} onClick={handleRemove}>
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
        {couponList}
      </div>
    );
  }

  return (
    <div className="accp accp--inline">
      <form className="accp-form" onSubmit={handleApply}>
        <input
          id="accp-code"
          className="accp-input"
          value={code}
          onChange={(ev) => setCode(ev.target.value.toUpperCase())}
          placeholder="Enter discount code"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
        />
        <button
          type="submit"
          className="accp-apply-btn"
          disabled={busy || !code.trim()}
        >
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </form>
      {couponList}
    </div>
  );
}

export default ApplyCampaignCodePanel;
