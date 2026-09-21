'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserDeviceToken = sequelize.define(
    'UserDeviceToken',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' },
        field: 'user_id'
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: true,
        unique: true
      },
      client: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'web',
        field: 'client'
      },
      deviceId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'device_id'
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'store_code'
      },
      permissionStatus: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'default',
        field: 'permission_status'
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'user_agent'
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_seen_at'
      }
    },
    {
      sequelize,
      tableName: 'user_device_tokens',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [{ fields: ['user_id'] }]
    }
  );

  UserDeviceToken.associate = function (models) {
    if (models.User) UserDeviceToken.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return UserDeviceToken;
};
