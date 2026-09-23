import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AUTH_LOBBY_LINKS } from '../constants/authLobbyLinks';
import { BG_MUSIC_MUTED_STORAGE_KEY } from './backgroundMusicTracks';
import { openSupportWidget } from './intercomApi';

function readMusicMuted() {
  try {
    return localStorage.getItem(BG_MUSIC_MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Live-style hamburger quick menu — sound / logout / help + every lobby link.
 */
export function DfQuickMenu({ open, onClose, anchorRef }) {
  const navigate = useNavigate();
  const { logout, isAuthenticated } = useAuth();
  const panelRef = useRef(null);
  const [muted, setMuted] = useState(readMusicMuted);
  const [pos, setPos] = useState({ top: 54, left: 12 });

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const btn = anchorRef?.current;
      const width = Math.min(320, window.innerWidth - 16);
      let left = 8;
      let top = 56;
      if (btn) {
        const r = btn.getBoundingClientRect();
        left = r.right - width;
        if (left < 8) left = 8;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        top = Math.round(r.bottom + 6);
      }
      const maxTop = Math.max(8, window.innerHeight - 120);
      if (top > maxTop) top = 56;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(BG_MUSIC_MUTED_STORAGE_KEY, next ? 'true' : 'false');
      window.dispatchEvent(new CustomEvent('bg-music:set-muted', { detail: { muted: next } }));
    } catch (_) {}
  };

  const go = (to) => {
    onClose?.();
    navigate(to);
  };

  const handleLogout = () => {
    onClose?.();
    logout();
    navigate('/');
  };

  const handleHelp = () => {
    onClose?.();
    try {
      openSupportWidget();
    } catch (_) {
      navigate('/help');
    }
  };

  const menu = (
    <div
      ref={panelRef}
      id="dragonfury-quick-menu"
      className="df-quick-menu"
      role="menu"
      aria-label="Quick menu"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="df-quick-menu__grid" role="group" aria-label="Lobby links">
        <button
          type="button"
          className="df-quick-menu__tile"
          role="menuitem"
          aria-pressed={!muted}
          aria-label={muted ? 'Sound off. Tap to unmute' : 'Sound on. Tap to mute'}
          onClick={toggleSound}
        >
          <img
            src={muted ? '/df-online/menu/sound-off.webp' : '/df-online/menu/sound-on.webp'}
            alt=""
            width={220}
            height={225}
            decoding="async"
          />
        </button>
        <button
          type="button"
          className="df-quick-menu__tile"
          role="menuitem"
          aria-label="Log out"
          onClick={handleLogout}
        >
          <img src="/df-online/menu/logout.webp" alt="" width={220} height={219} decoding="async" />
        </button>
        <button
          type="button"
          className="df-quick-menu__tile"
          role="menuitem"
          aria-label="Help and support"
          onClick={handleHelp}
        >
          <img src="/df-online/menu/help.webp" alt="" width={220} height={222} decoding="async" />
        </button>

        {AUTH_LOBBY_LINKS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="df-quick-menu__tile"
            role="menuitem"
            aria-label={item.label}
            onClick={() => {
              if (item.openLiveChat) {
                handleHelp();
                return;
              }
              go(isAuthenticated ? item.to : '/register');
            }}
          >
            <img src={item.art} alt="" width={220} height={220} decoding="async" />
          </button>
        ))}
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}
