const { getAffiliateSettings, updateAffiliateSettings } = require('./getAffiliateSettings.service');
const { resetAffiliateSettingsToDefault } = require('./resetAffiliateSettingsToDefault.service');
const { getAffiliateStats } = require('./getAffiliateStats.service');
const { creditDueGiveGetReferralRewards } = require('./creditGiveGetReferralReward.service');
const { tryMarkReferralPlaythroughForUser } = require('./markReferralPlaythrough.service');
const { tryGrantReferralFriendSignupBonus } = require('./grantReferralFriendSignupBonus.service');

module.exports = {
  getAffiliateSettings,
  updateAffiliateSettings,
  resetAffiliateSettingsToDefault,
  getAffiliateStats,
  creditDueGiveGetReferralRewards,
  tryMarkReferralPlaythroughForUser,
  tryGrantReferralFriendSignupBonus
};
