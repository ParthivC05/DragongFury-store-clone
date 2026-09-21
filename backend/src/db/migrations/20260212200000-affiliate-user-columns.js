'use strict';

const crypto = require('crypto');

function generateCode() {
  return crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || `R${Date.now().toString(36).toUpperCase()}`;
}

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = queryInterface;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('user_referral_code', 'user_referred_by')`,
      { transaction }
    );
    const hasCode = (cols || []).some((r) => r.column_name === 'user_referral_code');
    const hasReferredBy = (cols || []).some((r) => r.column_name === 'user_referred_by');
    if (!hasCode) {
      await q.addColumn('users', 'user_referral_code', { type: Sequelize.STRING(32), allowNull: true }, { transaction });
    }
    if (!hasReferredBy) {
      await q.addColumn('users', 'user_referred_by', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' } }, { transaction });
    }
    const [countRows] = await queryInterface.sequelize.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE user_referral_code IS NULL OR user_referral_code = ''`,
      { transaction }
    );
    const missingCount = Number(countRows?.[0]?.count || 0);
    if (missingCount === 0) return;

    const [rows] = await queryInterface.sequelize.query(
      `SELECT user_id FROM users WHERE user_referral_code IS NULL OR user_referral_code = ''`,
      { transaction }
    );
    const used = new Set();
    for (const r of rows || []) {
      let code = generateCode();
      while (used.has(code)) code = generateCode();
      used.add(code);
      await queryInterface.sequelize.query(
        `UPDATE users SET user_referral_code = :code WHERE user_id = :id`,
        { replacements: { code, id: r.user_id }, transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('users', 'user_referral_code', { transaction }).catch(() => {});
    await queryInterface.removeColumn('users', 'user_referred_by', { transaction }).catch(() => {});
  }
};
