const express = require('express');
const gamesController = require('../controllers/games.controller');
const transactionsController = require('../controllers/transactions.controller');
const { authMiddlewareWithBodyToken, authMiddlewareOptional } = require('../middlewares/auth.middleware');
const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');

const router = express.Router();

// Public / Semi-public endpoints
// list uses authMiddlewareOptional so it can return has_account
router.get('/', authMiddlewareOptional, gamesController.list);

// Game transactions
router.post('/transactions', authMiddlewareWithBodyToken, transactionsController.getGameTransactions);

router.get('/play-eligibility', authMiddlewareWithBodyToken, gamesController.playEligibility);

// Static routes must be registered before /:id
router.get('/activities', authMiddlewareWithBodyToken, gamesController.activities);
router.get('/firekirin/exclusive', authMiddlewareOptional, gamesController.firekirinExclusiveList);
router.post('/firekirin/enter', authMiddlewareWithBodyToken, gamesController.firekirinEnter);
router.get('/milkyway/exclusive', authMiddlewareWithBodyToken, gamesController.milkywayExclusiveList);
router.post('/milkyway/enter', authMiddlewareWithBodyToken, gamesController.milkywayEnter);

router.get('/manual-requests', authMiddlewareWithBodyToken, async (req, res) => {
  try {
    const requests = await db.GameManualRequest.findAll({
      where: { userId: req.user.userId },
      include: [{ model: db.Game, as: 'Game', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    const list = requests.map((r) => {
      const j = r.toJSON();
      delete j.gamePassword;
      return j;
    });

    sendSuccess(res, { requests: list });
  } catch (err) {
    sendError(res, err.message || 'Failed to load requests', 500);
  }
});

// get uses authMiddlewareOptional so it can return credentials if logged in
router.get('/:id', authMiddlewareOptional, gamesController.get);

// Protected endpoints
router.post('/:id/register', authMiddlewareWithBodyToken, gamesController.register);
router.get('/:id/balance', authMiddlewareWithBodyToken, gamesController.balance);
router.post('/:id/sync-password', authMiddlewareWithBodyToken, gamesController.syncPassword);
router.post('/:id/topup', authMiddlewareWithBodyToken, gamesController.topup);
router.post('/:id/withdraw', authMiddlewareWithBodyToken, gamesController.withdraw);
router.post('/:id/redeem', authMiddlewareWithBodyToken, gamesController.redeem);

module.exports = router;
