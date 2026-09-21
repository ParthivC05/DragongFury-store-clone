'use strict';

module.exports = function (sequelize, DataTypes) {
  const SupportTicket = sequelize.define('SupportTicket', {
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
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'store_code'
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'open'
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'last_message_at'
    }
  }, {
    sequelize,
    tableName: 'support_tickets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  SupportTicket.associate = function (models) {
    if (models.User) {
      SupportTicket.belongsTo(models.User, { foreignKey: 'userId', as: 'User' });
    }
    if (models.SupportTicketMessage) {
      SupportTicket.hasMany(models.SupportTicketMessage, {
        foreignKey: 'ticketId',
        as: 'Messages'
      });
    }
  };

  return SupportTicket;
};
