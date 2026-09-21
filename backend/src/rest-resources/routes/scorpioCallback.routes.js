'use strict';

const express = require('express');
const scorpioCallbackController = require('../controllers/scorpioCallback.controller');

const router = express.Router();

router.post('/', scorpioCallbackController.handle);
router.post('/:command', scorpioCallbackController.handle);

module.exports = router;
