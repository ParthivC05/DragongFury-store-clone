'use strict';

module.exports = function (sequelize, DataTypes) {
  const GitslotparkUserMapping = sequelize.define('GitslotparkUserMapping', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'user_id' }
    },
    gitslotparkUserId: {
      type: DataTypes.STRING(48),
      allowNull: false,
      field: 'gitslotpark_user_id'
    }
  }, {
    sequelize,
    tableName: 'gitslotpark_user_mappings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id'] },
      { unique: true, fields: ['gitslotpark_user_id'] }
    ]
  });

  GitslotparkUserMapping.associate = function (models) {
    if (models.User) {
      GitslotparkUserMapping.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return GitslotparkUserMapping;
};
