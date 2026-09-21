'use strict';

module.exports = function (sequelize, DataTypes) {
  const FooterMenu = sequelize.define(
    'FooterMenu',
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
      label: {
        type: DataTypes.STRING(255),
        allowNull: false
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
      tableName: 'footer_menus',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  FooterMenu.associate = function (models) {
    if (models.FooterPage) {
      FooterMenu.hasMany(models.FooterPage, {
        foreignKey: 'menuId',
        as: 'pages'
      });
    }
  };

  return FooterMenu;
};
