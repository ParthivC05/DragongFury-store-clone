import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { getUsersFilterOptions } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { ADMIN_FEATURE_KEYS, STORE_FEATURE_KEYS, canAccessAdminFeature, canAccessFeature } from '../constants/permissions'
import { ROLES } from '../constants/roles'
import { teamAccessPath } from '../utils/teamAccessPaths'
import AdminRoles from './AdminRoles'
import AdminStaff from './AdminStaff'
import StoreRoles from './StoreRoles'
import StoreStaff from './StoreStaff'
import './TeamAccess.css'
import './Users.css'

const SCOPE_PLATFORM = 'platform'
const SCOPE_STORE = 'store'
const PLATFORM_VALUE = 'platform'

function storeOptionValue(distributorCode, storeCode) {
  return `${distributorCode}||${storeCode}`
}

function parseStoreOptionValue(value) {
  if (!value || !value.includes('||')) return { distributorCode: '', storeCode: '' }
  const [distributorCode, storeCode] = value.split('||')
  return { distributorCode: distributorCode || '', storeCode: storeCode || '' }
}

export function RedirectToTeam({ scope, tab }) {
  const [searchParams] = useSearchParams()
  return (
    <Navigate
      to={teamAccessPath({
        scope,
        tab,
        distributorCode: searchParams.get('distributorCode') || undefined,
        storeCode: searchParams.get('storeCode') || undefined
      })}
      replace
    />
  )
}

export default function TeamAccess() {
  const { user } = useAuth()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const [searchParams, setSearchParams] = useSearchParams()
  const [stores, setStores] = useState([])

  const canPlatformRoles = isMaster && canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE)
  const canPlatformStaff = isMaster && canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)
  const canPlatform = canPlatformRoles || canPlatformStaff
  const canStoreTeams = isMaster
    ? canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)
    : (canAccessFeature(user, STORE_FEATURE_KEYS.STORE_ROLES_MANAGE) || canAccessFeature(user, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE))
  const canStoreRoles = isMaster
    ? canStoreTeams
    : canAccessFeature(user, STORE_FEATURE_KEYS.STORE_ROLES_MANAGE)
  const canStoreStaff = isMaster
    ? canStoreTeams
    : canAccessFeature(user, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE)

  const requestedScope = searchParams.get('scope') || ''
  const requestedTab = searchParams.get('tab') || ''
  const distributorCode = searchParams.get('distributorCode') || ''
  const storeCode = searchParams.get('storeCode') || ''

  const scope = useMemo(() => {
    if (!isMaster) return SCOPE_STORE
    if (requestedScope === SCOPE_PLATFORM && canPlatform) return SCOPE_PLATFORM
    if (requestedScope === SCOPE_STORE && canStoreTeams) return SCOPE_STORE
    if (distributorCode && storeCode && canStoreTeams) return SCOPE_STORE
    if (canStoreTeams) return SCOPE_STORE
    return SCOPE_PLATFORM
  }, [isMaster, requestedScope, canPlatform, canStoreTeams, distributorCode, storeCode])

  useEffect(() => {
    if (!isMaster || !canStoreTeams) return
    getUsersFilterOptions()
      .then((opts) => setStores(opts.stores || []))
      .catch(() => setStores([]))
  }, [isMaster, canStoreTeams])

  useEffect(() => {
    if (requestedTab !== 'roles') return
    const el = document.getElementById('team-roles')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [requestedTab, scope, distributorCode, storeCode])

  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      const left = `${a.storeCode || ''} ${a.distributorCode || ''}`.toLowerCase()
      const right = `${b.storeCode || ''} ${b.distributorCode || ''}`.toLowerCase()
      return left.localeCompare(right)
    })
  }, [stores])

  const pickerValue = scope === SCOPE_PLATFORM
    ? PLATFORM_VALUE
    : (distributorCode && storeCode ? storeOptionValue(distributorCode, storeCode) : '')
  const ready = !isMaster || scope === SCOPE_PLATFORM || Boolean(distributorCode && storeCode)
  const showPeople = scope === SCOPE_PLATFORM ? canPlatformStaff : canStoreStaff
  const showRoles = scope === SCOPE_PLATFORM ? canPlatformRoles : canStoreRoles

  const setParams = (next) => {
    const q = new URLSearchParams()
    q.set('scope', next.scope)
    if (next.tab) q.set('tab', next.tab)
    if (next.scope === SCOPE_STORE) {
      if (next.distributorCode) q.set('distributorCode', next.distributorCode)
      if (next.storeCode) q.set('storeCode', next.storeCode)
    }
    setSearchParams(q)
  }

  const onPickerChange = (value) => {
    if (value === PLATFORM_VALUE) {
      setParams({ scope: SCOPE_PLATFORM })
      return
    }
    const parsed = parseStoreOptionValue(value)
    setParams({
      scope: SCOPE_STORE,
      distributorCode: parsed.distributorCode,
      storeCode: parsed.storeCode
    })
  }

  return (
    <div className="team-access-page">
      <div className="page-header">
        <h2>Role and staff management</h2>
        <p className="page-description">
          {isMaster
            ? 'Add people, then choose what they can open. Pick a store, or manage our own admin panel.'
            : 'Add people to your store, then choose what they can open.'}
        </p>
      </div>

      {isMaster && (canPlatform || canStoreTeams) && (
        <div className="users-filters-card">
          <div className="users-filters-body">
            <div className="users-filters-row">
              <div className="users-filter-field">
                <label htmlFor="team-access-who">Who do you want to manage?</label>
                <select
                  id="team-access-who"
                  value={pickerValue}
                  onChange={(e) => onPickerChange(e.target.value)}
                  aria-label="Who do you want to manage"
                >
                  <option value="">Choose…</option>
                  {canPlatform && <option value={PLATFORM_VALUE}>Our admin panel</option>}
                  {canStoreTeams && sortedStores.map((s) => (
                    <option
                      key={`${s.distributorCode}-${s.storeCode}`}
                      value={storeOptionValue(s.distributorCode, s.storeCode)}
                    >
                      Store: {s.storeCode}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {!ready && (
        <div className="team-access-empty">Choose a store or our admin panel above.</div>
      )}

      {ready && (
        <>
          {showPeople && (
            <section className="team-access-section" id="team-people">
              <div className="team-access-section-head">
                <h3>1. People</h3>
                <p>Who can sign in. Give each person a role from the list below.</p>
              </div>
              {scope === SCOPE_PLATFORM ? <AdminStaff embedded /> : <StoreStaff embedded />}
            </section>
          )}

          {showRoles && (
            <section className="team-access-section" id="team-roles">
              <div className="team-access-section-head">
                <h3>2. What they can open</h3>
                <p>Create a role, turn pages on or off, then assign that role to a person above.</p>
              </div>
              {scope === SCOPE_PLATFORM ? <AdminRoles embedded /> : <StoreRoles embedded />}
            </section>
          )}
        </>
      )}
    </div>
  )
}
