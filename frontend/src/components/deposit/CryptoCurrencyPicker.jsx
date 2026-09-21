import { useId } from 'react';
import { cryptoCoinMeta, cryptoNetworkLabel, cryptoUsualWait } from '../../utils/depositRails';

function BtcMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#f7931a" />
      <path fill="#fff" d="M21.4 14.4c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.6-1.6-.4-.7 2.7c-.4-.1-.7-.2-1-.2v-.1l-2.3-.6-.4 1.8s1.2.3 1.2.3c.7.2.8.6.8.9l-.8 3.2c0 .1.1.1.1.1l-.1-.1-1.1 4.5c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.1.5c.4.1.8.2 1.1.3l-.7 2.8 1.6.4.7-2.7c.5.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.6-4.1 1.1-.3 2-1 2.2-2.5zm-4 5.6c-.5 2.1-3.1 1-4 1l.7-2.9c.9.2 3.8.7 3.3 1.9zm.5-5.6c-.5 1.9-2.6.9-3.4.7l.6-2.6c.8.2 3.3.6 2.8 1.9z" />
    </svg>
  );
}

function EthMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#627eea" />
      <path fill="#fff" fillOpacity="0.85" d="M16.1 5.5 9.8 16.1l6.3 3.7 6.3-3.7z" />
      <path fill="#fff" d="m16.1 21.4-6.3-3.6 6.3 8.7 6.4-8.7z" />
    </svg>
  );
}

function TrxMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#ef0027" />
      <path fill="#fff" d="M8.2 8.4 16.4 24.8l8.6-11.2-2.6-5.2zm9.2 2.2 3.8 0-5.6 7.2zm-2.2.1L9.8 10.7l5.2 10.4z" />
    </svg>
  );
}

function SolMark() {
  const uid = `pjSol${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#0d111c" />
      <path fill={`url(#${uid})`} d="M10.4 19.8c.2-.2.4-.3.7-.3h10.7c.4 0 .6.5.3.8l-2.1 2.1c-.2.2-.4.3-.7.3H8.6c-.4 0-.6-.5-.3-.8zm0-10.2c.2-.2.4-.3.7-.3h10.7c.4 0 .6.5.3.8l-2.1 2.1c-.2.2-.4.3-.7.3H8.6c-.4 0-.6-.5-.3-.8zm12.5 5.1c-.2-.2-.4-.3-.7-.3H11.5c-.4 0-.6.5-.3.8l2.1 2.1c.2.2.4.3.7.3h10.7c.4 0 .6-.5.3-.8z" />
      <defs>
        <linearGradient id={uid} x1="8" y1="8" x2="24" y2="24">
          <stop stopColor="#14f195" />
          <stop offset="1" stopColor="#9945ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function UsdtMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#26a17b" />
      <path fill="#fff" d="M17.4 16.8v.1c-2.8.1-5.4-.2-5.4-1.3 0-1.1 2.2-1.5 5-1.6v2.8h.4c2.6 0 4.5-.5 4.5-1.6 0-1-1.6-1.4-4.1-1.5V11h3.7V9H10.7v2h3.7v2.6c-2.8.2-5 1-5 2.6s2.4 2.4 5.4 2.6v5.2h2.6v-5.2c3.1-.2 5.5-1 5.5-2.6 0-1.5-2-2.3-5.5-2.5z" />
    </svg>
  );
}

function UsdcMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#2775ca" />
      <path fill="#fff" d="M16.8 8.2v2.1c2.9.3 5 1.6 5.2 3.6h-2.2c-.2-1-1.4-1.8-3-2v3.5c4 .9 5.3 2 5.3 4.2 0 2.5-2.1 4.1-5.3 4.5v2.1h-1.6v-2.1c-3.2-.3-5.3-1.8-5.5-4h2.3c.2 1.1 1.5 2 3.2 2.2v-3.7c-3.7-.8-5.2-2-5.2-4.1 0-2.4 2-3.9 5.2-4.3V8.2zm0 7.6v3.8c1.9-.2 3.1-1 3.1-2 0-.9-1-1.5-3.1-1.8zm-1.6-1.7v-3.6c-1.8.2-2.9.9-2.9 1.9 0 .9.9 1.5 2.9 1.7z" />
    </svg>
  );
}

function LnMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#f5a623" />
      <path fill="#1a1208" d="M18.2 6 9.5 17.6h5.2L13.6 26 22.6 14h-5.4z" />
    </svg>
  );
}

export function CoinMark({ code }) {
  const c = String(code || '').toUpperCase();
  if (c === 'LN' || c === 'LIGHTNING') return <LnMark />;
  if (c === 'BTC' || c === 'SATS') return <BtcMark />;
  if (c === 'ETH') return <EthMark />;
  if (c === 'TRX') return <TrxMark />;
  if (c === 'SOL') return <SolMark />;
  if (c === 'USDT') return <UsdtMark />;
  if (c === 'USDC') return <UsdcMark />;
  return (
    <span className="pj-ac-coin-fallback" aria-hidden>
      {c.slice(0, 1) || 'C'}
    </span>
  );
}

export function CryptoCurrencyPicker({
  currencies = [],
  selectedCurrency,
  onSelectCurrency,
  networks = [],
  selectedNetwork,
  onSelectNetwork,
  isDirect = false,
  methodsByCurrency = {}
}) {
  const cards = [];
  for (const tc of currencies) {
    const methods = (methodsByCurrency[tc] || []).map((m) => String(m || '').toLowerCase());
    const meta = cryptoCoinMeta(tc);
    if (isDirect && String(tc).toUpperCase() === 'BTC' && methods.includes('lightning')) {
      if (methods.includes('onchain')) {
        cards.push({
          id: 'BTC-onchain',
          code: 'BTC',
          network: 'onchain',
          title: 'BTC',
          subtitle: 'Bitcoin',
          hint: cryptoUsualWait({ currency: 'BTC', paymentMethod: 'onchain' }).short,
          eta: cryptoUsualWait({ currency: 'BTC', paymentMethod: 'onchain' }).long,
          accent: '#f7931a'
        });
      }
      cards.push({
        id: 'BTC-lightning',
        code: 'BTC',
        network: 'lightning',
        title: 'LN',
        subtitle: 'Lightning',
        hint: cryptoUsualWait({ currency: 'BTC', paymentMethod: 'lightning' }).short,
        eta: cryptoUsualWait({ currency: 'BTC', paymentMethod: 'lightning' }).long,
        accent: '#f5a623',
        mark: 'LN'
      });
      continue;
    }
    const wait = cryptoUsualWait({
      currency: tc,
      paymentMethod: methods.length === 1 ? methods[0] : null
    });
    cards.push({
      id: tc,
      code: tc,
      network: methods.length === 1 ? methods[0] : null,
      title: meta.code,
      subtitle: meta.name,
      hint: wait.short,
      eta: wait.long,
      accent: meta.accent
    });
  }

  const coinReady = Boolean(selectedCurrency);
  const showNetworkRow = !isDirect && selectedCurrency && networks.length > 1;
  const networkReady = !showNetworkRow || Boolean(selectedNetwork);
  const selectedCard = cards.find((card) =>
    card.network
      ? selectedCurrency === card.code && selectedNetwork === card.network
      : selectedCurrency === card.code
  );
  const selectedEta = showNetworkRow && selectedNetwork
    ? cryptoUsualWait({ currency: selectedCurrency, paymentMethod: selectedNetwork }).long
    : selectedCard?.eta;

  return (
    <section className="pj-ac-sec pj-ac-crypto" id="deposit-crypto-network">
      <div className="pj-ac-sec-top">
        <span className={`pj-ac-badge${coinReady && networkReady ? ' ok' : ''}`}>
          {coinReady && networkReady ? 'COIN ✓' : 'COIN'}
        </span>
        <h2>Target currency &amp; network</h2>
        <p className="pj-ac-lede">
          {isDirect
            ? 'Lightning is immediate. Other coins get a unique address for native BTC, ETH, TRX, or SOL.'
            : 'Pick the coin and network for this deposit, then tap Pay.'}
        </p>
      </div>

      <div className="pj-ac-coin-grid" role="list">
        {cards.map((card) => {
          const selected = card.network
            ? selectedCurrency === card.code && selectedNetwork === card.network
            : selectedCurrency === card.code;
          return (
            <button
              key={card.id}
              type="button"
              role="listitem"
              className={`pj-ac-coin${selected ? ' on' : ''}`}
              style={{ '--coin-accent': card.accent }}
              aria-pressed={selected}
              onClick={() => onSelectCurrency?.(card.code, card.network)}
            >
              <span className="pj-ac-coin-mark">
                <CoinMark code={card.mark || card.code} />
              </span>
              <span className="pj-ac-coin-copy">
                <span className="pj-ac-coin-code">{card.title}</span>
                <span className="pj-ac-coin-name">{card.subtitle}</span>
                {card.hint ? (
                  <span className={`pj-ac-coin-hint${String(card.hint).toLowerCase() === 'immediate' ? ' fast' : ''}`}>
                    {String(card.hint).toLowerCase() === 'immediate' ? 'Immediate' : `Usually ${card.hint}`}
                  </span>
                ) : null}
              </span>
              <span className="pj-ac-coin-tick" aria-hidden>✓</span>
            </button>
          );
        })}
      </div>

      {showNetworkRow ? (
        <div className="pj-ac-net-wrap">
          <p className="pj-ac-net-label">Choose network for {selectedCurrency}</p>
          <div className="pj-ac-net-grid">
            {networks.map((pm) => {
              const on = selectedNetwork === pm;
              const wait = cryptoUsualWait({ currency: selectedCurrency, paymentMethod: pm });
              return (
                <button
                  key={pm}
                  type="button"
                  className={`pj-ac-net${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onSelectNetwork?.(pm)}
                >
                  <span className="pj-ac-net-name">{cryptoNetworkLabel(pm) || pm}</span>
                  <span className={`pj-ac-net-hint${pm === 'lightning' ? ' fast' : ''}`}>
                    {pm === 'lightning' ? 'Immediate' : `Usually ${wait.short}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedEta ? (
        <p className="pj-ac-crypto-eta" aria-live="polite">
          {selectedEta}
        </p>
      ) : null}
    </section>
  );
}
