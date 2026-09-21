'use strict';

const config = require('../configs/app.config');

/** Axios timeout (ms) for third-party / game-provider / bot HTTP calls. Override via THIRD_PARTY_HTTP_TIMEOUT_MS. */
const THIRD_PARTY_HTTP_TIMEOUT_MS = config.get('http.thirdPartyTimeoutMs');

module.exports = {
  THIRD_PARTY_HTTP_TIMEOUT_MS
};
