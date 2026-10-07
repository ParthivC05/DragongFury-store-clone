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
