/**
 * Live DragonFury UI sounds.
 * click.mp3 on controls, popup.mp3 when a dialog opens.
 * Respects dragonfury:sfx=off and prefers-reduced-motion.
 */

const SOURCES = {
  click: '/media/club-sounds/click.mp3',
  popup: '/media/club-sounds/popup.mp3',
};

const VOLUME = {
  click: 0.55,
  popup: 0.7,
};

const CLICK_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  'summary',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  'a.df-nav-hud__item',
  'a.df-nav-link',
  '.df-desktop-auth-nav a',
  '.df-nav-links a',
  'a.dash-logo',
  '.df-lobby-filter-chip',
  '.df-games-tab',
  '.df-games-view-more',
  '.df-lobby-platform__card',
  '.df-game-card',
  '.filter-chip',
  '.mobile-lobby-nav a',
  '.mobile-lobby-nav button',
  '.header-auth a',
  '.pill-button',
  '.claim-button',
  '.share-button',
  '.lobby-game-card',
  '.game-confirm-button',
  '.lobby-menu-button',
].join(',');

const POPUP_SELECTOR = [
  '[role="dialog"]',
  'dialog[open]',
  '.df-profile-popup',
  '.secure-payment-modal',
  '.df-promo-modal',
  '.dragonfury-auth-card',
  '.dragonfury-chat__panel',
  '.game-sheet__panel',
].join(',');

const audioElements = new Map();
const gains = new Map();
const buffers = new Map();
let audioContext = null;
let armed = false;

export function areClickSoundsEnabled() {
  try {
    return window.localStorage.getItem('dragonfury:sfx') !== 'off';
  } catch {
    return true;
  }
}

export function setClickSoundsEnabled(enabled) {
  try {
    window.localStorage.setItem('dragonfury:sfx', enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function soundsEnabled() {
  if (!areClickSoundsEnabled()) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function elementAudio(name) {
  let audio = audioElements.get(name);
  if (!audio) {
    audio = new Audio(SOURCES[name]);
    audio.preload = 'auto';
    audio.volume = VOLUME[name];
    audioElements.set(name, audio);
  }
  return audio;
}

function gainFor(name) {
  let gain = gains.get(name);
  if (!gain && audioContext) {
    gain = audioContext.createGain();
    gain.gain.value = VOLUME[name];
    gain.connect(audioContext.destination);
    gains.set(name, gain);
  }
  return gain;
}

function playElement(name) {
  try {
    const audio = elementAudio(name);
    audio.currentTime = 0;
    audio.play()?.catch(() => {});
  } catch {
    /* ignore autoplay rejection */
  }
}

function playBuffer(name) {
  const buffer = buffers.get(name);
  if (!audioContext || !buffer || audioContext.state !== 'running') return false;
  try {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gainFor(name));
    source.onended = () => source.disconnect();
    source.start();
    return true;
  } catch {
    return false;
  }
}

function play(name) {
  if (!armed || !soundsEnabled()) return;
  if (!playBuffer(name)) playElement(name);
}

function isDisabled(node) {
  return Boolean(
    node.disabled ||
      node.getAttribute?.('aria-disabled') === 'true' ||
      node.closest?.('[disabled], [aria-disabled="true"]')
  );
}

function arm() {
  if (armed) return;
  armed = true;
  elementAudio('click');
  elementAudio('popup');
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    audioContext = new Ctx();
    audioContext.resume().catch(() => {});
    gainFor('click');
    gainFor('popup');
    Object.keys(SOURCES).forEach((name) => {
      fetch(SOURCES[name])
        .then((res) => res.arrayBuffer())
        .then((data) => audioContext.decodeAudioData(data))
        .then((buffer) => buffers.set(name, buffer))
        .catch(() => {});
    });
  } catch {
    audioContext = null;
  }
}

export function startClubClickSounds() {
  if (typeof window === 'undefined' || window.__dfClubSounds) return;
  window.__dfClubSounds = true;

  window.addEventListener('pointerdown', arm, { once: true, passive: true, capture: true });
  window.addEventListener('keydown', arm, { once: true, passive: true, capture: true });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button != null && event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(CLICK_SELECTOR);
      if (!control || isDisabled(control)) return;
      play('click');
    },
    { passive: true, capture: true }
  );

  const seenPopups = new WeakSet();
  const watch = new MutationObserver((records) => {
    if (!armed || !soundsEnabled()) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const popup = node.matches(POPUP_SELECTOR) ? node : node.querySelector(POPUP_SELECTOR);
        if (!popup || seenPopups.has(popup)) continue;
        seenPopups.add(popup);
        play('popup');
        return;
      }
    }
  });

  const observe = () => {
    if (document.body) watch.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) observe();
  else document.addEventListener('DOMContentLoaded', observe, { once: true });
}
