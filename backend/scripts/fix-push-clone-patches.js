'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const CLONES = [
  'myvepower-store-clone',
  'lucky-winner-store-clone',
  'grandsweep-store-clone',
  'sweepstakebet-store-clone',
  'casinoslots-store-clone',
  'winners4-store-clone',
  'good-g-dragon-store-clone'
];

const PUSH_ADMIN_ROUTES = `
router.post(
  '/push-campaigns/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminPushCampaignsController.uploadImage
);
router.get('/push-campaigns', adminPushCampaignsController.listCampaigns);
router.post('/push-campaigns', adminPushCampaignsController.createCampaign);
router.get('/push-campaigns/:id', adminPushCampaignsController.getCampaign);
router.patch('/push-campaigns/:id', adminPushCampaignsController.updateCampaign);
router.get('/push-campaigns/:id/test-users', adminPushCampaignsController.listTestUsers);
router.post('/push-campaigns/:id/test-users', adminPushCampaignsController.addTestUser);
router.delete('/push-campaigns/:id/test-users/:testUserId', adminPushCampaignsController.removeTestUser);
router.get('/push-campaigns/:id/sends', adminPushCampaignsController.listSends);
router.post('/push-campaigns/:id/send-test', adminPushCampaignsController.sendTest);
router.post('/push-campaigns/:id/send-to-test-users', adminPushCampaignsController.sendToTestUsers);
router.post('/push-campaigns/:id/send', adminPushCampaignsController.sendBroadcast);
router.get('/push-campaigns/:id/eligible-count', adminPushCampaignsController.eligibleCount);

`;

function patch(file, fn) {
  if (!fs.existsSync(file)) {
    console.warn('missing', file);
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) fs.writeFileSync(file, after);
}

for (const clone of CLONES) {
  const base = path.join(ROOT, clone);
  console.log('fix', clone);

  patch(path.join(base, 'backend/src/rest-resources/routes/admin.routes.js'), (s) => {
    if (s.includes("router.get('/push-campaigns'")) return s;
    return s.replace(
      /router\.get\('\/email-campaigns\/:id\/eligible-count', adminEmailCampaignsController\.eligibleCount\);\r?\n/,
      (m) => `${m}${PUSH_ADMIN_ROUTES}`
    );
  });

  patch(path.join(base, 'backend/src/constants/permissions.js'), (s) => {
    if (s.includes("PUSH_CAMPAIGNS: 'push_campaigns'")) return s;
    s = s.replace(
      /(EMAIL_CAMPAIGNS: 'email_campaigns',\r?\n)(\s+SOCIAL_LINKS:)/g,
      "$1  /** Browser push notifications (per store). */\n  PUSH_CAMPAIGNS: 'push_campaigns',\n$2"
    );
    s = s.replace(
      /(EMAIL_CAMPAIGNS: 'email_campaigns',\r?\n)(\s+\/\*\* Read-only bonus activity report)/g,
      "$1  /** Browser push notifications (per store). */\n  PUSH_CAMPAIGNS: 'push_campaigns',\n$2"
    );
    return s;
  });

  patch(path.join(base, 'backend/src/db/runMigrations.js'), (s) => {
    if (s.includes('await ensurePushCampaignsSchema(sequelize);')) return s;
    return s.replace(
      /await ensureFooterMenusPagesSchema\(sequelize\);\r?\n(\s*)await ensureLegalPagesSchema\(sequelize\);/,
      'await ensureFooterMenusPagesSchema(sequelize);\n$1await ensurePushCampaignsSchema(sequelize);\n$1await ensureLegalPagesSchema(sequelize);'
    );
  });

  patch(path.join(base, 'frontend/src/context/AuthContext.jsx'), (s) => {
    if (s.includes('unlinkStoredFcmToken')) return s;
    return s.replace(
      /const \{ unregisterStoredFcmToken \} = await import\('\.\.\/lib\/firebaseMessaging'\);\r?\n\s*const notificationsApi = await import\('\.\.\/api\/notifications'\);\r?\n\s*(?:\/\/[^\n]*\r?\n\s*)?await unregisterStoredFcmToken\(\(token\) => notificationsApi\.unregisterDeviceToken\(token\)\);/,
      `const { unlinkStoredFcmToken } = await import('../lib/firebaseMessaging');\n        const { getOrCreatePushDeviceId } = await import('../lib/pushDevice');\n        const notificationsApi = await import('../api/notifications');\n        await unlinkStoredFcmToken((token) =>\n          notificationsApi.unlinkPushDevice({\n            deviceId: getOrCreatePushDeviceId(),\n            token\n          })\n        );`
    );
  });

  patch(path.join(base, 'admin/src/constants/permissions.js'), (s) => {
    if (s.includes("PUSH_CAMPAIGNS: 'push_campaigns'")) return s;
    s = s.replace(
      /(EMAIL_CAMPAIGNS: 'email_campaigns',\r?\n)(\s+SOCIAL_LINKS:)/g,
      "$1  PUSH_CAMPAIGNS: 'push_campaigns',\n$2"
    );
    s = s.replace(
      /(EMAIL_CAMPAIGNS: 'email_campaigns',\r?\n)(\s+\/\*\* Read-only bonus activity report)/g,
      "$1  PUSH_CAMPAIGNS: 'push_campaigns',\n$2"
    );
    return s;
  });
}

console.log('fix done');
