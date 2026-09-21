import { useState, useEffect } from 'react';

function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
}

export function getCountdownParts(ms) {
  if (!(ms > 0)) return null;
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60
  };
}

function formatCountdown(ms) {
  const p = getCountdownParts(ms);
  if (!p) return '';
  const h = pad2(p.hours);
  const m = pad2(p.minutes);
  const s = pad2(p.seconds);
  if (p.days > 0) return `${p.days}d ${h}h ${m}m ${s}s`;
  if (p.hours > 0) return `${h}h ${m}m ${s}s`;
  if (p.minutes > 0) return `${p.minutes}m ${s}s`;
  return `${p.seconds}s`;
}

function useCountdownMs(endsAt) {
  const [ms, setMs] = useState(() => (endsAt ? new Date(endsAt).getTime() - Date.now() : 0));

  useEffect(() => {
    if (!endsAt) {
      setMs(0);
      return undefined;
    }
    const tick = () => setMs(new Date(endsAt).getTime() - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return ms;
}

/** Live countdown label for package/group limited-time offers. */
export function usePackageCountdown(endsAt) {
  const ms = useCountdownMs(endsAt);
  if (!endsAt) return '';
  return ms > 0 ? formatCountdown(ms) : '';
}

/** Digit boxes for flash-sale timers (days / hours / minutes / seconds). */
export function usePackageCountdownParts(endsAt) {
  const ms = useCountdownMs(endsAt);
  if (!endsAt) return null;
  return getCountdownParts(ms);
}
