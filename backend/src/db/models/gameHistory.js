'use strict';

module.exports = function (sequelize, DataTypes) {
  const GameHistory = sequelize.define(
    'GameHistory',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      gameId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'game_id',
        references: { model: 'games', key: 'id' }
      },
      gameName: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'game_name'
      },
      storeCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'store_code'
      },
      action: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      fieldName: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'field_name'
      },
      oldValue: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'old_value'
      },
      newValue: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'new_value'
      },
      changedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'changed_by_user_id',
        references: { model: 'users', key: 'user_id' }
      },
      changedByName: {
        type: DataTypes.STRING(256),
        allowNull: true,
        field: 'changed_by_name'
      },
      changedByRole: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'changed_by_role'
      },
      triggerSource: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'admin_panel',
        field: 'trigger_source'
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at'
      }
    },
    {
      sequelize,
      tableName: 'game_history',
      timestamps: false
    }
  );

  GameHistory.associate = function (models) {
    if (models.Game) {
      GameHistory.belongsTo(models.Game, { foreignKey: 'gameId' });
    }
    if (models.User) {
      GameHistory.belongsTo(models.User, { foreignKey: 'changedByUserId', as: 'ChangedByUser' });
    }
  };

  return GameHistory;
};
