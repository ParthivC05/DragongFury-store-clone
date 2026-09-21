'use strict';

const express = require('express');
const { geoBlock } = require('../middlewares/geoBlock.middleware');
const { sendSuccess } = require('../../helpers/response.helpers');

const router = express.Router();

router.get('/check', geoBlock(), (_req, res) => {
  return sendSuccess(res, { allowed: true });
});

module.exports = router;
