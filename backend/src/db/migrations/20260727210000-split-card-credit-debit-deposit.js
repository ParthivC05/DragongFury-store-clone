'use strict';

/**
 * Split deposit "card" into:
 * - credit_card (DollarPayWallet, is_pay=4)
 * - debit_card (Orionstars Pay)
 * Keeps withdraw `card` untouched. Migrates legacy deposit `card` flags.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // DollarPay: credit_card from legacy card (default false / opt-in)
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'credit_card',
              COALESCE((deposit_methods_enabled->>'card')::boolean, false)
            )
          ) - 'card',
          updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'credit_card',
              COALESCE((deposit_methods_enabled->>'card')::boolean, false)
            )
          ) - 'card',
          updated_at = NOW()
        WHERE provider_code = 'dollarpay'
        `,
        { transaction }
      );

      // Orion: debit_card from legacy card (missing key = previously enabled)
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || jsonb_build_object(
            'debit_card',
            CASE
              WHEN deposit_methods_enabled ? 'card'
                THEN COALESCE((deposit_methods_enabled->>'card')::boolean, true)
              ELSE true
            END
          ),
          updated_at = NOW()
        WHERE code = 'orionstarspay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || jsonb_build_object(
            'debit_card',
            CASE
              WHEN deposit_methods_enabled ? 'card'
                THEN COALESCE((deposit_methods_enabled->>'card')::boolean, true)
              ELSE true
            END
          ),
          updated_at = NOW()
        WHERE provider_code = 'orionstarspay'
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
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'card',
              COALESCE((deposit_methods_enabled->>'credit_card')::boolean, false)
            )
          ) - 'credit_card',
          updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'card',
              COALESCE((deposit_methods_enabled->>'credit_card')::boolean, false)
            )
          ) - 'credit_card',
          updated_at = NOW()
        WHERE provider_code = 'dollarpay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled = deposit_methods_enabled - 'debit_card',
            updated_at = NOW()
        WHERE code = 'orionstarspay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled = deposit_methods_enabled - 'debit_card',
            updated_at = NOW()
        WHERE provider_code = 'orionstarspay'
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
