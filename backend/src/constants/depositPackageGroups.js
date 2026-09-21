'use strict';

/** Built-in package group keys. General is always sorted last. */
const DEPOSIT_PACKAGE_GROUP_DEFS = [
  { groupKey: 'flash_sale', title: 'Flash Sale', defaultSortOrder: 10 },
  { groupKey: 'welcome', title: 'Welcome Packages', defaultSortOrder: 20 },
  { groupKey: 'featured', title: 'Featured Packages', defaultSortOrder: 30 },
  { groupKey: 'limited_time', title: 'Limited Time Offers', defaultSortOrder: 40 },
  { groupKey: 'general', title: 'General Packages', defaultSortOrder: 999 }
];

const DEPOSIT_PACKAGE_GROUP_KEYS = DEPOSIT_PACKAGE_GROUP_DEFS.map((g) => g.groupKey);

const DEPOSIT_PACKAGE_SETTINGS_KEY = 'deposit_package_settings';

/** Welcome packages are visible for this many hours after user signup. */
const WELCOME_SIGNUP_WINDOW_HOURS = 24;

module.exports = {
  DEPOSIT_PACKAGE_GROUP_DEFS,
  DEPOSIT_PACKAGE_GROUP_KEYS,
  DEPOSIT_PACKAGE_SETTINGS_KEY,
  WELCOME_SIGNUP_WINDOW_HOURS
};
