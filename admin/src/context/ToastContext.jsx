import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const ToastContext = createContext(null)

const DEFAULT_DURATION = 5000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback(({ type = 'info', message, duration = DEFAULT_DURATION }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, type, message }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useMemo(
    () => ({
      success: (message, duration = DEFAULT_DURATION) => addToast({ type: 'success', message, duration }),
      error: (message, duration = DEFAULT_DURATION) => addToast({ type: 'error', message, duration }),
      info: (message, duration = DEFAULT_DURATION) => addToast({ type: 'info', message, duration }),
    }),
    [addToast]
  )

  const value = useMemo(
    () => ({ toasts, addToast, removeToast, toast }),
    [toasts, addToast, removeToast, toast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}

export function useToastContext() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToastContext must be used within ToastProvider')
  return ctx
}
