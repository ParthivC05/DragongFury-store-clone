const express = require('express');
const helpController = require('../controllers/help.controller');

const router = express.Router();
router.get('/', helpController.getHelp);

module.exports = router;
