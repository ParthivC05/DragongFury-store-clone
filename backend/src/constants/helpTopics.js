'use strict';

const HELP_TOPICS = [
  { id: 'create-account', label: 'Create Account', sortOrder: 1 },
  { id: 'recharge', label: 'Recharge', sortOrder: 2 },
  { id: 'redeem', label: 'Redeem', sortOrder: 3 },
  { id: 'promotions', label: 'Promotions', sortOrder: 4 },
  { id: 'vip', label: 'VIP', sortOrder: 5 },
  { id: 'spin-wheel', label: 'Spin Wheel', sortOrder: 6 },
  { id: 'refer-earn', label: 'Refer & Earn', sortOrder: 7 }
];

const HELP_TOPIC_IDS = HELP_TOPICS.map((t) => t.id);

function getTopicLabel(id) {
  const t = HELP_TOPICS.find((x) => x.id === id);
  return t ? t.label : id;
}

module.exports = {
  HELP_TOPICS,
  HELP_TOPIC_IDS,
  getTopicLabel
};
