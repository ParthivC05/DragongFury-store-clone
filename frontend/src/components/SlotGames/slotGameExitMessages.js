'use strict';

/** Known GitSlotPark / provider iframe host suffixes for postMessage origin checks. */
const TRUSTED_GAME_ORIGIN_SUFFIXES = [
  '.slotgamesapi.com',
  '.amaticgame.net',
  '.gitamus.net',
  '.amusnet.com',
  '.amusnetgaming.com',
  '.nntqyrilttw.com'
];

const EXIT_STRINGS = new Set(['exit', 'lobby', 'close', 'home', 'quit']);

function readExitToken(data) {
  if (typeof data === 'string') {
    return data.trim().toLowerCase();
  }

  if (!data || typeof data !== 'object') {
    return '';
  }

  if (typeof data.command === 'string') {
    return data.command.trim().toLowerCase();
  }

  const candidate = data.type || data.event || data.action || data.method || data.name;
  return typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
}

/**
 * Detect provider exit/home signals sent from an embedded game iframe.
 * Amusnet/EGT uses { command: 'com.egt-bg.exit' } per their integration guide.
 */
export function isSlotGameExitMessage(data) {
  const token = readExitToken(data);
  if (!token) return false;

  if (token === 'com.egt-bg.exit') return true;
  if (EXIT_STRINGS.has(token)) return true;
  if (token.endsWith('.exit')) return true;

  return false;
}

export function isTrustedGameMessageOrigin(origin, gameUrl) {
  if (!origin || origin === 'null') return false;

  if (gameUrl) {
    try {
      const launchOrigin = new URL(gameUrl).origin;
      if (origin === launchOrigin) return true;
    } catch {
      // ignore invalid launch URL
    }
  }

  return TRUSTED_GAME_ORIGIN_SUFFIXES.some((suffix) => origin.endsWith(suffix));
}

export function isMessageFromGameFrame(event, iframeEl) {
  if (!event || !iframeEl?.contentWindow) return false;

  if (event.source === iframeEl.contentWindow) return true;

  // Nested provider iframes post from a different Window; fall back to origin check.
  return isTrustedGameMessageOrigin(event.origin, iframeEl.src);
}
