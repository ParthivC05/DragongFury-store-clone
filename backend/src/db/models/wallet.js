'use strict';

module.exports = function (sequelize, DataTypes) {
  const Wallet = sequelize.define('Wallet', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' }
    },
    currencyCode: {
      type: DataTypes.STRING(10),
      allowNull: false /* Code from settings (e.g. 'SC'); no FK */
    },
    balance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    /** Play-through remaining on PSC/BSC. RSC is cashable without play-through. */
    playBalance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'play_balance'
    },
    /** Amount locked by pending withdrawal requests; excluded from available (games + withdraw) until approved or rejected. */
    frozenBalance: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'frozen_balance'
    }
  }, {
    sequelize,
    tableName: 'wallets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  Wallet.associate = function (models) {
    Wallet.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Wallet;
};
