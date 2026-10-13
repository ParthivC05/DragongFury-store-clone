'use strict';

module.exports = function (sequelize, DataTypes) {
  const PageSchema = sequelize.define(
    'PageSchema',
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
      pageKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'page_key'
      },
      schemaEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'schema_enabled'
      },
      schemaType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'WebPage',
        field: 'schema_type'
      },
      schemaFields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        field: 'schema_fields'
      },
      schemaCustom: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'schema_custom'
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
      }
    },
    {
      sequelize,
      tableName: 'page_schemas',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );
  return PageSchema;
};
