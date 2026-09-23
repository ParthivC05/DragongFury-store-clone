import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { sanitizePlayerFacingMessage } from '../utils/playerFacingMessage';

const ToastContext = createContext(null);

const DEFAULT_DURATION = 5000;

/**
 * @param {object} opts
 * @param {'success'|'error'|'info'} [opts.type]
 * @param {string} opts.message
 * @param {number} [opts.duration]
 * @param {{ label: string, to: string }} [opts.action] - optional link shown in toast
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type = 'info', message, duration = DEFAULT_DURATION, action = null }) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      setToasts((prev) => [
        ...prev,
        { id, type, message: sanitizePlayerFacingMessage(message, { type }), duration, action }
      ]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
      return id;
    },
    [removeToast]
  );

  const toast = useMemo(() => {
    const make =
      (type) =>
      (message, durationOrOpts = DEFAULT_DURATION) => {
        if (durationOrOpts != null && typeof durationOrOpts === 'object') {
          const { duration = DEFAULT_DURATION, action = null } = durationOrOpts;
          return addToast({ type, message, duration, action });
        }
        return addToast({ type, message, duration: durationOrOpts });
      };
    return {
      success: make('success'),
      error: make('error'),
      info: make('info'),
      dismiss: removeToast,
      dismissAll: () => setToasts([])
    };
  }, [addToast, removeToast]);

  const value = useMemo(
    () => ({ toasts, addToast, removeToast, toast }),
    [toasts, addToast, removeToast, toast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
