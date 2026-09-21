import { useAuth } from '../context/AuthContext';
import { AppLoader } from './AppLoader';

/**
 * Shows branded full-screen loader while auth is resolving (initial app load).
 */
export function AuthInitialLoader({ children }) {
  const { loading } = useAuth();
  if (loading) return <AppLoader fullScreen />;
  return children;
}
