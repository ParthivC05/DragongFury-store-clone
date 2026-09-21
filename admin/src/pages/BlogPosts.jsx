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
import { ADMIN_FEATURE_KEYS, filterStoreCodesByAdminScope } from '../constants/permissions'
import './Bonus.css'
import './BlogPosts.css'

const PAGE_SIZE = 20

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
        const codes = [...new Set(
          rows
            .map((s) => s.storeCode || s.store_code)
            .filter(Boolean)
            .map((code) => String(code))
        )].sort((a, b) => a.localeCompare(b))
        setStoreOptions(filterStoreCodesByAdminScope(codes, user?.adminPermissions, ADMIN_FEATURE_KEYS.BLOG_POSTS))
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster, user])

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
      toast.success(post.isActive ? 'Hidden from the website.' : 'Now showing on the website.')
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
  const liveCount = posts.filter((p) => p.isActive).length

  return (
    <div className="blog-admin-page blog-studio">
      <div className="blog-studio-hero">
        <div>
          <h2>Blog posts</h2>
          <p className="blog-admin-intro">
            {isMaster
              ? 'Add a blog post, change one, or hide one. It is okay to go slow.'
              : 'Add a blog post for your website. It is okay to go slow.'}
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

      <div className="blog-studio-stats">
        <span>{total} blog posts</span>
        <span>{liveCount} published on this page</span>
      </div>

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
            <option value="">All stores I can manage</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        )}
        <button type="submit" className="admin-btn admin-btn-secondary">Filter</button>
      </form>

      {loading ? (
        <p className="blog-studio-empty">Loading blog posts…</p>
      ) : posts.length === 0 ? (
        <div className="blog-studio-empty">
          <p>No blog posts yet.</p>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate('/blog/new')}>
            Add blog post
          </button>
        </div>
      ) : (
        <div className="blog-studio-grid">
          {posts.map((post) => (
            <article key={post.id} className="blog-studio-card">
              <div className="blog-studio-cover">
                {post.titleImage ? (
                  <img src={post.titleImage} alt="" />
                ) : (
                  <div className="blog-studio-cover-fallback" />
                )}
                <div className="blog-studio-cover-meta">
                  <span className={`blog-admin-badge${post.isActive ? ' is-active' : ''}`}>
                    {post.isActive ? 'Live' : 'Draft'}
                  </span>
                  <span className={`blog-admin-badge${post.allowIndex !== false ? ' is-index' : ' is-noindex'}`}>
                    {post.allowIndex !== false ? 'Google' : 'Hidden'}
                  </span>
                </div>
              </div>
              <div className="blog-studio-body">
                {post.category && <p className="blog-studio-cat">{post.category}</p>}
                <h3>{post.title}</h3>
                <p className="blog-studio-slug">/{post.slug}</p>
                <p className="blog-studio-date">
                  {formatDate(post.createdAt)}
                  {isMaster && post.storeCode ? ` · ${post.storeCode}` : ''}
                </p>
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
                    {post.isActive ? 'Hide' : 'Show'}
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
              </div>
            </article>
          ))}
        </div>
      )}

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
