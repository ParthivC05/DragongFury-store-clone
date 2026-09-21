import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';
import { STORE_CODE } from '../config/site';

const BASE = `${API_BASE}/api/landing-payment-links`;

function normalizeRedirectModals(links) {
  const raw = links?.redirectModals ?? links?.redirect_modals;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((modal) => {
        const imageUrl = String(
          modal?.imageUrl ?? modal?.image_url ?? modal?.modalImageUrl ?? '',
        ).trim();
        const delay = Number(
          modal?.delaySeconds ?? modal?.delay_seconds ?? modal?.redirectDelaySeconds,
        );
        if (!imageUrl || !Number.isFinite(delay) || delay <= 0) return null;
        return { imageUrl, delaySeconds: delay };
      })
      .filter(Boolean);
  }
  const imageRaw = links?.modalImageUrl ?? links?.modal_image_url;
  const imageUrl = typeof imageRaw === 'string' ? imageRaw.trim() : '';
  const delay = Number(links?.redirectDelaySeconds ?? links?.redirect_delay_seconds);
  if (imageUrl && Number.isFinite(delay) && delay > 0) {
    return [{ imageUrl, delaySeconds: delay }];
  }
  return [];
}

/** Public landing-page deposit/withdrawal links for the current store build. */
export function getLandingPaymentLinksConfig(storeCode = STORE_CODE) {
  const query = storeCode ? { store_code: storeCode } : undefined;
  return getRequest(`${BASE}/config`, query).then((res) => {
    const links = res?.landingPaymentLinks ?? res;
    const redirectModals = normalizeRedirectModals(links);
    return {
      deposit: Array.isArray(links?.deposit) ? links.deposit : [],
      withdrawal: Array.isArray(links?.withdrawal) ? links.withdrawal : [],
      redirectModals,
      modalImageUrl: redirectModals[0]?.imageUrl ?? null,
      redirectDelaySeconds: redirectModals[0]?.delaySeconds ?? null,
    };
  });
}
