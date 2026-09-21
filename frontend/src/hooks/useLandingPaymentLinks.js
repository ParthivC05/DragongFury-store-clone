import { useEffect, useState } from 'react';
import { getLandingPaymentLinksConfig } from '../api/landingPaymentLinks';

const EMPTY_LINKS = {
  deposit: [],
  withdrawal: [],
  redirectModals: [],
  modalImageUrl: null,
  redirectDelaySeconds: null,
};

export function useLandingPaymentLinks() {
  const [landingPaymentLinks, setLandingPaymentLinks] = useState(EMPTY_LINKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLandingPaymentLinksConfig()
      .then((links) => {
        if (!cancelled) {
          const redirectModals = Array.isArray(links?.redirectModals) ? links.redirectModals : [];
          setLandingPaymentLinks({
            deposit: Array.isArray(links?.deposit) ? links.deposit : [],
            withdrawal: Array.isArray(links?.withdrawal) ? links.withdrawal : [],
            redirectModals,
            modalImageUrl: links?.modalImageUrl || redirectModals[0]?.imageUrl || null,
            redirectDelaySeconds:
              Number.isFinite(Number(links?.redirectDelaySeconds)) &&
              Number(links.redirectDelaySeconds) > 0
                ? Number(links.redirectDelaySeconds)
                : redirectModals[0]?.delaySeconds ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLandingPaymentLinks(EMPTY_LINKS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { landingPaymentLinks, loading };
}
