'use strict';

const express = require('express');
const multer = require('multer');
const welcomeSignupBonusController = require('../controllers/welcomeSignupBonus.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');
const {
  DESKTOP_MAX_BYTES,
  webpMulterFilter,
  multerLimitMessage
} = require('../../utils/adminImageUploadConstraints');

const router = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DESKTOP_MAX_BYTES },
  fileFilter: webpMulterFilter
});

router.get('/public', welcomeSignupBonusController.getPublic);

router.get('/admin/stores', authMiddleware, adminMiddleware, welcomeSignupBonusController.listStores);
router.put('/admin/stores', authMiddleware, adminMiddleware, welcomeSignupBonusController.updateStore);
router.put(
  '/admin/activate-bonus-modal',
  authMiddleware,
  adminMiddleware,
  welcomeSignupBonusController.updateActivateBonusModal
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
  welcomeSignupBonusController.uploadModalImage
);

module.exports = router;
