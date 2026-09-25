import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import * as gamesApi from '../../api/games';
import { GameImage } from '../Games/GameImage';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { platformFavoriteId } from '../../utils/gameFavorites';
import { GameFavoriteButton } from './GameFavoriteButton';

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
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const name = getGameDisplayName(game);
  const hasAccount = Boolean(game?.has_account && game?.account_status === 'approved');
  const isPending =
    Boolean(game?.has_account && game?.account_status === 'pending') ||
    Boolean(game?.register_pending);
  const canRegister = Number.isFinite(Number(game?.id)) && Number(game.id) > 0;

  async function handleActivate(e) {
    e?.stopPropagation?.();
    if (loading) return;
    if (hasAccount) {
      onOpenPlay?.(game);
      return;
    }
    if (isPending) {
      toast.success('Your request is still pending.');
      return;
    }
    if (!canRegister) {
      toast.error('This platform is not available yet.');
      return;
    }
    setLoading(true);
    try {
      const resp = await gamesApi.registerGameAccount(game.id);
      if (resp?.pending) {
        toast.success(resp.message || "We're on it. You'll see your game login once it's ready.");
      } else {
        toast.success(resp?.message || 'Account created successfully');
      }
      window.dispatchEvent(new CustomEvent('onboarding:game-registered'));
      onRegistered?.();
    } catch (err) {
      const msg = typeof err?.message === 'string' ? err.message.trim() : '';
      toast.error(msg || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="df-lobby-platform">
      <button
        type="button"
        className="df-lobby-platform__card"
        data-game-name={name}
        aria-label={`${name}${hasAccount ? '' : ' — Activate'}`}
        onClick={handleActivate}
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
          {loading ? '…' : hasAccount ? 'PLAY' : isPending ? 'PENDING' : 'ACTIVATE'}
        </span>
        <span className="df-lobby-platform__title">{name}</span>
      </button>
      <GameFavoriteButton
        id={platformFavoriteId(game)}
        name={name}
        className="df-lobby-platform__fav"
      />
      {hasAccount ? (
        <div className="df-lobby-platform__actions">
          <button type="button" className="df-lobby-platform__link" onClick={() => onOpenDeposit?.(game)}>
            Transfer
          </button>
          <button type="button" className="df-lobby-platform__link" onClick={() => onOpenWithdraw?.(game)}>
            Redeem
          </button>
        </div>
      ) : null}
    </article>
  );
}
