'use strict';

module.exports = function (sequelize, DataTypes) {
  const AdminRole = sequelize.define('AdminRole', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'slug'
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    sequelize,
    tableName: 'admin_roles',
    schema: 'public',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  AdminRole.associate = function (models) {
    if (models.User) {
      AdminRole.hasMany(models.User, { foreignKey: 'adminRoleId' });
    }
  };

  return AdminRole;
};
