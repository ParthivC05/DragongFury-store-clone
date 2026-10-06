'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameSeoPage = sequelize.define(
    'GameSeoPage',
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
      slug: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      genre: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      catalogName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'catalog_name'
      },
      defaultImage: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'default_image'
      },
      imageUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        field: 'image_url'
      },
      heroLead: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'hero_lead'
      },
      heroBlurb: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'hero_blurb'
      },
      buttons: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      sections: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      metaTitle: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'meta_title'
      },
      metaDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'meta_description'
      },
      metaTags: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        field: 'meta_tags'
      },
      canonicalUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        field: 'canonical_url'
      },
      allowIndex: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'allow_index'
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order'
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
      tableName: 'game_seo_pages',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  return GameSeoPage;
};
