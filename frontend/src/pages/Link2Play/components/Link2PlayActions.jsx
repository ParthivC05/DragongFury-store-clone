import { memo, useMemo } from 'react';
import { AndroidIcon, AppleIcon, GlobeIcon } from '../icons';
import { isSafeExternalPlayUrl } from '../../../config/link2playGames';

const PLATFORM_META = {
  web: {
    key: 'web',
    label: 'Play in Browser',
    className: 'l2p-act-btn l2p-act-btn--web',
    Icon: GlobeIcon,
  },
  android: {
    key: 'android',
    label: 'Android App',
    className: 'l2p-act-btn l2p-act-btn--android',
    Icon: AndroidIcon,
  },
  ios: {
    key: 'ios',
    label: 'iPhone App',
    className: 'l2p-act-btn l2p-act-btn--ios',
    Icon: AppleIcon,
  },
};

/** Only platforms with a valid link are shown. */
function buildActions(game) {
  const links = game?.links || {};
  const actions = [];

  for (const key of ['web', 'android', 'ios']) {
    const url = links[key];
    if (isSafeExternalPlayUrl(url)) {
      actions.push({ type: 'link', platform: key, url: String(url).trim() });
    }
  }

  return actions;
}

function ActionButton({ action, full, gameName }) {
  const meta = PLATFORM_META[action.platform];
  if (!meta) return null;
  const { Icon } = meta;

  return (
    <a
      href={action.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${meta.className}${full ? ' l2p-act-btn--full' : ''}`}
      aria-label={`${meta.label} — ${gameName}`}
    >
      <Icon width={22} height={22} />
      <span>{meta.label}</span>
    </a>
  );
}

export const Link2PlayActions = memo(function Link2PlayActions({ game, gameName }) {
  const actions = useMemo(() => buildActions(game), [game]);
  if (!actions.length) return null;

  const full = actions.length === 1;

  return (
    <div className="l2p-actions">
      {actions.map((action) => (
        <ActionButton
          key={action.platform}
          action={action}
          full={full}
          gameName={gameName}
        />
      ))}
    </div>
  );
});
