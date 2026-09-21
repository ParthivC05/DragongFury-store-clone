import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password']

/**
 * After a real session is confirmed, send public pages to the dashboard.
 * Do not redirect on a leftover localStorage token — that caused a reload loop
 * when the token was expired or invalid.
 */
export function PublicRouteGuard({ children }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}?`))
    if (isPublic && !loading && user) {
      navigate('/', { replace: true })
    }
  }, [pathname, loading, user, navigate])

  return children
}
