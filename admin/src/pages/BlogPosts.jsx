import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getAdminBlogPosts,
  toggleAdminBlogPost,
  deleteAdminBlogPost,
  getStores
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './Bonus.css'
import './BlogPosts.css'

const PAGE_SIZE = 20

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return `${date.toLocaleDateString(undefined, { dateStyle: 'short' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

export default function BlogPosts() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [storeDraft, setStoreDraft] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [storeOptions, setStoreOptions] = useState([])
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: PAGE_SIZE }
    if (appliedSearch.trim()) params.search = appliedSearch.trim()
    if (isMaster && appliedStore.trim()) params.storeCode = appliedStore.trim()
    getAdminBlogPosts(params)
      .then((res) => {
        setPosts(res.blog_posts || [])
        setTotal(res.total ?? 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load blog posts')
        setPosts([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, appliedSearch, appliedStore, isMaster, toast])

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
            .filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b)))
        )
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster])

  const applyFilters = (e) => {
    e?.preventDefault?.()
    setPage(1)
    setAppliedSearch(searchDraft)
    setAppliedStore(storeDraft)
  }

  const handleToggle = async (post) => {
    setBusyId(post.id)
    try {
      await toggleAdminBlogPost(post.id, !post.isActive)
      toast.success(post.isActive ? 'Post deactivated.' : 'Post activated.')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to toggle status.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (post) => {
    const ok = await confirm({
      title: 'Delete blog post?',
      message: `Delete “${post.title}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    })
    if (!ok) return
    setBusyId(post.id)
    try {
      await deleteAdminBlogPost(post.id)
      toast.success('Blog post deleted.')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete.')
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="blog-admin-page">
      <div className="blog-admin-header">
        <div>
          <h2>Blog posts</h2>
          <p className="blog-admin-intro">
            {isMaster
              ? 'Create store-scoped blog posts. Posts for dragonfury appear on the Dragon Fury user site.'
              : 'Posts you publish here appear on your store’s user site blog page.'}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate('/blog/new')}>
          Add blog post
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
          placeholder="Search title, slug, category"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
        />
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
        <button type="submit" className="admin-btn admin-btn-secondary">Filter</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Category</th>
              {isMaster && <th>Store</th>}
              <th>Status</th>
              <th>Google</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isMaster ? 8 : 7}>Loading…</td></tr>
            ) : posts.length === 0 ? (
              <tr><td colSpan={isMaster ? 8 : 7}>No blog posts yet.</td></tr>
            ) : (
              posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <div className="blog-admin-title-cell">
                      {post.titleImage ? (
                        <img src={post.titleImage} alt="" className="blog-admin-thumb" />
                      ) : null}
                      <span>{post.title}</span>
                    </div>
                  </td>
                  <td><code>{post.slug}</code></td>
                  <td>{post.category || '—'}</td>
                  {isMaster && <td>{post.storeCode}</td>}
                  <td>
                    <span className={`blog-admin-badge${post.isActive ? ' is-active' : ''}`}>
                      {post.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className={`blog-admin-badge${post.allowIndex !== false ? ' is-index' : ' is-noindex'}`}>
                      {post.allowIndex !== false ? 'Index' : 'Noindex'}
                    </span>
                  </td>
                  <td>{formatDate(post.createdAt)}</td>
                  <td>
                    <div className="blog-admin-actions">
                      <Link className="admin-btn admin-btn-secondary admin-btn-sm" to={`/blog/${post.id}/edit`}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        disabled={busyId === post.id}
                        onClick={() => handleToggle(post)}
                      >
                        {post.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        disabled={busyId === post.id}
                        onClick={() => handleDelete(post)}
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
