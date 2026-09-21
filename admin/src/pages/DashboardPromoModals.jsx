import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStores } from '../api/admin'
import { DashboardPromoModalsEditor } from '../components/DashboardPromoModalsEditor'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './StoreFeatures.css'
import './DashboardPromoModals.css'

export default function DashboardPromoModals() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [stores, setStores] = useState([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState('')

  const loadStores = useCallback(async () => {
    if (!isMasterAdmin) return
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
      toast.error(err.message || 'Could not load stores.')
      setStores([])
      setSelectedStoreId('')
    } finally {
      setStoresLoading(false)
    }
  }, [isMasterAdmin, toast])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  const selectedStore = useMemo(
    () => stores.find((s) => String(s.userId) === String(selectedStoreId)) || null,
    [stores, selectedStoreId],
  )

  const storeIdForEditor = isMasterAdmin ? selectedStore?.userId ?? null : null

  return (
    <div className="store-features-page">
      <h2>Login popups</h2>
      <p className="dpm-page-intro">
        {isMasterAdmin
          ? 'Pick a store, then set which popups appear after a player logs in — and how long to wait between each one.'
          : 'Set which popups appear after your players log in, and how long to wait between each one.'}
      </p>

      {isMasterAdmin && (
        <section className="dpm-store-picker">
          <label htmlFor="dashboard-promo-modals-store" className="dpm-field">
            <span style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
              Which store?
            </span>
            <select
              id="dashboard-promo-modals-store"
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
          </label>
        </section>
      )}

      {isMasterAdmin && !storeIdForEditor ? (
        <p className="store-features-hint">
          {storesLoading ? 'Loading stores…' : 'Choose a store above to get started.'}
        </p>
      ) : (
        <DashboardPromoModalsEditor
          key={storeIdForEditor ?? 'own-store'}
          storeId={storeIdForEditor}
          title={
            isMasterAdmin && selectedStore
              ? `Login popups — ${selectedStore.storeCode || selectedStore.username || selectedStore.userId}`
              : 'Login popups'
          }
        />
      )}
    </div>
  )
}
