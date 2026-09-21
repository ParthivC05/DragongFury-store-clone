'use strict';

module.exports = function (sequelize, DataTypes) {
  const Win568WalletOp = sequelize.define('Win568WalletOp', {
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
    kind: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    refNo: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: 'ref_no'
    },
    transactionId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: '',
      field: 'transaction_id'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
      defaultValue: 0
    },
    transferType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'transfer_type'
    },
    transferStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'transfer_status'
    },
    walletOpKey: {
      type: DataTypes.STRING(160),
      allowNull: false,
      field: 'wallet_op_key'
    }
  }, {
    sequelize,
    tableName: 'win568_wallet_ops',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['kind', 'ref_no', 'transaction_id'] },
      { fields: ['user_id'] },
      { fields: ['ref_no'] }
    ]
  });

  Win568WalletOp.associate = function (models) {
    if (models.User) {
      Win568WalletOp.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return Win568WalletOp;
};
