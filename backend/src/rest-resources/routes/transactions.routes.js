const express = require('express');
const transactionsController = require('../controllers/transactions.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authMiddleware, transactionsController.getTransactions);

module.exports = router;
