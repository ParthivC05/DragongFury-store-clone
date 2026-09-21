'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const PP = path.join(ROOT, 'Partner Platform', 'partner-platform-');
const PP_ADMIN = path.join(ROOT, 'Partner Platform', 'partner-platform-admin');

const CLONES = [
  'myvepower-store-clone',
  'lucky-winner-store-clone',
  'grandsweep-store-clone',
  'sweepstakebet-store-clone',
  'casinoslots-store-clone',
  'winners4-store-clone',
  'good-g-dragon-store-clone'
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, contents) {
  fs.writeFileSync(file, contents);
}

function insertOnce(file, needle, addition, mode = 'after') {
  if (!fs.existsSync(file)) {
    console.warn('missing file', file);
    return;
  }
  let s = read(file);
  if (s.includes(addition.trim())) return;
  if (!s.includes(needle)) {
    console.warn('needle missing in', file, JSON.stringify(needle.slice(0, 80)));
    return;
  }
  s = mode === 'after' ? s.replace(needle, needle + addition) : s.replace(needle, addition + needle);
  write(file, s);
}

function replaceOnce(file, from, to) {
  if (!fs.existsSync(file)) return;
  let s = read(file);
  if (s.includes(to) && !s.includes(from)) return;
  if (!s.includes(from)) {
    console.warn('replace from missing', file, JSON.stringify(from.slice(0, 80)));
    return;
  }
  write(file, s.replace(from, to));
}

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

const ENSURE_FN = `async function ensurePushCampaignsSchema(sequelize) {
  if (!(await tableExists(sequelize, 'user_device_tokens'))) return;
  if (await tableExists(sequelize, 'push_campaigns')) return;
  const mig = require('./migrations/20260915223000-push-campaigns-playjuwa');
  await mig.up(sequelize.getQueryInterface(), sequelize.Sequelize);
  logger.info('Push campaigns schema ensured');
}

`;

for (const clone of CLONES) {
  const base = path.join(ROOT, clone);
  if (!fs.existsSync(base)) {
    console.warn('skip missing clone', clone);
    continue;
  }
  console.log('updating', clone);

  const copies = [
    ['backend/src/services/pushCampaigns/constants.js', 'backend/src/services/pushCampaigns/constants.js'],
    ['backend/src/services/pushCampaigns/deviceRegistry.service.js', 'backend/src/services/pushCampaigns/deviceRegistry.service.js'],
    ['backend/src/services/pushCampaigns/sendPushCampaign.service.js', 'backend/src/services/pushCampaigns/sendPushCampaign.service.js'],
    ['backend/src/services/pushCampaigns/adminPushCampaigns.service.js', 'backend/src/services/pushCampaigns/adminPushCampaigns.service.js'],
    ['backend/src/db/models/pushCampaign.js', 'backend/src/db/models/pushCampaign.js'],
    ['backend/src/db/models/pushCampaignTestUser.js', 'backend/src/db/models/pushCampaignTestUser.js'],
    ['backend/src/db/models/pushCampaignSend.js', 'backend/src/db/models/pushCampaignSend.js'],
    ['backend/src/db/models/userDeviceToken.js', 'backend/src/db/models/userDeviceToken.js'],
    ['backend/src/db/migrations/20260915223000-push-campaigns-playjuwa.js', 'backend/src/db/migrations/20260915223000-push-campaigns-playjuwa.js'],
    ['backend/src/rest-resources/controllers/pushCampaigns.controller.js', 'backend/src/rest-resources/controllers/pushCampaigns.controller.js'],
    ['backend/src/rest-resources/controllers/adminPushCampaigns.controller.js', 'backend/src/rest-resources/controllers/adminPushCampaigns.controller.js'],
    ['backend/src/rest-resources/routes/pushCampaigns.routes.js', 'backend/src/rest-resources/routes/pushCampaigns.routes.js'],
    ['backend/src/rest-resources/controllers/notifications.controller.js', 'backend/src/rest-resources/controllers/notifications.controller.js'],
    ['backend/src/rest-resources/routes/notifications.routes.js', 'backend/src/rest-resources/routes/notifications.routes.js'],
    ['backend/src/services/notifications/deviceToken.service.js', 'backend/src/services/notifications/deviceToken.service.js'],
    ['backend/src/services/notifications/index.js', 'backend/src/services/notifications/index.js'],
    ['frontend/src/lib/firebaseMessaging.js', 'frontend/src/lib/firebaseMessaging.js'],
    ['frontend/src/lib/pushDevice.js', 'frontend/src/lib/pushDevice.js'],
    ['frontend/src/lib/registerPwaServiceWorker.js', 'frontend/src/lib/registerPwaServiceWorker.js'],
    ['frontend/src/components/PushPermissionPrompt.jsx', 'frontend/src/components/PushPermissionPrompt.jsx'],
    ['frontend/src/api/notifications.js', 'frontend/src/api/notifications.js'],
    ['frontend/vite.firebaseSwPlugin.js', 'frontend/vite.firebaseSwPlugin.js']
  ];

  for (const [rel] of copies) {
    copyFile(path.join(PP, rel), path.join(base, rel));
  }

  copyFile(
    path.join(PP_ADMIN, 'src/pages/PushCampaigns.jsx'),
    path.join(base, 'admin/src/pages/PushCampaigns.jsx')
  );
  copyFile(
    path.join(PP_ADMIN, 'src/pages/PushCampaigns.css'),
    path.join(base, 'admin/src/pages/PushCampaigns.css')
  );
  copyFile(
    path.join(PP_ADMIN, 'src/api/pushCampaigns.js'),
    path.join(base, 'admin/src/api/pushCampaigns.js')
  );

  insertOnce(
    path.join(base, 'backend/src/rest-resources/routes/index.js'),
    "const emailCampaignsRoutes = require('./emailCampaigns.routes');",
    "\nconst pushCampaignsRoutes = require('./pushCampaigns.routes');"
  );
  insertOnce(
    path.join(base, 'backend/src/rest-resources/routes/index.js'),
    "router.use('/api/email-campaigns', emailCampaignsRoutes);",
    "\nrouter.use('/api/push-campaigns', pushCampaignsRoutes);"
  );

  insertOnce(
    path.join(base, 'backend/src/rest-resources/routes/admin.routes.js'),
    "const adminEmailCampaignsController = require('../controllers/adminEmailCampaigns.controller');",
    "\nconst adminPushCampaignsController = require('../controllers/adminPushCampaigns.controller');"
  );
  insertOnce(
    path.join(base, 'backend/src/rest-resources/routes/admin.routes.js'),
    "router.get('/email-campaigns/:id/eligible-count', adminEmailCampaignsController.eligibleCount);\n",
    PUSH_ADMIN_ROUTES
  );

  insertOnce(
    path.join(base, 'backend/src/rest-resources/middlewares/admin.middleware.js'),
    "  'email-campaigns': ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS,",
    "\n  'push-campaigns': ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS,"
  );

  insertOnce(
    path.join(base, 'backend/src/constants/permissions.js'),
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  SOCIAL_LINKS:",
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  /** Browser push notifications (per store). */\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  SOCIAL_LINKS:"
  );
  replaceOnce(
    path.join(base, 'backend/src/constants/permissions.js'),
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  SOCIAL_LINKS: 'social_links',",
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  /** Browser push notifications (per store). */\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  SOCIAL_LINKS: 'social_links',"
  );
  insertOnce(
    path.join(base, 'backend/src/constants/permissions.js'),
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  /** Read-only bonus activity report",
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  /** Browser push notifications (per store). */\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  /** Read-only bonus activity report"
  );

  insertOnce(
    path.join(base, 'backend/src/db/runMigrations.js'),
    'async function ensureLegalPagesSchema(sequelize) {',
    ENSURE_FN,
    'before'
  );
  insertOnce(
    path.join(base, 'backend/src/db/runMigrations.js'),
    '    await ensureFooterMenusPagesSchema(sequelize);\n    await ensureLegalPagesSchema(sequelize);',
    '\n    await ensurePushCampaignsSchema(sequelize);'
  );

  const swagger = path.join(base, 'backend/src/rest-resources/swagger/generateFromRoutes.js');
  if (fs.existsSync(swagger)) {
    insertOnce(swagger, "  'email-campaigns': 'Email Campaigns',", "\n  'push-campaigns': 'Push Campaigns',");
  }

  const feApp = path.join(base, 'frontend/src/App.jsx');
  insertOnce(feApp, "import { Toaster } from './components/Toaster';", "\nimport { PushPermissionHost } from './components/PushPermissionPrompt';");
  insertOnce(feApp, '                <Toaster />', '\n                <PushPermissionHost />');

  const feMain = path.join(base, 'frontend/src/main.jsx');
  insertOnce(
    feMain,
    "import { startIdleTabRecovery } from './utils/idleTabRecovery'",
    "\nimport { registerPwaServiceWorker } from './lib/registerPwaServiceWorker'"
  );
  insertOnce(feMain, 'startIdleTabRecovery()', '\nregisterPwaServiceWorker()');

  replaceOnce(
    path.join(base, 'frontend/src/context/AuthContext.jsx'),
    `        const { unregisterStoredFcmToken } = await import('../lib/firebaseMessaging');
        const notificationsApi = await import('../api/notifications');
        // Must run while auth token is still present
        await unregisterStoredFcmToken((token) => notificationsApi.unregisterDeviceToken(token));`,
    `        const { unlinkStoredFcmToken } = await import('../lib/firebaseMessaging');
        const { getOrCreatePushDeviceId } = await import('../lib/pushDevice');
        const notificationsApi = await import('../api/notifications');
        await unlinkStoredFcmToken((token) =>
          notificationsApi.unlinkPushDevice({
            deviceId: getOrCreatePushDeviceId(),
            token
          })
        );`
  );

  const adminApp = path.join(base, 'admin/src/App.jsx');
  insertOnce(adminApp, "import EmailCampaigns from './pages/EmailCampaigns'", "\nimport PushCampaigns from './pages/PushCampaigns'");
  insertOnce(
    adminApp,
    '        <Route path="email-campaigns" element={<RoleRoute><EmailCampaigns /></RoleRoute>} />',
    '\n        <Route path="push-campaigns" element={<RoleRoute><PushCampaigns /></RoleRoute>} />'
  );

  insertOnce(
    path.join(base, 'admin/src/constants/routeConfig.js'),
    "  { path: '/email-campaigns', label: 'Email campaigns', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS, adminPermissionKey: ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS, storeCodes: ['playjuwa'] },",
    "\n  { path: '/push-campaigns', label: 'Push notifications', allowedRoles: [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN], permissionKey: STORE_FEATURE_KEYS.PUSH_CAMPAIGNS, adminPermissionKey: ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS },"
  );
  insertOnce(
    path.join(base, 'admin/src/constants/routeConfig.js'),
    "  'email-campaigns': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],",
    "\n  'push-campaigns': [ROLES.MASTER_ADMIN, ROLES.STORE_ADMIN],"
  );
  insertOnce(
    path.join(base, 'admin/src/constants/routeConfig.js'),
    "  'email-campaigns': STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS,",
    "\n  'push-campaigns': STORE_FEATURE_KEYS.PUSH_CAMPAIGNS,"
  );
  insertOnce(
    path.join(base, 'admin/src/constants/routeConfig.js'),
    "  'email-campaigns': ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS,",
    "\n  'push-campaigns': ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS,"
  );

  insertOnce(
    path.join(base, 'admin/src/constants/permissions.js'),
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  /** Read-only bonus activity report",
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  /** Read-only bonus activity report"
  );
  replaceOnce(
    path.join(base, 'admin/src/constants/permissions.js'),
    "  /** PlayJuwa no-deposit email campaigns. */\n  EMAIL_CAMPAIGNS: 'email_campaigns',\n  /** Read-only bonus activity report across stores (technical staff). */",
    "  /** PlayJuwa no-deposit email campaigns. */\n  EMAIL_CAMPAIGNS: 'email_campaigns',\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  /** Read-only bonus activity report across stores (technical staff). */"
  );
  insertOnce(
    path.join(base, 'admin/src/constants/permissions.js'),
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  SOCIAL_LINKS:",
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  SOCIAL_LINKS:"
  );
  replaceOnce(
    path.join(base, 'admin/src/constants/permissions.js'),
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  SOCIAL_LINKS: 'social_links',",
    "  EMAIL_CAMPAIGNS: 'email_campaigns',\n  PUSH_CAMPAIGNS: 'push_campaigns',\n  SOCIAL_LINKS: 'social_links',"
  );

  insertOnce(
    path.join(base, 'admin/src/constants/permissionGroups.js'),
    "  { key: STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS, label: 'Email campaigns', description: 'PlayJuwa no-deposit email campaigns, test allowlist, and send status' },",
    "\n  { key: STORE_FEATURE_KEYS.PUSH_CAMPAIGNS, label: 'Push notifications', description: 'Browser push notifications, permission stats, and click tracking' },"
  );
  insertOnce(
    path.join(base, 'admin/src/constants/permissionGroups.js'),
    "  { key: ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS, label: 'Email campaigns', description: 'PlayJuwa no-deposit email campaigns (isolated from other stores)' },",
    "\n  { key: ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS, label: 'Push notifications', description: 'Browser push notifications for each store' },"
  );
}

console.log('done');
