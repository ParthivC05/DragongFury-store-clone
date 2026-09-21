import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { PaymentAccountSection } from '../../components/PaymentAccount/PaymentAccountSection';

export function AccountProfile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  usePageContentReady(!!user);

  const returnLabel = returnTo === 'withdraw' ? 'withdraw' : returnTo === 'deposit' ? 'deposit' : null;
  const backPath = returnTo === 'withdraw' ? '/withdraw' : '/deposit';
  const backLabel = returnTo === 'withdraw' ? 'Withdraw' : 'Deposit';

  return (
    <div className="dash-page w-full min-w-0 max-w-full">
      <header className="dash-payment-page-header dash-animate-in">
        <div className="dash-payment-page-header-row">
          <h1 className="dash-deposit-title dash-payment-page-title">Link Payment Account</h1>
          {returnLabel && (
            <Link
              to={backPath}
              aria-label={`Back to ${backLabel}`}
              className="dash-btn-outline dash-payment-page-back no-underline"
            >
              <span className="dash-payment-page-back-short">← Back</span>
              <span className="dash-payment-page-back-long">← Back to {backLabel}</span>
            </Link>
          )}
        </div>
        <p className="dash-deposit-sub dash-payment-page-sub">
          {returnLabel
            ? `Connect your payment login to continue to ${returnLabel}.`
            : 'Connect your Orionstars payment login to deposit and withdraw.'}
        </p>
      </header>

      <PaymentAccountSection
        user={user}
        refreshUser={refreshUser}
        toast={toast}
        returnTo={returnTo}
      />

      <p className="dash-field-hint mt-4 text-center">
        Need to update your name or personal details?{' '}
        <button
          type="button"
          onClick={() => navigate(`/settings${returnTo ? `?returnTo=${returnTo}` : ''}`)}
          className="text-[var(--dash-teal)] underline bg-transparent border-0 p-0 cursor-pointer font-inherit"
        >
          Go to Settings
        </button>
      </p>
    </div>
  );
}
