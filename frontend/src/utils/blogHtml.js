/** True for pasted editor defaults (Google Docs / Word black) that disappear on the dark blog. */
function isNearBlackColor(value) {
  const v = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (v === 'black' || v === 'windowtext' || v === 'canvastext') return true;
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const channels = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((c) => parseInt(c, 16));
    return channels.every((n) => n <= 48);
  }
  const rgb = v.match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})/);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].every((n) => Number(n) <= 48);
  return false;
}

/** Drop default black text colors so the blog stylesheet color applies. Keep intentional colors. */
export function stripDefaultDarkTextColors(html) {
  if (!html) return '';
  return String(html)
    .replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (full, quote, style) => {
      const next = style
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((decl) => {
          const match = decl.match(/^([a-z-]+)\s*:\s*(.+)$/i);
          if (!match) return true;
          return !(match[1].toLowerCase() === 'color' && isNearBlackColor(match[2]));
        })
        .join('; ');
      return next ? ` style=${quote}${next}${quote}` : '';
    })
    .replace(/(<font\b[^>]*?)\scolor\s*=\s*(["']?)([^"'>\s]+)\2/gi, (full, start, _quote, value) => (
      isNearBlackColor(value) ? start : full
    ));
}

/** Use the inner article when CMS content is a full HTML document. */
export function extractBlogInnerHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let html = raw.trim();
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1];
  html = html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .trim();
  return stripDefaultDarkTextColors(html);
}

export function excerptFromHtml(raw, max = 140) {
  const text = String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export function formatBlogDate(d, options = {}) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: options.month || 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function readingMinutes(raw) {
  const words = excerptFromHtml(raw, 20000).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200) || 1);
}
