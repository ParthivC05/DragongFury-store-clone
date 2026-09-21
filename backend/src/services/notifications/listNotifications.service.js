const db = require('../../db/models');
const { Op } = require('sequelize');
const { NOTIFICATION_CATEGORIES, normalizeCategory } = require('../../constants/notificationCategories');

function emptyUnreadByCategory() {
  return {
    [NOTIFICATION_CATEGORIES.MANUAL_REQUESTS]: 0,
    [NOTIFICATION_CATEGORIES.AUTOMATION_UPDATES]: 0,
    [NOTIFICATION_CATEGORIES.OTHER]: 0
  };
}

/**
 * List notifications for user, newest first.
 */
async function listNotifications(userId, options = {}) {
  const { limit = 50, offset = 0, unreadOnly = false, category: categoryFilter } = options;
  const where = { userId };
  if (unreadOnly) where.readAt = null;
  if (categoryFilter) {
    const c = normalizeCategory(categoryFilter);
    if (c === NOTIFICATION_CATEGORIES.OTHER) {
      where.category = { [Op.or]: [NOTIFICATION_CATEGORIES.OTHER, null] };
    } else {
      where.category = c;
    }
  }

  const { count, rows } = await db.Notification.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(limit) || 50, 100),
    offset: Math.max(0, Number(offset) || 0),
    attributes: ['id', 'type', 'title', 'message', 'readAt', 'created_at', 'actionUrl', 'category'],
    raw: true
  });

  return {
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      read_at: r.readAt,
      created_at: r.created_at,
      action_url: r.actionUrl || null,
      category: normalizeCategory(r.category)
    })),
    total: count
  };
}

/**
 * Count unread notifications for user; includes per-tab breakdown for admin UI.
 */
async function getUnreadCount(userId) {
  const total = await db.Notification.count({
    where: { userId, readAt: null }
  });
  const rows = await db.Notification.findAll({
    attributes: ['category', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt']],
    where: { userId, readAt: null },
    group: ['category'],
    raw: true
  });
  const unreadByCategory = emptyUnreadByCategory();
  for (const r of rows) {
    const key = normalizeCategory(r.category);
    const n = Number(r.cnt);
    unreadByCategory[key] = (unreadByCategory[key] || 0) + (Number.isFinite(n) ? n : 0);
  }
  return { unread_count: total, unread_by_category: unreadByCategory };
}

/**
 * Mark one or all notifications as read.
 */
async function markRead(userId, notificationId = null) {
  const where = { userId };
  if (notificationId != null) {
    where.id = Number(notificationId);
  } else {
    where.readAt = null;
  }
  const [updated] = await db.Notification.update(
    { readAt: new Date() },
    { where }
  );
  return { marked: updated };
}

module.exports = { listNotifications, getUnreadCount, markRead };
