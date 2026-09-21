const userService = require('../../services/user');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { decodePasswordBody } = require('../../utils/passwordEncryption');

async function getProfile(req, res) {
  try {
    const data = await require('../../services/auth').getMe(req.user.userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function updateProfile(req, res) {
  try {
    const userId = req.user.userId;
    const data = await userService.updateProfile(userId, req.body);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function updateProfilePhoto(req, res) {
  try {
    const userId = req.user.userId;
    const data = await userService.updateProfilePhoto(userId, req.body);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function changePassword(req, res) {
  try {
    const userId = req.user.userId;
    const body = decodePasswordBody(req.body || {});
    const { currentPassword, newPassword } = body;
    const data = await userService.changePassword(userId, currentPassword, newPassword);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  changePassword
};
