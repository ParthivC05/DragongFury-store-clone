const ICONS = {
  replay: ['M20.5 12a8.5 8.5 0 1 1-2.6-6.1', 'M20.5 4.2v4.6h-4.6'],
  slots: ['M3 5.5h18v13H3z', 'M9 5.5v13', 'M15 5.5v13', 'M6 12h.6', 'M11.7 12h.6', 'M17.4 12h.6', 'M7 2.6h10'],
  fish: ['M21 12c-2.6 3.4-5.8 5.2-9.4 5.2S5 15.4 3 12c2-3.4 5-5.2 8.6-5.2S18.4 8.6 21 12Z', 'M16.6 10.6h.01'],
  bolt: ['M13.6 2.5 5 13.4h5.6L9.9 21.5 18.8 10.6h-5.7l.5-8.1Z'],
  target: ['M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Z', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z', 'M12 1.8v2.7', 'M12 19.5v2.7', 'M1.8 12h2.7', 'M19.5 12h2.7'],
  cards: ['M8.4 3h11.6v15.4H8.4z', 'M5.6 6.2 4 7.2v9.6A2.4 2.4 0 0 0 6.4 19.2h8.2'],
  ticket: ['M3 8.4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.4a2.2 2.2 0 1 0 0 4.4v1.4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.4a2.2 2.2 0 1 0 0-4.4V8.4Z', 'M12 7.6v1.6', 'M12 11.2v1.6', 'M12 14.8v1.6'],
  bingo: ['M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Z', 'M12 7.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Z'],
  keno: ['M3.2 3.2h17.6v17.6H3.2z', 'M9.1 3.2v17.6', 'M14.9 3.2v17.6', 'M3.2 9.1h17.6', 'M3.2 14.9h17.6'],
  lottery: ['M12 2.8 14.5 8l5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4L9.5 8 12 2.8Z'],
  play: ['M7.4 4.6 19 12 7.4 19.4V4.6Z'],
};

const CATEGORY_META = {
  'recently-played': { icon: 'replay', color: '#93A0B8', subtitle: 'You played these' },
  popular: { icon: 'bolt', color: '#F59E0B', subtitle: 'Most played here' },
  'popular-games': { icon: 'bolt', color: '#F59E0B', subtitle: 'Most played here' },
  'buffalo-blast': { icon: 'slots', color: '#F97316', subtitle: 'Buffalo slots' },
  'top-games': { icon: 'slots', color: '#F2C14E', subtitle: 'Highest performing titles' },
  'top-fishing': { icon: 'fish', color: '#2DD4BF', subtitle: 'Ranked by players this week' },
  slots: { icon: 'slots', color: '#F2C14E', subtitle: 'Spin and win' },
  fishing: { icon: 'fish', color: '#2DD4BF', subtitle: 'Shoot to win' },
  'instant-win': { icon: 'bolt', color: '#60A5FA', subtitle: 'Crash and instant' },
  shooting: { icon: 'target', color: '#7C5CFF', subtitle: 'Aim and fire' },
  'table-games': { icon: 'cards', color: '#34D399', subtitle: 'Blackjack and roulette' },
  'scratch-cards': { icon: 'ticket', color: '#F59E0B', subtitle: 'Scratch to reveal' },
  bingo: { icon: 'bingo', color: '#22D3EE', subtitle: 'Mark your card' },
  keno: { icon: 'keno', color: '#A78BFA', subtitle: 'Pick your numbers' },
  lottery: { icon: 'lottery', color: '#34D399', subtitle: 'Daily draws' },
  'crash-game': { icon: 'bolt', color: '#60A5FA', subtitle: 'Fast rounds' },
  'firekirin-exclusive': { icon: 'bolt', color: '#F97316', subtitle: 'Firekirin originals' },
  'live-casino': { icon: 'cards', color: '#7C5CFF', subtitle: 'Live tables' },
  plinko: { icon: 'bolt', color: '#34D399', subtitle: 'Drop and win' },
  'video-poker': { icon: 'cards', color: '#60A5FA', subtitle: 'Draw your hand' },
  'casual-games': { icon: 'slots', color: '#F2C14E', subtitle: 'Quick plays' },
  others: { icon: 'slots', color: '#93A0B8', subtitle: 'More games' },
};

export function getSlotLobbyCategoryMeta(categoryId, gameCount = 0) {
  const id = String(categoryId || '').trim();
  const base = CATEGORY_META[id] || { icon: 'slots', color: '#F2C14E', subtitle: 'Tap to play' };
  const countLabel =
    gameCount > 0 && id !== 'recently-played' && id !== 'top-fishing' && id !== 'top-games' && id !== 'popular' && id !== 'buffalo-blast'
      ? ` · ${gameCount} games`
      : '';
  return {
    ...base,
    subtitle: `${base.subtitle}${countLabel}`,
  };
}

export function SlotLobbyIcon({ name = 'slots', filled = false }) {
  const paths = ICONS[name] || ICONS.slots;
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths.map((d) => (
        <path key={d} d={d} fill={filled ? 'currentColor' : name === 'play' ? 'currentColor' : 'none'} />
      ))}
    </svg>
  );
}
