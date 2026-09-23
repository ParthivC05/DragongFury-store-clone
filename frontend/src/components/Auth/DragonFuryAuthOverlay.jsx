import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { site } from '../../config/site';

const AUTH_ART = {
  mascot: '/df-online/auth/shark-mascot.webp',
  logos: [
    '/df-online/auth/rise-of-the-dragon.webp',
    '/df-online/auth/thunder-dragon-descends.webp',
    '/df-online/auth/mermaid-come-back.webp',
    '/df-online/auth/bonus-bears.webp',
    '/df-online/auth/dragon.webp',
    '/df-online/auth/zeus-force.webp'
  ],
  coins: [
    '/df-online/auth/coin-3.webp',
    '/df-online/auth/coin-5.webp',
    '/df-online/auth/coin-6.webp'
  ]
};

export function DragonFuryAuthOverlay({ title, intro, mode = 'signup', children }) {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('df-auth-overlay-open');
    return () => document.body.classList.remove('df-auth-overlay-open');
  }, []);

  const close = () => navigate('/');

  return createPortal(
    <div className="pj-auth-root pj-auth-root--overlay dragonfury-auth-modal">
      <button type="button" className="df-auth-backdrop dragonfury-auth-backdrop" aria-label="Close" onClick={close} />
      <span className="dragonfury-auth-scene" aria-hidden="true">
        <img className="dragonfury-auth-mascot" src={AUTH_ART.mascot} alt="" width={945} height={900} decoding="async" />
        {AUTH_ART.logos.map((src, i) => (
          <img
            key={src}
            className={`dragonfury-auth-logo dragonfury-auth-logo--${i + 1}`}
            src={src}
            alt=""
            width={212}
            height={212}
            decoding="async"
          />
        ))}
        {AUTH_ART.coins.map((src, i) => (
          <img
            key={src}
            className={`dragonfury-auth-coin dragonfury-auth-coin--${i + 1}`}
            src={src}
            alt=""
            width={188}
            height={220}
            decoding="async"
          />
        ))}
      </span>
      <section
        className="dragonfury-auth-card"
        data-auth-mode={mode === 'signin' ? 'signin' : 'signup'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dragonfury-auth-title"
        aria-describedby={intro ? 'dragonfury-auth-description' : undefined}
      >
        <button type="button" className="dragonfury-auth-close dragonfury-close-button" onClick={close} aria-label="Close">
          <img src="/df-online/wallet-close.webp" alt="" width={44} height={44} decoding="async" />
        </button>
        <header className="dragonfury-auth-header">
          <img className="brand-logo" src={site.logoUrl} alt="" width={62} height={30} decoding="async" />
          <h2 id="dragonfury-auth-title">{title}</h2>
          {intro ? (
            <p id="dragonfury-auth-description" className="dragonfury-auth-intro">
              {intro}
            </p>
          ) : null}
        </header>
        {children}
      </section>
    </div>,
    document.body
  );
}
