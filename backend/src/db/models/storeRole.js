'use strict';

module.exports = function (sequelize, DataTypes) {
  const StoreRole = sequelize.define('StoreRole', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    distributorCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'distributor_code'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'store_code'
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'slug'
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    sequelize,
    tableName: 'store_roles',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  StoreRole.associate = function (models) {
    if (models.User) {
      StoreRole.hasMany(models.User, { foreignKey: 'storeRoleId' });
    }
  };

  return StoreRole;
};
