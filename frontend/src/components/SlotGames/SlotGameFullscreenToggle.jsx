import { useCallback, useEffect, useState } from 'react';
import {
  detectAndroid,
  detectIOS,
  enterGameFullscreen,
  exitGameFullscreen,
  isAndroidGameChromeCollapsed,
  isGamePlayFullscreen,
  isGameUserExitedFullscreen,
  syncExitedGameFrame,
} from '../../utils/mobileGameImmersive';

function getGameWrapper() {
  return document.getElementById('slot-game-fullscreen-wrapper');
}

function MaximizeIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function MinimizeIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function SlotGameFullscreenToggle({ immersiveLocked = false }) {
  const isIOS = typeof window !== 'undefined' && detectIOS();
  const isAndroid = typeof window !== 'undefined' && detectAndroid();
  const [showMinimize, setShowMinimize] = useState(false);

  const syncFullscreenUi = useCallback(() => {
    if (isGameUserExitedFullscreen()) {
      setShowMinimize(false);
      return;
    }
    const apiFullscreen = isGamePlayFullscreen();
    const androidCollapsed =
      isAndroid && immersiveLocked && isAndroidGameChromeCollapsed();
    setShowMinimize(apiFullscreen || androidCollapsed);
  }, [isAndroid, immersiveLocked]);

  useEffect(() => {
    if (isIOS) return undefined;

    syncFullscreenUi();

    const onFullscreenChange = () => syncFullscreenUi();
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);

    const vv = window.visualViewport;
    const onViewportChange = () => syncFullscreenUi();
    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('mozfullscreenchange', onFullscreenChange);
      document.removeEventListener('MSFullscreenChange', onFullscreenChange);
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [isIOS, syncFullscreenUi]);

  useEffect(() => {
    if (!isIOS) syncFullscreenUi();
  }, [immersiveLocked, isIOS, syncFullscreenUi]);

  useEffect(() => {
    if (isIOS || !isGameUserExitedFullscreen()) return undefined;

    const sync = () => syncExitedGameFrame(getGameWrapper());
    sync();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [isIOS, showMinimize]);

  const toggleFullscreen = async () => {
    const wrapper = getGameWrapper();

    if (isGameUserExitedFullscreen()) {
      await enterGameFullscreen(wrapper);
    } else {
      const shouldExit =
        isGamePlayFullscreen() ||
        (isAndroid && immersiveLocked && isAndroidGameChromeCollapsed());
      if (shouldExit) {
        await exitGameFullscreen(wrapper);
      } else {
        await enterGameFullscreen(wrapper);
      }
    }

    syncFullscreenUi();
    window.setTimeout(syncFullscreenUi, 120);
    window.setTimeout(() => {
      if (isGameUserExitedFullscreen()) {
        syncExitedGameFrame(wrapper);
      }
      syncFullscreenUi();
    }, 400);
  };

  if (isIOS) return null;

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      aria-label={showMinimize ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={showMinimize ? 'Minimize' : 'Maximize'}
      className="spm-iframe-header-minmax"
    >
      {showMinimize ? <MinimizeIcon /> : <MaximizeIcon />}
    </button>
  );
}
