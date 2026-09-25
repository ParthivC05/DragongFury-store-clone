import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import * as userApi from '../api/user';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import './DfProfilePopup.css';

const PORTRAITS = [
  { id: 'hatchling', label: 'Hatchling', src: '/df-online/dragons/tier-hatchling.webp' },
  { id: 'whelp', label: 'Whelp', src: '/df-online/dragons/tier-whelp.webp' },
  { id: 'drake', label: 'Drake', src: '/df-online/dragons/tier-drake.webp' },
  { id: 'fury', label: 'Fury', src: '/df-online/dragons/tier-fury.webp' },
  { id: 'elder', label: 'Elder Dragon', src: '/df-online/dragons/tier-elder-dragon.webp' },
  { id: 'lord', label: 'Dragon Lord', src: '/df-online/dragons/tier-dragon-lord.webp' }
];

const LINKS = [
  { to: '/bonus', label: 'Bonus & invitations' },
  { to: '/account/transactions', label: 'Transactions' },
  { to: '/account/affiliate', label: 'Refer & Earn' }
];

function money(n) {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function displayName(user) {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user?.username) return user.username;
  const email = String(user?.email || '').trim();
  return email ? email.split('@')[0] : 'Player';
}

export function DfProfilePopup({
  open,
  onClose,
  user,
  balanceSc,
  rsc,
  bsc,
  onLogout,
  refreshUser
}) {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [tab, setTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [pendingSrc, setPendingSrc] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    setTab('profile');
    setPendingSrc(null);
    setNotice(null);
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const unlock = lockBodyScroll();
    return () => {
      window.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!open) return null;

  function showNotice(type, message) {
    setNotice({ type, message, id: Date.now() });
  }

  const savedSrc = user?.profileImageUrl || PORTRAITS[0].src;
  const shownSrc = pendingSrc || savedSrc;
  const canSave = Boolean(pendingSrc) && pendingSrc !== user?.profileImageUrl;

  async function savePicture() {
    if (!pendingSrc || saving) return;
    setSaving(true);
    try {
      const absolute = pendingSrc.startsWith('http')
        ? pendingSrc
        : `${window.location.origin}${pendingSrc}`;
      await userApi.updateProfilePhoto(absolute);
      if (refreshUser) await refreshUser();
      showNotice('success', 'Profile picture saved.');
      setPendingSrc(null);
    } catch (err) {
      showNotice('error', err?.message || 'Could not save that picture.');
    } finally {
      setSaving(false);
    }
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showNotice('error', 'Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showNotice('error', 'That photo is over 5 MB.');
      return;
    }
    showNotice('error', 'Choose a dragon portrait. Custom photos are not saved on this account yet.');
  }

  function go(to) {
    onClose();
    navigate(to);
  }

  return createPortal(
    <div className="df-profile-popup">
      <button type="button" className="df-profile-popup__backdrop" aria-label="Close profile" onClick={onClose} />
      {notice ? (
        <div
          key={notice.id}
          className={`df-profile-popup__toast df-toast df-toast--${notice.type} df-toast--enter`}
          role="alert"
        >
          <p className="df-toast__message">{notice.message}</p>
        </div>
      ) : null}
      <section className="df-profile-popup__panel" aria-labelledby="df-profile-title">
        <button type="button" className="df-profile-popup__close" aria-label="Close profile" onClick={onClose} />
        <h2 id="df-profile-title" className="df-profile-popup__sr">Your profile</h2>
        <nav className="df-profile-popup__tabs" aria-label="Profile sections">
          <button type="button" aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>
            Profile
          </button>
          <button type="button" aria-pressed={tab === 'personalize'} onClick={() => setTab('personalize')}>
            Personalize
          </button>
        </nav>
        <div className="df-profile-popup__identity">
          <img className="df-profile-popup__portrait" src={shownSrc} alt="Your profile picture" width={180} height={180} />
          <strong>{displayName(user)}</strong>
          {tab === 'profile' ? (
            <>
              <button type="button" className="df-profile-popup__save" onClick={() => go('/settings')}>
                Account settings
              </button>
              <button type="button" className="df-profile-popup__secondary" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="df-profile-popup__save"
              disabled={!canSave || saving}
              onClick={savePicture}
            >
              {saving ? 'Saving…' : 'Save picture'}
            </button>
          )}
        </div>
        <div className="df-profile-popup__content">
          {tab === 'profile' ? (
            <>
              <dl className="df-profile-popup__balances">
                <div>
                  <dt>Available SC</dt>
                  <dd>{money(balanceSc)}</dd>
                </div>
                <div>
                  <dt>Redeemable SC</dt>
                  <dd>{money(rsc)}</dd>
                </div>
                <div>
                  <dt>Bonus SC</dt>
                  <dd>{money(bsc)}</dd>
                </div>
              </dl>
              <div className="df-profile-popup__links">
                {LINKS.map((link) => (
                  <button key={link.to} type="button" onClick={() => go(link.to)}>
                    {link.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3>Choose your picture</h3>
              <div className="df-profile-popup__portraits" role="group" aria-label="Dragon portraits">
                {PORTRAITS.map((portrait) => (
                    <button
                      key={portrait.id}
                      type="button"
                      aria-label={`Choose ${portrait.label} portrait`}
                      aria-pressed={pendingSrc === portrait.src}
                      onClick={() => setPendingSrc(portrait.src)}
                    >
                      <img src={portrait.src} alt="" width={96} height={96} />
                      <span>{portrait.label}</span>
                    </button>
                ))}
              </div>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pickFile}
              />
              <button type="button" className="df-profile-popup__secondary" onClick={() => fileRef.current?.click()}>
                Upload photo
              </button>
              <p className="df-profile-popup__hint">JPG, PNG or WebP, under 5 MB. Preview your choice, then save.</p>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
