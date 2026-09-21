'use strict';

const express = require('express');
const footerController = require('../controllers/footer.controller');

const router = express.Router();

router.get('/', footerController.list);
router.get('/pages/:slug', footerController.getOne);

module.exports = router;
