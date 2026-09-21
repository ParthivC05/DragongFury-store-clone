'use strict';

/** Orion Stars Terminal API v1.2 — agent integration constants. */
module.exports = {
  DEFAULT_SERVICE_PATH: '/ws/service.ashx',

  /** Optional legacy streamlit bot URL for /create-user when terminal registerUser sign fails. */
  LEGACY_BOT_ENV_KEY: 'ORION_STARS_LEGACY_BOT_BASE_URL',

  ACTIONS: {
    AGENT_LOGIN: 'agentLogin',
    REGISTER_USER: 'registerUser',
    QUERY_INFO: 'queryInfo',
    CHANGE_PASSWORD: 'changePasswd',
    RECHARGE: 'recharge',
    REDEEM: 'redeem',
    GET_DOWNLOAD_CODE: 'getDownloadCode',
    GET_TRADE_RECORD: 'getTradeRecord',
    GET_JP_RECORD: 'getJpRecord',
    GET_GAME_RECORD: 'getGameRecord'
  },

  SUCCESS_CODES: new Set([200, '200']),

  FIELDS: {
    CODE: ['code', 'Code'],
    MSG: ['msg', 'Msg', 'message', 'Message'],
    AGENT_KEY: ['agentKey', 'AgentKey', 'agentkey', 'AGENTKEY'],
    BALANCE: ['balance', 'Balance']
  },

  ACCOUNT_MIN_LENGTH: 6,
  ACCOUNT_MAX_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 6,

  /**
   * Prefer seconds (matches provider examples), then ms (docs: System.currentTimeMillis()).
   * Each successful call should use a fresh time value.
   */
  TIME_UNITS: ['sec', 'ms'],

  /**
   * Official docs:
   * sign = MD5(agentName.toLowerCase() + time.toString() + agentKey.toLowerCase())
   * All request params are sent as query string on POST.
   */
  SIGN_VARIANTS: ['doc', 'key-as-is', 'all-lower']
};
