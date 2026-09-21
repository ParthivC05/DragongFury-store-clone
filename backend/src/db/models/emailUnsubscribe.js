'use strict';

module.exports = function (sequelize, DataTypes) {
  const EmailUnsubscribe = sequelize.define(
    'EmailUnsubscribe',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'store_code'
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false
      }
    },
    {
      sequelize,
      tableName: 'email_unsubscribes',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      underscored: true
    }
  );

  return EmailUnsubscribe;
};
