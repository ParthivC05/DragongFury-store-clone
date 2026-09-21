'use strict';

module.exports = function (sequelize, DataTypes) {
  const ContactListDownload = sequelize.define('ContactListDownload', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    downloadedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'downloaded_by_user_id',
      references: { model: 'users', key: 'user_id' }
    },
    downloadedByEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'downloaded_by_email'
    },
    downloadedByUsername: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'downloaded_by_username'
    },
    downloadedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'downloaded_by_name'
    },
    downloadedByRole: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'downloaded_by_role'
    },
    listType: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'list_type'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    distributorCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'distributor_code'
    },
    verifiedOnly: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'verified_only'
    },
    search: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    rowCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'row_count'
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'file_name'
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'contact_list_downloads',
    schema: 'public',
    timestamps: true,
    createdAt: false,
    updatedAt: false,
    underscored: true
  });

  ContactListDownload.associate = function (models) {
    if (models.User) {
      ContactListDownload.belongsTo(models.User, {
        foreignKey: 'downloadedByUserId',
        as: 'DownloadedBy'
      });
    }
  };

  return ContactListDownload;
};
