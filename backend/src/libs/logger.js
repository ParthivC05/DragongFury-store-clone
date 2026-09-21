const winston = require('winston');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const level = isProduction ? 'info' : 'debug';

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level: lvl, message, timestamp, stack, module, service, ...meta }) => {
    const mod = module ? `[${module}] ` : '';
    const usefulMeta = Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'service'));
    const metaStr = Object.keys(usefulMeta).length ? ' ' + JSON.stringify(usefulMeta) : '';
    const base = `${timestamp} ${lvl}: ${mod}${message}${metaStr}`;
    return stack ? `${base}\n${stack}` : base;
  })
);

const logger = winston.createLogger({
  level,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), consoleFormat)
    })
  ]
});

/** Create a child logger with module/context metadata for easier tracking */
function createLogger(moduleName) {
  return logger.child({ module: moduleName });
}

/** Log a message in blue (e.g. DB connected) for readability */
const RESET = '\x1b[0m';
const BLUE = '\x1b[34m';

function infoBlue(message) {
  logger.info(`${BLUE}${message}${RESET}`);
}

/** Hotpink for payment API logs (when PAYMENT_LOG_ENABLED=true) */
const HOTPINK = '\x1b[38;5;205m';

const colors = {
  RESET,
  BLUE,
  GREEN: '\x1b[32m',
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  MAGENTA: '\x1b[35m',
  GRAY: '\x1b[90m',
  BOLD: '\x1b[1m',
  BRIGHT_CYAN: '\x1b[96m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_GREEN: '\x1b[92m',
  HOTPINK
};

/** Log payment API messages in hotpink when PAYMENT_LOG_ENABLED is set. Uses console.log so ANSI shows. */
function paymentLog(...args) {
  if (process.env.PAYMENT_LOG_ENABLED !== 'true' && process.env.PAYMENT_LOG_ENABLED !== '1') return;
  const safeJson = (value) => JSON.stringify(value, (key, val) => (typeof val === 'bigint' ? val.toString() : val), 2);
  const parts = args.map((a) => {
    if (typeof a === 'object' && a !== null) return safeJson(a);
    return String(a);
  });
  const msg = parts.join(' ');
  const line = `${HOTPINK}[PAYMENT] ${msg}${RESET}`;
  console.log(line);
}

/** Log payment errors in hotpink when PAYMENT_ERROR_LOG_ENABLED or PAYMENT_LOG_ENABLED is set. */
function paymentErrorLog(...args) {
  const on = process.env.PAYMENT_ERROR_LOG_ENABLED === 'true' || process.env.PAYMENT_ERROR_LOG_ENABLED === '1' ||
    process.env.PAYMENT_LOG_ENABLED === 'true' || process.env.PAYMENT_LOG_ENABLED === '1';
  if (!on) return;
  const safeJson = (value) => JSON.stringify(value, (key, val) => (typeof val === 'bigint' ? val.toString() : val), 2);
  const msg = args.map((a) => (typeof a === 'object' ? safeJson(a) : String(a))).join(' ');
  const line = `${HOTPINK}[PAYMENT ERROR] ${msg}${RESET}`;
  console.log(line);
}

/** Log environment once at app startup (call from index.js) */
function logEnvOnce() {
  logger.info(`Environment: ${NODE_ENV}`);
}

module.exports = { logger, createLogger, infoBlue, colors, paymentLog, paymentErrorLog, logEnvOnce };
