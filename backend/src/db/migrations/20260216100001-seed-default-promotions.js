'use strict';

const { Op } = require('sequelize');

/** Default promotions matching the reference design (First Deposit, Invite & Earn, VIP, Spin Wheel). */
const DEFAULT_PROMOTIONS = [
  {
    slug: 'first-deposit-bonus',
    title: 'FIRST DEPOSIT BONUS!',
    description: 'GET 100% EXTRA ON YOUR FIRST TOP-UP. DOUBLE YOUR BALANCE INSTANTLY.',
    cta_text: 'GET NOW',
    cta_url: '/deposit',
    background_color: '#f97316',
    display_order: 1
  },
  {
    slug: 'invite-earn',
    title: 'INVITE & EARN!',
    description: 'GET $5 FOR EVERY NEW USER WHO DEPOSITS $20. UNLIMITED REFERRALS. UNLIMITED EARNINGS.',
    cta_text: 'INVITE NOW',
    cta_url: '/account/affiliate',
    background_color: '#3b82f6',
    display_order: 2
  },
  {
    slug: 'unlock-higher-payouts',
    title: 'UNLOCK HIGHER PAYOUTS!',
    description: 'VIP MEMBERS RECEIVE BOOSTED REWARDS AND EXCLUSIVE PAYOUT MULTIPLIERS.',
    cta_text: 'MORE INFO',
    cta_url: '/account/vip',
    background_color: '#22c55e',
    display_order: 3
  },
  {
    slug: 'spin-the-wheel',
    title: 'SPIN THE WHEEL!',
    description: 'UNLOCK SURPRISE BONUSES, FREE CREDITS, AND EXCLUSIVE REWARDS EVERY SPIN.',
    cta_text: 'PLAY NOW',
    cta_url: '/spinwheel',
    background_color: '#ec4899',
    display_order: 4
  }
];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [countResult] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS cnt FROM promotions',
      { transaction }
    );
    const count = countResult && countResult[0] && countResult[0].cnt != null ? Number(countResult[0].cnt) : 0;
    if (count > 0) return;

    const now = new Date();
    const rows = DEFAULT_PROMOTIONS.map((p) => ({
      title: p.title,
      slug: p.slug,
      description: p.description,
      image: null,
      cta_text: p.cta_text,
      cta_url: p.cta_url,
      background_color: p.background_color,
      display_order: p.display_order,
      is_active: true,
      created_at: now,
      updated_at: now
    }));
    await queryInterface.bulkInsert('promotions', rows, { transaction });
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const slugs = DEFAULT_PROMOTIONS.map((p) => p.slug);
    await queryInterface.bulkDelete('promotions', { slug: { [Op.in]: slugs } }, { transaction });
  }
};
