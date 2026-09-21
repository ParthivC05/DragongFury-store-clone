'use strict';

/**
 * Opt-in DollarPay credit card (is_pay=4) for deposits.
 * Existing stores keep Orion for card until admin selects DollarPayWallet for Card.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb) || '{"card":false}'::jsonb,
            updated_at = NOW()
        WHERE code = 'dollarpay'
          AND (deposit_methods_enabled->>'card') IS NULL
        `,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb) || '{"card":false}'::jsonb,
            updated_at = NOW()
        WHERE provider_code = 'dollarpay'
          AND (deposit_methods_enabled->>'card') IS NULL
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
        SET deposit_methods_enabled = deposit_methods_enabled - 'card',
            updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled = deposit_methods_enabled - 'card',
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
  }
};
