import { createPortal } from 'react-dom';
import { HomeCasinoCoverflow } from './HomeCasinoCoverflow';
import { DepositRequiredModal } from '../Games/DepositRequiredModal';

function CreateFirekirinAccountModal({ gameTitle, loading, onConfirm, onClose }) {
  const title = String(gameTitle || '').trim();
  const modal = (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center p-4 overflow-y-auto"
      onClick={loading ? undefined : onClose}
      role="presentation"
    >
      <div className="absolute inset-0 gtm-backdrop" aria-hidden />
      <div
        className="gtm-modal gtm-modal--connect gtm-modal-enter relative z-10 w-full max-w-md flex-shrink-0 outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fk-create-account-title"
      >
        <div className="gtm-glow-ring" aria-hidden />
        <div className="gtm-sparkles" aria-hidden>
          <span className="gtm-spark gtm-spark-1">✦</span>
          <span className="gtm-spark gtm-spark-2">★</span>
          <span className="gtm-spark gtm-spark-3">✦</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="gtm-close"
          aria-label="Close"
        >
          ×
        </button>

        <div className="gtm-inner gtm-inner--connect gtm-inner--fk-create">
          <div className="gtm-header">
            <h2 id="fk-create-account-title" className="gtm-title">
              Create a Firekirin account
            </h2>
            <p className="gtm-subtitle">
              {title ? (
                <>
                  You need a Firekirin account to play{' '}
                  <span className="gtm-game-highlight">{title}</span>.
                </>
              ) : (
                <>You need a Firekirin account to play this game.</>
              )}{' '}
              Register in one tap and we&apos;ll open it for you.
            </p>
          </div>

          <div className="gtm-actions gtm-actions--link">
            <button type="button" onClick={onClose} disabled={loading} className="gtm-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="gtm-submit gtm-submit--topup"
            >
              <span className="gtm-submit-shine" aria-hidden />
              <span className="gtm-submit-label">
                {loading ? 'Creating account…' : 'Create account'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export function FirekirinExclusiveSlider({ games, onPlay, playingGameId }) {
  const list = Array.isArray(games) ? games : [];
  if (list.length === 0) return null;

  return (
    <section className="dash-home-cat-rail dash-animate-in" aria-label="Firekirin exclusive games">
      <header className="dash-home-cat-rail-top">
        <h3 className="dash-home-cat-rail-title">
          <span className="dash-home-cat-rail-title-mark" aria-hidden="true" />
          <span className="dash-home-cat-rail-title-text">Firekirin Exclusive</span>
          <span className="dash-home-cat-rail-title-mark" aria-hidden="true" />
        </h3>
      </header>
      <HomeCasinoCoverflow
        games={list}
        onPlay={onPlay}
        playingGameId={playingGameId}
        label="Firekirin Exclusive"
      />
    </section>
  );
}

export function FirekirinExclusiveOverlays({
  createPrompt,
  creatingAccount,
  onCreateAccount,
  onCloseCreatePrompt,
  depositRequiredModalOpen,
  closeDepositRequiredModal,
  activationBonusType,
}) {
  return (
    <>
      {createPrompt ? (
        <CreateFirekirinAccountModal
          gameTitle={createPrompt.title}
          loading={creatingAccount}
          onConfirm={onCreateAccount}
          onClose={onCloseCreatePrompt}
        />
      ) : null}
      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </>
  );
}
