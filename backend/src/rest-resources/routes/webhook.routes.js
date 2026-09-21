'use strict';

const express = require('express');
const webhookController = require('../controllers/webhook.controller');
const speedWebhookController = require('../controllers/speedWebhook.controller');

const router = express.Router();

// Raw body is required for signature verification; this route is mounted with express.raw() in app
router.post('/payment', webhookController.paymentWebhook);
router.post('/speed', speedWebhookController.speedWebhook);
router.post('/btcpay', require('../controllers/selfcryptoWebhook.controller').btcpayWebhook);
router.post('/didit', require('../controllers/diditWebhook.controller').diditWebhook);

module.exports = router;
