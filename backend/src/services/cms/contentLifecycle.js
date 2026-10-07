'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');

const PLAYJUWA = 'playjuwa';
const GAME_STORES = new Set(['playjuwa', 'dragonfury']);

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Blog posts and footer pages: every store. Game pages: PlayJuwa and Dragon Fury. */
function supportsLifecycle(kind, storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (kind === 'game') return GAME_STORES.has(code);
  return true;
}

async function actorFromReq(req) {
  const id = req?.user?.userId != null ? parseInt(req.user.userId, 10) : null;
  const userId = Number.isFinite(id) ? id : null;
  let name = '';
  if (userId && db.User) {
    const user = await db.User.findByPk(userId, {
      attributes: ['firstName', 'username', 'email']
    });
    name = String(user?.firstName || user?.username || user?.email || '').trim();
  }
  return { id: userId, name: name.slice(0, 255) };
}

function stampDelete(actor) {
  return {
    deletedAt: new Date(),
    deletedById: actor?.id || null,
    deletedByName: (actor?.name || 'Admin').slice(0, 255)
  };
}

function stampRestore(actor) {
  return {
    deletedAt: null,
    deletedById: null,
    deletedByName: null,
    restoredAt: new Date(),
    restoredById: actor?.id || null,
    restoredByName: (actor?.name || 'Admin').slice(0, 255)
  };
}

function deletionWhere(status) {
  if (String(status || '').trim().toLowerCase() === 'deleted') {
    return { deletedAt: { [Op.ne]: null } };
  }
  return { deletedAt: null };
}

function visibleWhere() {
  return {
    deletedAt: null,
    [Op.or]: [{ permanentRedirect: null }, { permanentRedirect: '' }]
  };
}

function parsePermanentRedirect(raw, ownPath) {
  if (raw === undefined) return undefined;
  const text = raw == null ? '' : String(raw).trim();
  if (!text) return null;

  let dest = text;
  if (/^https?:\/\//i.test(dest)) {
    let url;
    try {
      url = new URL(dest);
    } catch {
      const err = new Error('Redirect must be a site path like /blog/post or a full https link.');
      err.statusCode = 400;
      throw err;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      const err = new Error('Redirect must start with http:// or https://.');
      err.statusCode = 400;
      throw err;
    }
    dest = url.toString();
  } else {
    if (!dest.startsWith('/')) dest = `/${dest}`;
    dest = dest.replace(/\/{2,}/g, '/');
    if (dest.length > 1 && dest.endsWith('/')) dest = dest.slice(0, -1);
    if (!/^\/[a-z0-9\-._~/%]*$/i.test(dest)) {
      const err = new Error('Redirect must be a site path like /blog/post or a full https link.');
      err.statusCode = 400;
      throw err;
    }
  }

  const own = String(ownPath || '').trim();
  if (own && dest === own) {
    const err = new Error('A page cannot redirect to itself.');
    err.statusCode = 400;
    throw err;
  }
  if (dest.length > 1024) {
    const err = new Error('Redirect is too long.');
    err.statusCode = 400;
    throw err;
  }
  return dest;
}

function redirectPatch(body, storeCode, kind, ownPath) {
  if (!supportsLifecycle(kind, storeCode)) return undefined;
  const raw = body?.permanentRedirect !== undefined ? body.permanentRedirect : body?.permanent_redirect;
  if (raw === undefined) return undefined;
  return parsePermanentRedirect(raw, ownPath);
}

function redirectResult(value) {
  const dest = String(value || '').trim();
  if (!dest) return null;
  return { redirect: dest, status: 301 };
}

function lifecyclePlain(p) {
  return {
    permanentRedirect: p.permanentRedirect || p.permanent_redirect || '',
    deletedAt: p.deletedAt || p.deleted_at || null,
    deletedByName: p.deletedByName || p.deleted_by_name || '',
    restoredAt: p.restoredAt || p.restored_at || null,
    restoredByName: p.restoredByName || p.restored_by_name || ''
  };
}

function absoluteTarget(origin, dest) {
  const text = String(dest || '').trim();
  if (/^https?:\/\//i.test(text)) return text;
  const base = String(origin || '').replace(/\/$/, '');
  const path = text.startsWith('/') ? text : `/${text}`;
  return `${base}${path}`;
}

module.exports = {
  Op,
  supportsLifecycle,
  actorFromReq,
  stampDelete,
  stampRestore,
  deletionWhere,
  visibleWhere,
  parsePermanentRedirect,
  redirectPatch,
  redirectResult,
  lifecyclePlain,
  absoluteTarget
};
