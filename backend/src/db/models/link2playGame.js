'use strict';

module.exports = function (sequelize, DataTypes) {
  const Link2PlayGame = sequelize.define(
    'Link2PlayGame',
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      imageUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        field: 'image_url'
      },
      isPopular: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_popular'
      },
      isLive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_live'
      },
      linkWeb: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        field: 'link_web'
      },
      linkAndroid: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        field: 'link_android'
      },
      linkIos: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        field: 'link_ios'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      }
    },
    {
      sequelize,
      tableName: 'link2play_games',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );
  return Link2PlayGame;
};
