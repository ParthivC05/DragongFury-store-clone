import { useState, useCallback } from 'react'
import { useToastContext } from '../context/ToastContext'

const EXIT_DURATION_MS = 250

export function Toaster() {
  const { toasts, removeToast } = useToastContext()
  const [exitingIds, setExitingIds] = useState(new Set())

  const handleDismiss = useCallback(
    (id) => {
      setExitingIds((prev) => new Set(prev).add(id))
      setTimeout(() => {
        removeToast(id)
        setExitingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, EXIT_DURATION_MS)
    },
    [removeToast]
  )

  if (toasts.length === 0) return null

  return (
    <div
      className="admin-toaster"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map(({ id, type, message }) => (
        <div
          key={id}
          className={`admin-toast admin-toast-${type} ${exitingIds.has(id) ? 'admin-toast-exit' : 'admin-toast-enter'}`}
          role="alert"
        >
          <p className="admin-toast-message">{message}</p>
          <button
            type="button"
            onClick={() => handleDismiss(id)}
            className="admin-toast-dismiss"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
