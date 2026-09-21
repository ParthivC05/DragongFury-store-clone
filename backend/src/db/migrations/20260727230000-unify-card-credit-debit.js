'use strict';

/**
 * Revert split credit_card / debit_card back to a single deposit method: card.
 * Master DollarPay allows card (true). Store keeps opt-in from prior credit_card flag.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Master DollarPay: card allowed at platform level
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'card',
              COALESCE(
                (deposit_methods_enabled->>'credit_card')::boolean,
                (deposit_methods_enabled->>'card')::boolean,
                true
              )
            )
          ) - 'credit_card' - 'debit_card',
          updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );

      // Store DollarPay: card from credit_card (default false / opt-in)
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'card',
              COALESCE(
                (deposit_methods_enabled->>'credit_card')::boolean,
                (deposit_methods_enabled->>'card')::boolean,
                false
              )
            )
          ) - 'credit_card' - 'debit_card',
          updated_at = NOW()
        WHERE provider_code = 'dollarpay'
        `,
        { transaction }
      );

      // Master Orion: card from debit_card / card (default true)
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'card',
              COALESCE(
                (deposit_methods_enabled->>'debit_card')::boolean,
                (deposit_methods_enabled->>'card')::boolean,
                true
              )
            )
          ) - 'credit_card' - 'debit_card',
          updated_at = NOW()
        WHERE code = 'orionstarspay'
        `,
        { transaction }
      );

      // Store Orion: card from debit_card / card (default true)
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          (
            COALESCE(deposit_methods_enabled, '{}'::jsonb)
            || jsonb_build_object(
              'card',
              COALESCE(
                (deposit_methods_enabled->>'debit_card')::boolean,
                (deposit_methods_enabled->>'card')::boolean,
                true
              )
            )
          ) - 'credit_card' - 'debit_card',
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
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || jsonb_build_object('credit_card', COALESCE((deposit_methods_enabled->>'card')::boolean, true))
          || jsonb_build_object('debit_card', false),
          updated_at = NOW()
        WHERE code = 'dollarpay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE store_payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || jsonb_build_object('credit_card', COALESCE((deposit_methods_enabled->>'card')::boolean, false))
          || jsonb_build_object('debit_card', false),
          updated_at = NOW()
        WHERE provider_code = 'dollarpay'
        `,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `
        UPDATE payment_providers
        SET deposit_methods_enabled =
          COALESCE(deposit_methods_enabled, '{}'::jsonb)
          || jsonb_build_object('debit_card', COALESCE((deposit_methods_enabled->>'card')::boolean, true))
          || jsonb_build_object('credit_card', false),
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
          || jsonb_build_object('debit_card', COALESCE((deposit_methods_enabled->>'card')::boolean, true))
          || jsonb_build_object('credit_card', false),
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
