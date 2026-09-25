/** VIP tier display colors for navbar progress bar and tier cards. */
export const VIP_TIER_COLORS = {
  Iron: {
    color: '#64748b',
    colorLight: 'rgba(100, 116, 139, 0.25)',
    glow: 'rgba(148, 163, 184, 0.55)',
    stars: 1,
    wings: false,
    textClass: 'text-slate-400',
    borderClass: 'border-slate-500',
    bgClass: 'bg-slate-500'
  },
  Bronze: {
    color: '#b45309',
    colorLight: 'rgba(180, 83, 9, 0.25)',
    glow: 'rgba(245, 158, 11, 0.55)',
    stars: 2,
    wings: false,
    textClass: 'text-amber-600',
    borderClass: 'border-amber-600',
    bgClass: 'bg-amber-600'
  },
  Silver: {
    color: '#94a3b8',
    colorLight: 'rgba(148, 163, 184, 0.25)',
    glow: 'rgba(191, 219, 254, 0.5)',
    stars: 3,
    wings: false,
    textClass: 'text-slate-300',
    borderClass: 'border-slate-400',
    bgClass: 'bg-slate-400'
  },
  Gold: {
    color: '#eab308',
    colorLight: 'rgba(234, 179, 8, 0.25)',
    glow: 'rgba(250, 204, 21, 0.6)',
    stars: 1,
    wings: true,
    textClass: 'text-yellow-500',
    borderClass: 'border-yellow-500',
    bgClass: 'bg-yellow-500'
  },
  Platinum: {
    color: '#a8b2c1',
    colorLight: 'rgba(168, 178, 193, 0.3)',
    glow: 'rgba(196, 181, 253, 0.55)',
    stars: 2,
    wings: true,
    textClass: 'text-slate-300',
    borderClass: 'border-slate-400',
    bgClass: 'bg-slate-400'
  },
  Diamond: {
    color: '#06b6d4',
    colorLight: 'rgba(6, 182, 212, 0.25)',
    glow: 'rgba(52, 211, 153, 0.55)',
    stars: 2,
    wings: true,
    textClass: 'text-cyan-400',
    borderClass: 'border-cyan-400',
    bgClass: 'bg-cyan-400'
  }
};

/** Parse hex #rrggbb to r,g,b. */
function hexToRgb(hex) {
  const h = String(hex).replace(/^#/, '');
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [100, 116, 139]; // slate-500 fallback
}

/**
 * Get tier style for display. If customColor (hex) is provided (e.g. from store VIP settings), use it; otherwise use VIP_TIER_COLORS by levelName.
 */
export function getVipTierStyle(levelName, customColor) {
  const base = VIP_TIER_COLORS[levelName] || VIP_TIER_COLORS.Iron;
  if (customColor && /^#?[0-9A-Fa-f]{3,6}$/.test(String(customColor).trim())) {
    const hex = String(customColor).trim().replace(/^#/, '');
    const six = hex.length === 3 ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex.slice(0, 6);
    const color = '#' + six;
    const [r, g, b] = hexToRgb(color);
    return {
      ...base,
      color,
      colorLight: `rgba(${r}, ${g}, ${b}, 0.25)`
    };
  }
  return base;
}

/** Badge images in /public/vip/ — keyed by tier name (case-insensitive). */
export const VIP_TIER_IMAGES = {
  Iron: '/vip/iron.webp',
  Bronze: '/vip/bronze.webp',
  Silver: '/vip/silver.webp',
  Gold: '/vip/gold.webp',
  Platinum: '/vip/platinum.webp',
  Sapphire: '/vip/sapphire.webp',
  Emerald: '/vip/emerald.webp',
  Diamond: '/vip/diamond.webp',
};

export function getVipTierImage(levelName) {
  if (!levelName) return VIP_TIER_IMAGES.Iron;
  const key = Object.keys(VIP_TIER_IMAGES).find(
    (name) => name.toLowerCase() === String(levelName).trim().toLowerCase()
  );
  return VIP_TIER_IMAGES[key] || VIP_TIER_IMAGES.Iron;
}
