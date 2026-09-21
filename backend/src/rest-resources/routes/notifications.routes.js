const express = require('express');
const notificationsController = require('../controllers/notifications.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authMiddleware, notificationsController.list);
router.get('/unread-count', authMiddleware, notificationsController.unreadCount);
router.post('/device-token', authMiddleware, notificationsController.registerDeviceToken);
router.delete('/device-token', authMiddleware, notificationsController.unregisterDeviceToken);
router.post('/push-device', authMiddlewareOptional, notificationsController.upsertPushDevice);
router.post('/push-device/unlink', authMiddleware, notificationsController.unlinkPushDevice);
router.patch('/read-all', authMiddleware, notificationsController.markAllRead);
router.patch('/:id/read', authMiddleware, notificationsController.markRead);

module.exports = router;
