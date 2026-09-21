'use strict';

/**
 * Support tickets: player raises a ticket with threaded messages + image attachments.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [ticketTables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'support_tickets'`
    );
    if (ticketTables.length === 0) {
      await queryInterface.createTable('support_tickets', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        store_code: {
          type: Sequelize.STRING(64),
          allowNull: false
        },
        category: {
          type: Sequelize.STRING(32),
          allowNull: false
        },
        subject: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        status: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'open'
        },
        last_message_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      });

      await queryInterface.addIndex('support_tickets', ['store_code', 'status', 'last_message_at'], {
        name: 'support_tickets_store_status_last_msg_idx'
      });
      await queryInterface.addIndex('support_tickets', ['user_id', 'last_message_at'], {
        name: 'support_tickets_user_last_msg_idx'
      });
    }

    const [msgTables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'support_ticket_messages'`
    );
    if (msgTables.length === 0) {
      await queryInterface.createTable('support_ticket_messages', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        ticket_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'support_tickets', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        author_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        author_role: {
          type: Sequelize.STRING(16),
          allowNull: false
        },
        body: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        attachments: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: []
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW')
        }
      });

      await queryInterface.addIndex('support_ticket_messages', ['ticket_id', 'created_at'], {
        name: 'support_ticket_messages_ticket_created_idx'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('support_ticket_messages');
    await queryInterface.dropTable('support_tickets');
  }
};
