'use strict';

module.exports = function (sequelize, DataTypes) {
  const ChimeDepositRequest = sequelize.define('ChimeDepositRequest', {
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
    distributorCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'distributor_code'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    depositType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'deposit_type'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: true
    },
    sourceUsername: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'source_username'
    },
    destinationUsername: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'destination_username'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending'
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    },
    packageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'package_id',
      references: { model: 'deposit_packages', key: 'id' }
    },
    creditSc: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: true,
      field: 'credit_sc'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    approvedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'approved_by_user_id'
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at'
    }
  }, {
    sequelize,
    tableName: 'chime_deposit_requests',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  ChimeDepositRequest.associate = function (models) {
    if (models.User) {
      ChimeDepositRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
      ChimeDepositRequest.belongsTo(models.User, { foreignKey: 'approvedByUserId', as: 'ApprovedByUser' });
    }
  };

  return ChimeDepositRequest;
};
