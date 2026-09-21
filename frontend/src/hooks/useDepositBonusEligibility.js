import { useState, useEffect } from 'react';

function formatCountdown(ms) {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function useDepositBonusCountdown(expiresAt) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!expiresAt) {
      setLabel('');
      return undefined;
    }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLabel(ms > 0 ? formatCountdown(ms) : '');
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return label;
}

export function depositTierLabel(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export function formatBonusHighlight(eligibility) {
  if (!eligibility) return null;
  const type = eligibility.next_bonus_type;
  const value = eligibility.next_bonus_value;
  if (type === 'percentage' && value != null) return `${value}%`;
  if (type === 'fixed' && value != null) return `${value} SC`;
  return null;
}

export function formatTierBonus(tier) {
  if (!tier) return null;
  const type = tier.bonus_type ?? tier.bonusType;
  const value = tier.bonus_value ?? tier.bonusValue;
  if (type === 'percentage' && value != null) return `${value}%`;
  if (type === 'fixed' && value != null) return `${value} SC`;
  return null;
}
