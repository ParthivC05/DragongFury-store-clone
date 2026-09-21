'use strict';

module.exports = function (sequelize, DataTypes) {
  const VipLedger = sequelize.define('VipLedger', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'user_id' }, field: 'user_id' },
    entryType: { type: DataTypes.STRING(32), allowNull: false, field: 'entry_type' },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    currencyCode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'SC', field: 'currency_code' },
    idempotencyKey: { type: DataTypes.STRING(255), allowNull: true, field: 'idempotency_key' },
    referenceType: { type: DataTypes.STRING(64), allowNull: true, field: 'reference_type' },
    referenceId: { type: DataTypes.STRING(128), allowNull: true, field: 'reference_id' },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at', defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'vip_ledger',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['user_id', 'created_at'] }
    ]
  });
  VipLedger.associate = function (models) {
    if (models.User) VipLedger.belongsTo(models.User, { foreignKey: 'userId' });
  };
  VipLedger.ENTRY_TYPES = ['xp_grant', 'level_up_reward'];
  return VipLedger;
};
