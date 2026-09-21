'use strict';

/**
 * GameManualRequest tracks pending game operations (register / deposit / redeem)
 * that need manual handling by an admin or store partner because the game bot is offline.
 *
 * Lifecycle:
 *   - status: 'pending'  → request created, waiting for admin action
 *   - status: 'approved' → admin completed the operation manually
 *   - status: 'rejected' → admin declined the request (deposit funds are refunded on rejection)
 */
module.exports = function (sequelize, DataTypes) {
  const GameManualRequest = sequelize.define(
    'GameManualRequest',
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
        field: 'user_id',
        references: { model: 'users', key: 'user_id' }
      },
      gameId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'game_id',
        references: { model: 'games', key: 'id' }
      },
      requestType: {
        type: DataTypes.STRING(16),
        allowNull: false,
        field: 'request_type'
        // values: 'register' | 'deposit' | 'redeem'
      },
      amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true
        // null for register requests; set for deposit and redeem
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending'
        // values: 'pending' | 'approved' | 'rejected'
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'store_code'
        // copied from the user at request creation time, used to route to the right store admin
      },
      distributorCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'distributor_code'
      },
      resolvedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'resolved_by_user_id'
        // the admin user who approved or rejected this request
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'resolved_at'
      },
      operationDoneBy: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'operation_done_by'
        // values: 'store_admin' | 'distributor_admin' | 'master_admin'
      },
      // For register approvals: the credentials the admin assigned
      gameUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'game_username'
      },
      gamePassword: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'game_password'
      },
      rejectionReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'rejection_reason'
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      tableName: 'game_manual_requests',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['game_id'] },
        { fields: ['status'] },
        { fields: ['store_code'] },
        { fields: ['distributor_code'] },
        { fields: ['request_type'] },
        { name: 'game_manual_requests_expiry_idx', fields: ['request_type', 'status', 'created_at'] }
      ]
    }
  );

  GameManualRequest.associate = function (models) {
    if (models.User) {
      GameManualRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
    if (models.Game) {
      GameManualRequest.belongsTo(models.Game, { foreignKey: 'gameId', as: 'Game' });
    }
    if (models.GameManualRequestLog) {
      GameManualRequest.hasMany(models.GameManualRequestLog, { foreignKey: 'manualRequestId', as: 'Logs' });
    }
  };

  return GameManualRequest;
};
