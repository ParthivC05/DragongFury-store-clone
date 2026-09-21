/** Use the inner article when CMS content is a full HTML document. */
export function extractBlogInnerHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let html = raw.trim();
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1];
  return html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .trim();
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
