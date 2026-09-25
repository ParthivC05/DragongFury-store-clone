import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import {
  EVENT_INSTALLABLE,
  EVENT_INSTALLED,
  getDeferredInstallPrompt,
  openNativeInstall
} from '../../lib/pwaInstallPrompt';
import { detectAndroid, detectIOS, detectStandalone } from '../../utils/mobileGameImmersive';
import './install.css';
import './df-install.css';

const SIM_OPTIONS = [
  { id: 'android', label: 'Android · Chrome' },
  { id: 'ios-safari', label: 'iPhone · Safari' },
  { id: 'ios-chrome', label: 'iPhone · Chrome' },
  { id: 'inapp', label: 'Facebook / Telegram' },
  { id: 'installed', label: 'Already added' },
];

const IOS_STEP_COPY = [
  { title: 'Tap the share button', say: '', next: 'I tapped it →' },
  {
    title: 'Now tap "Add to Home Screen"',
    say: 'Slide the list up a little if you cannot see it.',
    next: 'I tapped it →',
  },
  {
    title: 'Last one — tap "Add"',
    say: 'It is the blue button in the corner.',
    next: "That's it, finish",
  },
];

const ANDROID_STEP_COPY = [
  {
    title: 'Tap the ⋮ menu',
    say: 'It is at the top-right of Chrome.',
    next: 'I tapped it →',
  },
  {
    title: 'Tap “Install app”',
    say: 'It may also say “Add to Home screen”.',
    next: 'I tapped it →',
  },
  {
    title: 'Tap “Install”',
    say: 'Confirm in the popup — then you are done.',
    next: "That's it, finish",
  },
];

const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconShare = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 16V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

const IconOpen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 3h7v7" />
    <path d="M10 14 21 3" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
);

function detectEnv() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const iOS = detectIOS();
  return {
    iOS,
    android: detectAndroid(),
    inApp: /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|TikTok|MicroMessenger|Telegram/i.test(ua),
    iosChrome: iOS && /CriOS/.test(ua),
    standalone: detectStandalone(),
  };
}

function resolveAutoState() {
  const e = detectEnv();
  if (e.standalone) return 'installed';
  if (e.inApp) return 'inapp';
  if (e.iOS) return 'ios';
  if (getDeferredInstallPrompt()) return 'android';
  if (e.android) return 'android';
  return 'manual';
}

function defaultSimId() {
  const e = detectEnv();
  if (e.standalone) return 'installed';
  if (e.inApp) return 'inapp';
  if (e.iOS) return e.iosChrome ? 'ios-chrome' : 'ios-safari';
  if (e.android) return 'android';
  // Desktop: show the iPhone Safari guide by default (matches design preview)
  return 'ios-safari';
}

function brandLines(name) {
  const parts = String(name || 'Dragon Fury').trim().split(/\s+/);
  if (parts.length >= 2) return [parts[0].toUpperCase(), parts.slice(1).join(' ').toUpperCase()];
  return [parts[0].toUpperCase(), ''];
}

function brandInitials(name) {
  const parts = String(name || 'Dragon Fury').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function inAppSubText() {
  const e = detectEnv();
  return `First open this page in ${e.iOS ? 'Safari' : 'Chrome'}. Then you can add it.`;
}

function AppIconMark({ lines, className = 'inst-appicon' }) {
  return (
    <div className={className} aria-hidden>
      {lines[0]}
      {lines[1] ? (
        <>
          <br />
          {lines[1]}
        </>
      ) : null}
    </div>
  );
}

function PhoneDemo({ step, isChrome, host, brandShort, platform = 'ios' }) {
  if (platform === 'android') {
    if (step === 0) {
      return (
        <div className="inst-phone">
          <div className="inst-pscreen" />
          <div className="inst-pbody">{brandShort}</div>
          <div className="inst-pbar inst-pbar-top">
            <div className="inst-pdot" />
            <div className="inst-purl">{host}</div>
            <div className="inst-pshare inst-pshare-glow inst-pmenu">
              <IconMenu />
            </div>
          </div>
          <div className="inst-finger inst-s1-chrome" />
        </div>
      );
    }
    if (step === 1) {
      return (
        <div className="inst-phone">
          <div className="inst-pscreen" />
          <div className="inst-sheetup">
            <div className="inst-srow">
              <span className="inst-sq" />
              New tab
            </div>
            <div className="inst-srow">
              <span className="inst-sq" />
              History
            </div>
            <div className="inst-srow inst-srow-pick">
              <span className="inst-sq" />
              Install app
            </div>
            <div className="inst-srow">
              <span className="inst-sq" />
              Settings
            </div>
          </div>
          <div className="inst-finger inst-s2-finger" />
        </div>
      );
    }
    return (
      <div className="inst-phone">
        <div className="inst-pscreen" />
        <div className="inst-homegrid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} />
          ))}
        </div>
        <div className="inst-dialog">
          <div className="inst-dhead">
            <span className="inst-x" />
            <span className="inst-t">Install app</span>
            <span className="inst-add">Install</span>
          </div>
          <div className="inst-dbody">
            <span className="inst-mini">{brandInitials(site.platformName)}</span>
            <span className="inst-nm">{site.platformName}</span>
          </div>
        </div>
        <div className="inst-finger inst-s3-finger" />
      </div>
    );
  }

  if (step === 0) {
    return (
      <div className="inst-phone">
        <div className="inst-pscreen" />
        <div className="inst-pbody">{brandShort}</div>
        {isChrome ? (
          <div className="inst-pbar inst-pbar-top">
            <div className="inst-pdot" />
            <div className="inst-purl">{host}</div>
            <div className="inst-pshare inst-pshare-glow">
              <IconShare />
            </div>
          </div>
        ) : (
          <div className="inst-pbar inst-pbar-bottom">
            <div className="inst-pdot" />
            <div className="inst-pdot" />
            <div className="inst-pshare inst-pshare-glow">
              <IconShare />
            </div>
            <div className="inst-pdot" />
            <div className="inst-pdot" />
          </div>
        )}
        <div className={`inst-finger ${isChrome ? 'inst-s1-chrome' : 'inst-s1-safari'}`} />
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="inst-phone">
        <div className="inst-pscreen" />
        <div className="inst-sheetup">
          <div className="inst-srow">
            <span className="inst-sq" />
            Copy
          </div>
          <div className="inst-srow">
            <span className="inst-sq" />
            Add to bookmarks
          </div>
          <div className="inst-srow inst-srow-pick">
            <span className="inst-sq" />
            Add to Home Screen
          </div>
          <div className="inst-srow">
            <span className="inst-sq" />
            Print
          </div>
        </div>
        <div className="inst-finger inst-s2-finger" />
      </div>
    );
  }

  return (
    <div className="inst-phone">
      <div className="inst-pscreen" />
      <div className="inst-homegrid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} />
        ))}
      </div>
      <div className="inst-dialog">
        <div className="inst-dhead">
          <span className="inst-x" />
          <span className="inst-t">Add to Home Screen</span>
          <span className="inst-add">Add</span>
        </div>
        <div className="inst-dbody">
          <span className="inst-mini">{brandInitials(site.platformName)}</span>
          <span className="inst-nm">{site.platformName}</span>
        </div>
      </div>
      <div className="inst-finger inst-s3-finger" />
    </div>
  );
}

export function Install() {
  usePageContentReady(true);

  const host = typeof window !== 'undefined' ? window.location.host : 'dragonfury.com';
  const lines = useMemo(() => brandLines(site.platformName), []);
  const brandShort = lines.filter(Boolean).join(' ');

  const [boot] = useState(() => {
    const simId = defaultSimId();
    const view =
      simId === 'ios-safari' || simId === 'ios-chrome'
        ? 'ios'
        : simId === 'android'
          ? 'android'
          : simId === 'inapp'
            ? 'inapp'
            : simId === 'installed'
              ? 'installed'
              : resolveAutoState();
    return {
      simId,
      view,
      isChrome: simId === 'ios-chrome',
      sub: simId === 'inapp' ? inAppSubText() : 'Then just tap the icon to play. No app store. No downloading.',
      showHero: simId !== 'installed',
    };
  });

  const [viewState, setViewState] = useState(boot.view);
  const [sim, setSim] = useState(boot.simId);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachPlatform, setCoachPlatform] = useState('ios');
  const [step, setStep] = useState(0);
  const [isChrome, setIsChrome] = useState(boot.isChrome);
  const [subText, setSubText] = useState(boot.sub);
  const [showHero, setShowHero] = useState(boot.showHero);

  const refreshState = useCallback(() => {
    const e = detectEnv();
    if (!e.iOS && !e.android && !e.inApp && !e.standalone) return;
    const next = resolveAutoState();
    setViewState(next);
    if (next === 'installed') {
      setShowHero(false);
      setSubText('');
    } else if (next === 'inapp') {
      setShowHero(true);
      setSubText(inAppSubText());
    }
  }, []);

  useEffect(() => {
    const onInstallable = () => refreshState();
    const onInstalled = () => {
      setViewState('installed');
      setShowHero(false);
      setSubText('');
      setCoachOpen(false);
    };
    document.addEventListener(EVENT_INSTALLABLE, onInstallable);
    document.addEventListener(EVENT_INSTALLED, onInstalled);
    return () => {
      document.removeEventListener(EVENT_INSTALLABLE, onInstallable);
      document.removeEventListener(EVENT_INSTALLED, onInstalled);
    };
  }, [refreshState]);

  useEffect(() => {
    if (viewState === 'installed') {
      setShowHero(false);
    }
  }, [viewState]);

  const closeCoach = () => setCoachOpen(false);

  const applySim = (id) => {
    setSim(id);
    setCoachOpen(false);

    if (id === 'android') {
      setShowHero(true);
      setSubText('Then just tap the icon to play. No app store. No downloading.');
      setViewState('android');
    } else if (id === 'ios-safari' || id === 'ios-chrome') {
      setShowHero(true);
      setSubText('Then just tap the icon to play. No app store. No downloading.');
      setViewState('ios');
    } else if (id === 'inapp') {
      setShowHero(true);
      setSubText(inAppSubText());
      setViewState('inapp');
    } else {
      setViewState('installed');
      setShowHero(false);
      setSubText('');
    }
  };

  const handleNativeInstall = async () => {
    await openNativeInstall();
  };

  const handleOpenInBrowser = () => {
    const e = detectEnv();
    if (e.android) {
      window.location.href = `intent://${host}/#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    window.location.href = `${window.location.protocol}//${host}/`;
  };

  const stepCopy = coachPlatform === 'android' ? ANDROID_STEP_COPY : IOS_STEP_COPY;
  const stepMeta = stepCopy[step];
  const stepSay =
    coachPlatform === 'ios' && step === 0
      ? isChrome
        ? 'It is at the top, next to the web address.'
        : 'It is at the bottom of your screen.'
      : stepMeta.say;

  return (
    <div className="inst-page">
      <div className="inst-wrap">
        <div className="inst-pv">
          <b>Choose your device</b> to preview the install steps. On a phone we detect automatically.
        </div>
        <div className="inst-sim" role="group" aria-label="Choose device">
          {SIM_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-sim={opt.id}
              aria-pressed={sim === opt.id}
              onClick={() => applySim(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="inst-card">
          {showHero ? (
            <>
              <div className="inst-hero">
                <AppIconMark lines={lines} />
              </div>
              <h1 className="inst-title">
                Put {site.platformName} on your <span className="inst-hl">home screen</span>
              </h1>
              {subText ? <p className="inst-sub">{subText}</p> : null}
            </>
          ) : null}

          <div className="inst-slot">
            {viewState === 'installed' ? (
              <div className="inst-done">
                <div className="inst-land">
                  <div className="inst-grid">
                    <div className="inst-grid-slot" aria-hidden />
                    <div className="inst-grid-slot inst-grid-slot-app">
                      <div className="inst-burst" />
                      <div className="inst-flyicon inst-flyicon-logo" aria-hidden>
                        <img src={site.logoUrl} alt="" />
                      </div>
                    </div>
                    <div className="inst-grid-slot" aria-hidden />
                    <div className="inst-grid-slot" aria-hidden />
                  </div>
                </div>
                <h2>All done!</h2>
                <p>
                  Look for the {site.platformName} icon on your phone. Tap it any time to play.
                </p>
              </div>
            ) : null}

            {viewState === 'inapp' ? (
              <>
                <button type="button" className="inst-cta" onClick={handleOpenInBrowser}>
                  <IconOpen />
                  Open in {detectEnv().iOS ? 'Safari' : 'Chrome'}
                </button>
                <p className="inst-hint">
                  If nothing happens, tap <b>•••</b> at the top and choose “Open in browser”.
                </p>
              </>
            ) : null}

            {viewState === 'ios' ? (
              <>
                <button type="button" className="inst-cta" onClick={handleNativeInstall}>
                  <IconPlus />
                  Add to home screen
                </button>
                <p className="inst-hint">
                  In the share sheet, tap <b>Add to Home Screen</b>, then open the icon.
                </p>
              </>
            ) : null}

            {viewState === 'android' ? (
              <>
                <button type="button" className="inst-cta" onClick={handleNativeInstall}>
                  <IconPlus />
                  Add to home screen
                </button>
                <p className="inst-hint">
                  Use Chrome’s <b>Install app</b> / <b>Add to Home screen</b>.
                </p>
              </>
            ) : null}

            {viewState === 'manual' ? (
              <>
                <button
                  type="button"
                  className="inst-cta inst-cta-ghost"
                  onClick={() => {
                    window.alert(
                      'Tap the ⋮ menu at the top of your browser, then tap "Install app" or "Add to Home screen".'
                    );
                  }}
                >
                  Show me how
                </button>
                <p className="inst-hint">
                  Open the menu <b>⋮</b> then tap “Add to Home screen”.
                </p>
              </>
            ) : null}
          </div>

          {viewState !== 'installed' ? (
            <div className="inst-perks">
              <div className="inst-perk">
                <i>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#F5B921" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
                  </svg>
                </i>
                <span>Opens straight away</span>
              </div>
              <div className="inst-perk">
                <i>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#2DD4E6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m21 21-4.3-4.3" />
                    <circle cx="11" cy="11" r="7" />
                  </svg>
                </i>
                <span>Never hunt for the link</span>
              </div>
              <div className="inst-perk">
                <i>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22C58B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 8h1a3 3 0 0 1 0 6h-1" />
                    <path d="M2 8h16v5a6 6 0 0 1-12 0V8z" />
                    <path d="M6 1v3M10 1v3M14 1v3" />
                  </svg>
                </i>
                <span>Bonus alerts</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                className={`inst-coach${coachOpen ? ' is-open' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-hidden={!coachOpen}
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeCoach();
                }}
              >
                <div className="inst-sheet">
                  <div className="inst-dots" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <i key={i} className={i <= step ? 'is-on' : ''} />
                    ))}
                  </div>
                  <p className="inst-stepnum">Step {step + 1} of 3</p>
                  <h2>{stepMeta.title}</h2>
                  <p className="inst-say">{stepSay}</p>
                  <PhoneDemo
                    step={step}
                    isChrome={isChrome}
                    host={host}
                    brandShort={brandShort}
                    platform={coachPlatform}
                  />
                  <button
                    type="button"
                    className="inst-cta inst-next"
                    onClick={() => {
                      if (step < 2) {
                        setStep((s) => s + 1);
                      } else {
                        closeCoach();
                        setViewState('installed');
                        setShowHero(false);
                      }
                    }}
                  >
                    {stepMeta.next}
                  </button>
                  <button
                    type="button"
                    className="inst-back"
                    style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    Go back
                  </button>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
