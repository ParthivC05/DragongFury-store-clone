'use strict';

const express = require('express');
const multer = require('multer');
const dashboardPromoModalsController = require('../controllers/dashboardPromoModals.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');
const {
  DESKTOP_MAX_BYTES,
  webpMulterFilter,
  multerLimitMessage,
} = require('../../utils/adminImageUploadConstraints');

const router = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DESKTOP_MAX_BYTES },
  fileFilter: webpMulterFilter,
});

router.get('/config', authMiddleware, dashboardPromoModalsController.getUserConfig);

router.get('/admin/settings', authMiddleware, adminMiddleware, dashboardPromoModalsController.getSettingsAdmin);
router.put('/admin/settings', authMiddleware, adminMiddleware, dashboardPromoModalsController.updateSettingsAdmin);
router.delete(
  '/admin/settings',
  authMiddleware,
  adminMiddleware,
  dashboardPromoModalsController.deleteSettingsAdmin,
);
router.post(
  '/admin/modal-image-upload',
  authMiddleware,
  adminMiddleware,
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? multerLimitMessage(DESKTOP_MAX_BYTES)
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  dashboardPromoModalsController.uploadModalImage,
);

module.exports = router;
