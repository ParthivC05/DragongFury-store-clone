'use strict';

module.exports = function (sequelize, DataTypes) {
  const FooterPage = sequelize.define(
    'FooterPage',
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
      menuId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'menu_id'
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
      redirectPath: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'redirect_path'
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
      sections: {
        type: DataTypes.JSONB,
        allowNull: true
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
      tableName: 'footer_pages',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  FooterPage.associate = function (models) {
    if (models.FooterMenu) {
      FooterPage.belongsTo(models.FooterMenu, {
        foreignKey: 'menuId',
        as: 'menu'
      });
    }
  };

  return FooterPage;
};
