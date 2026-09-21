'use strict';

module.exports = function (sequelize, DataTypes) {
  const Notification = sequelize.define(
    'Notification',
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
      type: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'promotion_bonus',
        field: 'type'
      },
      title: {
        type: DataTypes.STRING(256),
        allowNull: false,
        field: 'title'
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
        field: 'message'
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'read_at'
      },
      actionUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'action_url'
      },
      category: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'other',
        field: 'category'
      }
    },
    {
      sequelize,
      tableName: 'notifications',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['user_id', 'read_at'] }
      ]
    }
  );

  Notification.associate = function (models) {
    if (models.User) Notification.belongsTo(models.User, { foreignKey: 'userId' });
  };

  /** Push FCM after every in-app notification create (best-effort, outside the create transaction). */
  Notification.afterCreate((instance) => {
    setTimeout(() => {
      try {
        const { sendPushForNotification } = require('../../services/notifications/sendPushForNotification.service');
        sendPushForNotification(instance).catch(() => {});
      } catch (_) {
        /* never block notification create on push failure */
      }
    }, 0);
  });

  return Notification;
};
