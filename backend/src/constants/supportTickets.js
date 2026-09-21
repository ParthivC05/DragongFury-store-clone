'use strict';

const SUPPORT_TICKET_CATEGORIES = Object.freeze([
  'deposit',
  'withdraw',
  'games',
  'account',
  'bonus',
  'other'
]);

const SUPPORT_TICKET_STATUSES = Object.freeze([
  'open',
  'in_progress',
  'resolved',
  'closed'
]);

const SUPPORT_TICKET_AUTHOR_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin'
});

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

function isValidCategory(category) {
  return SUPPORT_TICKET_CATEGORIES.includes(String(category || '').trim());
}

function isValidStatus(status) {
  return SUPPORT_TICKET_STATUSES.includes(String(status || '').trim());
}

module.exports = {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_AUTHOR_ROLES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_SUBJECT_LENGTH,
  MAX_BODY_LENGTH,
  isValidCategory,
  isValidStatus
};
