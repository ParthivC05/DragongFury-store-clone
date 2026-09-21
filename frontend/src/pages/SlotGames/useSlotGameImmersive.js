import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyGameModeLock,
  applyIOSPortraitGameScroll,
  applyIOSChromePortraitGameScroll,
  applyIOSChromeLandscapeGameScroll,
  applyIOSPortraitOverlayScroll,
  collapseAndroidChromeAddressBar,
  collapseIOSAddressBar,
  clearVisualViewportFrame,
  detectAndroidChrome,
  detectImmersiveGameDevice,
  detectIOS,
  detectIOSChrome,
  detectStandalone,
  exitElementFullscreen,
  finishIOSPortraitUserSwipeCollapse,
  isAndroidChromeBarVisible,
  isIOSBrowserBarExpanded,
  isFullscreenActive,
  isPortraitOrientation,
  nudgeMobileBrowserChrome,
  releaseGameModeLock,
  requestElementFullscreen,
  resetGamePlayRouteScroll,
  setGameUserExitedFullscreen,
  runChromeCollapseNudges,
  runIOSCollapseNudges,
  setGameImmersiveClasses,
  setIOSPortraitBarExpandedClass,
  setIOSChromeBarExpandedClass,
  setIosSwipeGateActiveClass,
  settleIOSChromeScroll,
  settleIOSPortraitScroll,
  setViewportCssVars,
  syncIOSDvhFrame,
  syncVisualViewportFrame,
} from '../../utils/mobileGameImmersive';

const WRAPPER_ID = 'slot-game-fullscreen-wrapper';

const GAME_VIEWPORT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';

function useImmersiveDevice() {
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const queries = [
      '(max-width: 767px)',
      '(max-height: 500px) and (orientation: landscape)',
      '(pointer: coarse)',
    ].map((q) => window.matchMedia(q));

    const update = () => setImmersive(detectImmersiveGameDevice());
    update();

    queries.forEach((mq) => mq.addEventListener('change', update));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      queries.forEach((mq) => mq.removeEventListener('change', update));
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return immersive;
}

function applyGameViewportMeta() {
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  const prevViewport = viewportMeta?.getAttribute('content') ?? '';

  const themeMeta =
    document.querySelector('meta[name="theme-color"]') ||
    (() => {
      const el = document.createElement('meta');
      el.name = 'theme-color';
      document.head.appendChild(el);
      el.dataset.slotGameCreated = 'true';
      return el;
    })();
  const prevTheme = themeMeta.getAttribute('content');

  if (viewportMeta) viewportMeta.setAttribute('content', GAME_VIEWPORT);
  themeMeta.setAttribute('content', '#04060a');

  return () => {
    if (viewportMeta && prevViewport) viewportMeta.setAttribute('content', prevViewport);
    if (themeMeta.dataset.slotGameCreated === 'true') {
      themeMeta.remove();
    } else if (prevTheme) {
      themeMeta.setAttribute('content', prevTheme);
    }
  };
}

/**
 * Mobile immersive behaviour for slot game play — mirrors Orionstars iOS swipe-up
 * gate (Safari + Chrome portrait), landscape collapse, and Android chrome collapse.
 */
export function useSlotGameImmersive({ enabled, gameKey }) {
  const immersiveDevice = useImmersiveDevice();
  const isIOS = detectIOS();
  const isIOSChrome = detectIOSChrome();
  const isAndroidChrome = detectAndroidChrome();
  const isStandalone = detectStandalone();

  const active = enabled && immersiveDevice;
  const [immersiveReady, setImmersiveReady] = useState(false);
  const appliedRef = useRef(false);

  const initialPortrait =
    typeof window !== 'undefined' ? isPortraitOrientation() : false;
  const initialIosPortraitGate =
    typeof window !== 'undefined' && detectIOS() && initialPortrait && !detectStandalone();
  const initialGateComplete =
    typeof window !== 'undefined' &&
    (detectStandalone() || (detectIOS() && !initialPortrait));

  const [isPortrait, setIsPortrait] = useState(initialPortrait);
  const [iosSwipeGateComplete, setIosSwipeGateComplete] = useState(initialGateComplete);
  const [iosSwipeOverlayActive, setIosSwipeOverlayActive] = useState(initialIosPortraitGate);

  const iosSwipeGateCompleteRef = useRef(initialGateComplete);
  const iosSwipeUserInteractedRef = useRef(false);

  const getWrapper = useCallback(
    () => (typeof document !== 'undefined' ? document.getElementById(WRAPPER_ID) : null),
    []
  );

  const completeIosSwipeGate = useCallback(() => {
    if (iosSwipeGateCompleteRef.current) return;
    iosSwipeGateCompleteRef.current = true;
    setIosSwipeGateComplete(true);
    setIosSwipeOverlayActive(false);
    setIosSwipeGateActiveClass(false);
    setIOSPortraitBarExpandedClass(false);
    setIOSChromeBarExpandedClass(false);
  }, []);

  const dismissIosSwipeOverlay = useCallback(() => {
    setIosSwipeOverlayActive(false);
  }, []);

  const armIosPortraitSwipeGate = useCallback(() => {
    iosSwipeGateCompleteRef.current = false;
    iosSwipeUserInteractedRef.current = false;
    setIosSwipeGateComplete(false);
    setIosSwipeOverlayActive(true);
  }, []);

  const syncIosBarExpanded = useCallback(() => {
    if (!isIOS) {
      setIOSPortraitBarExpandedClass(false);
      setIOSChromeBarExpandedClass(false);
      return;
    }

    const expanded = isIOSBrowserBarExpanded();
    const portrait = isPortraitOrientation();

    if (isIOSChrome) {
      setIOSChromeBarExpandedClass(expanded);
      setIOSPortraitBarExpandedClass(expanded && portrait);
      return;
    }

    if (!portrait) {
      setIOSPortraitBarExpandedClass(false);
      setIOSChromeBarExpandedClass(false);
      return;
    }

    setIOSPortraitBarExpandedClass(expanded);
    setIOSChromeBarExpandedClass(false);
  }, [isIOS, isIOSChrome]);

  const finalizeIosPortraitSwipeGate = useCallback(
    (wrapper) => {
      if (!wrapper || iosSwipeGateCompleteRef.current) return false;
      if (!iosSwipeUserInteractedRef.current) return false;

      let collapsed = finishIOSPortraitUserSwipeCollapse(wrapper);
      if (!collapsed) {
        collapsed = !isIOSBrowserBarExpanded();
      }
      if (!collapsed) {
        syncIosBarExpanded();
        return false;
      }

      setIosSwipeGateActiveClass(false);
      completeIosSwipeGate();
      setIOSPortraitBarExpandedClass(false);
      if (isIOSChrome) {
        setIOSChromeBarExpandedClass(false);
        applyIOSChromePortraitGameScroll(wrapper);
      } else {
        setIOSPortraitBarExpandedClass(false);
        applyIOSPortraitGameScroll(wrapper);
      }
      settleIOSPortraitScroll();
      return true;
    },
    [syncIosBarExpanded, isIOSChrome, completeIosSwipeGate]
  );

  const syncFrame = useCallback(() => {
    const wrapper = getWrapper();
    if (!wrapper || !appliedRef.current) {
      setViewportCssVars();
      return;
    }
    if (isIOS) {
      syncIOSDvhFrame(wrapper);
    } else {
      syncVisualViewportFrame(wrapper);
    }
  }, [getWrapper, isIOS]);

  const teardown = useCallback(() => {
    const wrapper = getWrapper();
    releaseGameModeLock(wrapper);
    clearVisualViewportFrame(wrapper);
    exitElementFullscreen();
    setGameImmersiveClasses({
      active: false,
      ios: false,
      iosChrome: false,
      standalone: false,
      androidChrome: false,
    });
    document.documentElement.classList.remove('slot-game-route', 'android-chrome-collapse');
    setGameUserExitedFullscreen(false);
    setIosSwipeGateActiveClass(false);
    iosSwipeGateCompleteRef.current = false;
    iosSwipeUserInteractedRef.current = false;
    setIosSwipeGateComplete(false);
    setIosSwipeOverlayActive(false);
    appliedRef.current = false;
    setImmersiveReady(false);
    resetGamePlayRouteScroll();
  }, [getWrapper]);

  // Enter / exit immersive mode.
  useEffect(() => {
    if (!active) {
      teardown();
      return undefined;
    }

    const restoreMeta = applyGameViewportMeta();
    const root = document.documentElement;
    root.classList.add('slot-game-route');

    const wrapper = getWrapper();
    const portrait = isPortraitOrientation();
    setIsPortrait(portrait);

    setGameImmersiveClasses({
      active: true,
      ios: isIOS,
      iosChrome: isIOSChrome,
      standalone: isStandalone,
      androidChrome: isAndroidChrome,
      iosPortrait: isIOS && portrait,
    });

    if (isIOS) {
      applyGameModeLock(wrapper, { allowDocumentScroll: true });
      if (portrait) {
        if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
        else applyIOSPortraitGameScroll(wrapper);
        syncIosBarExpanded();
      } else if (isIOSChrome) {
        applyIOSChromeLandscapeGameScroll(wrapper);
        syncIosBarExpanded();
      } else {
        runIOSCollapseNudges(wrapper);
        syncIOSDvhFrame(wrapper);
        syncIosBarExpanded();
      }
    } else if (isAndroidChrome) {
      applyGameModeLock(wrapper);
      syncVisualViewportFrame(wrapper);
      runChromeCollapseNudges();
      if (!portrait) {
        collapseAndroidChromeAddressBar(wrapper);
      }
    } else {
      applyGameModeLock(wrapper);
      syncVisualViewportFrame(wrapper);
      runChromeCollapseNudges();
    }

    appliedRef.current = true;
    setImmersiveReady(true);

    return () => {
      restoreMeta();
      teardown();
    };
  }, [active, getWrapper, isAndroidChrome, isIOS, isIOSChrome, isStandalone, syncIosBarExpanded, teardown]);

  // Arm iOS portrait swipe gate when a new game loads.
  useEffect(() => {
    if (!active || !gameKey || isStandalone || !isIOS) return undefined;
    if (!isPortraitOrientation()) return undefined;

    const wrapper = getWrapper();
    armIosPortraitSwipeGate();
    applyIOSPortraitOverlayScroll(wrapper);
    syncIosBarExpanded();
    resetGamePlayRouteScroll();
    setIsPortrait(true);

    return undefined;
  }, [active, gameKey, isIOS, isStandalone, getWrapper, armIosPortraitSwipeGate, syncIosBarExpanded]);

  useEffect(() => {
    if (!active || !isIOS || isStandalone) return undefined;

    if (isStandalone) {
      completeIosSwipeGate();
      return undefined;
    }

    if (!isPortraitOrientation()) {
      if (!iosSwipeGateCompleteRef.current) {
        completeIosSwipeGate();
      }
      const wrapper = getWrapper();
      if (isIOSChrome) {
        applyIOSChromeLandscapeGameScroll(wrapper);
        syncIosBarExpanded();
      }
    }

    return undefined;
  }, [active, isIOS, isIOSChrome, isStandalone, getWrapper, syncIosBarExpanded, completeIosSwipeGate]);

  useEffect(() => {
    if (!active || !isIOS || isStandalone || iosSwipeGateComplete) return undefined;

    const syncPortraitGate = () => {
      const portrait = isPortraitOrientation();
      const wrapper = getWrapper();
      setIsPortrait(portrait);

      if (portrait) {
        if (!iosSwipeGateCompleteRef.current) {
          armIosPortraitSwipeGate();
          applyIOSPortraitOverlayScroll(wrapper);
        } else if (isIOSChrome) {
          applyIOSChromePortraitGameScroll(wrapper);
        } else {
          applyIOSPortraitGameScroll(wrapper);
        }
        syncIosBarExpanded();
        return;
      }

      completeIosSwipeGate();
      setIosSwipeOverlayActive(false);
    };

    const mq = window.matchMedia('(orientation: portrait)');
    mq.addEventListener('change', syncPortraitGate);
    window.addEventListener('orientationchange', syncPortraitGate);

    return () => {
      mq.removeEventListener('change', syncPortraitGate);
      window.removeEventListener('orientationchange', syncPortraitGate);
    };
  }, [
    active,
    isIOS,
    isStandalone,
    iosSwipeGateComplete,
    getWrapper,
    isIOSChrome,
    syncIosBarExpanded,
    completeIosSwipeGate,
    armIosPortraitSwipeGate,
  ]);

  useEffect(() => {
    if (iosSwipeOverlayActive && !iosSwipeGateComplete) {
      setIOSPortraitBarExpandedClass(true);
      if (isIOSChrome) setIOSChromeBarExpandedClass(true);
    }
    return () => {
      syncIosBarExpanded();
    };
  }, [iosSwipeOverlayActive, iosSwipeGateComplete, isIOSChrome, syncIosBarExpanded]);

  // Swipe gate scroll / touch listeners (portrait iOS).
  useEffect(() => {
    if (
      !active ||
      !isIOS ||
      !isPortrait ||
      !iosSwipeOverlayActive ||
      iosSwipeGateComplete ||
      isStandalone
    ) {
      return undefined;
    }

    const wrapper = getWrapper();
    applyIOSPortraitOverlayScroll(wrapper);
    syncIosBarExpanded();

    const tryCompleteFromScroll = () => {
      if (iosSwipeGateCompleteRef.current || !iosSwipeUserInteractedRef.current) return;
      setViewportCssVars();
      syncIosBarExpanded();
      if (isIOSBrowserBarExpanded()) return;
      finalizeIosPortraitSwipeGate(wrapper);
    };

    const onScroll = () => {
      requestAnimationFrame(tryCompleteFromScroll);
    };

    const onTouchStart = () => {
      iosSwipeUserInteractedRef.current = true;
    };

    const onTouchEnd = () => {
      if (!iosSwipeUserInteractedRef.current) return;
      const attempt = () => finalizeIosPortraitSwipeGate(wrapper);
      if (attempt()) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(attempt);
      });
    };

    const onViewportResize = () => {
      setViewportCssVars();
      syncIosBarExpanded();
    };

    const vv = window.visualViewport;
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    vv?.addEventListener('scroll', onScroll);
    vv?.addEventListener('resize', onViewportResize);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchend', onTouchEnd);
      vv?.removeEventListener('scroll', onScroll);
      vv?.removeEventListener('resize', onViewportResize);
    };
  }, [
    active,
    isIOS,
    isPortrait,
    iosSwipeOverlayActive,
    iosSwipeGateComplete,
    isStandalone,
    getWrapper,
    syncIosBarExpanded,
    finalizeIosPortraitSwipeGate,
  ]);

  // Keep the frame pinned to the visible viewport.
  useEffect(() => {
    if (!active || !immersiveReady) return undefined;

    syncFrame();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncFrame);
    vv?.addEventListener('scroll', syncFrame);
    window.addEventListener('resize', syncFrame);
    window.addEventListener('orientationchange', syncFrame);

    return () => {
      vv?.removeEventListener('resize', syncFrame);
      vv?.removeEventListener('scroll', syncFrame);
      window.removeEventListener('resize', syncFrame);
      window.removeEventListener('orientationchange', syncFrame);
    };
  }, [active, immersiveReady, syncFrame]);

  // iOS portrait — sync on viewport / scroll changes.
  useEffect(() => {
    if (!active || !isIOS || !isPortrait) return undefined;

    syncIosBarExpanded();
    const vv = window.visualViewport;
    const onViewportChange = () => {
      syncIosBarExpanded();
      const wrapper = getWrapper();
      if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
      else applyIOSPortraitGameScroll(wrapper);
    };

    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);
    window.addEventListener('scroll', onViewportChange);

    return () => {
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('scroll', onViewportChange);
    };
  }, [active, isIOS, isIOSChrome, isPortrait, getWrapper, syncIosBarExpanded]);

  // iOS Chrome landscape — document scroll to collapse top URL bar.
  useEffect(() => {
    if (!active || !isIOS || !isIOSChrome || isPortrait) return undefined;

    syncIosBarExpanded();
    const wrapper = getWrapper();
    applyIOSChromeLandscapeGameScroll(wrapper);

    const vv = window.visualViewport;
    const onViewportChange = () => {
      syncIosBarExpanded();
      applyIOSChromeLandscapeGameScroll(getWrapper());
    };

    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);
    window.addEventListener('scroll', onViewportChange);

    return () => {
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('scroll', onViewportChange);
    };
  }, [active, isIOS, isIOSChrome, isPortrait, getWrapper, syncIosBarExpanded]);

  // iOS landscape Safari — retry collapse + scroll sync.
  useEffect(() => {
    if (!active || !immersiveReady || !isIOS) return undefined;

    const wrapper = getWrapper();

    const onOrientation = () => {
      const portrait = isPortraitOrientation();
      document.documentElement.classList.toggle('ios-portrait-slot-game', portrait);
      setIsPortrait(portrait);

      window.setTimeout(() => {
        if (portrait) {
          if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
          else applyIOSPortraitGameScroll(wrapper);
          syncIosBarExpanded();
          return;
        }
        if (isIOSChrome) {
          applyIOSChromeLandscapeGameScroll(wrapper);
        } else {
          runIOSCollapseNudges(wrapper);
          syncIOSDvhFrame(wrapper);
        }
        syncIosBarExpanded();
      }, 100);

      window.setTimeout(() => {
        if (isPortraitOrientation()) {
          if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
          else applyIOSPortraitGameScroll(wrapper);
          syncIosBarExpanded();
          return;
        }
        if (isIOSChrome) {
          applyIOSChromeLandscapeGameScroll(wrapper);
        } else {
          runIOSCollapseNudges(wrapper);
          syncIOSDvhFrame(wrapper);
        }
        syncIosBarExpanded();
      }, 500);
    };

    window.addEventListener('orientationchange', onOrientation);
    onOrientation();

    const retryIfExpanded = () => {
      if (!appliedRef.current || isIOSChrome) return;
      syncIosBarExpanded();
      if (!isIOSBrowserBarExpanded() || isPortraitOrientation()) return;
      collapseIOSAddressBar(wrapper);
    };

    const retryInterval = window.setInterval(retryIfExpanded, 2000);

    let scrollResetTimer;
    const onScroll = () => {
      setViewportCssVars();
      if (isPortraitOrientation()) {
        if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
        else applyIOSPortraitGameScroll(wrapper);
      } else if (isIOSChrome) {
        applyIOSChromeLandscapeGameScroll(wrapper);
      } else {
        syncIOSDvhFrame(wrapper);
      }
      syncIosBarExpanded();
      clearTimeout(scrollResetTimer);
      scrollResetTimer = window.setTimeout(() => {
        if (isPortraitOrientation()) {
          if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
          else applyIOSPortraitGameScroll(wrapper);
          if (!isIOSBrowserBarExpanded()) {
            settleIOSPortraitScroll();
          }
          return;
        }
        if (isIOSChrome) {
          applyIOSChromeLandscapeGameScroll(wrapper);
          if (!isIOSBrowserBarExpanded()) {
            settleIOSChromeScroll();
          }
          return;
        }
        if (!isIOSBrowserBarExpanded()) {
          settleIOSChromeScroll();
          syncIOSDvhFrame(wrapper);
        }
      }, 120);
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('orientationchange', onOrientation);
      window.clearInterval(retryInterval);
      clearTimeout(scrollResetTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [active, immersiveReady, isIOS, isIOSChrome, getWrapper, syncIosBarExpanded]);

  // Android Chrome: enter fullscreen on first touch and re-collapse the bar if it returns.
  useEffect(() => {
    if (!active || !immersiveReady || !isAndroidChrome) return undefined;

    const onFirstTouch = async () => {
      if (!isFullscreenActive()) {
        const wrapper = getWrapper();
        await requestElementFullscreen(wrapper || document.documentElement);
        await collapseAndroidChromeAddressBar(wrapper, { tryFullscreen: false });
      }
    };
    document.addEventListener('touchstart', onFirstTouch, { once: true, passive: true });

    const interval = window.setInterval(() => {
      if (!appliedRef.current || !isAndroidChromeBarVisible()) return;
      collapseAndroidChromeAddressBar(getWrapper(), { tryFullscreen: false });
    }, 2500);

    return () => {
      document.removeEventListener('touchstart', onFirstTouch);
      window.clearInterval(interval);
    };
  }, [active, immersiveReady, isAndroidChrome, getWrapper]);

  // Re-nudge the chrome on orientation change for non-iOS devices.
  useEffect(() => {
    if (!active || !immersiveReady || isIOS) return undefined;

    const reCollapse = () => {
      if (!appliedRef.current) return;
      requestAnimationFrame(() => {
        nudgeMobileBrowserChrome();
        runChromeCollapseNudges();
        window.setTimeout(syncFrame, 200);
      });
    };

    window.addEventListener('orientationchange', reCollapse);
    return () => window.removeEventListener('orientationchange', reCollapse);
  }, [active, immersiveReady, isIOS, syncFrame]);

  useEffect(() => {
    const onLeave = () => teardown();
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [teardown]);

  return {
    immersiveDevice,
    immersiveReady: active && immersiveReady,
    isIOS,
    isIOSChrome,
    isStandalone,
    isPortrait,
    iosSwipeGateComplete,
    showIosSwipeUpOverlay: iosSwipeOverlayActive && !iosSwipeGateComplete,
    dismissIosSwipeOverlay,
    isAndroidChrome,
  };
}
