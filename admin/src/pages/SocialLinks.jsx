import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStores } from '../api/admin'
import { SocialLinksEditor } from '../components/SocialLinksEditor'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './StoreFeatures.css'
import './Profile.css'

export default function SocialLinks() {
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
      toast.error(err.message || 'Failed to load stores.')
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
    <div className="store-features-page social-links-page">
      <h2>Social media links</h2>
      <p className="store-features-intro">
        {isMasterAdmin
          ? 'Select a store to view and manage its landing-page Facebook, Facebook Group, Messenger, and WhatsApp links.'
          : 'Facebook, Facebook Group, Messenger, and WhatsApp icons on your public landing page. Leave a field empty to hide that icon.'}
      </p>

      {isMasterAdmin && (
        <section className="spin-wheel-card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
          <label htmlFor="social-links-store" className="store-features-hint" style={{ display: 'block', marginBottom: '0.4rem' }}>
            Select store
          </label>
          <select
            id="social-links-store"
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
      )}

      {isMasterAdmin && !storeIdForEditor ? (
        <p className="store-features-hint">
          {storesLoading ? 'Loading stores…' : 'Select a store to manage its social media links.'}
        </p>
      ) : (
        <SocialLinksEditor
          key={storeIdForEditor ?? 'own-store'}
          storeId={storeIdForEditor}
          title={
            isMasterAdmin && selectedStore
              ? `Landing page social media — ${selectedStore.storeCode || selectedStore.username || selectedStore.userId}`
              : 'Landing page social media'
          }
          description={
            isMasterAdmin
              ? 'Super admin and technical staff can add, update, or clear social links for any store.'
              : "These links appear as icons on your store's public landing page."
          }
        />
      )}
    </div>
  )
}
