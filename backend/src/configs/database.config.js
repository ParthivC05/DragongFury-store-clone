const config = require('./app.config');

const dbSettings = {
  database: config.get('sequelize.name'),
  username: config.get('sequelize.user'),
  password: config.get('sequelize.password'),
  host: config.get('sequelize.writeHost'),
  port: config.get('sequelize.port'),
  dialect: 'postgres',
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  dialectOptions: {
    application_name: config.get('app.name'),
    ...(process.env.DB_SSL !== 'false' && {
      ssl: { require: true, rejectUnauthorized: false }
    })
  }
};

module.exports = dbSettings;
