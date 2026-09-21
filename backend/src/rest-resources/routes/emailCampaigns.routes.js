'use strict';

const express = require('express');
const { authMiddleware } = require('../middlewares/auth.middleware');
const emailCampaignsController = require('../controllers/emailCampaigns.controller');

const router = express.Router();

router.get('/claim-preview', emailCampaignsController.previewClaim);
router.post('/claim', authMiddleware, emailCampaignsController.claim);
router.get('/applied-code', authMiddleware, emailCampaignsController.getAppliedCode);
router.post('/apply-code', authMiddleware, emailCampaignsController.applyCode);
router.post('/remove-code', authMiddleware, emailCampaignsController.removeCode);

module.exports = router;
