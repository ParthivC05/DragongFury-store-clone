const express = require('express');
const userController = require('../controllers/user.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/profile', authMiddleware, userController.getProfile);
router.patch('/profile', authMiddleware, userController.updateProfile);
router.patch('/profile-photo', authMiddleware, userController.updateProfilePhoto);
router.post('/change-password', authMiddleware, userController.changePassword);

module.exports = router;
