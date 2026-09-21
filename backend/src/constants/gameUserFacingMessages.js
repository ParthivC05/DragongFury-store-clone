'use strict';

/**
 * User-facing copy when a game request is queued / handled off automation.
 * Never mention manual mode, contacting the store, or internal processing details.
 */
module.exports = {
  GAME_REQUEST_IN_PROGRESS:
    "We're working on your request. Hang tight — it'll be ready shortly.",
  GAME_DEPOSIT_PENDING:
    "We're working on it. Your deposit amount will reflect soon.",
  GAME_REDEEM_PENDING:
    "We're working on it. Your redeem will be in your wallet shortly.",
  GAME_WITHDRAW_PENDING:
    "We're working on it. Your withdrawal will be in your wallet shortly.",
  GAME_REGISTER_PENDING:
    "We're on it. You'll see your game login here once it's ready.",
  GAME_PASSWORD_PENDING:
    "We're working on your password reset. Please check back shortly.",
  GAME_LINK_PENDING:
    "We're working on connecting your account. Please try again in a moment."
};
