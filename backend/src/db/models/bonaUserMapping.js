'use strict';

module.exports = function (sequelize, DataTypes) {
  const BonaUserMapping = sequelize.define('BonaUserMapping', {
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
    bonaUsername: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'bona_username'
    },
    bonaUid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'bona_uid'
    },
    lastToken: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'last_token'
    },
    walletMode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
      field: 'wallet_mode'
    },
    walletInitialized: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'wallet_initialized'
    }
  }, {
    sequelize,
    tableName: 'bona_user_mappings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id'] },
      { unique: true, fields: ['bona_username'] },
      { fields: ['bona_uid'] }
    ]
  });

  BonaUserMapping.associate = function (models) {
    if (models.User) {
      BonaUserMapping.belongsTo(models.User, { foreignKey: 'userId' });
    }
  };

  return BonaUserMapping;
};
