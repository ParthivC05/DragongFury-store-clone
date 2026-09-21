import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { claimOffer, getClaimPreview } from '../../api/emailCampaigns';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { STORE_CODE } from '../../config/site';
import './ClaimOffer.css';

export function ClaimOffer() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState(null);
  const [fatal, setFatal] = useState(null);

  const isPlayjuwa = String(STORE_CODE || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'dragonfury';

  usePageContentReady(!loading || !isPlayjuwa);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !isPlayjuwa) {
        setLoading(false);
        return;
      }
      try {
        const data = await getClaimPreview(token);
        if (!cancelled) {
          setPreview(data);
          setFatal(null);
        }
      } catch (err) {
        if (!cancelled) {
          setFatal(err.message || 'This claim link is invalid or has already been used.');
          toast.error(err.message || 'Offer not found.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isPlayjuwa, toast]);

  const onClaim = async () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/claim-offer?token=${token}`)}`);
      return;
    }
    setClaiming(true);
    try {
      const data = await claimOffer(token);
      setResult(data);
      toast.success(data?.message || 'Offer claimed.');
    } catch (err) {
      setFatal(err.message || 'Claim failed.');
      toast.error(err.message || 'Claim failed.');
    } finally {
      setClaiming(false);
    }
  };

  if (!isPlayjuwa) {
    return (
      <div className="dash-page claim-offer-page">
        <p className="claim-offer-muted">This offer is not available on this site.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dash-page claim-offer-page">
        <p className="claim-offer-muted">Loading offer…</p>
      </div>
    );
  }

  return (
    <div className="dash-page claim-offer-page">
      <div className="claim-offer-shell">
        <div className="claim-offer-glow" aria-hidden />
        <div className="claim-offer-card">
          <span className="claim-offer-badge">{result ? 'Claimed' : fatal ? 'Unavailable' : 'Exclusive offer'}</span>
          <h1 className="claim-offer-title">Claim your offer</h1>
          <p className="claim-offer-lead">
            One-time link for the account that got the email. After claiming, open Deposit and apply
            your code — it <strong>reduces what you pay</strong> on any package or amount (SC credit
            stays full).
          </p>

          {fatal && !result ? (
            <div className="claim-offer-status claim-offer-status--error">
              <p>{fatal}</p>
              <Link className="claim-offer-cta" to="/deposit">
                Go to Deposit
              </Link>
            </div>
          ) : (
            <>
              {preview && !result && (
                <div className="claim-offer-meta">
                  <div className="claim-offer-meta-row">
                    <span>Status</span>
                    <strong className="claim-offer-pill">{preview.claimStatus || preview.status}</strong>
                  </div>
                  {preview.email && (
                    <div className="claim-offer-meta-row">
                      <span>Offer sent to</span>
                      <strong>{preview.email}</strong>
                    </div>
                  )}
                  {user?.email && (
                    <div className="claim-offer-meta-row">
                      <span>Signed in as</span>
                      <strong>{user.email}</strong>
                    </div>
                  )}
                </div>
              )}

              {result ? (
                <div className="claim-offer-success">
                  <div className="claim-offer-success-icon" aria-hidden>
                    ✓
                  </div>
                  <p className="claim-offer-success-msg">{result.message}</p>
                  {result.discountCode && (
                    <div className="claim-offer-code-block">
                      <span className="claim-offer-code-label">Your code</span>
                      <code className="claim-offer-code">{result.discountCode}</code>
                    </div>
                  )}
                  <p className="claim-offer-hint">
                    Your offer lowers the <strong>pay amount</strong> on any package or custom amount.
                    You still receive full SC.
                  </p>
                  <Link className="claim-offer-cta" to="/deposit?offerCode=1">
                    Go to Deposit → Apply code
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  className="claim-offer-cta claim-offer-cta--btn"
                  disabled={claiming || !token}
                  onClick={onClaim}
                >
                  {claiming ? 'Claiming…' : isAuthenticated ? 'Claim offer' : 'Sign in to claim'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClaimOffer;
