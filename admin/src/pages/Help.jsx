import { useState, useEffect, useCallback, useRef } from 'react'
import * as adminApi from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { RichTextEditor } from '../components/RichTextEditor'
import './Help.css'

const TOPICS = [
  { id: 'create-account', label: 'Create Account' },
  { id: 'recharge', label: 'Recharge' },
  { id: 'redeem', label: 'Redeem' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'vip', label: 'VIP' },
  { id: 'spin-wheel', label: 'Spin Wheel' },
  { id: 'refer-earn', label: 'Refer & Earn' }
]

export default function Help() {
  const { user } = useAuth()
  const toast = useToast()
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN

  const [topicsWithMeta, setTopicsWithMeta] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTopicId, setSelectedTopicId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editVideoUrl, setEditVideoUrl] = useState('')
  const [useDefault, setUseDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingOne, setLoadingOne] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [dropdownOpen])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminApi.getHelpList()
      setTopicsWithMeta(data?.topics ?? [])
    } catch {
      setTopicsWithMeta(TOPICS.map((t) => ({ ...t, default_content: null, store_content: null, use_default: true })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    if (!selectedTopicId) return
    setLoadingOne(true)
    adminApi
      .getHelpTopic(selectedTopicId)
      .then((data) => {
        setEditContent(data?.content ?? '')
        setEditVideoUrl(data?.video_url ?? '')
        setUseDefault(!!data?.is_default)
      })
      .catch(() => {
        setEditContent('')
        setEditVideoUrl('')
        setUseDefault(true)
      })
      .finally(() => setLoadingOne(false))
  }, [selectedTopicId])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!selectedTopicId) return
    setSaving(true)
    try {
      if (isStoreAdmin && useDefault) {
        await adminApi.upsertHelpTopic(selectedTopicId, { use_default: true })
        toast.success('This topic now uses the platform default. Your users will see the same guide as set by the platform.')
      } else {
        await adminApi.upsertHelpTopic(selectedTopicId, {
          content: editContent,
          video_url: editVideoUrl.trim() || null
        })
        toast.success('Help content saved.')
      }
      await loadList()
    } catch (err) {
      toast.error(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleUseDefaultForAll = async () => {
    if (!isStoreAdmin) return
    setSaving(true)
    try {
      await Promise.all(TOPICS.map((t) => adminApi.upsertHelpTopic(t.id, { use_default: true })))
      toast.success('All topics now use the platform default.')
      await loadList()
      setUseDefault(true)
      if (selectedTopicId) {
        setEditContent('')
        setEditVideoUrl('')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to apply default for all.')
    } finally {
      setSaving(false)
    }
  }

  const selectedLabel = TOPICS.find((t) => t.id === selectedTopicId)?.label ?? selectedTopicId
  const allUseDefault = isStoreAdmin && TOPICS.every((t) => {
    const meta = topicsWithMeta.find((m) => m.id === t.id)
    return meta?.use_default !== false
  })
  const isEditingCustom = !isStoreAdmin || !useDefault
  const hasContent = (editContent || '').trim() !== '' || (editVideoUrl || '').trim() !== ''
  const isCreateMode = isEditingCustom && !hasContent

  return (
    <div className="help-admin-page">
      <h2>Help Content</h2>
      <p className="help-admin-intro">
        {user?.role === ROLES.MASTER_ADMIN
          ? 'Edit platform default help pages. Store admins can use these or set their own.'
          : 'For each topic you can use the platform default guide or write your own. Your users see your choice per topic.'}
      </p>

      {isStoreAdmin && !loading && (
        <div className="help-admin-default-card">
          <div className="help-admin-default-card-inner">
            <span className="help-admin-default-card-title">Platform default</span>
            <p className="help-admin-default-card-desc">
              Use the platform’s pre-written guides for your store. No need to maintain content yourself.
            </p>
            <div className="help-admin-default-card-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary help-admin-default-for-all"
                onClick={handleUseDefaultForAll}
                disabled={saving || allUseDefault}
                title={allUseDefault ? 'All topics already use platform default' : 'Set all topics to use platform default'}
              >
                {allUseDefault ? 'All topics use default' : 'Use platform default for all topics'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="help-admin-layout">
        {/* Mobile: custom dropdown with chips */}
        <div className="help-admin-nav-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className="help-admin-nav-select"
            onClick={() => !loading && setDropdownOpen((o) => !o)}
            disabled={loading}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            aria-label="Select topic"
          >
            {loading ? 'Loading…' : selectedTopicId ? (
              <>
                {TOPICS.find((t) => t.id === selectedTopicId)?.label ?? selectedTopicId}
                {isStoreAdmin && (() => {
                  const meta = topicsWithMeta.find((m) => m.id === selectedTopicId)
                  const hasCustom = meta && !meta.use_default
                  const usesDefault = meta?.use_default !== false
                  return hasCustom ? (
                    <span className="help-admin-nav-dropdown-chip help-admin-nav-dropdown-chip-custom">Custom</span>
                  ) : usesDefault ? (
                    <span className="help-admin-nav-dropdown-chip help-admin-nav-dropdown-chip-default">Default</span>
                  ) : null
                })()}
              </>
            ) : (
              'Select a topic…'
            )}
          </button>
          {dropdownOpen && !loading && (
            <div className="help-admin-nav-dropdown-list" role="listbox">
              {TOPICS.map((t) => {
                const meta = topicsWithMeta.find((m) => m.id === t.id)
                const hasCustom = isStoreAdmin && meta && !meta.use_default
                const usesDefault = isStoreAdmin && meta && meta.use_default !== false
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={selectedTopicId === t.id}
                    className={`help-admin-nav-dropdown-item ${selectedTopicId === t.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedTopicId(t.id)
                      setDropdownOpen(false)
                    }}
                  >
                    <span className="help-admin-nav-dropdown-item-label">{t.label}</span>
                    {hasCustom && <span className="help-admin-nav-dropdown-chip help-admin-nav-dropdown-chip-custom">Custom</span>}
                    {usesDefault && !hasCustom && <span className="help-admin-nav-dropdown-chip help-admin-nav-dropdown-chip-default">Default</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Desktop: sidebar nav */}
        <nav className="help-admin-nav">
          {loading ? (
            <p>Loading…</p>
          ) : (
            TOPICS.map((t) => {
              const meta = topicsWithMeta.find((m) => m.id === t.id)
              const hasCustom = isStoreAdmin && meta && !meta.use_default
              const usesDefault = isStoreAdmin && meta && meta.use_default !== false
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`help-admin-nav-btn ${selectedTopicId === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedTopicId(t.id)}
                >
                  <span className="help-admin-nav-btn-label">{t.label}</span>
                  {hasCustom && <span className="help-admin-nav-badge">Custom</span>}
                  {usesDefault && !hasCustom && <span className="help-admin-nav-badge help-admin-nav-badge-default">Default</span>}
                </button>
              )
            })
          )}
        </nav>

        <div className="help-admin-editor">
          {!selectedTopicId ? (
            <p className="help-admin-placeholder">Select a topic to edit.</p>
          ) : loadingOne ? (
            <p>Loading…</p>
          ) : (
            <form onSubmit={handleSave} className="help-admin-form">
              <h3>{selectedLabel}</h3>

              {isStoreAdmin && (
                <div className="help-admin-use-default-section">
                  <label className="help-admin-checkbox help-admin-checkbox-card">
                    <input
                      type="checkbox"
                      checked={useDefault}
                      onChange={(e) => setUseDefault(e.target.checked)}
                    />
                    <span className="help-admin-checkbox-label">Use platform default for this topic</span>
                  </label>
                  <p className="help-admin-use-default-hint">
                    {useDefault
                      ? 'Your store will show the platform’s default guide for this topic. You can switch to custom content anytime.'
                      : 'Write your own guide and optional video link for this topic.'}
                  </p>
                </div>
              )}

              {(!isStoreAdmin || !useDefault) && (
                <>
                  <label className="help-admin-label">Guide content (bold, italic, list, image)</label>
                  <RichTextEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="Step-by-step guide text…"
                    minHeight="240px"
                  />

                  <label className="help-admin-label help-admin-label-video">Video link (one URL per topic)</label>
                  <input
                    type="url"
                    className="help-admin-input"
                    value={editVideoUrl}
                    onChange={(e) => setEditVideoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </>
              )}

              <div className="help-admin-actions">
                <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                  {saving ? (isCreateMode ? 'Creating…' : 'Updating…') : (isCreateMode ? `Create ${selectedLabel}` : `Update ${selectedLabel}`)}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setSelectedTopicId(null)}
                >
                  Back to list
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
