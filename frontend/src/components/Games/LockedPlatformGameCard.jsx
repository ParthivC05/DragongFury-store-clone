import { useLocation, useNavigate } from 'react-router-dom';
import { AccountIcon, CopyIcon, LockIcon } from '../../assets/icons';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { GameImage } from './GameImage';

const MASKED = '*******';

/**
 * Guest-only preview of a platform game card: real game art/name, locked dummy credentials.
 * Responsive: stacked mobile layout, horizontal desktop row.
 */
export function LockedPlatformGameCard({ game }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const displayName = getGameDisplayName(game) || 'Game';

  function goSignup() {
    navigate(signupTo);
  }

  return (
    <article className="dash-locked-card" aria-label={`${displayName} — locked, sign up to play`}>
      <div className="dash-locked-card-inner">
        <div className="dash-locked-card-thumb-wrap">
          <GameImage game={game} className="dash-locked-card-thumb" />
          <span className="dash-locked-card-thumb-lock" aria-hidden>
            <LockIcon className="dash-locked-card-thumb-lock-icon" />
          </span>
        </div>

        <div className="dash-locked-card-info">
          <div className="dash-locked-card-titles">
            <h3 className="dash-locked-card-title">{displayName}</h3>
            <p className="dash-locked-card-sub">Sign up &amp; Play</p>
          </div>

          <div className="dash-locked-card-creds">
            <div className="dash-locked-card-cred-row">
              <AccountIcon className="dash-locked-card-cred-icon" aria-hidden />
              <span className="dash-locked-card-cred-label">Username</span>
              <span className="dash-locked-card-cred-value" aria-hidden>
                {MASKED}
              </span>
              <button
                type="button"
                className="dash-locked-card-icon-btn"
                onClick={goSignup}
                title="Sign up to unlock"
                aria-label={`Sign up to unlock ${displayName} username`}
              >
                <CopyIcon className="dash-locked-card-copy-icon" />
              </button>
            </div>

            <div className="dash-locked-card-cred-divider" aria-hidden />

            <div className="dash-locked-card-cred-row">
              <LockIcon className="dash-locked-card-cred-icon" aria-hidden />
              <span className="dash-locked-card-cred-label">Password</span>
              <span className="dash-locked-card-cred-value" aria-hidden>
                {MASKED}
              </span>
              <button
                type="button"
                className="dash-locked-card-icon-btn"
                onClick={goSignup}
                title="Sign up to unlock"
                aria-label={`Sign up to unlock ${displayName} password`}
              >
                <CopyIcon className="dash-locked-card-copy-icon" />
              </button>
            </div>
          </div>
        </div>

        <div className="dash-locked-card-actions">
          <button type="button" className="dash-locked-card-btn dash-locked-card-btn-signup" onClick={goSignup}>
            Sign up
          </button>
          <button
            type="button"
            className="dash-locked-card-btn dash-locked-card-btn-play"
            onClick={goSignup}
            aria-label={`Sign up to play ${displayName}`}
          >
            Play
          </button>
        </div>

        <LockIcon className="dash-locked-card-corner-lock" aria-hidden />
      </div>
    </article>
  );
}

export function LockedPlatformGameCardSkeleton({ count = 6 }) {
  return (
    <div className="dash-locked-list" aria-busy="true" aria-label="Loading platforms">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="dash-locked-card dash-locked-card--skeleton"
          style={{ '--dash-skel-delay': `${i * 0.05}s` }}
          aria-hidden
        />
      ))}
    </div>
  );
}
