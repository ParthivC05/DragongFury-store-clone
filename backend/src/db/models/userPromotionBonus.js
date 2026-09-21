'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserPromotionBonus = sequelize.define(
    'UserPromotionBonus',
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
        references: { model: 'users', key: 'user_id' },
        field: 'user_id'
      },
      promotionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'promotions', key: 'id' },
        field: 'promotion_id'
      },
      referenceType: {
        type: DataTypes.STRING(16),
        allowNull: false,
        field: 'reference_type'
      },
      referenceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'reference_id'
      },
      amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        field: 'amount'
      }
    },
    {
      sequelize,
      tableName: 'user_promotion_bonuses',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['user_id', 'promotion_id'] }
      ]
    }
  );

  UserPromotionBonus.associate = function (models) {
    if (models.User) UserPromotionBonus.belongsTo(models.User, { foreignKey: 'userId' });
    if (models.Promotion) UserPromotionBonus.belongsTo(models.Promotion, { foreignKey: 'promotionId' });
  };

  return UserPromotionBonus;
};
