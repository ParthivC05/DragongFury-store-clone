'use strict';

const express = require('express');
const legalController = require('../controllers/legal.controller');

const router = express.Router();

router.get('/:pageKey', legalController.getOne);

module.exports = router;
