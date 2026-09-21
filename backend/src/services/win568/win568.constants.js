'use strict';

/** Seamless Wallet 2.0 error list. */
const ERROR = {
  NO_ERROR: { errorCode: 0, errorMessage: 'No Error' },
  MEMBER_NOT_EXIST: { errorCode: 1, errorMessage: 'Member not exist' },
  INVALID_IP: { errorCode: 2, errorMessage: 'Invalid Ip' },
  USERNAME_EMPTY: { errorCode: 3, errorMessage: 'userName empty' },
  COMPANY_KEY: { errorCode: 4, errorMessage: 'CompanyKey Error' },
  NOT_ENOUGH_BALANCE: { errorCode: 5, errorMessage: 'Not enough balance' },
  BET_NOT_EXISTS: { errorCode: 6, errorMessage: 'Bet not exists' },
  INTERNAL: { errorCode: 7, errorMessage: 'Internal Error' },
  ALREADY_SETTLED: { errorCode: 2001, errorMessage: 'Bet Already Settled' },
  ALREADY_CANCELED: { errorCode: 2002, errorMessage: 'Bet Already Canceled' },
  ALREADY_ROLLBACK: { errorCode: 2003, errorMessage: 'Bet Already Rollback' },
  SAME_REF: { errorCode: 5003, errorMessage: 'Bet With Same RefNo Exists' },
  ALREADY_RETURNED_STAKE: { errorCode: 5008, errorMessage: 'Bet Already Returned Stake' }
};

const STATUS = {
  RUNNING: 'running',
  SETTLED: 'settled',
  VOID: 'void'
};

const PRODUCT = {
  SPORTS: 1,
  SBO_GAMES: 3,
  VIRTUAL_SPORTS: 5,
  LIVE_CASINO: 7,
  SEAMLESS_GAMES: 9,
  LIVE_COIN: 10,
  WIN568_SPORTS: 11
};

/** TransferType: credit into player wallet. Docs use 140; some samples use 130. */
const TRANSFER_IN = new Set([140, 130]);
/** TransferType: debit from player wallet. Docs use 141; some samples use 131. */
const TRANSFER_OUT = new Set([141, 131]);

const TRANSFER_STATUS = {
  NOT_EXISTS: 0,
  PROCESSING: 1,
  TRANSFERRED: 2,
  ROLLBACK: 3
};

module.exports = {
  ERROR,
  STATUS,
  PRODUCT,
  TRANSFER_IN,
  TRANSFER_OUT,
  TRANSFER_STATUS
};
