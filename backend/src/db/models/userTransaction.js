'use strict';

const TRANSACTION_TYPES = [
  'deposit',
  'withdraw',
  'spin_wheel',
  'welcome_signup',
  'referral_friend_signup',
  'daily_bonus',
  'daily_bonus_spin',
  'promotion',
  'bonus_code',
  'affiliate',
  'vip_bonus',
  'game_deposit',
  'game_withdraw',
  'admin_deduct',
  'admin_add',
  'deposit_courtesy'
];

module.exports = function (sequelize, DataTypes) {
  const UserTransaction = sequelize.define('UserTransaction', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' },
      field: 'user_id'
    },
    type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'type'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'amount'
    },
    currencyCode: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'SC',
      field: 'currency_code'
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'description'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'metadata'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_at'
    }
  }, {
    sequelize,
    tableName: 'user_transactions',
    timestamps: true,
    createdAt: false,
    updatedAt: false,
    underscored: true,
    hooks: {
      beforeCreate(row) {
        const now = new Date();
        if (row.createdAt == null) row.setDataValue('createdAt', now);
        if (row.updatedAt == null) row.setDataValue('updatedAt', now);
      },
      beforeUpdate(row) {
        row.setDataValue('updatedAt', new Date());
      }
    },
    indexes: [
      { fields: ['user_id'] },
      { fields: ['user_id', 'created_at'] },
      { fields: ['user_id', 'type'] }
    ]
  });

  UserTransaction.associate = function (models) {
    if (models.User) {
      UserTransaction.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  UserTransaction.TYPES = TRANSACTION_TYPES;
  return UserTransaction;
};
