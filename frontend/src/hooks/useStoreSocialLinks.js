import { useEffect, useState } from 'react';
import { getSocialLinksConfig } from '../api/socialLinks';
import { STORE_CODE } from '../config/site';

const EMPTY_LINKS = { facebook: '', telegram: '', messenger: '' };

function normalizeLinks(links) {
  return {
    facebook: (links?.facebook || '').trim(),
    telegram: (links?.telegram || '').trim(),
    messenger: (links?.messenger || '').trim(),
  };
}

export function useStoreSocialLinks() {
  const [socialLinks, setSocialLinks] = useState(EMPTY_LINKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function loadSocialLinks({ showLoading = true } = {}) {
      if (showLoading) setLoading(true);
      return getSocialLinksConfig(STORE_CODE)
        .then((links) => {
          if (!cancelled) setSocialLinks(normalizeLinks(links));
        })
        .catch(() => {
          if (!cancelled) setSocialLinks(EMPTY_LINKS);
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    }

    loadSocialLinks();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadSocialLinks({ showLoading: false });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { socialLinks, loading };
}
