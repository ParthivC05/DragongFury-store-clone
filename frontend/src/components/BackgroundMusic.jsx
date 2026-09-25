import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  advanceShuffleQueue,
  BG_MUSIC_CROSSFADE_MS,
  BG_MUSIC_DEFAULT_VOLUME,
  BG_MUSIC_MUTED_STORAGE_KEY,
  BG_MUSIC_SHUFFLE_INTERVAL_MS,
  BG_MUSIC_SHUFFLE_STORAGE_KEY,
  BG_MUSIC_TRACKS,
  BG_MUSIC_TRACK_STORAGE_KEY,
  BG_MUSIC_VOLUME_STORAGE_KEY,
  createShuffledQueue,
  getStoredMuted,
  getStoredShuffleEnabled,
  getStoredTrackId,
  getStoredVolume,
  getTrackById,
  writeBgMusicStorage,
} from './backgroundMusicTracks';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import { areClickSoundsEnabled, setClickSoundsEnabled } from '../lib/clubClickSounds';
import './BackgroundMusic.css';

const MUSIC_TARGET_PATHS = ['/', '/link2play', '/casino', '/firekirin-exclusive'];
const SHUFFLE_AVAILABLE = BG_MUSIC_TRACKS.length > 1;
const HOLD_MUTE_MS = 450;

const ICON_ON = (
  <>
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 010 7" />
    <path d="M18.5 5.5a9 9 0 010 13" />
  </>
);

const ICON_OFF = (
  <>
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </>
);

function MusicNoteIcon() {
  return (
    <svg
      className="bgm-btn__icon"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9 9.003 10.5-3v13M9 19.003c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2Zm10.5-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2Z"
      />
    </svg>
  );
}

function MusicMutedIcon() {
  return (
    <svg
      className="bgm-btn__icon"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
      />
    </svg>
  );
}

function resolveTrackSrc(src) {
  try {
    return new URL(src, window.location.origin).href;
  } catch {
    return src;
  }
}

function cancelCrossfade(cancelRef) {
  cancelRef.cancelled = true;
  if (cancelRef.rafId != null) {
    cancelAnimationFrame(cancelRef.rafId);
    cancelRef.rafId = null;
  }
}

/** HTMLMediaElement.volume must be in [0, 1] — clamp to avoid Clarity/console RangeErrors. */
function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function setMediaVolume(audio, value) {
  if (!audio) return;
  try {
    audio.volume = clampVolume(value);
  } catch {
    /* ignore InvalidStateError / residual RangeError on detached media elements */
  }
}

function toMediaVolume(pct) {
  return clampVolume(Number(pct) / 100);
}

function animateVolume(audio, fromVol, toVol, durationMs, cancelRef) {
  return new Promise((resolve) => {
    const from = clampVolume(fromVol);
    const to = clampVolume(toVol);
    if (!audio || durationMs <= 0 || Math.abs(from - to) < 0.001) {
      setMediaVolume(audio, to);
      resolve();
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      if (cancelRef.cancelled) {
        resolve();
        return;
      }
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setMediaVolume(audio, from + (to - from) * t);
      if (t < 1) {
        cancelRef.rafId = requestAnimationFrame(tick);
      } else {
        cancelRef.rafId = null;
        setMediaVolume(audio, to);
        resolve();
      }
    };
    cancelRef.rafId = requestAnimationFrame(tick);
  });
}

function createAudioElement() {
  const audio = document.createElement('audio');
  audio.setAttribute('playsinline', '');
  audio.setAttribute('preload', 'none');
  return audio;
}

function getMusicStatusText({ isMuted, isPlaying, needsGesture, trackName }) {
  if (isMuted) return 'Muted';
  if (isPlaying) return `Playing ${trackName}`;
  if (needsGesture) return 'Tap anywhere to start';
  return trackName;
}

function getMusicButtonLabel({ isMuted, isPlaying, needsGesture, trackName }) {
  if (isMuted) return 'Music muted — open sound settings';
  if (isPlaying) return `Playing ${trackName} — open sound settings`;
  if (needsGesture) return 'Background music — tap anywhere to start';
  return `${trackName} selected — open sound settings`;
}

export function BackgroundMusic({ hideControls = false }) {
  const location = useLocation();
  const audioARef = useRef(null);
  const audioBRef = useRef(null);
  const activeSlotRef = useRef('a');
  const playPromisesRef = useRef(new WeakMap());
  const audioCtxRef = useRef(null);
  const btnRef = useRef(null);
  const modalRef = useRef(null);
  const speakerRef = useRef(null);
  const lastFocusRef = useRef(null);
  const holdTimerRef = useRef(null);
  const didHoldRef = useRef(false);
  const loadedTrackSrcRef = useRef('');
  const shuffleQueueRef = useRef(createShuffledQueue(getStoredTrackId()));
  const shuffleTimerRef = useRef(null);
  const crossfadeCancelRef = useRef({ cancelled: false, rafId: null });
  const isCrossfadingRef = useRef(false);

  const shuffleEnabledRef = useRef(getStoredShuffleEnabled());
  const isMutedRef = useRef(getStoredMuted());
  const volumeRef = useRef(getStoredVolume());
  const lastVolumeRef = useRef(
    (() => {
      const v = getStoredVolume();
      return v > 0 ? v : BG_MUSIC_DEFAULT_VOLUME;
    })(),
  );
  const isTargetPageRef = useRef(false);
  const isTabVisibleRef = useRef(true);
  const isPlayingRef = useRef(false);
  const selectedTrackIdRef = useRef(getStoredTrackId());

  const [isMuted, setIsMuted] = useState(getStoredMuted);
  const [volume, setVolume] = useState(getStoredVolume);
  const [lastVolume, setLastVolume] = useState(() => lastVolumeRef.current);
  const [selectedTrackId, setSelectedTrackId] = useState(getStoredTrackId);
  const [shuffleEnabled, setShuffleEnabled] = useState(getStoredShuffleEnabled);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [clickSoundsOn, setClickSoundsOn] = useState(areClickSoundsEnabled);
  const [isTabVisible, setIsTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  const isTargetPage = MUSIC_TARGET_PATHS.includes(location.pathname);
  const selectedTrack = getTrackById(selectedTrackId);

  shuffleEnabledRef.current = shuffleEnabled;
  isMutedRef.current = isMuted;
  volumeRef.current = volume;
  lastVolumeRef.current = lastVolume;
  isTargetPageRef.current = isTargetPage;
  isTabVisibleRef.current = isTabVisible;
  selectedTrackIdRef.current = selectedTrackId;
  isPlayingRef.current = isPlaying;

  const getActiveAudio = useCallback(() => (
    activeSlotRef.current === 'a' ? audioARef.current : audioBRef.current
  ), []);

  const getInactiveAudio = useCallback(() => (
    activeSlotRef.current === 'a' ? audioBRef.current : audioARef.current
  ), []);

  const swapActiveSlot = useCallback(() => {
    activeSlotRef.current = activeSlotRef.current === 'a' ? 'b' : 'a';
  }, []);

  const syncPlayingState = useCallback(() => {
    const active = activeSlotRef.current === 'a' ? audioARef.current : audioBRef.current;
    const inactive = activeSlotRef.current === 'a' ? audioBRef.current : audioARef.current;
    const activePlaying = Boolean(active && !active.paused && !active.ended);
    const inactivePlaying = Boolean(inactive && !inactive.paused && !inactive.ended);
    // During crossfade the incoming element plays before active slot swaps.
    const playing = activePlaying || (isCrossfadingRef.current && inactivePlaying);
    setIsPlaying(playing);
    isPlayingRef.current = playing;
    return playing;
  }, []);

  const resumeAudioContext = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext && !audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {
      /* AudioContext not available */
    }
  }, []);

  const clearShuffleTimer = useCallback(() => {
    if (shuffleTimerRef.current) {
      clearInterval(shuffleTimerRef.current);
      shuffleTimerRef.current = null;
    }
  }, []);

  const settlePendingPlay = useCallback(async (audio) => {
    if (!audio) return;
    const pending = playPromisesRef.current.get(audio);
    if (!pending) return;
    try {
      await pending;
    } catch {
      /* AbortError / NotAllowedError — expected during track changes */
    }
  }, []);

  const resetShuffleTimer = useCallback(() => {
    clearShuffleTimer();

    const active = activeSlotRef.current === 'a' ? audioARef.current : audioBRef.current;
    const isAudible = isPlayingRef.current || Boolean(active && !active.paused && !active.ended);

    if (
      !SHUFFLE_AVAILABLE
      || !shuffleEnabledRef.current
      || isMutedRef.current
      || !isTargetPageRef.current
      || !isTabVisibleRef.current
      || !isAudible
    ) {
      return;
    }

    shuffleTimerRef.current = setInterval(() => {
      void advanceToNextTrackRef.current?.();
    }, BG_MUSIC_SHUFFLE_INTERVAL_MS);
  }, [clearShuffleTimer]);

  const advanceToNextTrackRef = useRef(null);

  const playAudio = useCallback(async (audio, { manageShuffleTimer = true } = {}) => {
    if (!audio) return false;

    resumeAudioContext();
    await settlePendingPlay(audio);

    const attemptPlay = () => audio.play();
    let promise = attemptPlay();
    playPromisesRef.current.set(audio, promise);

    const onPlaySuccess = () => {
      setNeedsGesture(false);
      syncPlayingState();
      if (manageShuffleTimer) {
        resetShuffleTimer();
      }
    };

    try {
      await promise;
      onPlaySuccess();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        promise = attemptPlay();
        playPromisesRef.current.set(audio, promise);
        try {
          await promise;
          onPlaySuccess();
          return true;
        } catch (retryErr) {
          if (retryErr.name === 'NotAllowedError') setNeedsGesture(true);
          return false;
        }
      }

      if (err.name === 'NotAllowedError') {
        setNeedsGesture(true);
        return false;
      }

      // eslint-disable-next-line no-console
      console.warn('[BackgroundMusic] play() failed:', err.name, err.message);
      return false;
    } finally {
      playPromisesRef.current.delete(audio);
    }
  }, [resumeAudioContext, resetShuffleTimer, settlePendingPlay, syncPlayingState]);

  const pauseAll = useCallback(async () => {
    cancelCrossfade(crossfadeCancelRef.current);
    await settlePendingPlay(audioARef.current);
    await settlePendingPlay(audioBRef.current);
    audioARef.current?.pause();
    audioBRef.current?.pause();
    syncPlayingState();
  }, [settlePendingPlay, syncPlayingState]);

  const applyOutputVolume = useCallback((muted, volPct) => {
    const audio = getActiveAudio();
    if (audio && !isCrossfadingRef.current) {
      setMediaVolume(audio, muted || volPct <= 0 ? 0 : toMediaVolume(volPct));
    }
  }, [getActiveAudio]);

  const applyLoopMode = useCallback((shuffleOn) => {
    const audio = getActiveAudio();
    if (audio) {
      audio.loop = !shuffleOn;
    }
  }, [getActiveAudio]);

  const crossfadeToTrack = useCallback(async (track) => {
    const outgoing = getActiveAudio();
    const incoming = getInactiveAudio();
    if (!outgoing || !incoming || isMutedRef.current || !isTargetPageRef.current) return false;

    cancelCrossfade(crossfadeCancelRef.current);
    crossfadeCancelRef.current = { cancelled: false, rafId: null };

    const halfFade = BG_MUSIC_CROSSFADE_MS / 2;
    const targetVol = toMediaVolume(volumeRef.current);
    const cancelRef = crossfadeCancelRef.current;

    isCrossfadingRef.current = true;

    try {
      if (!outgoing.paused) {
        const fromVol = clampVolume(outgoing.volume);
        await animateVolume(outgoing, fromVol, 0, halfFade, cancelRef);
      }
      if (cancelRef.cancelled) return false;

      await settlePendingPlay(outgoing);
      outgoing.pause();

      const nextSrc = resolveTrackSrc(track.src);
      incoming.src = track.src;
      incoming.loop = false;
      incoming.load();
      setMediaVolume(incoming, 0);

      const played = await playAudio(incoming, { manageShuffleTimer: false });
      if (!played || cancelRef.cancelled) return false;

      swapActiveSlot();
      loadedTrackSrcRef.current = nextSrc;
      applyLoopMode(shuffleEnabledRef.current);

      await animateVolume(incoming, 0, targetVol, halfFade, cancelRef);
      syncPlayingState();
      resetShuffleTimer();
      return !cancelRef.cancelled;
    } finally {
      isCrossfadingRef.current = false;
    }
  }, [
    applyLoopMode,
    getActiveAudio,
    getInactiveAudio,
    playAudio,
    resetShuffleTimer,
    settlePendingPlay,
    swapActiveSlot,
    syncPlayingState,
  ]);

  const loadTrack = useCallback(async (track, { autoplay = false } = {}) => {
    const audio = getActiveAudio();
    if (!audio) return false;

    const nextSrc = resolveTrackSrc(track.src);

    if (loadedTrackSrcRef.current === nextSrc) {
      if (autoplay && isTargetPageRef.current && !isMutedRef.current) {
        setMediaVolume(audio, toMediaVolume(volumeRef.current));
        return playAudio(audio);
      }
      return true;
    }

    if (
      autoplay
      && loadedTrackSrcRef.current
      && isTargetPageRef.current
      && !isMutedRef.current
      && isPlayingRef.current
    ) {
      return crossfadeToTrack(track);
    }

    await settlePendingPlay(audio);
    audio.pause();
    audio.src = track.src;
    audio.load();
    loadedTrackSrcRef.current = nextSrc;
    applyLoopMode(shuffleEnabledRef.current);

    if (autoplay && isTargetPageRef.current && !isMutedRef.current) {
      setMediaVolume(audio, toMediaVolume(volumeRef.current));
      return playAudio(audio);
    }

    return true;
  }, [applyLoopMode, crossfadeToTrack, getActiveAudio, playAudio, settlePendingPlay]);

  const advanceToNextTrack = useCallback(async () => {
    if (
      !SHUFFLE_AVAILABLE
      || !shuffleEnabledRef.current
      || isMutedRef.current
      || !isTargetPageRef.current
      || !isTabVisibleRef.current
      || !isPlayingRef.current
      || isCrossfadingRef.current
    ) {
      return;
    }

    const currentId = selectedTrackIdRef.current;
    const { queue, nextTrackId } = advanceShuffleQueue(shuffleQueueRef.current, currentId);
    shuffleQueueRef.current = queue;

    if (!nextTrackId || nextTrackId === currentId) return;

    const track = getTrackById(nextTrackId);
    isCrossfadingRef.current = true;

    try {
      const ok = await crossfadeToTrack(track);
      if (ok) {
        setSelectedTrackId(nextTrackId);
        writeBgMusicStorage(BG_MUSIC_TRACK_STORAGE_KEY, nextTrackId);
      }
    } finally {
      isCrossfadingRef.current = false;
    }
  }, [crossfadeToTrack]);

  advanceToNextTrackRef.current = advanceToNextTrack;

  const startPlayback = useCallback(async () => {
    if (!isTargetPageRef.current || isMutedRef.current) return;

    const track = getTrackById(selectedTrackIdRef.current);
    await loadTrack(track, { autoplay: true });
  }, [loadTrack]);

  useEffect(() => {
    const initialTrackId = getStoredTrackId();
    const initialShuffle = getStoredShuffleEnabled();
    const initialMuted = getStoredMuted();
    const initialVolume = getStoredVolume();

    const audioA = createAudioElement();
    const audioB = createAudioElement();
    audioA.loop = !initialShuffle;
    audioB.loop = !initialShuffle;
    setMediaVolume(audioA, initialMuted || initialVolume <= 0 ? 0 : toMediaVolume(initialVolume));
    setMediaVolume(audioB, 0);

    audioARef.current = audioA;
    audioBRef.current = audioB;
    activeSlotRef.current = 'a';
    loadedTrackSrcRef.current = '';
    shuffleQueueRef.current = createShuffledQueue(initialTrackId);

    const onMediaEvent = () => {
      syncPlayingState();
    };

    [audioA, audioB].forEach((audio) => {
      audio.addEventListener('play', onMediaEvent);
      audio.addEventListener('pause', onMediaEvent);
      audio.addEventListener('ended', onMediaEvent);
    });

    return () => {
      clearShuffleTimer();
      cancelCrossfade(crossfadeCancelRef.current);
      void settlePendingPlay(audioA);
      void settlePendingPlay(audioB);
      audioA.pause();
      audioB.pause();
      [audioA, audioB].forEach((audio) => {
        audio.removeEventListener('play', onMediaEvent);
        audio.removeEventListener('pause', onMediaEvent);
        audio.removeEventListener('ended', onMediaEvent);
        audio.src = '';
      });
      audioARef.current = null;
      audioBRef.current = null;
      loadedTrackSrcRef.current = '';
    };
  }, [clearShuffleTimer, settlePendingPlay, syncPlayingState]);

  useEffect(() => {
    applyOutputVolume(isMuted, volume);
    writeBgMusicStorage(BG_MUSIC_MUTED_STORAGE_KEY, String(isMuted));
  }, [isMuted, volume, applyOutputVolume]);

  useEffect(() => {
    writeBgMusicStorage(BG_MUSIC_VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    writeBgMusicStorage(BG_MUSIC_TRACK_STORAGE_KEY, selectedTrackId);
  }, [selectedTrackId]);

  useEffect(() => {
    applyLoopMode(shuffleEnabled);
    if (isPlayingRef.current) {
      resetShuffleTimer();
    }
  }, [shuffleEnabled, applyLoopMode, resetShuffleTimer]);

  useEffect(() => {
    setIsPanelOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isTargetPage) {
      void pauseAll();
      clearShuffleTimer();
      return;
    }

    if (!isMuted && loadedTrackSrcRef.current) {
      void startPlayback();
    } else if (!isMuted && !loadedTrackSrcRef.current) {
      setNeedsGesture(true);
    }
  }, [isTargetPage, isMuted, pauseAll, clearShuffleTimer, startPlayback]);

  useEffect(() => {
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabVisible(visible);
      isTabVisibleRef.current = visible;
      if (visible) {
        resetShuffleTimer();
      } else {
        clearShuffleTimer();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [clearShuffleTimer, resetShuffleTimer]);

  useEffect(() => {
    if (!isTargetPage || isMuted || isPlaying) return undefined;

    const onUserGesture = () => {
      void startPlayback();
    };

    window.addEventListener('click', onUserGesture, { once: true, capture: true });
    window.addEventListener('touchstart', onUserGesture, { once: true, capture: true });
    window.addEventListener('keydown', onUserGesture, { once: true, capture: true });

    return () => {
      window.removeEventListener('click', onUserGesture, { capture: true });
      window.removeEventListener('touchstart', onUserGesture, { capture: true });
      window.removeEventListener('keydown', onUserGesture, { capture: true });
    };
  }, [isTargetPage, isMuted, isPlaying, startPlayback]);

  useEffect(() => {
    if (!isPanelOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsPanelOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen) return undefined;

    lastFocusRef.current = document.activeElement;
    const t = window.setTimeout(() => speakerRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      if (lastFocusRef.current && typeof lastFocusRef.current.focus === 'function') {
        lastFocusRef.current.focus();
      }
    };
  }, [isPanelOpen]);

  useEffect(() => {
    if (hideControls) setIsPanelOpen(false);
  }, [hideControls]);

  useEffect(() => {
    if (!isPanelOpen) return undefined;

    document.body.classList.add('bgm-modal-open');
    const releaseScrollLock = lockBodyScroll();
    window.dispatchEvent(new CustomEvent('bgm:modal-open'));

    return () => {
      document.body.classList.remove('bgm-modal-open');
      releaseScrollLock();
      window.dispatchEvent(new CustomEvent('bgm:modal-close'));
    };
  }, [isPanelOpen]);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  const setMutedState = useCallback((nextMuted) => {
    if (nextMuted === isMutedRef.current) return;

    if (nextMuted) {
      const vol = volumeRef.current;
      if (vol > 0) {
        lastVolumeRef.current = vol;
        setLastVolume(vol);
      }
      setVolume(0);
    } else {
      const restored = volumeRef.current > 0
        ? volumeRef.current
        : (lastVolumeRef.current || BG_MUSIC_DEFAULT_VOLUME);
      setVolume(restored);
    }

    setIsMuted(nextMuted);

    if (nextMuted) {
      void pauseAll();
      clearShuffleTimer();
      return;
    }

    if (isTargetPageRef.current) {
      void startPlayback();
    }
  }, [clearShuffleTimer, pauseAll, startPlayback]);

  useEffect(() => {
    const onExternalMute = (e) => {
      const next = Boolean(e?.detail?.muted);
      setMutedState(next);
    };
    window.addEventListener('bg-music:set-muted', onExternalMute);
    return () => window.removeEventListener('bg-music:set-muted', onExternalMute);
  }, [setMutedState]);

  const setVolumeState = useCallback((nextVol) => {
    const v = Math.min(100, Math.max(0, Math.round(Number(nextVol) || 0)));
    const nextMuted = v === 0;
    if (v > 0) {
      lastVolumeRef.current = v;
      setLastVolume(v);
    }
    setVolume(v);
    setIsMuted(nextMuted);

    if (nextMuted) {
      void pauseAll();
      clearShuffleTimer();
      return;
    }

    if (isTargetPageRef.current) {
      void startPlayback();
    }
  }, [clearShuffleTimer, pauseAll, startPlayback]);

  const setShuffleEnabledState = useCallback((next) => {
    setShuffleEnabled(next);
    applyLoopMode(next);
    writeBgMusicStorage(BG_MUSIC_SHUFFLE_STORAGE_KEY, String(next));

    if (next) {
      shuffleQueueRef.current = createShuffledQueue(selectedTrackIdRef.current);
      resetShuffleTimer();
    } else {
      clearShuffleTimer();
    }
  }, [applyLoopMode, clearShuffleTimer, resetShuffleTimer]);

  const handleTrackSelect = (trackId) => {
    if (trackId === selectedTrackId) return;

    const track = getTrackById(trackId);
    setSelectedTrackId(trackId);
    selectedTrackIdRef.current = trackId;
    setIsMuted(false);
    if (volumeRef.current <= 0) {
      const restored = lastVolumeRef.current || BG_MUSIC_DEFAULT_VOLUME;
      setVolume(restored);
    }
    writeBgMusicStorage(BG_MUSIC_TRACK_STORAGE_KEY, trackId);
    shuffleQueueRef.current = createShuffledQueue(trackId);
    void (async () => {
      await loadTrack(track, { autoplay: true });
      syncPlayingState();
      resetShuffleTimer();
    })();
  };

  const openPanel = () => setIsPanelOpen(true);
  const closePanel = () => setIsPanelOpen(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const onBtnPointerDown = () => {
    didHoldRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      didHoldRef.current = true;
      setMutedState(!isMutedRef.current);
      if (navigator.vibrate) navigator.vibrate(12);
    }, HOLD_MUTE_MS);
  };

  const onBtnClick = () => {
    if (didHoldRef.current) {
      didHoldRef.current = false;
      return;
    }
    if (isPanelOpen) closePanel();
    else openPanel();
  };

  // Keep audio running via hooks above; only hide the control UI.
  if (!isTargetPage || hideControls) return null;

  const trackName = selectedTrack?.label || 'music';
  const statusText = getMusicStatusText({ isMuted, isPlaying, needsGesture, trackName });
  const btnLabel = getMusicButtonLabel({ isMuted, isPlaying, needsGesture, trackName });

  const overlay = createPortal(
    <div
      className={`bgm-overlay${isPanelOpen ? ' is-open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closePanel();
      }}
      aria-hidden={!isPanelOpen}
    >
      <div
        ref={modalRef}
        className={`bgm-modal${isMuted ? ' is-muted' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bgmTitle"
      >
        <div className="bgm-head">
          <h2 className="bgm-eyebrow" id="bgmTitle">Sound</h2>
          <button type="button" className="bgm-close" onClick={closePanel} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={`bgm-master${isMuted ? ' is-muted' : ''}`}>
          <div className="bgm-master-top">
            <button
              ref={speakerRef}
              type="button"
              className={`bgm-speaker${isMuted ? ' is-muted' : ''}`}
              aria-pressed={isMuted}
              aria-label={isMuted ? 'Turn sound on' : 'Mute music'}
              onClick={() => setMutedState(!isMuted)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {isMuted ? ICON_OFF : ICON_ON}
              </svg>
            </button>
            <div className="bgm-master-label">
              <b>Lobby music</b>
              <span>{statusText}</span>
            </div>
            <div className="bgm-pct">{isMuted ? 'Off' : `${volume}%`}</div>
          </div>
          <input
            className="bgm-range"
            type="range"
            min="0"
            max="100"
            value={volume}
            aria-label="Volume"
            style={{ '--pct': `${volume}%` }}
            onChange={(e) => setVolumeState(Number(e.target.value))}
          />
        </div>

        {SHUFFLE_AVAILABLE && (
          <div className="bgm-shuffle">
            <div>
              <b>Auto-shuffle</b>
              <span>Rotate tracks every 30s</span>
            </div>
            <button
              type="button"
              className="bgm-switch"
              role="switch"
              aria-checked={shuffleEnabled}
              aria-label="Auto-shuffle"
              onClick={() => setShuffleEnabledState(!shuffleEnabled)}
            />
          </div>
        )}

        <div className="bgm-shuffle">
          <div>
            <b>Click sounds</b>
            <span>Buttons, tabs, and popups</span>
          </div>
          <button
            type="button"
            className="bgm-switch"
            role="switch"
            aria-checked={clickSoundsOn}
            aria-label="Click sounds"
            onClick={() => {
              const next = !clickSoundsOn;
              setClickSoundsEnabled(next);
              setClickSoundsOn(next);
            }}
          />
        </div>

        <ul className="bgm-list">
          {BG_MUSIC_TRACKS.map((track) => {
            const isActive = track.id === selectedTrackId;
            return (
              <li key={track.id}>
                <button
                  type="button"
                  className="bgm-track"
                  data-id={track.id}
                  aria-current={isActive ? 'true' : 'false'}
                  onClick={() => handleTrackSelect(track.id)}
                >
                  <span>{track.label}</span>
                  <span className="bgm-mini" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="bgm-foot">
          Hold <kbd>the sound button</kbd> to mute instantly
        </p>
      </div>
    </div>,
    document.body,
  );

  const widget = (
    <div className={`bgm-widget${isPanelOpen ? ' is-panel-open' : ''}`}>
      <button
        ref={btnRef}
        type="button"
        className={`bgm-btn${isMuted ? ' is-muted' : ''}${isPanelOpen ? ' is-open' : ''}${needsGesture && !isMuted ? ' is-waiting' : ''}`}
        id="bgmBtn"
        aria-haspopup="dialog"
        aria-expanded={isPanelOpen}
        aria-label={btnLabel}
        title={isMuted ? 'Music muted — open settings' : btnLabel}
        onPointerDown={onBtnPointerDown}
        onPointerUp={clearHoldTimer}
        onPointerLeave={clearHoldTimer}
        onPointerCancel={clearHoldTimer}
        onClick={onBtnClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="bgm-btn__rule" aria-hidden />
        <span className="bgm-btn__icon-wrap">
          {isMuted ? <MusicMutedIcon /> : <MusicNoteIcon />}
        </span>
        <span className="bgm-btn__rule" aria-hidden />
      </button>
    </div>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(widget, document.body) : widget}
      {overlay}
    </>
  );
}
