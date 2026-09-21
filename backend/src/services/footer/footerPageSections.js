'use strict';

const TITLE_MAX = 512;
const BODY_MAX = 20000;
const URL_MAX = 512;
const ALT_MAX = 255;
const BUTTON_TEXT_MAX = 80;
const LINK_TEXT_MAX = 200;
const MAX_LINKS = 20;
const MAX_BLOCKS = 20;

function trimStr(value, max) {
  const s = value == null ? '' : String(value);
  const t = s.trim();
  if (max != null && t.length > max) return t.slice(0, max);
  return t;
}

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Site path (/download) or absolute http(s) URL. */
function normalizeHref(raw, { required = false, field = 'Link' } = {}) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    if (required) throw fail(`${field} is required.`);
    return '';
  }
  let s = String(raw).trim();
  if (s.length > URL_MAX) throw fail(`${field} is too long (max ${URL_MAX} characters).`);
  if (/^https?:\/\//i.test(s)) {
    let url;
    try {
      url = new URL(s);
    } catch {
      throw fail(`${field} is not a valid URL.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw fail(`${field} must use http:// or https://.`);
    }
    if (!url.hostname) throw fail(`${field} is not a valid URL.`);
    return url.href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    throw fail(`${field} must be a site path like /deposit, or a full http(s) URL.`);
  }
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(s)) {
    throw fail(`${field} may only use letters, numbers, /, _, and - (or a full http(s) URL).`);
  }
  return s;
}

function normalizeImageUrl(raw) {
  const s = trimStr(raw, URL_MAX);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw fail('Image URL must use http:// or https://.');
      }
      return url.href;
    } catch (err) {
      if (err.statusCode) throw err;
      throw fail('Image URL is not valid.');
    }
  }
  if (s.startsWith('/')) return s;
  throw fail('Image must be an uploaded file or an http(s) URL.');
}

function normalizeLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, MAX_LINKS)) {
    const text = trimStr(item?.text ?? item?.label, LINK_TEXT_MAX);
    const url = normalizeHref(item?.url ?? item?.href, { required: false, field: 'Inline link' });
    if (!text || !url) continue;
    out.push({ text, url });
  }
  return out;
}

function normalizeBlock(raw = {}, { requireId = false } = {}) {
  const title = trimStr(raw.title, TITLE_MAX);
  const body = trimStr(raw.body ?? raw.content, BODY_MAX);
  const imageUrl = normalizeImageUrl(raw.imageUrl ?? raw.image_url);
  const imageAlt = trimStr(raw.imageAlt ?? raw.image_alt, ALT_MAX);
  const imagePosition = String((raw.imagePosition ?? raw.image_position) || 'right').toLowerCase() === 'left'
    ? 'left'
    : 'right';
  const showButton = raw.showButton === true || raw.show_button === true
    || raw.showButton === 'true' || raw.show_button === 'true';
  const buttonText = trimStr(raw.buttonText ?? raw.button_text, BUTTON_TEXT_MAX) || 'DEPOSIT NOW';
  const buttonUrl = showButton
    ? normalizeHref(raw.buttonUrl ?? raw.button_url, { required: true, field: 'Button link' })
    : normalizeHref(raw.buttonUrl ?? raw.button_url, { required: false, field: 'Button link' });
  const links = normalizeLinks(raw.links);

  let id = trimStr(raw.id, 64);
  if (!id) {
    if (requireId) id = `sec-${Date.now().toString(36)}`;
    else id = '';
  }

  return {
    id,
    title,
    body,
    links,
    imageUrl,
    imageAlt,
    imagePosition,
    showButton,
    buttonText,
    buttonUrl
  };
}

function blockHasContent(block) {
  if (!block) return false;
  return Boolean(
    (block.title && block.title.trim())
    || (block.body && block.body.trim())
    || (block.imageUrl && block.imageUrl.trim())
    || block.showButton
  );
}

function emptySections() {
  return {
    hero: normalizeBlock({}, {}),
    blocks: []
  };
}

function normalizeSections(raw) {
  if (raw == null || raw === '') return emptySections();
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw fail('Page layout is not valid JSON.');
    }
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw fail('Page layout must be an object.');
  }
  const heroSource = parsed.hero || parsed.firstSection || parsed.first_section || {};
  const hero = normalizeBlock(heroSource, {});
  delete hero.id;
  const list = Array.isArray(parsed.blocks)
    ? parsed.blocks
    : (Array.isArray(parsed.sections) ? parsed.sections : []);
  if (list.length > MAX_BLOCKS) {
    throw fail(`You can add at most ${MAX_BLOCKS} content sections.`);
  }
  const blocks = list.map((item, index) => {
    const block = normalizeBlock(item, { requireId: true });
    if (!block.id) block.id = `sec-${index + 1}`;
    return block;
  });
  return { hero, blocks };
}

function hasLayout(sections) {
  if (!sections || typeof sections !== 'object') return false;
  if (blockHasContent(sections.hero)) return true;
  return Array.isArray(sections.blocks) && sections.blocks.some(blockHasContent);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInlineLinksHtml(text, links) {
  let remaining = String(text || '');
  const valid = (Array.isArray(links) ? links : [])
    .filter((l) => l && l.text && l.url)
    .sort((a, b) => String(b.text).length - String(a.text).length);
  const parts = [];
  while (remaining.length) {
    let best = null;
    let bestAt = -1;
    for (const link of valid) {
      const at = remaining.indexOf(link.text);
      if (at === -1) continue;
      if (bestAt === -1 || at < bestAt || (at === bestAt && link.text.length > best.text.length)) {
        best = link;
        bestAt = at;
      }
    }
    if (!best || bestAt < 0) {
      parts.push(escapeHtml(remaining));
      break;
    }
    if (bestAt > 0) parts.push(escapeHtml(remaining.slice(0, bestAt)));
    const href = escapeHtml(best.url);
    const label = escapeHtml(best.text);
    const external = /^https?:\/\//i.test(best.url);
    parts.push(
      `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`
    );
    remaining = remaining.slice(bestAt + best.text.length);
  }
  return parts.join('');
}

function paragraphsHtml(body, links) {
  const chunks = String(body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!chunks.length) return '';
  return chunks
    .map((p) => `<p>${applyInlineLinksHtml(p, links).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function ctaHtml(block) {
  if (!block?.showButton || !block.buttonUrl) return '';
  const href = escapeHtml(block.buttonUrl);
  const label = escapeHtml(block.buttonText || 'DEPOSIT NOW');
  const external = /^https?:\/\//i.test(block.buttonUrl);
  return `<p><a class="pj-fp-cta" href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a></p>`;
}

function mediaHtml(block, { includeCta = false } = {}) {
  if (!block?.imageUrl && !(includeCta && block?.showButton && block?.buttonUrl)) return '';
  const img = block?.imageUrl
    ? `<img src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.imageAlt || block.title || '')}" />`
    : '';
  return `<div class="pj-fp-media">${img}${includeCta ? ctaHtml(block) : ''}</div>`;
}

function copyHtml(block, { includeCta = false, headingClass = '' } = {}) {
  const title = block.title
    ? `<h2 class="${headingClass || 'pj-fp-section-title'}">${escapeHtml(block.title)}</h2>`
    : '';
  const body = paragraphsHtml(block.body, block.links);
  const cta = includeCta ? ctaHtml(block) : '';
  if (!title && !body && !cta) return '';
  return `<div class="pj-fp-copy">${title}${body}${cta}</div>`;
}

function splitHtml(block, { buttonWithMedia = false } = {}) {
  const imageLeft = block.imagePosition === 'left';
  const attachButtonToMedia = Boolean(buttonWithMedia && block.imageUrl);
  const media = mediaHtml(block, { includeCta: attachButtonToMedia });
  const copy = copyHtml(block, { includeCta: !attachButtonToMedia, headingClass: 'pj-fp-section-title' });
  if (!media) return copy;
  if (!copy) return media;
  const cls = `pj-fp-split${imageLeft ? ' is-image-left' : ' is-image-right'}`;
  return `<div class="${cls}">${copy}${media}</div>`;
}

function sectionsToHtml(sections) {
  if (!hasLayout(sections)) return '';
  const parts = [];
  if (blockHasContent(sections.hero)) {
    const hero = sections.hero;
    const title = hero.title
      ? `<h1 class="pj-fp-hero-title">${escapeHtml(hero.title)}</h1>`
      : '';
    parts.push(`<section class="pj-fp-hero">${title}${splitHtml({ ...hero, title: '' }, { buttonWithMedia: true })}</section>`);
  }
  (sections.blocks || []).filter(blockHasContent).forEach((block) => {
    parts.push(`<section class="pj-fp-card">${splitHtml(block, { buttonWithMedia: false })}</section>`);
  });
  return `<div class="pj-fp-layout">${parts.join('\n')}</div>`;
}

function sectionsFromBody(body = {}) {
  if (body.sections === undefined && body.layout === undefined) return undefined;
  return normalizeSections(body.sections !== undefined ? body.sections : body.layout);
}

module.exports = {
  emptySections,
  normalizeSections,
  hasLayout,
  sectionsToHtml,
  sectionsFromBody,
  blockHasContent,
  normalizeHref
};
