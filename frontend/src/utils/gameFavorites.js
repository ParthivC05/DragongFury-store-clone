import { useCallback, useEffect, useState } from 'react';

const EVENT = 'df-game-favorites';
const listeners = new Set();

function storageKey(userId) {
  return `dragonfury_${userId || 'local'}_favorite_games`;
}

export function favoriteUserId(user) {
  return user?.id || user?.userId || user?.email || null;
}

export function platformFavoriteId(game) {
  const id = game?.id ?? game?.gameKey ?? game?.slug ?? game?.name;
  if (id == null || id === '') return null;
  return `platform:${id}`;
}

export function slotFavoriteId(game) {
  const id = game?.id ?? game?.gameid ?? game?.gameId ?? game?.title;
  if (id == null || id === '') return null;
  return `slot:${id}`;
}

export function readFavorites(userId) {
  if (!userId || typeof localStorage === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavorites(userId, ids) {
  localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  listeners.forEach((fn) => fn());
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** @returns {boolean} true when the game was added */
export function toggleFavorite(userId, id) {
  if (!userId || !id) return false;
  const current = readFavorites(userId);
  const has = current.includes(id);
  writeFavorites(userId, has ? current.filter((item) => item !== id) : [...current, id]);
  return !has;
}

export function useGameFavorites(userId) {
  const [ids, setIds] = useState(() => readFavorites(userId));

  useEffect(() => {
    const sync = () => setIds(readFavorites(userId));
    sync();
    listeners.add(sync);
    const onStorage = (event) => {
      if (!event.key || event.key === storageKey(userId)) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const isFavorite = useCallback((id) => Boolean(id && ids.includes(id)), [ids]);
  const toggle = useCallback((id) => toggleFavorite(userId, id), [userId]);

  return { ids, isFavorite, toggle };
}
