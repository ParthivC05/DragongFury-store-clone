import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { GameImage } from '../Games/GameImage';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { platformFavoriteId } from '../../utils/gameFavorites';
import { GameFavoriteButton } from './GameFavoriteButton';
import { PlatformAccountSheet } from './PlatformAccountSheet';

/**
 * Live lobby “Try Other Games” platform tile.
 * Portrait art + ACTIVATE below + title below — not landing circles,
 * and not full-bleed overlay cards.
 */
export function LobbyPlatformTile({
  game,
  onRegistered,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenPlay,
  balanceSc,
  paidSc,
  onWalletRefresh,
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const name = getGameDisplayName(game);
  const hasAccount = Boolean(game?.has_account && game?.account_status === 'approved');
  const isPending =
    Boolean(game?.has_account && game?.account_status === 'pending') ||
    Boolean(game?.register_pending);
  const canRegister = Number.isFinite(Number(game?.id)) && Number(game.id) > 0;

  function handleCardClick() {
    if (!canRegister && !hasAccount && !isPending) {
      toast.error('This platform is not available yet.');
      return;
    }
    setSheetOpen((open) => !open);
  }

  return (
    <article className="df-lobby-platform">
      <button
        type="button"
        className="df-lobby-platform__card"
        data-game-name={name}
        aria-label={`${name}${hasAccount ? '' : ' — Activate'}`}
        aria-expanded={sheetOpen}
        onClick={handleCardClick}
        disabled={loading}
      >
        <span className="df-lobby-platform__art-wrap">
          <GameImage
            game={game}
            className="df-lobby-platform__art"
            fetchPriority="high"
            width={112}
            height={151}
          />
          {game?.isNew ? <span className="df-lobby-platform__new">NEW</span> : null}
        </span>
        <span
          className={`df-lobby-platform__badge${hasAccount ? ' df-lobby-platform__badge--active' : ''}${isPending ? ' df-lobby-platform__badge--pending' : ''}`}
        >
          {loading ? '…' : hasAccount ? 'ACTIVE' : isPending ? 'PENDING' : 'Activate'}
        </span>
        <span className="df-lobby-platform__title">{name}</span>
      </button>
      <GameFavoriteButton
        id={platformFavoriteId(game)}
        name={name}
        className="df-lobby-platform__fav"
      />
      {sheetOpen ? (
        <PlatformAccountSheet
          game={game}
          balanceSc={balanceSc}
          paidSc={paidSc}
          onClose={() => setSheetOpen(false)}
          onRegistered={onRegistered}
          onWalletRefresh={onWalletRefresh}
        />
      ) : null}
    </article>
  );
}
