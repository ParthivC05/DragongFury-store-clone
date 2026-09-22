'use strict';

const { createLogger } = require('./logger');

const log = createLogger('firebase');

let messaging = null;
let initAttempted = false;

/**
 * This store's own Firebase Admin from FIREBASE_* in this backend .env.
 * storeCode is ignored — Partner Platform is what routes multi-store sends.
 */
function getFirebaseMessaging(_storeCode) {
  if (initAttempted) return messaging;
  initAttempted = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    log.warn('Firebase Admin not configured (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY). Push disabled.');
    return null;
  }

  try {
    privateKey = String(privateKey).replace(/\\n/g, '\n');
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    }

    messaging = getMessaging();
    log.info('Firebase Admin messaging ready', { projectId });
  } catch (err) {
    log.error('Firebase Admin init failed', { error: err.message });
    messaging = null;
  }

  return messaging;
}

module.exports = { getFirebaseMessaging };
