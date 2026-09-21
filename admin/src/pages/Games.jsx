import { useState, useEffect, useRef, useMemo } from 'react'
import {
  getGames,
  getGame,
  getGameTemplates,
  createGame,
  createCustomGame,
  uploadGameImage,
  updateGame,
  changeGamePassword,
  deleteGame,
  toggleGameBotOffline,
  toggleGameManualRedeemOnly,
  getGameManualModeLogs,
  getGameBotFailureLogs,
  getGameHistory,
  getAllGameTemplates,
  getGameTemplate,
  createGameTemplate,
  updateGameTemplate,
  getStores
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import { getPresetRange, PRESETS } from '../utils/dateRange'
import './Distributors.css'
import './Users.css'
import './Games.css'
import {
  isSimpleGame,
  isAgentCredentialGame,
  usesStreamlitTemplateFields,
  usesVegasXTemplateFields,
  usesOrionStarsTerminalTemplateFields,
  usesOrionStarsBotAutomationTemplateFields,
  usesFirekirinTerminalTemplateFields,
  usesFirekirinBotAutomationTemplateFields,
  usesMilkywayTerminalTemplateFields,
  usesMilkywayBotAutomationTemplateFields,
  usesGameroomAgentTemplateFields,
  usesGameroomBotAutomationTemplateFields,
  usesCashmachineAgentTemplateFields,
  usesCashmachineBotAutomationTemplateFields,
  isOrionStarsTerminalGame,
  isOrionStarsBotAutomationGame,
  isOrionStarsGame,
  isFirekirinTerminalGame,
  isFirekirinBotAutomationGame,
  isFirekirinGame,
  isMilkywayTerminalGame,
  isMilkywayBotAutomationGame,
  isMilkywayGame,
  isGameroomAgentGame,
  isGameroomBotAutomationGame,
  isGameroomGame,
  isCashmachineAgentGame,
  isCashmachineBotAutomationGame,
  isCashmachineGame,
  isMafiaAgentGame,
  usesMafiaAgentTemplateFields,
  isGameVaultAgentGame,
  isGameVaultBotAutomationGame,
  isGameVaultFamilyGame,
  isJuwa20AgentGame,
  isJuwa20BotAutomationGame,
  isJuwa20FamilyGame,
  isJuwaAgentGame,
  isJuwaBotAutomationGame,
  isJuwaNewBotGame,
  isJuwaFamilyGame,
  isJuwaStoreGame,
  normalizeJuwaApiMode,
  isPandamasterNewBotGame,
  isPandamasterLegacyBotGame,
  isPandamasterStoreGame,
  normalizePandamasterApiMode,
  isVegasXCashierGame,
  isVegasXGame,
  formatGameDisplayName,
  formatTemplateOptionLabel,
  getGameApiModeLabel,
  resolveAgentTemplateGameKey,
  isCustomManualGame
} from '../utils/gameIntegration.helpers'

const isGoldenDragonTemplate = (t) => {
  if (!t) return false
  const compact = (s) => String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  return [t.name, t.gameKey].filter(Boolean).some((s) =>
    compact(s) === 'goldendragon' || compact(s) === 'goldendragonnewbot' || compact(s) === 'goldendragon2'
  )
}

const isGoldenDragonGameName = (name) => {
  const compact = String(name || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  return compact === 'goldendragon' || compact === 'goldendragonnewbot' || compact === 'goldendragon2'
}

const initialForm = {
  storeCode: '',
  gameTemplateId: '',
  juwaApiMode: '',
  gameUsername: '',
  gamePassword: '',
  appId: '',
  appSecret: '',
  agentId: '',
  apiSecretKey: '',
  moneybox: '',
  kioskId: '',
  minWithdrawalLimit: 0,
  maxWithdrawalLimit: 500,
  minDepositLimit: 0,
  maxDepositLimit: 0,
  depositDiscountPercent: 0
}

const initialCustomForm = {
  storeCode: '',
  gameName: '',
  gameLink: '',
  imageUrl: '',
  minWithdrawalLimit: 0,
  maxWithdrawalLimit: 500,
  minDepositLimit: 0,
  maxDepositLimit: 0,
  depositDiscountPercent: 0
}

function normalizeGameStoreOption(s) {
  const storeCode = String(s?.storeCode || s?.store_code || '').trim()
  const distributorCode = String(s?.distributorCode || s?.distributor_code || '').trim()
  const drawer = s?.drawer != null ? Number(s.drawer) : NaN
  return {
    storeCode,
    distributorCode,
    drawer: Number.isInteger(drawer) && drawer >= 1 ? drawer : null,
    label: storeCode || String(s?.username || s?.email || '').trim() || 'Unknown store'
  }
}

const initialEditForm = {
  name: '',
  platformGameUrl: '',
  imageUrl: '',
  gameUsername: '',
  gamePassword: '',
  appId: '',
  appSecret: '',
  agentId: '',
  apiSecretKey: '',
  gameKey: '',
  gameTemplateId: '',
  orionStarsApiMode: '',
  orionStarsGameTemplateId: '',
  firekirinApiMode: '',
  firekirinGameTemplateId: '',
  milkywayApiMode: '',
  milkywayGameTemplateId: '',
  gameroomApiMode: '',
  gameroomGameTemplateId: '',
  cashmachineApiMode: '',
  cashmachineGameTemplateId: '',
  gameVaultApiMode: '',
  gameVaultGameTemplateId: '',
  juwa20ApiMode: '',
  juwa20GameTemplateId: '',
  juwaApiMode: '',
  juwaGameTemplateId: '',
  pandamasterApiMode: '',
  pandamasterGameTemplateId: '',
  kioskId: '',
  minWithdrawalLimit: 0,
  maxWithdrawalLimit: 500,
  minDepositLimit: 0,
  maxDepositLimit: 0,
  depositDiscountPercent: 0,
  isActive: true,
  displayOrder: 0
}

const defaultManualLogsDateRange = getPresetRange(PRESETS.TODAY)
const defaultGameHistoryDateRange = getPresetRange(PRESETS.TODAY)
const defaultFailureLogsDateRange = getPresetRange(PRESETS.TODAY)

const BOT_FAILURE_OPERATION_LABELS = {
  topup: 'Deposit',
  redeem: 'Redeem',
  register: 'Register',
  withdrawal: 'Withdrawal',
  link_account: 'Link account',
  forgot_password: 'Forgot password'
}

function formatFailureOperation(operation) {
  return BOT_FAILURE_OPERATION_LABELS[operation] || operation || '—'
}

function formatBotApiResponse(value) {
  if (value == null || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}

function formatFailureGameName(row) {
  const name = row.gameName || '—'
  if (row.failureSequenceNumber != null && row.failureSequenceNumber > 0) {
    return `${name} (${row.failureSequenceNumber})`
  }
  return name
}

function ManualLogReasonCell({ text }) {
  if (!text || String(text).trim() === '') return '—'

  const normalized = String(text)
  const blocks = normalized.includes('── Failure')
    ? normalized.split(/\n\n+(?=── Failure)/).filter(Boolean)
    : [normalized]

  return (
    <div className="games-manual-log-reason-list">
      {blocks.map((block, index) => (
        <pre key={index} className="games-manual-log-reason-block">
          {block.trim()}
        </pre>
      ))}
    </div>
  )
}

const GAME_HISTORY_ACTION_OPTIONS = [
  { value: 'all', label: 'All changes' },
  { value: 'created', label: 'Game created' },
  { value: 'updated', label: 'Field updated' },
  { value: 'deleted', label: 'Game deleted' },
  { value: 'mode_switched', label: 'Automation mode' },
  { value: 'password_changed', label: 'Password changed' },
  { value: 'redeem_mode_switched', label: 'Manual redeem' }
]

const initialConfigForm = {
  name: '',
  gameKey: '',
  streamlitToken: '',
  botBaseUrl: '',
  gameLink: '',
  isActive: true
}

const LEGACY_PASSWORD_MASK = '••••••••'
const LEGACY_PASSWORD_CHANGED = '[changed]'

function isGameHistoryPasswordRow(row) {
  return row.action === 'password_changed' || row.fieldName === 'botPassword'
}

function hasGameHistoryPasswordDisplay(value) {
  return value != null && String(value).trim() !== '' && value !== '—'
}

function PasswordEyeIcon({ visible }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function BotFailureCredentialsCell({ botUsername, botPassword, visible, onToggle }) {
  if (!botUsername && !botPassword) return '—'
  const hasSecret = !!(botUsername || botPassword)

  return (
    <div className="games-failure-credentials-cell">
      <div className="games-failure-credential-line">
        <span className="games-failure-cred-label">Username:</span>
        <span className="games-view-password-value">
          {!botUsername ? '—' : visible ? botUsername : LEGACY_PASSWORD_MASK}
        </span>
      </div>
      <div className="games-failure-credential-line games-view-password-cell">
        <span className="games-failure-cred-label">Password:</span>
        <span className="games-view-password-value">
          {!botPassword ? '—' : visible ? botPassword : LEGACY_PASSWORD_MASK}
        </span>
        {hasSecret ? (
          <button
            type="button"
            className="games-view-password-toggle"
            onClick={onToggle}
            aria-label={visible ? 'Hide credentials' : 'Show credentials'}
            title={visible ? 'Hide credentials' : 'Show credentials'}
          >
            <PasswordEyeIcon visible={visible} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function Games() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const showDepositDiscountColumn = true
  const showEditDepositDiscount = true
  const showAddDepositDiscount = true
  const showCustomDepositDiscount = true
  /** Super admin: master_admin without admin_role_id — store games view-only in UI. */
  const isFullPlatformSuperAdmin = isMasterAdmin && user?.adminRoleId == null
  /** Platform technical staff: master_admin with an assigned admin role. */
  const isTechnicalStaff = isMasterAdmin && user?.adminRoleId != null
  const canMutateGameRow = (g) => {
    if (typeof g.mutationsAllowed === 'boolean') return g.mutationsAllowed
    if (!isMasterAdmin) return true
    const byStore = g?.addedByStoreCode != null && String(g.addedByStoreCode).trim() !== ''
    if (!byStore) return true
    return !isFullPlatformSuperAdmin
  }

  const [activeTab, setActiveTab] = useState('games') // 'games' | 'configs' | 'manualLogs' | 'gameHistory' | 'failureLogs'

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' | 'add-custom' | 'edit' | 'view'
  const [editingId, setEditingId] = useState(null)
  const [viewingGame, setViewingGame] = useState(null)
  const [viewGameLoading, setViewGameLoading] = useState(false)
  const [showGamePassword, setShowGamePassword] = useState(false)
  const [showAddGamePassword, setShowAddGamePassword] = useState(false)
  const [showAddAppSecret, setShowAddAppSecret] = useState(false)
  const [showAddApiSecretKey, setShowAddApiSecretKey] = useState(false)
  const [editGameLoading, setEditGameLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [customForm, setCustomForm] = useState(initialCustomForm)
  const [uploadingGameImage, setUploadingGameImage] = useState(false)
  const [editForm, setEditForm] = useState(initialEditForm)
  const [gameTemplates, setGameTemplates] = useState([])
  const [storeOptions, setStoreOptions] = useState([])
  const [storeFilter, setStoreFilter] = useState('all')
  const [gameFilter, setGameFilter] = useState('all')
  const [automationModeFilter, setAutomationModeFilter] = useState('all')
  const canFilterByPlatformRole = isTechnicalStaff || isFullPlatformSuperAdmin

  // Game configs tab state (master_admin only)
  const [configList, setConfigList] = useState([])
  const [configLoading, setConfigLoading] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [configModalMode, setConfigModalMode] = useState('add')
  const [configEditingId, setConfigEditingId] = useState(null)
  const [configSaving, setConfigSaving] = useState(false)
  const [configForm, setConfigForm] = useState(initialConfigForm)
  const addGameSubmittingRef = useRef(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [changePasswordGame, setChangePasswordGame] = useState(null)
  const [changePasswordValue, setChangePasswordValue] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [changePasswordSaving, setChangePasswordSaving] = useState(false)
  const [showChangePasswordValue, setShowChangePasswordValue] = useState(false)

  const MANUAL_LOG_PAGE_SIZES = [10, 25, 50]
  const [manualLogs, setManualLogs] = useState({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 })
  const [manualLogsLoading, setManualLogsLoading] = useState(false)
  const [manualLogsStoreFilter, setManualLogsStoreFilter] = useState('all')
  const [manualLogsGameFilter, setManualLogsGameFilter] = useState('all')
  const [manualLogsStartDate, setManualLogsStartDate] = useState(defaultManualLogsDateRange.startDate)
  const [manualLogsEndDate, setManualLogsEndDate] = useState(defaultManualLogsDateRange.endDate)
  const [manualLogPasswordVisible, setManualLogPasswordVisible] = useState({})
  const [gameHistoryPasswordVisible, setGameHistoryPasswordVisible] = useState({})

  const [gameHistory, setGameHistory] = useState({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 })
  const [gameHistoryLoading, setGameHistoryLoading] = useState(false)
  const [gameHistoryStoreFilter, setGameHistoryStoreFilter] = useState('all')
  const [gameHistoryGameFilter, setGameHistoryGameFilter] = useState('all')
  const [gameHistoryActionFilter, setGameHistoryActionFilter] = useState('all')
  const [gameHistoryStartDate, setGameHistoryStartDate] = useState(defaultGameHistoryDateRange.startDate)
  const [gameHistoryEndDate, setGameHistoryEndDate] = useState(defaultGameHistoryDateRange.endDate)

  const [failureLogs, setFailureLogs] = useState({
    rows: [],
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0
  })
  const [failureLogsLoading, setFailureLogsLoading] = useState(false)
  const [failureLogsStoreFilter, setFailureLogsStoreFilter] = useState('all')
  const [failureLogsGameFilter, setFailureLogsGameFilter] = useState('all')
  const [failureLogsStartDate, setFailureLogsStartDate] = useState(defaultFailureLogsDateRange.startDate)
  const [failureLogsEndDate, setFailureLogsEndDate] = useState(defaultFailureLogsDateRange.endDate)
  const [failureLogsCredentialsVisible, setFailureLogsCredentialsVisible] = useState({})

  const loadGames = () => {
    setLoading(true)
    getGames()
      .then((data) => setList(data.list || []))
      .catch((err) => {
        toast.error(err.message || 'Failed to load games')
        setList([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadGames()
  }, [])

  useEffect(() => {
    if (!isMasterAdmin) {
      setStoreOptions([])
      return
    }
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((res) => {
        const unique = new Map()
        ;(res?.list || []).forEach((row) => {
          const norm = normalizeGameStoreOption(row)
          if (!norm.storeCode) return
          const key = norm.distributorCode ? `${norm.distributorCode}:${norm.storeCode}` : norm.storeCode
          if (!unique.has(key)) unique.set(key, norm)
        })
        setStoreOptions([...unique.values()].sort((a, b) => a.label.localeCompare(b.label)))
      })
      .catch(() => setStoreOptions([]))
  }, [isMasterAdmin])

  const loadConfigs = () => {
    setConfigLoading(true)
    getAllGameTemplates()
      .then((data) => setConfigList(data.list || []))
      .catch((err) => {
        toast.error(err.message || 'Failed to load game configs')
        setConfigList([])
      })
      .finally(() => setConfigLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'configs' && isMasterAdmin) loadConfigs()
  }, [activeTab, isMasterAdmin])

  const loadManualModeLogs = () => {
    if (!isTechnicalStaff) return
    setManualLogsLoading(true)
    const params = { page: manualLogs.page, limit: manualLogs.limit }
    if (manualLogsStoreFilter && manualLogsStoreFilter !== 'all') {
      params.storeCode = manualLogsStoreFilter
    }
    if (manualLogsGameFilter && manualLogsGameFilter !== 'all') {
      params.gameName = manualLogsGameFilter
    }
    if (manualLogsStartDate) params.startDate = manualLogsStartDate
    if (manualLogsEndDate) params.endDate = manualLogsEndDate
    getGameManualModeLogs(params)
      .then((data) => {
        setManualLogs({
          rows: data.rows || [],
          total: data.total || 0,
          page: data.page || 1,
          limit: data.limit || 25,
          totalPages: data.totalPages || 0
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load manual mode logs')
        setManualLogs({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 })
      })
      .finally(() => setManualLogsLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'manualLogs' && isTechnicalStaff) loadManualModeLogs()
  }, [
    activeTab,
    isTechnicalStaff,
    manualLogs.page,
    manualLogs.limit,
    manualLogsStoreFilter,
    manualLogsGameFilter,
    manualLogsStartDate,
    manualLogsEndDate
  ])

  const loadGameHistoryRows = () => {
    if (!isTechnicalStaff) return
    setGameHistoryLoading(true)
    const params = { page: gameHistory.page, limit: gameHistory.limit }
    if (gameHistoryStoreFilter && gameHistoryStoreFilter !== 'all') {
      params.storeCode = gameHistoryStoreFilter
    }
    if (gameHistoryGameFilter && gameHistoryGameFilter !== 'all') {
      params.gameName = gameHistoryGameFilter
    }
    if (gameHistoryActionFilter && gameHistoryActionFilter !== 'all') {
      params.action = gameHistoryActionFilter
    }
    if (gameHistoryStartDate) params.startDate = gameHistoryStartDate
    if (gameHistoryEndDate) params.endDate = gameHistoryEndDate
    getGameHistory(params)
      .then((data) => {
        setGameHistory({
          rows: data.rows || [],
          total: data.total || 0,
          page: data.page || 1,
          limit: data.limit || 25,
          totalPages: data.totalPages || 0
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load game history')
        setGameHistory({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 })
      })
      .finally(() => setGameHistoryLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'gameHistory' && isTechnicalStaff) loadGameHistoryRows()
  }, [
    activeTab,
    isTechnicalStaff,
    gameHistory.page,
    gameHistory.limit,
    gameHistoryStoreFilter,
    gameHistoryGameFilter,
    gameHistoryActionFilter,
    gameHistoryStartDate,
    gameHistoryEndDate
  ])

  const loadFailureLogs = () => {
    if (!isTechnicalStaff) return
    setFailureLogsLoading(true)
    const params = { page: failureLogs.page, limit: failureLogs.limit }
    if (failureLogsStoreFilter && failureLogsStoreFilter !== 'all') {
      params.storeCode = failureLogsStoreFilter
    }
    if (failureLogsGameFilter && failureLogsGameFilter !== 'all') {
      params.gameName = failureLogsGameFilter
    }
    if (failureLogsStartDate) params.startDate = failureLogsStartDate
    if (failureLogsEndDate) params.endDate = failureLogsEndDate
    getGameBotFailureLogs(params)
      .then((data) => {
        setFailureLogs({
          rows: data.rows || [],
          total: data.total || 0,
          page: data.page || 1,
          limit: data.limit || 25,
          totalPages: data.totalPages || 0
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load bot failure logs')
        setFailureLogs({
          rows: [],
          total: 0,
          page: 1,
          limit: 25,
          totalPages: 0
        })
      })
      .finally(() => setFailureLogsLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'failureLogs' && isTechnicalStaff) loadFailureLogs()
  }, [
    activeTab,
    isTechnicalStaff,
    failureLogs.page,
    failureLogs.limit,
    failureLogsStoreFilter,
    failureLogsGameFilter,
    failureLogsStartDate,
    failureLogsEndDate
  ])

  const openModal = () => {
    setForm(initialForm)
    setShowAddGamePassword(false)
    setShowAddAppSecret(false)
    setShowAddApiSecretKey(false)
    setModalMode('add')
    setEditingId(null)
    setViewingGame(null)
    setModalOpen(true)
    getGameTemplates()
      .then((data) => setGameTemplates(data.list || []))
      .catch(() => setGameTemplates([]))
  }

  const openCustomModal = () => {
    setCustomForm(initialCustomForm)
    setUploadingGameImage(false)
    setModalMode('add-custom')
    setEditingId(null)
    setViewingGame(null)
    setModalOpen(true)
  }

  const openView = async (game) => {
    setModalMode('view')
    setEditingId(null)
    setViewingGame(null)
    setShowGamePassword(false)
    setViewGameLoading(true)
    setModalOpen(true)
    try {
      const detail = await getGame(game.id)
      setViewingGame(detail)
    } catch (err) {
      toast.error(err.message || 'Failed to load game details')
      setModalOpen(false)
      setModalMode('add')
    } finally {
      setViewGameLoading(false)
    }
  }

  const openEdit = async (game) => {
    setEditingId(game.id)
    const loadSwitchConfigs = isMasterAdmin ? getAllGameTemplates : getGameTemplates
    loadSwitchConfigs()
      .then((data) => {
        const next = data.list || []
        if (isMasterAdmin) setConfigList(next)
        setGameTemplates(next.filter((template) => template.isActive !== false))
      })
      .catch(() => {
        if (gameTemplates.length === 0 && configList.length === 0) {
          setGameTemplates([])
        }
      })
    setEditForm({
      name: game.name ?? '',
      platformGameUrl: game.platformGameUrl ?? '',
      imageUrl: game.imageUrl ?? '',
      gameUsername: game.botUsername ?? '',
      gamePassword: '',
      gameKey: game.gameKey ?? '',
      gameTemplateId: game.gameTemplateId ?? '',
      orionStarsApiMode: '',
      orionStarsGameTemplateId: '',
      firekirinApiMode: '',
      firekirinGameTemplateId: '',
      milkywayApiMode: '',
      milkywayGameTemplateId: '',
      gameroomApiMode: '',
      gameroomGameTemplateId: '',
      cashmachineApiMode: '',
      cashmachineGameTemplateId: '',
      gameVaultApiMode: '',
      gameVaultGameTemplateId: '',
      juwa20ApiMode: '',
      juwa20GameTemplateId: '',
      juwaApiMode: '',
      juwaGameTemplateId: '',
      pandamasterApiMode: '',
      pandamasterGameTemplateId: '',
      kioskId: game.kioskId != null ? String(game.kioskId) : '',
      appId: '',
      appSecret: '',
      agentId: '',
      apiSecretKey: '',
      minWithdrawalLimit: game.minWithdrawalLimit ?? 0,
      maxWithdrawalLimit: game.maxWithdrawalLimit ?? 500,
      minDepositLimit: game.minDepositLimit ?? 0,
      maxDepositLimit: game.maxDepositLimit ?? 0,
      depositDiscountPercent: game.depositDiscountPercent ?? 0,
      isActive: game.isActive !== false,
      displayOrder: game.displayOrder ?? 0
    })
    setModalMode('edit')
    setViewingGame(null)
    setModalOpen(true)
    setEditGameLoading(true)
    try {
      const detail = await getGame(game.id)
      setEditForm((prev) => ({
        ...prev,
        name: detail.name ?? prev.name,
        platformGameUrl: detail.platformGameUrl ?? prev.platformGameUrl,
        imageUrl: detail.imageUrl ?? prev.imageUrl ?? '',
        gameUsername: detail.botUsername ?? prev.gameUsername,
        gamePassword: '',
        gameKey: detail.gameKey ?? prev.gameKey ?? '',
        gameTemplateId: detail.gameTemplateId ?? prev.gameTemplateId ?? '',
        orionStarsApiMode: '',
        orionStarsGameTemplateId: '',
        firekirinApiMode: '',
        firekirinGameTemplateId: '',
        milkywayApiMode: '',
        milkywayGameTemplateId: '',
        gameroomApiMode: '',
        gameroomGameTemplateId: '',
        cashmachineApiMode: '',
        cashmachineGameTemplateId: '',
        gameVaultApiMode: '',
        gameVaultGameTemplateId: '',
        juwa20ApiMode: '',
        juwa20GameTemplateId: '',
        juwaApiMode: '',
        juwaGameTemplateId: '',
        pandamasterApiMode: '',
        pandamasterGameTemplateId: '',
        kioskId: detail.kioskId != null ? String(detail.kioskId) : '',
        appId: detail.appId ?? prev.appId ?? '',
        appSecret: detail.appSecret ?? prev.appSecret ?? '',
        agentId: detail.agentId ?? prev.agentId ?? '',
        apiSecretKey: detail.apiSecretKey ?? prev.apiSecretKey ?? '',
        minWithdrawalLimit: detail.minWithdrawalLimit ?? prev.minWithdrawalLimit,
        maxWithdrawalLimit: detail.maxWithdrawalLimit ?? prev.maxWithdrawalLimit,
        minDepositLimit: detail.minDepositLimit ?? prev.minDepositLimit,
        maxDepositLimit: detail.maxDepositLimit ?? prev.maxDepositLimit,
        depositDiscountPercent: detail.depositDiscountPercent ?? prev.depositDiscountPercent ?? 0,
        isActive: detail.isActive !== false,
        displayOrder: detail.displayOrder ?? prev.displayOrder
      }))
    } catch (err) {
      toast.error(err.message || 'Could not load game details; other fields are from the list.')
    } finally {
      setEditGameLoading(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setCustomForm(initialCustomForm)
    setUploadingGameImage(false)
    setModalMode('add')
    setForm(initialForm)
    setEditingId(null)
    setViewingGame(null)
    setShowGamePassword(false)
    setViewGameLoading(false)
    setEditGameLoading(false)
    setShowAddGamePassword(false)
    setShowAddAppSecret(false)
    setShowAddApiSecretKey(false)
    setEditForm(initialEditForm)
  }

  const getOrionStarsTemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isOrionStarsBotAutomationGame : isOrionStarsTerminalGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getFirekirinTemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isFirekirinBotAutomationGame : isFirekirinTerminalGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getMilkywayTemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isMilkywayBotAutomationGame : isMilkywayTerminalGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getGameroomTemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isGameroomBotAutomationGame : isGameroomAgentGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getCashmachineTemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isCashmachineBotAutomationGame : isCashmachineAgentGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getGameVaultTemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isGameVaultBotAutomationGame : isGameVaultAgentGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getJuwa20TemplatesForMode = (mode) => {
    const matcher = mode === 'bot' ? isJuwa20BotAutomationGame : isJuwa20AgentGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getJuwaTemplatesForMode = (mode) => {
    const matcher = normalizeJuwaApiMode(mode) === 'agent' ? isJuwaAgentGame : isJuwaBotAutomationGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const getPandamasterTemplatesForMode = (mode) => {
    const matcher = normalizePandamasterApiMode(mode) === 'newbot'
      ? isPandamasterNewBotGame
      : isPandamasterLegacyBotGame
    const byId = new Map()
    ;[...configList, ...gameTemplates].forEach((template) => {
      if (!template?.id) return
      if (template.isActive === false) return
      byId.set(String(template.id), template)
    })
    return [...byId.values()].filter((template) => matcher(template))
  }

  const isTerminalAgentGame = (ref) => isOrionStarsTerminalGame(ref) || isFirekirinTerminalGame(ref) || isMilkywayTerminalGame(ref) || isGameroomAgentGame(ref) || isCashmachineAgentGame(ref) || isMafiaAgentGame(ref)

  const handleEditChange = (e) => {
    const { name, value } = e.target
    if (name === 'isActive') {
      setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))
      return
    }
    if (name === 'minWithdrawalLimit' || name === 'maxWithdrawalLimit' || name === 'minDepositLimit' || name === 'maxDepositLimit' || name === 'depositDiscountPercent' || name === 'displayOrder') {
      setEditForm((prev) => ({ ...prev, [name]: value === '' ? '' : Number(value) }))
      return
    }
    if (name === 'orionStarsApiMode') {
      const templates = getOrionStarsTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        orionStarsApiMode: value,
        orionStarsGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'orionStarsGameTemplateId') {
      setEditForm((prev) => ({ ...prev, orionStarsGameTemplateId: value }))
      return
    }
    if (name === 'firekirinApiMode') {
      const templates = getFirekirinTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        firekirinApiMode: value,
        firekirinGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'firekirinGameTemplateId') {
      setEditForm((prev) => ({ ...prev, firekirinGameTemplateId: value }))
      return
    }
    if (name === 'milkywayApiMode') {
      const templates = getMilkywayTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        milkywayApiMode: value,
        milkywayGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'milkywayGameTemplateId') {
      setEditForm((prev) => ({ ...prev, milkywayGameTemplateId: value }))
      return
    }
    if (name === 'gameroomApiMode') {
      const templates = getGameroomTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        gameroomApiMode: value,
        gameroomGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'gameroomGameTemplateId') {
      setEditForm((prev) => ({ ...prev, gameroomGameTemplateId: value }))
      return
    }
    if (name === 'cashmachineApiMode') {
      const templates = getCashmachineTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        cashmachineApiMode: value,
        cashmachineGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'cashmachineGameTemplateId') {
      setEditForm((prev) => ({ ...prev, cashmachineGameTemplateId: value }))
      return
    }
    if (name === 'gameVaultApiMode') {
      const templates = getGameVaultTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        gameVaultApiMode: value,
        gameVaultGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'gameVaultGameTemplateId') {
      setEditForm((prev) => ({ ...prev, gameVaultGameTemplateId: value }))
      return
    }
    if (name === 'juwa20ApiMode') {
      const templates = getJuwa20TemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        juwa20ApiMode: value,
        juwa20GameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'juwa20GameTemplateId') {
      setEditForm((prev) => ({ ...prev, juwa20GameTemplateId: value }))
      return
    }
    if (name === 'juwaApiMode') {
      const templates = getJuwaTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        juwaApiMode: value,
        juwaGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'juwaGameTemplateId') {
      setEditForm((prev) => ({ ...prev, juwaGameTemplateId: value }))
      return
    }
    if (name === 'pandamasterApiMode') {
      const templates = getPandamasterTemplatesForMode(value)
      setEditForm((prev) => ({
        ...prev,
        pandamasterApiMode: value,
        pandamasterGameTemplateId: templates[0]?.id ?? ''
      }))
      return
    }
    if (name === 'pandamasterGameTemplateId') {
      setEditForm((prev) => ({ ...prev, pandamasterGameTemplateId: value }))
      return
    }
    if (name === 'appId' || name === 'appSecret' || name === 'agentId' || name === 'apiSecretKey' || name === 'kioskId') {
      setEditForm((prev) => ({ ...prev, [name]: value }))
      return
    }
    setEditForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    const min = editForm.minWithdrawalLimit === '' ? 0 : Number(editForm.minWithdrawalLimit)
    const max = editForm.maxWithdrawalLimit === '' ? 500 : Number(editForm.maxWithdrawalLimit)
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0 || min > max) {
      toast.error('Invalid withdrawal limits.')
      return
    }
    const minDeposit = editForm.minDepositLimit === '' ? 0 : Number(editForm.minDepositLimit)
    const maxDeposit = editForm.maxDepositLimit === '' ? 0 : Number(editForm.maxDepositLimit)
    if (Number.isNaN(minDeposit) || Number.isNaN(maxDeposit) || minDeposit < 0 || maxDeposit < 0 || (maxDeposit > 0 && minDeposit > maxDeposit)) {
      toast.error('Invalid deposit limits.')
      return
    }
    const discount = showEditDepositDiscount
      ? (editForm.depositDiscountPercent === '' ? 0 : Number(editForm.depositDiscountPercent))
      : 0
    if (showEditDepositDiscount && (Number.isNaN(discount) || discount < 0 || discount > 100)) {
      toast.error('Deposit discount must be between 0 and 100%.')
      return
    }
    const editingCustom = isCustomManualGame(editForm)
    if (editingCustom) {
      if (!(editForm.name || '').trim()) {
        toast.error('Game name is required.')
        return
      }
      if (!(editForm.platformGameUrl || '').trim()) {
        toast.error('Game link is required.')
        return
      }
      if (!(editForm.imageUrl || '').trim()) {
        toast.error('Game image is required.')
        return
      }
      setSaving(true)
      try {
        const payload = {
          name: editForm.name.trim(),
          platformGameUrl: editForm.platformGameUrl.trim(),
          imageUrl: editForm.imageUrl.trim(),
          minWithdrawalLimit: min,
          maxWithdrawalLimit: max,
          minDepositLimit: minDeposit,
          maxDepositLimit: maxDeposit,
          ...(showEditDepositDiscount ? { depositDiscountPercent: discount } : {}),
          isActive: editForm.isActive,
          displayOrder: Number(editForm.displayOrder) || 0
        }
        const res = await updateGame(editingId, payload)
        toast.success(res.message || 'Game updated successfully.')
        setList((prev) => prev.map((g) => (g.id === editingId ? (res.game || g) : g)))
        closeModal()
      } catch (err) {
        toast.error(err.message || 'Failed to update game.')
      } finally {
        setSaving(false)
      }
      return
    }
    const trimmedUser = (editForm.gameUsername || '').trim()
    if (!trimmedUser) {
      toast.error(isTerminalAgentGame(editForm) ? 'Agent name is required.' : 'Game username is required.')
      return
    }
    const editGoldenDragon = isGoldenDragonGameName(editForm.name)
    if (editGoldenDragon) {
      const kioskTrim = (editForm.kioskId || '').trim()
      if (!/^\d{7}$/.test(kioskTrim)) {
        toast.error('Golden Dragon kiosk ID must be the 7-digit number from your POS login URL (e.g. …/pos/2787443 → 2787443).')
        return
      }
    }
    const editOrionStars = isOrionStarsGame(editForm)
    if (editOrionStars && editForm.orionStarsApiMode) {
      if (!editForm.orionStarsGameTemplateId) {
        toast.error('Select the OrionStars config to apply.')
        return
      }
    }
    const editFirekirin = isFirekirinGame(editForm)
    if (editFirekirin && editForm.firekirinApiMode) {
      if (!editForm.firekirinGameTemplateId) {
        toast.error('Select the Firekirin config to apply.')
        return
      }
    }
    const editMilkyway = isMilkywayGame(editForm)
    if (editMilkyway && editForm.milkywayApiMode) {
      if (!editForm.milkywayGameTemplateId) {
        toast.error('Select the Milkyway config to apply.')
        return
      }
    }
    const editGameroom = isGameroomGame(editForm)
    if (editGameroom && editForm.gameroomApiMode) {
      if (!editForm.gameroomGameTemplateId) {
        toast.error('Select the Gameroom config to apply.')
        return
      }
    }
    const editCashmachine = isCashmachineGame(editForm)
    if (editCashmachine && editForm.cashmachineApiMode) {
      if (!editForm.cashmachineGameTemplateId) {
        toast.error('Select the CashMachine777 config to apply.')
        return
      }
    }
    const editGameVault = isGameVaultFamilyGame(editForm)
    if (editGameVault && editForm.gameVaultApiMode) {
      if (!editForm.gameVaultGameTemplateId) {
        toast.error('Select the Game Vault config to apply.')
        return
      }
      if (editForm.gameVaultApiMode === 'agent' && !(editForm.agentId || '').trim()) {
        toast.error('Agent ID is required when switching to Game Vault Agent API.')
        return
      }
    }
    const editJuwa20 = isJuwa20FamilyGame(editForm)
    if (editJuwa20 && editForm.juwa20ApiMode) {
      if (!editForm.juwa20GameTemplateId) {
        toast.error('Select the Juwa 2.0 config to apply.')
        return
      }
      if (editForm.juwa20ApiMode === 'agent' && !(editForm.agentId || '').trim()) {
        toast.error('Agent ID is required when switching to Juwa 2.0 Agent API.')
        return
      }
    }
    const editJuwa = isJuwaStoreGame(editForm)
    if (editJuwa && editForm.juwaApiMode) {
      if (!editForm.juwaGameTemplateId) {
        toast.error('Select the Juwa config to apply.')
        return
      }
      if (editForm.juwaApiMode === 'agent' && !(editForm.agentId || '').trim()) {
        toast.error('Agent ID is required when switching to Juwa Agent API.')
        return
      }
    }
    const editPandamaster = isPandamasterStoreGame(editForm)
    if (editPandamaster && editForm.pandamasterApiMode) {
      if (!editForm.pandamasterGameTemplateId) {
        toast.error('Select the Pandamaster config to apply.')
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        name: editForm.name.trim(),
        platformGameUrl: editForm.platformGameUrl.trim() || null,
        gameUsername: trimmedUser,
        minWithdrawalLimit: min,
        maxWithdrawalLimit: max,
        minDepositLimit: minDeposit,
        maxDepositLimit: maxDeposit,
        ...(showEditDepositDiscount ? { depositDiscountPercent: discount } : {}),
        isActive: editForm.isActive,
        displayOrder: Number(editForm.displayOrder) || 0
      }
      if ((editForm.gamePassword || '').trim()) {
        payload.gamePassword = editForm.gamePassword
      }
      if (isSimpleGame(editForm.name)) {
        if ((editForm.appId || '').trim()) payload.appId = editForm.appId.trim()
        if ((editForm.appSecret || '').trim()) payload.appSecret = editForm.appSecret
      }
      if (isAgentCredentialGame(editForm) || (editGameVault && editForm.gameVaultApiMode === 'agent') || (editJuwa20 && editForm.juwa20ApiMode === 'agent') || (editJuwa && editForm.juwaApiMode === 'agent')) {
        if ((editForm.agentId || '').trim()) payload.agentId = editForm.agentId.trim()
        // Leave blank to keep the existing API secret key.
        if ((editForm.apiSecretKey || '').trim()) payload.apiSecretKey = editForm.apiSecretKey.trim()
      }
      if (editOrionStars && editForm.orionStarsApiMode) {
        payload.orionStarsApiMode = editForm.orionStarsApiMode
        payload.orionStarsGameTemplateId = editForm.orionStarsGameTemplateId
      }
      if (editFirekirin && editForm.firekirinApiMode) {
        payload.firekirinApiMode = editForm.firekirinApiMode
        payload.firekirinGameTemplateId = editForm.firekirinGameTemplateId
      }
      if (editMilkyway && editForm.milkywayApiMode) {
        payload.milkywayApiMode = editForm.milkywayApiMode
        payload.milkywayGameTemplateId = editForm.milkywayGameTemplateId
      }
      if (editGameroom && editForm.gameroomApiMode) {
        payload.gameroomApiMode = editForm.gameroomApiMode
        payload.gameroomGameTemplateId = editForm.gameroomGameTemplateId
      }
      if (editCashmachine && editForm.cashmachineApiMode) {
        payload.cashmachineApiMode = editForm.cashmachineApiMode
        payload.cashmachineGameTemplateId = editForm.cashmachineGameTemplateId
      }
      if (editGameVault && editForm.gameVaultApiMode) {
        payload.gameVaultApiMode = editForm.gameVaultApiMode
        payload.gameVaultGameTemplateId = editForm.gameVaultGameTemplateId
      }
      if (editJuwa20 && editForm.juwa20ApiMode) {
        payload.juwa20ApiMode = editForm.juwa20ApiMode
        payload.juwa20GameTemplateId = editForm.juwa20GameTemplateId
      }
      if (editJuwa && editForm.juwaApiMode) {
        payload.juwaApiMode = editForm.juwaApiMode
        payload.juwaGameTemplateId = editForm.juwaGameTemplateId
      }
      if (editPandamaster && editForm.pandamasterApiMode) {
        payload.pandamasterApiMode = editForm.pandamasterApiMode
        payload.pandamasterGameTemplateId = editForm.pandamasterGameTemplateId
      }
      const res = await updateGame(editingId, payload)
      toast.success(res.message || 'Game updated successfully.')
      setList((prev) => prev.map((g) => (g.id === editingId ? (res.game || g) : g)))
      closeModal()
    } catch (err) {
      toast.error(err.message || 'Failed to update game.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleBotOffline = async (game) => {
    const action = game.botOffline ? 'set back to automated mode' : 'switch to manual mode'
    const ok = await confirm({
      title: `${game.botOffline ? 'Enable automation?' : 'Switch to manual mode?'}`,
      message: `This will ${action} for "${game.name}". ${game.botOffline ? 'All operations will resume using the automation tool.' : 'All register, deposit, and redeem operations will be queued for manual processing by your team.'}`,
      confirmLabel: game.botOffline ? 'Enable automation' : 'Switch to manual',
      cancelLabel: 'Cancel',
      variant: game.botOffline ? 'primary' : 'danger'
    })
    if (!ok) return
    try {
      const res = await toggleGameBotOffline(game.id)
      toast.success(res.message || 'Game mode updated.')
      setList((prev) => prev.map((g) => g.id === game.id ? { ...g, botOffline: res.botOffline } : g))
    } catch (err) {
      toast.error(err.message || 'Failed to update game mode.')
    }
  }

  const openChangePassword = (game) => {
    setChangePasswordGame(game)
    setChangePasswordValue('')
    setChangePasswordConfirm('')
    setShowChangePasswordValue(false)
    setChangePasswordOpen(true)
  }

  const closeChangePassword = () => {
    setChangePasswordOpen(false)
    setChangePasswordGame(null)
    setChangePasswordValue('')
    setChangePasswordConfirm('')
    setShowChangePasswordValue(false)
    setChangePasswordSaving(false)
  }

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault()
    if (!changePasswordGame) return
    const newPassword = (changePasswordValue || '').trim()
    const confirm = (changePasswordConfirm || '').trim()
    if (!newPassword) {
      toast.error('Enter a new password.')
      return
    }
    if (newPassword !== confirm) {
      toast.error('Passwords do not match.')
      return
    }
    setChangePasswordSaving(true)
    try {
      const res = await changeGamePassword(changePasswordGame.id, { newPassword })
      toast.success(res.message || 'Game password changed successfully.')
      closeChangePassword()
    } catch (err) {
      let message = err.message || 'Failed to change game password.'
      const isOrionStarsAgent =
        isOrionStarsTerminalGame(changePasswordGame) &&
        !isOrionStarsBotAutomationGame(changePasswordGame)
      const isFirekirinAgent =
        isFirekirinTerminalGame(changePasswordGame) &&
        !isFirekirinBotAutomationGame(changePasswordGame)
      const isMilkywayAgent =
        isMilkywayTerminalGame(changePasswordGame) &&
        !isMilkywayBotAutomationGame(changePasswordGame)
      const isGameroomAgent =
        isGameroomAgentGame(changePasswordGame) &&
        !isGameroomBotAutomationGame(changePasswordGame)
      const isCashmachineAgent =
        isCashmachineAgentGame(changePasswordGame) &&
        !isCashmachineBotAutomationGame(changePasswordGame)
      const isVegasXAgent = isVegasXCashierGame(changePasswordGame)
      // Agent API change-password: never show raw provider auth/session errors.
      if (isOrionStarsAgent || isFirekirinAgent || isMilkywayAgent || isGameroomAgent || isCashmachineAgent || isVegasXAgent) {
        const lower = String(message).toLowerCase()
        if (
          /session\s*timeout/.test(lower) ||
          /session\s*(expired|invalid|not\s*found)/.test(lower) ||
          lower.includes('signature') ||
          /agent\s*login/i.test(message) ||
          /wrong username or password/i.test(lower) ||
          /cashier login failed/i.test(lower)
        ) {
          message = 'Invalid password'
        }
      }
      toast.error(message)
    } finally {
      setChangePasswordSaving(false)
    }
  }

  const handleToggleManualRedeemOnly = async (game) => {
    const enabling = !game.manualRedeemOnly
    const ok = await confirm({
      title: enabling ? 'Enable manual redeem only?' : 'Disable manual redeem only?',
      message: enabling
        ? `Redeem requests for "${game.name}" will be sent for manual processing, while register and deposit continue automated.`
        : `Redeem requests for "${game.name}" will return to automated processing (unless full manual mode is enabled).`,
      confirmLabel: enabling ? 'Enable manual redeem' : 'Disable manual redeem',
      cancelLabel: 'Cancel',
      variant: enabling ? 'danger' : 'primary'
    })
    if (!ok) return
    try {
      const res = await toggleGameManualRedeemOnly(game.id)
      toast.success(res.message || 'Manual redeem mode updated.')
      setList((prev) =>
        prev.map((g) => (g.id === game.id ? { ...g, manualRedeemOnly: res.manualRedeemOnly } : g))
      )
    } catch (err) {
      toast.error(err.message || 'Failed to update manual redeem mode.')
    }
  }

  const handleDelete = async (game) => {
    const ok = await confirm({
      title: 'Delete this game?',
      message: `Deleting "${game.name}" (ID ${game.id}) will permanently remove this game and all data linked to it. Users who had registered accounts for this game will lose access to those accounts. This cannot be undone. Do you want to continue?`,
      confirmLabel: 'Yes, delete game and linked data',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    try {
      await deleteGame(game.id)
      toast.success('Game and all linked accounts and activity have been deleted.')
      setList((prev) => prev.filter((g) => g.id !== game.id))
    } catch (err) {
      toast.error(err.message || 'Failed to delete game.')
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'gameTemplateId') {
      const t = gameTemplates.find((g) => String(g.id) === String(value))
      const golden = t && isGoldenDragonTemplate(t)
      const juwaFamily = t && isJuwaFamilyGame(t)
      const juwaNewBot = t && isJuwaNewBotGame(t)
      const selectedStore = storeOptions.find((s) => s.storeCode === form.storeCode)
      const drawerFromStore = selectedStore?.drawer
      const drawerFromUser = user?.drawer != null ? Number(user.drawer) : NaN
      const drawer = drawerFromStore ?? (Number.isInteger(drawerFromUser) && drawerFromUser >= 1 ? drawerFromUser : null)
      const fromStore = drawer != null ? String(drawer) : ''
      setForm((prev) => ({
        ...prev,
        gameTemplateId: value,
        juwaApiMode: (juwaFamily || juwaNewBot) ? (isJuwaAgentGame(t) ? 'agent' : 'bot') : '',
        moneybox: golden ? fromStore : '',
        kioskId: golden ? prev.kioskId : '',
        agentId: juwaFamily && !isJuwaAgentGame(t) ? '' : prev.agentId,
        apiSecretKey: juwaFamily && !isJuwaAgentGame(t) ? '' : prev.apiSecretKey
      }))
      return
    }
    if (name === 'juwaApiMode') {
      const templates = getJuwaTemplatesForMode(value)
      const nextTemplate = templates[0]
      if (!nextTemplate) {
        toast.error(value === 'agent'
          ? 'Juwa Agent config is missing. Add Juwa (Agent) in Game Templates first (game key juwa_agent).'
          : 'Juwa bot config is missing.')
        return
      }
      setForm((prev) => ({
        ...prev,
        juwaApiMode: value,
        gameTemplateId: String(nextTemplate.id),
        agentId: value === 'agent' ? prev.agentId : '',
        apiSecretKey: value === 'agent' ? prev.apiSecretKey : ''
      }))
      return
    }
    if (name === 'storeCode') {
      const selectedStore = storeOptions.find((s) => s.storeCode === value)
      const t = gameTemplates.find((g) => String(g.id) === String(form.gameTemplateId))
      const golden = t && isGoldenDragonTemplate(t)
      const drawer = selectedStore?.drawer
      const fromStore = drawer != null ? String(drawer) : ''
      setForm((prev) => ({
        ...prev,
        storeCode: value,
        moneybox: golden && fromStore ? fromStore : prev.moneybox
      }))
      return
    }
    if (name === 'minWithdrawalLimit' || name === 'maxWithdrawalLimit' || name === 'minDepositLimit' || name === 'maxDepositLimit' || name === 'depositDiscountPercent') {
      setForm((prev) => ({ ...prev, [name]: value === '' ? '' : Number(value) }))
      return
    }
    if (name === 'moneybox' || name === 'kioskId') {
      setForm((prev) => ({ ...prev, [name]: value }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const selectedTemplate = gameTemplates.find((t) => String(t.id) === String(form.gameTemplateId))
  const storeFilterOptions = useMemo(() => {
    if (!isMasterAdmin) return []
    const codes = new Set(storeOptions.map((s) => s.storeCode).filter(Boolean))
    for (const g of list || []) {
      const code = g?.addedByStoreCode == null ? '' : String(g.addedByStoreCode).trim()
      if (code) codes.add(code)
    }
    return [...codes].sort((a, b) => a.localeCompare(b))
  }, [isMasterAdmin, storeOptions, list])

  const gameNameFilterOptions = useMemo(() => {
    const seen = new Set()
    const options = []
    for (const g of list || []) {
      const rawName = String(g.name || '').trim()
      const name = formatGameDisplayName(g) || rawName
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      options.push({ name, value: rawName.toLowerCase() })
    }
    return options.sort((a, b) => a.name.localeCompare(b.name))
  }, [list])

  const hasManualLogsFilters =
    manualLogsStoreFilter !== 'all' ||
    manualLogsGameFilter !== 'all' ||
    manualLogsStartDate !== defaultManualLogsDateRange.startDate ||
    manualLogsEndDate !== defaultManualLogsDateRange.endDate

  const hasGameHistoryFilters =
    gameHistoryStoreFilter !== 'all' ||
    gameHistoryGameFilter !== 'all' ||
    gameHistoryActionFilter !== 'all' ||
    gameHistoryStartDate !== defaultGameHistoryDateRange.startDate ||
    gameHistoryEndDate !== defaultGameHistoryDateRange.endDate

  const hasFailureLogsFilters =
    failureLogsStoreFilter !== 'all' ||
    failureLogsGameFilter !== 'all' ||
    failureLogsStartDate !== defaultFailureLogsDateRange.startDate ||
    failureLogsEndDate !== defaultFailureLogsDateRange.endDate

  const renderGameHistoryValueCell = (row, column) => {
    const value = column === 'old' ? row.oldValue : row.newValue
    const display = value || '—'

    if (!isGameHistoryPasswordRow(row) || !hasGameHistoryPasswordDisplay(value)) {
      return display
    }

    const isLegacyPlaceholder =
      value === LEGACY_PASSWORD_MASK || value === LEGACY_PASSWORD_CHANGED
    const visibilityKey = `${row.id}-${column}`
    const visible = !!gameHistoryPasswordVisible[visibilityKey]

    return (
      <div className="games-manual-logs-password-cell games-view-password-cell games-history-password-cell">
        <span className="games-view-password-value">
          {visible ? value : LEGACY_PASSWORD_MASK}
        </span>
        <button
          type="button"
          className="games-view-password-toggle"
          onClick={() =>
            setGameHistoryPasswordVisible((prev) => ({
              ...prev,
              [visibilityKey]: !prev[visibilityKey]
            }))
          }
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={
            isLegacyPlaceholder && visible
              ? 'Password was not recorded for this older entry'
              : visible
                ? 'Hide password'
                : 'Show password'
          }
        >
          <PasswordEyeIcon visible={visible} />
        </button>
      </div>
    )
  }

  const hasActiveGamesFilters =
    (isMasterAdmin && storeFilter !== 'all') ||
    (canFilterByPlatformRole && gameFilter !== 'all') ||
    (canFilterByPlatformRole && automationModeFilter !== 'all')

  const filteredList = useMemo(() => {
    let result = list || []
    if (isMasterAdmin) {
      result = result.filter((g) => {
        if (storeFilter === 'all') return true
        return String(g?.addedByStoreCode || '').trim() === storeFilter
      })
    }
    if (canFilterByPlatformRole && gameFilter !== 'all') {
      result = result.filter((g) =>
        String(g.name || '').trim().toLowerCase() === gameFilter
        || (formatGameDisplayName(g) || '').toLowerCase() === gameFilter
      )
    }
    if (canFilterByPlatformRole && automationModeFilter !== 'all') {
      result = result.filter((g) => {
        if (automationModeFilter === 'manual') return !!g.botOffline
        if (automationModeFilter === 'automation') return !g.botOffline
        return true
      })
    }
    return result
  }, [list, isMasterAdmin, storeFilter, canFilterByPlatformRole, gameFilter, automationModeFilter])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving || addGameSubmittingRef.current) return
    const templateId = form.gameTemplateId ? Number(form.gameTemplateId) : null
    if (!templateId) {
      toast.error('Please select a game from the dropdown.')
      return
    }
    if (isMasterAdmin && !(form.storeCode || '').trim()) {
      toast.error('Please select a store.')
      return
    }
    const min = form.minWithdrawalLimit === '' ? 0 : Number(form.minWithdrawalLimit)
    const max = form.maxWithdrawalLimit === '' ? 500 : Number(form.maxWithdrawalLimit)
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0 || min > max) {
      toast.error('Invalid withdrawal limits.')
      return
    }
    const minDeposit = form.minDepositLimit === '' ? 0 : Number(form.minDepositLimit)
    const maxDeposit = form.maxDepositLimit === '' ? 0 : Number(form.maxDepositLimit)
    if (Number.isNaN(minDeposit) || Number.isNaN(maxDeposit) || minDeposit < 0 || maxDeposit < 0 || (maxDeposit > 0 && minDeposit > maxDeposit)) {
      toast.error('Invalid deposit limits.')
      return
    }
    const discount = showAddDepositDiscount
      ? (form.depositDiscountPercent === '' ? 0 : Number(form.depositDiscountPercent))
      : 0
    if (showAddDepositDiscount && (Number.isNaN(discount) || discount < 0 || discount > 100)) {
      toast.error('Deposit discount must be between 0 and 100%.')
      return
    }
    const simpleGame = selectedTemplate && isSimpleGame(selectedTemplate.name)
    const agentCredGame = selectedTemplate && isAgentCredentialGame(selectedTemplate)
    const goldenDragon = selectedTemplate && isGoldenDragonTemplate(selectedTemplate)
    if (simpleGame) {
      if (!(form.appId || '').trim()) {
        toast.error('App ID is required for Vblink, UltraPanda, and Egame99.')
        return
      }
      if (!(form.appSecret || '').trim()) {
        toast.error('App Secret is required for Vblink, UltraPanda, and Egame99.')
        return
      }
    }
    if (agentCredGame) {
      if (!(form.agentId || '').trim()) {
        toast.error('Agent ID is required for this Agent API game.')
        return
      }
      if (!(form.apiSecretKey || '').trim()) {
        toast.error('API secret key is required for this Agent API game.')
        return
      }
    }
    if (goldenDragon) {
      const mb = form.moneybox === '' ? NaN : Number(form.moneybox)
      if (Number.isNaN(mb) || !Number.isInteger(mb) || mb < 1) {
        toast.error('Golden Dragon requires a moneybox (drawer): enter a positive whole number (set your store drawer in Profile if you use the same value every time).')
        return
      }
      const kioskTrim = (form.kioskId || '').trim()
      if (!/^\d{7}$/.test(kioskTrim)) {
        toast.error('Golden Dragon kiosk ID must be the 7-digit number from your POS login URL (e.g. …/pos/2787443 → 2787443).')
        return
      }
    }
    setSaving(true)
    addGameSubmittingRef.current = true
    try {
      const payload = {
        gameTemplateId: templateId,
        gameUsername: form.gameUsername.trim(),
        gamePassword: form.gamePassword,
        minWithdrawalLimit: min,
        maxWithdrawalLimit: max,
        minDepositLimit: minDeposit,
        maxDepositLimit: maxDeposit,
        ...(showAddDepositDiscount ? { depositDiscountPercent: discount } : {})
      }
      if (simpleGame) {
        payload.appId = form.appId.trim()
        payload.appSecret = form.appSecret
      }
      if (agentCredGame) {
        payload.agentId = form.agentId.trim()
        payload.apiSecretKey = form.apiSecretKey
      }
      if (goldenDragon) {
        payload.moneybox = Number(form.moneybox)
        payload.kioskId = (form.kioskId || '').trim()
      }
      if (isMasterAdmin && (form.storeCode || '').trim()) {
        payload.storeCode = form.storeCode.trim()
      }
      const res = await createGame(payload)
      toast.success(res.message || 'Game added successfully.')
      if (res.game) setList((prev) => [...prev, res.game])
      closeModal()
    } catch (err) {
      toast.error(err.message || 'Failed to add game.')
    } finally {
      setSaving(false)
      addGameSubmittingRef.current = false
    }
  }

  const handleCustomChange = (e) => {
    const { name, value } = e.target
    if (name === 'minWithdrawalLimit' || name === 'maxWithdrawalLimit' || name === 'minDepositLimit' || name === 'maxDepositLimit' || name === 'depositDiscountPercent') {
      setCustomForm((prev) => ({ ...prev, [name]: value === '' ? '' : Number(value) }))
      return
    }
    setCustomForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleCustomImageUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingGameImage(true)
    try {
      const res = await uploadGameImage(file)
      const url = res?.url
      if (!url) throw new Error('Upload failed.')
      setCustomForm((prev) => ({ ...prev, imageUrl: url }))
      toast.success('Game image uploaded.')
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploadingGameImage(false)
    }
  }

  const handleEditCustomImageUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingGameImage(true)
    try {
      const res = await uploadGameImage(file)
      const url = res?.url
      if (!url) throw new Error('Upload failed.')
      setEditForm((prev) => ({ ...prev, imageUrl: url }))
      toast.success('Game image uploaded.')
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploadingGameImage(false)
    }
  }

  const handleCustomSubmit = async (e) => {
    e.preventDefault()
    if (saving || addGameSubmittingRef.current) return
    if (isMasterAdmin && !(customForm.storeCode || '').trim()) {
      toast.error('Please select a store.')
      return
    }
    if (!(customForm.gameName || '').trim()) {
      toast.error('Game name is required.')
      return
    }
    if (!(customForm.gameLink || '').trim()) {
      toast.error('Game link is required.')
      return
    }
    if (!(customForm.imageUrl || '').trim()) {
      toast.error('Please upload a game image.')
      return
    }
    const min = customForm.minWithdrawalLimit === '' ? 0 : Number(customForm.minWithdrawalLimit)
    const max = customForm.maxWithdrawalLimit === '' ? 500 : Number(customForm.maxWithdrawalLimit)
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 0 || min > max) {
      toast.error('Invalid withdrawal limits.')
      return
    }
    const minDeposit = customForm.minDepositLimit === '' ? 0 : Number(customForm.minDepositLimit)
    const maxDeposit = customForm.maxDepositLimit === '' ? 0 : Number(customForm.maxDepositLimit)
    if (Number.isNaN(minDeposit) || Number.isNaN(maxDeposit) || minDeposit < 0 || maxDeposit < 0 || (maxDeposit > 0 && minDeposit > maxDeposit)) {
      toast.error('Invalid deposit limits.')
      return
    }
    const discount = showCustomDepositDiscount
      ? (customForm.depositDiscountPercent === '' ? 0 : Number(customForm.depositDiscountPercent))
      : 0
    if (showCustomDepositDiscount && (Number.isNaN(discount) || discount < 0 || discount > 100)) {
      toast.error('Deposit discount must be between 0 and 100%.')
      return
    }
    setSaving(true)
    addGameSubmittingRef.current = true
    try {
      const payload = {
        gameName: customForm.gameName.trim(),
        gameLink: customForm.gameLink.trim(),
        imageUrl: customForm.imageUrl.trim(),
        minWithdrawalLimit: min,
        maxWithdrawalLimit: max,
        minDepositLimit: minDeposit,
        maxDepositLimit: maxDeposit,
        ...(showCustomDepositDiscount ? { depositDiscountPercent: discount } : {})
      }
      if (isMasterAdmin && (customForm.storeCode || '').trim()) {
        payload.storeCode = customForm.storeCode.trim()
      }
      const res = await createCustomGame(payload)
      toast.success(res.message || 'Custom game added successfully.')
      if (res.game) setList((prev) => [...prev, res.game])
      closeModal()
    } catch (err) {
      toast.error(err.message || 'Failed to add custom game.')
    } finally {
      setSaving(false)
      addGameSubmittingRef.current = false
    }
  }

  const openConfigAdd = () => {
    setConfigForm(initialConfigForm)
    setConfigModalMode('add')
    setConfigEditingId(null)
    setConfigModalOpen(true)
  }

  const openConfigEdit = async (template) => {
    setConfigEditingId(template.id)
    setConfigModalMode('edit')
    try {
      const data = await getGameTemplate(template.id)
      setConfigForm({
        name: data.name ?? '',
        gameKey: data.gameKey ?? '',
        streamlitToken: data.streamlitToken ?? '',
        botBaseUrl: data.botBaseUrl ?? '',
        gameLink: data.gameLink ?? '',
        isActive: data.isActive !== false
      })
      setConfigModalOpen(true)
    } catch (err) {
      toast.error(err.message || 'Failed to load config')
    }
  }

  const closeConfigModal = () => {
    setConfigModalOpen(false)
    setConfigModalMode('add')
    setConfigForm(initialConfigForm)
    setConfigEditingId(null)
  }

  const handleConfigChange = (e) => {
    const { name, value } = e.target
    if (name === 'isActive') {
      setConfigForm((prev) => ({ ...prev, isActive: e.target.checked }))
      return
    }
    setConfigForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleConfigSubmit = async (e) => {
    e.preventDefault()
    const name = (configForm.name || '').trim()
    const gameKey = (configForm.gameKey || '').trim()
    const streamlitToken = (configForm.streamlitToken || '').trim()
    const botBaseUrl = (configForm.botBaseUrl || '').trim()
    if (!name) { toast.error('Name is required.'); return }
    if (usesStreamlitTemplateFields(configForm)) {
      if (!gameKey) { toast.error('Game key is required.'); return }
      if (configModalMode === 'add' && !streamlitToken) { toast.error('Streamlit token is required.'); return }
    }
    if (isAgentCredentialGame(configForm)) {
      const resolvedKey = resolveAgentTemplateGameKey(name, gameKey)
      if (!resolvedKey) {
        toast.error('Could not resolve integration key. Use a name like "Game Vault (Agent)" / gamevault_agent or "Juwa 2.0 (Agent)".')
        return
      }
    }
    if (usesVegasXTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for VegasX.')
      return
    }
    if (usesOrionStarsTerminalTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for Orion Stars.')
      return
    }
    if (usesFirekirinTerminalTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for Firekirin Agent. Use firekirin_agent.')
      return
    }
    if (usesMilkywayTerminalTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for Milkyway Agent. Use milkyway_agent.')
      return
    }
    if (usesGameroomAgentTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for Gameroom Agent. Use gameroom_agent.')
      return
    }
    if (usesCashmachineAgentTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for CashMachine777 Agent. Use cashmachine_agent.')
      return
    }
    if (usesMafiaAgentTemplateFields(configForm) && !gameKey) {
      toast.error('Game key is required for Mafia Agent. Use mafia_agent.')
      return
    }
    if (configModalMode === 'add' && !botBaseUrl) { toast.error('Bot base URL is required.'); return }
    setConfigSaving(true)
    try {
      if (configModalMode === 'add') {
        const payload = { name, botBaseUrl, gameLink: (configForm.gameLink || '').trim() || null, isActive: configForm.isActive }
        if (usesStreamlitTemplateFields(configForm)) {
          payload.gameKey = gameKey
          payload.streamlitToken = streamlitToken
        }
        if (isAgentCredentialGame(configForm)) {
          payload.gameKey = resolveAgentTemplateGameKey(name, gameKey)
        }
        if (usesVegasXTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesOrionStarsTerminalTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesFirekirinTerminalTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesMilkywayTerminalTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesGameroomAgentTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesCashmachineAgentTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesMafiaAgentTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        const res = await createGameTemplate(payload)
        toast.success(res.message || 'Game config created.')
        if (res.template) setConfigList((prev) => [...prev, res.template])
      } else {
        const payload = { name, gameLink: (configForm.gameLink || '').trim() || null, isActive: configForm.isActive }
        if (usesStreamlitTemplateFields(configForm)) payload.gameKey = gameKey
        if (isAgentCredentialGame(configForm)) {
          payload.gameKey = resolveAgentTemplateGameKey(name, gameKey)
        }
        if (usesVegasXTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesOrionStarsTerminalTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesFirekirinTerminalTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesMilkywayTerminalTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesGameroomAgentTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesCashmachineAgentTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (usesMafiaAgentTemplateFields(configForm)) {
          payload.gameKey = gameKey
        }
        if (streamlitToken) payload.streamlitToken = streamlitToken
        if (botBaseUrl) payload.botBaseUrl = botBaseUrl
        const res = await updateGameTemplate(configEditingId, payload)
        toast.success(res.message || 'Game config updated.')
        if (res.template) setConfigList((prev) => prev.map((t) => (t.id === configEditingId ? res.template : t)))
        else loadConfigs()
      }
      closeConfigModal()
    } catch (err) {
      toast.error(err.message || (configModalMode === 'add' ? 'Failed to create config.' : 'Failed to update config.'))
    } finally {
      setConfigSaving(false)
    }
  }

  const handleConfigToggleActive = async (template) => {
    const nextActive = !template.isActive
    setConfigSaving(true)
    try {
      await updateGameTemplate(template.id, { isActive: nextActive })
      toast.success(`Config "${template.name}" is now ${nextActive ? 'active' : 'inactive'}.`)
      setConfigList((prev) => prev.map((t) => (t.id === template.id ? { ...t, isActive: nextActive } : t)))
    } catch (err) {
      toast.error(err.message || 'Failed to update status.')
    } finally {
      setConfigSaving(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleString()
    } catch {
      return d
    }
  }

  return (
    <div className="distributors-page games-page">
      <div className="games-tabs-wrap">
        <div className="games-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'games'}
            className={`games-tab ${activeTab === 'games' ? 'games-tab-active' : ''}`}
            onClick={() => setActiveTab('games')}
          >
            Games
          </button>
          {isMasterAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'configs'}
              className={`games-tab ${activeTab === 'configs' ? 'games-tab-active' : ''}`}
              onClick={() => setActiveTab('configs')}
            >
              Game configs
            </button>
          )}
          {isTechnicalStaff && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'manualLogs'}
              className={`games-tab ${activeTab === 'manualLogs' ? 'games-tab-active' : ''}`}
              onClick={() => setActiveTab('manualLogs')}
            >
              Manual game logs
            </button>
          )}
          {isTechnicalStaff && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'failureLogs'}
              className={`games-tab ${activeTab === 'failureLogs' ? 'games-tab-active' : ''}`}
              onClick={() => setActiveTab('failureLogs')}
            >
              Bot failure logs
            </button>
          )}
          {isTechnicalStaff && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'gameHistory'}
              className={`games-tab ${activeTab === 'gameHistory' ? 'games-tab-active' : ''}`}
              onClick={() => setActiveTab('gameHistory')}
            >
              Game history
            </button>
          )}
        </div>
      </div>

      {activeTab === 'games' && (
        <>
          <div className="page-header">
            <h2>Games</h2>
            <div className="page-header-actions">
              {isMasterAdmin && (
                <div className="games-header-filter-wrap">
                  <label htmlFor="games-store-filter" className="games-header-filter-label">
                    View games by store
                  </label>
                  <select
                    id="games-store-filter"
                    className="store-features-input games-header-filter-select"
                    value={storeFilter}
                    onChange={(e) => setStoreFilter(e.target.value)}
                    aria-label="Filter games by store"
                    title="Filter games by store"
                  >
                    <option value="all">All Stores</option>
                    {storeFilterOptions.map((storeCode) => (
                      <option key={storeCode} value={storeCode}>
                        {storeCode}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {canFilterByPlatformRole && (
                <div className="games-header-filter-wrap">
                  <label htmlFor="games-game-filter" className="games-header-filter-label">
                    Game
                  </label>
                  <select
                    id="games-game-filter"
                    className="store-features-input games-header-filter-select"
                    value={gameFilter}
                    onChange={(e) => setGameFilter(e.target.value)}
                    aria-label="Filter games by game"
                    title="Filter games by game"
                  >
                    <option value="all">All games</option>
                    {gameNameFilterOptions.map(({ name, value }) => (
                      <option key={name} value={value || name.toLowerCase()}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {canFilterByPlatformRole && (
                <div className="games-header-filter-wrap">
                  <label htmlFor="games-automation-mode-filter" className="games-header-filter-label">
                    Automation mode
                  </label>
                  <select
                    id="games-automation-mode-filter"
                    className="store-features-input games-header-filter-select"
                    value={automationModeFilter}
                    onChange={(e) => setAutomationModeFilter(e.target.value)}
                    aria-label="Filter games by automation mode"
                    title="Filter games by automation mode"
                  >
                    <option value="all">All modes</option>
                    <option value="automation">Automation</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              )}
              <button type="button" className="admin-btn admin-btn-primary" onClick={openModal} disabled={saving}>
                Add Game
              </button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={openCustomModal} disabled={saving}>
                Add Custom Game
              </button>
            </div>
          </div>

      {loading ? (  
        <div className="page-loading">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Integration</th>
                <th>API mode</th>
                {isMasterAdmin && <th>Added by store</th>}
                <th>Game Store username</th>
                <th>Min withdrawal</th>
                <th>Max withdrawal</th>
                <th>Min deposit</th>
                <th>Max deposit</th>
                {showDepositDiscountColumn && <th>Deposit discount</th>}
                <th>Platform game URL</th>
                <th>Active</th>
                <th>Automation mode</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={(isMasterAdmin ? 15 : 14) + (showDepositDiscountColumn ? 1 : 0)}>
                    {hasActiveGamesFilters
                      ? 'No games found for the selected filters.'
                      : 'No games found.'}
                  </td>
                </tr>
              ) : (
                filteredList.map((g) => (
                  <tr key={g.id}>
                    <td>{g.id}</td>
                    <td>{formatGameDisplayName(g) || g.displayName || g.name || '—'}</td>
                    <td>
                      <span className="games-bot-mode-badge" title={g.gameKey ? `game_key: ${g.gameKey}` : undefined}>
                        {g.integrationLabel || (g.agentId && g.apiSecretKey ? 'Agent' : '—')}
                      </span>
                    </td>
                    <td>
                      <span
                        className="games-bot-mode-badge games-api-mode-badge"
                        title={g.gameKey ? `game_key: ${g.gameKey}` : undefined}
                      >
                        {getGameApiModeLabel(g)}
                      </span>
                    </td>
                    {isMasterAdmin && <td>{g.addedByStoreCode ?? 'Platform'}</td>}
                    <td>{g.botUsername ?? '—'}</td>
                    <td>{g.minWithdrawalLimit ?? '—'}</td>
                    <td>{g.maxWithdrawalLimit ?? '—'}</td>
                    <td>{g.minDepositLimit ?? '—'}</td>
                    <td>{g.maxDepositLimit > 0 ? g.maxDepositLimit : '∞'}</td>
                    {showDepositDiscountColumn && (
                      <td>{Number(g.depositDiscountPercent) > 0 ? `${Number(g.depositDiscountPercent)}%` : '—'}</td>
                    )}
                    <td>{g.platformGameUrl ? <a href={g.platformGameUrl} target="_blank" rel="noopener noreferrer">{g.platformGameUrl}</a> : '—'}</td>
                    <td>{g.isActive ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="games-mode-badges">
                        <span
                          className={`games-bot-mode-badge ${g.botOffline ? 'games-bot-mode-manual' : 'games-bot-mode-auto'}`}
                          title={g.botOffline ? 'Automation is off — operations require manual processing' : 'Automation is on — operations are automated'}
                        >
                          {g.botOffline ? 'Manual' : 'Automated'}
                        </span>
                        {g.manualRedeemOnly && (
                          <span
                            className="games-bot-mode-badge games-bot-mode-redeem-manual"
                            title="Only redeem requests are sent for manual processing"
                          >
                            Redeem manual
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{g.displayOrder ?? '—'}</td>
                    <td>
                      <div className="games-actions">
                        <button type="button" className="admin-btn admin-btn-sm" onClick={() => openView(g)}>View</button>
                        {canMutateGameRow(g) && (
                          <>
                            <button type="button" className="admin-btn admin-btn-sm admin-btn-edit" onClick={() => openEdit(g)}>Edit</button>
                            {!isCustomManualGame(g) && (
                              <>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn-sm admin-btn-secondary"
                                  onClick={() => openChangePassword(g)}
                                  title="Change the game store account password via the game provider"
                                >
                                  Change password
                                </button>
                                <button
                                  type="button"
                                  className={`admin-btn admin-btn-sm ${g.botOffline ? 'admin-btn-success' : 'admin-btn-warning'}`}
                                  onClick={() => handleToggleBotOffline(g)}
                                  title={g.botOffline ? 'Click to re-enable automation' : 'Click to switch to manual mode'}
                                >
                                  {g.botOffline ? 'Enable automation' : 'Go manual'}
                                </button>
                                <button
                                  type="button"
                                  className={`admin-btn admin-btn-sm ${g.manualRedeemOnly ? 'admin-btn-success' : 'admin-btn-secondary'}`}
                                  onClick={() => handleToggleManualRedeemOnly(g)}
                                  title={g.manualRedeemOnly ? 'Disable manual redeem only mode' : 'Enable manual redeem only mode'}
                                >
                                  {g.manualRedeemOnly ? 'Redeem auto' : 'Redeem manual'}
                                </button>
                              </>
                            )}
                            <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(g)}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

        </>
      )}

      {activeTab === 'manualLogs' && isTechnicalStaff && (
        <>
          <div className="page-header games-manual-logs-page-header">
            <div className="games-config-header-text">
              <h2>Manual game logs</h2>
              <p className="page-description" style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
                Games that switched between automation and manual mode (API failure or store admin action).
              </p>
            </div>
            <div className="page-header-actions games-manual-logs-filters">
              <div className="dashboard-filter-bar games-manual-logs-unified-filter">
                <div className="games-manual-logs-filter-zone games-manual-logs-filter-zone-left">
                  <label className="dashboard-filter-field" htmlFor="manual-logs-game-filter">
                    <span className="dashboard-filter-field-label">Game</span>
                    <select
                      id="manual-logs-game-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={manualLogsGameFilter}
                      onChange={(e) => {
                        setManualLogsGameFilter(e.target.value)
                        setManualLogs((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter manual logs by game"
                    >
                      <option value="all">All games</option>
                      {gameNameFilterOptions.map(({ name }) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dashboard-filter-field" htmlFor="manual-logs-store-filter">
                    <span className="dashboard-filter-field-label">Store</span>
                    <select
                      id="manual-logs-store-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={manualLogsStoreFilter}
                      onChange={(e) => {
                        setManualLogsStoreFilter(e.target.value)
                        setManualLogs((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter manual logs by store"
                    >
                      <option value="all">All stores</option>
                      {storeFilterOptions.map((storeCode) => (
                        <option key={storeCode} value={storeCode}>
                          {storeCode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="games-manual-logs-filter-zone games-manual-logs-filter-zone-right">
                  <DateRangeFilter
                    embedded
                    startDate={manualLogsStartDate}
                    endDate={manualLogsEndDate}
                    onStartDateChange={(value) => {
                      setManualLogsStartDate(value)
                      setManualLogs((s) => ({ ...s, page: 1 }))
                    }}
                    onEndDateChange={(value) => {
                      setManualLogsEndDate(value)
                      setManualLogs((s) => ({ ...s, page: 1 }))
                    }}
                    onPresetClick={(range) => {
                      if (!range?.startDate || range?.endDate == null) return
                      setManualLogsStartDate(range.startDate)
                      setManualLogsEndDate(range.endDate)
                      setManualLogs((s) => ({ ...s, page: 1 }))
                    }}
                    label="Date"
                  />
                </div>
              </div>
            </div>
          </div>

          {manualLogsLoading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <div className="table-wrap games-manual-logs-wrap">
              <table className="admin-table games-manual-logs-table">
                <thead>
                  <tr>
                    <th>Date &amp; time</th>
                    <th>Store code</th>
                    <th>Game</th>
                    <th>Game store username</th>
                    <th>Game store password</th>
                    <th>Reason</th>
                    <th>Switched by</th>
                  </tr>
                </thead>
                <tbody>
                  {manualLogs.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        {hasManualLogsFilters
                          ? 'No game mode switches found for the selected filters.'
                          : 'No game mode switches recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    manualLogs.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="games-manual-logs-date">{formatDate(row.createdAt)}</td>
                        <td>{row.storeCode || '—'}</td>
                        <td>{row.gameName || '—'}</td>
                        <td>{row.gameStoreUsername || '—'}</td>
                        <td className="games-manual-logs-password-cell">
                          {row.gameStorePassword ? (
                            <>
                              <span>
                                {manualLogPasswordVisible[row.id]
                                  ? row.gameStorePassword
                                  : '••••••••'}
                              </span>
                              <button
                                type="button"
                                className="admin-btn admin-btn-sm games-manual-logs-reveal-btn"
                                onClick={() =>
                                  setManualLogPasswordVisible((prev) => ({
                                    ...prev,
                                    [row.id]: !prev[row.id]
                                  }))
                                }
                              >
                                {manualLogPasswordVisible[row.id] ? 'Hide' : 'Show'}
                              </button>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="games-manual-logs-error-cell">
                          <ManualLogReasonCell text={row.automationApiError} />
                        </td>
                        <td>{row.switchedByName || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {manualLogs.total > 0 && (
                <div className="games-manual-logs-pagination">
                  <label className="games-manual-logs-perpage">
                    Show
                    <select
                      value={manualLogs.limit}
                      onChange={(e) =>
                        setManualLogs((s) => ({ ...s, limit: Number(e.target.value), page: 1 }))
                      }
                      aria-label="Rows per page"
                    >
                      {MANUAL_LOG_PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    per page
                  </label>
                  <span className="games-manual-logs-pagination-info">
                    {(manualLogs.page - 1) * manualLogs.limit + 1}–
                    {Math.min(manualLogs.page * manualLogs.limit, manualLogs.total)} of {manualLogs.total}
                  </span>
                  <div className="games-manual-logs-pagination-btns">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={manualLogs.page <= 1}
                      onClick={() => setManualLogs((s) => ({ ...s, page: 1 }))}
                    >
                      First
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={manualLogs.page <= 1}
                      onClick={() => setManualLogs((s) => ({ ...s, page: s.page - 1 }))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {manualLogs.page} of {manualLogs.totalPages || 1}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={manualLogs.page >= (manualLogs.totalPages || 1)}
                      onClick={() => setManualLogs((s) => ({ ...s, page: s.page + 1 }))}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={manualLogs.page >= (manualLogs.totalPages || 1)}
                      onClick={() =>
                        setManualLogs((s) => ({ ...s, page: manualLogs.totalPages || 1 }))
                      }
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'gameHistory' && isTechnicalStaff && (
        <>
          <div className="page-header games-manual-logs-page-header">
            <div className="games-config-header-text">
              <h2>Game history</h2>
              <p className="page-description" style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
                Track all store game changes — who updated what, when, and automation/manual switches.
              </p>
            </div>
            <div className="page-header-actions games-manual-logs-filters">
              <div className="dashboard-filter-bar games-manual-logs-unified-filter">
                <div className="games-manual-logs-filter-zone games-manual-logs-filter-zone-left">
                  <label className="dashboard-filter-field" htmlFor="game-history-game-filter">
                    <span className="dashboard-filter-field-label">Game</span>
                    <select
                      id="game-history-game-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={gameHistoryGameFilter}
                      onChange={(e) => {
                        setGameHistoryGameFilter(e.target.value)
                        setGameHistory((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter game history by game"
                    >
                      <option value="all">All games</option>
                      {gameNameFilterOptions.map(({ name }) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dashboard-filter-field" htmlFor="game-history-store-filter">
                    <span className="dashboard-filter-field-label">Store</span>
                    <select
                      id="game-history-store-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={gameHistoryStoreFilter}
                      onChange={(e) => {
                        setGameHistoryStoreFilter(e.target.value)
                        setGameHistory((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter game history by store"
                    >
                      <option value="all">All stores</option>
                      {storeFilterOptions.map((storeCode) => (
                        <option key={storeCode} value={storeCode}>
                          {storeCode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dashboard-filter-field" htmlFor="game-history-action-filter">
                    <span className="dashboard-filter-field-label">Change type</span>
                    <select
                      id="game-history-action-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={gameHistoryActionFilter}
                      onChange={(e) => {
                        setGameHistoryActionFilter(e.target.value)
                        setGameHistory((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter game history by change type"
                    >
                      {GAME_HISTORY_ACTION_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="games-manual-logs-filter-zone games-manual-logs-filter-zone-right">
                  <DateRangeFilter
                    embedded
                    startDate={gameHistoryStartDate}
                    endDate={gameHistoryEndDate}
                    onStartDateChange={(value) => {
                      setGameHistoryStartDate(value)
                      setGameHistory((s) => ({ ...s, page: 1 }))
                    }}
                    onEndDateChange={(value) => {
                      setGameHistoryEndDate(value)
                      setGameHistory((s) => ({ ...s, page: 1 }))
                    }}
                    onPresetClick={(range) => {
                      if (!range?.startDate || range?.endDate == null) return
                      setGameHistoryStartDate(range.startDate)
                      setGameHistoryEndDate(range.endDate)
                      setGameHistory((s) => ({ ...s, page: 1 }))
                    }}
                    label="Date"
                  />
                </div>
              </div>
            </div>
          </div>

          {gameHistoryLoading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <div className="table-wrap games-manual-logs-wrap">
              <table className="admin-table games-history-table">
                <thead>
                  <tr>
                    <th>Date &amp; time</th>
                    <th>Store</th>
                    <th>Game</th>
                    <th>Change</th>
                    <th>Previous</th>
                    <th>New</th>
                    <th>Changed by</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {gameHistory.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        {hasGameHistoryFilters
                          ? 'No game changes found for the selected filters.'
                          : 'No game changes recorded yet. History is tracked from when this feature is deployed.'}
                      </td>
                    </tr>
                  ) : (
                    gameHistory.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="games-manual-logs-date">{formatDate(row.createdAt)}</td>
                        <td>{row.storeCode || 'Platform'}</td>
                        <td>{row.gameName || '—'}</td>
                        <td>
                          <span className={`games-history-action games-history-action-${row.action}`}>
                            {row.actionLabel || row.action}
                          </span>
                          {row.fieldLabel && (
                            <span className="games-history-field">{row.fieldLabel}</span>
                          )}
                        </td>
                        <td>{renderGameHistoryValueCell(row, 'old')}</td>
                        <td>{renderGameHistoryValueCell(row, 'new')}</td>
                        <td>{row.changedByName || '—'}</td>
                        <td className="games-manual-logs-error-cell" title={row.details || ''}>
                          {row.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {gameHistory.total > 0 && (
                <div className="games-manual-logs-pagination">
                  <label className="games-manual-logs-perpage">
                    Show
                    <select
                      value={gameHistory.limit}
                      onChange={(e) =>
                        setGameHistory((s) => ({ ...s, limit: Number(e.target.value), page: 1 }))
                      }
                      aria-label="Rows per page"
                    >
                      {MANUAL_LOG_PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    per page
                  </label>
                  <span className="games-manual-logs-pagination-info">
                    {(gameHistory.page - 1) * gameHistory.limit + 1}–
                    {Math.min(gameHistory.page * gameHistory.limit, gameHistory.total)} of {gameHistory.total}
                  </span>
                  <div className="games-manual-logs-pagination-btns">
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={gameHistory.page <= 1}
                      onClick={() => setGameHistory((s) => ({ ...s, page: 1 }))}
                    >
                      First
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={gameHistory.page <= 1}
                      onClick={() => setGameHistory((s) => ({ ...s, page: s.page - 1 }))}
                    >
                      Prev
                    </button>
                    <span>
                      Page {gameHistory.page} of {gameHistory.totalPages || 1}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={gameHistory.page >= (gameHistory.totalPages || 1)}
                      onClick={() => setGameHistory((s) => ({ ...s, page: s.page + 1 }))}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm"
                      disabled={gameHistory.page >= (gameHistory.totalPages || 1)}
                      onClick={() =>
                        setGameHistory((s) => ({ ...s, page: gameHistory.totalPages || 1 }))
                      }
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'failureLogs' && isTechnicalStaff && (
        <>
          <div className="page-header games-manual-logs-page-header">
            <div className="games-config-header-text">
              <h2>Bot failure logs</h2>
              <p className="page-description" style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
                Deposit, redeem, and register bot failures that count toward the 3-user manual mode rule. Count (1–3) is the distinct-user position within 24 hours for that game and store.
              </p>
            </div>
            <div className="page-header-actions games-manual-logs-filters">
              <div className="dashboard-filter-bar games-manual-logs-unified-filter">
                <div className="games-manual-logs-filter-zone games-manual-logs-filter-zone-left">
                  <label className="dashboard-filter-field" htmlFor="failure-logs-game-filter">
                    <span className="dashboard-filter-field-label">Game</span>
                    <select
                      id="failure-logs-game-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={failureLogsGameFilter}
                      onChange={(e) => {
                        setFailureLogsGameFilter(e.target.value)
                        setFailureLogs((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter failure logs by game"
                    >
                      <option value="all">All games</option>
                      {gameNameFilterOptions.map(({ name }) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dashboard-filter-field" htmlFor="failure-logs-store-filter">
                    <span className="dashboard-filter-field-label">Store</span>
                    <select
                      id="failure-logs-store-filter"
                      className="dashboard-filter-input games-manual-logs-filter-select"
                      value={failureLogsStoreFilter}
                      onChange={(e) => {
                        setFailureLogsStoreFilter(e.target.value)
                        setFailureLogs((s) => ({ ...s, page: 1 }))
                      }}
                      aria-label="Filter failure logs by store"
                    >
                      <option value="all">All stores</option>
                      {storeFilterOptions.map((storeCode) => (
                        <option key={storeCode} value={storeCode}>
                          {storeCode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="games-manual-logs-filter-zone games-manual-logs-filter-zone-right">
                  <DateRangeFilter
                    embedded
                    startDate={failureLogsStartDate}
                    endDate={failureLogsEndDate}
                    onStartDateChange={(value) => {
                      setFailureLogsStartDate(value)
                      setFailureLogs((s) => ({ ...s, page: 1 }))
                    }}
                    onEndDateChange={(value) => {
                      setFailureLogsEndDate(value)
                      setFailureLogs((s) => ({ ...s, page: 1 }))
                    }}
                    onPresetClick={(range) => {
                      if (!range?.startDate || range?.endDate == null) return
                      setFailureLogsStartDate(range.startDate)
                      setFailureLogsEndDate(range.endDate)
                      setFailureLogs((s) => ({ ...s, page: 1 }))
                    }}
                    label="Date"
                  />
                </div>
              </div>
            </div>
          </div>

          {failureLogsLoading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <>
              <div className="table-wrap games-manual-logs-wrap games-failure-detail-wrap">
                <table className="admin-table games-manual-logs-table games-failure-detail-table">
                  <thead>
                    <tr>
                      <th>Date &amp; time</th>
                      <th>Store name</th>
                      <th>Game</th>
                      <th>Game username</th>
                      <th>Game store credentials</th>
                      <th>Operation</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failureLogs.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          {hasFailureLogsFilters
                            ? 'No failure records found for the selected filters.'
                            : 'No failure records yet.'}
                        </td>
                      </tr>
                    ) : (
                      failureLogs.rows.map((row) => {
                        const apiResponseText = formatBotApiResponse(row.externalResponse)
                        const credVisible = !!failureLogsCredentialsVisible[row.id]
                        return (
                          <tr key={row.id}>
                            <td className="games-manual-logs-date">{formatDate(row.createdAt)}</td>
                            <td>{row.storeName || row.storeCode || '—'}</td>
                            <td>{formatFailureGameName(row)}</td>
                            <td>{row.gameUsername ? `${row.gameUsername}(userID : ${row.platformUserId || 'Unknown'})` : (row.platformUserId ? `—(userID : ${row.platformUserId})` : '—')}</td>
                            <td className="games-manual-logs-password-cell">
                              <BotFailureCredentialsCell
                                botUsername={row.gameBotUsername}
                                botPassword={row.gameBotPassword}
                                visible={credVisible}
                                onToggle={() =>
                                  setFailureLogsCredentialsVisible((prev) => ({
                                    ...prev,
                                    [row.id]: !prev[row.id]
                                  }))
                                }
                              />
                            </td>
                            <td>{formatFailureOperation(row.operationType)}</td>
                            <td className="games-manual-logs-error-cell">
                              <pre className="games-manual-log-reason-block games-manual-log-reason-single">
                                {apiResponseText}
                              </pre>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                {failureLogs.total > 0 && (
                  <div className="games-manual-logs-pagination">
                    <label className="games-manual-logs-perpage">
                      Show
                      <select
                        value={failureLogs.limit}
                        onChange={(e) =>
                          setFailureLogs((s) => ({ ...s, limit: Number(e.target.value), page: 1 }))
                        }
                        aria-label="Rows per page"
                      >
                        {MANUAL_LOG_PAGE_SIZES.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      per page
                    </label>
                    <span className="games-manual-logs-pagination-info">
                      {(failureLogs.page - 1) * failureLogs.limit + 1}–
                      {Math.min(failureLogs.page * failureLogs.limit, failureLogs.total)} of {failureLogs.total}
                    </span>
                    <div className="games-manual-logs-pagination-btns">
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm"
                        disabled={failureLogs.page <= 1}
                        onClick={() => setFailureLogs((s) => ({ ...s, page: 1 }))}
                      >
                        First
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm"
                        disabled={failureLogs.page <= 1}
                        onClick={() => setFailureLogs((s) => ({ ...s, page: s.page - 1 }))}
                      >
                        Prev
                      </button>
                      <span>
                        Page {failureLogs.page} of {failureLogs.totalPages || 1}
                      </span>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm"
                        disabled={failureLogs.page >= (failureLogs.totalPages || 1)}
                        onClick={() => setFailureLogs((s) => ({ ...s, page: s.page + 1 }))}
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm"
                        disabled={failureLogs.page >= (failureLogs.totalPages || 1)}
                        onClick={() =>
                          setFailureLogs((s) => ({ ...s, page: failureLogs.totalPages || 1 }))
                        }
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'configs' && isMasterAdmin && (
        <>
          <div className="page-header">
            <div className="games-config-header-text">
              <h2>Game configs</h2>
              <p className="page-description" style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
                Add and manage game configs. Store admins use these configs when adding games. Active configs appear in the game dropdown.
              </p>
            </div>
            <div className="page-header-actions">
              <button type="button" className="admin-btn admin-btn-primary" onClick={openConfigAdd}>
                Create Game Config
              </button>
            </div>
          </div>
          {configLoading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Game key</th>
                    <th>Game link</th>
                    <th>Active</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {configList.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No game configs yet. Use &quot;Create Game Config&quot; to create one.</td>
                    </tr>
                  ) : (
                    configList.map((t) => (
                      <tr key={t.id}>
                        <td>{t.id}</td>
                        <td>{formatTemplateOptionLabel(t)}</td>
                        <td><code style={{ fontSize: '0.8125rem' }}>{t.gameKey ?? '—'}</code></td>
                        <td>
                          {t.gameLink ? (
                            <a href={t.gameLink} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>{t.gameLink}</a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={`games-bot-mode-badge ${t.isActive ? 'games-bot-mode-auto' : 'games-bot-mode-manual'}`}>
                            {t.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>{formatDate(t.created_at ?? t.createdAt)}</td>
                        <td>
                          <div className="games-actions">
                            <button type="button" className="admin-btn admin-btn-sm admin-btn-edit" onClick={() => openConfigEdit(t)}>Edit</button>
                            <button
                              type="button"
                              className={`admin-btn admin-btn-sm ${t.isActive ? 'admin-btn-warning' : 'admin-btn-success'}`}
                              onClick={() => handleConfigToggleActive(t)}
                              disabled={configSaving}
                              title={t.isActive ? 'Deactivate config (hide from dropdown)' : 'Activate config'}
                            >
                              {t.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {changePasswordOpen && changePasswordGame && (
        <div
          className="games-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="games-change-password-title"
          onClick={(e) => e.target === e.currentTarget && !changePasswordSaving && closeChangePassword()}
        >
          <div className="games-modal-card games-change-password-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="games-change-password-title" className="games-modal-title">
              Change game password
            </h2>
            <p className="games-change-password-desc">
              Updates the password for <strong>{changePasswordGame.name}</strong> at the game provider and in this store.
            </p>
            <form onSubmit={handleChangePasswordSubmit} className="games-modal-form">
              <div className="games-modal-field">
                <span className="games-modal-field-label-static">Game username</span>
                <div className="games-edit-current-password games-view-password-cell">
                  <span className="games-view-password-value">{changePasswordGame.botUsername ?? '—'}</span>
                </div>
              </div>
              <div className="games-modal-field">
                <label htmlFor="change-password-new">New password</label>
                <div className="games-password-input-wrap">
                  <input
                    id="change-password-new"
                    type={showChangePasswordValue ? 'text' : 'password'}
                    className="store-features-input games-password-input"
                    value={changePasswordValue}
                    onChange={(e) => setChangePasswordValue(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    required
                    disabled={changePasswordSaving}
                  />
                  <button
                    type="button"
                    className="games-password-eye-btn"
                    onClick={() => setShowChangePasswordValue((v) => !v)}
                    aria-label={showChangePasswordValue ? 'Hide password' : 'Show password'}
                    title={showChangePasswordValue ? 'Hide' : 'Show'}
                    disabled={changePasswordSaving}
                  >
                    {showChangePasswordValue ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="games-modal-field">
                <label htmlFor="change-password-confirm">Confirm new password</label>
                <div className="games-password-input-wrap">
                  <input
                    id="change-password-confirm"
                    type={showChangePasswordValue ? 'text' : 'password'}
                    className="store-features-input games-password-input"
                    value={changePasswordConfirm}
                    onChange={(e) => setChangePasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    required
                    disabled={changePasswordSaving}
                  />
                  <button
                    type="button"
                    className="games-password-eye-btn"
                    onClick={() => setShowChangePasswordValue((v) => !v)}
                    aria-label={showChangePasswordValue ? 'Hide password' : 'Show password'}
                    title={showChangePasswordValue ? 'Hide' : 'Show'}
                    disabled={changePasswordSaving}
                  >
                    {showChangePasswordValue ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="games-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeChangePassword} disabled={changePasswordSaving}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={changePasswordSaving}>
                  {changePasswordSaving ? 'Updating…' : 'Change password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="games-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="games-modal-title"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="games-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="games-modal-title" className="games-modal-title">
              {modalMode === 'view'
                ? 'Game details'
                : modalMode === 'edit'
                  ? 'Update Game'
                  : modalMode === 'add-custom'
                    ? 'Add Custom Game'
                    : 'Add Game'}
            </h2>

            {modalMode === 'view' && (
              <div className="games-view-body">
                {viewGameLoading && <div className="page-loading" style={{ padding: '1rem 0' }}>Loading…</div>}
                {!viewGameLoading && viewingGame && (
                  <>
                <div className="games-view-row"><span className="games-view-label">ID</span><span>{viewingGame.id}</span></div>
                <div className="games-view-row"><span className="games-view-label">Name</span><span>{viewingGame.name ?? '—'}</span></div>
                {viewingGame.imageUrl && (
                  <div className="games-view-row">
                    <span className="games-view-label">Image</span>
                    <span>
                      <img src={viewingGame.imageUrl} alt={viewingGame.name || 'Game'} className="games-image-thumb" />
                    </span>
                  </div>
                )}
                {isMasterAdmin && (
                  <div className="games-view-row"><span className="games-view-label">Added by store</span><span>{viewingGame.addedByStoreCode ?? 'Platform'}</span></div>
                )}
                <div className="games-view-row"><span className="games-view-label">Integration</span><span>{viewingGame.integrationLabel || (isCustomManualGame(viewingGame) ? 'Custom' : viewingGame.botType) || '—'}</span></div>
                <div className="games-view-row"><span className="games-view-label">API mode</span><span>{getGameApiModeLabel(viewingGame)}</span></div>
                {!isCustomManualGame(viewingGame) && (
                  <>
                <div className="games-view-row">
                  <span className="games-view-label">
                    {isTerminalAgentGame(viewingGame) ? 'Agent name' : 'Game username'}
                  </span>
                  <span>{viewingGame.botUsername ?? '—'}</span>
                </div>
                {isGoldenDragonGameName(viewingGame.name) && (
                  <div className="games-view-row">
                    <span className="games-view-label">Kiosk ID</span>
                    <span>{viewingGame.kioskId ?? '—'}</span>
                  </div>
                )}
                <div className="games-view-row games-view-row-password">
                  <span className="games-view-label">
                    {isTerminalAgentGame(viewingGame) ? 'Agent password' : 'Game password'}
                  </span>
                  <div className="games-view-password-cell">
                    <span className="games-view-password-value">
                      {viewingGame.botPassword == null || viewingGame.botPassword === ''
                        ? '—'
                        : showGamePassword
                          ? viewingGame.botPassword
                          : '••••••••'}
                    </span>
                    {viewingGame.botPassword != null && viewingGame.botPassword !== '' && (
                      <button
                        type="button"
                        className="games-view-password-toggle"
                        onClick={() => setShowGamePassword((v) => !v)}
                        aria-label={showGamePassword ? 'Hide password' : 'Show password'}
                        title={showGamePassword ? 'Hide password' : 'Show password'}
                      >
                        {showGamePassword ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                  </>
                )}
                <div className="games-view-row"><span className="games-view-label">Min withdrawal limit</span><span>{viewingGame.minWithdrawalLimit ?? '—'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Max withdrawal limit</span><span>{viewingGame.maxWithdrawalLimit ?? '—'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Min deposit limit</span><span>{viewingGame.minDepositLimit ?? '—'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Max deposit limit</span><span>{viewingGame.maxDepositLimit > 0 ? viewingGame.maxDepositLimit : '∞'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Deposit discount</span><span>{Number(viewingGame.depositDiscountPercent) > 0 ? `${Number(viewingGame.depositDiscountPercent)}%` : 'None'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Platform game URL</span><span>{viewingGame.platformGameUrl ? <a href={viewingGame.platformGameUrl} target="_blank" rel="noopener noreferrer">{viewingGame.platformGameUrl}</a> : '—'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Active</span><span>{viewingGame.isActive ? 'Yes' : 'No'}</span></div>
                <div className="games-view-row">
                  <span className="games-view-label">Game mode</span>
                  <div className="games-mode-badges">
                    <span className={`games-bot-mode-badge ${viewingGame.botOffline ? 'games-bot-mode-manual' : 'games-bot-mode-auto'}`}>
                      {viewingGame.botOffline ? 'Manual' : 'Automated'}
                    </span>
                    {viewingGame.manualRedeemOnly && (
                      <span className="games-bot-mode-badge games-bot-mode-redeem-manual">
                        Redeem manual
                      </span>
                    )}
                  </div>
                </div>
                <div className="games-view-row"><span className="games-view-label">Display order</span><span>{viewingGame.displayOrder ?? '—'}</span></div>
                <div className="games-view-row"><span className="games-view-label">Created</span><span>{formatDate(viewingGame.createdAt ?? viewingGame.created_at)}</span></div>
                <div className="games-modal-actions" style={{ marginTop: '1rem' }}>
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={closeModal}>Close</button>
                </div>
                  </>
                )}
              </div>
            )}

            {modalMode === 'edit' && (
              <form onSubmit={handleEditSubmit} className="games-modal-form">
                {editGameLoading && (
                  <p className="games-modal-hint" style={{ marginTop: 0 }}>Loading current credentials…</p>
                )}
                <div className="games-modal-field">
                  <label htmlFor="edit-name">Game name</label>
                  <input id="edit-name" name="name" type="text" className="store-features-input" value={editForm.name} onChange={handleEditChange} required disabled={editGameLoading} />
                </div>
                <div className="games-modal-field">
                  <label htmlFor="edit-platformGameUrl">Platform game URL</label>
                  <input id="edit-platformGameUrl" name="platformGameUrl" type="url" className="store-features-input" value={editForm.platformGameUrl} onChange={handleEditChange} required={isCustomManualGame(editForm)} disabled={editGameLoading} />
                </div>
                {isCustomManualGame(editForm) && (
                  <div className="games-modal-field">
                    <label>Game image</label>
                    <div className="games-image-upload">
                      {editForm.imageUrl ? (
                        <div className="games-image-preview">
                          <img src={editForm.imageUrl} alt="Game preview" />
                        </div>
                      ) : (
                        <div className="games-image-empty">No image yet</div>
                      )}
                      <div className="games-image-upload-actions">
                        <label className="admin-btn admin-btn-secondary games-image-upload-btn">
                          {uploadingGameImage ? 'Uploading…' : editForm.imageUrl ? 'Replace image' : 'Upload image'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                            hidden
                            disabled={uploadingGameImage || saving || editGameLoading}
                            onChange={handleEditCustomImageUpload}
                          />
                        </label>
                      </div>
                    </div>
                    <p className="games-modal-hint">Required. PNG, JPG, WEBP, or GIF up to 5MB.</p>
                  </div>
                )}
                {!isCustomManualGame(editForm) && (
                  <>
                <div className="games-modal-field">
                  <label htmlFor="edit-gameUsername">
                    {isTerminalAgentGame(editForm) ? 'Agent name' : 'Game username (store)'}
                  </label>
                  <input
                    id="edit-gameUsername"
                    name="gameUsername"
                    type="text"
                    className="store-features-input"
                    value={editForm.gameUsername}
                    onChange={handleEditChange}
                    required
                    autoComplete="off"
                    placeholder={
                      isFirekirinTerminalGame(editForm)
                        ? 'Firekirin agentName'
                        : (isMilkywayTerminalGame(editForm)
                          ? 'Milkyway agentName'
                          : (isGameroomAgentGame(editForm)
                            ? 'Gameroom agent username'
                            : (isCashmachineAgentGame(editForm)
                              ? 'CashMachine777 agent username'
                              : (isOrionStarsTerminalGame(editForm) ? 'OrionStars agentName' : 'Provider client username'))))
                    }
                    disabled={editGameLoading}
                  />
                </div>
                <div className="games-modal-field">
                  <label htmlFor="edit-gamePassword">
                    {isTerminalAgentGame(editForm) ? 'Agent password (optional)' : 'Game password (optional)'}
                  </label>
                  <input
                    id="edit-gamePassword"
                    name="gamePassword"
                    type="password"
                    className="store-features-input"
                    value={editForm.gamePassword}
                    onChange={handleEditChange}
                    autoComplete="off"
                    placeholder="Leave blank to keep current"
                    disabled={editGameLoading}
                  />
                  <p className="games-modal-hint">
                    {isTerminalAgentGame(editForm)
                      ? 'Agent password used for agentLogin. Leave blank to keep the current password.'
                      : 'Enter this when changing the store username or switching to a config that uses different credentials.'}
                  </p>
                </div>
                  </>
                )}
                {!isCustomManualGame(editForm) && isOrionStarsGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-orionStarsApiMode">OrionStars API mode</label>
                      <select
                        id="edit-orionStarsApiMode"
                        name="orionStarsApiMode"
                        className="store-features-input"
                        value={editForm.orionStarsApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isOrionStarsBotAutomationGame(editForm) ? 'Bot automation API' : 'Agent API'}.
                      </p>
                    </div>
                    {editForm.orionStarsApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-orionStarsGameTemplateId">Apply OrionStars config</label>
                        <select
                          id="edit-orionStarsGameTemplateId"
                          name="orionStarsGameTemplateId"
                          className="store-features-input"
                          value={editForm.orionStarsGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getOrionStarsTemplatesForMode(editForm.orionStarsApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place, keeps the store display name (Orionstars), and keeps all linked user OrionStars accounts.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {isMilkywayGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-milkywayApiMode">Milkyway API mode</label>
                      <select
                        id="edit-milkywayApiMode"
                        name="milkywayApiMode"
                        className="store-features-input"
                        value={editForm.milkywayApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isMilkywayTerminalGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different Milkyway config on this store game.
                      </p>
                    </div>
                    {editForm.milkywayApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-milkywayGameTemplateId">Apply Milkyway config</label>
                        <select
                          id="edit-milkywayGameTemplateId"
                          name="milkywayGameTemplateId"
                          className="store-features-input"
                          value={editForm.milkywayGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getMilkywayTemplatesForMode(editForm.milkywayApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Milkyway accounts.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {isFirekirinGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-firekirinApiMode">Firekirin API mode</label>
                      <select
                        id="edit-firekirinApiMode"
                        name="firekirinApiMode"
                        className="store-features-input"
                        value={editForm.firekirinApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isFirekirinTerminalGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different Firekirin config on this store game.
                      </p>
                    </div>
                    {editForm.firekirinApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-firekirinGameTemplateId">Apply Firekirin config</label>
                        <select
                          id="edit-firekirinGameTemplateId"
                          name="firekirinGameTemplateId"
                          className="store-features-input"
                          value={editForm.firekirinGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getFirekirinTemplatesForMode(editForm.firekirinApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Firekirin accounts.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {isGameroomGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-gameroomApiMode">Gameroom API mode</label>
                      <select
                        id="edit-gameroomApiMode"
                        name="gameroomApiMode"
                        className="store-features-input"
                        value={editForm.gameroomApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isGameroomAgentGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different Gameroom config on this store game.
                      </p>
                    </div>
                    {editForm.gameroomApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-gameroomGameTemplateId">Apply Gameroom config</label>
                        <select
                          id="edit-gameroomGameTemplateId"
                          name="gameroomGameTemplateId"
                          className="store-features-input"
                          value={editForm.gameroomGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getGameroomTemplatesForMode(editForm.gameroomApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Gameroom accounts.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {isCashmachineGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-cashmachineApiMode">CashMachine777 API mode</label>
                      <select
                        id="edit-cashmachineApiMode"
                        name="cashmachineApiMode"
                        className="store-features-input"
                        value={editForm.cashmachineApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isCashmachineAgentGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different CashMachine777 config on this store game.
                      </p>
                    </div>
                    {editForm.cashmachineApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-cashmachineGameTemplateId">Apply CashMachine777 config</label>
                        <select
                          id="edit-cashmachineGameTemplateId"
                          name="cashmachineGameTemplateId"
                          className="store-features-input"
                          value={editForm.cashmachineGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getCashmachineTemplatesForMode(editForm.cashmachineApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user CashMachine777 accounts.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!isCustomManualGame(editForm) && isGameVaultFamilyGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-gameVaultApiMode">Game Vault API mode</label>
                      <select
                        id="edit-gameVaultApiMode"
                        name="gameVaultApiMode"
                        className="store-features-input"
                        value={editForm.gameVaultApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isGameVaultAgentGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different Game Vault config on this store game.
                      </p>
                    </div>
                    {editForm.gameVaultApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-gameVaultGameTemplateId">Apply Game Vault config</label>
                        <select
                          id="edit-gameVaultGameTemplateId"
                          name="gameVaultGameTemplateId"
                          className="store-features-input"
                          value={editForm.gameVaultGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getGameVaultTemplatesForMode(editForm.gameVaultApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Game Vault accounts.
                          {editForm.gameVaultApiMode === 'agent' ? ' Enter Agent ID and API secret key below when switching to Agent API.' : ''}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!isCustomManualGame(editForm) && isJuwa20FamilyGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-juwa20ApiMode">Juwa 2.0 API mode</label>
                      <select
                        id="edit-juwa20ApiMode"
                        name="juwa20ApiMode"
                        className="store-features-input"
                        value={editForm.juwa20ApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="agent">Agent API</option>
                        <option value="bot">Bot automation API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isJuwa20AgentGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different Juwa 2.0 config on this store game.
                      </p>
                    </div>
                    {editForm.juwa20ApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-juwa20GameTemplateId">Apply Juwa 2.0 config</label>
                        <select
                          id="edit-juwa20GameTemplateId"
                          name="juwa20GameTemplateId"
                          className="store-features-input"
                          value={editForm.juwa20GameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getJuwa20TemplatesForMode(editForm.juwa20ApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Juwa 2.0 accounts.
                          {editForm.juwa20ApiMode === 'agent' ? ' Enter Agent ID and API secret key below when switching to Agent API.' : ''}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!isCustomManualGame(editForm) && isJuwaStoreGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-juwaApiMode">Juwa API mode</label>
                      <select
                        id="edit-juwaApiMode"
                        name="juwaApiMode"
                        className="store-features-input"
                        value={editForm.juwaApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="bot">Bot automation API</option>
                        <option value="agent">Agent API</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isJuwaAgentGame(editForm) ? 'Agent API' : 'Bot automation API'}.
                        Switch to apply a different Juwa config on this store game.
                      </p>
                    </div>
                    {editForm.juwaApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-juwaGameTemplateId">Apply Juwa config</label>
                        <select
                          id="edit-juwaGameTemplateId"
                          name="juwaGameTemplateId"
                          className="store-features-input"
                          value={editForm.juwaGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getJuwaTemplatesForMode(editForm.juwaApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Juwa accounts.
                          {editForm.juwaApiMode === 'agent' ? ' Enter Agent ID and API secret key below when switching to Agent API.' : ''}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!isCustomManualGame(editForm) && isPandamasterStoreGame(editForm) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-pandamasterApiMode">Pandamaster API mode</label>
                      <select
                        id="edit-pandamasterApiMode"
                        name="pandamasterApiMode"
                        className="store-features-input"
                        value={editForm.pandamasterApiMode}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                      >
                        <option value="">Keep current mode</option>
                        <option value="legacy">Legacy bot</option>
                        <option value="newbot">new pandamaster bot</option>
                      </select>
                      <p className="games-modal-hint">
                        Current mode: {isPandamasterNewBotGame(editForm) ? 'new pandamaster bot' : 'Legacy bot'}.
                        Switch to apply a different Pandamaster config on this store game.
                      </p>
                    </div>
                    {editForm.pandamasterApiMode && (
                      <div className="games-modal-field">
                        <label htmlFor="edit-pandamasterGameTemplateId">Apply Pandamaster config</label>
                        <select
                          id="edit-pandamasterGameTemplateId"
                          name="pandamasterGameTemplateId"
                          className="store-features-input"
                          value={editForm.pandamasterGameTemplateId}
                          onChange={handleEditChange}
                          required
                          disabled={editGameLoading}
                        >
                          <option value="">Select config…</option>
                          {getPandamasterTemplatesForMode(editForm.pandamasterApiMode).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} ({template.gameKey || 'no key'})
                            </option>
                          ))}
                        </select>
                        <p className="games-modal-hint">
                          This switches the existing store game in place and keeps all linked user Pandamaster accounts.
                          Enter the store game password above when switching modes.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {!isCustomManualGame(editForm) && isVegasXGame(editForm) && (
                  <div className="games-modal-field">
                    <label>VegasX API mode</label>
                    <p className="games-modal-hint" style={{ marginTop: 0 }}>
                      VegasX uses <strong>Agent API</strong> (cashier login) for all stores — there is no bot automation mode to switch.
                    </p>
                  </div>
                )}
                {!isCustomManualGame(editForm) && isGoldenDragonGameName(editForm.name) && (
                  <div className="games-modal-field">
                    <label htmlFor="edit-kioskId">Kiosk ID (7 digits from POS URL)</label>
                    <input
                      id="edit-kioskId"
                      name="kioskId"
                      type="text"
                      inputMode="numeric"
                      maxLength={7}
                      pattern="\d{7}"
                      className="store-features-input"
                      value={editForm.kioskId}
                      onChange={handleEditChange}
                      required
                      placeholder="e.g. 2787443"
                      disabled={editGameLoading}
                    />
                    <p className="games-modal-hint">
                      From your Golden Dragon POS login URL (e.g. <code>https://pos.goldendragoncity.com/pos/2787443</code> → <code>2787443</code>).
                    </p>
                  </div>
                )}
                {!isCustomManualGame(editForm) && isSimpleGame(editForm.name) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-appId">App ID</label>
                      <input
                        id="edit-appId"
                        name="appId"
                        type="text"
                        className="store-features-input"
                        value={editForm.appId}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                        placeholder="App ID"
                      />
                    </div>
                    <div className="games-modal-field">
                      <label htmlFor="edit-appSecret">App Secret</label>
                      <input
                        id="edit-appSecret"
                        name="appSecret"
                        type="password"
                        className="store-features-input"
                        value={editForm.appSecret}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                        placeholder="Leave blank to keep current"
                        autoComplete="off"
                      />
                      <p className="games-modal-hint">Leave blank to keep the existing app secret.</p>
                    </div>
                  </>
                )}
                {!isCustomManualGame(editForm) && (
                  isAgentCredentialGame(editForm)
                  || editForm.gameVaultApiMode === 'agent'
                  || editForm.juwa20ApiMode === 'agent'
                  || editForm.juwaApiMode === 'agent'
                ) && (
                  <>
                    <div className="games-modal-field">
                      <label htmlFor="edit-agentId">Agent ID</label>
                      <input
                        id="edit-agentId"
                        name="agentId"
                        type="text"
                        className="store-features-input"
                        value={editForm.agentId}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                        placeholder="e.g. 1596"
                      />
                    </div>
                    <div className="games-modal-field">
                      <label htmlFor="edit-apiSecretKey">API Secret Key</label>
                      <input
                        id="edit-apiSecretKey"
                        name="apiSecretKey"
                        type="password"
                        className="store-features-input"
                        value={editForm.apiSecretKey}
                        onChange={handleEditChange}
                        disabled={editGameLoading}
                        placeholder="Leave blank to keep current"
                        autoComplete="off"
                      />
                      <p className="games-modal-hint">Leave blank to keep the existing API secret key.</p>
                    </div>
                  </>
                )}
                <div className="games-modal-row">
                  <div className="games-modal-field">
                    <label htmlFor="edit-minWithdrawalLimit">Min withdrawal limit</label>
                    <input id="edit-minWithdrawalLimit" name="minWithdrawalLimit" type="number" min={0} step="0.01" className="store-features-input" value={editForm.minWithdrawalLimit === '' ? '' : editForm.minWithdrawalLimit} onChange={handleEditChange} disabled={editGameLoading} />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="edit-maxWithdrawalLimit">Max withdrawal limit</label>
                    <input id="edit-maxWithdrawalLimit" name="maxWithdrawalLimit" type="number" min={0} step="0.01" className="store-features-input" value={editForm.maxWithdrawalLimit === '' ? '' : editForm.maxWithdrawalLimit} onChange={handleEditChange} disabled={editGameLoading} />
                  </div>
                </div>
                <div className="games-modal-row">
                  <div className="games-modal-field">
                    <label htmlFor="edit-minDepositLimit">Min deposit limit</label>
                    <input id="edit-minDepositLimit" name="minDepositLimit" type="number" min={0} step="0.01" className="store-features-input" value={editForm.minDepositLimit === '' ? '' : editForm.minDepositLimit} onChange={handleEditChange} disabled={editGameLoading} />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="edit-maxDepositLimit">Max deposit limit (0 = unlimited)</label>
                    <input id="edit-maxDepositLimit" name="maxDepositLimit" type="number" min={0} step="0.01" className="store-features-input" value={editForm.maxDepositLimit === '' ? '' : editForm.maxDepositLimit} onChange={handleEditChange} disabled={editGameLoading} />
                  </div>
                </div>
                {showEditDepositDiscount && (
                <div className="games-modal-field">
                  <label htmlFor="edit-depositDiscountPercent">Deposit discount (%)</label>
                  <input id="edit-depositDiscountPercent" name="depositDiscountPercent" type="number" min={0} max={100} step="0.01" className="store-features-input" value={editForm.depositDiscountPercent === '' ? '' : editForm.depositDiscountPercent} onChange={handleEditChange} disabled={editGameLoading} />
                  <p className="games-modal-hint">Wallet still pays the entered amount. 10% on a 10 SC top-up credits 11 SC in the game. 0 = no extra credit.</p>
                </div>
                )}
                <div className="games-modal-field">
                  <label htmlFor="edit-displayOrder">Display order</label>
                  <input id="edit-displayOrder" name="displayOrder" type="number" min={0} className="store-features-input" value={editForm.displayOrder === '' ? '' : editForm.displayOrder} onChange={handleEditChange} disabled={editGameLoading} />
                </div>
                <div className="games-modal-field games-modal-field-checkbox">
                  <label>
                    <input type="checkbox" name="isActive" checked={editForm.isActive} onChange={handleEditChange} disabled={editGameLoading} />
                    <span>Active</span>
                  </label>
                </div>
                <div className="games-modal-actions">
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || editGameLoading || uploadingGameImage}>{saving ? 'Updating…' : 'Update Game'}</button>
                </div>
              </form>
            )}

            {modalMode === 'add' && (
            <form onSubmit={handleSubmit} className="games-modal-form">
              {isMasterAdmin && (
                <div className="games-modal-field">
                  <label htmlFor="add-game-store">Store</label>
                  <select
                    id="add-game-store"
                    name="storeCode"
                    className="store-features-input"
                    value={form.storeCode}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select a store…</option>
                    {storeOptions.map((s) => (
                      <option
                        key={s.distributorCode ? `${s.distributorCode}:${s.storeCode}` : s.storeCode}
                        value={s.storeCode}
                      >
                        {s.label}{s.distributorCode ? ` · ${s.distributorCode}` : ''}
                      </option>
                    ))}
                  </select>
                  {storeOptions.length === 0 && (
                    <p className="games-modal-hint">No stores found. Create a store first or check your access.</p>
                  )}
                </div>
              )}
              <div className="games-modal-field">
                <label htmlFor="gameTemplateId">Game</label>
                <select
                  id="gameTemplateId"
                  name="gameTemplateId"
                  className="store-features-input"
                  value={form.gameTemplateId}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a game…</option>
                  {gameTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {isJuwaFamilyGame(t)
                        ? (isJuwaAgentGame(t) ? 'Juwa (Agent)' : 'Juwa (Bot)')
                        : formatTemplateOptionLabel(t)}
                    </option>
                  ))}
                </select>
                {gameTemplates.length === 0 && (
                  <p className="games-modal-hint">No game templates configured. Contact your administrator.</p>
                )}
              </div>
              {selectedTemplate && (isJuwaFamilyGame(selectedTemplate) || isJuwaNewBotGame(selectedTemplate)) && (
                <div className="games-modal-field">
                  <label htmlFor="add-juwaApiMode">Juwa API mode</label>
                  <select
                    id="add-juwaApiMode"
                    name="juwaApiMode"
                    className="store-features-input"
                    value={form.juwaApiMode || (isJuwaAgentGame(selectedTemplate) ? 'agent' : 'bot')}
                    onChange={handleChange}
                    required
                  >
                    <option value="bot">Bot automation API</option>
                    <option value="agent">Agent API</option>
                  </select>
                  <p className="games-modal-hint">
                    Choose Bot or Agent for this Juwa store game. Agent API uses Agent ID and API secret key.
                  </p>
                </div>
              )}
              {selectedTemplate?.gameLink && (
                <div className="games-modal-field">
                  <label>Game link</label>
                  <p className="games-modal-readonly-link">
                    <a href={selectedTemplate.gameLink} target="_blank" rel="noopener noreferrer">
                      {selectedTemplate.gameLink}
                    </a>
                  </p>
                </div>
              )}
              <div className="games-modal-field">
                <label htmlFor="gameUsername">
                  {selectedTemplate && isTerminalAgentGame(selectedTemplate) ? 'Agent name' : 'Game username'}
                </label>
                <input
                  id="gameUsername"
                  name="gameUsername"
                  type="text"
                  className="store-features-input"
                  value={form.gameUsername}
                  onChange={handleChange}
                  required
                  placeholder={
                    selectedTemplate && isFirekirinTerminalGame(selectedTemplate)
                      ? 'Enter Firekirin agentName'
                      : (selectedTemplate && isMilkywayTerminalGame(selectedTemplate)
                        ? 'Enter Milkyway agentName'
                        : (selectedTemplate && isGameroomAgentGame(selectedTemplate)
                          ? 'Enter Gameroom agent username'
                          : (selectedTemplate && isCashmachineAgentGame(selectedTemplate)
                            ? 'Enter CashMachine777 agent username'
                            : (selectedTemplate && isMafiaAgentGame(selectedTemplate)
                              ? 'Enter Mafia agent username'
                              : (selectedTemplate && isOrionStarsTerminalGame(selectedTemplate)
                                ? 'Enter OrionStars agentName'
                                : 'Enter game username')))))
                  }
                />
                {selectedTemplate && isOrionStarsTerminalGame(selectedTemplate) && (
                  <p className="games-modal-hint">
                    OrionStars Terminal API uses agentName + agentPasswd (no Agent ID or API secret key).
                  </p>
                )}
                {selectedTemplate && isFirekirinTerminalGame(selectedTemplate) && (
                  <p className="games-modal-hint">
                    Firekirin Agent API uses agentName + agentPasswd (no Agent ID or API secret key).
                  </p>
                )}
                {selectedTemplate && isMilkywayTerminalGame(selectedTemplate) && (
                  <p className="games-modal-hint">
                    Milkyway Agent API uses agentName + agentPasswd (no Agent ID or API secret key).
                  </p>
                )}
                {selectedTemplate && isGameroomAgentGame(selectedTemplate) && (
                  <p className="games-modal-hint">
                    Gameroom Agent API uses agent username + password from the official agent server (no Agent ID or API secret key).
                  </p>
                )}
                {selectedTemplate && isCashmachineAgentGame(selectedTemplate) && (
                  <p className="games-modal-hint">
                    CashMachine777 Agent API uses agent username + password from the official agent server (no Agent ID or API secret key).
                  </p>
                )}
                {selectedTemplate && isMafiaAgentGame(selectedTemplate) && (
                  <p className="games-modal-hint">
                    Mafia Agent API uses agent username + password from the official agent server (no Agent ID or API secret key).
                  </p>
                )}
              </div>
              <div className="games-modal-field">
                <label htmlFor="gamePassword">
                  {selectedTemplate && isTerminalAgentGame(selectedTemplate) ? 'Agent password' : 'Game password'}
                </label>
                <div className="games-password-input-wrap">
                  <input
                    id="gamePassword"
                    name="gamePassword"
                    type={showAddGamePassword ? 'text' : 'password'}
                    className="store-features-input games-password-input"
                    value={form.gamePassword}
                    onChange={handleChange}
                    required
                    placeholder={
                      selectedTemplate && isFirekirinTerminalGame(selectedTemplate)
                        ? 'Enter Firekirin agentPasswd'
                        : (selectedTemplate && isMilkywayTerminalGame(selectedTemplate)
                          ? 'Enter Milkyway agentPasswd'
                          : (selectedTemplate && isGameroomAgentGame(selectedTemplate)
                            ? 'Enter Gameroom agent password'
                            : (selectedTemplate && isCashmachineAgentGame(selectedTemplate)
                              ? 'Enter CashMachine777 agent password'
                              : (selectedTemplate && isMafiaAgentGame(selectedTemplate)
                                ? 'Enter Mafia agent password'
                                : (selectedTemplate && isOrionStarsTerminalGame(selectedTemplate)
                                  ? 'Enter OrionStars agentPasswd'
                                  : 'Enter game password')))))
                    }
                  />
                  <button
                    type="button"
                    className="games-password-eye-btn"
                    onClick={() => setShowAddGamePassword((v) => !v)}
                    aria-label={showAddGamePassword ? 'Hide game password' : 'Show game password'}
                    title={showAddGamePassword ? 'Hide' : 'Show'}
                  >
                    {showAddGamePassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {selectedTemplate && isGoldenDragonTemplate(selectedTemplate) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="goldenDragonMoneybox">Moneybox (drawer)</label>
                    <input
                      id="goldenDragonMoneybox"
                      name="moneybox"
                      type="number"
                      min={1}
                      step={1}
                      className="store-features-input"
                      value={form.moneybox}
                      onChange={handleChange}
                      required
                      placeholder="e.g. 2"
                    />
                    <p className="games-modal-hint">
                      Sent to the game provider as <code>moneybox</code>. Defaults from your store drawer when you pick Golden Dragon — set it under Profile (main store account) or your distributor can set it when editing your store.
                    </p>
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="goldenDragonKioskId">Kiosk ID (7 digits from POS URL)</label>
                    <input
                      id="goldenDragonKioskId"
                      name="kioskId"
                      type="text"
                      inputMode="numeric"
                      maxLength={7}
                      pattern="\d{7}"
                      className="store-features-input"
                      value={form.kioskId}
                      onChange={handleChange}
                      required
                      placeholder="e.g. 2787443"
                    />
                    <p className="games-modal-hint">
                      Open your Golden Dragon POS login link (e.g.{' '}
                      <code>https://pos.goldendragoncity.com/pos/2787443</code>
                      ) and enter the <strong>7-digit number at the end of the URL</strong> as{' '}
                      <code>kiosk_id</code> (example: <code>2787443</code>).
                    </p>
                  </div>
                </>
              )}
              {selectedTemplate && isSimpleGame(selectedTemplate.name) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gameAppId">App ID</label>
                    <input
                      id="gameAppId"
                      name="appId"
                      type="text"
                      className="store-features-input"
                      value={form.appId}
                      onChange={handleChange}
                      required
                      placeholder="Enter app ID"
                    />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="gameAppSecret">App Secret</label>
                    <div className="games-password-input-wrap">
                      <input
                        id="gameAppSecret"
                        name="appSecret"
                        type={showAddAppSecret ? 'text' : 'password'}
                        className="store-features-input games-password-input"
                        value={form.appSecret}
                        onChange={handleChange}
                        required
                        placeholder="Enter app secret"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="games-password-eye-btn"
                        onClick={() => setShowAddAppSecret((v) => !v)}
                        aria-label={showAddAppSecret ? 'Hide app secret' : 'Show app secret'}
                        title={showAddAppSecret ? 'Hide' : 'Show'}
                      >
                        {showAddAppSecret ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {selectedTemplate && isAgentCredentialGame(selectedTemplate) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gameAgentId">Agent ID</label>
                    <input
                      id="gameAgentId"
                      name="agentId"
                      type="text"
                      className="store-features-input"
                      value={form.agentId}
                      onChange={handleChange}
                      required
                      placeholder="e.g. 1596"
                    />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="gameApiSecretKey">API Secret Key</label>
                    <div className="games-password-input-wrap">
                      <input
                        id="gameApiSecretKey"
                        name="apiSecretKey"
                        type={showAddApiSecretKey ? 'text' : 'password'}
                        className="store-features-input games-password-input"
                        value={form.apiSecretKey}
                        onChange={handleChange}
                        required
                        placeholder="Enter API secret key"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="games-password-eye-btn"
                        onClick={() => setShowAddApiSecretKey((v) => !v)}
                        aria-label={showAddApiSecretKey ? 'Hide API secret key' : 'Show API secret key'}
                        title={showAddApiSecretKey ? 'Hide' : 'Show'}
                      >
                        {showAddApiSecretKey ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="games-modal-row">
                <div className="games-modal-field">
                  <label htmlFor="minWithdrawalLimit">Min withdrawal limit</label>
                  <input
                    id="minWithdrawalLimit"
                    name="minWithdrawalLimit"
                    type="number"
                    min={0}
                    step="0.01"
                    className="store-features-input"
                    value={form.minWithdrawalLimit === '' ? '' : form.minWithdrawalLimit}
                    onChange={handleChange}
                    placeholder="0"
                  />
                </div>
                <div className="games-modal-field">
                  <label htmlFor="maxWithdrawalLimit">Max withdrawal limit</label>
                  <input
                    id="maxWithdrawalLimit"
                    name="maxWithdrawalLimit"
                    type="number"
                    min={0}
                    step="0.01"
                    className="store-features-input"
                    value={form.maxWithdrawalLimit === '' ? '' : form.maxWithdrawalLimit}
                    onChange={handleChange}
                    placeholder="500"
                  />
                </div>
              </div>
              <div className="games-modal-row">
                <div className="games-modal-field">
                  <label htmlFor="minDepositLimit">Min deposit limit</label>
                  <input
                    id="minDepositLimit"
                    name="minDepositLimit"
                    type="number"
                    min={0}
                    step="0.01"
                    className="store-features-input"
                    value={form.minDepositLimit === '' ? '' : form.minDepositLimit}
                    onChange={handleChange}
                    placeholder="0"
                  />
                </div>
                <div className="games-modal-field">
                  <label htmlFor="maxDepositLimit">Max deposit limit (0 = unlimited)</label>
                  <input
                    id="maxDepositLimit"
                    name="maxDepositLimit"
                    type="number"
                    min={0}
                    step="0.01"
                    className="store-features-input"
                    value={form.maxDepositLimit === '' ? '' : form.maxDepositLimit}
                    onChange={handleChange}
                    placeholder="0"
                  />
                </div>
              </div>
              {showAddDepositDiscount && (
              <div className="games-modal-field">
                <label htmlFor="depositDiscountPercent">Deposit discount (%)</label>
                <input
                  id="depositDiscountPercent"
                  name="depositDiscountPercent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="store-features-input"
                  value={form.depositDiscountPercent === '' ? '' : form.depositDiscountPercent}
                  onChange={handleChange}
                  placeholder="0"
                />
                <p className="games-modal-hint">Wallet still pays the entered amount. 10% on a 10 SC top-up credits 11 SC in the game. 0 = no extra credit.</p>
              </div>
              )}
              <div className="games-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                  {saving ? 'Adding…' : 'Add Game'}
                </button>
              </div>
            </form>
            )}

            {modalMode === 'add-custom' && (
              <form onSubmit={handleCustomSubmit} className="games-modal-form">
                <p className="games-modal-hint" style={{ marginTop: 0 }}>
                  Custom games have no agent/bot APIs. Register, deposit, and redeem requests are always handled manually.
                </p>
                {isMasterAdmin && (
                  <div className="games-modal-field">
                    <label htmlFor="custom-game-store">Store</label>
                    <select
                      id="custom-game-store"
                      name="storeCode"
                      className="store-features-input"
                      value={customForm.storeCode}
                      onChange={handleCustomChange}
                      required
                    >
                      <option value="">Select a store…</option>
                      {storeOptions.map((s) => (
                        <option
                          key={s.distributorCode ? `${s.distributorCode}:${s.storeCode}` : s.storeCode}
                          value={s.storeCode}
                        >
                          {s.label}{s.distributorCode ? ` · ${s.distributorCode}` : ''}
                        </option>
                      ))}
                    </select>
                    {storeOptions.length === 0 && (
                      <p className="games-modal-hint">No stores found. Create a store first or check your access.</p>
                    )}
                  </div>
                )}
                <div className="games-modal-field">
                  <label htmlFor="custom-gameName">Game name</label>
                  <input
                    id="custom-gameName"
                    name="gameName"
                    type="text"
                    className="store-features-input"
                    value={customForm.gameName}
                    onChange={handleCustomChange}
                    required
                    placeholder="Enter game name"
                  />
                </div>
                <div className="games-modal-field">
                  <label htmlFor="custom-gameLink">Game link</label>
                  <input
                    id="custom-gameLink"
                    name="gameLink"
                    type="url"
                    className="store-features-input"
                    value={customForm.gameLink}
                    onChange={handleCustomChange}
                    required
                    placeholder="https://…"
                  />
                </div>
                <div className="games-modal-field">
                  <label>Game image</label>
                  <div className="games-image-upload">
                    {customForm.imageUrl ? (
                      <div className="games-image-preview">
                        <img src={customForm.imageUrl} alt="Game preview" />
                      </div>
                    ) : (
                      <div className="games-image-empty">No image yet</div>
                    )}
                    <div className="games-image-upload-actions">
                      <label className="admin-btn admin-btn-secondary games-image-upload-btn">
                        {uploadingGameImage ? 'Uploading…' : customForm.imageUrl ? 'Replace image' : 'Upload image'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                          hidden
                          disabled={uploadingGameImage || saving}
                          onChange={handleCustomImageUpload}
                        />
                      </label>
                      {customForm.imageUrl && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          disabled={uploadingGameImage || saving}
                          onClick={() => setCustomForm((prev) => ({ ...prev, imageUrl: '' }))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="games-modal-hint">Required. PNG, JPG, WEBP, or GIF up to 5MB.</p>
                </div>
                <div className="games-modal-row">
                  <div className="games-modal-field">
                    <label htmlFor="custom-minWithdrawalLimit">Min withdrawal limit</label>
                    <input
                      id="custom-minWithdrawalLimit"
                      name="minWithdrawalLimit"
                      type="number"
                      min={0}
                      step="0.01"
                      className="store-features-input"
                      value={customForm.minWithdrawalLimit === '' ? '' : customForm.minWithdrawalLimit}
                      onChange={handleCustomChange}
                      placeholder="0"
                    />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="custom-maxWithdrawalLimit">Max withdrawal limit</label>
                    <input
                      id="custom-maxWithdrawalLimit"
                      name="maxWithdrawalLimit"
                      type="number"
                      min={0}
                      step="0.01"
                      className="store-features-input"
                      value={customForm.maxWithdrawalLimit === '' ? '' : customForm.maxWithdrawalLimit}
                      onChange={handleCustomChange}
                      placeholder="500"
                    />
                  </div>
                </div>
                <div className="games-modal-row">
                  <div className="games-modal-field">
                    <label htmlFor="custom-minDepositLimit">Min deposit limit</label>
                    <input
                      id="custom-minDepositLimit"
                      name="minDepositLimit"
                      type="number"
                      min={0}
                      step="0.01"
                      className="store-features-input"
                      value={customForm.minDepositLimit === '' ? '' : customForm.minDepositLimit}
                      onChange={handleCustomChange}
                      placeholder="0"
                    />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="custom-maxDepositLimit">Max deposit limit (0 = unlimited)</label>
                    <input
                      id="custom-maxDepositLimit"
                      name="maxDepositLimit"
                      type="number"
                      min={0}
                      step="0.01"
                      className="store-features-input"
                      value={customForm.maxDepositLimit === '' ? '' : customForm.maxDepositLimit}
                      onChange={handleCustomChange}
                      placeholder="0"
                    />
                  </div>
                </div>
                {showCustomDepositDiscount && (
                <div className="games-modal-field">
                  <label htmlFor="custom-depositDiscountPercent">Deposit discount (%)</label>
                  <input
                    id="custom-depositDiscountPercent"
                    name="depositDiscountPercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className="store-features-input"
                    value={customForm.depositDiscountPercent === '' ? '' : customForm.depositDiscountPercent}
                    onChange={handleCustomChange}
                    placeholder="0"
                  />
                  <p className="games-modal-hint">Wallet still pays the entered amount. 10% on a 10 SC top-up credits 11 SC in the game. 0 = no extra credit.</p>
                </div>
                )}
                <div className="games-modal-actions">
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={closeModal} disabled={saving || uploadingGameImage}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || uploadingGameImage}>
                    {saving ? 'Adding…' : 'Add Custom Game'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {configModalOpen && (
        <div
          className="games-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-configs-modal-title"
          onClick={(e) => e.target === e.currentTarget && closeConfigModal()}
        >
          <div className="games-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h2 id="game-configs-modal-title" className="games-modal-title">
              {configModalMode === 'edit' ? 'Update Game Config' : 'Create Game Config'}
            </h2>
            <form onSubmit={handleConfigSubmit} className="games-modal-form">
              <div className="games-modal-field">
                <label htmlFor="gt-name">Name</label>
                <input id="gt-name" name="name" type="text" className="store-features-input" value={configForm.name} onChange={handleConfigChange} required placeholder="e.g. OrionStars Agent, OrionStars Bot, VegasX, Juwa" />
              </div>
              {usesStreamlitTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. orionstars_bot, Juwa, Juwa2.0, GameVault" />
                  </div>
                  <div className="games-modal-field">
                    <label htmlFor="gt-streamlitToken">Streamlit token</label>
                    <input id="gt-streamlitToken" name="streamlitToken" type="password" className="store-features-input" value={configForm.streamlitToken} onChange={handleConfigChange} required={configModalMode === 'add'} placeholder={configModalMode === 'edit' ? 'Leave blank to keep current' : 'Required'} autoComplete="off" />
                    {configModalMode === 'edit' && <p className="games-modal-hint">Leave blank to keep the existing token.</p>}
                  </div>
                </>
              )}
              {usesVegasXTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. VegasX" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    VegasX agent API — only Name, Game key, Bot base URL, and Game link are required. Store admins provide store username and password when adding the game.
                  </p>
                </>
              )}
              {usesOrionStarsTerminalTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. orionstars_agent" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Orion Stars Terminal Agent API — use game key <code>orionstars_agent</code> (or <code>orionstars</code>). Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesOrionStarsBotAutomationTemplateFields(configForm) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Orion Stars bot automation API — use game key <code>orionstars_bot</code>. Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesFirekirinTerminalTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. firekirin_agent" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Firekirin Agent API — use game key <code>firekirin_agent</code>. Bot base URL should be <code>https://firekirin.xyz:8033</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesFirekirinBotAutomationTemplateFields(configForm) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Firekirin bot automation API — use game key <code>firekirin</code> (or <code>firekirin_bot</code>). Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesMilkywayTerminalTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. milkyway_agent" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Milkyway Agent API — use game key <code>milkyway_agent</code>. Bot base URL should be <code>https://milkywayapp.xyz:8033</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesMilkywayBotAutomationTemplateFields(configForm) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Milkyway bot automation API — use game key <code>milkyway</code> (or <code>milkyway_bot</code>). Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesGameroomAgentTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. gameroom_agent" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Gameroom Agent API — use game key <code>gameroom_agent</code>. Bot base URL should be <code>https://agentserver.gameroom777.com</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesGameroomBotAutomationTemplateFields(configForm) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Gameroom bot automation API — use game key <code>gameroom</code> (or <code>gameroom_bot</code>). Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesCashmachineAgentTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey">Game key</label>
                    <input id="gt-gameKey" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. cashmachine_agent" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    CashMachine777 Agent API — use game key <code>cashmachine_agent</code>. Bot base URL should be <code>https://agentserver.cashmachine777.com</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {usesCashmachineBotAutomationTemplateFields(configForm) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  CashMachine777 bot automation API — use game key <code>cashmachine777</code>. Configure Bot base URL and Streamlit token here; store admins provide the bot client username/password when adding the game.
                </p>
              )}
              {usesMafiaAgentTemplateFields(configForm) && (
                <>
                  <div className="games-modal-field">
                    <label htmlFor="gt-gameKey-mafia">Game key</label>
                    <input id="gt-gameKey-mafia" name="gameKey" type="text" className="store-features-input" value={configForm.gameKey} onChange={handleConfigChange} required placeholder="e.g. mafia_agent" />
                  </div>
                  <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                    Mafia Agent API — use game key <code>mafia_agent</code>. Bot base URL should be <code>https://agentserver.mafia77777.com</code>. Store admins provide agent username and password when adding the game.
                  </p>
                </>
              )}
              {isSimpleGame(configForm.name) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  For Vblink, UltraPanda, and Egame99 only Name, Bot base URL, and Game link are required. Game key and Streamlit token are not used.
                </p>
              )}
              {isAgentCredentialGame(configForm) && (
                <p className="games-modal-hint" style={{ marginBottom: '0.5rem' }}>
                  Agent API template — only Name, Bot base URL, and Game link are required (same as Game Vault agent / Juwa 2.0 agent / Juwa agent). Store admins provide Agent ID and API secret key when adding the game.
                </p>
              )}
              <div className="games-modal-field">
                <label htmlFor="gt-botBaseUrl">Bot base URL</label>
                <input id="gt-botBaseUrl" name="botBaseUrl" type="url" className="store-features-input" value={configForm.botBaseUrl} onChange={handleConfigChange} required={configModalMode === 'add'} placeholder={configModalMode === 'edit' ? 'Leave blank to keep current' : 'https://...'} />
                {configModalMode === 'edit' && <p className="games-modal-hint">Leave blank to keep the existing URL.</p>}
              </div>
              <div className="games-modal-field">
                <label htmlFor="gt-gameLink">Game link</label>
                <input id="gt-gameLink" name="gameLink" type="url" className="store-features-input" value={configForm.gameLink} onChange={handleConfigChange} placeholder="https://..." />
              </div>
              <div className="games-modal-field games-modal-field-checkbox">
                <label>
                  <input type="checkbox" name="isActive" checked={configForm.isActive} onChange={handleConfigChange} />
                  <span>Active (show in &quot;Create Game&quot; dropdown)</span>
                </label>
              </div>
              <div className="games-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeConfigModal} disabled={configSaving}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={configSaving}>
                  {configSaving ? (configModalMode === 'edit' ? 'Updating…' : 'Creating…') : configModalMode === 'edit' ? 'Update Game Config' : 'Create Game Config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
