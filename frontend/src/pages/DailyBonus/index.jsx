import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import './DailyBonus.css';

/**
 * Sidebar route: open the Daily Bonus tracker modal, then return home.
 */
export function DailyBonus() {
  const navigate = useNavigate();
  usePageContentReady(true);

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('daily-bonus:open'));
    } catch (_) {
      /* ignore */
    }
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="daily-bonus-page">
      <p className="daily-bonus-empty">Opening Daily Bonus…</p>
    </div>
  );
}
