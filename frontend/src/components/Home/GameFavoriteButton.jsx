import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { favoriteUserId, useGameFavorites } from '../../utils/gameFavorites';

export function GameFavoriteButton({ id, name, className }) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const userId = favoriteUserId(user);
  const { isFavorite, toggle } = useGameFavorites(userId);

  if (!isAuthenticated || !id || !userId) return null;

  const liked = isFavorite(id);
  const label = liked ? `Remove ${name} from favorites` : `Add ${name} to favorites`;

  return (
    <button
      type="button"
      className={`${className}${liked ? ' is-on' : ''}`}
      aria-label={label}
      aria-pressed={liked}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const added = toggle(id);
        toast.success(added ? `${name} added to favorites.` : `${name} removed from favorites.`);
      }}
    />
  );
}
