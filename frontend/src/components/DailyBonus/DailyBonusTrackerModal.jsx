import { createPortal } from 'react-dom';
import { useEffect, useMemo } from 'react';
import {
  CheckIcon,
  GiftIcon,
  LockIcon,
  RefreshIcon,
  TrophyIcon,
} from '../../assets/icons';
import { formatSc } from '../../utils/currency';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import './DailyBonusTrackerModal.css';

const TOTAL_DAYS = 7;
const SC_ICON = '/spinwheel-sc-coin.svg';
const SPIN_ICON = '/spinwheel-free-spin.svg';

export function rewardSummary(day) {
  if (day.rewardType === 'sc_coins') return `${formatSc(day.amountSc)} SC`;
  if (day.rewardType === 'bonus_spin') {
    return day.spinCount > 1 ? `${day.spinCount} Free Spins` : '1 Free Spin';
  }
  if (day.rewardType === 'discount_voucher') return `${day.percentOff}% Off`;
  return day.label || `Day ${day.dayIndex}`;
}

export function stateLabel(state) {
  switch (state) {
    case 'claimable':
    case 'available':
      return 'Claim';
    case 'claimed':
      return 'Claimed';
    case 'waiting_tomorrow':
      return 'Tomorrow';
    default:
      return 'Locked';
  }
}

function isClaimableState(state) {
  return state === 'claimable' || state === 'available';
}

function isSpinReward(day) {
  return day?.rewardType === 'bonus_spin';
}

function mapDayStatus(day) {
  if (day.state === 'claimed') return 'done';
  if (isClaimableState(day.state)) return 'active';
  return 'locked';
}

function dayPrimaryLabel(day) {
  if (day.rewardType === 'bonus_spin') {
    const spins = Math.max(1, Number(day.spinCount) || 1);
    return spins > 1 ? `${spins} Spins` : '1 Spin';
  }
  if (day.rewardType === 'discount_voucher') return `${day.percentOff}% Off`;
  return `${formatSc(day.amountSc)} SC`;
}

function displayAmountParts(day) {
  if (!day) return { value: '—', suffix: '' };
  if (isSpinReward(day)) {
    const spins = Math.max(1, Number(day.spinCount) || 1);
    return { value: String(spins), suffix: spins > 1 ? 'Spins' : 'Spin' };
  }
  if (day.rewardType === 'discount_voucher') {
    return { value: `${day.percentOff}%`, suffix: 'Off' };
  }
  return { value: formatSc(day.amountSc), suffix: 'SC' };
}

function weekScTotal(days) {
  return days
    .filter((d) => d.rewardType === 'sc_coins')
    .reduce((sum, d) => sum + (Number(d.amountSc) || 0), 0);
}

function StarIcon({ size = 18, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2l2.9 6.9L22 10.2l-5 4.6 1.4 7.2L12 18.2 5.6 22l1.4-7.2-5-4.6 7.1-1.3L12 2z" />
    </svg>
  );
}

function DayIcon({ day, dayStatus, totalDays }) {
  const size = 14;
  if (dayStatus === 'done') return <CheckIcon width={size} height={size} aria-hidden />;
  if (dayStatus === 'locked') return <LockIcon width={size} height={size} aria-hidden />;
  if (isSpinReward(day)) return <RefreshIcon width={size} height={size} aria-hidden />;
  if (day.dayIndex === totalDays) return <TrophyIcon width={size} height={size} aria-hidden />;
  return (
    <img src={SC_ICON} alt="" width={18} height={18} className="db-day-ico-img" draggable={false} />
  );
}

function RewardVisual({ day }) {
  if (!day) return null;
  if (isSpinReward(day)) {
    return <img src={SPIN_ICON} alt="" className="db-reward-visual__img" draggable={false} />;
  }
  if (day.rewardType === 'discount_voucher') {
    return <span className="db-reward-visual__emoji" aria-hidden>🎟️</span>;
  }
  return <img src={SC_ICON} alt="" className="db-reward-visual__coin" draggable={false} />;
}

function DayCell({ day, totalDays }) {
  const dayStatus = mapDayStatus(day);
  return (
    <div className={`db-day${dayStatus === 'active' ? ' today' : ''}${dayStatus === 'done' ? ' done' : ''}`}>
      <div className="db-day-lbl">Day {day.dayIndex}</div>
      <div className="db-day-ico">
        <DayIcon day={day} dayStatus={dayStatus} totalDays={totalDays} />
      </div>
      <div className="db-day-val">{dayPrimaryLabel(day)}</div>
    </div>
  );
}

/**
 * Daily Bonus modal — Orionstars layout, partner teal/gold theme.
 */
export function DailyBonusTrackerModal({
  open,
  onClose,
  status,
  loading,
  claimingDay,
  onClaim,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const days = status?.days || [];
  const available = status?.available === true;
  const permanentlyDone = !!status?.permanently_done;
  const repeats = !!status?.repeat_after_complete;
  const claimedToday = !!status?.claimed_today;
  const totalDays = days.length || TOTAL_DAYS;

  const claimableDay = useMemo(
    () => days.find((d) => isClaimableState(d.state)) || null,
    [days]
  );
  const canClaim = !!claimableDay && !claimedToday && !permanentlyDone;
  const claiming = claimingDay != null;

  const claimedDay = useMemo(() => {
    const claimed = days.filter((d) => d.state === 'claimed');
    if (!claimed.length) return null;
    return claimed[claimed.length - 1];
  }, [days]);

  const waitingDay = useMemo(
    () => days.find((d) => d.state === 'waiting_tomorrow') || null,
    [days]
  );

  const displayDay = canClaim
    ? claimableDay
    : claimedDay || waitingDay || days[0] || null;

  const amountParts = displayAmountParts(displayDay);
  const weekTotal = weekScTotal(days);

  const leftTitle = canClaim
    ? 'Your reward is ready!'
    : permanentlyDone
      ? repeats
        ? 'New cycle tomorrow!'
        : 'All rewards claimed!'
      : claimedToday || claimedDay
        ? 'Great start!'
        : 'Come back tomorrow';

  const leftSubtitle = canClaim
    ? `Claim your Day ${claimableDay.dayIndex} reward today`
    : permanentlyDone
      ? repeats
        ? 'Come back tomorrow to start Day 1 again'
        : "You've claimed every daily bonus reward"
      : claimedDay
        ? `You've claimed your Day ${claimedDay.dayIndex} reward`
        : "You've already claimed today's reward";

  const weeklyTitle = canClaim ? 'Your weekly rewards' : 'Come back tomorrow';
  const weeklySub = canClaim
    ? 'Collect each day for bigger rewards'
    : 'Your next reward is even better!';

  if (!open) return null;

  return createPortal(
    <div
      className="db-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-bonus-title"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <div className="db-modal-topline" aria-hidden />

        <button type="button" className="db-close dragonfury-close-button" onClick={onClose} aria-label="Close" />

        <div className="db-header">
          <StarIcon size={18} className="db-header-star" />
          <h2 id="daily-bonus-title" className="db-header-title">
            Daily Bonus
          </h2>
        </div>

        {loading ? (
          <div className="db-loading">
            <RefreshIcon width={36} height={36} className="db-loading-spinner" />
          </div>
        ) : !available ? (
          <p className="db-empty">
            {permanentlyDone
              ? "You've completed all days of your daily bonus!"
              : 'Daily bonus is not available right now.'}
          </p>
        ) : (
          <div className="db-body">
            <div className="db-left">
              <div className="db-left-head">
                <div className="db-left-copy">
                  <div className="db-ready-title">{leftTitle}</div>
                  <div className="db-ready-sub">{leftSubtitle}</div>
                </div>

                {displayDay && (
                  <div className="db-reward-visual">
                    <RewardVisual day={displayDay} />
                  </div>
                )}

                {displayDay && (
                  <div className="db-gc-amount">
                    {amountParts.value} <span>{amountParts.suffix}</span>
                  </div>
                )}
              </div>

              {displayDay?.rewardType === 'sc_coins' && Number(displayDay.amountSc) > 0 && (
                <div className="db-gc-pill">
                  <div className="db-gc-dot" />
                  {formatSc(displayDay.amountSc)} SC
                </div>
              )}

              {canClaim ? (
                <button
                  type="button"
                  className="db-claim-btn ready"
                  disabled={claiming}
                  onClick={() => onClaim?.(claimableDay.dayIndex)}
                >
                  {claimingDay === claimableDay.dayIndex
                    ? 'Claiming…'
                    : `Claim Day ${claimableDay.dayIndex}`}
                </button>
              ) : (
                <button type="button" className="db-claim-btn done" disabled>
                  {permanentlyDone ? 'Complete!' : 'Claimed!'}
                </button>
              )}
            </div>

            <div className="db-right">
              <div className="db-weekly-title">{weeklyTitle}</div>
              <div className="db-weekly-sub">{weeklySub}</div>

              <div className="db-days">
                {days.slice(0, totalDays).map((day) => (
                  <DayCell key={day.dayIndex} day={day} totalDays={totalDays} />
                ))}
              </div>

              <div className="db-7banner">
                <div className="db-7ico">
                  <GiftIcon width={18} height={18} aria-hidden />
                </div>
                <div>
                  <div className="db-7title">{totalDays} Days = Bigger Rewards</div>
                  <div className="db-7desc">
                    Claim daily and earn up to{' '}
                    <strong>{formatSc(weekTotal)} SC</strong> in a week!
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Kept for any imports that still expect the day-card export. */
export function DailyBonusDayCard() {
  return null;
}
