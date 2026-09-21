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
