const { register } = require('./register.service');
const { login } = require('./login.service');
const { getMe } = require('./getMe.service');
const { sendVerificationEmailService } = require('./sendVerificationEmail.service');
const { verifyEmail } = require('./verifyEmail.service');
const { refreshEmailToken } = require('./refreshEmailToken.service');
const { forgotPassword } = require('./forgotPassword.service');
const { resetPassword } = require('./resetPassword.service');
const { loginWithGoogle, loginWithGoogleAuthCode } = require('./googleAuth.service');
const { loginWithFacebook } = require('./facebookAuth.service');
const { completeOnboarding } = require('./completeOnboarding.service');
const { refreshAccessToken } = require('./refreshAccessToken.service');

module.exports = {
  register,
  login,
  getMe,
  sendVerificationEmailService,
  verifyEmail,
  refreshEmailToken,
  forgotPassword,
  resetPassword,
  loginWithGoogle,
  loginWithGoogleAuthCode,
  loginWithFacebook,
  completeOnboarding,
  refreshAccessToken
};
