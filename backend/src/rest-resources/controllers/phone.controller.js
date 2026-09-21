'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { logger } = require('../../libs/logger');
const phoneOtp = require('../../services/phone/phoneOtp.service');

function resolveStoreCode(req) {
  const body = req.body || {};
  return body.clientStoreCode || body.storeCode || req.user?.storeCode || null;
}

async function send(req, res) {
  try {
    const storeCode = resolveStoreCode(req);
    const phone = req.body?.phone || req.body?.phoneNumber;
    const phoneChallengeToken = req.body?.phoneChallengeToken || null;
    const vendorData = req.user?.userId ? String(req.user.userId) : undefined;
    const data = await phoneOtp.sendOtp({ phone, storeCode, vendorData, phoneChallengeToken });
    sendSuccess(res, data);
  } catch (err) {
    logger.error('[phone] send failed', { message: err.message, code: err.code });
    sendError(res, err.message || 'Could not send code.', err.statusCode || 500, err.code || null);
  }
}

async function completeLogin(req, res) {
  try {
    const phone = req.body?.phone || req.body?.phoneNumber;
    const code = req.body?.code || req.body?.otp;
    const phoneChallengeToken = req.body?.phoneChallengeToken;
    const data = await phoneOtp.completePhoneLogin({ phoneChallengeToken, phone, code });
    if (data?.token && data?.user?.userId) {
      const { createRefreshToken } = require('../../helpers/authentication.helpers');
      const config = require('../../configs/app.config');
      const isProduction = config.get('env') === 'production';
      const refreshToken = createRefreshToken(data.user);
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/'
      });
    }
    sendSuccess(res, data);
  } catch (err) {
    logger.error('[phone] complete login failed', { message: err.message, code: err.code });
    sendError(res, err.message || 'Could not verify code.', err.statusCode || 500, err.code || null);
  }
}

async function check(req, res) {
  try {
    const storeCode = resolveStoreCode(req);
    const phone = req.body?.phone || req.body?.phoneNumber;
    const code = req.body?.code || req.body?.otp;

    if (req.user?.userId) {
      const data = await phoneOtp.checkOtpForUser({
        userId: req.user.userId,
        phone,
        code,
        storeCode
      });
      sendSuccess(res, data);
      return;
    }

    const data = await phoneOtp.checkOtpPublic({ phone, code, storeCode });
    sendSuccess(res, data);
  } catch (err) {
    logger.error('[phone] check failed', { message: err.message, code: err.code });
    sendError(res, err.message || 'Could not verify code.', err.statusCode || 500, err.code || null);
  }
}

async function status(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendError(res, 'Unauthorized', 401);
      return;
    }
    const db = require('../../db/models');
    const user = await db.User.findByPk(userId, {
      attributes: ['userId', 'phone', 'isPhoneVerified', 'phoneVerifiedAt', 'storeCode', 'role', 'isAdmin']
    });
    sendSuccess(res, await phoneOtp.phoneStatusForUser(user));
  } catch (err) {
    sendError(res, err.message || 'Failed', err.statusCode || 500, err.code || null);
  }
}

module.exports = { send, check, status, completeLogin };
