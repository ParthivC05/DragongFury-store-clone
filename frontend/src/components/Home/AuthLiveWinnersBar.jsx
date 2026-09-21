import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildAuthLiveWinners, tickAuthLiveWinners } from '../../utils/authLiveWinners';

function formatScAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function WinnerCard({ winner }) {
  return (
    <div className="auth-winbar-card">
      <div className="auth-winbar-av" style={{ background: winner.bg }}>
        {winner.ic}
      </div>
      <div className="auth-winbar-copy">
        <b>{winner.name}</b>
        <span className="auth-winbar-won">
          won <em>{formatScAmount(winner.amount)} SC</em>
        </span>
        <span className="auth-winbar-plat">on {winner.platform} · just now</span>
      </div>
    </div>
  );
}

/**
 * Fixed bottom “Live Winners” marquee — inspo: dragonfuryplatformtocasino mock.
 */
export function AuthLiveWinnersBar() {
  const [winners, setWinners] = useState(() => buildAuthLiveWinners('today'));
  const [portalEl] = useState(() => (typeof document !== 'undefined' ? document.body : null));
  const [showBar, setShowBar] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  const marqueeWinners = useMemo(() => [...winners, ...winners], [winners]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setShowBar(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!showBar) return undefined;
    document.body.classList.add('auth-winbar-active');
    return () => document.body.classList.remove('auth-winbar-active');
  }, [showBar]);

  useEffect(() => {
    if (!showBar) return undefined;
    const id = window.setInterval(() => {
      setWinners((current) => tickAuthLiveWinners(current, 'today'));
    }, 4200);
    return () => window.clearInterval(id);
  }, [showBar]);

  if (!portalEl || !showBar) return null;

  return createPortal(
    <div className="auth-winbar" role="region" aria-label="Live winners">
      <div className="auth-winbar-label">
        🏆 <span>Live Winners</span>
      </div>
      <div className="auth-winbar-marquee" aria-hidden>
        <div className="auth-winbar-track">
          {marqueeWinners.map((winner, index) => (
            <WinnerCard key={`${winner.id}-${index}`} winner={winner} />
          ))}
        </div>
      </div>
    </div>,
    portalEl
  );
}
