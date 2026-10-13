import { useEffect, useState } from 'react';
import { getCommonPageSeo } from '../api/pageSchema';

function normalizePath(pathname) {
  let path = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path === '/slots') path = '/casino';
  if (path === '/index.html') path = '/';
  return path || '/';
}

export function useSavedPageSeo(pathname) {
  const [pages, setPages] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getCommonPageSeo()
      .then((res) => {
        if (!cancelled) setPages(res?.pages || {});
      })
      .catch(() => {
        if (!cancelled) setPages({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (pages == null) return undefined;
  return pages[normalizePath(pathname)] || null;
}
