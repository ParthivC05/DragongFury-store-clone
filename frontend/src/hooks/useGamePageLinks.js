import { useEffect, useState } from 'react';
import { getGamePages } from '../api/gamePages';
import { STORE_CODE } from '../config/site';

const ENABLED = String(STORE_CODE || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') === 'dragonfury';

/** Active /games pages for the site footer. Empty when this store has no game pages. */
export function useGamePageLinks() {
  const [links, setLinks] = useState([]);

  useEffect(() => {
    if (!ENABLED) return undefined;
    let cancelled = false;
    getGamePages()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.game_pages) ? res.game_pages : [];
        setLinks(list.map((page) => ({
          to: `/games/${page.slug}`,
          label: page.name,
          key: page.slug
        })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return links;
}
