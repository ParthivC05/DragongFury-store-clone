'use strict';

module.exports = function (sequelize, DataTypes) {
  const ScorpioTransaction = sequelize.define('ScorpioTransaction', {
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
    transactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'transaction_id'
    },
    referenceId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'reference_id'
    },
    roundId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'round_id'
    },
    command: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0
    },
    gameCode: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'game_code'
    },
    providerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'provider_id'
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'completed'
    }
  }, {
    sequelize,
    tableName: 'scorpio_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['transaction_id'] },
      { fields: ['user_id'] },
      { fields: ['reference_id'] },
      { fields: ['round_id'] }
    ]
  });

  ScorpioTransaction.associate = function (models) {
    if (models.User) {
      ScorpioTransaction.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return ScorpioTransaction;
};
