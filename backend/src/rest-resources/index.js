const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const config = require('../configs/app.config');
const routes = require('./routes');
const requestBodyLogger = require('./middlewares/requestBodyLogger.middleware');
const openApiSpec = require('./swagger/openapi');

const app = express();

function resolveTrustProxy() {
  const raw = String(process.env.TRUST_PROXY || '1').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

// Required behind nginx/ALB/Cloudflare so rate-limit and req.ip see the client.
// Set TRUST_PROXY=2 if Cloudflare (or another proxy) sits in front of nginx.
app.set('trust proxy', resolveTrustProxy());

app.use(helmet({ contentSecurityPolicy: false }));

// DollarPay webhooks are form-urlencoded; mount before JSON body parsers / raw JSON webhooks
const dollarpayWebhookController = require('./controllers/dollarpayWebhook.controller');
app.use('/api/webhooks/dollarpay', express.urlencoded({ extended: true }), dollarpayWebhookController.dollarpayWebhook);

// Mailgun DragonFury campaign delivery events (failed / delivered / complained)
const mailgunCampaignWebhookController = require('./controllers/mailgunCampaignWebhook.controller');
app.use(
  '/api/webhooks/mailgun/dragonfury-campaigns',
  express.json({ limit: '2mb' }),
  express.urlencoded({ extended: true }),
  mailgunCampaignWebhookController.dragonfuryCampaignMailgunWebhook
);

// XXPay async notify: ShowDoc says application/x-www-form-urlencoded; examples also use JSON
const xxpayWebhookController = require('./controllers/xxpayWebhook.controller');
app.use(
  '/api/webhooks/xxpay',
  express.urlencoded({ extended: true }),
  express.json(),
  xxpayWebhookController.xxpayWebhook
);

// Webhook route needs raw body for HMAC verification; mount before bodyParser.json()
const webhookRoutes = require('./routes/webhook.routes');
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// Bona Seamless Wallet callbacks — need exact raw JSON for X-Sign verification
const bonaCallbackRoutes = require('./routes/bonaCallback.routes');
app.use(
  '/api/bona/callback',
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString('utf8') : '';
    }
  }),
  bonaCallbackRoutes
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Domain-root wallet: GitSlotPark + 568Win share POST /GetBalance (payload dispatcher).
// 568Win unique methods (Deduct/Settle/...) also live at root so BO Domain can be https://dragonfury.com/
const walletRootCallbackRoutes = require('./routes/walletRootCallback.routes');
app.use(walletRootCallbackRoutes);

const gitslotparkCallbackRoutes = require('./routes/gitslotparkCallback.routes');
app.use(gitslotparkCallbackRoutes);

// 568Win also stays under /api/568win if BO Domain is that prefix.
const win568CallbackRoutes = require('./routes/win568Callback.routes');
app.use('/api/568win/sw-v2', win568CallbackRoutes);
app.use('/api/568Win/sw-v2', win568CallbackRoutes);
app.use('/api/568win', win568CallbackRoutes);
app.use('/api/568Win', win568CallbackRoutes);

const scorpioCallbackRoutes = require('./routes/scorpioCallback.routes');
app.use('/api/scorpio/callback', scorpioCallbackRoutes);

// Swagger API documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Partner Platform API',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    operationsSorter: 'alpha'
  }
}));
app.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiSpec);
});

const origins = (config.get('app.origin') || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: origins.length ? origins : true,
  credentials: true,
  maxAge: 86400,
  exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count']
}));

app.use(requestBodyLogger);

// Log 4xx/5xx responses for fast debugging (attach before routes so it runs for every request)
app.use((req, res, next) => {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status >= 500) {
      const { logger } = require('../libs/logger');
      logger.error(`API ${req.method} ${req.originalUrl || req.url} → ${status}`);
    } else if (status >= 400) {
      const { logger } = require('../libs/logger');
      logger.warn(`API ${req.method} ${req.originalUrl || req.url} → ${status}`);
    }
  });
  next();
});

app.use(routes);

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use((req, res) => {
  res.status(404).json({ message: 'Partner Platform Backend', status: 404 });
});

app.use((err, req, res, next) => {
  const { logger } = require('../libs/logger');

  // Malformed JSON body (body-parser) — client error; do not alert admins.
  if (err.type === 'entity.parse.failed') {
    logger.warn(`Invalid JSON body: ${err.message}`, { path: req.path, method: req.method });
    return res.status(400).json({ message: 'Invalid JSON in request body.' });
  }

  logger.error(`Unhandled: ${err.message}`, { path: req.path, method: req.method, stack: err.stack });
  // Fire-and-forget: notify master_admin users with technical_error_email_notification permission
  const { notifyTechnicalError } = require('../services/notifications/notifyTechnicalError.service');
  notifyTechnicalError({
    message: err.message || 'Internal error',
    stack: err.stack,
    path: req.path || req.originalUrl,
    method: req.method
  }).catch(() => {});
  res.status(500).json({ message: err.message || 'Internal error' });
});

module.exports = app;
