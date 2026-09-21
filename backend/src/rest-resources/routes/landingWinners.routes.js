'use strict';

const express = require('express');
const { getPublic } = require('../controllers/landingWinners.controller');

const router = express.Router();

router.get('/public', getPublic);

module.exports = router;
