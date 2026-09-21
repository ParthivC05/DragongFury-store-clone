import { Link } from 'react-router-dom';
import { useLaunchDashboardSlotGame } from '../../hooks/useLaunchDashboardSlotGame';
import { DepositRequiredModal } from '../Games/DepositRequiredModal';
import { HomeCasinoCoverflow } from './HomeCasinoCoverflow';

export function HomeCasinoCategorySlider({ category }) {
  const {
    handlePlayGame,
    launchingGameId,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    activationBonusType,
  } = useLaunchDashboardSlotGame();

  const games = Array.isArray(category?.games) ? category.games : [];
  if (!category?.id || games.length === 0) return null;

  return (
    <section className="dash-home-cat-rail dash-animate-in" aria-label={`${category.label} casino games`}>
      <header className="dash-home-cat-rail-top">
        <h3 className="dash-home-cat-rail-title">
          <span className="dash-home-cat-rail-title-mark" aria-hidden="true" />
          <span className="dash-home-cat-rail-title-text">{category.label}</span>
          <span className="dash-home-cat-rail-title-mark" aria-hidden="true" />
        </h3>
        {category.href ? (
          <Link
            to={category.href}
            className="dash-home-cat-rail-all no-underline"
            aria-label={`See all ${category.label}`}
          >
            See all
            <span className="dash-home-cat-rail-all-arrow" aria-hidden="true">
              ›
            </span>
          </Link>
        ) : null}
      </header>

      <HomeCasinoCoverflow
        games={games}
        onPlay={handlePlayGame}
        playingGameId={launchingGameId}
        label={category.label}
      />

      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </section>
  );
}
