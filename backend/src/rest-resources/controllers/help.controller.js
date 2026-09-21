const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { HELP_TOPICS } = require('../../constants/helpTopics');
const { Op } = require('sequelize');

/** Public: get help content for display. Optional store_code in query to get store override merged with default. */
async function getHelp(req, res) {
  try {
    const storeCode = (req.query.store_code && String(req.query.store_code).trim()) || null;

    const defaults = await db.HelpContent.findAll({
      where: { storeCode: { [Op.or]: [null, ''] } },
      attributes: ['topic', 'content', 'videoUrl', 'sortOrder']
    });
    const defaultByTopic = {};
    defaults.forEach((d) => {
      const t = d.topic || d.get('topic');
      defaultByTopic[t] = { content: d.content, videoUrl: d.videoUrl, sortOrder: d.sortOrder };
    });

    let storeByTopic = {};
    if (storeCode) {
      const storeRows = await db.HelpContent.findAll({
        where: { storeCode },
        attributes: ['topic', 'content', 'videoUrl']
      });
      storeRows.forEach((r) => {
        const t = r.topic || r.get('topic');
        storeByTopic[t] = { content: r.content, videoUrl: r.videoUrl };
      });
    }

    const topics = HELP_TOPICS.map((t) => {
      const store = storeByTopic[t.id];
      const def = defaultByTopic[t.id];
      return {
        id: t.id,
        label: t.label,
        sort_order: t.sortOrder,
        content: (store?.content != null && store.content !== '') ? store.content : (def?.content ?? ''),
        video_url: (store?.videoUrl != null && store.videoUrl !== '') ? store.videoUrl : (def?.videoUrl ?? null)
      };
    });

    return sendSuccess(res, { topics });
  } catch (err) {
    return sendError(res, err.message || 'Failed to get help', err.statusCode || 500);
  }
}

module.exports = { getHelp };
