'use strict';

const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../middlewares/auth.middleware');
const {
  supportTicketWriteLimiter,
  supportTicketUploadLimiter
} = require('../middlewares/supportTicketsRateLimit.middleware');
const supportTicketsController = require('../controllers/supportTickets.controller');

const router = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported image type. Use PNG, JPG, WEBP, or GIF.'));
  }
});

function handleUpload(req, res, next) {
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
}

router.use(authMiddleware);

router.post(
  '/upload',
  supportTicketUploadLimiter,
  handleUpload,
  supportTicketsController.upload
);
router.get('/', supportTicketsController.list);
router.post('/', supportTicketWriteLimiter, supportTicketsController.create);
router.get('/:id', supportTicketsController.getOne);
router.post('/:id/messages', supportTicketWriteLimiter, supportTicketsController.reply);

module.exports = router;
