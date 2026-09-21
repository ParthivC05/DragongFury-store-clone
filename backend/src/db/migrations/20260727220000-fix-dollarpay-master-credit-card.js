'use strict';

/**
 * Master must allow credit_card on DollarPay (true/absent).
 * Store-level credit_card stays opt-in (false until admin enables).
 * Previously master credit_card:false blocked store toggle (master false always wins).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb) || '{"credit_card":true}'::jsonb,
            updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );

      // Ensure store rows have an explicit credit_card key (default off) without wiping true if already on.
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || CASE
               WHEN deposit_methods_enabled ? 'credit_card' THEN '{}'::jsonb
               ELSE '{"credit_card":false}'::jsonb
             END,
            updated_at = NOW()
        WHERE provider_code = 'dollarpay'
        `,
        { transaction }
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb) || '{"credit_card":false}'::jsonb,
            updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
