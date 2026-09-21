'use strict';

const { createLogger } = require('./logger');

const log = createLogger('firebase');

let messaging = null;
let initAttempted = false;

/**
 * Lazy-init Firebase Admin from env (service account).
 * Returns messaging API or null if not configured / init failed.
 */
function getFirebaseMessaging() {
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
    privateKey = privateKey.replace(/\\n/g, '\n');
    // firebase-admin v12+ modular API (no admin.apps / admin.credential)
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
    log.info('Firebase Admin messaging ready');
  } catch (err) {
    log.error('Firebase Admin init failed', { error: err.message });
    messaging = null;
  }

  return messaging;
}

module.exports = { getFirebaseMessaging };
