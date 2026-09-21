'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../configs/app.config');
const { logger } = require('../../libs/logger');

/** @type {import('socket.io').Server | null} */
let io = null;

function getAllowedOrigins() {
  return (config.get('app.origin') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Attach Socket.IO to the HTTP server. Clients join `user:{userId}` after JWT auth.
 * @param {import('http').Server} server
 */
function initSocket(server) {
  if (io) return io;

  const { Server } = require('socket.io');
  const origins = getAllowedOrigins();

  io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: origins.length ? origins : true,
      credentials: true
    },
    // Keep connections light across many store frontends
    pingInterval: 25000,
    pingTimeout: 20000
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : null);
      if (!token) {
        return next(new Error('Unauthorized'));
      }
      const secret = config.get('jwt.tokenSecret');
      if (!secret) {
        return next(new Error('Server configuration error'));
      }
      const decoded = jwt.verify(token, secret);
      const userId = decoded.userId != null ? Number(decoded.userId) : null;
      if (!Number.isInteger(userId) || userId <= 0) {
        return next(new Error('Unauthorized'));
      }
      socket.userId = userId;
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const room = `user:${socket.userId}`;
    socket.join(room);
    socket.emit('realtime:ready', { userId: socket.userId });
  });

  logger.info('Socket.IO realtime ready');
  return io;
}

/**
 * Emit an event to all sockets for a user.
 * @param {number|string} userId
 * @param {string} event
 * @param {object} payload
 */
function emitToUser(userId, event, payload) {
  if (!io || userId == null) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit an event to many users (deduped).
 * @param {Array<number|string>} userIds
 * @param {string} event
 * @param {object} payload
 */
function emitToUsers(userIds, event, payload) {
  if (!io || !Array.isArray(userIds) || userIds.length === 0) return;
  const seen = new Set();
  for (const id of userIds) {
    if (id == null) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    emitToUser(id, event, payload);
  }
}

function getIO() {
  return io;
}

module.exports = {
  initSocket,
  emitToUser,
  emitToUsers,
  getIO
};
