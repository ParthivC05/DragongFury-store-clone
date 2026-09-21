import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getAdminFooterMenus,
  createAdminFooterMenu,
  updateAdminFooterMenu,
  deleteAdminFooterMenu,
  deleteAdminFooterPage,
  getAdminFooterSettings,
  updateAdminFooterSettings,
  getAdminLegalPages,
  getStores
} from '../api/admin'
import { LEGAL_PAGE_OPTIONS } from '../constants/legalPages'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './BlogPosts.css'
import './FooterPages.css'

const EMPTY_MENU = { label: '', sortOrder: 0, isActive: true, storeCode: '' }

export default function FooterPages() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const [storeDraft, setStoreDraft] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [storeOptions, setStoreOptions] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [showMenuForm, setShowMenuForm] = useState(false)
  const [editingMenu, setEditingMenu] = useState(null)
  const [menuForm, setMenuForm] = useState(() => ({
    ...EMPTY_MENU,
    storeCode: isMaster ? '' : (user?.storeCode || '')
  }))
  const [savingMenu, setSavingMenu] = useState(false)
  const [showDefaultMenus, setShowDefaultMenus] = useState(true)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [legalPages, setLegalPages] = useState(LEGAL_PAGE_OPTIONS)
  const menuFormRef = useRef(null)
  const menuNameRef = useRef(null)

  const settingsStoreCode = isMaster
    ? appliedStore.trim()
    : (user?.storeCode || '')

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (isMaster && appliedStore.trim()) params.storeCode = appliedStore.trim()
    getAdminFooterMenus(params)
      .then((res) => setMenus(res.footer_menus || []))
      .catch((err) => {
        toast.error(err.message || 'Failed to load footer menus')
        setMenus([])
      })
      .finally(() => setLoading(false))
  }, [appliedStore, isMaster, toast])

  const loadSettings = useCallback(() => {
    if (!settingsStoreCode) {
      setShowDefaultMenus(true)
      return
    }
    getAdminFooterSettings({ storeCode: settingsStoreCode })
      .then((res) => {
        const s = res.settings || {}
        setShowDefaultMenus(s.showDefaultMenus !== false)
      })
      .catch(() => setShowDefaultMenus(true))
  }, [settingsStoreCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const loadLegalPages = useCallback(() => {
    if (!settingsStoreCode) {
      setLegalPages(LEGAL_PAGE_OPTIONS)
      return
    }
    getAdminLegalPages({ storeCode: settingsStoreCode })
      .then((res) => {
        const rows = res.legal_pages || []
        const byKey = new Map(rows.map((row) => [row.pageKey, row]))
        setLegalPages(
          LEGAL_PAGE_OPTIONS.map((page) => ({
            ...page,
            ...(byKey.get(page.pageKey) || {})
          }))
        )
      })
      .catch(() => setLegalPages(LEGAL_PAGE_OPTIONS))
  }, [settingsStoreCode])

  useEffect(() => {
    loadLegalPages()
  }, [loadLegalPages])

  const saveDefaultMenus = async (next) => {
    if (!settingsStoreCode) {
      toast.error('Pick a store first to change default footer menus.')
      return
    }
    setSavingDefaults(true)
    const prev = showDefaultMenus
    setShowDefaultMenus(next)
    try {
      const body = { showDefaultMenus: next }
      if (isMaster) body.storeCode = settingsStoreCode
      await updateAdminFooterSettings(body)
      toast.success(next
        ? 'Default Platforms & Support menus will show on the site.'
        : 'Default Platforms & Support menus hidden. Only your custom menus will show.')
    } catch (err) {
      setShowDefaultMenus(prev)
      toast.error(err.message || 'Could not save footer settings.')
    } finally {
      setSavingDefaults(false)
    }
  }

  useEffect(() => {
    if (!isMaster) return
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        let codes = rows
          .map((s) => s.storeCode || s.store_code)
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b)))
        const scope = user?.adminPermissions?.footer_pages_store_scope
        const limited = user?.adminPermissions?.footer_pages_store_codes
        if (scope === 'particular' && Array.isArray(limited) && limited.length > 0) {
          const allow = new Set(limited.map((c) => String(c).toLowerCase()))
          codes = codes.filter((c) => allow.has(String(c).toLowerCase()))
        }
        setStoreOptions(codes)
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster, user])

  const openCreateMenu = () => {
    setEditingMenu(null)
    setMenuForm({
      ...EMPTY_MENU,
      storeCode: isMaster ? (appliedStore || storeOptions[0] || '') : (user?.storeCode || '')
    })
    setShowMenuForm(true)
  }

  const openEditMenu = (menu) => {
    setEditingMenu(menu)
    setMenuForm({
      label: menu.label || '',
      sortOrder: menu.sortOrder ?? 0,
      isActive: menu.isActive !== false,
      storeCode: menu.storeCode || ''
    })
    setShowMenuForm(true)
  }

  useEffect(() => {
    if (!showMenuForm) return
    const form = menuFormRef.current
    if (!form) return
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = window.setTimeout(() => menuNameRef.current?.focus(), 280)
    return () => window.clearTimeout(timer)
  }, [showMenuForm, editingMenu])

  const saveMenu = async (e) => {
    e.preventDefault()
    const label = menuForm.label.trim()
    if (!label) {
      toast.error('Please type a menu name.')
      return
    }
    if (isMaster && !editingMenu && !menuForm.storeCode.trim()) {
      toast.error('Please pick a store first.')
      return
    }
    setSavingMenu(true)
    try {
      const body = {
        label,
        sortOrder: Number(menuForm.sortOrder) || 0,
        isActive: menuForm.isActive !== false
      }
      if (isMaster && !editingMenu) body.storeCode = menuForm.storeCode.trim()
      if (editingMenu) {
        await updateAdminFooterMenu(editingMenu.id, body)
        toast.success('Menu saved.')
      } else {
        await createAdminFooterMenu(body)
        toast.success('Menu created. Now add a page under it.')
      }
      setShowMenuForm(false)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not save menu.')
    } finally {
      setSavingMenu(false)
    }
  }

  const handleDeleteMenu = async (menu) => {
    const ok = await confirm({
      title: 'Delete this menu?',
      message: `Delete “${menu.label}” and all pages inside it? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    })
    if (!ok) return
    setBusyId(`menu-${menu.id}`)
    try {
      await deleteAdminFooterMenu(menu.id)
      toast.success('Menu deleted.')
      load()
    } catch (err) {
      toast.error(err.message || 'Could not delete menu.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeletePage = async (page) => {
    const ok = await confirm({
      title: 'Delete this page?',
      message: `Delete “${page.title}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    })
    if (!ok) return
    setBusyId(`page-${page.id}`)
    try {
      await deleteAdminFooterPage(page.id)
      toast.success('Page deleted.')
      load()
    } catch (err) {
      toast.error(err.message || 'Could not delete page.')
    } finally {
      setBusyId(null)
    }
  }

  const menuFormEl = showMenuForm ? (
    <form
      ref={menuFormRef}
      className={`footer-menu-form${editingMenu ? ' is-inline' : ''}`}
      onSubmit={saveMenu}
    >
      <h3>{editingMenu ? 'Edit menu group' : 'New menu group'}</h3>
      <p className="footer-menu-form-hint">This is the heading shown above a list of footer links.</p>
      {isMaster && !editingMenu && (
        <label className="blog-admin-field">
          <span>Store</span>
          <select
            value={menuForm.storeCode}
            onChange={(e) => setMenuForm((f) => ({ ...f, storeCode: e.target.value }))}
            required
          >
            <option value="">Pick a store…</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
      )}
      <label className="blog-admin-field">
        <span>Menu name</span>
        <input
          ref={menuNameRef}
          type="text"
          value={menuForm.label}
          onChange={(e) => setMenuForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="e.g. Legal"
          required
        />
      </label>
      <label className="blog-admin-field">
        <span>Order (smaller = first)</span>
        <input
          type="number"
          value={menuForm.sortOrder}
          onChange={(e) => setMenuForm((f) => ({ ...f, sortOrder: e.target.value }))}
        />
      </label>
      <label className="blog-admin-field blog-admin-field-toggle">
        <input
          type="checkbox"
          checked={menuForm.isActive !== false}
          onChange={(e) => setMenuForm((f) => ({ ...f, isActive: e.target.checked }))}
        />
        <span>Show on website</span>
      </label>
      <div className="blog-admin-form-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={savingMenu}>
          {savingMenu ? 'Saving…' : (editingMenu ? 'Save menu' : 'Create menu')}
        </button>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowMenuForm(false)}>
          Cancel
        </button>
      </div>
    </form>
  ) : null

  return (
    <div className="blog-admin-page footer-admin-page">
      <div className="footer-admin-hero">
        <div>
          <h2>Footer links</h2>
          <p className="footer-admin-hero-sub">
            Groups appear as headings at the bottom of the site. Pages inside them are the actual links.
          </p>
        </div>
        <div className="footer-admin-header-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={openCreateMenu}>
            Add group
          </button>
          <Link to="/footer/pages/new" className="admin-btn admin-btn-primary">
            Add page
          </Link>
        </div>
      </div>

      <p className="footer-admin-lead">
        Add a group, then add pages under it. Visitors open /page-name — the group name is only the footer heading.
      </p>

      {isMaster && (
        <form
          className="footer-store-bar"
          onSubmit={(e) => {
            e.preventDefault()
            setAppliedStore(storeDraft)
          }}
        >
          <label>
            Which store?
            <select value={storeDraft} onChange={(e) => setStoreDraft(e.target.value)}>
              <option value="">All stores I can manage</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-btn admin-btn-secondary">Show</button>
        </form>
      )}

      <div className="footer-legal-card">
        <div>
          <strong>Legal pages</strong>
          <p>Privacy Policy, Terms &amp; Conditions, and Responsible Gaming. Edit with the visual editor or HTML palette.</p>
          {isMaster && !settingsStoreCode && (
            <p className="footer-defaults-hint">Select a store above to edit these pages.</p>
          )}
        </div>
        <div className="footer-legal-list">
          {legalPages.map((page) => {
            const canEdit = Boolean(settingsStoreCode)
            const editTo = `/footer/legal/${page.pageKey}?storeCode=${encodeURIComponent(settingsStoreCode)}`
            return (
              <div key={page.pageKey} className="footer-legal-row">
                <div>
                  <strong>{page.title || LEGAL_PAGE_OPTIONS.find((p) => p.pageKey === page.pageKey)?.title}</strong>
                  <div className="footer-legal-row-meta">
                    <code>{page.path}</code>
                    <span className={`blog-admin-badge${page.hasContent && page.isActive !== false ? ' is-active' : ''}`}>
                      {page.hasContent
                        ? (page.isActive !== false ? 'Live' : 'Hidden')
                        : 'Empty'}
                    </span>
                  </div>
                </div>
                {canEdit ? (
                  <Link to={editTo} className="admin-btn admin-btn-primary">
                    Edit
                  </Link>
                ) : (
                  <button type="button" className="admin-btn admin-btn-secondary" disabled>
                    Edit
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="footer-defaults-card">
        <div>
          <strong>Built-in Platforms &amp; Support</strong>
          <p>Keep the default footer menus, or turn them off to show only your groups.</p>
          {isMaster && !settingsStoreCode && (
            <p className="footer-defaults-hint">Select a store above to change this setting.</p>
          )}
        </div>
        <label className="blog-admin-field blog-admin-field-toggle footer-defaults-toggle">
          <input
            type="checkbox"
            checked={showDefaultMenus}
            disabled={savingDefaults || (isMaster && !settingsStoreCode)}
            onChange={(e) => saveDefaultMenus(e.target.checked)}
          />
          <span>{showDefaultMenus ? 'Showing defaults' : 'Defaults hidden'}</span>
        </label>
      </div>

      {showMenuForm && !editingMenu ? menuFormEl : null}

      {loading ? (
        <p>Loading…</p>
      ) : menus.length === 0 ? (
        <div className="footer-admin-empty-box">
          <strong>No footer menus yet</strong>
          <p className="footer-admin-empty">Click “Add group”, then add pages under that group.</p>
        </div>
      ) : (
        <div className="footer-menu-list">
          {menus.map((menu) => (
            <section key={menu.id} className="footer-menu-card">
              <div className="footer-menu-card-header">
                <div>
                  <h3>{menu.label}</h3>
                  <p className="footer-menu-meta">
                    {isMaster && menu.storeCode && (
                      <span className="footer-menu-store-pill">{menu.storeCode}</span>
                    )}
                    <span className={`blog-admin-badge${menu.isActive !== false ? ' is-active' : ''}`}>
                      {menu.isActive !== false ? 'Visible' : 'Hidden'}
                    </span>
                    <span>Order {menu.sortOrder ?? 0}</span>
                  </p>
                </div>
                <div className="footer-menu-actions">
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={() => openEditMenu(menu)}>
                    Edit group
                  </button>
                  <Link
                    to={`/footer/pages/new?menuId=${menu.id}${menu.storeCode ? `&storeCode=${encodeURIComponent(menu.storeCode)}` : ''}`}
                    className="admin-btn admin-btn-primary"
                  >
                    Add page
                  </Link>
                  <button
                    type="button"
                    className="admin-btn admin-btn-danger"
                    disabled={busyId === `menu-${menu.id}`}
                    onClick={() => handleDeleteMenu(menu)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editingMenu?.id === menu.id ? menuFormEl : null}
              {(menu.pages || []).length === 0 ? (
                <p className="footer-menu-empty">No pages yet — click “Add page”.</p>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Page title</th>
                        <th>Type</th>
                        <th>Website link</th>
                        <th>Order</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {menu.pages.map((page) => (
                        <tr key={page.id}>
                          <td>{page.title}</td>
                          <td>{page.redirectPath || page.linkType === 'redirect' ? 'Redirect' : 'Content'}</td>
                          <td>
                            <code className="footer-slug-code">
                              {page.redirectPath || `/${page.slug}`}
                            </code>
                          </td>
                          <td>{page.sortOrder ?? 0}</td>
                          <td>
                            <span className={`blog-admin-badge${page.isActive !== false ? ' is-active' : ''}`}>
                              {page.isActive !== false ? 'Live' : 'Hidden'}
                            </span>
                          </td>
                          <td className="footer-page-row-actions">
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary"
                              onClick={() => navigate(`/footer/pages/${page.id}/edit`)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-danger"
                              disabled={busyId === `page-${page.id}`}
                              onClick={() => handleDeletePage(page)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
