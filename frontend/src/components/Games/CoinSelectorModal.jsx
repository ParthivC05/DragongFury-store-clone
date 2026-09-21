import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GCCoinIcon, SCCoinIcon } from '../../assets/icons';
import { useAuth } from '../../context/AuthContext';
import { useCoinType } from '../../context/CoinContext';
import './coin-selector-modal.css';

function formatGc(value) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
}

function formatSc(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CoinSelectorModal({ game, onClose, onLaunch }) {
  const { balanceSc, balanceGc } = useAuth();
  const { coinType, setCoinType } = useCoinType();
  const [coin, setCoin] = useState(coinType === 'GC' ? 'gc' : 'sc');
  const name = game?.title || game?.name || 'this game';
  const thumb = game?.image || game?.iconUrls?.[0] || '';

  const gcBalance = Number(balanceGc) || 0;
  const scBalance = Number(balanceSc) || 0;
  const selectedHasBalance = coin === 'gc' ? gcBalance > 0 : scBalance > 0;

  useEffect(() => {
    setCoin(coinType === 'GC' ? 'gc' : 'sc');
  }, [coinType]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="pj-coin-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="pj-coin-modal"
        role="dialog"
        aria-labelledby="pj-coin-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pj-coin-modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="pj-coin-modal__glow" aria-hidden />

        <header className="pj-coin-modal__hdr">
          {thumb ? (
            <div className="pj-coin-modal__thumb">
              <img src={thumb} alt="" />
            </div>
          ) : (
            <div className="pj-coin-modal__thumb pj-coin-modal__thumb--empty" aria-hidden>
              🎰
            </div>
          )}
          <div>
            <p className="pj-coin-modal__kicker">Choose your play</p>
            <h2 id="pj-coin-title" className="pj-coin-modal__title">
              {name}
            </h2>
            <p className="pj-coin-modal__sub">
              {coin === 'gc' ? 'Gold Coins selected from your toggle' : 'Sweep Coins are selected by default'}
            </p>
          </div>
        </header>

        <div className="pj-coin-modal__options" role="radiogroup" aria-label="Select coin">
          <button
            type="button"
            role="radio"
            aria-checked={coin === 'sc'}
            className={`pj-coin-modal__opt pj-coin-modal__opt--sc${coin === 'sc' ? ' is-selected' : ''}`}
            onClick={() => {
              setCoin('sc');
              setCoinType('SC');
            }}
          >
            {coin === 'sc' ? <span className="pj-coin-modal__check">✓</span> : null}
            <span className="pj-coin-modal__opt-icon">
              <SCCoinIcon className="w-7 h-7" />
            </span>
            <div className="pj-coin-modal__opt-body">
              <p className="pj-coin-modal__opt-name">Sweep Coins</p>
              <p className="pj-coin-modal__opt-desc">Win real prizes — redeemable for cash</p>
            </div>
            <span className="pj-coin-modal__pill pj-coin-modal__pill--sc">
              {formatSc(scBalance)} SC
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={coin === 'gc'}
            className={`pj-coin-modal__opt pj-coin-modal__opt--gc${coin === 'gc' ? ' is-selected' : ''}`}
            onClick={() => {
              setCoin('gc');
              setCoinType('GC');
            }}
          >
            {coin === 'gc' ? <span className="pj-coin-modal__check">✓</span> : null}
            <span className="pj-coin-modal__opt-icon">
              <GCCoinIcon className="w-7 h-7" />
            </span>
            <div className="pj-coin-modal__opt-body">
              <p className="pj-coin-modal__opt-name">Gold Coins</p>
              <p className="pj-coin-modal__opt-desc">Play for fun — no cash value</p>
            </div>
            <span className="pj-coin-modal__pill pj-coin-modal__pill--gc">
              {formatGc(gcBalance)} GC
            </span>
          </button>
        </div>

        {!selectedHasBalance ? (
          <div className="pj-coin-modal__warn" role="alert">
            {coin === 'gc'
              ? 'Your Gold Coin balance is empty. Try Sweep Coins or grab a package that includes GC.'
              : 'Your Sweep Coin balance is empty. Try Gold Coins or deposit to get SC.'}
          </div>
        ) : null}

        <p className="pj-coin-modal__tip">
          <strong className="pj-coin-modal__tip-sc">Sweep Coins</strong> can be redeemed for cash.{' '}
          <strong className="pj-coin-modal__tip-gc">Gold Coins</strong> are entertainment only.
        </p>

        <button
          type="button"
          className={`pj-coin-modal__play pj-coin-modal__play--${coin}`}
          disabled={!selectedHasBalance}
          onClick={() => onLaunch(coin)}
        >
          {coin === 'gc' ? 'Play with Gold Coins' : 'Play with Sweep Coins'}
        </button>

        <button type="button" className="pj-coin-modal__cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}
