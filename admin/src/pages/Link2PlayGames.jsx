import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getAdminLink2PlayGames,
  toggleAdminLink2PlayGame,
  deleteAdminLink2PlayGame,
  getStores
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './Bonus.css'
import './BlogPosts.css'

const PAGE_SIZE = 20
const EXCLUDED_STORES = new Set(['casinoslots', 'grandsweeps', 'grandsweep'])

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return `${date.toLocaleDateString(undefined, { dateStyle: 'short' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function linkSummary(game) {
  const parts = []
  if (game.linkWeb) parts.push('Web')
  if (game.linkAndroid) parts.push('Android')
  if (game.linkIos) parts.push('iPhone')
  return parts.length ? parts.join(' · ') : '—'
}

function normalizeStoreCode(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default function Link2PlayGames() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [games, setGames] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [appliedCategory, setAppliedCategory] = useState('')
  const [storeDraft, setStoreDraft] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [storeOptions, setStoreOptions] = useState([])
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: PAGE_SIZE }
    if (appliedSearch.trim()) params.search = appliedSearch.trim()
    if (appliedCategory.trim()) params.category = appliedCategory.trim()
    if (isMaster && appliedStore.trim()) params.storeCode = appliedStore.trim()
    getAdminLink2PlayGames(params)
      .then((res) => {
        setGames(res.link2play_games || [])
        setTotal(res.total ?? 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load Link2Play games')
        setGames([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, appliedSearch, appliedCategory, appliedStore, isMaster, toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!isMaster) return
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        setStoreOptions(
          rows
            .map((s) => s.storeCode || s.store_code)
            .filter((code) => code && !EXCLUDED_STORES.has(normalizeStoreCode(code)))
            .sort((a, b) => String(a).localeCompare(String(b)))
        )
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster])

  const applyFilters = (e) => {
    e?.preventDefault?.()
    setPage(1)
    setAppliedSearch(searchDraft)
    setAppliedCategory(categoryDraft)
    setAppliedStore(storeDraft)
  }

  const handleToggle = async (game) => {
    setBusyId(game.id)
    try {
      await toggleAdminLink2PlayGame(game.id, !game.isActive)
      toast.success(game.isActive ? 'Game deactivated.' : 'Game activated.')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to toggle status.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (game) => {
    const ok = await confirm({
      title: 'Delete Link2Play game?',
      message: `Delete “${game.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    })
    if (!ok) return
    setBusyId(game.id)
    try {
      await deleteAdminLink2PlayGame(game.id)
      toast.success('Game deleted.')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete.')
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const colSpan = isMaster ? 7 : 6

  return (
    <div className="blog-admin-page">
      <div className="blog-admin-header">
        <div>
          <h2>Link2Play</h2>
          <p className="blog-admin-intro">
            Manage games shown on each store’s Link2Play page (not available for casinoslots / grandsweeps).
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate('/link2play/new')}>
          Add game
        </button>
      </div>

      {!isMaster && user?.storeCode && (
        <p className="bonus-store-banner">
          Publishing for store <strong>{user.storeCode}</strong>
        </p>
      )}

      <form className="blog-admin-filters" onSubmit={applyFilters}>
        <input
          className="ccw-filter-input"
          type="search"
          placeholder="Search game name"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
        />
        <select
          className="ccw-filter-input"
          value={categoryDraft}
          onChange={(e) => setCategoryDraft(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="popular">Popular</option>
          <option value="live">Live</option>
        </select>
        {isMaster && (
          <select
            className="ccw-filter-input"
            value={storeDraft}
            onChange={(e) => setStoreDraft(e.target.value)}
          >
            <option value="">All stores</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        )}
        <button type="submit" className="admin-btn admin-btn-secondary">Apply Filters</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Category</th>
              <th>Links</th>
              {isMaster && <th>Store</th>}
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan}>Loading…</td></tr>
            ) : games.length === 0 ? (
              <tr><td colSpan={colSpan}>No Link2Play games yet.</td></tr>
            ) : (
              games.map((game) => (
                <tr key={game.id}>
                  <td>
                    <div className="blog-admin-title-cell">
                      {game.imageUrl ? (
                        <img src={game.imageUrl} alt="" className="blog-admin-thumb" />
                      ) : null}
                      <span>{game.name}</span>
                    </div>
                  </td>
                  <td>
                    {[
                      game.isPopular ? 'Popular' : null,
                      game.isLive ? 'Live' : null
                    ].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>{linkSummary(game)}</td>
                  {isMaster && <td>{game.storeCode}</td>}
                  <td>
                    <span className={`blog-admin-badge${game.isActive ? ' is-active' : ''}`}>
                      {game.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDate(game.updatedAt)}</td>
                  <td>
                    <div className="blog-admin-actions">
                      <Link className="admin-btn admin-btn-secondary admin-btn-sm" to={`/link2play/${game.id}/edit`}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        disabled={busyId === game.id}
                        onClick={() => handleToggle(game)}
                      >
                        {game.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        disabled={busyId === game.id}
                        onClick={() => handleDelete(game)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="blog-admin-pager">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
