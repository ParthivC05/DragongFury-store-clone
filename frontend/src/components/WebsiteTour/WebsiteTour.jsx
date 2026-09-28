import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CashAppIcon } from '../../assets/icons';
import './website-tour.css';

const STEPS = [
  {
    id: 'home',
    chapter: 'Getting around',
    title: 'Your balances',
    body: 'Paid SC, promotional Play Credit and available withdrawals stay separate.',
    path: '/',
    selector: '[data-tour="balances"]',
  },
  {
    id: 'catalog',
    chapter: 'Getting around',
    title: 'Find your game',
    body: 'Browse Platform / Web games. Search and filter to find a platform.',
    path: '/',
    parts: ['[data-tour="search"]', '[data-tour="filters"]'],
  },
  {
    id: 'account-create',
    chapter: 'Platform accounts',
    title: 'Create a game account',
    body: 'Each platform has its own login. This tour preview cannot create an account.',
    path: '/',
    preview: 'account',
  },
  {
    id: 'account-details',
    chapter: 'Platform accounts',
    title: 'Game account details',
    body: 'Your game login appears here after creation. Credential copying is disabled during the tour.',
    path: '/',
    preview: 'credentials',
  },
  {
    id: 'transfer',
    chapter: 'Platform accounts',
    title: 'Transfer to your game',
    body: 'Choose the funding source and review its accepted rules before a real load.',
    path: '/',
    preview: 'transfer',
  },
  {
    id: 'return',
    chapter: 'Platform accounts',
    title: 'Return the full game balance',
    body: 'A real return checks the game balance and accepted limits before crediting your wallet.',
    path: '/',
    preview: 'return',
  },
  {
    id: 'slots-live',
    chapter: 'Playing and funding',
    title: 'Slots and Live',
    body: 'Switch categories and providers here. Play Credit only applies to eligible Slots.',
    path: '/casino/slots',
    parts: ['[data-tour="search"]', '[data-tour="filters"]'],
  },
  {
    id: 'packages',
    chapter: 'Playing and funding',
    title: 'Deposit packages',
    body: 'Review the current packages. Eligibility and any bonus choice are confirmed before payment.',
    path: '/store',
    selector: '.store-package-card',
  },
  {
    id: 'payment',
    chapter: 'Playing and funding',
    title: 'Payment methods',
    body: 'Review an available payment method before continuing. This preview opens no checkout.',
    path: '/store',
    preview: 'payment',
  },
  {
    id: 'bonuses',
    chapter: 'Playing and funding',
    title: 'Bonuses and rewards',
    body: 'Check each reward’s eligibility, expiry and accepted terms before claiming.',
    path: '/bonus',
    selector: '.df-bonus-panel',
  },
  {
    id: 'wallet',
    chapter: 'Managing the account',
    title: 'Understand your wallet',
    body: 'Total SC is different from funds available for withdrawal. Holds and Play Credit stay visible.',
    path: '/redeem',
    preview: 'wallet',
  },
  {
    id: 'withdrawal',
    chapter: 'Managing the account',
    title: 'Review a withdrawal',
    body: 'Choose a method and review your limits. Phone verification is required before a real submission.',
    path: '/redeem',
    preview: 'withdrawal',
  },
  {
    id: 'rules',
    chapter: 'Managing the account',
    title: 'Your accepted rules',
    body: 'Offers keep the rules you accepted. Standard play and withdrawal limits still apply.',
    path: '/bonus',
    preview: 'rules',
  },
  {
    id: 'profile',
    chapter: 'Managing the account',
    title: 'Your profile',
    body: 'Manage your details, voluntarily verify your phone, and return to Bonus Progress.',
    path: '/settings',
    selector: '[data-tour="profile"]',
  },
  {
    id: 'help',
    chapter: 'Managing the account',
    title: 'Help whenever you need it',
    body: 'Contact support or replay from Help and the question mark beside Profile.',
    path: '/help',
    selector: '.df-help-launcher',
    fixed: true,
  },
];

function isShown(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 24 && rect.height > 24 && style.visibility !== 'hidden' && style.display !== 'none';
}

function visibleTarget(selector) {
  const nodes = [...document.querySelectorAll(selector)].filter(isShown);
  if (!nodes.length) return null;
  nodes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return nodes[0];
}

function unionRect(nodes) {
  const rects = nodes.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { top, left, right, bottom, width: right - left, height: bottom - top };
}

function clusterTargets(nodes) {
  const items = nodes.filter(Boolean).map((el) => ({ el, rect: el.getBoundingClientRect() }));
  if (!items.length) return [];
  items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const kept = [items[0]];
  let bottom = items[0].rect.bottom;
  items.slice(1).forEach((item) => {
    if (item.rect.top <= bottom + 80) {
      kept.push(item);
      bottom = Math.max(bottom, item.rect.bottom);
    }
  });
  return kept.map((item) => item.el);
}

function scrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 8) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function nudgeScroll(el, delta) {
  if (!el || Math.abs(delta) < 4) return;
  const scroller = scrollParent(el);
  if (scroller === document.scrollingElement || scroller === document.documentElement) {
    window.scrollBy(0, delta);
  } else {
    scroller.scrollTop += delta;
  }
}

function scrollTargetIntoView(el) {
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const delta = rect.top - Math.max(120, (vh - Math.min(rect.height, vh * 0.55)) / 2);
  nudgeScroll(el, delta);
}

function waitForSelector(selector, timeout = 8000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = visibleTarget(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - started > timeout) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function settle(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function findStepNodes(step) {
  const required = step.parts || (step.selector ? [step.selector] : []);
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const found = required.map((selector) => visibleTarget(selector));
    if (found.every(Boolean)) {
      const extra = (step.extra || []).map((selector) => visibleTarget(selector)).filter(Boolean);
      return clusterTargets([...found, ...extra]);
    }
    await settle(50);
  }
  const fallback = required.map((selector) => visibleTarget(selector)).filter(Boolean);
  return clusterTargets(fallback);
}

function holeFromRect(rect) {
  const pad = 6;
  const top = Math.max(0, rect.top - pad);
  const left = Math.max(0, rect.left - pad);
  const right = Math.min(window.innerWidth, rect.right + pad);
  const bottom = Math.min(window.innerHeight, rect.bottom + pad, top + Math.min(560, window.innerHeight * 0.7));
  return {
    top,
    left,
    right: Math.max(left + 48, right),
    bottom: Math.max(top + 48, bottom),
  };
}

function rectsOverlap(a, b) {
  return a.left < b.right - 6 && a.right > b.left + 6 && a.top < b.bottom - 6 && a.bottom > b.top + 6;
}

function placeGuide(hole, guideHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw <= 720;
  const header = document.querySelector('.dash-nav');
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const bottomPad = vw <= 1023 ? 108 : 16;
  const gap = 14;
  const width = Math.min(348, vw - 24);
  const height = guideHeight || 240;
  const belowHeader = mobile
    ? Math.max(gap, headerBottom + 12)
    : Math.max(gap, headerBottom - 38);

  const clampLeft = (left) => Math.max(gap, Math.min(left, vw - width - gap));
  const box = (pos) => ({
    left: pos.left,
    right: pos.left + width,
    top: pos.top,
    bottom: pos.top + height,
  });
  const usable = (pos) => pos.top >= belowHeader - 2 && pos.top + height <= vh - bottomPad + 2;
  const clear = (pos) => !hole || !rectsOverlap(box(pos), hole);

  if (!hole) {
    return { left: (vw - width) / 2, top: Math.max(belowHeader, (vh - height) / 2), width };
  }

  const candidates = [];
  const holeMidY = (hole.top + hole.bottom) / 2;
  if (hole.bottom <= headerBottom + 16) {
    candidates.push({ left: (hole.left + hole.right) / 2 - width / 2, top: belowHeader });
  }
  candidates.push({ left: hole.right - width, top: hole.top - height - gap });
  candidates.push({ left: hole.left - width - gap, top: holeMidY - height / 2 });
  candidates.push({ left: hole.right + gap, top: Math.max(belowHeader, hole.top - 38) });
  candidates.push({ left: hole.left - width - gap, top: Math.max(belowHeader, hole.top - 38) });
  candidates.push({ left: Math.max(gap, hole.right - width), top: hole.bottom + gap });
  candidates.push({ left: hole.left, top: hole.bottom + gap });
  candidates.push({ left: hole.left, top: hole.top - height - gap });

  const ranked = candidates
    .map((raw) => ({ left: clampLeft(raw.left), top: raw.top, width }))
    .filter((pos) => usable(pos) && clear(pos))
    .sort((a, b) => {
      const da = Math.hypot(a.left + width / 2 - (hole.left + hole.right) / 2, a.top + height / 2 - holeMidY);
      const db = Math.hypot(b.left + width / 2 - (hole.left + hole.right) / 2, b.top + height / 2 - holeMidY);
      return da - db;
    });
  if (ranked[0]) return ranked[0];

  const parkedTop = Math.max(belowHeader, vh - bottomPad - height);
  return { left: gap, top: parkedTop, width, pin: 'bottom' };
}

function Field({ label, children }) {
  return (
    <label className="df-tour-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function GameShell({ children }) {
  return (
    <div className="df-tour-card" data-tour-preview>
      <p className="df-tour-demo">Demo — no real transaction</p>
      <div className="df-tour-game__head">
        <img src="/df-online/platforms/fire-kirin.webp" width="60" height="60" alt="" />
        <div>
          <h3>Fire Kirin</h3>
          <span>Demo platform account</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function TourPreview({ kind }) {
  if (kind === 'account') {
    return (
      <GameShell>
        <Field label="Game account">
          <input readOnly value="New demo account" />
        </Field>
        <button type="button" disabled>Create game account</button>
      </GameShell>
    );
  }
  if (kind === 'credentials') {
    return (
      <GameShell>
        <Field label="Username">
          <input readOnly value="demo_player" />
        </Field>
        <Field label="Password">
          <input readOnly value="TourOnly!26" />
        </Field>
        <button type="button" disabled>Copy login &amp; play</button>
      </GameShell>
    );
  }
  if (kind === 'transfer') {
    return (
      <GameShell>
        <Field label="Transfer amount (SC)">
          <input readOnly value="10" />
        </Field>
        <Field label="Funding source">
          <input readOnly value="Play Credit · 10 SC" />
        </Field>
        <p>Play Credit stays separate from Paid SC.</p>
        <button type="button" disabled>Transfer to game</button>
      </GameShell>
    );
  }
  if (kind === 'return') {
    return (
      <GameShell>
        <Field label="Full game return (SC)">
          <input readOnly value="16" />
        </Field>
        <dl className="df-tour-dl">
          <dt>Play Credit restored</dt>
          <dd>10 SC</dd>
          <dt>Profit to wallet</dt>
          <dd>6 SC</dd>
          <dt>Offer profit cap</dt>
          <dd>10 SC</dd>
        </dl>
        <button type="button" disabled>Return full balance</button>
      </GameShell>
    );
  }
  if (kind === 'payment') {
    return (
      <div className="df-tour-card df-tour-card--payment" data-tour-preview>
        <p className="df-tour-demo">Demo — no real transaction</p>
        <h3>Payment method preview</h3>
        <p className="df-tour-card__figure">20 SC</p>
        <p className="df-tour-card__line">10 base + 10 bonus</p>
        <p className="df-tour-card__line">Example package · $9.99</p>
        <div className="df-tour-pay">
          <span className="df-tour-pay__mark">
            <CashAppIcon />
          </span>
          <span className="df-tour-pay__name">Cash App</span>
          <span className="df-tour-pay__check" aria-hidden>✓</span>
        </div>
        <p>Available methods and bonus terms are confirmed at checkout.</p>
        <button type="button" className="df-tour-card__ghost" disabled>Continue to payment</button>
      </div>
    );
  }
  if (kind === 'wallet') {
    return (
      <div className="df-tour-card" data-tour-preview>
        <p className="df-tour-demo">Demo — no real transaction</p>
        <h3>Understand your wallet</h3>
        <dl className="df-tour-dl">
          <dt>Paid SC after return</dt>
          <dd>16 SC</dd>
          <dt>Noncashable Play Credit</dt>
          <dd>10 SC</dd>
          <dt>Withdrawal eligibility</dt>
          <dd>Checked separately</dd>
        </dl>
      </div>
    );
  }
  if (kind === 'withdrawal') {
    return (
      <div className="df-tour-card" data-tour-preview>
        <p className="df-tour-demo">Demo — no real transaction</p>
        <h3>Review a withdrawal</h3>
        <Field label="Withdrawal amount (SC)">
          <input readOnly value="16" />
        </Field>
        <Field label="Method">
          <input readOnly value="Eligible payout method" />
        </Field>
        <Field label="Destination">
          <input readOnly value="Linked account" />
        </Field>
        <p>Phone verification, eligible balance and current limits are checked before a real withdrawal.</p>
        <button type="button" disabled>Review withdrawal</button>
      </div>
    );
  }
  return (
    <div className="df-tour-card" data-tour-preview>
      <h3>Buy · Play · Return · Withdraw</h3>
      <p>100% first-purchase match · 7 days</p>
      <p>Noncashable Play Credit. Choose platform games or in-house Slots for your match, not both. Paid SC stays separate.</p>
      <dl className="df-tour-dl">
        <dt>Platform bonus</dt>
        <dd>Full return · profit cap</dd>
        <dt>Slots bonus</dt>
        <dd>Confirmed bonus-funded stakes · 5× original bonus</dd>
      </dl>
    </div>
  );
}

export function WebsiteTour() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [hostEl, setHostEl] = useState(null);
  const [hole, setHole] = useState(null);
  const [guideStyle, setGuideStyle] = useState({ left: 16, top: 16, width: 340 });
  const [located, setLocated] = useState(0);
  const [ready, setReady] = useState(false);
  const guideRef = useRef(null);
  const previewRef = useRef(null);
  const targetRef = useRef(null);
  const targetsRef = useRef([]);
  const stepRef = useRef(null);
  const fixedRef = useRef(false);
  const adjustRef = useRef(false);
  const restoreTimer = useRef(0);
  const runRef = useRef(0);

  const close = useCallback(() => {
    document.querySelector('[data-tour-presentation]')?.remove();
    document.body.classList.remove('website-tour-show-help');
    setOpen(false);
    setPreview(null);
    setHostEl(null);
    setHole(null);
    setReady(false);
    targetRef.current = null;
    targetsRef.current = [];
  }, []);

  const finish = useCallback(() => {
    close();
    if (window.location.pathname !== '/') navigate('/');
  }, [close, navigate]);

  useEffect(() => {
    const start = () => {
      setReady(false);
      setHole(null);
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener('website-tour:start', start);
    return () => window.removeEventListener('website-tour:start', start);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('website-tour-active', open);
    return () => document.body.classList.remove('website-tour-active');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return undefined;
    const run = ++runRef.current;
    let cancel = false;
    const step = STEPS[index];
    stepRef.current = step;
    setReady(false);
    setPreview(step.preview || null);
    setHole(null);
    fixedRef.current = Boolean(step.fixed);
    targetRef.current = null;
    targetsRef.current = [];
    document.body.classList.toggle('website-tour-show-help', Boolean(step.fixed));

    (async () => {
      if (step.path && window.location.pathname !== step.path) {
        navigate(step.path);
      }
      if (step.preview) {
        await waitForSelector('main');
        if (cancel || run !== runRef.current) return;
        document.querySelector('[data-tour-presentation]')?.remove();
        const host = document.createElement('div');
        host.dataset.tourPresentation = 'true';
        host.className = 'df-tour-preview-host';
        const main = document.querySelector('main');
        const anchor = main?.querySelector(
          '.df-lobby-filter-bar, .df-games-tabs, .df-lobby-platforms, .dash-page, .df-bonus-page, .df-store-page'
        );
        if (anchor) anchor.before(host);
        else main?.prepend(host);
        targetRef.current = host;
        targetsRef.current = [host];
        setHostEl(host);
        await settle(80);
        scrollTargetIntoView(host);
        await settle(120);
        if (!cancel && run === runRef.current) {
          setLocated((n) => n + 1);
          setReady(true);
        }
        return;
      }
      document.querySelector('[data-tour-presentation]')?.remove();
      setHostEl(null);
      let nodes = await findStepNodes(step);
      if (cancel || run !== runRef.current) return;
      if (nodes.length && !step.fixed) {
        scrollTargetIntoView(nodes[0]);
        await settle(160);
      }
      if (!cancel && run === runRef.current) {
        targetRef.current = nodes[0] || null;
        targetsRef.current = nodes;
        setLocated((n) => n + 1);
        setReady(true);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [open, index, navigate]);

  const measure = useCallback(() => {
    const guide = guideRef.current;
    const step = stepRef.current;
    if (step && !step.preview && !step.fixed) {
      const required = step.parts || (step.selector ? [step.selector] : []);
      const found = required.map((selector) => visibleTarget(selector));
      if (found.every(Boolean)) targetsRef.current = clusterTargets(found);
    }
    const nodes = (previewRef.current ? [previewRef.current] : targetsRef.current).filter((node) => node?.isConnected);
    const rect = nodes.length ? unionRect(nodes) : null;
    const nextHole = rect ? holeFromRect(rect) : null;
    const height = guide?.offsetHeight || 240;
    const placed = placeGuide(nextHole, height);
    setHole(nextHole);
    setGuideStyle({ left: placed.left, top: placed.top, width: placed.width });
  }, []);

  const restoreTarget = useCallback(() => {
    if (fixedRef.current || adjustRef.current) return;
    const nodes = targetsRef.current.filter((node) => node?.isConnected);
    if (!nodes.length) return;
    const rect = unionRect(nodes);
    const headerBottom = document.querySelector('.dash-nav')?.getBoundingClientRect().bottom || 0;
    const bottomPad = window.innerWidth <= 1023 ? 108 : 16;
    const top = headerBottom + 12;
    const bottom = window.innerHeight - bottomPad - 12;
    const delta = rect.height > bottom - top || rect.top < top
      ? rect.top - top
      : rect.bottom > bottom
        ? rect.bottom - bottom
        : 0;
    if (Math.abs(delta) < 8) return;
    adjustRef.current = true;
    const scroller = scrollParent(nodes[0]);
    const before = scroller.scrollTop;
    nudgeScroll(nodes[0], delta);
    if (Math.abs(scroller.scrollTop - before) < 2) window.scrollBy(0, delta);
    window.setTimeout(() => {
      adjustRef.current = false;
      measure();
    }, 60);
  }, [measure]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    if (!ready) {
      setHole(null);
      return undefined;
    }
    measure();
    restoreTarget();
    const onMove = () => {
      if (adjustRef.current) return;
      measure();
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = window.setTimeout(restoreTarget, 80);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.clearTimeout(restoreTimer.current);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, index, preview, located, ready, measure, restoreTarget]);

  if (!open) return null;

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return createPortal(
    <div className="df-website-tour">
      <div className="df-website-tour__blocker" />
      <div className="tour-frost" aria-hidden="true">
        {ready && hole ? (
          <>
            <div className="tour-frost-pane" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
            <div className="tour-frost-pane" style={{ top: hole.bottom, left: 0, right: 0, bottom: 0 }} />
            <div className="tour-frost-pane" style={{ top: hole.top, left: 0, width: hole.left, height: Math.max(0, hole.bottom - hole.top) }} />
            <div className="tour-frost-pane" style={{ top: hole.top, left: hole.right, right: 0, height: Math.max(0, hole.bottom - hole.top) }} />
            <div
              className="tour-spotlight-edge"
              style={{
                top: hole.top,
                left: hole.left,
                width: Math.max(0, hole.right - hole.left),
                height: Math.max(0, hole.bottom - hole.top),
              }}
            />
          </>
        ) : (
          <div className="tour-frost-pane" style={{ inset: 0 }} />
        )}
      </div>
      {hostEl && preview ? createPortal(<TourPreview kind={preview} />, hostEl) : null}
      <section
        ref={guideRef}
        className="mascot-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-copy"
        style={{ left: guideStyle.left, top: guideStyle.top, width: guideStyle.width }}
      >
        <img src="/df-online/tour-mascot.webp" width="80" height="80" alt="" className="mascot-guide__mascot" />
        <div className="mascot-guide__panel">
          <div className="mascot-guide__text">
            <h2 id="guide-title">{ready ? step.title : `Opening ${step.title}…`}</h2>
            <p id="guide-copy">
              {ready
                ? step.body
                : 'Waiting for this page to finish loading. Your tour will stay on this step.'}
            </p>
          </div>
          <p className="mascot-guide__progress">
            {step.chapter} · {index + 1} of {STEPS.length}
          </p>
          <div className="mascot-guide__actions">
            <button
              type="button"
              disabled={!ready || index === 0}
              onClick={() => {
                setReady(false);
                setHole(null);
                setIndex((n) => Math.max(0, n - 1));
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="mascot-guide__primary"
              disabled={!ready}
              onClick={() => {
                if (last) {
                  finish();
                  return;
                }
                setReady(false);
                setHole(null);
                setIndex((n) => n + 1);
              }}
            >
              {last ? 'Done' : 'Next'}
            </button>
            <button type="button" onClick={close}>
              Not now
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
