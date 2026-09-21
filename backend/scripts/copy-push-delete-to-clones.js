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
  if (!fs.existsSync(base)) {
    console.warn('skip missing clone', clone);
    continue;
  }
  console.log('updating', clone);
  copyFile(
    path.join(PP, 'backend/src/services/pushCampaigns/adminPushCampaigns.service.js'),
    path.join(base, 'backend/src/services/pushCampaigns/adminPushCampaigns.service.js')
  );
  copyFile(
    path.join(PP, 'backend/src/rest-resources/controllers/adminPushCampaigns.controller.js'),
    path.join(base, 'backend/src/rest-resources/controllers/adminPushCampaigns.controller.js')
  );
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

  patch(path.join(base, 'backend/src/rest-resources/routes/admin.routes.js'), (s) => {
    if (s.includes("router.delete('/push-campaigns/:id'")) return s;
    return s.replace(
      /router\.patch\('\/push-campaigns\/:id', adminPushCampaignsController\.updateCampaign\);\r?\n/,
      (m) => `${m}router.delete('/push-campaigns/:id', adminPushCampaignsController.deleteCampaign);\n`
    );
  });
}

console.log('done');
