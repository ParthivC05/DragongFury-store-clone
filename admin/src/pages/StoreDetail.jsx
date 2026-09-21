import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getStore,
  getStoreAdmins,
  getUsers,
  getGames,
  getDepositRequests,
  getWithdrawalRequests,
  updateStoreStaff,
  updateStore
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, canAccessAdminFeature } from '../constants/permissions'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { teamAccessPath } from '../utils/teamAccessPaths'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { formatCurrency } from '../utils/format'
import { SocialLinksEditor } from '../components/SocialLinksEditor'
import { LandingPaymentLinksEditor } from '../components/LandingPaymentLinksEditor'
import './UserDetail.css'
import './Users.css'
import './StoreDetail.css'

const USERS_PAGE_SIZE = 15
const DEP_PAGE_SIZE = 15
const WD_PAGE_SIZE = 15

function formatDateTime(value) {
  if (value == null || value === '') return '—'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function displayStr(v) {
  if (v == null || v === '') return '—'
  return String(v)
}

/** Withdrawals may use USD (Chime/Cash App) or SC — show numeric + currency code. */
function formatMoneyAmount(amount, currency) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  const cur = (currency != null && String(currency).trim()) ? String(currency).trim().toUpperCase() : 'USD'
  return `${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}

function moneyPair(src = {}) {
  return {
    completedAmount: Number(src.completedAmount) || 0,
    pendingAmount: Number(src.pendingAmount) || 0,
    completedFee: Number(src.completedFee) || 0
  }
}

function autoWithdrawPair(src = {}) {
  return {
    ...moneyPair(src),
    chime: moneyPair(src.chime),
    cashapp: moneyPair(src.cashapp),
    paypal: moneyPair(src.paypal)
  }
}

const emptyMoney = { completedAmount: 0, pendingAmount: 0, completedFee: 0 }
const emptyAutoWithdraw = {
  ...emptyMoney,
  chime: { ...emptyMoney },
  cashapp: { ...emptyMoney },
  paypal: { ...emptyMoney }
}

function paymentProviderDisplay(raw) {
  if (raw == null || raw === '') return '—'
  return String(raw).trim()
}

function canUseMasterPermission(user, adminKey) {
  if (!user) return false
  if (user.role === ROLES.DISTRIBUTOR_ADMIN) return true
  if (user.role === ROLES.MASTER_ADMIN) return canAccessAdminFeature(user, adminKey)
  return false
}

export default function StoreDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const isDistributorAdmin = user?.role === ROLES.DISTRIBUTOR_ADMIN
  const showStaffEmail = isMasterAdmin
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const canManageStoreStaff = isMasterAdmin && canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)
  const [staffTogglingId, setStaffTogglingId] = useState(null)

  const showUsers = canUseMasterPermission(user, ADMIN_FEATURE_KEYS.USERS)
  const showGames = canUseMasterPermission(user, ADMIN_FEATURE_KEYS.GAMES)
  const showDeposits = canUseMasterPermission(user, ADMIN_FEATURE_KEYS.USER_DEPOSITS)
  const showPaymentTotals = canUseMasterPermission(user, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS)
  const canEditStoreSocialLinks = canUseMasterPermission(user, ADMIN_FEATURE_KEYS.SOCIAL_LINKS)
  const canEditStoreLandingPaymentLinks = isMasterAdmin || isDistributorAdmin
  const showWithdrawals =
    canUseMasterPermission(user, ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS) ||
    canUseMasterPermission(user, ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS)

  const tabs = useMemo(() => {
    const t = [{ id: 'overview', label: 'Overview' }]
    if (showUsers) t.push({ id: 'customers', label: 'Customers' })
    t.push({ id: 'staff', label: 'Staff & admins' })
    if (showDeposits) t.push({ id: 'deposits', label: 'Deposits' })
    if (showWithdrawals) t.push({ id: 'withdrawals', label: 'Withdrawals' })
    if (showGames) t.push({ id: 'games', label: 'Games' })
    return t
  }, [showUsers, showWithdrawals, showGames, showDeposits])

  const [store, setStore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  const [usersPage, setUsersPage] = useState(1)
  const [usersData, setUsersData] = useState({ list: [], total: 0 })
  const [usersLoading, setUsersLoading] = useState(false)

  const [staffList, setStaffList] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)

  const [wdPage, setWdPage] = useState(1)
  const [wdData, setWdData] = useState({ list: [], total: 0 })
  const [wdLoading, setWdLoading] = useState(false)

  const [gamesList, setGamesList] = useState([])
  const [gamesLoading, setGamesLoading] = useState(false)

  const [depPage, setDepPage] = useState(1)
  const [depData, setDepData] = useState({ list: [], total: 0 })
  const [depLoading, setDepLoading] = useState(false)
  const [paymentsStartDate, setPaymentsStartDate] = useState('')
  const [paymentsEndDate, setPaymentsEndDate] = useState('')
  const [appliedPaymentsStartDate, setAppliedPaymentsStartDate] = useState('')
  const [appliedPaymentsEndDate, setAppliedPaymentsEndDate] = useState('')
  const [paymentSummary, setPaymentSummary] = useState({
    deposits: {
      orionstarspay: { ...emptyMoney },
      chime: { ...emptyMoney },
      dollarpay: { ...emptyMoney }
    },
    withdrawals: {
      orionstarspay: { ...emptyMoney },
      chime: { ...emptyMoney },
      cashapp: { ...emptyMoney },
      dollarpay: { ...emptyAutoWithdraw }
    }
  })
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setTab('overview')
    setUsersPage(1)
    setWdPage(1)
    setDepPage(1)
    setUsersData({ list: [], total: 0 })
    setStaffList([])
    setWdData({ list: [], total: 0 })
    setGamesList([])
    setDepData({ list: [], total: 0 })
    setPaymentSummary({
      deposits: {
        orionstarspay: { ...emptyMoney },
        chime: { ...emptyMoney },
        dollarpay: { ...emptyMoney }
      },
      withdrawals: {
        orionstarspay: { ...emptyMoney },
        chime: { ...emptyMoney },
        cashapp: { ...emptyMoney },
        dollarpay: { ...emptyAutoWithdraw }
      }
    })
    setPaymentSummaryLoading(false)
    setPaymentsStartDate('')
    setPaymentsEndDate('')
    setAppliedPaymentsStartDate('')
    setAppliedPaymentsEndDate('')
    getStore(id)
      .then(setStore)
      .catch((err) => {
        toast.error(err.message || 'Failed to load store')
        setStore(null)
      })
      .finally(() => setLoading(false))
  }, [id])

  const dc = store?.distributorCode
  const sc = store?.storeCode

  const loadCustomers = useCallback(() => {
    if (!store || !showUsers || !dc || !sc) return
    setUsersLoading(true)
    const params = {
      page: usersPage,
      limit: USERS_PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      distributorCode: dc,
      storeCode: sc
    }
    getUsers(params)
      .then((res) => setUsersData({ list: res.list || [], total: res.total || 0 }))
      .catch((err) => {
        toast.error(err.message || 'Failed to load customers')
        setUsersData({ list: [], total: 0 })
      })
      .finally(() => setUsersLoading(false))
  }, [store, showUsers, dc, sc, usersPage, toast])

  const loadStaff = useCallback(() => {
    if (!store) return
    setStaffLoading(true)
    getStoreAdmins(id)
      .then((res) => setStaffList(res.list || []))
      .catch((err) => {
        toast.error(err.message || 'Failed to load staff')
        setStaffList([])
      })
      .finally(() => setStaffLoading(false))
  }, [store, id, toast])

  const handleToggleStaffActive = async (staff) => {
    if (!canManageStoreStaff) return
    const next = !staff.isActive
    const ok = await confirm({
      title: next ? 'Activate access?' : 'Deactivate access?',
      message: next
        ? `Allow "${staff.email || staff.username}" to sign in?`
        : `Block "${staff.email || staff.username}" from signing in?`,
      confirmLabel: next ? 'Activate' : 'Deactivate',
      variant: next ? 'primary' : 'danger'
    })
    if (!ok) return
    setStaffTogglingId(staff.userId)
    const request = staff.isPrimaryOwner
      ? updateStore(staff.userId, { isActive: next })
      : updateStoreStaff(staff.userId, { isActive: next })
    request
      .then(() => {
        toast.success(next ? 'Access activated.' : 'Access deactivated.')
        loadStaff()
        if (staff.isPrimaryOwner) {
          getStore(id).then(setStore).catch(() => {})
        }
      })
      .catch((err) => toast.error(err.message || 'Update failed'))
      .finally(() => setStaffTogglingId(null))
  }

  const staffEditPath = (s) => {
    if (s.isPrimaryOwner) return `/stores/${s.userId}/edit`
    const q = new URLSearchParams()
    if (dc) q.set('distributorCode', dc)
    if (sc) q.set('storeCode', sc)
    const qs = q.toString()
    return `/store-staff/${s.userId}/edit${qs ? `?${qs}` : ''}`
  }

  const loadWithdrawals = useCallback(() => {
    if (!store || !showWithdrawals || !sc) return
    setWdLoading(true)
    const params = {
      page: wdPage,
      limit: WD_PAGE_SIZE,
      storeCode: sc
    }
    if (isMasterAdmin && dc) params.distributorCode = dc
    getWithdrawalRequests(params)
      .then((res) => setWdData({ list: res.list || [], total: res.total || 0 }))
      .catch((err) => {
        toast.error(err.message || 'Failed to load withdrawals')
        setWdData({ list: [], total: 0 })
      })
      .finally(() => setWdLoading(false))
  }, [store, showWithdrawals, sc, dc, wdPage, isMasterAdmin, toast])

  const loadGames = useCallback(() => {
    if (!store || !showGames || !sc) return
    setGamesLoading(true)
    getGames()
      .then((res) => {
        const all = res.list || []
        setGamesList(all.filter((g) => String(g.addedByStoreCode || '').trim() === String(sc).trim()))
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load games')
        setGamesList([])
      })
      .finally(() => setGamesLoading(false))
  }, [store, showGames, sc, toast])

  const loadDeposits = useCallback(() => {
    if (!store || !showDeposits || !sc) return
    setDepLoading(true)
    const params = {
      page: depPage,
      limit: DEP_PAGE_SIZE,
      storeCode: sc
    }
    if (isMasterAdmin && dc) params.distributorCode = dc
    getDepositRequests(params)
      .then((res) => setDepData({ list: res.list || [], total: res.total || 0 }))
      .catch((err) => {
        toast.error(err.message || 'Failed to load deposits')
        setDepData({ list: [], total: 0 })
      })
      .finally(() => setDepLoading(false))
  }, [store, showDeposits, sc, dc, depPage, isMasterAdmin, toast])

  const loadPaymentSummary = useCallback(() => {
    if (!store || !sc || !showPaymentTotals) return
    setPaymentSummaryLoading(true)
    const baseParams = { page: 1, limit: 1, storeCode: sc }
    if (isMasterAdmin && dc) baseParams.distributorCode = dc
    if (appliedPaymentsStartDate) baseParams.startDate = appliedPaymentsStartDate
    if (appliedPaymentsEndDate) baseParams.endDate = appliedPaymentsEndDate
    // PAYMENT_TOTALS grants both deposit and withdrawal summary amounts
    const depositsReq = (showDeposits || showPaymentTotals) ? getDepositRequests(baseParams) : Promise.resolve(null)
    const withdrawalsReq = (showWithdrawals || showPaymentTotals) ? getWithdrawalRequests(baseParams) : Promise.resolve(null)
    Promise.all([depositsReq, withdrawalsReq])
      .then(([depRes, wdRes]) => {
        setPaymentSummary({
          deposits: {
            orionstarspay: moneyPair(depRes?.summary?.orionstarspay),
            chime: moneyPair(depRes?.summary?.chime),
            dollarpay: moneyPair(depRes?.summary?.dollarpay)
          },
          withdrawals: {
            orionstarspay: moneyPair(wdRes?.summary?.orionstarspay),
            chime: moneyPair(wdRes?.summary?.chime),
            cashapp: moneyPair(wdRes?.summary?.cashapp),
            dollarpay: autoWithdrawPair(wdRes?.summary?.dollarpay)
          }
        })
      })
      .catch(() => {
        setPaymentSummary({
          deposits: {
            orionstarspay: { ...emptyMoney },
            chime: { ...emptyMoney },
            dollarpay: { ...emptyMoney }
          },
          withdrawals: {
            orionstarspay: { ...emptyMoney },
            chime: { ...emptyMoney },
            cashapp: { ...emptyMoney },
            dollarpay: { ...emptyAutoWithdraw }
          }
        })
      })
      .finally(() => setPaymentSummaryLoading(false))
  }, [store, sc, dc, isMasterAdmin, showDeposits, showWithdrawals, showPaymentTotals, appliedPaymentsStartDate, appliedPaymentsEndDate])

  useEffect(() => {
    if (tab !== 'customers' || !showUsers) return
    loadCustomers()
  }, [tab, showUsers, loadCustomers])

  useEffect(() => {
    if (tab !== 'staff') return
    loadStaff()
  }, [tab, loadStaff])

  useEffect(() => {
    if (tab !== 'withdrawals' || !showWithdrawals) return
    loadWithdrawals()
  }, [tab, showWithdrawals, loadWithdrawals])

  useEffect(() => {
    if (tab !== 'games' || !showGames) return
    loadGames()
  }, [tab, showGames, loadGames])

  useEffect(() => {
    if (tab !== 'deposits' || !showDeposits) return
    loadDeposits()
  }, [tab, showDeposits, loadDeposits])

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) {
      setTab(tabs[0]?.id || 'overview')
    }
  }, [tabs, tab])

  useEffect(() => {
    loadPaymentSummary()
  }, [loadPaymentSummary])

  const titleCode = store?.storeCode || store?.username || store?.email || 'Store'
  const avatarLetter = (titleCode && String(titleCode).charAt(0).toUpperCase()) || '?'
  const todayStr = new Date().toISOString().slice(0, 10)

  const usersTotalPages = Math.max(1, Math.ceil(usersData.total / USERS_PAGE_SIZE) || 1)
  const wdTotalPages = Math.max(1, Math.ceil(wdData.total / WD_PAGE_SIZE) || 1)
  const depTotalPages = Math.max(1, Math.ceil(depData.total / DEP_PAGE_SIZE) || 1)

  if (loading) {
    return (
      <div className="user-detail-page store-detail-page">
        <div className="ud-breadcrumb">
          <Link to="/stores">Stores</Link>
          <span className="ud-breadcrumb-sep" aria-hidden>/</span>
          <span className="ud-breadcrumb-current">Loading…</span>
        </div>
        <div className="ud-hero ud-hero--skeleton" aria-busy="true" />
        <div className="page-loading">Loading store…</div>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="user-detail-page store-detail-page">
        <div className="ud-breadcrumb">
          <Link to="/stores">Stores</Link>
          <span className="ud-breadcrumb-sep" aria-hidden>/</span>
          <span className="ud-breadcrumb-current">Not found</span>
        </div>
        <div className="store-detail-empty">
          <p>This store could not be loaded.</p>
          <Link to="/stores" className="admin-btn admin-btn-secondary">Back to stores</Link>
        </div>
      </div>
    )
  }

  const siteUrl = (store.userSiteUrl && String(store.userSiteUrl).trim()) || ''

  return (
    <div className="user-detail-page store-detail-page">
      <div className="store-detail-toolbar">
        <div className="ud-breadcrumb">
          <Link to="/stores">Stores</Link>
          <span className="ud-breadcrumb-sep" aria-hidden>/</span>
          <span className="ud-breadcrumb-current" title={titleCode}>{titleCode}</span>
        </div>
        <div className="store-detail-actions">
          <Link to={`/stores/${id}/edit`} className="admin-btn admin-btn-primary">Edit store</Link>
          <Link to="/stores" className="admin-btn admin-btn-secondary">Back to list</Link>
        </div>
      </div>

      <div className="ud-hero">
        <div className="ud-hero-avatar" aria-hidden>{avatarLetter}</div>
        <div className="ud-hero-body">
          <div className="ud-hero-title-row">
            <h1 className="ud-hero-title">{displayStr(store.storeCode) !== '—' ? store.storeCode : 'Store account'}</h1>
            <span className={`ud-badge ${store.isActive ? 'ud-badge--success' : 'ud-badge--danger'}`}>
              {store.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="ud-hero-meta">
            Primary store admin · User ID <code>{store.userId}</code>
            {isMasterAdmin && store.distributorCode && (
              <>
                {' · '}
                Distributor <code>{store.distributorCode}</code>
              </>
            )}
          </p>
          <div className="ud-hero-balances">
            <div className="ud-mini-stat">
              <span className="ud-mini-stat-label">Customers</span>
              <span className="ud-mini-stat-value">{store.userCount ?? 0}</span>
            </div>
            <div className="ud-mini-stat">
              <span className="ud-mini-stat-label">Store code</span>
              <span className="ud-mini-stat-value">{displayStr(store.storeCode)}</span>
            </div>
            {isMasterAdmin && (
              <div className="ud-mini-stat">
                <span className="ud-mini-stat-label">Distributor</span>
                <span className="ud-mini-stat-value">{displayStr(store.distributorCode)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ud-tabs-wrap store-detail-tabs-wrap">
        <div className="ud-tabs" role="tablist" aria-label="Store sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="ud-tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
      <div className="store-detail-grid">
        <section className="ud-section">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Account &amp; contact</h2>
            <p className="ud-section-desc">Login identity and profile for the primary store administrator.</p>
          </header>
          <div className="ud-section-body">
            <dl className="ud-dl-grid">
              <div className="ud-dl-item">
                <dt>Email</dt>
                <dd>{displayStr(store.email)}</dd>
              </div>
              <div className="ud-dl-item">
                <dt>Username</dt>
                <dd>{displayStr(store.username)}</dd>
              </div>
              <div className="ud-dl-item">
                <dt>First name</dt>
                <dd>{displayStr(store.firstName)}</dd>
              </div>
              <div className="ud-dl-item">
                <dt>Last name</dt>
                <dd>{displayStr(store.lastName)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="ud-section">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Store configuration</h2>
            <p className="ud-section-desc">Public URL, integrations, and identifiers used across the platform.</p>
          </header>
          <div className="ud-section-body">
            <dl className="ud-dl-grid">
              <div className="ud-dl-item ud-dl-item--full">
                <dt>Customer site URL</dt>
                <dd>
                  {siteUrl ? (
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="store-detail-external-link">
                      {siteUrl}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="ud-dl-item">
                <dt>Golden Dragon moneybox (drawer)</dt>
                <dd>{store.drawer != null && store.drawer !== '' ? String(store.drawer) : '—'}</dd>
              </div>
              <div className="ud-dl-item ud-dl-item--full">
                <dt>Account type</dt>
                <dd>Primary store owner — manages this store&apos;s dashboard, staff, and customer-facing settings.</dd>
              </div>
            </dl>
          </div>
        </section>

        {canEditStoreSocialLinks && store?.userId && (
          <section className="ud-section store-detail-section-span">
            <header className="ud-section-header">
              <h2 className="ud-section-title">Social media links</h2>
              <p className="ud-section-desc">
                Facebook, Facebook Group, Messenger, and WhatsApp URLs shown on this store&apos;s public landing page.
              </p>
            </header>
            <div className="ud-section-body">
              <SocialLinksEditor
                storeId={store.userId}
                title="Store landing page icons"
                description="Super admin and technical staff can update links for any store. Leave blank to hide an icon."
              />
            </div>
          </section>
        )}

        {canEditStoreLandingPaymentLinks && store?.userId && (
          <section className="ud-section store-detail-section-span">
            <header className="ud-section-header">
              <h2 className="ud-section-title">Landing payment links</h2>
              <p className="ud-section-desc">
                Deposit and withdrawal dropdown buttons shown below the header on this store&apos;s public landing page.
              </p>
            </header>
            <div className="ud-section-body">
              <LandingPaymentLinksEditor
                storeId={store.userId}
                title="Store landing page deposit & withdrawal"
                description="Super admin and technical staff can add, update, or delete deposit and withdrawal links for any store."
              />
            </div>
          </section>
        )}

        <section className="ud-section store-detail-section-span">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Timestamps</h2>
            <p className="ud-section-desc">When this store record was created and last updated.</p>
          </header>
          <div className="ud-section-body">
            <dl className="ud-dl-grid">
              <div className="ud-dl-item">
                <dt>Created</dt>
                <dd>{formatDateTime(store.createdAt)}</dd>
              </div>
              <div className="ud-dl-item">
                <dt>Last updated</dt>
                <dd>{formatDateTime(store.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {showPaymentTotals && (
        <section className="ud-section store-detail-section-span">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Payment totals</h2>
            <p className="ud-section-desc">Money in (deposits) and money out (withdrawals). Manual = staff pays by hand. Automatic = provider pays.</p>
            <div className="store-detail-payments-filter-row">
              <label>
                Date from
                <input
                  type="date"
                  value={paymentsStartDate}
                  onChange={(e) => {
                    const next = e.target.value
                    setPaymentsStartDate(next)
                    if (paymentsEndDate && next && paymentsEndDate < next) {
                      setPaymentsEndDate(next)
                    }
                  }}
                  max={paymentsEndDate && paymentsEndDate < todayStr ? paymentsEndDate : todayStr}
                />
              </label>
              <label>
                Date to
                <input
                  type="date"
                  value={paymentsEndDate}
                  onChange={(e) => {
                    const next = e.target.value
                    setPaymentsEndDate(next)
                    if (paymentsStartDate && next && next < paymentsStartDate) {
                      setPaymentsStartDate(next)
                    }
                  }}
                  min={paymentsStartDate || undefined}
                  max={todayStr}
                />
              </label>
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-primary"
                onClick={() => {
                  setAppliedPaymentsStartDate(paymentsStartDate)
                  setAppliedPaymentsEndDate(paymentsEndDate)
                }}
              >
                Apply filter
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                onClick={() => {
                  setPaymentsStartDate('')
                  setPaymentsEndDate('')
                  setAppliedPaymentsStartDate('')
                  setAppliedPaymentsEndDate('')
                }}
                disabled={!paymentsStartDate && !paymentsEndDate}
              >
                Clear
              </button>
            </div>
          </header>
          <div className="ud-section-body">
            <div className="store-detail-payments-block">
              <h3 className="store-detail-payments-block-title">Money in — Deposits</h3>
              <div className="store-detail-payment-grid">
                <article className="store-detail-payment-card">
                  <div className="store-detail-payment-card-head">
                    <h3>OrionStarPay</h3>
                    <span className="store-detail-payment-mode store-detail-payment-mode-auto">Automatic</span>
                  </div>
                  <p className="store-detail-payment-sub">Card / Cash App / Apple Pay / Google Pay</p>
                  <p><span>Completed</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.orionstarspay.completedAmount)}</strong></p>
                  <p><span>Completed fees</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.orionstarspay.completedFee)}</strong></p>
                  <p><span>Pending</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.orionstarspay.pendingAmount)}</strong></p>
                </article>
                <article className="store-detail-payment-card">
                  <div className="store-detail-payment-card-head">
                    <h3>Chime</h3>
                    <span className="store-detail-payment-mode store-detail-payment-mode-manual">Manual</span>
                  </div>
                  <p className="store-detail-payment-sub">Staff confirms payment by hand</p>
                  <p><span>Completed</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.chime.completedAmount)}</strong></p>
                  <p><span>Completed fees</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.chime.completedFee)}</strong></p>
                  <p><span>Pending</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.chime.pendingAmount)}</strong></p>
                </article>
                <article className="store-detail-payment-card store-detail-payment-card-highlight">
                  <div className="store-detail-payment-card-head">
                    <h3>Dpay</h3>
                    <span className="store-detail-payment-mode store-detail-payment-mode-auto">Automatic</span>
                  </div>
                  <p className="store-detail-payment-sub">Cash App / Apple Pay / Google Pay</p>
                  <p><span>Completed</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.dollarpay.completedAmount)}</strong></p>
                  <p><span>Completed fees</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.dollarpay.completedFee)}</strong></p>
                  <p><span>Waiting for payment</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.deposits.dollarpay.pendingAmount)}</strong></p>
                </article>
              </div>
            </div>

            <div className="store-detail-payments-block">
              <h3 className="store-detail-payments-block-title">Money out — Withdrawals</h3>
              <div className="store-detail-payment-grid">
                <article className="store-detail-payment-card">
                  <div className="store-detail-payment-card-head">
                    <h3>Chime</h3>
                    <span className="store-detail-payment-mode store-detail-payment-mode-manual">Manual</span>
                  </div>
                  <p className="store-detail-payment-sub">Staff sends Chime by hand</p>
                  <p><span>Completed</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.chime.completedAmount)}</strong></p>
                  <p><span>Completed fees</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.chime.completedFee)}</strong></p>
                  <p><span>Pending / Processing</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.chime.pendingAmount)}</strong></p>
                </article>
                <article className="store-detail-payment-card">
                  <div className="store-detail-payment-card-head">
                    <h3>Cash App</h3>
                    <span className="store-detail-payment-mode store-detail-payment-mode-manual">Manual</span>
                  </div>
                  <p className="store-detail-payment-sub">Staff sends Cash App by hand</p>
                  <p><span>Completed</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.cashapp.completedAmount)}</strong></p>
                  <p><span>Completed fees</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.cashapp.completedFee)}</strong></p>
                  <p><span>Pending / Processing</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.cashapp.pendingAmount)}</strong></p>
                </article>
                <article className="store-detail-payment-card store-detail-payment-card-highlight">
                  <div className="store-detail-payment-card-head">
                    <h3>Dpay</h3>
                    <span className="store-detail-payment-mode store-detail-payment-mode-auto">Automatic</span>
                  </div>
                  <p className="store-detail-payment-sub">Paid automatically after approve</p>
                  <p><span>Completed (total)</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.dollarpay.completedAmount)}</strong></p>
                  <p><span>Completed fees</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.dollarpay.completedFee)}</strong></p>
                  <p><span>Still waiting (total)</span><strong>{paymentSummaryLoading ? 'Loading…' : formatCurrency(paymentSummary.withdrawals.dollarpay.pendingAmount)}</strong></p>
                  <div className="store-detail-payment-breakdown">
                    <p className="store-detail-payment-breakdown-title">By method (same totals split)</p>
                    <div className="store-detail-payment-method-row">
                      <span className="store-detail-payment-method-name">Chime</span>
                      <div className="store-detail-payment-method-amounts">
                        <p><span>Completed</span><strong>{paymentSummaryLoading ? '…' : formatCurrency(paymentSummary.withdrawals.dollarpay.chime.completedAmount)}</strong></p>
                        <p><span>Still waiting</span><strong>{paymentSummaryLoading ? '…' : formatCurrency(paymentSummary.withdrawals.dollarpay.chime.pendingAmount)}</strong></p>
                      </div>
                    </div>
                    <div className="store-detail-payment-method-row">
                      <span className="store-detail-payment-method-name">Cash App</span>
                      <div className="store-detail-payment-method-amounts">
                        <p><span>Completed</span><strong>{paymentSummaryLoading ? '…' : formatCurrency(paymentSummary.withdrawals.dollarpay.cashapp.completedAmount)}</strong></p>
                        <p><span>Still waiting</span><strong>{paymentSummaryLoading ? '…' : formatCurrency(paymentSummary.withdrawals.dollarpay.cashapp.pendingAmount)}</strong></p>
                      </div>
                    </div>
                    <div className="store-detail-payment-method-row">
                      <span className="store-detail-payment-method-name">PayPal</span>
                      <div className="store-detail-payment-method-amounts">
                        <p><span>Completed</span><strong>{paymentSummaryLoading ? '…' : formatCurrency(paymentSummary.withdrawals.dollarpay.paypal.completedAmount)}</strong></p>
                        <p><span>Still waiting</span><strong>{paymentSummaryLoading ? '…' : formatCurrency(paymentSummary.withdrawals.dollarpay.paypal.pendingAmount)}</strong></p>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
        )}
      </div>
      )}

      {tab === 'customers' && showUsers && (
        <section className="ud-section store-detail-tab-panel">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Customers</h2>
            <p className="ud-section-desc">
              End users registered under this store. Open a row for full wallet, games, and activity.
              {usersData.total > 0 && (
                <span className="store-detail-tab-meta"> · {usersData.total} total</span>
              )}
            </p>
          </header>
          <div className="ud-section-body">
            {usersLoading ? (
              <div className="page-loading">Loading customers…</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="admin-table store-detail-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        {showPlayerEmail && <th>Email</th>}
                        <th>Username</th>
                        <th>Status</th>
                        <th>Joined</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.list.length === 0 ? (
                        <tr><td colSpan={showPlayerEmail ? 6 : 5}>No customers found for this store.</td></tr>
                      ) : (
                        usersData.list.map((u) => (
                          <tr key={u.userId}>
                            <td>{u.userId}</td>
                            {showPlayerEmail && <td>{u.email ?? '—'}</td>}
                            <td>{u.username ?? '—'}</td>
                            <td>{u.isActive ? 'Active' : 'Inactive'}</td>
                            <td>{formatDateTime(u.createdAt)}</td>
                            <td>
                              <Link to={`/users/${u.userId}`} className="admin-btn admin-btn-sm admin-btn-edit">View</Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {usersData.total > USERS_PAGE_SIZE && (
                  <div className="pagination store-detail-pagination">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={usersPage <= 1}
                      onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="store-detail-page-indicator">
                      Page {usersPage} of {usersTotalPages}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={usersPage >= usersTotalPages}
                      onClick={() => setUsersPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {tab === 'staff' && (
        <section className="ud-section store-detail-tab-panel">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Staff &amp; store admins</h2>
            <p className="ud-section-desc">Primary owner and panel staff linked to this store code.</p>
            {canManageStoreStaff && dc && sc && (
              <div className="page-header-actions" style={{ marginTop: '0.75rem' }}>
                <Link
                  to={teamAccessPath({ scope: 'store', tab: 'staff', distributorCode: dc, storeCode: sc })}
                  className="admin-btn admin-btn-sm admin-btn-primary"
                >
                  Manage role and staff
                </Link>
              </div>
            )}
          </header>
          <div className="ud-section-body">
            {staffLoading ? (
              <div className="page-loading">Loading staff…</div>
            ) : (
              <div className="table-wrap">
                <table className="admin-table store-detail-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      {showStaffEmail && <th>Email</th>}
                      <th>Username</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.length === 0 ? (
                      <tr><td colSpan={showStaffEmail ? 7 : 6}>No staff accounts found.</td></tr>
                    ) : (
                      staffList.map((s) => (
                        <tr key={s.userId}>
                          <td>{s.userId}</td>
                          {showStaffEmail && <td>{s.email ?? '—'}</td>}
                          <td>{s.username ?? '—'}</td>
                          <td>{[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}</td>
                          <td>
                            {s.isPrimaryOwner ? (
                              <span className="ud-badge ud-badge--info">Primary owner</span>
                            ) : (
                              <span>{s.storeRole?.name || 'Staff'}</span>
                            )}
                          </td>
                          <td>{s.isActive ? 'Active' : 'Inactive'}</td>
                          <td>
                            {canManageStoreStaff ? (
                              <>
                                <Link to={staffEditPath(s)} className="admin-btn admin-btn-sm admin-btn-edit">
                                  {s.isPrimaryOwner ? 'Edit store' : 'Edit'}
                                </Link>
                                {' '}
                                <button
                                  type="button"
                                  className="admin-btn admin-btn-sm admin-btn-secondary"
                                  onClick={() => handleToggleStaffActive(s)}
                                  disabled={staffTogglingId === s.userId}
                                >
                                  {staffTogglingId === s.userId ? '…' : (s.isActive ? 'Deactivate' : 'Activate')}
                                </button>
                              </>
                            ) : s.isPrimaryOwner ? (
                              <Link to={`/stores/${s.userId}/edit`} className="admin-btn admin-btn-sm admin-btn-secondary">Edit store</Link>
                            ) : (
                              <span className="store-detail-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'withdrawals' && showWithdrawals && (
        <section className="ud-section store-detail-tab-panel">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Withdrawals</h2>
            <p className="ud-section-desc">
              Card/crypto wallet payouts, Speed/crypto LNURL, and manual Chime / Cash App — scoped to this store.
              {wdData.total > 0 && <span className="store-detail-tab-meta"> · {wdData.total} total</span>}
            </p>
          </header>
          <div className="ud-section-body">
            {wdLoading ? (
              <div className="page-loading">Loading withdrawals…</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="admin-table store-detail-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>User</th>
                        <th>Amount</th>
                        <th>Payment method</th>
                        <th>Provider</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {wdData.list.length === 0 ? (
                        <tr><td colSpan={7}>No withdrawals found for this store.</td></tr>
                      ) : (
                        wdData.list.map((row) => (
                          <tr key={row.uid || `${row.sourceKind}-${row.id}`}>
                            <td>{formatDateTime(row.createdAt)}</td>
                            <td>{row.user?.username || row.userId}</td>
                            <td>{formatMoneyAmount(row.amount, row.currency)}</td>
                            <td>{row.paymentMethodLabel || '—'}</td>
                            <td><code className="store-detail-provider-code">{paymentProviderDisplay(row.providerCode)}</code></td>
                            <td>{row.status || '—'}</td>
                            <td>
                              <Link to={`/users/${row.userId}`} className="admin-btn admin-btn-sm admin-btn-edit">User</Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {wdData.total > WD_PAGE_SIZE && (
                  <div className="pagination store-detail-pagination">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={wdPage <= 1}
                      onClick={() => setWdPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="store-detail-page-indicator">
                      Page {wdPage} of {wdTotalPages}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={wdPage >= wdTotalPages}
                      onClick={() => setWdPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {tab === 'games' && showGames && (
        <section className="ud-section store-detail-tab-panel">
          <header className="ud-section-header">
            <h2 className="ud-section-title">Games</h2>
            <p className="ud-section-desc">Integrations added under this store&apos;s code.</p>
          </header>
          <div className="ud-section-body">
            {gamesLoading ? (
              <div className="page-loading">Loading games…</div>
            ) : (
              <div className="table-wrap">
                <table className="admin-table store-detail-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Bot</th>
                      <th>Active</th>
                      <th>Automation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gamesList.length === 0 ? (
                      <tr><td colSpan={4}>No games configured for this store yet.</td></tr>
                    ) : (
                      gamesList.map((g) => (
                        <tr key={g.id}>
                          <td>{g.name ?? '—'}</td>
                          <td>{g.botType ?? '—'}</td>
                          <td>{g.isActive ? 'Yes' : 'No'}</td>
                          <td>{g.botOffline ? 'Manual / offline' : 'Automated'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'deposits' && showDeposits && (
        <section className="ud-section store-detail-tab-panel">
          <header className="ud-section-header">
            <h2 className="ud-section-title">User deposits</h2>
            <p className="ud-section-desc">
              Wallet top-ups for players in this store (same rules as the Deposits page).
              {depData.total > 0 && <span className="store-detail-tab-meta"> · {depData.total} total</span>}
            </p>
          </header>
          <div className="ud-section-body">
            {depLoading ? (
              <div className="page-loading">Loading deposits…</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="admin-table store-detail-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>User</th>
                        <th>Amount</th>
                        <th>Fee</th>
                        <th>Payment method</th>
                        <th>Provider</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depData.list.length === 0 ? (
                        <tr><td colSpan={7}>No deposit records found.</td></tr>
                      ) : (
                        depData.list.map((row) => (
                          <tr key={String(row.id)}>
                            <td>{formatDateTime(row.createdAt)}</td>
                            <td>
                              {row.user?.userId != null ? (
                                <Link to={`/users/${row.user.userId}`}>{row.user?.username || row.user.userId}</Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{formatCurrency(row.amount)}</td>
                            <td title={row.feePercent != null ? `${row.feePercent}% of amount (completed only)` : undefined}>
                              {row.feeCharged != null && Number.isFinite(Number(row.feeCharged))
                                ? formatCurrency(row.feeCharged)
                                : '—'}
                            </td>
                            <td>{row.methodDisplayLabel || row.method || '—'}</td>
                            <td><code className="store-detail-provider-code">{paymentProviderDisplay(row.provider)}</code></td>
                            <td>{row.status ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {depData.total > DEP_PAGE_SIZE && (
                  <div className="pagination store-detail-pagination">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={depPage <= 1}
                      onClick={() => setDepPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="store-detail-page-indicator">
                      Page {depPage} of {depTotalPages}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      disabled={depPage >= depTotalPages}
                      onClick={() => setDepPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
