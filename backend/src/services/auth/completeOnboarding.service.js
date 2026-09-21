const { User } = require('../../db/models');

/**
 * Marks onboarding as completed for the given userId.
 * @param {number} userId 
 * @returns {Promise<{success: boolean}>}
 */
async function completeOnboarding(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  await user.update({ onboardingCompleted: true });

  return { success: true };
}

module.exports = { completeOnboarding };
