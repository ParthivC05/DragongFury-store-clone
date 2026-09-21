import { API_BASE } from '../config/api';
import { getAccessToken } from './storageUtils';

/** Socket.IO server URL — same host as API (Vite proxies /socket.io in dev). */
function resolveSocketUrl() {
  if (API_BASE) return API_BASE;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

let socket = null;
let activeToken = null;
let ioPromise = null;

/** event -> Set<handler> — survives disconnect/reconnect. */
const eventHandlers = new Map();

function loadIo() {
  if (!ioPromise) {
    ioPromise = import('socket.io-client').then((m) => m.io);
  }
  return ioPromise;
}

function dispatch(event, payload) {
  const set = eventHandlers.get(event);
  if (!set || !set.size) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (_) {
      /* ignore handler errors */
    }
  }
}

function bindDispatch(s) {
  if (!s || s.__supportDispatchBound) return;
  s.__supportDispatchBound = true;
  s.onAny((event, payload) => {
    dispatch(event, payload);
  });
}

/**
 * Connect (or reconnect) the authenticated realtime socket.
 * Socket.IO is loaded on demand so guests do not pay the parse cost.
 * @returns {Promise<import('socket.io-client').Socket | null>}
 */
export async function connectRealtimeSocket() {
  const token = getAccessToken();
  if (!token) {
    disconnectRealtimeSocket();
    return null;
  }

  if (socket?.connected && activeToken === token) {
    bindDispatch(socket);
    return socket;
  }

  if (socket) {
    socket.auth = { token };
    activeToken = token;
    if (!socket.connected) socket.connect();
    bindDispatch(socket);
    return socket;
  }

  const io = await loadIo();
  const latestToken = getAccessToken();
  if (!latestToken) {
    disconnectRealtimeSocket();
    return null;
  }
  if (socket) {
    socket.auth = { token: latestToken };
    activeToken = latestToken;
    if (!socket.connected) socket.connect();
    bindDispatch(socket);
    return socket;
  }

  activeToken = latestToken;
  socket = io(resolveSocketUrl(), {
    path: '/socket.io',
    auth: { token: latestToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    autoConnect: true
  });
  bindDispatch(socket);

  return socket;
}

export function disconnectRealtimeSocket() {
  activeToken = null;
  if (!socket) return;
  socket.disconnect();
  socket = null;
}

export function getRealtimeSocket() {
  return socket;
}

/**
 * Subscribe to an event; returns unsubscribe fn.
 * Handlers stay in a registry so AuthContext reconnect does not drop them.
 */
export function onRealtimeEvent(event, handler) {
  if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
  eventHandlers.get(event).add(handler);
  connectRealtimeSocket().catch(() => {});

  return () => {
    const set = eventHandlers.get(event);
    if (!set) return;
    set.delete(handler);
    if (!set.size) eventHandlers.delete(event);
  };
}
