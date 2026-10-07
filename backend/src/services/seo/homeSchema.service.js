'use strict';

const db = require('../../db/models');
const {
  PLAYJUWA,
  PLAYJUWA_ORIGIN,
  isPlayjuwa,
  buildManagedSchema,
  homeAuto,
  schemaFromBody
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

async function getHome({ origin, storeLabel } = {}) {
  const row = await db.PageSchema.findOne({
    where: { storeCode: PLAYJUWA, pageKey: HOME_KEY }
  });
  return buildHome(row, { origin, storeLabel });
}

async function saveHome(body = {}) {
  const saved = schemaFromBody(body, 'WebPage');
  const [row] = await db.PageSchema.findOrCreate({
    where: { storeCode: PLAYJUWA, pageKey: HOME_KEY },
    defaults: {
      storeCode: PLAYJUWA,
      pageKey: HOME_KEY,
      ...saved
    }
  });
  await row.update(saved);
  return buildHome(row, { origin: PLAYJUWA_ORIGIN, storeLabel: 'dragonfury.casino' });
}

module.exports = {
  isPlayjuwa,
  getHome,
  saveHome
};
