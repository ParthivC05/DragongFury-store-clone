'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserBonusCodeGrant = sequelize.define(
    'UserBonusCodeGrant',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id'
      },
      bonusCodeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'bonus_code_id'
      },
      depositRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'deposit_request_id'
      },
      amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        field: 'amount'
      },
      currencyCode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'SC',
        field: 'currency_code'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_at'
      }
    },
    {
      sequelize,
      tableName: 'user_bonus_code_grants',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true
    }
  );

  UserBonusCodeGrant.associate = function (models) {
    UserBonusCodeGrant.belongsTo(models.User, { foreignKey: 'userId' });
    UserBonusCodeGrant.belongsTo(models.BonusCode, { foreignKey: 'bonusCodeId' });
    UserBonusCodeGrant.belongsTo(models.DepositRequest, { foreignKey: 'depositRequestId' });
  };

  return UserBonusCodeGrant;
};
