'use strict';

module.exports = function (sequelize, DataTypes) {
  const BonusCode = sequelize.define(
    'BonusCode',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'code'
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'store_code'
      },
      distributorCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'distributor_code'
      },
      bonusType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'deposit',
        field: 'bonus_type'
      },
      claimScope: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: 'claim_scope'
      },
      maxClaimsPerUser: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'max_claims_per_user'
      },
      valueType: {
        type: DataTypes.STRING(16),
        allowNull: false,
        field: 'value_type'
      },
      value: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        field: 'value'
      },
      maxBonusCap: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'max_bonus_cap'
      },
      minDeposit: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'min_deposit'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      createdByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'created_by_user_id'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'updated_at'
      }
    },
    {
      sequelize,
      tableName: 'bonus_codes',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  BonusCode.associate = function (models) {
    if (models.User) {
      BonusCode.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'CreatedBy' });
    }
  };

  return BonusCode;
};
