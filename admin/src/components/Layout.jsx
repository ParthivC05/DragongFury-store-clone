import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logout } from '../api/auth'
import { useStaffAttendance } from '../context/StaffAttendanceContext'
import StaffPunchModals from './StaffPunchModals'
import * as notificationsApi from '../api/notifications'
import { NAV_ROUTES } from '../constants/routeConfig'
import { ROLES } from '../constants/roles'
import { canAccessFeature, canAccessAdminFeature } from '../constants/permissions'
import { isTeamRelatedPath } from '../utils/teamAccessPaths'
import './Layout.css'

function headerPanelRoleLabel(user, fallbackRoleKey) {
  if (!user) return fallbackRoleKey || ''
  if (user.role === ROLES.MASTER_ADMIN) {
    if (user.adminRoleName) return user.adminRoleName
    return 'Full admin'
  }
  if (user.role === ROLES.DISTRIBUTOR_ADMIN) return 'Distributor admin'
  return fallbackRoleKey || user.role || ''
}

/** Must match backend `notificationCategories` values. */
const NOTIFICATION_TABS = [
  { id: 'manual_requests', label: 'Manual requests' },
  { id: 'automation_updates', label: 'Automation updates' },
  { id: 'other', label: 'Other' }
]

function formatNotificationDate(createdAt) {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 60000) return 'Just now'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
  return d.toLocaleDateString(undefined, { dateStyle: 'short' })
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)')
    const fn = () => setIsMobile(mql.matches)
    mql.addEventListener('change', fn)
    return () => mql.removeEventListener('change', fn)
  }, [])
  return isMobile
}

export default function Layout() {
  const { user, setUser } = useAuth()
  const attendance = useStaffAttendance()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadByCategory, setUnreadByCategory] = useState({
    manual_requests: 0,
    automation_updates: 0,
    other: 0
  })
  const [notifTab, setNotifTab] = useState('manual_requests')
  const notifRef = useRef(null)
  const prevUnreadCountRef = useRef(null)
  const notificationSoundRef = useRef(null)
  const notifOpenRef = useRef(false)
  const isMobile = useIsMobile()
  const role = user?.role

  const userId = user?.userId

  useEffect(() => {
    notifOpenRef.current = notifOpen
  }, [notifOpen])

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return
    try {
      const res = await notificationsApi.getUnreadCount()
      const count = res?.unread_count ?? 0
      setUnreadByCategory(
        res?.unread_by_category ?? {
          manual_requests: 0,
          automation_updates: 0,
          other: 0
        }
      )
      const prev = prevUnreadCountRef.current
      if (prev !== null && count > prev) {
        try {
          const audio = notificationSoundRef.current || new Audio('/notification.mp3')
          if (!notificationSoundRef.current) notificationSoundRef.current = audio
          audio.currentTime = 0
          audio.play().catch(() => undefined)
        } catch {
          void 0
        }
      }
      prevUnreadCountRef.current = count
      setUnreadCount(count)
    } catch {
      void 0
    }
  }, [userId])

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    try {
      const res = await notificationsApi.getNotifications({ limit: 20, category: notifTab })
      setNotifications(res?.notifications ?? [])
      await fetchUnreadCount()
    } catch {
      void 0
    }
  }, [userId, fetchUnreadCount, notifTab])

  /* Prevent body scroll when mobile sidebar is open */
  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sidebarOpen])

  useEffect(() => {
    if (userId) fetchUnreadCount()
  }, [userId, fetchUnreadCount])

  /* Register FCM token once per login; refresh unread on foreground push */
  useEffect(() => {
    if (!userId) return undefined
    let unsubscribe = () => {}
    let cancelled = false

    async function setupPush() {
      try {
        const { isFirebaseMessagingConfigured, getFcmToken, onForegroundMessage } = await import('../lib/firebaseMessaging')
        if (!isFirebaseMessagingConfigured() || cancelled) return
        const token = await getFcmToken()
        if (token && !cancelled) {
          await notificationsApi.registerDeviceToken(token, 'admin').catch(() => {})
        }
        unsubscribe = await onForegroundMessage(() => {
          fetchUnreadCount()
          if (notifOpenRef.current) fetchNotifications()
        })
      } catch {
        /* push is best-effort */
      }
    }

    setupPush()
    return () => {
      cancelled = true
      try {
        unsubscribe()
      } catch {
        void 0
      }
    }
  }, [userId, fetchUnreadCount, fetchNotifications])

  useEffect(() => {
    if (!userId) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount()
        if (notifOpen) fetchNotifications()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [userId, notifOpen, fetchUnreadCount, fetchNotifications])

  useEffect(() => {
    if (notifOpen && userId) fetchNotifications()
  }, [notifOpen, userId, fetchNotifications, notifTab])

  /* Close notification dropdown on route change (same as user frontend) */
  useEffect(() => {
    setNotifOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (n) => {
    setNotifOpen(false)
    const url = n.action_url
    if (url) {
      if (url.startsWith('/')) {
        /* Backend sends /admin/xyz for admin notifications; admin panel routes use /xyz */
        const adminPath = url.startsWith('/admin') ? url.replace(/^\/admin/, '') || '/' : url
        navigate(adminPath)
      } else {
        window.location.href = url
      }
    }
    if (!n.read_at && n.id) {
      notificationsApi.markNotificationRead(n.id).then(() => fetchUnreadCount()).catch(() => {})
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllNotificationsRead()
      prevUnreadCountRef.current = 0
      await fetchNotifications()
    } catch {
      void 0
    }
  }

  const visibleNavRoutes = useMemo(() => {
    const filtered = NAV_ROUTES.filter((route) => {
      if (!role || !route.allowedRoles.includes(role)) return false
      if (role === ROLES.MASTER_ADMIN && Array.isArray(route.anyAdminPermissionKeys) && route.anyAdminPermissionKeys.length > 0) {
        return route.anyAdminPermissionKeys.some((key) => canAccessAdminFeature(user, key))
      }
      if (role === ROLES.STORE_ADMIN && Array.isArray(route.anyPermissionKeys) && route.anyPermissionKeys.length > 0) {
        return route.anyPermissionKeys.some((key) => canAccessFeature(user, key))
      }
      if (role === ROLES.MASTER_ADMIN && route.adminPermissionKey) {
        return canAccessAdminFeature(user, route.adminPermissionKey)
      }
      if (route.adminPermission && route.permissionKey) {
        return canAccessAdminFeature(user, route.permissionKey)
      }
      if (role === ROLES.STORE_ADMIN && route.permissionKey) {
        if (!canAccessFeature(user, route.permissionKey)) return false
      }
      if (role === ROLES.STORE_ADMIN && Array.isArray(route.storeCodes) && route.storeCodes.length > 0) {
        const sc = String(user?.storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
        const allowed = route.storeCodes.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
        if (!allowed.includes(sc)) return false
      }
      if (role === ROLES.STORE_ADMIN && Array.isArray(route.excludeStoreCodes) && route.excludeStoreCodes.length > 0) {
        const sc = String(user?.storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
        const blocked = route.excludeStoreCodes.map((c) => String(c).trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
        if (blocked.includes(sc)) return false
      }
      return true
    })

    const devPaths = ['/spin-wheel', '/vip', '/affiliate', '/deposit-bonuses']
    const devRoutes = filtered.filter((r) => devPaths.includes(r.path))
    const rest = filtered.filter((r) => !devPaths.includes(r.path))

    if (role === 'store_admin' && devRoutes.length > 0) {
      const profileIdx = rest.findIndex((r) => r.path === '/profile')
      if (profileIdx !== -1) {
        return [...rest.slice(0, profileIdx), ...devRoutes, ...rest.slice(profileIdx)]
      }
    }
    if (role === ROLES.MASTER_ADMIN && devRoutes.length > 0) {
      const profileIdx = rest.findIndex((r) => r.path === '/profile')
      if (profileIdx !== -1) {
        return [...rest.slice(0, profileIdx), ...devRoutes, ...rest.slice(profileIdx)]
      }
    }
    return filtered
  }, [role, user])

  async function finishLogout() {
    try {
      const { unregisterStoredFcmToken } = await import('../lib/firebaseMessaging')
      await unregisterStoredFcmToken((token) => notificationsApi.unregisterDeviceToken(token))
    } catch {
      /* best-effort */
    }
    logout()
    setUser(null)
    navigate('/login')
  }

  async function handleLogout() {
    if (attendance?.openSession) {
      setCheckoutOpen(true)
      return
    }
    await finishLogout()
  }

  function closeSidebar() {
    setSidebarOpen(false)
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <button
          type="button"
          className="admin-menu-toggle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className="admin-menu-toggle-line" />
          <span className="admin-menu-toggle-line" />
          <span className="admin-menu-toggle-line" />
        </button>
        <h1 className="admin-header-title" title="Partner Platform Admin">
          {isMobile ? 'Admin' : 'Partner Platform Admin'}
        </h1>
        {user && (
          <div className="admin-header-notif-wrap" ref={notifRef}>
            <button
              type="button"
              className="admin-header-notif-btn"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label={notifOpen ? 'Close notifications' : 'Open notifications'}
              title="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="admin-header-notif-badge" aria-hidden>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="admin-header-notif-dropdown">
                <div className="admin-header-notif-dropdown-head">
                  <span>Notifications</span>
                  {notifications.length > 0 && (
                    <div className="admin-header-notif-actions">
                      {notifications.some((n) => !n.read_at) && (
                        <button type="button" className="admin-header-notif-mark-all" onClick={handleMarkAllRead}>
                          Mark all read
                        </button>
                      )}
                      <button type="button" className="admin-header-notif-clear-all" onClick={handleMarkAllRead}>
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
                <div className="admin-header-notif-tabs" role="tablist" aria-label="Notification categories">
                  {NOTIFICATION_TABS.map((tab) => {
                    const tabUnread = unreadByCategory[tab.id] ?? 0
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={notifTab === tab.id}
                        className={`admin-header-notif-tab ${notifTab === tab.id ? 'active' : ''}`}
                        onClick={() => setNotifTab(tab.id)}
                      >
                        <span className="admin-header-notif-tab-label">{tab.label}</span>
                        {tabUnread > 0 && (
                          <span className="admin-header-notif-tab-badge" aria-hidden>
                            {tabUnread > 99 ? '99+' : tabUnread}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="admin-header-notif-dropdown-list">
                  {notifications.length === 0 ? (
                    <p className="admin-header-notif-empty">No notifications</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`admin-header-notif-item ${!n.read_at ? 'unread' : ''} ${n.action_url ? 'admin-header-notif-item-clickable' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <span className="admin-header-notif-item-title">{n.title}</span>
                        <span className="admin-header-notif-item-message">{n.message}</span>
                        <span className="admin-header-notif-item-date">
                          {formatNotificationDate(n.created_at)}
                          {n.action_url && <span className="admin-header-notif-item-action"> → View</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="admin-header-user">
          {attendance?.openSession && (
            <span className="admin-header-shift-timer" title="Time since check-in">
              Shift {attendance.elapsedLabel}
            </span>
          )}
          <div className="admin-header-user-info">
            <span className="admin-header-user-name" title={user?.email ?? user?.username ?? ''}>
              {isMobile ? (user?.username ?? user?.email ?? 'Admin') : (user?.email ?? user?.username ?? 'Admin')}
            </span>
            {user.role === 'store_admin' ? (
              <span className="admin-header-user-role">
                {user?.storeRoleName && user?.storeName ? `${user.storeRoleName} - ${user.storeName}` :
                 user?.storeRoleName ? user.storeRoleName :
                 user?.storeName ? `${user.storeName} - ${user.role}` : user.role}
              </span>
            ) : (
              role && <span className="admin-header-user-role">{headerPanelRoleLabel(user, role)}</span>
            )}
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-logout"
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
          >
            <span className="admin-btn-logout-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span className="admin-btn-logout-text">Logout</span>
          </button>
        </div>
      </header>
      <div className="admin-body">
        <div
          className={`admin-sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
          onClick={closeSidebar}
          aria-hidden="true"
        />
        <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <nav className="admin-sidebar-nav">
            {visibleNavRoutes.map((route) => (
              <NavLink
                key={route.path}
                to={route.path}
                end={route.path === '/'}
                className={({ isActive }) => {
                  const base = 'admin-sidebar-link'
                  const related = route.path === '/team' && isTeamRelatedPath(location.pathname)
                  const active = isActive || related ? ' active' : ''
                  return base + active
                }}
                onClick={closeSidebar}
              >
                {route.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
      <StaffPunchModals
        checkoutOpen={checkoutOpen}
        onCheckoutClose={() => setCheckoutOpen(false)}
        onCheckedOut={finishLogout}
      />
    </div>
  )
}
