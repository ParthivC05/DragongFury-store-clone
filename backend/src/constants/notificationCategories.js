'use strict';

/** In-app notification groupings for admin (and API filtering). */
const MANUAL_REQUESTS = 'manual_requests';
const AUTOMATION_UPDATES = 'automation_updates';
const OTHER = 'other';

const ALL = [MANUAL_REQUESTS, AUTOMATION_UPDATES, OTHER];

function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return OTHER;
  const c = cat.trim().toLowerCase().replace(/-/g, '_');
  return ALL.includes(c) ? c : OTHER;
}

module.exports = {
  MANUAL_REQUESTS,
  AUTOMATION_UPDATES,
  OTHER,
  ALL,
  normalizeCategory,
  NOTIFICATION_CATEGORIES: {
    MANUAL_REQUESTS,
    AUTOMATION_UPDATES,
    OTHER
  }
};
