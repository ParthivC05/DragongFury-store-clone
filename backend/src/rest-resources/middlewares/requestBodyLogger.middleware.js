const { logger, colors } = require('../../libs/logger');

const { GREEN, CYAN, YELLOW, RESET } = colors;
const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'idtoken',
  'id_token',
  'accesstoken',
  'access_token',
  'secret'
];

function sanitize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((k) => lower.includes(k))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = typeof value === 'object' && value !== null ? sanitize(value) : value;
    }
  }
  return out;
}

function requestBodyLogger(req, res, next) {
  const method = req.method;
  const path = req.originalUrl || req.url;
  const body = req.body && Object.keys(req.body).length ? sanitize(req.body) : undefined;
  const query = req.query && Object.keys(req.query).length ? req.query : undefined;
  const payload = body || query;
  const methodPart = `${GREEN}${method}${RESET}`;
  const pathPart = `${CYAN}${path}${RESET}`;
  const bodyPart = payload ? ` ${YELLOW}${JSON.stringify(payload)}${RESET}` : '';
  logger.info(`API ${methodPart} ${pathPart}${bodyPart}`);
  next();
}

module.exports = requestBodyLogger;
