const express = require('express');
const multer = require('multer');
const landingPaymentLinksController = require('../controllers/landingPaymentLinks.controller');
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

router.get('/config', landingPaymentLinksController.getPublicConfig);

router.get('/admin/settings', authMiddleware, adminMiddleware, landingPaymentLinksController.getSettingsAdmin);
router.put('/admin/settings', authMiddleware, adminMiddleware, landingPaymentLinksController.updateSettingsAdmin);
router.delete('/admin/settings', authMiddleware, adminMiddleware, landingPaymentLinksController.deleteSettingsAdmin);
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
  landingPaymentLinksController.uploadModalImage,
);

module.exports = router;
