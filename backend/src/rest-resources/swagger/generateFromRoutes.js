'use strict';

/**
 * Walk mounted Express routers and emit a valid OpenAPI 3 paths object.
 * Swagger UI only renders operations that sit directly under `paths` —
 * nested path keys (the old handwritten spec) are ignored, which is why
 * most tag sections showed a title and no endpoints.
 */

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options']);

const AUTH_MIDDLEWARE_NAMES = new Set([
  'authMiddleware',
  'authMiddlewareWithBodyToken',
  'adminMiddleware',
  'requireMasterAdmin',
  'requireMasterOrStoreAdmin',
  'requireAdminPermissionByPath'
]);

const OPTIONAL_AUTH_NAMES = new Set(['authMiddlewareOptional']);

const TAG_META = [
  { name: 'Health', description: 'Status and health check' },
  { name: 'Auth', description: 'Registration, login, SSO, email verification, password reset' },
  { name: 'User', description: 'Profile and password' },
  { name: 'Wallet', description: 'Balance, deposit, withdraw, payment account' },
  { name: 'Payments', description: 'Deposit/withdraw methods and sessions' },
  { name: 'Withdraw', description: 'Speed / payout status' },
  { name: 'Transactions', description: 'Transaction history' },
  { name: 'Games', description: 'Platform games, register, top-up, redeem' },
  { name: 'GitSlotPark', description: 'Iframe slots (GitSlotPark)' },
  { name: 'Bona', description: 'Iframe slots (Bona)' },
  { name: '568Win', description: '568Win Seamless Game Provider catalog and launch' },
  { name: 'Spin Wheel', description: 'Spin wheel config, status, spin, admin settings' },
  { name: 'Daily Bonus', description: 'Daily bonus status and claims' },
  { name: 'Promotions', description: 'Promotions list and admin' },
  { name: 'VIP', description: 'VIP status and settings' },
  { name: 'Affiliate', description: 'Affiliate stats and settings' },
  { name: 'Notifications', description: 'User notifications' },
  { name: 'Deposit Packages', description: 'Deposit package catalog' },
  { name: 'Deposit Bonuses', description: 'Deposit bonus rules' },
  { name: 'Welcome Signup Bonus', description: 'Welcome signup bonus' },
  { name: 'Dashboard Slideshow', description: 'Lobby slideshow' },
  { name: 'Email Campaigns', description: 'Campaign claim / apply code' },
  { name: 'KYC', description: 'Identity verification' },
  { name: 'Phone', description: 'Phone verification' },
  { name: 'Geo', description: 'Geo / VPN access check' },
  { name: 'Support Tickets', description: 'Player support tickets' },
  { name: 'Help', description: 'Help center content' },
  { name: 'Blog', description: 'Blog posts' },
  { name: 'Footer', description: 'Footer menus and CMS pages' },
  { name: 'Social Links', description: 'Store social links' },
  { name: 'Landing Payment Links', description: 'Landing-page payment links' },
  { name: 'Link2Play', description: 'Link2Play catalog' },
  { name: 'Admin', description: 'Admin panel APIs (login, stores, users, reports, games, …)' },
  { name: 'Webhooks', description: 'Payment and KYC provider callbacks' },
  { name: 'Cron', description: 'Internal scheduled jobs' },
  { name: 'Other', description: 'Uncategorized' }
];

const TAG_BY_PREFIX = {
  status: 'Health',
  healthcheck: 'Health',
  auth: 'Auth',
  user: 'User',
  wallet: 'Wallet',
  payments: 'Payments',
  withdraw: 'Withdraw',
  transactions: 'Transactions',
  games: 'Games',
  gitslotpark: 'GitSlotPark',
  bona: 'Bona',
  win568: '568Win',
  '568win': '568Win',
  spinwheel: 'Spin Wheel',
  'daily-bonus': 'Daily Bonus',
  promotions: 'Promotions',
  vip: 'VIP',
  affiliate: 'Affiliate',
  notifications: 'Notifications',
  'deposit-packages': 'Deposit Packages',
  'deposit-bonuses': 'Deposit Bonuses',
  'welcome-signup-bonus': 'Welcome Signup Bonus',
  'dashboard-slideshow': 'Dashboard Slideshow',
  'email-campaigns': 'Email Campaigns',
  'push-campaigns': 'Push Campaigns',
  kyc: 'KYC',
  phone: 'Phone',
  geo: 'Geo',
  'support-tickets': 'Support Tickets',
  help: 'Help',
  blog: 'Blog',
  footer: 'Footer',
  'social-links': 'Social Links',
  'slot-providers': 'Slot Providers',
  'landing-payment-links': 'Landing Payment Links',
  link2play: 'Link2Play',
  admin: 'Admin',
  webhooks: 'Webhooks',
  cron: 'Cron'
};

function joinPaths(base, child) {
  const left = String(base || '').replace(/\/+$/, '');
  let right = String(child || '');
  if (!right || right === '/') return left || '/';
  if (!right.startsWith('/')) right = `/${right}`;
  const combined = `${left}${right}`.replace(/\/{2,}/g, '/');
  return combined || '/';
}

function mountPathFromRegexp(regexp) {
  if (!regexp) return '';
  if (regexp.fast_slash) return '';
  const src = regexp.source || '';
  if (src === '^\\/?(?=\\/|$)' ) return '';
  let path = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\/\?\$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
  if (!path || path === '/') return '';
  if (!path.startsWith('/')) path = `/${path}`;
  return path.replace(/\/+$/, '');
}

function toOpenApiPath(expressPath) {
  return String(expressPath || '/').replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParams(openApiPath) {
  const names = [];
  const re = /\{([A-Za-z0-9_]+)\}/g;
  let match;
  while ((match = re.exec(openApiPath))) names.push(match[1]);
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' }
  }));
}

function tagForPath(fullPath) {
  const cleaned = String(fullPath || '').split('?')[0];
  const parts = cleaned.split('/').filter(Boolean);
  if (parts[0] !== 'api') {
    if (['GetBalance', 'Withdraw', 'Deposit', 'BetWin', 'RollbackTransaction'].includes(parts[0])) {
      return 'GitSlotPark';
    }
    return 'Other';
  }
  return TAG_BY_PREFIX[parts[1]] || 'Other';
}

function humanizeHandler(name) {
  if (!name || name === '<anonymous>' || name === 'bound dispatch') return null;
  const trimmed = name.replace(/Handler$/, '').replace(/Controller$/, '');
  const spaced = trimmed.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function operationSummary(method, fullPath, handlerName) {
  const fromHandler = humanizeHandler(handlerName);
  if (fromHandler) return fromHandler;
  const leaf = String(fullPath).split('/').filter(Boolean).pop() || method;
  return `${method.toUpperCase()} ${leaf}`;
}

function inspectRouteAuth(route) {
  const names = (route.stack || []).map((layer) => layer.name);
  const required = names.some((n) => AUTH_MIDDLEWARE_NAMES.has(n));
  const optional = names.some((n) => OPTIONAL_AUTH_NAMES.has(n));
  const handler = [...(route.stack || [])].reverse().find((layer) => {
    const n = layer.name;
    return n && n !== '<anonymous>' && !AUTH_MIDDLEWARE_NAMES.has(n) && !OPTIONAL_AUTH_NAMES.has(n);
  });
  return {
    required,
    optional,
    handlerName: handler ? handler.name : null
  };
}

function collectFromRouter(router, basePath, acc) {
  if (!router || !Array.isArray(router.stack)) return;
  for (const layer of router.stack) {
    if (layer.route) {
      const fullPath = joinPaths(basePath, layer.route.path);
      const methods = Object.keys(layer.route.methods || {}).filter((m) => HTTP_METHODS.has(m));
      const auth = inspectRouteAuth(layer.route);
      for (const method of methods) {
        acc.push({
          method,
          path: fullPath,
          ...auth
        });
      }
      continue;
    }
    if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
      const mount = mountPathFromRegexp(layer.regexp);
      collectFromRouter(layer.handle, joinPaths(basePath, mount), acc);
    }
  }
}

function extraManualRoutes() {
  return [
    { method: 'post', path: '/api/webhooks/dollarpay', required: false, optional: false, handlerName: 'dollarpayWebhook' },
    { method: 'post', path: '/api/webhooks/xxpay', required: false, optional: false, handlerName: 'xxpayWebhook' }
  ];
}

function buildOperation(entry) {
  const openApiPath = toOpenApiPath(entry.path);
  const tag = tagForPath(entry.path);
  const op = {
    tags: [tag],
    summary: operationSummary(entry.method, entry.path, entry.handlerName),
    operationId: `${entry.method}_${openApiPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    responses: {
      200: { description: 'OK' },
      400: { description: 'Bad request' },
      401: { description: 'Unauthorized' }
    }
  };
  const params = pathParams(openApiPath);
  if (params.length) op.parameters = params;
  if (entry.required) {
    op.security = [{ bearerAuth: [] }];
  } else if (entry.optional) {
    op.security = [{}, { bearerAuth: [] }];
  }
  if (['post', 'put', 'patch'].includes(entry.method)) {
    op.requestBody = {
      required: false,
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true }
        }
      }
    };
  }
  return { openApiPath, op };
}

function buildOpenApiSpec() {
  const config = require('../../configs/app.config');
  const port = config.get('port') || 8080;
  const serverUrl = process.env.API_BASE_URL || `http://localhost:${port}`;

  const mainRouter = require('../routes');
  const collected = [];
  collectFromRouter(mainRouter, '', collected);

  const extras = [
    { prefix: '/api/webhooks', router: require('../routes/webhook.routes') },
    { prefix: '/api/bona/callback', router: require('../routes/bonaCallback.routes') },
    { prefix: '/api/568win', router: require('../routes/win568Callback.routes') },
    { prefix: '', router: require('../routes/gitslotparkCallback.routes') }
  ];
  for (const extra of extras) {
    collectFromRouter(extra.router, extra.prefix, collected);
  }
  collected.push(...extraManualRoutes());

  const paths = {};
  for (const entry of collected) {
    const { openApiPath, op } = buildOperation(entry);
    if (!paths[openApiPath]) paths[openApiPath] = {};
    if (paths[openApiPath][entry.method]) continue;
    paths[openApiPath][entry.method] = op;
  }

  const usedTags = new Set();
  for (const pathItem of Object.values(paths)) {
    for (const op of Object.values(pathItem)) {
      if (op && op.tags) op.tags.forEach((t) => usedTags.add(t));
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Partner Platform API',
      description:
        'Generated from the live Express routers so every mounted endpoint appears under its section. Use **Authorize** to set a Bearer token for protected routes.',
      version: '1.0.0'
    },
    servers: [{ url: serverUrl, description: 'Backend server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT from login / register (player) or admin login'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    },
    security: [],
    tags: TAG_META.filter((t) => usedTags.has(t.name)),
    paths
  };
}

module.exports = {
  buildOpenApiSpec,
  collectFromRouter
};
