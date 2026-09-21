import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../context/ToastContext'
import {
  getStoreSlotProviders,
  updateStoreSlotProviders,
} from '../api/slotProviders'

const DEFAULTS = {
  onegamehub: true,
  bona: true,
  gitslotpark: true,
  scorpio: true,
}

const FIELDS = [
  {
    id: 'onegamehub',
    emoji: '1️⃣',
    label: '1GameHub games',
    help: 'Show 1GameHub games on the slots page.',
  },
  {
    id: 'bona',
    emoji: '🅱️',
    label: 'Bona games',
    help: 'Show Bona games on the slots page.',
  },
  {
    id: 'gitslotpark',
    emoji: '🎰',
    label: 'GitSlotPark games',
    help: 'Show GitSlotPark games (Pragmatic, PG Soft, and more).',
  },
  {
    id: 'scorpio',
    emoji: '🦂',
    label: 'Scorpio games',
    help: 'Show Scorpio Play slot games on the slots page.',
  },
]

function normalize(data) {
  return {
    onegamehub: data?.onegamehub !== false,
    bona: data?.bona !== false,
    gitslotpark: data?.gitslotpark !== false,
    scorpio: data?.scorpio !== false,
  }
}

function Switch({ id, checked, disabled, onChange }) {
  return (
    <label className="slot-providers-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="slot-providers-switch__input"
        checked={!!checked}
        disabled={!!disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="slot-providers-switch__slider" />
    </label>
  )
}

export function SlotProvidersEditor({ storeId, storeName = '' }) {
  const toast = useToast()
  const [providers, setProviders] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const providersRef = useRef(DEFAULTS)

  useEffect(() => {
    providersRef.current = providers
  }, [providers])

  useEffect(() => {
    if (!storeId) return undefined
    let cancelled = false
    setLoading(true)
    getStoreSlotProviders(storeId)
      .then((res) => {
        if (cancelled) return
        const next = normalize(res?.providers)
        setProviders(next)
        providersRef.current = next
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Could not load games list.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storeId, toast])

  const saveProviders = useCallback(
    async (nextProviders, fieldId) => {
      if (!storeId) return
      setSavingId(fieldId)
      try {
        const payload = normalize(nextProviders)
        const res = await updateStoreSlotProviders(storeId, payload)
        const saved = normalize(res?.providers ?? payload)
        setProviders(saved)
        providersRef.current = saved
        toast.success(nextProviders[fieldId] ? 'Turned ON. Players can see these games.' : 'Turned OFF. Players will not see these games.')
      } catch (err) {
        setProviders(providersRef.current)
        toast.error(err.message || 'Could not save. Please try again.')
      } finally {
        setSavingId('')
      }
    },
    [storeId, toast],
  )

  function handleToggle(fieldId, checked) {
    const next = { ...providers, [fieldId]: checked }
    setProviders(next)
    saveProviders(next, fieldId)
  }

  return (
    <div className="slot-providers-editor">
      <div className="slot-providers-editor-head">
        <h3>Games for {storeName || 'this store'}</h3>
        <p>Turn a switch ON to show those games. Turn it OFF to hide them.</p>
      </div>

      {loading ? (
        <p className="store-features-hint">Loading…</p>
      ) : (
        <div className="slot-providers-cards">
          {FIELDS.map((field) => {
            const on = providers[field.id] !== false
            const busy = savingId === field.id
            return (
              <div key={field.id} className={`slot-providers-card${on ? ' is-on' : ' is-off'}`}>
                <div className="slot-providers-card-copy">
                  <span className="slot-providers-card-emoji" aria-hidden>
                    {field.emoji}
                  </span>
                  <div>
                    <strong>{field.label}</strong>
                    <span>{field.help}</span>
                  </div>
                </div>
                <div className="slot-providers-card-control">
                  <span className={`slot-providers-status${on ? ' is-on' : ' is-off'}`}>
                    {busy ? 'Saving…' : on ? 'ON' : 'OFF'}
                  </span>
                  <Switch
                    id={`slot-provider-${storeId}-${field.id}`}
                    checked={on}
                    disabled={Boolean(savingId)}
                    onChange={(checked) => handleToggle(field.id, checked)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
