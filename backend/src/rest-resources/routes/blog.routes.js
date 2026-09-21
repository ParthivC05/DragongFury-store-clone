'use strict';

const express = require('express');
const blogController = require('../controllers/blog.controller');

const router = express.Router();

router.get('/', blogController.list);
router.get('/:slug', blogController.getOne);

module.exports = router;
