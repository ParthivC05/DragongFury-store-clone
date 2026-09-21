#!/usr/bin/env node
/**
 * Mock game bot server that always returns 502.
 * Use to test "bot API failure → switch game to manual mode" flow.
 *
 * 1. Run: node scripts/mock-bot-fail-server.js
 * 2. In DB: UPDATE games SET bot_api_url = 'http://localhost:9876', bot_offline = false WHERE id = <GAME_ID>;
 * 3. Call deposit/topup, register, withdraw, or balance for that game → game switches to manual, no error to user.
 */
const http = require('http');

const PORT = Number(process.env.MOCK_BOT_PORT) || 9876;

const server = http.createServer((req, res) => {
  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: 'Bad Gateway' }));
});

server.listen(PORT, () => {
  console.log(`Mock bot (always failing) listening on http://localhost:${PORT}`);
  console.log(`Set a game's bot_api_url to this URL and bot_offline = false to test manual-mode switch.`);
});
