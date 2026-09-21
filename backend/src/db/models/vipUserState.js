'use strict';

module.exports = function (sequelize, DataTypes) {
  const VipUserState = sequelize.define('VipUserState', {
    userId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'users', key: 'user_id' }, field: 'user_id' },
    vipLevelIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'vip_level_index' },
    vipXp: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, field: 'vip_xp' }
  }, {
    sequelize,
    tableName: 'vip_user_state',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });
  VipUserState.associate = function (models) {
    if (models.User) VipUserState.belongsTo(models.User, { foreignKey: 'userId' });
  };
  return VipUserState;
};
