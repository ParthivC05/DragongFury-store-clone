const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { HELP_TOPICS, HELP_TOPIC_IDS } = require('../../constants/helpTopics');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { Op } = require('sequelize');

/** Resolve store_code for current admin: platform default = null, store override = req.storeCode */
function getStoreCodeForAdmin(req) {
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.storeCode) return req.storeCode;
  return null;
}

/** List all help topics with default and (for store_admin) store override content */
async function list(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.HELP_CONTENT)) {
      return sendError(res, 'You don\'t have access to Help content. Please contact your administrator if you need access.', 403);
    }
    const storeCode = getStoreCodeForAdmin(req);
    const defaults = await db.HelpContent.findAll({
      where: { storeCode: { [Op.or]: [null, ''] } },
      attributes: ['topic', 'content', 'videoUrl', 'sortOrder']
    });
    const defaultByTopic = {};
    defaults.forEach((d) => {
      const t = d.topic || d.get('topic');
      defaultByTopic[t] = { content: d.content, video_url: d.videoUrl, sort_order: d.sortOrder };
    });

    let storeByTopic = {};
    if (storeCode) {
      const storeRows = await db.HelpContent.findAll({
        where: { storeCode },
        attributes: ['topic', 'content', 'videoUrl', 'sortOrder']
      });
      storeRows.forEach((r) => {
        const t = r.topic || r.get('topic');
        storeByTopic[t] = { content: r.content, video_url: r.videoUrl, sort_order: r.sortOrder };
      });
    }

    const topics = HELP_TOPICS.map((t) => ({
      id: t.id,
      label: t.label,
      sort_order: t.sortOrder,
      default_content: defaultByTopic[t.id]?.content ?? null,
      default_video_url: defaultByTopic[t.id]?.video_url ?? null,
      store_content: storeByTopic[t.id]?.content ?? null,
      store_video_url: storeByTopic[t.id]?.video_url ?? null,
      use_default: storeCode ? !(storeByTopic[t.id] != null) : null
    }));

    return sendSuccess(res, { topics });
  } catch (err) {
    return sendError(res, err.message || 'Failed to list help content', err.statusCode || 500);
  }
}

/** Get one topic content for editing (default for master, store override for store_admin) */
async function getOne(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.HELP_CONTENT)) {
      return sendError(res, 'You don\'t have access to Help content. Please contact your administrator if you need access.', 403);
    }
    const { topic } = req.params;
    if (!HELP_TOPIC_IDS.includes(topic)) {
      return sendError(res, 'Invalid topic', 400);
    }
    const storeCode = getStoreCodeForAdmin(req);

    const row = await db.HelpContent.findOne({
      where: { topic, storeCode: storeCode || { [Op.or]: [null, ''] } }
    });
    const defaultRow = await db.HelpContent.findOne({
      where: { topic, storeCode: { [Op.or]: [null, ''] } }
    });

    const label = HELP_TOPICS.find((t) => t.id === topic)?.label || topic;
    return sendSuccess(res, {
      topic,
      label,
      content: row?.content ?? defaultRow?.content ?? '',
      video_url: row?.videoUrl ?? defaultRow?.videoUrl ?? '',
      is_default: !storeCode || !row,
      default_content: defaultRow?.content ?? '',
      default_video_url: defaultRow?.videoUrl ?? ''
    });
  } catch (err) {
    return sendError(res, err.message || 'Failed to get help content', err.statusCode || 500);
  }
}

/** Create or update help content. Master: update platform default. Store_admin: update store override (or delete if use_default). */
async function upsert(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.HELP_CONTENT)) {
      return sendError(res, 'You don\'t have access to Help content. Please contact your administrator if you need access.', 403);
    }
    const { topic } = req.params;
    if (!HELP_TOPIC_IDS.includes(topic)) {
      return sendError(res, 'Invalid topic', 400);
    }
    const storeCode = getStoreCodeForAdmin(req);
    const { content, video_url, use_default } = req.body || {};

    const contentVal = content != null ? String(content) : '';
    const videoUrlVal = video_url != null && String(video_url).trim() !== '' ? String(video_url).trim() : null;

    if (storeCode && use_default === true) {
      await db.HelpContent.destroy({ where: { topic, storeCode } });
      return sendSuccess(res, { topic, use_default: true });
    }

    const where = { topic, storeCode: storeCode || null };
    let row = await db.HelpContent.findOne({ where });
    const sortOrder = HELP_TOPICS.find((t) => t.id === topic)?.sortOrder ?? 0;
    if (row) {
      await row.update({ content: contentVal, videoUrl: videoUrlVal });
    } else {
      row = await db.HelpContent.create({
        topic,
        storeCode: storeCode || null,
        content: contentVal,
        videoUrl: videoUrlVal,
        sortOrder
      });
    }
    return sendSuccess(res, { topic, content: row.content, video_url: row.videoUrl });
  } catch (err) {
    return sendError(res, err.message || 'Failed to save help content', err.statusCode || 500);
  }
}

module.exports = {
  list,
  getOne,
  upsert
};
