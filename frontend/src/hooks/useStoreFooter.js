import { useEffect, useState } from 'react';
import { getFooterMenus } from '../api/footer';
import { STORE_CODE } from '../config/site';

/**
 * Load storefront footer menus/pages for VITE_STORE_CODE.
 * showDefaultMenus defaults to true when unset.
 */
export function useStoreFooter() {
  const [menus, setMenus] = useState([]);
  const [showDefaultMenus, setShowDefaultMenus] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load({ showLoading = true } = {}) {
      if (showLoading) setLoading(true);
      return getFooterMenus({ store_code: STORE_CODE })
        .then((res) => {
          if (cancelled) return;
          const list = Array.isArray(res?.footer_menus) ? res.footer_menus : [];
          setMenus(list.filter((m) => m && (m.pages?.length > 0 || m.label)));
          setShowDefaultMenus(res?.show_default_menus !== false);
        })
        .catch(() => {
          if (!cancelled) {
            setMenus([]);
            setShowDefaultMenus(true);
          }
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    }

    load();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        load({ showLoading: false });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { menus, showDefaultMenus, loading };
}
