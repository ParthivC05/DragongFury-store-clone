'use strict';

module.exports = function (sequelize, DataTypes) {
  const HelpContent = sequelize.define(
    'HelpContent',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      topic: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'store_code'
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      videoUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'video_url'
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order'
      }
    },
    {
      sequelize,
      tableName: 'help_content',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );
  return HelpContent;
};
