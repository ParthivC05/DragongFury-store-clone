import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getMe, TOKEN_KEY } from '../api/auth'
import { isAdminTokenUnusable } from '../api/client'
import { connectRealtimeSocket, disconnectRealtimeSocket } from '../services/realtimeSocket'

const AuthContext = createContext(null)
const AUTH_CHANNEL = 'admin_auth_sync'

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch (_) {
    /* ignore */
  }
}

/** Drop dead tokens so login is not bounced back to the dashboard. */
function shouldClearToken(err) {
  if (!err) return false
  if (err.status === 401) return true
  if (err.status !== 403) return false
  const code = String(err.code || err.body?.code || '').toLowerCase()
  const msg = String(err.message || err.body?.message || '').toLowerCase()
  const authHints = ['token', 'jwt', 'expired', 'invalid signature', 'session', 'login', 'unauthorized']
  const hasAuthCode = code.includes('auth') || code.includes('token') || code.includes('unauth')
  const hasAuthMessage = authHints.some((hint) => msg.includes(hint))
  return hasAuthCode || hasAuthMessage
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null)
  const [loading, setLoading] = useState(true)

  const setUser = useCallback((data) => {
    setUserState(data)
    // Only broadcast on full login (object), not on functional updates (merge)
    const isObject = data && typeof data === 'object' && !Array.isArray(data) && typeof data.then !== 'function'
    if (isObject && typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel(AUTH_CHANNEL)
        ch.postMessage({ type: 'login' })
        ch.close()
      } catch (_) {
        /* BroadcastChannel may be unavailable */
      }
    }
  }, [])

  function refreshUser() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token || isAdminTokenUnusable(token)) {
      if (token) clearStoredToken()
      setUserState(null)
      setLoading(false)
      return
    }
    setLoading(true)
    getMe()
      .then((data) => setUserState(data))
      .catch((err) => {
        if (shouldClearToken(err)) clearStoredToken()
        setUserState(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refreshUser()
  }, [])

  useEffect(() => {
    if (!user) {
      disconnectRealtimeSocket()
      return undefined
    }
    connectRealtimeSocket().catch(() => {})
    return () => {
      disconnectRealtimeSocket()
    }
  }, [user?.userId])

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== TOKEN_KEY) return
      if (e.newValue) {
        if (isAdminTokenUnusable(e.newValue)) {
          clearStoredToken()
          setUserState(null)
          setLoading(false)
          return
        }
        setLoading(true)
        getMe()
          .then((data) => setUserState(data))
          .catch((err) => {
            if (shouldClearToken(err)) clearStoredToken()
            setUserState(null)
          })
          .finally(() => setLoading(false))
      } else {
        setUserState(null)
        setLoading(false)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(AUTH_CHANNEL)
    ch.onmessage = () => {
      const token = localStorage.getItem(TOKEN_KEY)
      if (token && !isAdminTokenUnusable(token)) {
        setLoading(true)
        getMe()
          .then((data) => setUserState(data))
          .catch((err) => {
            if (shouldClearToken(err)) clearStoredToken()
            setUserState(null)
          })
          .finally(() => setLoading(false))
      } else if (token) {
        clearStoredToken()
        setUserState(null)
        setLoading(false)
      }
    }
    return () => ch.close()
  }, [])

  const userRef = useRef(user)
  userRef.current = user
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      const token = localStorage.getItem(TOKEN_KEY)
      if (token && isAdminTokenUnusable(token)) {
        clearStoredToken()
        setUserState(null)
        setLoading(false)
        return
      }
      if (token && !userRef.current) {
        setLoading(true)
        getMe()
          .then((data) => setUserState(data))
          .catch((err) => {
            if (shouldClearToken(err)) clearStoredToken()
            setUserState(null)
          })
          .finally(() => setLoading(false))
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const value = useMemo(() => ({ user, setUser, loading }), [user, setUser, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
