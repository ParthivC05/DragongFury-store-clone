const convict = require('convict');
const path = require('path');
const fs = require('fs');

const backendRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(backendRoot, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
}

const config = convict({
  app: {
    name: {
      format: String,
      default: 'Partner Platform Backend',
      env: 'APP_NAME'
    },
    origin: {
      format: String,
      default: 'http://localhost:5173, http://localhost:5174',
      env: 'ALLOWED_ORIGIN'
    }
  },
  env: {
    format: ['production', 'development', 'staging'],
    default: 'development',
    env: 'NODE_ENV'
  },
  port: {
    format: 'port',
    default: 8080,
    env: 'PORT'
  },
  sequelize: {
    name: { default: 'postgres', env: 'DB_NAME' },
    user: { default: 'postgres', env: 'DB_USER' },
    password: { default: '', env: 'DB_PASSWORD' },
    readHost: { default: 'localhost', env: 'DB_READ_HOST' },
    writeHost: { default: 'localhost', env: 'DB_WRITE_HOST' },
    port: { default: 5432, env: 'DB_PORT' }
  },
  jwt: {
    tokenSecret: { default: '', env: 'JWT_LOGIN_SECRET' },
    tokenExpiry: { default: '24h', env: 'JWT_LOGIN_TOKEN_EXPIRY' },
    refreshTokenSecret: { default: '', env: 'JWT_REFRESH_TOKEN_SECRET' },
    refreshTokenExpiry: { default: '30d', env: 'JWT_REFRESH_TOKEN_EXPIRY' },
    emailTokenKey: { default: '', env: 'EMAIL_TOKEN_KEY' },
    emailTokenExpiry: { default: '5d', env: 'EMAIL_TOKEN_EXPIRY' }
  },
  email: {
    // FRONTEND_URL must be a single base URL (e.g. https://new.dragonfury.com). If set as comma-separated, we pick one (https preferred in production).
    frontendUrl: { default: 'http://localhost:5173', env: 'FRONTEND_URL' },
    // Admin panel base URL for reset-password links in emails. Falls back to frontendUrl if not set.
    adminPanelUrl: { default: 'http://localhost:5174', env: 'ADMIN_PANEL_URL' },
    // Mailgun (primary): API key, sending domain, optional EU host (e.g. api.eu.mailgun.net).
    mailgunApiKey: { default: '', env: 'MAILGUN_API_KEY' },
    mailgunDomain: { default: '', env: 'MAILGUN_DOMAIN' },
    mailgunHost: { default: 'api.mailgun.net', env: 'MAILGUN_HOST' },
    senderEmail: { default: 'noreply@partnerplatform.com', env: 'EMAIL_SENDER_EMAIL' },
    senderName: { default: 'Partner Platform', env: 'EMAIL_SENDER_NAME' },
    siteDisplayName: { default: '', env: 'EMAIL_SITE_DISPLAY_NAME' },
    logoUrl: { default: '', env: 'EMAIL_LOGO_URL' },
    from: { default: 'noreply@partnerplatform.com', env: 'EMAIL_FROM' },
    /** Local dev: log admin login OTP to server console instead of sending email. */
    adminOtpLogOnly: { format: Boolean, default: false, env: 'ADMIN_OTP_LOG_ONLY' },
    gameBalanceAlertEmail: { default: '', env: 'GAME_BALANCE_ALERT_EMAIL' },
    /**
     * DragonFury marketing / no-deposit campaigns only.
     * Isolated from transactional MAILGUN_* so OTP/reset are unaffected.
     */
    dragonfury: {
      mailgunApiKey: { default: '', env: 'DRAGONFURY_MAILGUN_API_KEY' },
      mailgunDomain: { default: 'dragonfury.com', env: 'DRAGONFURY_MAILGUN_DOMAIN' },
      mailgunHost: { default: '', env: 'DRAGONFURY_MAILGUN_HOST' },
      /** HTTP webhook signing key (API Security) — NOT the private API key. */
      mailgunWebhookSigningKey: {
        default: '',
        env: 'DRAGONFURY_MAILGUN_WEBHOOK_SIGNING_KEY'
      },
      mailFrom: { default: 'no-reply@dragonfury.com', env: 'DRAGONFURY_MAIL_FROM' },
      mailFromName: { default: 'DragonFury', env: 'DRAGONFURY_MAIL_FROM_NAME' },
      frontendUrl: { default: '', env: 'DRAGONFURY_FRONTEND_URL' },
      batchSize: { default: 10, env: 'DRAGONFURY_MAIL_BATCH_SIZE', format: 'int' },
      maxPerHour: { default: 40, env: 'DRAGONFURY_MAIL_MAX_PER_HOUR', format: 'int' },
      delayMs: { default: 1000, env: 'DRAGONFURY_MAIL_DELAY_MS', format: 'int' }
    }
  },
  google: {
    clientId: { default: '', env: 'GOOGLE_CLIENT_ID' },
    clientSecret: { default: '', env: 'GOOGLE_CLIENT_SECRET' }
  },
  facebook: {
    appId: { default: '', env: 'FACEBOOK_APP_ID' },
    appSecret: { default: '', env: 'FACEBOOK_APP_SECRET' }
  },
  gameProvider: {
    baseUrl: { format: String, default: '', env: 'GAME_PROVIDER_BASE_URL' },
    streamlitToken: { format: String, default: '', env: 'GAME_PROVIDER_STREAMLIT_TOKEN' }
  },
  bona: {
    baseUrl: { format: String, default: 'https://sg.bona.games', env: 'BONA_API_BASE_URL' },
    appId: { format: String, default: '', env: 'BONA_APP_ID' },
    appSecret: { format: String, default: '', env: 'BONA_APP_SECRET' },
    currency: { format: String, default: 'SC', env: 'BONA_CURRENCY' },
    homeUrl: { format: String, default: '', env: 'BONA_HOME_URL' },
    lang: { format: String, default: 'en', env: 'BONA_LANG' }
  },
  onegamehub: {
    /** 1GameHub PGS URL (already includes path). */
    baseUrl: { format: String, default: '', env: 'GAMEHUB1_BASE_URL' },
    secretToken: { format: String, default: '', env: 'GAMEHUB1_SECRET_TOKEN' },
    hmacSalt: { format: String, default: '', env: 'GAMEHUB1_HMAC_SALT' }
  },
  gitslotpark: {
    /** Pragmatic Play via GitSlotPark (default provider). */
    baseUrl: {
      format: String,
      default: 'https://ptapi.loginxgamesapi.com',
      env: 'GIT_SLOTPARK_API_BASE_URL'
    },
    authToken: { format: String, default: '', env: 'GIT_SLOTPARK_AUTH_TOKEN' },
    agentId: { format: String, default: '', env: 'GIT_SLOTPARK_AGENT_ID' },
    lobbyUrl: { format: String, default: '', env: 'GIT_SLOTPARK_LOBBY_URL' },
    secretKey: { format: String, default: '', env: 'GIT_SLOTPARK_SECRET_KEY' },
    /** PG Soft via GitSlotPark — same API paths, separate credentials. */
    pgsoft: {
      baseUrl: { format: String, default: '', env: 'GIT_SLOTPARK_PGSOFT_API_BASE_URL' },
      authToken: { format: String, default: '', env: 'GIT_SLOTPARK_PGSOFT_AUTH_TOKEN' },
      agentId: { format: String, default: '', env: 'GIT_SLOTPARK_PGSOFT_AGENT_ID' },
      lobbyUrl: { format: String, default: '', env: 'GIT_SLOTPARK_PGSOFT_LOBBY_URL' },
      secretKey: { format: String, default: '', env: 'GIT_SLOTPARK_PGSOFT_SECRET_KEY' }
    },
    /** Amatic via GitSlotPark — same API paths, separate credentials. */
    amatic: {
      baseUrl: { format: String, default: '', env: 'GIT_SLOTPARK_AMATIC_API_BASE_URL' },
      authToken: { format: String, default: '', env: 'GIT_SLOTPARK_AMATIC_AUTH_TOKEN' },
      agentId: { format: String, default: '', env: 'GIT_SLOTPARK_AMATIC_AGENT_ID' },
      lobbyUrl: { format: String, default: '', env: 'GIT_SLOTPARK_AMATIC_LOBBY_URL' },
      secretKey: { format: String, default: '', env: 'GIT_SLOTPARK_AMATIC_SECRET_KEY' }
    },
    /** Amusnet via GitSlotPark — same API paths, separate credentials. */
    amusnet: {
      baseUrl: { format: String, default: '', env: 'GIT_SLOTPARK_AMUSNET_API_BASE_URL' },
      authToken: { format: String, default: '', env: 'GIT_SLOTPARK_AMUSNET_AUTH_TOKEN' },
      agentId: { format: String, default: '', env: 'GIT_SLOTPARK_AMUSNET_AGENT_ID' },
      lobbyUrl: { format: String, default: '', env: 'GIT_SLOTPARK_AMUSNET_LOBBY_URL' },
      secretKey: { format: String, default: '', env: 'GIT_SLOTPARK_AMUSNET_SECRET_KEY' }
    }
  },
  cron: {
    secret: { format: String, default: '', env: 'CRON_SECRET' }
  },
  /** When set, admin auth narrows by this store when the client does not send storeCode (one store per admin deployment). */
  admin: {
    defaultStoreCode: {
      format: String,
      default: '',
      env: 'ADMIN_DEFAULT_STORE_CODE'
    },
    /** Comma-separated hosts for master/distributor panel (e.g. admin.dragonfury.com). */
    platformHosts: {
      format: String,
      default: '',
      env: 'ADMIN_PLATFORM_HOSTS'
    },
    /**
     * Map every store admin host → that store's storeCode (including DragonFury).
     * e.g. admin.dragonfury.com:dragonfury,admin.luckywinnerspower.com:goodwork
     */
    hostStoreMap: {
      format: String,
      default: '',
      env: 'ADMIN_HOST_STORE_MAP'
    }
  },
  public: {
    /**
     * Optional extra public site host → storeCode map.
     * Built-in defaults already cover known store domains.
     * e.g. goodgdragon.com:goodgdragon,www.goodgdragon.com:goodgdragon
     */
    hostStoreMap: {
      format: String,
      default: '',
      env: 'PUBLIC_HOST_STORE_MAP'
    }
  },
  http: {
    /** Axios timeout for third-party APIs (game bots, payment providers, etc.). */
    thirdPartyTimeoutMs: {
      format: 'nat',
      default: 120000,
      env: 'THIRD_PARTY_HTTP_TIMEOUT_MS'
    }
  },
  s3: {
    bucket: { format: String, default: '', env: 'AWS_S3_BUCKET' },
    region: { format: String, default: 'us-east-1', env: 'AWS_S3_REGION' },
    accessKeyId: { format: String, default: '', env: 'AWS_S3_ACCESS_KEY_ID' },
    secretAccessKey: { format: String, default: '', env: 'AWS_S3_SECRET_ACCESS_KEY' },
    /** Optional public base URL (e.g. CloudFront/CDN). Falls back to the standard S3 URL. */
    publicBaseUrl: { format: String, default: '', env: 'AWS_S3_PUBLIC_BASE_URL' }
  },
  geo: {
    url: {
      format: String,
      default: 'https://api.ipgeolocation.io/v3/ipgeo',
      env: 'IPGEO_URL'
    },
    apiKey: {
      format: String,
      default: '',
      env: 'IPGEO_API_KEY'
    }
  },
  didit: {
    apiBaseUrl: {
      format: String,
      default: 'https://verification.didit.me',
      env: 'DIDIT_API_BASE_URL'
    },
    apiKey: {
      format: String,
      default: '',
      env: 'DIDIT_API_KEY'
    },
    workflowId: {
      format: String,
      default: '',
      env: 'DIDIT_WORKFLOW_ID'
    },
    webhookSecret: {
      format: String,
      default: '',
      env: 'DIDIT_WEBHOOK_SECRET'
    },
    /**
     * Comma-separated store codes provisioned for Didit identity KYC.
     * Empty (default) = all stores. Example: dragonfury,casinoslots
     */
    storeCodes: {
      format: String,
      default: '',
      env: 'KYC_STORE_CODES'
    },
    /**
     * Comma-separated store codes provisioned for Didit phone OTP.
     * Empty = all stores can be toggled from admin. Non-empty = only listed stores.
     * Per-store on/off is controlled in admin (settings key phone_verification).
     */
    phoneStoreCodes: {
      format: String,
      default: '',
      env: 'PHONE_VERIFY_STORE_CODES'
    }
  },
  fingerprint: {
    secretKey: { format: String, default: '', env: 'FINGERPRINT_SECRET_API_KEY' },
    region: { format: String, default: 'us', env: 'FINGERPRINT_REGION' },
    /**
     * Comma-separated store codes that enforce one account per device at signup.
     * Partner Platform staging is DragonFury only. Grandweeps is enforced in the Grandweeps repo.
     */
    enforcedStoreCodes: {
      format: String,
      default: '',
      env: 'FINGERPRINT_ENFORCED_STORE_CODES'
    }
  },
  win568: {
    /** Shared secret 568Win sends as companyKey. Must match the test-page / BO value. */
    companyKey: { format: String, default: '', env: 'WIN568_COMPANY_KEY' },
    /** Optional store scope when looking up the test player username. */
    storeCode: { format: String, default: '', env: 'WIN568_STORE_CODE' },
    /**
     * camel = include camelCase aliases.
     * pascal = PascalCase only (official Seamless Wallet 2.0 / SBOBET).
     * Responses always include PascalCase keys so GetPlayerInfo/GetBalance work.
     */
    responseCase: { format: String, default: 'pascal', env: 'WIN568_RESPONSE_CASE' },
    /** Operator API host, e.g. https://ex-api-demo-yy.568win.com */
    apiBaseUrl: { format: String, default: '', env: 'WIN568_API_BASE_URL' },
    serverId: { format: String, default: 'dragonfury', env: 'WIN568_SERVER_ID' },
    /** Agent username created via API 2.1 — players are registered under this agent. */
    agentUsername: { format: String, default: '', env: 'WIN568_AGENT_USERNAME' },
    /** Must match BO Seamless Wallet EnableCurrency (568Win: USD). */
    currency: { format: String, default: 'USD', env: 'WIN568_CURRENCY' },
    lang: { format: String, default: 'en', env: 'WIN568_LANG' },
    /**
     * SeamlessGameProvider host from login, e.g. https://gp-xxx.568win.com
     * Used when login.aspx does not return a url.
     */
    gameProviderUrl: { format: String, default: '', env: 'WIN568_GAME_PROVIDER_URL' }
  },
  scorpio: {
    /** Bearer token from Scorpio Play back office. Also used as HMAC-SHA512 key for callbacks. */
    apiToken: { format: String, default: '', env: 'SCORPIO_API_TOKEN' },
    /** Operator API host, e.g. https://api.scorpioplay.com */
    apiBaseUrl: { format: String, default: '', env: 'SCORPIO_API_BASE_URL' },
    currency: { format: String, default: 'USD', env: 'SCORPIO_CURRENCY' },
    lang: { format: String, default: 'en', env: 'SCORPIO_LANG' },
    /** 0 = operator global RTP in Scorpio account settings. */
    rtp: { format: 'int', default: 0, env: 'SCORPIO_RTP' }
  }
});

config.validate({ allowed: 'strict' });

// Normalize FRONTEND_URL: use a single URL. If comma-separated, pick one (prefer https in production).
function normalizeFrontendUrl(raw) {
  if (!raw || typeof raw !== 'string') return;
  const urls = raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (urls.length <= 1) return;
  const isProduction = config.get('env') === 'production';
  const https = urls.find((u) => u.startsWith('https://'));
  const chosen = isProduction && https ? https : urls[0];
  config.set('email.frontendUrl', chosen);
}

normalizeFrontendUrl(config.get('email.frontendUrl'));

module.exports = config;
