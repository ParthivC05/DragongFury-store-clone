'use strict';

const express = require('express');
const pushCampaignsController = require('../controllers/pushCampaigns.controller');

const router = express.Router();

router.post('/click', pushCampaignsController.click);
router.get('/click', pushCampaignsController.click);

module.exports = router;
