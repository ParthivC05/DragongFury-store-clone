import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import * as gitslotparkApi from '../../api/gitslotpark';
import { SlotGameCard } from '../../components/SlotGames/SlotGameCard';
import { SlotGameCardSkeleton } from '../../components/SlotGames/SlotGameCardSkeleton';
import { DepositRequiredModal } from '../../components/Games/DepositRequiredModal';
import { useDepositRequiredGate } from '../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../utils/depositRequired';

const SKELETON_COUNT = 12;

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function getInitialProvider(fixedProvider) {
  if (fixedProvider) {
    return gitslotparkApi.normalizeGitslotparkProvider(fixedProvider);
  }
  const configured = gitslotparkApi.listConfiguredGitslotparkProviders();
  return configured[0] || 'pragmatic';
}

function getPageCopy(fixedProvider, providerLabel) {
  if (fixedProvider === 'pgsoft') {
    return {
      title: 'PG Soft Games',
      subtitle: 'Browse and play PG Soft casino titles.',
      loadedSubtitle: (count) => `${count} PG Soft titles — pick a game and play.`
    };
  }

  if (fixedProvider === 'pragmatic') {
    return {
      title: 'Pragmatic Play',
      subtitle: 'Browse and play Pragmatic Play casino titles.',
      loadedSubtitle: (count) => `${count} Pragmatic Play titles — pick a game and play.`
    };
  }

  if (fixedProvider === 'amatic') {
    return {
      title: 'Amatic Games',
      subtitle: 'Browse and play Amatic casino titles.',
      loadedSubtitle: (count) => `${count} Amatic titles — pick a game and play.`
    };
  }

  if (fixedProvider === 'amusnet') {
    return {
      title: 'Amusnet Games',
      subtitle: 'Browse and play Amusnet casino titles.',
      loadedSubtitle: (count) => `${count} Amusnet titles — pick a game and play.`
    };
  }

  return {
    title: 'Casino Games',
    subtitle: 'Browse our full casino catalog from top providers.',
    loadedSubtitle: (count) => `${count} ${providerLabel} titles — pick a game and play.`
  };
}

export function SlotGames({ fixedProvider } = {}) {
  const lockedProvider = fixedProvider
    ? gitslotparkApi.normalizeGitslotparkProvider(fixedProvider)
    : null;
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const {
    requireDeposit,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
  } = useDepositRequiredGate({ enabled: isAuthenticated });
  const navigate = useNavigate();
  const location = useLocation();
  const providerOptions = useMemo(() => gitslotparkApi.GIT_SLOTPARK_PROVIDERS, []);
  const [provider, setProvider] = useState(() => getInitialProvider(lockedProvider));
  const activeProvider = lockedProvider || provider;
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState(null);

  const providerLabel = useMemo(
    () => gitslotparkApi.getGitslotparkProviderMeta(activeProvider).label,
    [activeProvider]
  );
  const pageCopy = useMemo(
    () => getPageCopy(lockedProvider, providerLabel),
    [lockedProvider, providerLabel]
  );

  const loadGames = useCallback(async () => {
    if (!gitslotparkApi.isGitslotparkConfigured(activeProvider)) {
      setGames([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await gitslotparkApi.getSlotGames(activeProvider);
      const list = Array.isArray(res?.games) ? res.games : [];
      setGames(list);
    } catch (e) {
      toast.error(e.message || `Unable to load ${providerLabel} games. Please try again later.`);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [activeProvider, providerLabel, toast]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    setSearch('');
    setVendorFilter('all');
  }, [activeProvider]);

  const vendors = useMemo(() => {
    const set = new Set();
    for (const game of games) {
      const vendor = String(game.vendorid || '').trim();
      if (vendor) set.add(vendor);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [games]);

  const filteredGames = useMemo(() => {
    const q = normalizeSearch(search);
    return games.filter((game) => {
      const vendor = String(game.vendorid || '').trim();
      if (vendorFilter !== 'all' && vendor !== vendorFilter) return false;
      if (!q) return true;
      const name = normalizeSearch(game.name);
      const symbol = normalizeSearch(game.symbol);
      return name.includes(q) || symbol.includes(q) || normalizeSearch(vendor).includes(q);
    });
  }, [games, search, vendorFilter]);

  const handlePlayGame = useCallback(async (game) => {
    if (!game?.gameid || launchLoading) return;

    if (!isAuthenticated) {
      navigate('/register', { state: { from: location.pathname } });
      return;
    }

    requireDeposit(async () => {
      setLaunchLoading(true);
      setLaunchingGameId(game.gameid);

      try {
        if (gitslotparkApi.getGitslotparkLaunchMode() === 'tab') {
          const res = await gitslotparkApi.launchSlotGame(game.gameid, activeProvider);
          const url = res?.url ? String(res.url).trim() : '';
          if (!url) {
            throw new Error('Game launch URL not returned');
          }
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }

        navigate(
          `/play/${encodeURIComponent(game.gameid)}`,
          {
            state: {
              provider: activeProvider,
              name: game.name || 'Casino game',
              returnTo: location.pathname
            }
          }
        );
      } catch (e) {
        if (isDepositRequiredError(e)) {
          openDepositRequiredModal();
        } else {
          toast.error(e.message || 'Unable to launch this game. Please try again.');
        }
      } finally {
        setLaunchLoading(false);
        setLaunchingGameId(null);
      }
    });
  }, [
    activeProvider,
    isAuthenticated,
    launchLoading,
    location.pathname,
    navigate,
    openDepositRequiredModal,
    requireDeposit,
    toast,
  ]);

  if (loading && games.length === 0) {
    return (
      <div className="dash-page dash-slot-games-page w-full min-w-0">
        <header className="dash-deposit-header dash-animate-in">
          <h1 className="dash-deposit-title">{pageCopy.title}</h1>
          <p className="dash-deposit-sub">{pageCopy.subtitle}</p>
        </header>
        {!lockedProvider ? (
          <div className="dash-slot-games-providers dash-slot-games-providers--skeleton" aria-hidden>
            <div className="dash-skeleton-line dash-skeleton-line-md" />
          </div>
        ) : null}
        <div className="dash-slot-games-toolbar dash-slot-games-toolbar--skeleton" aria-hidden>
          <div className="dash-skeleton-line dash-skeleton-line-lg" />
          <div className="dash-skeleton-line dash-skeleton-line-md" />
        </div>
        <div className="dash-slot-games-grid" aria-busy="true" aria-label="Loading casino games">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <SlotGameCardSkeleton key={`sk-${i}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page dash-slot-games-page w-full min-w-0">
      <header className="dash-deposit-header dash-animate-in">
        <h1 className="dash-deposit-title">{pageCopy.title}</h1>
        <p className="dash-deposit-sub">
          {games.length > 0
            ? pageCopy.loadedSubtitle(games.length)
            : pageCopy.subtitle}
        </p>
      </header>

      {!lockedProvider ? (
        <div className="dash-slot-games-providers dash-animate-in" role="tablist" aria-label="Select game provider">
          {providerOptions.map((providerId) => {
            const meta = gitslotparkApi.getGitslotparkProviderMeta(providerId);
            return (
              <button
                key={providerId}
                type="button"
                role="tab"
                aria-selected={activeProvider === providerId}
                className={`dash-slot-games-provider-chip${activeProvider === providerId ? ' active' : ''}`}
                onClick={() => setProvider(providerId)}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="dash-slot-games-toolbar dash-animate-in dash-delay-1">
        <label className="dash-slot-games-search-wrap">
          <input
            type="search"
            className="dash-slot-games-search"
            placeholder="Search by name or provider…"
            aria-label="Search casino games"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>

        {vendors.length > 1 ? (
          <div className="dash-slot-games-vendors" role="tablist" aria-label="Filter by vendor">
            <button
              type="button"
              role="tab"
              aria-selected={vendorFilter === 'all'}
              className={`dash-slot-games-vendor-chip${vendorFilter === 'all' ? ' active' : ''}`}
              onClick={() => setVendorFilter('all')}
            >
              All
              <span className="dash-slot-games-vendor-count">{games.length}</span>
            </button>
            {vendors.map((vendor) => {
              const count = games.filter((g) => g.vendorid === vendor).length;
              return (
                <button
                  key={vendor}
                  type="button"
                  role="tab"
                  aria-selected={vendorFilter === vendor}
                  className={`dash-slot-games-vendor-chip${vendorFilter === vendor ? ' active' : ''}`}
                  onClick={() => setVendorFilter(vendor)}
                >
                  {vendor}
                  <span className="dash-slot-games-vendor-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {!loading && !gitslotparkApi.isGitslotparkConfigured(activeProvider) ? (
        <div className="dash-games-empty dash-animate-in">
          <span className="dash-games-empty-icon" aria-hidden>⚙️</span>
          <p className="dash-games-empty-title">{providerLabel} is not configured</p>
          <p className="dash-games-empty-sub">Add the GitSlotPark credentials for this provider in your environment.</p>
        </div>
      ) : !loading && games.length === 0 ? (
        <div className="dash-games-empty dash-animate-in">
          <span className="dash-games-empty-icon" aria-hidden>🎰</span>
          <p className="dash-games-empty-title">No casino games available</p>
          <p className="dash-games-empty-sub">Check back soon or contact support if this persists.</p>
          <button type="button" className="dash-slot-games-retry-btn" onClick={loadGames}>
            Try again
          </button>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="dash-games-empty dash-animate-in">
          <span className="dash-games-empty-icon" aria-hidden>🔍</span>
          <p className="dash-games-empty-title">No matches</p>
          <p className="dash-games-empty-sub">Try a different search or clear your filters.</p>
          <button
            type="button"
            className="dash-slot-games-retry-btn"
            onClick={() => {
              setSearch('');
              setVendorFilter('all');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="dash-slot-games-grid dash-animate-in dash-delay-2">
          {filteredGames.map((game) => (
            <SlotGameCard
              key={`${activeProvider}-${game.gameid ?? game.symbol ?? game.name}-${game.symbol ?? ''}`}
              game={game}
              onPlay={handlePlayGame}
              playing={launchLoading && launchingGameId === game.gameid}
            />
          ))}
        </div>
      )}
      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </div>
  );
}
