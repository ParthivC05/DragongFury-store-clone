'use strict';

/**
 * Seed default help content for all topics (platform defaults, store_code IS NULL).
 * Idempotent: only inserts rows when no row exists for (topic, store_code IS NULL).
 * Safe to run on every migration run; does not overwrite existing data.
 */

const { HELP_TOPICS } = require('../../constants/helpTopics');

const DEFAULT_CONTENT = {
  'create-account': `<h4 style="margin:1em 0 0.5em;font-size:1rem;font-weight:600;">New user – Game account creation</h4>
<ol style="margin:0.5em 0;padding-left:1.5em;">
<li>Open the game or platform and go to the registration / sign-up section.</li>
<li>Enter your details (phone / email) as required.</li>
<li>Complete verification if prompted (OTP, email link, etc.).</li>
<li>Set a secure password and confirm.</li>
<li>After successful registration, log in and start playing.</li>
</ol>
<h4 style="margin:1.25em 0 0.5em;font-size:1rem;font-weight:600;">Existing user – Login</h4>
<ol style="margin:0.5em 0;padding-left:1.5em;">
<li>Open the game or platform and go to the login section.</li>
<li>Enter your registered phone number or email.</li>
<li>Enter your password (or use OTP if enabled).</li>
<li>Click Login to access your game account and wallet.</li>
</ol>`,
  recharge: `<p style="margin:0.5em 0;">When you recharge for the game, SC coins move from your wallet into your game balance.</p>
<ol style="margin:0.75em 0;padding-left:1.5em;">
<li><strong>SC coins are deducted</strong> from your wallet (platform balance).</li>
<li>The same amount is <strong>added to your game app balance</strong>.</li>
<li>Your <strong>wallet and game balances update</strong> and reflect after completion.</li>
<li>You can use the coins in the game as per the game rules.</li>
</ol>
<p style="margin:0.75em 0;font-size:0.875rem;color:#9ca3af;"><em>Make sure your wallet has enough SC before recharging. The transaction will reflect in wallet history and in the game.</em></p>`,
  redeem: `<p style="margin:0.5em 0;">When you redeem, coins move from the game back into your wallet and show in transactions.</p>
<ol style="margin:0.75em 0;padding-left:1.5em;">
<li><strong>Coins are deducted</strong> from your game app balance.</li>
<li>The equivalent amount is <strong>credited to your wallet</strong> (SC).</li>
<li>Your <strong>wallet balance and transaction history update</strong>.</li>
<li>You can view the redeem transaction in your wallet transactions list.</li>
</ol>
<p style="margin:0.75em 0;font-size:0.875rem;color:#9ca3af;"><em>Redeem is subject to game and platform rules. Check your game balance before redeeming.</em></p>`,
  promotions: `<p style="margin:0.5em 0;">Promotions give users bonus opportunities based on current campaign rules.</p>
<ol style="margin:0.75em 0;padding-left:1.5em;">
<li>Open the Promotions page to check active offers and eligibility.</li>
<li>Read each offer terms (validity, required actions, and limits).</li>
<li>Complete the required action (for example recharge/play conditions).</li>
<li>After qualification, bonus or reward is credited as per campaign policy.</li>
</ol>
<p style="margin:0.75em 0;font-size:0.875rem;color:#9ca3af;"><em>Always verify campaign dates and terms before participating.</em></p>`,
  vip: `<p style="margin:0.5em 0;">VIP level is based on your platform activity and gives extra benefits.</p>
<ol style="margin:0.75em 0;padding-left:1.5em;">
<li>Open Account &gt; VIP to see your current level and progress.</li>
<li>Increase eligible activity to unlock higher VIP levels.</li>
<li>Higher levels can provide better rewards or exclusive benefits.</li>
<li>All VIP calculations and rewards follow platform VIP policy.</li>
</ol>
<p style="margin:0.75em 0;font-size:0.875rem;color:#9ca3af;"><em>VIP level updates may take some time to reflect after eligible activity.</em></p>`,
  'spin-wheel': `<p style="margin:0.5em 0;">Spin Wheel lets you claim rewards during available spin windows.</p>
<ol style="margin:0.75em 0;padding-left:1.5em;">
<li>Open Spin Wheel page and check if your spin is available.</li>
<li>If available, tap Spin and wait for result confirmation.</li>
<li>Reward is credited to your wallet/account based on wheel result.</li>
<li>If unavailable, check cooldown timer for next spin time.</li>
</ol>
<p style="margin:0.75em 0;font-size:0.875rem;color:#9ca3af;"><em>Spin eligibility, cooldown, and rewards depend on platform rules.</em></p>`,
  'refer-earn': `<p style="margin:0.5em 0;">Refer &amp; Earn allows users to invite friends and receive referral rewards.</p>
<ol style="margin:0.75em 0;padding-left:1.5em;">
<li>Open Account &gt; Refer &amp; Earn and copy your referral link/code.</li>
<li>Share the referral link with friends.</li>
<li>When a friend registers and meets conditions, referral benefits are applied.</li>
<li>Track invites and earned rewards in the referral section.</li>
</ol>
<p style="margin:0.75em 0;font-size:0.875rem;color:#9ca3af;"><em>Referral rewards are credited only when referral terms and qualification rules are met.</em></p>`
};

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    const existingRows = await sequelize.query(
      'SELECT topic FROM help_content WHERE store_code IS NULL',
      { transaction, type: sequelize.QueryTypes.SELECT }
    );
    const existing = new Set((existingRows || []).map((r) => r.topic));

    const now = new Date();
    for (const topic of HELP_TOPICS) {
      if (existing.has(topic.id)) continue;
      const content = DEFAULT_CONTENT[topic.id] || '';
      if (dialect === 'postgres') {
        await sequelize.query(
          `INSERT INTO help_content (topic, store_code, content, video_url, sort_order, created_at, updated_at)
           SELECT $1::varchar(64), NULL, $2::text, NULL, $3::integer, $4::timestamptz, $4::timestamptz
           WHERE NOT EXISTS (SELECT 1 FROM help_content WHERE topic = $1::varchar(64) AND store_code IS NULL)`,
          {
            bind: [topic.id, content, topic.sortOrder ?? 0, now],
            transaction
          }
        );
      } else {
        await sequelize.query(
          `INSERT INTO help_content (topic, store_code, content, video_url, sort_order, created_at, updated_at)
           SELECT ?, NULL, ?, NULL, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM help_content WHERE topic = ? AND store_code IS NULL)`,
          {
            bind: [topic.id, content, topic.sortOrder ?? 0, now, now, topic.id],
            transaction
          }
        );
      }
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query('DELETE FROM help_content WHERE store_code IS NULL', { transaction }).catch(() => {});
  }
};
