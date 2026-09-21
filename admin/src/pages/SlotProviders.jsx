import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStores } from '../api/admin'
import { SlotProvidersEditor } from '../components/SlotProvidersEditor'
import { useToast } from '../context/ToastContext'
import './StoreFeatures.css'

export default function SlotProviders() {
  const toast = useToast()

  const [stores, setStores] = useState([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState('')

  const loadStores = useCallback(async () => {
    setStoresLoading(true)
    try {
      const res = await getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      const rows = Array.isArray(res?.list) ? res.list : []
      setStores(rows)
      setSelectedStoreId((prev) => {
        if (prev && rows.some((s) => String(s.userId) === String(prev))) return prev
        return rows[0]?.userId != null ? String(rows[0].userId) : ''
      })
    } catch (err) {
      toast.error(err.message || 'Failed to load stores.')
      setStores([])
      setSelectedStoreId('')
    } finally {
      setStoresLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  const selectedStore = useMemo(
    () => stores.find((s) => String(s.userId) === String(selectedStoreId)) || null,
    [stores, selectedStoreId],
  )

  const storeIdForEditor = selectedStore?.userId ?? null
  const storeName = selectedStore?.storeCode || selectedStore?.username || ''

  return (
    <div className="store-features-page slot-providers-page">
      <h2>Which games to show</h2>
      <p className="store-features-intro">
        Pick a store, then use the switches. ON = players can see those games. OFF = those games are hidden.
      </p>

      <section className="slot-providers-store-pick">
        <label htmlFor="slot-providers-store">1. Pick a store</label>
        <select
          id="slot-providers-store"
          className="store-features-input"
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          disabled={storesLoading || stores.length === 0}
        >
          {storesLoading ? (
            <option value="">Loading stores…</option>
          ) : stores.length === 0 ? (
            <option value="">No stores found</option>
          ) : (
            stores.map((s) => (
              <option key={s.userId} value={String(s.userId)}>
                {s.storeCode || '—'}
                {s.username ? ` (${s.username})` : ''}
              </option>
            ))
          )}
        </select>
      </section>

      {!storeIdForEditor ? (
        <p className="store-features-hint">
          {storesLoading ? 'Loading stores…' : 'Pick a store first.'}
        </p>
      ) : (
        <section>
          <p className="slot-providers-step">2. Turn games ON or OFF</p>
          <SlotProvidersEditor
            key={storeIdForEditor}
            storeId={storeIdForEditor}
            storeName={storeName}
          />
        </section>
      )}
    </div>
  )
}
