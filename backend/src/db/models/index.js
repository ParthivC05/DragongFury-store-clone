const path = require('path');
const fs = require('fs');
const Sequelize = require('sequelize');
const dbSettings = require('../../configs/database.config');
const { createLogger } = require('../../libs/logger');

const dbLog = createLogger('sequelize');

const sequelize = new Sequelize(
  dbSettings.database,
  dbSettings.username,
  dbSettings.password,
  {
    host: dbSettings.host,
    port: dbSettings.port,
    dialect: dbSettings.dialect,
    pool: dbSettings.pool,
    define: dbSettings.define,
    dialectOptions: dbSettings.dialectOptions,
    logging: (sql) => dbLog.info(`Database Query Executed - ${sql}`)
  }
);

const db = { sequelize, Sequelize };
const basename = path.basename(__filename);

fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.js'))
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
