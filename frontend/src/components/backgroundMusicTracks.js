export const BG_MUSIC_TRACKS = [
  { id: 'bgmusic', label: 'Original', src: '/music/bgmusic.mp3' },
  { id: 'las-vegas', label: 'Las Vegas', src: '/music/deni_martins-las-vegas-481730.mp3' },
  { id: 'vegas-casino', label: 'Vegas Casino', src: '/music/mfcc-las-vegas-las-vegas-casino-music-385955.mp3' },
  { id: 'mafia-jazz', label: 'Mafia Jazz', src: '/music/casino-vip-music-mafia-casino-jazz-2-469343.mp3' },
  { id: 'game-casino', label: 'Game Casino', src: '/music/casino-vip-music-game-casino-music-3-469380.mp3' },
  { id: 'casino-jazz', label: 'Casino Jazz', src: '/music/dpstudiomusic-casino-jazz-317385.mp3' },
  { id: 'funk-casino', label: 'Funk Casino', src: '/music/top-flow-funk-casino-163105.mp3' },
];

export const BG_MUSIC_TRACK_STORAGE_KEY = 'bg_music_track';
export const BG_MUSIC_MUTED_STORAGE_KEY = 'bg_music_muted';
export const BG_MUSIC_SHUFFLE_STORAGE_KEY = 'bg_music_shuffle_enabled';
export const BG_MUSIC_VOLUME_STORAGE_KEY = 'bg_music_volume';

export const BG_MUSIC_SHUFFLE_INTERVAL_MS = 30_000;
export const BG_MUSIC_CROSSFADE_MS = 1_500;
export const BG_MUSIC_DEFAULT_VOLUME = 5;

export function readBgMusicStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeBgMusicStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage unavailable (private mode, quota, etc.) */
  }
}

export function getStoredTrackId() {
  const stored = readBgMusicStorage(BG_MUSIC_TRACK_STORAGE_KEY);
  // Legacy duplicate track removed — map to Game Casino.
  if (stored === 'ambient') return 'game-casino';
  if (stored && BG_MUSIC_TRACKS.some((track) => track.id === stored)) {
    return stored;
  }
  return BG_MUSIC_TRACKS[0].id;
}

export function getStoredMuted() {
  return readBgMusicStorage(BG_MUSIC_MUTED_STORAGE_KEY) === 'true';
}

/** Volume 0–100; falls back to default when missing/invalid. */
export function getStoredVolume() {
  const stored = readBgMusicStorage(BG_MUSIC_VOLUME_STORAGE_KEY);
  if (stored == null) return BG_MUSIC_DEFAULT_VOLUME;
  const n = Number(stored);
  if (!Number.isFinite(n)) return BG_MUSIC_DEFAULT_VOLUME;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Default ON for all users unless they explicitly turn shuffle off. */
export function getStoredShuffleEnabled() {
  const stored = readBgMusicStorage(BG_MUSIC_SHUFFLE_STORAGE_KEY);
  if (stored === 'false') return false;
  return true;
}

export function getTrackById(trackId) {
  return BG_MUSIC_TRACKS.find((track) => track.id === trackId) ?? BG_MUSIC_TRACKS[0];
}

/** Fisher–Yates shuffle; optional excludeId won't appear first (no back-to-back repeat). */
export function createShuffledQueue(excludeTrackId = null) {
  const ids = BG_MUSIC_TRACKS.map((track) => track.id);
  if (ids.length <= 1) return [...ids];

  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (excludeTrackId && shuffled.length > 1 && shuffled[0] === excludeTrackId) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }

  return shuffled;
}

/** Advance within queue or reshuffle when the end is reached. */
export function advanceShuffleQueue(queue, currentTrackId) {
  const safeQueue = Array.isArray(queue) && queue.length > 0 ? queue : createShuffledQueue(currentTrackId);
  const idx = safeQueue.indexOf(currentTrackId);

  if (idx >= 0 && idx < safeQueue.length - 1) {
    return { queue: safeQueue, nextTrackId: safeQueue[idx + 1] };
  }

  const newQueue = createShuffledQueue(currentTrackId);
  return { queue: newQueue, nextTrackId: newQueue[0] };
}
