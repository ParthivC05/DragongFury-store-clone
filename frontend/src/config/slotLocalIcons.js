function compactSlotTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

const SLOT_LOCAL_ICONS = {
  flaminghot: '/slots/flaming_hot.webp',
  shiningcrown: '/slots/shining_crown.webp',
  '40luckyking': '/slots/40_Lucky_King_.webp',
  '40luckykingbelllink': '/slots/40_lucky_king_bell.webp',
  '40luckykingbell': '/slots/40_lucky_king_bell.webp',
  '40luckykingextremebelllink': '/slots/40_lucky_king_extreme.webp',
  '40luckykingextreme': '/slots/40_lucky_king_extreme.webp',
  '20superhotprogressivejp': '/slots/20_Super_Hot_jp.webp',
  '40burninghot': '/slots/40_burning_hot.webp',
  versaillesgoldprogressivejp: '/slots/versailles_gold_progressive_jp.webp',
  treasuresoffirescatterpays: '/slots/treasure_of_fire.webp',
  treasuresoffire: '/slots/treasure_of_fire.webp',
  treasureoffire: '/slots/treasure_of_fire.webp',
  buffalopowerholdandwin: '/slots/buffalo_power_hold_win.webp',
  buffalopowermegaways: '/slots/buffalo_power_megaways.webp',
  '3fortunetrees': '/slots/3_fortune_trees.webp',
};

export function getSlotLocalIcon(title) {
  const compact = compactSlotTitle(title);
  if (!compact) return null;
  return SLOT_LOCAL_ICONS[compact] || null;
}
