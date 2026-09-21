/** Extract wheel wedge colors from segment config (same as logged-in `/spinwheel` page). */
export function getContrastLabelColor(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export function normalizeHexColor(color) {
  const raw = typeof color === 'string' ? color.trim() : '';
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9A-Fa-f]{3}$/.test(raw)) {
    return raw.replace(/^#(.)(.)(.)$/, (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`);
  }
  return null;
}

export function getSegmentWheelColors(segments) {
  const list = Array.isArray(segments) ? segments : [];
  const backgrounds = list.map((seg) => normalizeHexColor(seg?.color) ?? '#6b7280');
  const labels = backgrounds.map(getContrastLabelColor);
  return { backgrounds, labels };
}
