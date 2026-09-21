import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import * as gamesApi from '../api/games';
import { useDepositRequiredGate } from './useDepositRequiredGate';
import { isDepositRequiredError } from '../utils/depositRequired';
import { scrollToGamesSection } from '../utils/scrollToGames';
import { GAME_PLACEHOLDER } from '../utils/gitslotparkLandingGames';

const COVERFLOW_GAME_COUNT = 24;

function mapExclusiveGame(item) {
  const kindId = String(item?.kindId ?? '').trim();
  if (!kindId) return null;
  const title = String(item?.name || item?.gameName || '').trim() || `Firekirin ${kindId}`;
  const image = String(item?.logo || item?.gameLogo || '').trim() || GAME_PLACEHOLDER;
  return {
    id: `firekirin-${kindId}`,
    gameid: kindId,
    kindId,
    title,
    image,
    iconUrls: image && image !== GAME_PLACEHOLDER ? [image] : [],
    provider: 'firekirin',
    gameType: item.gameType || '',
  };
}

export function useFirekirinExclusiveGames({ enabled = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const gateEnabled = Boolean(enabled && isAuthenticated);
  const {
    requireDeposit,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
  } = useDepositRequiredGate({ enabled: gateEnabled });
  const [games, setGames] = useState([]);
  const [firekirinGameId, setFirekirinGameId] = useState(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [launchingGameId, setLaunchingGameId] = useState(null);
  const [createPrompt, setCreatePrompt] = useState(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const launchLockRef = useRef(false);

  useEffect(() => {
    if (!gateEnabled) {
      setGames([]);
      setFirekirinGameId(null);
      setHasAccount(false);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    gamesApi
      .getFirekirinExclusiveGames()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.games) ? res.games : [];
        setGames(list.map(mapExclusiveGame).filter(Boolean));
        setFirekirinGameId(res?.firekirinGameId ?? null);
        setHasAccount(Boolean(res?.hasAccount));
      })
      .catch(() => {
        if (!cancelled) {
          setGames([]);
          setFirekirinGameId(null);
          setHasAccount(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gateEnabled]);

  const openExclusiveGame = useCallback(
    (game, kindId) => {
      navigate(`/play/${encodeURIComponent(kindId)}?provider=firekirin`, {
        state: {
          provider: 'firekirin',
          name: game?.title || 'Firekirin game',
          returnTo: location.pathname || '/',
          image: game?.image || '',
          iconUrls: game?.iconUrls || [],
          firekirinGameId,
        },
      });
    },
    [firekirinGameId, location.pathname, navigate]
  );

  const handlePlay = useCallback(
    (game) => {
      const kindId = String(game?.kindId || game?.gameid || '').trim();
      if (!kindId || launchLockRef.current) return;

      requireDeposit(() => {
        if (!hasAccount) {
          setCreatePrompt({ kindId, title: game.title || '', game });
          return;
        }
        setLaunchingGameId(kindId);
        openExclusiveGame(game, kindId);
        setLaunchingGameId(null);
      });
    },
    [hasAccount, openExclusiveGame, requireDeposit]
  );

  const handleCreateAccount = useCallback(async () => {
    if (!createPrompt || !firekirinGameId || creatingAccount) return;
    setCreatingAccount(true);
    try {
      const res = await gamesApi.registerGameAccount(firekirinGameId);
      if (res?.pending) {
        toast.success(
          res?.message ||
            'Firekirin account request submitted. Credentials will appear on the Firekirin card when ready.'
        );
        setCreatePrompt(null);
        scrollToGamesSection();
        window.dispatchEvent(new CustomEvent('games:reload'));
        return;
      }
      toast.success(res?.message || 'Firekirin account created.');
      setHasAccount(true);
      window.dispatchEvent(new CustomEvent('games:reload'));
      const kindId = createPrompt.kindId;
      const game = createPrompt.game;
      setCreatePrompt(null);
      openExclusiveGame(game, kindId);
    } catch (e) {
      if (isDepositRequiredError(e)) {
        setCreatePrompt(null);
        openDepositRequiredModal();
      } else {
        toast.error(e.message || 'Could not create a Firekirin account. Please try from the Firekirin card.');
        scrollToGamesSection();
      }
    } finally {
      setCreatingAccount(false);
    }
  }, [createPrompt, creatingAccount, firekirinGameId, openExclusiveGame, openDepositRequiredModal, toast]);

  const closeCreatePrompt = useCallback(() => {
    if (!creatingAccount) setCreatePrompt(null);
  }, [creatingAccount]);

  return {
    games: games.slice(0, COVERFLOW_GAME_COUNT),
    hasGames: games.length > 0,
    loading,
    launchingGameId,
    handlePlay,
    createPrompt,
    creatingAccount,
    handleCreateAccount,
    closeCreatePrompt,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    activationBonusType,
  };
}
