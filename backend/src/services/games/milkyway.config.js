'use strict';

/**
 * Milkyway Agent API (MW Terminal API v1.2.3) — constants.
 * Docs: https://milkywayapp.xyz:8033/ws/service.ashx
 *
 * Sign: md5((agentName + time + agentKey).toLowerCase())
 * Time: docs mention System.currentTimeMillis(); examples use unix seconds.
 */
module.exports = {
  DEFAULT_SERVICE_PATH: '/ws/service.ashx',

  /** Default base host from Milkyway Agent API docs (template seed / fallback). */
  DEFAULT_BASE_URL: 'https://milkywayapp.xyz:8033',

  /** Milkyway Game API (getgamelist / entergame). */
  DEFAULT_GAME_API_BASE_URL: 'https://milkywayapp.xyz:8034',

  /**
   * Prefer seconds (matches provider examples / working login), then ms (docs text).
   */
  TIME_UNITS: ['sec', 'ms'],

  ACTIONS: {
    AGENT_LOGIN: 'agentLogin',
    REGISTER_USER: 'registerUser',
    QUERY_INFO: 'queryInfo',
    CHANGE_PASSWORD: 'changePasswd',
    RECHARGE: 'recharge',
    REDEEM: 'redeem',
    GET_TRADE_RECORD: 'getTradeRecord',
    GET_JP_RECORD: 'getJpRecord',
    GET_GAME_RECORD: 'getGameRecord',
    GET_GAME_LIST: 'getgamelist',
    ENTER_GAME: 'entergame'
  },

  SUCCESS_CODES: new Set([200, '200']),

  FIELDS: {
    CODE: ['code', 'Code'],
    MSG: ['msg', 'Msg', 'message', 'Message'],
    AGENT_KEY: ['agentKey', 'AgentKey', 'agentkey', 'AGENTKEY'],
    BALANCE: ['balance', 'Balance'],
    USER_BALANCE: ['userbalance', 'userBalance', 'UserBalance'],
    WEB_LOGIN_URL: ['webLoginUrl', 'WebLoginUrl', 'webloginurl', 'loginUrl', 'LoginUrl', 'url', 'Url'],
    DATA: ['data', 'Data', 'games', 'list', 'result']
  },

  ACCOUNT_MIN_LENGTH: 6,
  ACCOUNT_MAX_LENGTH: 63,
  PASSWORD_MIN_LENGTH: 6,

  /**
   * Official docs:
   * sign = MD5(agentName.toLowerCase() + time.toString() + agentKey.toLowerCase())
   * Also try common provider quirks.
   */
  SIGN_VARIANTS: ['doc', 'key-as-is', 'all-lower']
};
