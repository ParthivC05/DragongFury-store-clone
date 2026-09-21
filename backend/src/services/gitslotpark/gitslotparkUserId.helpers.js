'use strict';

const MIN_LENGTH = 4;
const MAX_LENGTH = 48;
const ALPHANUMERIC = /^[a-zA-Z0-9]+$/;

function stripNonAlphanumeric(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9]/g, '');
}

function padToMinLength(value) {
  let result = value;
  while (result.length > 0 && result.length < MIN_LENGTH) {
    result += '0';
  }
  return result;
}

/**
 * Build a GitSlotPark-compatible userID from platform identity.
 * Rules: alphanumeric only, 4–48 characters. Output is stable per user.
 *
 * @param {string|null|undefined} username
 * @param {number|string|null|undefined} userId
 * @returns {string|null}
 */
function buildGitslotparkUserId(username, userId) {
  const cleanName = stripNonAlphanumeric(username);
  const cleanId = stripNonAlphanumeric(userId);

  let userID = cleanName;

  if (userID.length < MIN_LENGTH) {
    userID = cleanName + cleanId;
  }

  if (userID.length > 0 && userID.length < MIN_LENGTH) {
    userID = padToMinLength(userID);
  }

  if (userID.length < MIN_LENGTH) {
    userID = padToMinLength(`u${cleanId || '0'}`);
  }

  userID = userID.slice(0, MAX_LENGTH);

  if (userID.length < MIN_LENGTH || userID.length > MAX_LENGTH || !ALPHANUMERIC.test(userID)) {
    return null;
  }

  return userID;
}

module.exports = {
  MIN_LENGTH,
  MAX_LENGTH,
  buildGitslotparkUserId
};
