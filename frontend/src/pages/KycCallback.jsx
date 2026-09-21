import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as kycApi from '../api/kyc';
import { usePageContentReady } from '../context/PageReadyContext';

/**
 * Didit redirects here after verification (used inside KYC iframe).
 * Notifies the parent window and shows a short confirmation.
 */
export function KycCallback() {
  const [searchParams] = useSearchParams();
  usePageContentReady(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let approved = false;
      let declined = false;
      let inReview = false;
      try {
        const res = await kycApi.getKycStatus({ refresh: '1' });
        if (cancelled) return;
        approved = Boolean(res?.approved || res?.kycStatus === 'approved');
        declined = res?.kycStatus === 'declined';
        inReview = res?.kycStatus === 'in_review';
      } catch {
        /* parent poll will catch up */
      }

      const payload = {
        type: 'KYC_COMPLETE',
        approved,
        declined,
        inReview,
        query: Object.fromEntries(searchParams.entries())
      };

      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(payload, window.location.origin);
        }
      } catch {
        /* ignore */
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: '#0f1419',
        color: '#e7e9ea',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center'
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Verification submitted
        </h1>
        <p style={{ color: '#8b98a5', margin: 0 }}>
          You can close this window. We’ll update your withdraw status automatically.
        </p>
      </div>
    </div>
  );
}
