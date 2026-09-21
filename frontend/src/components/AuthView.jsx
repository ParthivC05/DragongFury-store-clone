import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageContentReady } from '../context/PageReadyContext';
import { AuthPage } from './Auth';
import { AppLoader } from './AppLoader';

/**
 * Full-page login/signup for /login and /register.
 * If user is already logged in, redirect to home. Layout hides sidebar on these routes.
 */
export function AuthView() {
  const { pathname } = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const mode = pathname === '/register' ? 'signup' : 'login';

  usePageContentReady(!loading);

  if (loading) {
    return <AppLoader fullScreen />;
  }
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <AuthPage mode={mode} />;
}
