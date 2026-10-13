'use strict';

const fs = require('fs');
const path = require('path');

const INDEX_CANDIDATES = [
  process.env.SPA_INDEX_PATH,
  path.join(__dirname, '../../../../frontend/dist/index.html'),
  path.join(process.cwd(), '../frontend/dist/index.html'),
  path.join(process.cwd(), '../../frontend/dist/index.html'),
  '/var/www/dragonfury-store-clone/frontend/dist/index.html'
].filter(Boolean);

let cached = { mtimeMs: 0, file: '', html: '' };

function decodeHtmlEntities(value) {
  let s = String(value == null ? '' : value);
  for (let i = 0; i < 3 && /&amp;/.test(s); i += 1) {
    s = s.replace(/&amp;/g, '&');
  }
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function escapeAttr(value) {
  return decodeHtmlEntities(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ');
}

function readSpaIndex() {
  for (const file of INDEX_CANDIDATES) {
    try {
      const stat = fs.statSync(file);
      if (cached.file === file && cached.mtimeMs === stat.mtimeMs && cached.html) {
        return cached.html;
      }
      const html = fs.readFileSync(file, 'utf8');
      if (!html.includes('<div id="root">')) continue;
      cached = { mtimeMs: stat.mtimeMs, file, html };
      return html;
    } catch {
      /* try next */
    }
  }
  return '';
}

function replaceMeta(html, attr, key, value) {
  const escaped = escapeAttr(value);
  const tag = `<meta ${attr}="${key}" content="${escaped}" />`;
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</title>', `</title>\n    ${tag}`);
}

function injectSpaHead(html, { title, description, canonical, robots, keywords }) {
  let next = html;
  next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`);
  if (canonical) {
    const canonicalTag = `<link rel="canonical" href="${escapeAttr(canonical)}" />`;
    if (/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(next)) {
      next = next.replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i, canonicalTag);
    } else {
      next = next.replace('</title>', `</title>\n    ${canonicalTag}`);
    }
  } else {
    next = next.replace(/\s*<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, '');
  }
  next = replaceMeta(next, 'name', 'description', description);
  next = replaceMeta(next, 'property', 'og:title', title);
  next = replaceMeta(next, 'property', 'og:description', description);
  next = replaceMeta(next, 'property', 'og:url', canonical);
  next = replaceMeta(next, 'name', 'twitter:title', title);
  next = replaceMeta(next, 'name', 'twitter:description', description);
  if (robots) next = replaceMeta(next, 'name', 'robots', robots);
  if (keywords) next = replaceMeta(next, 'name', 'keywords', keywords);
  return next;
}

function injectExtraHead(html, extraHead) {
  const snippet = String(extraHead || '').trim();
  if (!snippet) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}\n</head>`);
  return html;
}

function injectPrerender(html, prerenderHtml) {
  const body = String(prerenderHtml || '').trim();
  if (!body) return html;
  const re = /<div id=["']root["'][^>]*>[\s\S]*?<\/div>/i;
  if (re.test(html)) {
    return html.replace(re, `<div id="root">${body}</div>`);
  }
  return html;
}

function buildSpaHtml(meta = {}) {
  const index = readSpaIndex();
  if (!index) return '';
  let next = injectSpaHead(index, meta);
  next = injectExtraHead(next, meta.extraHead);
  next = injectPrerender(next, meta.prerenderHtml);
  return next;
}

module.exports = { buildSpaHtml, readSpaIndex };
