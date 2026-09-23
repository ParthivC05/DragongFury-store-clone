import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageContentReady } from '../context/PageReadyContext';
import { AuthPage } from './Auth';
import { AppLoader } from './AppLoader';
import { Home } from '../pages/Home';

/**
 * Login/signup overlay on the guest landing, matching dragonfury.online.
 * If user is already logged in, redirect to home.
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
  return (
    <>
      <Home />
      <AuthPage mode={mode} />
    </>
  );
}
