import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSpinWheelStatus } from '../../context/SpinWheelStatusContext';
import { DailyBonusClaimModal } from './DailyBonusClaimModal';
import { DailyBonusTrackerModal } from './DailyBonusTrackerModal';
import * as dailyBonusApi from '../../api/dailyBonus';

/** How long the claim-result celebration stays before auto-dismiss. */
const CLAIM_RESULT_AUTO_CLOSE_MS = 3_500;

/**
 * Hosts the Daily Bonus tracker + claim-result modals (promo auto-open and manual open).
 * After a successful claim the tracker closes immediately; the result popup auto-closes shortly after.
 */
export function DailyBonusModalHost({
  open,
  onClose,
  status,
  loading,
  claimingDay,
  setClaimingDay,
  refreshSilent,
}) {
  const { refreshBalance } = useAuth();
  const { toast } = useToast();
  const { refreshSpinStatus } = useSpinWheelStatus();
  const [claimResult, setClaimResult] = useState(null);

  // If the feature is off / not configured, never leave the empty modal on screen.
  useEffect(() => {
    if (!open || loading) return;
    if (!status || status.available !== true) {
      onClose?.();
    }
  }, [open, loading, status, onClose]);

  // Auto-dismiss the claim celebration so the user is not stuck on it.
  useEffect(() => {
    if (!claimResult) return undefined;
    const id = window.setTimeout(() => setClaimResult(null), CLAIM_RESULT_AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [claimResult]);

  async function handleClaim(dayIndex) {
    setClaimingDay(dayIndex);
    try {
      const res = await dailyBonusApi.claimDailyBonus(dayIndex);
      setClaimResult({
        dayIndex,
        reward: res?.reward || null,
        balanceSc: res?.balance_sc ?? null,
      });
      // Close the tracker popup right after a successful claim.
      onClose?.();
      await Promise.all([
        refreshBalance?.(),
        refreshSpinStatus?.(),
        refreshSilent?.(),
      ]);
    } catch (err) {
      toast.error(err.message || 'Claim failed.');
    } finally {
      setClaimingDay(null);
    }
  }

  return (
    <>
      <DailyBonusTrackerModal
        open={open}
        onClose={onClose}
        status={status}
        loading={loading}
        claimingDay={claimingDay}
        onClaim={handleClaim}
      />
      {claimResult && (
        <DailyBonusClaimModal
          reward={claimResult.reward}
          dayIndex={claimResult.dayIndex}
          balanceSc={claimResult.balanceSc}
          onClose={() => setClaimResult(null)}
        />
      )}
    </>
  );
}
