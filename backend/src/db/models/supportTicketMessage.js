'use strict';

module.exports = function (sequelize, DataTypes) {
  const SupportTicketMessage = sequelize.define('SupportTicketMessage', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    ticketId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'ticket_id',
      references: { model: 'support_tickets', key: 'id' }
    },
    authorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'author_user_id',
      references: { model: 'users', key: 'user_id' }
    },
    authorRole: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'author_role'
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    }
  }, {
    sequelize,
    tableName: 'support_ticket_messages',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  SupportTicketMessage.associate = function (models) {
    if (models.SupportTicket) {
      SupportTicketMessage.belongsTo(models.SupportTicket, {
        foreignKey: 'ticketId',
        as: 'Ticket'
      });
    }
    if (models.User) {
      SupportTicketMessage.belongsTo(models.User, {
        foreignKey: 'authorUserId',
        as: 'Author'
      });
    }
  };

  return SupportTicketMessage;
};
