'use strict';

const express = require('express');
const link2playController = require('../controllers/link2play.controller');

const router = express.Router();

router.get('/', link2playController.list);

module.exports = router;
