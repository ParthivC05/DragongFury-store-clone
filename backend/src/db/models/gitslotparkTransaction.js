'use strict';

module.exports = function (sequelize, DataTypes) {
  const GitslotparkTransaction = sequelize.define('GitslotparkTransaction', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    transactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'transaction_id'
    },
    refTransactionId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'ref_transaction_id'
    },
    platformTransactionId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'platform_transaction_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    operation: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      defaultValue: 0
    },
    betAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'bet_amount'
    },
    winAmount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'win_amount'
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'balance_after'
    },
    gameId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'game_id'
    },
    roundId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'round_id'
    },
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'gitslotpark'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'completed'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'gitslotpark_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['transaction_id'] },
      { fields: ['ref_transaction_id'] },
      { fields: ['user_id'] }
    ]
  });

  GitslotparkTransaction.associate = function (models) {
    if (models.User) {
      GitslotparkTransaction.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return GitslotparkTransaction;
};
