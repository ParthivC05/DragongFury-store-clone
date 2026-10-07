'use strict';

module.exports = function (sequelize, DataTypes) {
  const BlogPost = sequelize.define(
    'BlogPost',
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
      title: {
        type: DataTypes.STRING(512),
        allowNull: false
      },
      slug: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
      },
      category: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      titleImage: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        field: 'title_image'
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
      schemaEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'schema_enabled'
      },
      schemaType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'BlogPosting',
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

      permanentRedirect: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        field: 'permanent_redirect'
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'deleted_at'
      },
      deletedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'deleted_by_id'
      },
      deletedByName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'deleted_by_name'
      },
      restoredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'restored_at'
      },
      restoredById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'restored_by_id'
      },
      restoredByName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'restored_by_name'
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
      tableName: 'blog_posts',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );
  return BlogPost;
};
