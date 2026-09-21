'use strict';

module.exports = function (sequelize, DataTypes) {
  const Promotion = sequelize.define(
    'Promotion',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(256),
        allowNull: false
      },
      slug: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
      },
      image: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'image'
      },
      ctaText: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'cta_text'
      },
      ctaUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
        field: 'cta_url'
      },
      backgroundColor: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'background_color'
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'display_order'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_active'
      },
      bonusTriggerType: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'bonus_trigger_type'
      },
      bonusType: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: 'bonus_type'
      },
      bonusValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        field: 'bonus_value'
      },
      minTriggerAmount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'min_trigger_amount'
      },
      maxBonusCap: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true,
        field: 'max_bonus_cap'
      }
    },
    {
      sequelize,
      tableName: 'promotions',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true
    }
  );

  return Promotion;
};
