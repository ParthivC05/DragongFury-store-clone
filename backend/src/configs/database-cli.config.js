/**
 * Sequelize CLI config (for npx sequelize db:migrate).
 * Uses same env vars as app: DB_NAME, DB_USER, DB_PASSWORD, DB_WRITE_HOST, DB_PORT, DB_SSL.
 */
require('dotenv').config();
const config = require('./app.config');

const base = {
  username: config.get('sequelize.user'),
  password: config.get('sequelize.password'),
  database: config.get('sequelize.name'),
  host: config.get('sequelize.writeHost'),
  port: config.get('sequelize.port'),
  dialect: 'postgres',
  dialectOptions:
    process.env.DB_SSL !== 'false'
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {}
};

module.exports = {
  development: base,
  test: base,
  production: base
};
