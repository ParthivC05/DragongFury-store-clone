import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import './ConfirmModal.css'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'danger', // 'danger' | 'primary' | 'neutral'
    resolve: null
  })

  const handleClose = useCallback((value) => {
    setState((prev) => {
      if (prev.resolve) prev.resolve(value)
      return { ...prev, open: false, resolve: null }
    })
  }, [])

  useEffect(() => {
    if (!state.open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.open, handleClose])

  const confirm = useCallback((options) => {
    const {
      title = 'Confirm',
      message = 'Are you sure?',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      variant = 'danger'
    } = typeof options === 'string' ? { message: options } : options

    return new Promise((resolve) => {
      setState({
        open: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        variant,
        resolve
      })
    })
  }, [])

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) handleClose(false)
  }, [handleClose])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div
          className="confirm-modal-backdrop"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-desc"
        >
          <div className={`confirm-modal-card${state.variant === 'danger' ? ' confirm-modal-card-danger' : ''}`}>
            <h2
              id="confirm-modal-title"
              className={`confirm-modal-title${state.variant === 'danger' ? ' confirm-modal-title-danger' : ''}`}
            >
              {state.title}
            </h2>
            {state.variant === 'danger' ? (
              <p id="confirm-modal-desc" className="confirm-modal-alert">
                {state.message}
              </p>
            ) : (
              <p id="confirm-modal-desc" className="confirm-modal-message">
                {state.message}
              </p>
            )}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-modal-btn confirm-modal-btn-cancel"
                onClick={() => handleClose(false)}
                autoFocus
              >
                {state.cancelLabel}
              </button>
              <button
                type="button"
                className={`confirm-modal-btn confirm-modal-btn-confirm confirm-modal-btn-${state.variant}`}
                onClick={() => handleClose(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
