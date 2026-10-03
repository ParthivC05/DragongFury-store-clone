'use strict';

module.exports = function (sequelize, DataTypes) {
  const UserErrorLog = sequelize.define('UserErrorLog', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    httpStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'http_status'
    },
    errorCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'error_code'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pageUrl: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'page_url'
    },
    apiPath: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'api_path'
    },
    httpMethod: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'http_method'
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'user_agent'
    },
    countryCode: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: 'country_code'
    },
    countryName: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'country_name'
    },
    isVpn: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'is_vpn'
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at'
    }
  }, {
    tableName: 'user_error_logs',
    timestamps: false,
    underscored: true
  });

  return UserErrorLog;
};
