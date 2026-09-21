/**
 * Mobile immersive game helpers — collapse the browser address bar and make the
 * slot game iframe fill the visible viewport on iOS and Android.
 *
 * Ported from the Orionstars game-play immersive system (iOS Safari + Chrome
 * swipe-up gate, portrait document scroll, landscape visualViewport pinning).
 */

const IFRAME_SELECTOR = '.spm-iframe';

function getGameIframe(wrapper) {
  return wrapper?.querySelector(IFRAME_SELECTOR) ?? null;
}

export function detectAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function detectAndroidChrome() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    detectAndroid() &&
    /Chrome/i.test(ua) &&
    !/Edg/i.test(ua) &&
    !/OPR|Opera/i.test(ua)
  );
}

export function detectIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPad =
    /iPad/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return /iPhone|iPod/.test(ua) || iPad;
}

/** Chrome on iPhone/iPad — top URL bar; landscape needs horizontal scroll to collapse. */
export function detectIOSChrome() {
  if (!detectIOS()) return false;
  const ua = navigator.userAgent;
  return /CriOS/i.test(ua) || (/Chrome\//i.test(ua) && !/Edg/i.test(ua) && !/OPR/i.test(ua));
}

export function detectStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.navigator.standalone === true) return true;
  return ['standalone', 'fullscreen', 'minimal-ui'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches
  );
}

export function detectImmersiveGameDevice() {
  if (typeof window === 'undefined') return false;

  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const phoneLandscape = window.matchMedia(
    '(max-height: 500px) and (orientation: landscape)'
  ).matches;
  const touchCoarse = window.matchMedia('(pointer: coarse)').matches;

  if (narrow) return true;
  if (detectIOS()) return true;
  if (detectAndroidChrome() && touchCoarse) return true;
  if (/Android/i.test(navigator.userAgent) && touchCoarse) return true;
  if (phoneLandscape && touchCoarse) return true;

  return false;
}

/** Phones, tablets, and other touch devices — including wide Android tablets. */
export function detectAnyMobileDevice() {
  if (typeof window === 'undefined') return false;
  if (detectImmersiveGameDevice()) return true;
  if (detectIOS() || detectAndroid()) return true;

  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod|Tablet|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  if (coarse && noHover) return true;
  if ((navigator.maxTouchPoints || 0) > 1 && noHover) return true;

  return false;
}

export function getSlotGameHeaderHeight() {
  if (typeof document === 'undefined') return 56;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--slot-header-h')
    .trim();
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 56;
}

export function isPortraitOrientation() {
  if (typeof window === 'undefined') return false;
  if (window.screen?.orientation?.type) {
    return window.screen.orientation.type.startsWith('portrait');
  }
  return window.matchMedia('(orientation: portrait)').matches;
}

export function isFullscreenActive() {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
  );
}

export async function requestElementFullscreen(element = document.documentElement) {
  if (!element) return false;

  const request =
    element.requestFullscreen?.bind(element) ||
    element.webkitRequestFullscreen?.bind(element) ||
    element.mozRequestFullScreen?.bind(element) ||
    element.msRequestFullscreen?.bind(element);

  if (!request) return false;

  try {
    await request({ navigationUI: 'hide' });
    return true;
  } catch {
    try {
      await request();
      return true;
    } catch {
      return false;
    }
  }
}

export async function exitElementFullscreen() {
  try {
    const fsEl =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;

    if (fsEl?.webkitExitFullscreen) {
      await fsEl.webkitExitFullscreen();
      return;
    }
    if (fsEl?.mozCancelFullScreen) {
      await fsEl.mozCancelFullScreen();
      return;
    }

    const exit =
      document.exitFullscreen?.bind(document) ||
      document.webkitExitFullscreen?.bind(document) ||
      document.webkitCancelFullScreen?.bind(document) ||
      document.mozCancelFullScreen?.bind(document) ||
      document.msExitFullscreen?.bind(document);
    if (exit && isFullscreenActive()) await exit();
  } catch {
    /* ignore */
  }
}

const GAME_WRAPPER_ID = 'slot-game-fullscreen-wrapper';

/** True when the game wrapper (or document) is the active fullscreen element. */
export function isGamePlayFullscreen() {
  if (!isFullscreenActive()) return false;
  const fsEl =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement;
  const wrapper = document.getElementById(GAME_WRAPPER_ID);
  if (!wrapper || !fsEl) return Boolean(fsEl);
  return (
    fsEl === wrapper ||
    fsEl === document.documentElement ||
    fsEl.contains(wrapper) ||
    wrapper.contains(fsEl)
  );
}

/** Android landscape — URL bar hidden via immersive layout (not always Fullscreen API). */
export function isAndroidGameChromeCollapsed() {
  if (!detectAndroid() || isPortraitOrientation()) return false;
  if (isGameUserExitedFullscreen()) return false;
  return isGamePlayFullscreen() || !isAndroidChromeBarVisible();
}

export function setGameUserExitedFullscreen(active) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('slot-game-user-exited-fullscreen', Boolean(active));
}

export function isGameUserExitedFullscreen() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('slot-game-user-exited-fullscreen');
}

/** Exit browser fullscreen and release Android immersive viewport pinning. */
export async function exitGameFullscreen(wrapper) {
  setGameUserExitedFullscreen(true);
  await exitElementFullscreen();

  const root = document.documentElement;
  const body = document.body;

  root.classList.remove('android-chrome-collapse');
  body.style.minHeight = '';
  body.style.height = '';
  body.style.overflowY = 'auto';
  body.style.overflowX = '';

  window.scrollTo(0, 0);
  root.scrollTop = 0;
  body.scrollTop = 0;

  if (wrapper) {
    applyGameModeLock(wrapper, { allowDocumentScroll: true });
    syncExitedGameFrame(wrapper);
  } else {
    setViewportCssVars();
  }
}

/** Keep game filling the visible viewport below the header (browser chrome visible). */
export function syncExitedGameFrame(wrapper) {
  setViewportCssVars();
  if (!wrapper) return;

  const iframe = getGameIframe(wrapper);
  const headerH = getSlotGameHeaderHeight();
  const vv = window.visualViewport;
  const vvTop = vv?.offsetTop ?? 0;
  const vvLeft = vv?.offsetLeft ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const iframeHeight = Math.max(0, height - headerH);

  wrapper.style.position = 'relative';
  wrapper.style.top = '';
  wrapper.style.left = '';
  wrapper.style.width = '100%';
  wrapper.style.maxWidth = '100%';
  wrapper.style.height = `${height}px`;
  wrapper.style.minHeight = `${height}px`;
  wrapper.style.maxHeight = `${height}px`;
  wrapper.style.overflow = 'visible';
  wrapper.style.transform = '';
  wrapper.style.zIndex = '';

  if (iframe) {
    iframe.style.position = 'fixed';
    iframe.style.top = `${vvTop + headerH}px`;
    iframe.style.left = `${vvLeft}px`;
    iframe.style.right = 'auto';
    iframe.style.bottom = 'auto';
    iframe.style.width = `${width}px`;
    iframe.style.maxWidth = `${width}px`;
    iframe.style.height = `${iframeHeight}px`;
    iframe.style.minHeight = `${iframeHeight}px`;
    iframe.style.maxHeight = `${iframeHeight}px`;
    iframe.style.marginTop = '0';
    iframe.style.border = 'none';
    iframe.style.zIndex = '50';
    iframe.style.display = 'block';
  }
}

/** Enter browser fullscreen / immersive chrome collapse. */
export async function enterGameFullscreen(wrapper) {
  setGameUserExitedFullscreen(false);

  const target =
    wrapper instanceof HTMLElement ? wrapper : document.documentElement;
  let entered = await requestElementFullscreen(target);
  if (!entered && target !== document.documentElement) {
    entered = await requestElementFullscreen(document.documentElement);
  }

  if (detectAndroid() && wrapper && !isPortraitOrientation()) {
    await collapseAndroidChromeAddressBar(wrapper, { tryFullscreen: false });
    return entered;
  }

  if (wrapper) {
    clearIOSGameIframe(wrapper);
    applyGameModeLock(wrapper);
    syncVisualViewportFrame(wrapper);
  }

  return entered;
}

/** Scroll nudges that encourage mobile browsers to collapse the URL bar. */
export function nudgeMobileBrowserChrome() {
  try {
    const root = document.documentElement;
    const landscape = window.innerWidth > window.innerHeight;

    if (landscape) {
      window.scrollTo({ top: 0, left: 1, behavior: 'auto' });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      root.scrollLeft = 1;
      root.scrollLeft = 0;
    }

    window.scrollTo({ top: 1, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    root.scrollTop = 1;
    root.scrollTop = 0;
    window.scrollTo({ top: 120, left: 0, behavior: 'auto' });
  } catch {
    /* ignore */
  }
}

export function runChromeCollapseNudges() {
  requestAnimationFrame(() => {
    nudgeMobileBrowserChrome();
    requestAnimationFrame(nudgeMobileBrowserChrome);
  });
  window.setTimeout(nudgeMobileBrowserChrome, 90);
  window.setTimeout(nudgeMobileBrowserChrome, 220);
}

export function isAndroidChromeBarVisible() {
  if (typeof window === 'undefined') return false;
  const vv = window.visualViewport;
  if (!vv) return false;
  return vv.height < window.innerHeight - 10 || vv.offsetTop > 2;
}

/** True when iOS browser chrome (top or bottom bar) is still expanded. */
export function isIOSBrowserBarExpanded() {
  if (typeof window === 'undefined') return false;
  const vv = window.visualViewport;
  if (!vv) return false;
  const heightGap = window.innerHeight - vv.height;
  const portrait = isPortraitOrientation();
  const expandedGap = portrait ? 20 : detectIOSChrome() ? 24 : 50;

  if (detectIOSChrome()) {
    if (portrait) {
      return vv.offsetTop > 0 || heightGap > 6;
    }
    return vv.offsetTop > 2 || heightGap > expandedGap;
  }
  if (portrait) {
    return heightGap > 6 || vv.offsetTop > 0;
  }
  return heightGap > expandedGap || vv.offsetTop > 2;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getIOSPortraitScrollPeak(scrollMax) {
  return Math.min(240, Math.max(96, scrollMax - 1));
}

function setIOSPortraitCollapseLayout(wrapper, active) {
  const root = document.documentElement;
  const body = document.body;

  if (!active) {
    root.classList.remove('ios-portrait-collapse');
    body.style.minHeight = '';
    body.style.height = '';
    if (wrapper) {
      wrapper.style.minHeight = '';
      wrapper.style.maxHeight = '';
      wrapper.style.height = '';
      wrapper.style.overflow = '';
      wrapper.style.position = '';
    }
    return;
  }

  root.classList.add('ios-portrait-collapse');
  body.style.height = 'auto';
  body.style.minHeight = '160vh';
  if (wrapper) {
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'visible';
    wrapper.style.height = 'auto';
    wrapper.style.minHeight = '155vh';
    wrapper.style.maxHeight = 'none';
  }
}

/**
 * iOS Safari — page must scroll to collapse the address bar (portrait + landscape).
 */
export async function collapseIOSAddressBar(wrapper) {
  const root = document.documentElement;
  const body = document.body;
  const iframe = getGameIframe(wrapper);
  const portrait = isPortraitOrientation();

  root.classList.add('ios-collapse-scroll');
  if (portrait) {
    root.classList.add('ios-collapse-scroll--portrait');
    setIOSPortraitCollapseLayout(wrapper, true);
  }
  if (iframe) {
    iframe.style.visibility = 'hidden';
    iframe.style.pointerEvents = 'none';
  }

  await wait(32);

  const nudge = () => {
    const scrollMax = Math.max(
      document.documentElement.scrollHeight,
      body.scrollHeight,
      window.innerHeight + (portrait ? 280 : 160)
    );
    const scrollPeak = portrait
      ? getIOSPortraitScrollPeak(scrollMax)
      : Math.min(160, scrollMax - 1);

    if (portrait) {
      const scroller = document.scrollingElement || root;
      for (const y of [1, 24, 64, scrollPeak, 12]) {
        window.scrollTo(0, y);
        scroller.scrollTop = y;
        root.scrollTop = y;
        body.scrollTop = y;
      }
    } else {
      window.scrollTo(0, 1);
      window.scrollTo(0, scrollPeak);
      window.scrollTo(0, 3);
      root.scrollTop = 3;
      body.scrollTop = 3;
    }
    setViewportCssVars();
  };

  nudge();
  await wait(16);
  requestAnimationFrame(nudge);
  await wait(60);
  nudge();
  await wait(120);
  nudge();
  await wait(200);
  nudge();

  await waitForIOSChromeCollapse(portrait ? 1200 : 700);

  root.classList.remove('ios-collapse-scroll', 'ios-collapse-scroll--portrait');
  if (portrait) setIOSPortraitCollapseLayout(wrapper, false);
  if (iframe) {
    iframe.style.visibility = '';
    iframe.style.pointerEvents = '';
  }
  settleIOSPortraitScroll();
  setViewportCssVars();
  syncIOSDvhFrame(wrapper);

  return !isIOSBrowserBarExpanded();
}

function setIOSChromeCollapseMode(wrapper, active) {
  const root = document.documentElement;
  const body = document.body;
  const landscape = !isPortraitOrientation();
  const iframe = getGameIframe(wrapper);

  if (active) {
    root.classList.add('ios-chrome-collapse');
    if (landscape) root.classList.add('ios-chrome-landscape');
    body.style.overflow = 'auto';
    body.style.minHeight = landscape ? '150vh' : '140vh';
    if (landscape) body.style.minWidth = '150vw';

    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.style.overflow = 'visible';
      wrapper.style.minHeight = landscape ? '130vh' : '140vh';
      if (landscape) wrapper.style.minWidth = '130vw';
    }

    if (iframe) {
      iframe.style.visibility = 'hidden';
      iframe.style.pointerEvents = 'none';
    }
    return;
  }

  root.classList.remove('ios-chrome-collapse', 'ios-chrome-landscape');
  body.style.minHeight = '';
  body.style.minWidth = '';
  if (wrapper) {
    wrapper.style.minHeight = '';
    wrapper.style.minWidth = '';
  }
  if (iframe) {
    iframe.style.visibility = '';
    iframe.style.pointerEvents = '';
  }
}

function waitForIOSChromeCollapse(maxMs = 700) {
  if (!isIOSBrowserBarExpanded()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const vv = window.visualViewport;
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      vv?.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
      resolve(ok);
    };

    const onResize = () => {
      setViewportCssVars();
      if (!isIOSBrowserBarExpanded()) finish(true);
    };

    vv?.addEventListener('resize', onResize);
    const timer = window.setTimeout(() => finish(!isIOSBrowserBarExpanded()), maxMs);
  });
}

export function settleIOSPortraitScroll() {
  if (!isPortraitOrientation()) return;
  window.scrollTo({ top: 1, left: 0, behavior: 'auto' });
  document.documentElement.scrollTop = 1;
  document.body.scrollTop = 1;
}

export function settleIOSChromeScroll() {
  const landscape = !isPortraitOrientation();
  if (landscape) {
    window.scrollTo({ top: 1, left: 1, behavior: 'auto' });
    document.documentElement.scrollLeft = 1;
    document.body.scrollLeft = 1;
  } else {
    settleIOSPortraitScroll();
    return;
  }
  document.documentElement.scrollTop = 1;
  document.body.scrollTop = 1;
}

/**
 * iOS Chrome — top toolbar; must scroll the document (iframe hidden briefly) to collapse.
 */
export async function collapseIOSChromeAddressBar(wrapper, { tryFullscreen = false } = {}) {
  const root = document.documentElement;
  const body = document.body;
  const landscape = !isPortraitOrientation();

  setIOSChromeCollapseMode(wrapper, true);
  if (!landscape) setIOSPortraitCollapseLayout(wrapper, true);

  const nudge = () => {
    const scrollMaxY = Math.max(
      document.documentElement.scrollHeight,
      body.scrollHeight,
      window.innerHeight + 200
    );
    const scrollMaxX = Math.max(
      document.documentElement.scrollWidth,
      body.scrollWidth,
      window.innerWidth + 200
    );

    if (landscape) {
      window.scrollTo({ top: 0, left: 1, behavior: 'auto' });
      window.scrollTo({ top: 0, left: Math.min(160, scrollMaxX - 1), behavior: 'auto' });
      window.scrollTo({ top: 0, left: 3, behavior: 'auto' });
      root.scrollLeft = 3;
      body.scrollLeft = 3;
    }

    const scrollPeakY = landscape
      ? Math.min(160, scrollMaxY - 1)
      : getIOSPortraitScrollPeak(scrollMaxY);

    window.scrollTo(0, 1);
    window.scrollTo(0, scrollPeakY);
    window.scrollTo(0, landscape ? 3 : 4);
    root.scrollTop = landscape ? 3 : 4;
    body.scrollTop = landscape ? 3 : 4;
    nudgeMobileBrowserChrome();
    setViewportCssVars();
  };

  nudge();
  await wait(32);
  requestAnimationFrame(nudge);
  await wait(80);
  nudge();
  await wait(150);
  nudge();

  const collapsed = await waitForIOSChromeCollapse(700);

  if (tryFullscreen && !isFullscreenActive()) {
    const target = wrapper || document.documentElement;
    try {
      await requestElementFullscreen(target);
    } catch {
      /* needs user gesture */
    }
    if (!isFullscreenActive()) {
      try {
        await requestElementFullscreen(document.documentElement);
      } catch {
        /* needs user gesture */
      }
    }
    await waitForIOSChromeCollapse(400);
  }

  setIOSChromeCollapseMode(wrapper, false);
  if (!landscape) setIOSPortraitCollapseLayout(wrapper, false);
  settleIOSChromeScroll();
  setViewportCssVars();
  syncIOSDvhFrame(wrapper);

  return collapsed || !isIOSBrowserBarExpanded() || isFullscreenActive();
}

function collapseIOSAddressBarForBrowser(wrapper, options) {
  if (detectIOSChrome()) {
    return collapseIOSChromeAddressBar(wrapper, options);
  }
  return collapseIOSAddressBar(wrapper);
}

/** Extra document height so the page can scroll while iOS browser chrome is still expanded. */
export function getIOSPortraitScrollSlack(vvHeight) {
  const vv = window.visualViewport;
  const innerH = window.innerHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  const chromeTopInset = detectIOSChrome() && isPortraitOrientation() ? offsetTop : 0;
  const gap = Math.max(0, innerH - vvHeight) + chromeTopInset;
  return Math.max(120, gap + 120);
}

/** Guarantee the portrait game page is taller than the layout viewport so scroll can collapse browser chrome. */
export function ensureIOSPortraitScrollRoom(wrapper) {
  if (!isPortraitOrientation()) return;

  setViewportCssVars();
  const vv = window.visualViewport;
  const innerH = window.innerHeight;
  const vvH = vv?.height ?? innerH;
  const slack = getIOSPortraitScrollSlack(vvH);

  document.documentElement.style.setProperty('--ios-portrait-scroll-slack', `${slack}px`);
  document.body.style.overflowY = 'auto';
  document.documentElement.style.overflowY = 'auto';
  document.body.style.minHeight = `${innerH + slack}px`;

  if (!wrapper) return;

  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'visible';
  wrapper.style.height = 'auto';
  wrapper.style.minHeight = `${Math.max(vvH, innerH) + slack}px`;
}

export function setIosSwipeGateActiveClass(active) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('ios-swipe-gate-active', Boolean(active));
}

/** Portrait overlay gate — native document scroll so iOS can collapse browser chrome. */
export function applyIOSPortraitOverlayScroll(wrapper) {
  if (!detectIOS() || !isPortraitOrientation()) return;

  setIosSwipeGateActiveClass(true);
  if (detectIOSChrome()) {
    applyIOSChromePortraitGameScroll(wrapper);
  } else {
    applyIOSPortraitGameScroll(wrapper);
  }
  ensureIOSPortraitScrollRoom(wrapper);
  setIOSPortraitBarExpandedClass(isIOSBrowserBarExpanded());
  if (detectIOSChrome()) setIOSChromeBarExpandedClass(isIOSBrowserBarExpanded());
}

/** Enable iOS portrait document scroll on the game route (works during loading and after iframe paints). */
export function applyIOSPortraitGameScroll(wrapper) {
  if (!detectIOS() || !isPortraitOrientation()) return;

  applyGameModeLock(wrapper, { allowDocumentScroll: true });
  setGameImmersiveClasses({
    active: true,
    ios: true,
    iosChrome: detectIOSChrome(),
    standalone: detectStandalone(),
    iosPortrait: true,
  });
  ensureIOSPortraitScrollRoom(wrapper);

  const iframe = getGameIframe(wrapper);
  if (iframe) {
    syncIOSPortraitFlowFrame(wrapper);
  }
}

/** Finish portrait collapse from overlay swipe (sync, runs on touchEnd while gesture is active). */
export function finishIOSPortraitUserSwipeCollapse(wrapper) {
  if (!detectIOS() || !isPortraitOrientation()) return false;

  const root = document.documentElement;
  const body = document.body;

  ensureIOSPortraitScrollRoom(wrapper);
  root.classList.add('ios-collapse-scroll', 'ios-collapse-scroll--portrait');
  setIOSPortraitCollapseLayout(wrapper, true);

  const scroller = document.scrollingElement || root;
  const scrollMax = Math.max(
    root.scrollHeight,
    body.scrollHeight,
    window.innerHeight + 280
  );
  const peak = getIOSPortraitScrollPeak(scrollMax);

  for (const y of [1, 24, 64, peak, peak, 12]) {
    window.scrollTo({ top: y, left: 0, behavior: 'auto' });
    scroller.scrollTop = y;
    root.scrollTop = y;
    body.scrollTop = y;
  }

  setViewportCssVars();
  root.classList.remove('ios-collapse-scroll', 'ios-collapse-scroll--portrait');
  setIOSPortraitCollapseLayout(wrapper, false);
  settleIOSPortraitScroll();

  return !isIOSBrowserBarExpanded();
}

export function setIOSPortraitBarExpandedClass(expanded) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('ios-portrait-bar-expanded', Boolean(expanded));
}

export function setIOSChromeBarExpandedClass(expanded) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('ios-chrome-bar-expanded', Boolean(expanded));
}

export function applyIOSChromePortraitGameScroll(wrapper) {
  if (!detectIOSChrome() || !isPortraitOrientation()) return;

  applyIOSPortraitGameScroll(wrapper);
  setIOSChromeBarExpandedClass(isIOSBrowserBarExpanded());
}

/** iOS Chrome landscape — native document scroll to collapse the top URL bar. */
export function applyIOSChromeLandscapeGameScroll(wrapper) {
  if (!detectIOSChrome() || isPortraitOrientation()) return;

  applyGameModeLock(wrapper, { allowDocumentScroll: true });
  setGameImmersiveClasses({
    active: true,
    ios: true,
    iosChrome: true,
    standalone: detectStandalone(),
    iosPortrait: false,
  });
  ensureIOSChromeScrollRoom(wrapper);
  setIOSChromeBarExpandedClass(isIOSBrowserBarExpanded());

  if (getGameIframe(wrapper)) {
    syncIOSChromeGameIframe(wrapper);
  }
}

export function ensureIOSChromeScrollRoom(wrapper) {
  if (!detectIOSChrome()) return;

  if (isPortraitOrientation()) {
    ensureIOSPortraitScrollRoom(wrapper);
    return;
  }

  setViewportCssVars();
  const vv = window.visualViewport;
  const innerH = window.innerHeight;
  const innerW = window.innerWidth;
  const vvH = vv?.height ?? innerH;
  const vvW = vv?.width ?? innerW;
  const offsetTop = vv?.offsetTop ?? 0;
  const slackY = Math.max(120, innerH - vvH + offsetTop + 120);
  const slackX = Math.max(120, innerW - vvW + 120);

  document.body.style.overflowX = 'auto';
  document.body.style.overflowY = 'auto';
  document.documentElement.style.overflowX = 'auto';
  document.documentElement.style.overflowY = 'auto';
  document.body.style.minHeight = `${innerH + slackY}px`;
  document.body.style.minWidth = `${innerW + slackX}px`;

  if (!wrapper) return;

  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'visible';
  wrapper.style.height = 'auto';
  wrapper.style.minHeight = `${Math.max(vvH, innerH) + slackY}px`;
  wrapper.style.minWidth = `${Math.max(vvW, innerW) + slackX}px`;
}

/** Repeated collapse attempts — landscape only; portrait collapses on user scroll. */
export function runIOSCollapseNudges(wrapper, options) {
  if (isPortraitOrientation()) return;

  const attempt = () => {
    collapseIOSAddressBarForBrowser(wrapper, options);
  };

  attempt();
  requestAnimationFrame(attempt);
  window.setTimeout(attempt, 80);
  window.setTimeout(attempt, 200);
  window.setTimeout(attempt, 450);
  window.setTimeout(attempt, 900);
}

/**
 * Android Chrome hides the URL bar only when the page can scroll.
 * Briefly unlock layout, nudge scroll, then re-pin to visualViewport.
 */
export async function collapseAndroidChromeAddressBar(wrapper, { tryFullscreen = true } = {}) {
  const root = document.documentElement;
  const body = document.body;
  const landscape = !isPortraitOrientation();

  releaseGameModeLock(wrapper);
  root.classList.add('android-chrome-collapse');
  body.style.overflow = 'auto';
  body.style.minHeight = '150vh';

  if (wrapper) {
    wrapper.style.position = 'relative';
    wrapper.style.top = '';
    wrapper.style.left = '';
    wrapper.style.width = '100%';
    wrapper.style.height = 'auto';
    wrapper.style.minHeight = '130vh';
    wrapper.style.maxHeight = 'none';
    wrapper.style.overflow = 'visible';
    wrapper.style.transform = '';
  }

  const nudge = () => {
    window.scrollTo(0, 1);
    window.scrollTo(0, 0);
    window.scrollTo(0, 2);
    nudgeMobileBrowserChrome();
  };

  nudge();
  await wait(50);
  requestAnimationFrame(nudge);
  await wait(120);
  nudge();
  await wait(180);
  nudge();

  if (landscape && tryFullscreen && !isFullscreenActive()) {
    const target = wrapper || document.documentElement;
    await requestElementFullscreen(target);
    if (!isFullscreenActive()) {
      await requestElementFullscreen(document.documentElement);
    }
  }

  await wait(80);

  root.classList.remove('android-chrome-collapse');
  body.style.minHeight = '';
  applyGameModeLock(wrapper);
  syncVisualViewportFrame(wrapper);

  return !isAndroidChromeBarVisible() || isFullscreenActive();
}

export function setViewportCssVars() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const landscape = !isPortraitOrientation();
  const isChrome = detectIOSChrome();

  if (vv) {
    root.style.setProperty('--vh', `${vv.height * 0.01}px`);
    root.style.setProperty('--game-vvh', `${vv.height}px`);
    const vvTop = landscape && !isChrome ? 0 : vv.offsetTop;
    const vvLeft = landscape && !isChrome ? 0 : vv.offsetLeft;
    root.style.setProperty('--game-vv-top', `${vvTop}px`);
    root.style.setProperty('--game-vvw', `${vv.width}px`);
    root.style.setProperty('--game-vv-left', `${vvLeft}px`);
  } else {
    root.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    root.style.setProperty('--game-vvh', `${window.innerHeight}px`);
    root.style.setProperty('--game-vv-top', '0px');
    root.style.setProperty('--game-vvw', `${window.innerWidth}px`);
    root.style.setProperty('--game-vv-left', '0px');
  }
}

/** Pin the game wrapper to the visible viewport (Android pseudo-fullscreen). */
export function syncVisualViewportFrame(wrapper) {
  setViewportCssVars();
  if (!wrapper) return;

  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const left = vv?.offsetLeft ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;

  wrapper.style.position = 'fixed';
  wrapper.style.top = `${top}px`;
  wrapper.style.left = `${left}px`;
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.maxHeight = `${height}px`;
  wrapper.style.maxWidth = `${width}px`;
  wrapper.style.zIndex = '2147483646';
  wrapper.style.overflow = 'hidden';
  wrapper.style.background = '#000';
}

export function clearVisualViewportFrame(wrapper) {
  if (!wrapper) return;
  clearIOSGameIframe(wrapper);
  wrapper.style.position = '';
  wrapper.style.top = '';
  wrapper.style.left = '';
  wrapper.style.width = '';
  wrapper.style.height = '';
  wrapper.style.maxHeight = '';
  wrapper.style.maxWidth = '';
  wrapper.style.zIndex = '';
  wrapper.style.overflow = '';
  wrapper.style.background = '';
}

export function setGameImmersiveClasses({
  active,
  ios,
  standalone,
  androidChrome,
  iosChrome,
  iosPortrait,
}) {
  const root = document.documentElement;
  const portrait =
    iosPortrait !== undefined ? Boolean(iosPortrait) : Boolean(ios && isPortraitOrientation());

  root.classList.toggle('slot-game-immersive-active', Boolean(active));
  root.classList.toggle('ios-slot-game-device', Boolean(ios));
  root.classList.toggle('ios-chrome-slot-game', Boolean(iosChrome));
  root.classList.toggle('ios-portrait-slot-game', Boolean(active && ios && portrait));
  root.classList.toggle('slot-game-standalone', Boolean(standalone));
  root.classList.toggle('android-chrome-slot-game', Boolean(androidChrome));
}

export function applyGameModeLock(wrapper, { allowDocumentScroll = false } = {}) {
  document.body.classList.add('slot-game-mode');
  const iosPortrait = detectIOS() && isPortraitOrientation();
  const iosChromeLandscape = detectIOSChrome() && !isPortraitOrientation();
  const canScroll = allowDocumentScroll || iosPortrait || iosChromeLandscape;

  if (canScroll) {
    document.body.style.overflow = '';
    document.body.style.overflowY = 'auto';
    document.body.style.overflowX = iosChromeLandscape ? 'auto' : '';
    document.documentElement.style.overflowY = 'auto';
    if (iosChromeLandscape) document.documentElement.style.overflowX = 'auto';
    if (wrapper) wrapper.style.overflow = 'visible';
  } else {
    document.body.style.overflow = 'hidden';
    if (wrapper) wrapper.style.overflow = 'hidden';
  }
}

/** Pin iOS game iframe to the visible viewport (landscape / non-flow layout). */
export function syncIOSGameIframe(wrapper) {
  setViewportCssVars();
  const iframe = getGameIframe(wrapper);
  if (!iframe) return;

  const vv = window.visualViewport;
  const landscape = !isPortraitOrientation();
  const left = vv?.offsetLeft ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const headerH = getSlotGameHeaderHeight();
  const iframeTop = landscape ? headerH : (vv?.offsetTop ?? 0) + headerH;
  const iframeHeight = Math.max(0, height - headerH);

  iframe.style.position = 'fixed';
  iframe.style.top = `${iframeTop}px`;
  iframe.style.left = `${landscape ? 0 : left}px`;
  iframe.style.width = `${landscape ? '100%' : `${width}px`}`;
  iframe.style.height = `${iframeHeight}px`;
  iframe.style.maxWidth = landscape ? '100%' : `${width}px`;
  iframe.style.maxHeight = `${iframeHeight}px`;
  iframe.style.minHeight = `${iframeHeight}px`;
  iframe.style.marginTop = '0';
  iframe.style.border = 'none';
  iframe.style.zIndex = '50';
}

/** iOS Chrome landscape — pin iframe below top URL bar (visualViewport offsetTop). */
export function syncIOSChromeGameIframe(wrapper) {
  setViewportCssVars();
  const iframe = getGameIframe(wrapper);
  if (!iframe) return;

  const vv = window.visualViewport;
  const offsetTop = vv?.offsetTop ?? 0;
  const left = vv?.offsetLeft ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const headerH = getSlotGameHeaderHeight();
  const iframeTop = offsetTop + headerH;
  const iframeHeight = Math.max(0, height - headerH);

  iframe.style.position = 'fixed';
  iframe.style.top = `${iframeTop}px`;
  iframe.style.left = `${left}px`;
  iframe.style.width = `${width}px`;
  iframe.style.height = `${iframeHeight}px`;
  iframe.style.maxWidth = `${width}px`;
  iframe.style.maxHeight = `${iframeHeight}px`;
  iframe.style.minHeight = `${iframeHeight}px`;
  iframe.style.marginTop = '0';
  iframe.style.border = 'none';
  iframe.style.zIndex = '50';
}

export function clearIOSGameIframe(wrapper) {
  const iframe = getGameIframe(wrapper);
  if (!iframe) return;
  iframe.style.position = '';
  iframe.style.top = '';
  iframe.style.left = '';
  iframe.style.width = '';
  iframe.style.height = '';
  iframe.style.maxWidth = '';
  iframe.style.maxHeight = '';
  iframe.style.minHeight = '';
  iframe.style.marginTop = '';
  iframe.style.border = '';
  iframe.style.zIndex = '';
}

/** iOS portrait — document-flow iframe so the page can scroll (Safari bottom bar / Chrome top bar). */
export function syncIOSPortraitFlowFrame(wrapper) {
  setViewportCssVars();
  if (!wrapper) return;

  clearVisualViewportFrame(wrapper);
  clearIOSGameIframe(wrapper);

  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const headerH = getSlotGameHeaderHeight();
  const iframeHeight = Math.max(0, height - headerH);
  const iframe = getGameIframe(wrapper);
  const shell = wrapper.querySelector('.spm-iframe-shell');

  ensureIOSPortraitScrollRoom(wrapper);
  wrapper.style.width = '100%';
  wrapper.style.maxHeight = 'none';
  wrapper.style.paddingBottom = '0';

  if (shell) {
    shell.style.height = `${iframeHeight}px`;
    shell.style.minHeight = `${iframeHeight}px`;
    shell.style.maxHeight = `${iframeHeight}px`;
  }

  if (iframe) {
    iframe.style.position = 'relative';
    iframe.style.top = 'auto';
    iframe.style.left = 'auto';
    iframe.style.width = '100%';
    iframe.style.maxWidth = `${width}px`;
    iframe.style.height = `${iframeHeight}px`;
    iframe.style.minHeight = `${iframeHeight}px`;
    iframe.style.maxHeight = `${iframeHeight}px`;
    iframe.style.marginTop = '0';
    iframe.style.border = 'none';
    iframe.style.zIndex = '1';
    iframe.style.display = 'block';
  }
}

/** iOS: portrait uses document flow; landscape pins iframe to visualViewport. */
export function syncIOSDvhFrame(wrapper) {
  setViewportCssVars();
  if (!wrapper) return;

  if (isPortraitOrientation()) {
    syncIOSPortraitFlowFrame(wrapper);
    return;
  }

  clearVisualViewportFrame(wrapper);
  if (detectIOSChrome()) {
    ensureIOSChromeScrollRoom(wrapper);
    syncIOSChromeGameIframe(wrapper);
  } else {
    syncIOSGameIframe(wrapper);
  }
}

export function releaseGameModeLock(wrapper) {
  document.body.classList.remove('slot-game-mode');
  document.body.style.overflow = '';
  document.body.style.overflowY = '';
  document.body.style.overflowX = '';
  document.documentElement.style.overflowY = '';
  document.documentElement.style.overflowX = '';
  document.body.style.minHeight = '';
  document.body.style.minWidth = '';
  document.body.style.height = '';
  if (wrapper) {
    wrapper.style.overflow = '';
    wrapper.style.minHeight = '';
    wrapper.style.minWidth = '';
    wrapper.style.height = '';
    wrapper.style.maxHeight = '';
    wrapper.style.position = '';
  }
}

/** Clear game-route scroll position when leaving so the next visit starts fresh. */
export function resetGamePlayRouteScroll() {
  if (typeof window === 'undefined') return;
  window.scrollTo(0, 0);
  const scroller = document.scrollingElement || document.documentElement;
  scroller.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}