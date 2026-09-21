const { registerGameAccount } = require('../../services/games/registerGameAccount.service');
const { linkGameAccount } = require('../../services/games/linkGameAccount.service');
const { depositGameAccount } = require('../../services/games/deposit.service');
const { redeemGameAccount } = require('../../services/games/redeem.service');
const {
  forgotGamePassword,
} = require('../../services/games/forgotGamePassword.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { GAME_DEPOSIT_AMOUNT_ERROR, GAME_WITHDRAW_AMOUNT_ERROR } = require('../../utils/integerScGame.helpers');

/**
 * Register a game account for the current user.
 * Token via Authorization header or body (token / accessToken). Body: { gameName }.
 * Calls the game bot create-user API and stores account_name + password in user_game_accounts.
 */
async function register(req, res) {
  try {
    const { gameName } = req.body || {};
    if (!gameName || typeof gameName !== 'string' || !gameName.trim()) {
      return sendError(res, 'Game name is required.', 400);
    }
    const data = await registerGameAccount(
      req.user.userId,
      req.user.username,
      gameName.trim(),
      { email: req.user.email }
    );
    sendSuccess(res, data, 201);
  } catch (err) {
    if (err.externalResponse != null) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.status(err.statusCode || 500).json(err.externalResponse);
    }
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function deposit(req, res) {
  try {
    const { gameName, amount } = req.body || {};

    if (!gameName || typeof gameName !== 'string' || !gameName.trim()) {
      return sendError(res, 'Game name is required.', 400);
    }

    if (
      amount === undefined ||
      amount === null ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return sendError(res, GAME_DEPOSIT_AMOUNT_ERROR, 400);
    }

    const result = await depositGameAccount(
      req.user.userId,
      gameName.trim(),
      amount
    );

    // The result from service already contains { success, message, status, data }
    return res.status(result.status || 200).json(result);
  } catch (err) {
    if (err.externalResponse != null) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.status(err.statusCode || 500).json(err.externalResponse);
    }
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null);
  }
}

async function redeem(req, res) {
  try {
    const { gameName, amount } = req.body || {};

    if (!gameName || typeof gameName !== 'string' || !gameName.trim()) {
      return sendError(res, 'Game name is required.', 400);
    }

    if (
      amount === undefined ||
      amount === null ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return sendError(res, GAME_WITHDRAW_AMOUNT_ERROR, 400);
    }

    const result = await redeemGameAccount(
      req.user.userId,
      gameName.trim(),
      amount
    );

    // The result from service already contains { success, message, status, data }
    return res.status(result.status || 200).json(result);
  } catch (err) {
    if (err.externalResponse != null) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.status(err.statusCode || 500).json(err.externalResponse);
    }
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null);
  }
}

/**
 * Link an existing game-platform account to the current user.
 * Body: { gameName, gameUsername, gamePassword? } — gamePassword required for OrionStars / Firekirin Agent.
 */
async function linkAccount(req, res) {
  try {
    const { gameName, gameUsername, gamePassword, password } = req.body || {};

    if (!gameName || typeof gameName !== 'string' || !gameName.trim()) {
      return sendError(res, 'Game name is required.', 400);
    }

    if (!gameUsername || typeof gameUsername !== 'string' || !gameUsername.trim()) {
      return sendError(res, 'Game username is required.', 400);
    }

    const plainPassword =
      (typeof gamePassword === 'string' && gamePassword) ||
      (typeof password === 'string' && password) ||
      null;

    const result = await linkGameAccount(
      req.user.userId,
      gameName.trim(),
      gameUsername.trim(),
      req.user.storeCode || null,
      plainPassword
    );

    return sendSuccess(res, result, 200);
  } catch (err) {
    if (err.externalResponse != null) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      return res.status(err.statusCode || 500).json(err.externalResponse);
    }
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status, err.code || null);
  }
}

async function forgotPassword(req, res) {
  try {
    const { gameName, game_username } = req.body || {};

    if (!gameName || typeof gameName !== 'string' || !gameName.trim()) {
      return sendError(res, 'Game name is required.', 400);
    }

    if (!game_username || typeof game_username !== 'string' || !game_username.trim()) {
      return sendError(res, 'Game username is required.', 400);
    }

    const result = await forgotGamePassword(
      req.user.userId,
      gameName.trim(),
      game_username.trim(),
      req.user.storeCode || null
    );

    return res.status(result.status || 200).json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    const rawMsg = typeof err.message === 'string' ? err.message.trim() : '';
    const message =
      rawMsg && !/^bot_forgot_password/i.test(rawMsg)
        ? rawMsg
        : 'We could not reset your game password. Please try again or contact support.';
    sendError(res, message, status, err.code || null);
  }
}

module.exports = {
  register,
  linkAccount,
  deposit,
  redeem,
  forgotPassword
};
