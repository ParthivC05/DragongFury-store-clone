'use strict';

module.exports = function (sequelize, DataTypes) {
  const ReferralDepositReward = sequelize.define('ReferralDepositReward', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    referrerUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' },
      field: 'referrer_user_id'
    },
    referredUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'user_id' },
      field: 'referred_user_id'
    },
    depositRequestId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'deposit_requests', key: 'id' },
      field: 'deposit_request_id'
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'amount'
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'paid',
      field: 'status'
    },
    payoutAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'payout_at'
    },
    playthroughAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'playthrough_at'
    },
    creditedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'credited_at'
    },
    skipReason: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'skip_reason'
    }
  }, {
    sequelize,
    tableName: 'referral_deposit_rewards',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { fields: ['referrer_user_id', 'referred_user_id'] },
      { fields: ['status', 'payout_at'] },
      { fields: ['deposit_request_id'] }
    ]
  });

  ReferralDepositReward.associate = function (models) {
    if (models.User) {
      ReferralDepositReward.belongsTo(models.User, { as: 'Referrer', foreignKey: 'referrerUserId' });
      ReferralDepositReward.belongsTo(models.User, { as: 'Referred', foreignKey: 'referredUserId' });
    }
  };

  return ReferralDepositReward;
};
