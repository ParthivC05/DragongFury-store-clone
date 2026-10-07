'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { canonicalUrlFromBody } = require('../cms/seoFields');
const { schemaFromBody, schemaForGamePage, PLAYJUWA_ORIGIN } = require('./pageSchema.service');
const { normalizeSections: normalizeFooterSections } = require('../footer/footerPageSections');
const {
  actorFromReq,
  stampDelete,
  stampRestore,
  deletionWhere,
  redirectPatch,
  lifecyclePlain
} = require('../cms/contentLifecycle');
const STORE = 'dragonfury';
const PLAYJUWA = 'playjuwa';
const GAME_STORES = new Set([STORE, PLAYJUWA]);
const MAX_BUTTONS = 6;
const MAX_BLOCKS = 20;
const MAX_FAQ = 20;

/** Catalog shown on /games. Seeded once; later edits stay in the database. */
const CATALOG = [
  game('golden-dragon', 'Golden Dragon', 'Fish & Slots', '/optimized/games/goldendragon.webp', 'Golden Dragon Sweepstakes Online | Dragon Fury', 'Play Golden Dragon fish games and slots on Dragon Fury. No download — sign up and launch in your browser.', 'Classic fish tables and slots with a simple login and browser-based play.'),
  game('ultra-panda', 'Ultra Panda', 'Fish & Slots', '/optimized/games/ultrapanda.webp', 'Ultra Panda Online | Dragon Fury', 'Access Ultra Panda fish games and slots through Dragon Fury. Browser-based play with a wide table selection.', 'Ultra Panda fish shooting and slots, ready to play on desktop or mobile.'),
  game('egame99', 'Egame99', 'Casino & Slots', '/optimized/games/egame99.webp', 'Egame99 Online | Dragon Fury', 'Play Egame99 on Dragon Fury in your browser. Sign up free and jump into the full game list — no app required.', 'Egame99 casino-style games with fast browser access on Dragon Fury.'),
  game('vblink', 'Vblink', 'Fish & Slots', '/optimized/games/vblink.webp', 'Vblink Online | Dragon Fury', 'Launch Vblink fish games and slots on Dragon Fury. No download needed — play from any modern browser.', 'Vblink fish games and slots with instant web play on Dragon Fury.'),
  game('ultra-thunder', 'Ultra Thunder', 'Sweepstakes', '/optimized/games/ultathunder.webp', 'Ultra Thunder Online | Dragon Fury', 'Play Ultra Thunder on Dragon Fury in your browser. Sign up free — no download required.', 'Play Ultra Thunder online in your browser on Dragon Fury.'),
  game('estar', 'Estar', 'Sweepstakes', '/optimized/games/estar.webp', 'Estar Online | Dragon Fury', 'Play Estar on Dragon Fury in your browser. Sign up free — no download required.', 'Play Estar online in your browser on Dragon Fury.'),
  game('dragon-fury', 'Dragon Fury', 'Sweepstakes', '/optimized/games/dragonfury.webp', 'Dragon Fury Sweepstakes Online', 'Play Dragon Fury fish games and slots in your browser. Sign up free — no download required.', 'Classic Dragon Fury play with a simple login in your browser.'),
  game('juwa', 'Juwa', 'Fish & Slots', '/optimized/games/juwa.webp', 'Play Juwa Online - Fish Games & Slots | Dragon Fury', 'Access Juwa fish games and slots online through Dragon Fury. No download needed — browser-based play with a wide game selection.', 'Juwa fish games and slots — the flagship lineup, playable in your browser.'),
  game('firekirin', 'Firekirin', 'Fish Games', '/optimized/games/firekirin.webp', 'Firekirin Online - Fish Games | Dragon Fury', "Play Firekirin fish games through Dragon Fury's easy online access. Browse available tables and get started today.", 'Firekirin fish tables online — browse available rooms and start in your browser.'),
  game('orionstars', 'Orionstars', 'Fish & Slots', '/optimized/games/orionstars.webp', 'Orionstars Online - Fish Games | Dragon Fury', "Play Orionstars fish games and slots through Dragon Fury's browser-based access. Explore the full game library today.", 'Orionstars fish games and slots with full library access in the browser.'),
  game('cashmachine777', 'CashMachine777', 'Slots', '/optimized/games/cashmachine777.webp', 'CashMachine777 Slots Online | Dragon Fury', 'Play CashMachine777 slots on Dragon Fury. Sign up, open the platform in your browser, and start spinning — no app download.', 'CashMachine777 slots with one-click browser play on Dragon Fury.'),
  game('gameroom', 'Gameroom', 'Casino', '/optimized/games/gameroom.webp', 'Gameroom Online | Dragon Fury', 'Access Gameroom casino games through Dragon Fury. Browser-based play, wide selection, no download required.', 'Gameroom casino titles with simple web login on Dragon Fury.'),
  game('mafia', 'Mafia', 'Fish & Slots', '/games/mafia.webp', 'Mafia Online | Dragon Fury', 'Play Mafia fish games and slots on Dragon Fury. Sign up and launch in your browser — no download required.', 'Mafia fish games and slots with browser-based play on Dragon Fury.'),
  game('gamevault', 'Game Vault', 'Fish & Slots', '/optimized/games/gamevault.webp', 'Game Vault Online | Dragon Fury', 'Play Game Vault fish games and slots on Dragon Fury. Instant browser access with a wide table and slot list.', 'Game Vault fish games and slots, launched straight from Dragon Fury.'),
  game('juwa-2-0', 'Juwa 2.0', 'Fish & Slots', '/optimized/games/juwa2.0.webp', 'Juwa 2.0 Online | Dragon Fury', 'Access Juwa 2.0 fish games and slots through Dragon Fury. No download — sign up and play in your browser.', 'Juwa 2.0 — the next Juwa lineup, playable in your browser on Dragon Fury.'),
  game('milkyway', 'Milkyway', 'Fish & Slots', '/optimized/games/milkyway.webp', 'Milkyway Online | Dragon Fury', 'Launch Milkyway fish games and slots on Dragon Fury. Browser-based access, no app required.', 'Milkyway fish shooting and slots with instant web play.'),
  game('pandamasters', 'Pandamasters', 'Fish & Slots', '/optimized/games/pandamaster.webp', 'Pandamasters Online | Dragon Fury', 'Play Pandamasters fish games and slots through Dragon Fury. Sign up and play in your browser today.', 'Pandamasters fish tables and slots, ready on desktop or phone.'),
  game('riversweeps', 'Riversweeps', 'Fish & Slots', '/optimized/games/riversweeps.webp', 'Riversweeps Online | Dragon Fury', 'Access Riversweeps fish games and slots on Dragon Fury. No download needed — play in any modern browser.', 'Riversweeps fish games and slots with one login on Dragon Fury.'),
  game('vegasx', 'Vegasx', 'Casino & Slots', '/optimized/games/vegasx.webp', 'Vegasx Online | Dragon Fury', 'Play Vegasx casino games and slots on Dragon Fury. Simple login, browser-based play, no app download.', 'Vegasx casino and slots with fast browser play on Dragon Fury.')
];

const ALIASES = {
  'fire-kirin': 'firekirin',
  'orion-stars': 'orionstars',
  'game-vault': 'gamevault',
  'river-sweeps': 'riversweeps',
  'panda-masters': 'pandamasters',
  'juwa-2.0': 'juwa-2-0'
};

function game(slug, name, genre, image, metaTitle, lead, blurb) {
  return {
    slug,
    name,
    genre,
    catalogName: name,
    defaultImage: image,
    metaTitle,
    heroLead: lead,
    heroBlurb: blurb
  };
}

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const REDIRECT_SLUGS = new Set(['fish-game', 'grandsweeps']);

function resolveSlug(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (!slug || REDIRECT_SLUGS.has(slug)) return '';
  return ALIASES[slug] || slug;
}

function defaultButtons(name) {
  return [
    { label: `Play ${name}`, href: '/register' },
    { label: 'All games', href: '/games' }
  ];
}

function normalizeHref(raw, field) {
  if (raw == null || !String(raw).trim()) throw fail(`${field} is required.`);
  let s = String(raw).trim();
  if (s.length > 512) throw fail(`${field} is too long.`);
  if (/^https?:\/\//i.test(s)) {
    let url;
    try {
      url = new URL(s);
    } catch {
      throw fail(`${field} is not a valid URL.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw fail(`${field} must start with http:// or https://.`);
    }
    return url.href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    throw fail(`${field} must be a site path like /register, or a full http(s) URL.`);
  }
  if (!s.startsWith('/')) s = `/${s}`;
  if (!/^\/[a-zA-Z0-9#?=&%._/-]*$/.test(s)) {
    throw fail(`${field} may only use a site path or a full http(s) URL.`);
  }
  return s;
}

function normalizeImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('/')) return s.slice(0, 1024);
  if (/^https?:\/\//i.test(s)) {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw fail('Image URL must start with http:// or https://.');
    }
    return url.href.slice(0, 1024);
  }
  throw fail('Image must be an uploaded file or an http(s) URL.');
}

function normalizeButtons(raw, name) {
  if (!Array.isArray(raw)) return defaultButtons(name);
  const out = [];
  for (const item of raw.slice(0, MAX_BUTTONS)) {
    const label = String(item?.label || item?.text || '').trim().slice(0, 80);
    if (!label) continue;
    const href = normalizeHref(item?.href || item?.url, 'Button link');
    out.push({ label, href });
  }
  return out.length ? out : defaultButtons(name);
}

function normalizeFaqItems(raw) {
  if (!Array.isArray(raw)) return [];
  const items = [];
  for (const item of raw.slice(0, MAX_FAQ)) {
    const question = String(item?.question || '').trim().slice(0, 300);
    const answer = String(item?.answer || '').trim().slice(0, 4000);
    if (!question || !answer) continue;
    items.push({ question, answer });
  }
  return items;
}

function normalizeSections(raw) {
  const list = Array.isArray(raw?.blocks) ? raw.blocks : [];
  if (list.length > MAX_BLOCKS) throw fail(`You can add at most ${MAX_BLOCKS} content sections.`);
  const contentSource = list
    .filter((item) => item?.type !== 'faq')
    .map((item) => {
      const buttonUrl = item.buttonUrl || item.buttonHref || item.button_url || '';
      const buttonText = item.buttonText || item.button_text || '';
      return {
        ...item,
        buttonUrl,
        showButton: item.showButton === true || Boolean(String(buttonText).trim() && String(buttonUrl).trim())
      };
    });
  const laidOut = normalizeFooterSections({
    hero: {},
    blocks: contentSource
  });
  const contentQueue = laidOut.blocks.slice();
  const blocks = [];
  list.forEach((item, index) => {
    if (item?.type === 'faq') {
      blocks.push({
        type: 'faq',
        id: String(item.id || `faq-${index + 1}`).trim().slice(0, 64),
        title: String(item.title || 'FAQ').trim().slice(0, 200) || 'FAQ',
        items: normalizeFaqItems(item.items)
      });
      return;
    }
    const block = contentQueue.shift();
    if (block) blocks.push({ ...block, type: 'content' });
  });
  return { blocks };
}

function toPlain(row) {
  const p = row.get ? row.get({ plain: true }) : row;
  const name = p.name;
  const buttons = Array.isArray(p.buttons) && p.buttons.length ? p.buttons : defaultButtons(name);
  const sections = p.sections && Array.isArray(p.sections.blocks) ? p.sections : { blocks: [] };
  return {
    id: p.id,
    storeCode: p.storeCode,
    slug: p.slug,
    name,
    genre: p.genre || '',
    catalogName: p.catalogName || name,
    defaultImage: p.defaultImage || '',
    imageUrl: p.imageUrl || '',
    image: p.imageUrl || p.defaultImage || '',
    heroLead: p.heroLead || '',
    heroBlurb: p.heroBlurb || '',
    buttons,
    sections,
    metaTitle: p.metaTitle || '',
    metaDescription: p.metaDescription || '',
    metaTags: p.metaTags || '',
    canonicalUrl: p.canonicalUrl || '',
    allowIndex: p.allowIndex !== false,
    schemaEnabled: p.schemaEnabled !== false && p.schema_enabled !== false,
    schemaType: p.schemaType || p.schema_type || 'WebPage',
    schemaFields: p.schemaFields || p.schema_fields || {},
    schemaCustom: p.schemaCustom || p.schema_custom || '',
    ...lifecyclePlain(p),
    createdAt: p.createdAt || p.created_at || '',
    updatedAt: p.updatedAt || p.updated_at || '',
    sortOrder: p.sortOrder ?? 0,
    isActive: p.isActive !== false,
    title: p.metaTitle || `${name} Online | Dragon Fury`,
    description: p.metaDescription || p.heroLead || ''
  };
}

function catalogFor(storeCode) {
  if (normalizeStoreCode(storeCode) !== PLAYJUWA) return CATALOG;
  return CATALOG.map((item) => {
    if (item.slug === 'dragon-fury') {
      return {
        ...item,
        metaTitle: 'Dragon Fury Online | PlayJuwa',
        heroLead: 'Play Dragon Fury on PlayJuwa in your browser. Sign up free — no download required.',
        heroBlurb: 'Play Dragon Fury online in your browser on PlayJuwa.'
      };
    }
    const swap = (value) => String(value || '')
      .replace(/ \| Dragon Fury/g, ' | PlayJuwa')
      .replace(/ on Dragon Fury/g, ' on PlayJuwa')
      .replace(/ through Dragon Fury/g, ' through PlayJuwa');
    return {
      ...item,
      metaTitle: swap(item.metaTitle),
      heroLead: swap(item.heroLead),
      heroBlurb: swap(item.heroBlurb)
    };
  });
}

function assertStore(req, storeCode) {
  const sc = normalizeStoreCode(storeCode);
  if (!GAME_STORES.has(sc)) {
    throw fail('Game pages can only be edited for PlayJuwa and Dragon Fury.', 403);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    if (normalizeStoreCode(req.storeCode) !== sc) {
      throw fail('You do not have footer access for this store.', 403);
    }
    return sc;
  }
  if (req.role !== ROLES.MASTER_ADMIN) throw fail('Forbidden.', 403);
  const { getAdminFooterStoreCodes } = require('../footer/footer.service');
  const allowed = getAdminFooterStoreCodes(req);
  if (allowed != null && !allowed.includes(sc)) {
    throw fail('You do not have footer access for this store.', 403);
  }
  return sc;
}

async function ensureCatalog(storeCode) {
  const sc = normalizeStoreCode(storeCode);
  const catalog = catalogFor(sc);
  const existing = await db.GameSeoPage.findAll({
    where: { storeCode: sc },
    attributes: ['slug']
  });
  const have = new Set(existing.map((row) => row.slug));
  const missing = catalog.filter((item) => !have.has(item.slug));
  if (!missing.length) return;
  await db.GameSeoPage.bulkCreate(missing.map((item) => ({
    storeCode: sc,
    slug: item.slug,
    name: item.name,
    genre: item.genre,
    catalogName: item.catalogName,
    defaultImage: item.defaultImage,
    imageUrl: null,
    heroLead: item.heroLead,
    heroBlurb: item.heroBlurb,
    buttons: defaultButtons(item.name),
    sections: { hero: {}, blocks: [] },
    metaTitle: item.metaTitle,
    metaDescription: item.heroLead,
    metaTags: null,
    canonicalUrl: null,
    allowIndex: true,
    sortOrder: catalog.findIndex((row) => row.slug === item.slug),
    isActive: true
  })));
}

async function listAdmin(req, query = {}) {
  const storeCode = assertStore(req, query.storeCode || query.store_code || req.storeCode);
  await ensureCatalog(storeCode);
  const rows = await db.GameSeoPage.findAll({
    where: { storeCode, ...deletionWhere(query.status) },
    order: [['sortOrder', 'ASC'], ['name', 'ASC']]
  });
  return { game_pages: rows.map(toPlain) };
}

async function getAdmin(req, slug, query = {}) {
  const storeCode = assertStore(req, query.storeCode || query.store_code || req.storeCode);
  await ensureCatalog(storeCode);
  const resolved = resolveSlug(slug);
  const row = await db.GameSeoPage.findOne({ where: { storeCode, slug: resolved } });
  if (!row) throw fail('Game page not found.', 404);
  return { game_page: toPlain(row) };
}

async function updateAdmin(req, slug, body = {}) {
  const storeCode = assertStore(req, body.storeCode || body.store_code || req.storeCode);
  await ensureCatalog(storeCode);
  const resolved = resolveSlug(slug);
  const row = await db.GameSeoPage.findOne({ where: { storeCode, slug: resolved } });
  if (!row) throw fail('Game page not found.', 404);

  const name = String(body.name || row.name).trim();
  if (!name) throw fail('Name is required.');
  const genre = String(body.genre ?? row.genre ?? '').trim().slice(0, 128);
  const heroLead = String(body.heroLead ?? body.hero_lead ?? '').trim().slice(0, 4000);
  const heroBlurb = String(body.heroBlurb ?? body.hero_blurb ?? '').trim().slice(0, 4000);
  const imageUrl = body.imageUrl === undefined && body.image_url === undefined
    ? row.imageUrl
    : normalizeImageUrl(body.imageUrl ?? body.image_url);
  const buttons = normalizeButtons(body.buttons, name);
  const sections = normalizeSections(body.sections);
  const metaTitle = String(body.metaTitle ?? body.meta_title ?? '').trim().slice(0, 512) || null;
  const metaDescription = String(body.metaDescription ?? body.meta_description ?? '').trim().slice(0, 2000) || null;
  const metaTags = String(body.metaTags ?? body.meta_tags ?? '').trim().slice(0, 1024) || null;
  const schemaPatch = (body.schemaEnabled !== undefined || body.schemaType || body.schemaFields || body.schemaCustom !== undefined)
    ? schemaFromBody(body, 'WebPage')
    : null;
  const canonicalUrl = canonicalUrlFromBody(body);
  const allowIndex = body.allowIndex === undefined && body.allow_index === undefined
    ? row.allowIndex
    : !(body.allowIndex === false || body.allow_index === false || body.allowIndex === 'false');
  const isActive = body.isActive === undefined
    ? row.isActive
    : !(body.isActive === false || body.isActive === 'false');
  const permanentRedirect = redirectPatch(body, storeCode, 'game', `/games/${resolved}`);

  await row.update({
    name,
    genre: genre || null,
    heroLead: heroLead || null,
    heroBlurb: heroBlurb || null,
    imageUrl,
    buttons,
    sections,
    metaTitle,
    metaDescription,
    metaTags,
    ...(canonicalUrl !== undefined ? { canonicalUrl } : {}),
    ...(schemaPatch || {}),
    allowIndex,
    isActive,
    ...(permanentRedirect !== undefined ? { permanentRedirect } : {})
  });
  return { game_page: toPlain(row) };
}

async function deleteAdmin(req, slug, query = {}) {
  const storeCode = assertStore(req, query.storeCode || query.store_code || req.storeCode);
  await ensureCatalog(storeCode);
  const resolved = resolveSlug(slug);
  const row = await db.GameSeoPage.findOne({ where: { storeCode, slug: resolved } });
  if (!row) throw fail('Game page not found.', 404);
  if (!row.deletedAt) {
    await row.update(stampDelete(await actorFromReq(req)));
  }
  return { deleted: true, slug: resolved, soft: true };
}

async function restoreAdmin(req, slug, query = {}) {
  const storeCode = assertStore(req, query.storeCode || query.store_code || req.storeCode);
  await ensureCatalog(storeCode);
  const resolved = resolveSlug(slug);
  const row = await db.GameSeoPage.findOne({ where: { storeCode, slug: resolved } });
  if (!row) throw fail('Game page not found.', 404);
  if (row.deletedAt) {
    await row.update(stampRestore(await actorFromReq(req)));
  }
  return { game_page: toPlain(row) };
}

async function setVisibilityAdmin(req, slug, body = {}) {
  const storeCode = assertStore(req, body.storeCode || body.store_code || req.storeCode);
  await ensureCatalog(storeCode);
  const resolved = resolveSlug(slug);
  const row = await db.GameSeoPage.findOne({ where: { storeCode, slug: resolved } });
  if (!row) throw fail('Game page not found.', 404);
  const isActive = !(body.isActive === false || body.isActive === 'false' || body.isActive === 0);
  await row.update({ isActive });
  return { game_page: toPlain(row) };
}

async function listPublic(storeCode) {
  const sc = normalizeStoreCode(storeCode);
  if (!GAME_STORES.has(sc)) return { game_pages: [] };
  await ensureCatalog(sc);
  const rows = await db.GameSeoPage.findAll({
    where: {
      storeCode: sc,
      isActive: true,
      deletedAt: null,
      [Op.or]: [{ permanentRedirect: null }, { permanentRedirect: '' }]
    },
    order: [['sortOrder', 'ASC'], ['name', 'ASC']]
  });
  return { game_pages: rows.map(toPlain) };
}

async function getPublic(storeCode, slug) {
  const sc = normalizeStoreCode(storeCode);
  if (!GAME_STORES.has(sc)) return { game_page: null };
  const resolved = resolveSlug(slug);
  if (!resolved) return { game_page: null };
  await ensureCatalog(sc);
  const row = await db.GameSeoPage.findOne({ where: { storeCode: sc, slug: resolved } });
  if (!row) return { game_page: null };
  const dest = String(row.permanentRedirect || '').trim();
  if (dest) return { redirect: dest, status: 301 };
  if (row.deletedAt || row.isActive === false) return { game_page: null, hidden: true };
  const game_page = toPlain(row);
  const schema = schemaForGamePage({
    origin: PLAYJUWA_ORIGIN,
    storeLabel: PLAYJUWA_ORIGIN.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    page: game_page
  });
  if (schema !== undefined) game_page.schema = schema;
  return { game_page };
}

module.exports = {
  STORE,
  listAdmin,
  getAdmin,
  updateAdmin,
  setVisibilityAdmin,
  deleteAdmin,
  restoreAdmin,
  listPublic,
  getPublic,
  resolveSlug
};
