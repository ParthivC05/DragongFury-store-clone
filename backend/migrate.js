/**
 * Run database migrations. Execute with: npm run migrate
 * Use when you update the database schema - NOT on every server start.
 */
require('dotenv').config({ override: true });
const db = require('./src/db/models');
const { runMigrations } = require('./src/db/runMigrations');
const { logger } = require('./src/libs/logger');

async function migrate() {
  try {
    await db.sequelize.authenticate();
    logger.info('Database connected, running migrations...');
    await runMigrations(db.sequelize);
    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error('Migration failed', { err: err.message, stack: err.stack });
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

migrate();
