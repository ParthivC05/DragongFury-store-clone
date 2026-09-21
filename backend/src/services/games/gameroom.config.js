'use strict';

/**
 * Official Gameroom Agent API — Store Login + player APIs.
 * Docs: Gameroom_API_documentation.docx
 * Base: https://agentserver.gameroom777.com
 */
module.exports = {
  DEFAULT_BASE_URL: 'https://agentserver.gameroom777.com',
  DEFAULT_GAME_LINK: 'https://gameroom777.com',

  PATHS: {
    LOGIN: '/api/agent/login',
    PLAYER_LIST: '/api/player/playerList',
    INSERT_PLAYER: '/api/player/insertPlayer',
    GET_SCORE: '/api/player/getScore',
    RECHARGE: '/api/player/playerRecharge',
    WITHDRAW: '/api/player/playerWithdraw'
  },

  SUCCESS_STATUS_CODES: new Set([200, '200']),

  ACCOUNT_MIN_LENGTH: 5,
  ACCOUNT_MAX_LENGTH: 20,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 12,

  PLAYER_LIST_PAGE_SIZE: 50,
  PLAYER_LIST_MAX_PAGES: 40
};
