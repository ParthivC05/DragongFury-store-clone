'use strict';

module.exports = function (sequelize, DataTypes) {
  const OneGameHubTransaction = sequelize.define('OneGameHubTransaction', {
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
    providerTransactionId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'provider_transaction_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '',
      field: 'store_code'
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
    balanceAfter: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'balance_after'
    },
    gameId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'game_id'
    },
    roundId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'round_id'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'completed'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'one_game_hub_transactions',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { unique: true, fields: ['transaction_id'] },
      { fields: ['user_id'] },
      { fields: ['round_id'] },
      { fields: ['game_id'] }
    ]
  });

  OneGameHubTransaction.associate = function (models) {
    if (models.User) {
      OneGameHubTransaction.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return OneGameHubTransaction;
};
