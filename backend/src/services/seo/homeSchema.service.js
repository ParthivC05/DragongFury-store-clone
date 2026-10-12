'use strict';

const db = require('../../db/models');
const {
  PLAYJUWA_ORIGIN,
  isPlayjuwa,
  buildManagedSchema,
  homeAuto,
  schemaFromBody,
  originForStore,
  hostFromOrigin
} = require('./pageSchema.service');

const HOME_KEY = 'home';

function present(row) {
  const plain = row?.get ? row.get({ plain: true }) : row;
  return {
    schemaEnabled: plain ? plain.schemaEnabled !== false : true,
    schemaType: plain?.schemaType || 'WebPage',
    schemaFields: plain?.schemaFields || {},
    schemaCustom: plain?.schemaCustom || ''
  };
}

function buildHome(record, { origin, storeLabel } = {}) {
  const saved = present(record);
  const auto = homeAuto({
    origin: origin || PLAYJUWA_ORIGIN,
    storeLabel: storeLabel || 'dragonfury.casino'
  });
  let schema = null;
  let schemaError = '';
  try {
    schema = buildManagedSchema({ ...saved, auto });
  } catch (err) {
    schemaError = err.message || 'Schema JSON-LD is not valid JSON.';
  }
  return { ...saved, auto, schema, schemaError };
}

function normalizeSchemaStore(storeCode) {
  return String(storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getHome(storeCode, { origin, storeLabel } = {}) {
  const code = normalizeSchemaStore(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const row = await db.PageSchema.findOne({
    where: { storeCode: code, pageKey: HOME_KEY }
  });
  const resolvedOrigin = origin || originForStore(code);
  return buildHome(row, {
    origin: resolvedOrigin,
    storeLabel: storeLabel || hostFromOrigin(resolvedOrigin)
  });
}

async function saveHome(storeCode, body = {}, { origin, storeLabel } = {}) {
  const code = normalizeSchemaStore(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const saved = schemaFromBody(body, 'WebPage');
  const [row] = await db.PageSchema.findOrCreate({
    where: { storeCode: code, pageKey: HOME_KEY },
    defaults: {
      storeCode: code,
      pageKey: HOME_KEY,
      ...saved
    }
  });
  await row.update(saved);
  const resolvedOrigin = origin || originForStore(code);
  return buildHome(row, {
    origin: resolvedOrigin,
    storeLabel: storeLabel || hostFromOrigin(resolvedOrigin)
  });
}

module.exports = {
  isPlayjuwa,
  getHome,
  saveHome
};
