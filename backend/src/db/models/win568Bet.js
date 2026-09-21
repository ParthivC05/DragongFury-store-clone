'use strict';

module.exports = function (sequelize, DataTypes) {
  const Win568Bet = sequelize.define('Win568Bet', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    transferCode: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'transfer_code'
    },
    transactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: '',
      field: 'transaction_id'
    },
    productType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'product_type'
    },
    gameType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'game_type'
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'running'
    },
    stake: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0
    },
    winloss: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: true
    },
    resultType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'result_type'
    },
    ops: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    }
  }, {
    sequelize,
    tableName: 'win568_bets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['transfer_code', 'transaction_id'] },
      { fields: ['user_id'] },
      { fields: ['transfer_code'] }
    ]
  });

  Win568Bet.associate = function (models) {
    if (models.User) {
      Win568Bet.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return Win568Bet;
};
