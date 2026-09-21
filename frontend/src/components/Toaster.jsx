import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

const EXIT_DURATION_MS = 280;

const TOAST_META = {
  success: {
    icon: '✓',
    label: 'Success',
    className: 'dash-toast-success'
  },
  error: {
    icon: '!',
    label: 'Error',
    className: 'dash-toast-error'
  },
  info: {
    icon: 'i',
    label: 'Notice',
    className: 'dash-toast-info'
  }
};

export function Toaster() {
  const { toasts, removeToast } = useToast();
  const [exitingIds, setExitingIds] = useState(new Set());

  const handleDismiss = useCallback(
    (id) => {
      setExitingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        removeToast(id);
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, EXIT_DURATION_MS);
    },
    [removeToast]
  );

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="dash-toast-host" aria-live="polite" aria-label="Notifications">
      {toasts.map(({ id, type, message, duration, action }) => {
        const meta = TOAST_META[type] || TOAST_META.info;
        const isExiting = exitingIds.has(id);
        return (
          <div
            key={id}
            className={`dash-toast ${meta.className}${isExiting ? ' dash-toast-exit' : ' dash-toast-enter'}`}
            role="alert"
          >
            <span className="dash-toast-icon" aria-hidden>
              {meta.icon}
            </span>
            <div className="dash-toast-body">
              <span className="dash-toast-type">{meta.label}</span>
              <p className="dash-toast-message">{message}</p>
              {action?.to && action?.label ? (
                <Link
                  to={action.to}
                  className="dash-toast-action"
                  onClick={() => handleDismiss(id)}
                >
                  {action.label}
                </Link>
              ) : null}
              {duration > 0 && (
                <span
                  className="dash-toast-progress"
                  style={{ animationDuration: `${duration}ms` }}
                  aria-hidden
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDismiss(id)}
              className="dash-toast-close"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
