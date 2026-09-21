'use strict';

/** Provider-broken titles hidden on the user lobby (exact compact name / game-id tail). */
const HIDDEN_BROKEN_GAME_KEYS = new Set([
  'europeanroulette',
  'caribbeanstudpoker',
  'baccarat',
  'videopoker',
  'blackjacksidebets',
  'blackjack',
  'yellowdiver',
  '10hvideopoker',
  'prettydiamondsscratch',
  'mummifiedmysteriesscratch',
  'bowwowscratch',
  'wildjokerscratch',
  'darkpotionsscratch',
  'camcarterandthewheelofwonderscratch',
  'vulcanoroulette',
  'plinko',
  'onehandblackjack',
  'blackjackgold',
  'electricpowerplay'
]);

function compactHiddenGameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function isHiddenBrokenProviderGame(gameOrId) {
  const values =
    typeof gameOrId === 'string' || typeof gameOrId === 'number'
      ? [gameOrId]
      : [
          gameOrId?.title,
          gameOrId?.name,
          gameOrId?.alias,
          gameOrId?.gameName,
          gameOrId?.id,
          gameOrId?.gameid,
          gameOrId?.gameId,
          gameOrId?.game_id
        ];

  for (const value of values) {
    if (value == null || String(value).trim() === '') continue;
    const raw = String(value).trim();
    const compact = compactHiddenGameKey(raw);
    const tail = compactHiddenGameKey(raw.split(/[-_/]/).pop());
    if (HIDDEN_BROKEN_GAME_KEYS.has(compact) || HIDDEN_BROKEN_GAME_KEYS.has(tail)) return true;
  }
  return false;
}

module.exports = {
  HIDDEN_BROKEN_GAME_KEYS,
  isHiddenBrokenProviderGame
};
