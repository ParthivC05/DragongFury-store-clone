/** Live DragonFury store-rarity chest art mapped by SC package size / title. */

const CHEST_BASE = '/df-online/store-rarity';

const TIERS = {
  starter: {
    tier: 'starter',
    rarity: 'Starter',
    label: 'Starter Chest',
    file: 'bronze',
    scale: 0.82,
    glow: 0.14
  },
  premium: {
    tier: 'premium',
    rarity: 'Premium',
    label: 'Premium Chest',
    file: 'bronze',
    scale: 0.88,
    glow: 0.16
  },
  royal: {
    tier: 'royal',
    rarity: 'Royal',
    label: 'Royal Chest',
    file: 'silver',
    scale: 0.92,
    glow: 0.18
  },
  epic: {
    tier: 'epic',
    rarity: 'Epic',
    label: 'Epic Chest',
    file: 'gold',
    scale: 0.96,
    glow: 0.2
  },
  legendary: {
    tier: 'legendary',
    rarity: 'Legendary',
    label: 'Legendary Chest',
    file: 'emerald-royal',
    scale: 1,
    glow: 0.24
  },
  mythic: {
    tier: 'mythic',
    rarity: 'Mythic',
    label: 'Mythic Chest',
    file: 'legendary',
    scale: 1.04,
    glow: 0.28
  }
};

const TITLE_TIER = [
  [/mythic/i, 'mythic'],
  [/legend/i, 'legendary'],
  [/epic/i, 'epic'],
  [/royal/i, 'royal'],
  [/premium/i, 'premium'],
  [/starter|bronze|beginner/i, 'starter']
];

export function resolveChestTier(pkg) {
  const title = String(pkg?.title || '');
  for (const [re, key] of TITLE_TIER) {
    if (re.test(title)) return TIERS[key];
  }

  const sc = Number(pkg?.final_sc);
  if (!Number.isFinite(sc) || sc <= 0) return TIERS.starter;
  if (sc <= 7) return TIERS.starter;
  if (sc <= 15) return TIERS.premium;
  if (sc <= 30) return TIERS.royal;
  if (sc <= 70) return TIERS.epic;
  if (sc <= 160) return TIERS.legendary;
  return TIERS.mythic;
}

/** Limited-offer carousel uses a slightly different art ladder. */
export function resolveLimitedChestFile(pkg) {
  const sc = Number(pkg?.final_sc);
  if (!Number.isFinite(sc) || sc <= 40) return 'silver';
  if (sc <= 80) return 'gold';
  if (sc <= 200) return 'epic-royal';
  return 'legendary';
}

export function chestImageProps(file, { eager = false } = {}) {
  const base = `${CHEST_BASE}/${file}`;
  return {
    src: `${base}-512.webp`,
    srcSet: `${base}-256.webp 256w, ${base}-512.webp 512w`,
    sizes: '(max-width: 680px) 42vw, 240px',
    width: 512,
    height: 512,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    alt: '',
    draggable: false
  };
}

export function packBonusParts(pkg) {
  const sc = Number(pkg?.final_sc);
  const price = Number(pkg?.final_price);
  if (!Number.isFinite(sc) || !Number.isFinite(price) || price <= 0) {
    return { sc: 0, base: 0, bonus: 0, pct: 0 };
  }
  const base = Math.min(sc, price);
  const bonus = Math.max(0, +(sc - base).toFixed(2));
  const pct = base > 0 ? Math.round((bonus / base) * 100) : 0;
  return { sc, base: +base.toFixed(2), bonus, pct };
}

export function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0.00';
  return `$${v.toFixed(2)}`;
}

export function formatScLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0 SC';
  const rounded = Math.abs(v - Math.round(v)) < 0.005 ? Math.round(v) : +v.toFixed(2);
  return `${rounded} SC`;
}

export function preloadStoreChestImages() {
  if (typeof window === 'undefined') return Promise.resolve();
  const files = ['bronze', 'silver', 'gold', 'epic-royal', 'emerald-royal', 'legendary'];
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = `${CHEST_BASE}/${file}-512.webp`;
        })
    )
  );
}
