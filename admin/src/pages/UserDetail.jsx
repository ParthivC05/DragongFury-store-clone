import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getUserDetail,
  patchUserAdmin,
  postUserWalletDeduct,
  postUserWalletAddSc,
  getUserTransactions,
  getUserGameActivities,
  getUserGameAccounts,
  getUserGameAccountCredentials,
  updateUserGameAccountCredentials,
  getUserGameAccountCredentialLogs,
  deleteUserGameAccountCredentials,
  deleteAllUserGameCredentials,
  getUserGameCredentialsHistory,
  getUserGameManualRequests,
  getUserWithdrawalRequests,
  getUserDepositRequests,
  getUserGitslotparkTransactions
} from '../api/admin'
import EditManualRegisterCredentialsModal from '../components/EditManualRegisterCredentialsModal'
import CredentialHistoryModal from '../components/CredentialHistoryModal'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import {
  STORE_FEATURE_KEYS,
  ADMIN_FEATURE_KEYS,
  canAccessFeature,
  canAccessAdminFeature
} from '../constants/permissions'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import './Users.css'
import './UserDetail.css'

const PAGE_SIZE = 20

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'wallet', label: 'Wallet activity' },
  { id: 'game_activity', label: 'In-game activity' },
  { id: 'game_accounts', label: 'Game accounts' },
  { id: 'manual', label: 'Manual requests' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'casino_transactions', label: 'Casino Transactions' }
]

const TAB_HELP = {
  overview: '',
  wallet: 'All wallet ledger events for this customer: deposits, spin wheel rewards, game transfers, manual deposit courtesy, withdrawals, and admin adjustments.',
  game_activity: 'Activity recorded against game integrations: registrations, logins, top-ups to games, withdrawals from games, and redemptions.',
  game_accounts: 'Linked bot or provider accounts per game. Credentials are shown here for support staff with user access.',
  manual: 'Queued manual work when game automation was offline (register, deposit to game, redeem from game).',
  deposits: 'Payment top-ups into the platform wallet (same source as the Deposits report, filtered to this user).',
  withdrawals: 'Withdrawal requests from this user’s Redeemable SC.',
  casino_transactions: 'Transactions related to casino games (transfers to and from games).'
}

const TX_TYPE_LABELS = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  spin_wheel: 'Spin wheel',
  welcome_signup: 'Welcome bonus',
  referral_friend_signup: 'Referral bonus',
  promotion: 'Promotion',
  bonus_code: 'Bonus code',
  affiliate: 'Affiliate',
  vip_bonus: 'VIP bonus',
  game_deposit: 'To game',
  game_withdraw: 'From game',
  admin_add: 'Admin SC credit',
  admin_deduct: 'Admin deduction',
  deposit_courtesy: 'Deposit courtesy'
}

const ACTIVITY_LABELS = {
  register: 'Registered',
  login: 'Login',
  topup: 'Top-up to game',
  withdraw: 'Withdraw from game',
  redeem: 'Redeem to wallet'
}

const REQUEST_TYPE_LABELS = {
  register: 'Register',
  deposit: 'Deposit to game',
  redeem: 'Redeem from game'
}

function formatActivitySource(source) {
  const value = String(source || '').trim()
  if (!value) return '—'
  if (value.toLowerCase() === 'bot') return 'Automation'
  return value
}

function humanizeSnake(value) {
  const s = String(value ?? '')
    .trim()
    .replace(/[-_]+/g, ' ')
  if (!s) return ''
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSpinSegmentType(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'sc_coins') return 'SC credited to wallet'
  if (t === 'free_spin') return 'Free spin tokens added'
  if (t === 'no_win' || t === 'none' || t === 'empty') return 'No SC prize (display segment)'
  return humanizeSnake(type) || '—'
}

function normalizeWalletMetadata(row) {
  const m = row?.metadata
  if (m && typeof m === 'object' && !Array.isArray(m)) return m
  return null
}

function hasEmailCampaignDiscountMeta(meta) {
  if (!meta) return false
  const code = meta.email_campaign_code
  if (code == null || String(code).trim() === '') return false
  return (
    (meta.email_campaign_discount_amount != null && Number(meta.email_campaign_discount_amount) > 0) ||
    (meta.email_campaign_discount_value != null && Number(meta.email_campaign_discount_value) > 0) ||
    meta.email_campaign_original_pay_amount != null ||
    meta.original_pay_amount != null
  )
}

/** Append email-campaign pay-discount lines to wallet activity extras. */
function pushEmailCampaignDiscountExtras(meta, pushExtra) {
  if (!hasEmailCampaignDiscountMeta(meta)) return false
  const code = String(meta.email_campaign_code).trim()
  pushExtra('email_campaign_code', `Email campaign code: ${code}`)
  const type = String(meta.email_campaign_discount_type || '').toLowerCase()
  const val = meta.email_campaign_discount_value
  if (val != null && String(val).trim() !== '') {
    if (type === 'percentage' || type === 'percent') {
      pushExtra(
        'email_campaign_discount_value',
        `Email campaign discount: ${formatMoney(val)}% off`
      )
    } else {
      pushExtra(
        'email_campaign_discount_value',
        `Email campaign discount: $${formatMoney(val)} off`
      )
    }
  }
  const original =
    meta.email_campaign_original_pay_amount != null
      ? meta.email_campaign_original_pay_amount
      : meta.original_pay_amount
  if (original != null && String(original).trim() !== '') {
    pushExtra('email_campaign_original_pay_amount', `Original price: $${formatMoney(original)}`)
    pushExtra('original_pay_amount', null)
  }
  if (
    meta.email_campaign_discount_amount != null &&
    String(meta.email_campaign_discount_amount).trim() !== ''
  ) {
    pushExtra(
      'email_campaign_discount_amount',
      `Discount saved: $${formatMoney(meta.email_campaign_discount_amount)}`
    )
  }
  if (meta.pay_amount != null && String(meta.pay_amount).trim() !== '') {
    pushExtra('pay_amount', `Price paid after discount: $${formatMoney(meta.pay_amount)}`)
  }
  return true
}

/** Rich wallet-activity copy for admins (uses description + metadata). */
function formatWalletActivityDetails(row) {
  const meta = normalizeWalletMetadata(row)
  const desc = (row.description && String(row.description).trim()) || ''
  const primary = []
  const extra = []
  const usedKeys = new Set()

  const pushExtra = (key, line) => {
    if (key) usedKeys.add(key)
    if (line) extra.push(line)
  }

  if (row.type === 'deposit') {
    if (meta?.package_id != null || meta?.group_key) {
      const groupLabel = meta.group_title || humanizeSnake(meta.group_key) || 'Package'
      const titlePart = meta.package_title ? ` — ${meta.package_title}` : ''
      primary.push(`${groupLabel} package deposit${titlePart}`)
      const showedCampaign = pushEmailCampaignDiscountExtras(meta, pushExtra)
      const hasDailyBonusDiscount =
        !showedCampaign &&
        meta.daily_bonus_percent_off != null &&
        Number(meta.daily_bonus_percent_off) > 0 &&
        (meta.original_pay_amount != null || meta.daily_bonus_discount_amount != null)
      if (hasDailyBonusDiscount) {
        if (meta.original_pay_amount != null && String(meta.original_pay_amount).trim() !== '') {
          pushExtra('original_pay_amount', `Original price: $${formatMoney(meta.original_pay_amount)}`)
        }
        pushExtra(
          'daily_bonus_percent_off',
          `Daily bonus discount: ${formatMoney(meta.daily_bonus_percent_off)}% off`
        )
        if (meta.daily_bonus_discount_amount != null && String(meta.daily_bonus_discount_amount).trim() !== '') {
          pushExtra(
            'daily_bonus_discount_amount',
            `Discount saved: $${formatMoney(meta.daily_bonus_discount_amount)}`
          )
        }
        if (meta.pay_amount != null && String(meta.pay_amount).trim() !== '') {
          pushExtra('pay_amount', `Price paid after discount: $${formatMoney(meta.pay_amount)}`)
        }
        if (meta.daily_bonus_voucher_id != null && String(meta.daily_bonus_voucher_id).trim() !== '') {
          pushExtra('daily_bonus_voucher_id', `Voucher #${meta.daily_bonus_voucher_id}`)
        }
      } else if (!showedCampaign && meta.pay_amount != null && String(meta.pay_amount).trim() !== '') {
        pushExtra('pay_amount', `Price paid: $${formatMoney(meta.pay_amount)}`)
      }
      if (meta.credit_sc != null && String(meta.credit_sc).trim() !== '') {
        pushExtra('credit_sc', `PSC credited: ${formatMoney(meta.credit_sc)}`)
      }
      if (meta.package_id != null && String(meta.package_id).trim() !== '') {
        pushExtra('package_id', `Package #${meta.package_id}`)
      }
      if (meta.group_key != null && String(meta.group_key).trim() !== '') {
        pushExtra('group_key', `Group: ${humanizeSnake(meta.group_key)}`)
      }
    } else {
      const m = desc.match(/^Deposit\s+(.+)$/i)
      if (m) {
        primary.push(`Deposit — ${humanizeSnake(m[1])}`)
      } else if (desc) {
        primary.push(desc)
      } else {
        primary.push('Deposit')
      }
      if (meta) {
        const showedCampaign = pushEmailCampaignDiscountExtras(meta, pushExtra)
        if (!showedCampaign && meta.pay_amount != null && String(meta.pay_amount).trim() !== '') {
          pushExtra('pay_amount', `Price paid: $${formatMoney(meta.pay_amount)}`)
        }
        if (meta.credit_sc != null && String(meta.credit_sc).trim() !== '') {
          pushExtra('credit_sc', `PSC credited: ${formatMoney(meta.credit_sc)}`)
        }
      }
    }
    if (meta) {
      if (meta.deposit_order_id != null && String(meta.deposit_order_id).trim() !== '') {
        pushExtra('deposit_order_id', `Deposit order #${meta.deposit_order_id}`)
      }
      if (meta.provider_transaction_id != null && String(meta.provider_transaction_id).trim() !== '') {
        pushExtra('provider_transaction_id', `Provider transaction: ${meta.provider_transaction_id}`)
      }
    }
  } else if (row.type === 'spin_wheel') {
    if (desc) primary.push(desc)
    else primary.push('Spin wheel')
    if (meta) {
      if (meta.segmentType != null && String(meta.segmentType).trim() !== '') {
        pushExtra('segmentType', `Prize type: ${formatSpinSegmentType(meta.segmentType)}`)
      }
      if (meta.segmentValue != null && String(meta.segmentValue).trim() !== '') {
        pushExtra('segmentValue', `Segment value: ${meta.segmentValue}`)
      }
      if (meta.segmentIndex != null && meta.segmentIndex !== '') {
        const idx = Number(meta.segmentIndex)
        pushExtra(
          'segmentIndex',
          Number.isFinite(idx)
            ? `Wheel slice: #${idx + 1} (0-based index ${idx})`
            : `Wheel slice index: ${meta.segmentIndex}`
        )
      }
      if (meta.segmentLabel != null && String(meta.segmentLabel).trim() !== '') {
        const label = String(meta.segmentLabel).trim()
        if (!desc.includes(label)) {
          pushExtra('segmentLabel', `Segment label: ${label}`)
        } else {
          usedKeys.add('segmentLabel')
        }
      }
      if (meta.usedFreeSpin === true) {
        pushExtra('usedFreeSpin', 'Spin source: Free spin token (cooldown bypass)')
      } else if (meta.usedFreeSpin === false) {
        pushExtra('usedFreeSpin', 'Spin source: Standard spin (daily / cooldown)')
      }
    }
  } else {
    if (desc && !(row.type === 'game_deposit' && meta)) primary.push(desc)
    if (meta) {
      switch (row.type) {
        case 'promotion':
          if (meta.promotion_id != null && String(meta.promotion_id).trim() !== '') {
            pushExtra('promotion_id', `Promotion #${meta.promotion_id}`)
          }
          if (meta.deposit_request_id != null && String(meta.deposit_request_id).trim() !== '') {
            pushExtra('deposit_request_id', `Linked deposit request #${meta.deposit_request_id}`)
          }
          if (meta.withdrawal_request_id != null && String(meta.withdrawal_request_id).trim() !== '') {
            pushExtra('withdrawal_request_id', `Linked withdrawal request #${meta.withdrawal_request_id}`)
          }
          break
        case 'bonus_code':
          if (meta.bonus_code_id != null && String(meta.bonus_code_id).trim() !== '') {
            pushExtra('bonus_code_id', `Bonus code #${meta.bonus_code_id}`)
          }
          if (meta.deposit_request_id != null && String(meta.deposit_request_id).trim() !== '') {
            pushExtra('deposit_request_id', `Linked deposit request #${meta.deposit_request_id}`)
          }
          break
        case 'affiliate':
          if (meta.referred_user_id != null && String(meta.referred_user_id).trim() !== '') {
            pushExtra('referred_user_id', `From referral — user #${meta.referred_user_id}`)
          }
          if (meta.deposit_request_id != null && String(meta.deposit_request_id).trim() !== '') {
            pushExtra('deposit_request_id', `Referral deposit request #${meta.deposit_request_id}`)
          }
          if (meta.program != null && String(meta.program).trim() !== '') {
            pushExtra('program', `Program: ${humanizeSnake(meta.program)}`)
          }
          break
        case 'referral_friend_signup':
          if (meta.referred_by != null && String(meta.referred_by).trim() !== '') {
            pushExtra('referred_by', `Referred by user #${meta.referred_by}`)
          }
          if (meta.bonusSc != null && String(meta.bonusSc).trim() !== '') {
            pushExtra('bonusSc', `Bonus: ${formatMoney(meta.bonusSc)} SC`)
          }
          break
        case 'welcome_signup':
          if (meta.bonusSc != null && String(meta.bonusSc).trim() !== '') {
            pushExtra('bonusSc', `Bonus: ${formatMoney(meta.bonusSc)} SC`)
          }
          break
        case 'vip_bonus':
          if (meta.tier_name != null && String(meta.tier_name).trim() !== '') {
            pushExtra('tier_name', `VIP tier: ${String(meta.tier_name).trim()}`)
          }
          if (meta.vip_level_index != null && String(meta.vip_level_index).trim() !== '') {
            pushExtra('vip_level_index', `VIP level index: ${meta.vip_level_index}`)
          }
          break
        case 'admin_add':
        case 'admin_deduct':
          if (meta.wallet != null && String(meta.wallet).trim() !== '') {
            pushExtra('wallet', `Wallet: ${String(meta.wallet).trim()}`)
          }
          if (meta.funding && typeof meta.funding === 'object') {
            const fp = Number(meta.funding.psc ?? meta.funding.primary) || 0
            const fb = Number(meta.funding.bsc) || 0
            const fr = Number(meta.funding.rsc) || 0
            const parts = []
            if (fp > 0) parts.push(`PSC ${formatMoney(fp)}`)
            if (fb > 0) parts.push(`BSC ${formatMoney(fb)}`)
            if (fr > 0) parts.push(`RSC ${formatMoney(fr)}`)
            if (parts.length) pushExtra('funding', `Taken from: ${parts.join(' + ')}`)
          }
          if (meta.adminUserId != null && String(meta.adminUserId).trim() !== '') {
            pushExtra('adminUserId', `Admin user #${meta.adminUserId}`)
          }
          if (meta.description != null && String(meta.description).trim() !== '') {
            pushExtra('description', `Details: ${String(meta.description).trim()}`)
          }
          if (meta.reason != null && String(meta.reason).trim() !== '') {
            pushExtra('reason', `Reason: ${String(meta.reason).trim()}`)
          }
          break
        case 'game_deposit': {
          const gameName = meta.game_name != null ? String(meta.game_name).trim() : ''
          if (gameName) {
            primary.push(`Top-up to ${gameName}`)
            usedKeys.add('game_name')
          } else if (desc) {
            primary.push(desc)
          } else {
            primary.push('Top-up to game')
          }
          const walletAmount = Number(meta.wallet_amount != null ? meta.wallet_amount : row.amount)
          const gameCredit = Number(meta.game_credit != null ? meta.game_credit : walletAmount)
          const pct = Number(meta.deposit_discount_percent) || 0
          if (Number.isFinite(walletAmount)) {
            pushExtra('wallet_amount', `Paid from wallet: ${formatMoney(walletAmount)} SC`)
          }
          if (Number.isFinite(gameCredit)) {
            pushExtra('game_credit', `Credited in game: ${formatMoney(gameCredit)} SC`)
          }
          if (pct > 0 && Number.isFinite(gameCredit) && Number.isFinite(walletAmount) && gameCredit > walletAmount) {
            pushExtra('deposit_discount_percent', `Deposit discount: ${formatMoney(pct)}% extra`)
          } else {
            usedKeys.add('deposit_discount_percent')
          }
          if (meta.funding && typeof meta.funding === 'object') {
            const fp = Number(meta.funding.psc ?? meta.funding.primary) || 0
            const fb = Number(meta.funding.bsc) || 0
            const fr = Number(meta.funding.rsc) || 0
            const parts = []
            if (fp > 0) parts.push(`PSC ${formatMoney(fp)}`)
            if (fb > 0) parts.push(`BSC ${formatMoney(fb)}`)
            if (fr > 0) parts.push(`RSC ${formatMoney(fr)}`)
            if (parts.length) pushExtra('funding', `Taken from: ${parts.join(' + ')}`)
            else usedKeys.add('funding')
          }
          break
        }
        case 'deposit_courtesy':
          if (meta.game_name != null && String(meta.game_name).trim() !== '') {
            pushExtra('game_name', `Game: ${String(meta.game_name).trim()}`)
          }
          if (meta.manual_request_id != null && String(meta.manual_request_id).trim() !== '') {
            pushExtra('manual_request_id', `Manual request #${meta.manual_request_id}`)
          }
          if (meta.deposit_amount_refunded != null && String(meta.deposit_amount_refunded).trim() !== '') {
            pushExtra(
              'deposit_amount_refunded',
              `Deposit amount refunded: ${formatMoney(meta.deposit_amount_refunded)} SC`
            )
          }
          pushExtra('courtesy_limit', 'Limit: 1 SC courtesy per user per 24 hours')
          break
        default:
          break
      }
    }
  }

  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (usedKeys.has(k)) continue
      if (v == null || v === '') continue
      if (typeof v === 'object') {
        extra.push(`${humanizeSnake(k)}: ${JSON.stringify(v)}`)
      } else {
        extra.push(`${humanizeSnake(k)}: ${v}`)
      }
    }
  }

  const head = primary.filter(Boolean).join(' · ') || '—'
  if (extra.length === 0) {
    return head
  }

  return (
    <div className="ud-wallet-detail-cell">
      <div className="ud-wallet-detail-primary">{head}</div>
      <ul className="ud-wallet-detail-meta">
        {extra.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

function formatDt(d) {
  if (!d) return '—'
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  return x.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function formatMoney(n, suffix = '') {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(2)}${suffix}`
}

function formatGameActivityDetails(row) {
  if (row?.activityType !== 'topup') return '—'
  const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : null
  if (!meta) return '—'
  const walletAmount = Number(meta.wallet_amount)
  const gameCredit = Number(meta.game_credit != null ? meta.game_credit : row.amount)
  const pct = Number(meta.deposit_discount_percent) || 0
  if (!(pct > 0 && Number.isFinite(walletAmount) && Number.isFinite(gameCredit) && gameCredit > walletAmount)) {
    return '—'
  }
  return (
    <div className="ud-wallet-detail-cell">
      <div className="ud-wallet-detail-primary">
        Paid {formatMoney(walletAmount)} SC from wallet
      </div>
      <ul className="ud-wallet-detail-meta">
        <li>Credited in game: {formatMoney(gameCredit)} SC</li>
        <li>Deposit discount: {formatMoney(pct)}% extra</li>
      </ul>
    </div>
  )
}

const EMPTY_DEPOSIT_STATS = {
  completedAmount: 0,
  pendingAmount: 0,
  expiredAmount: 0,
  failedAmount: 0
}

const EMPTY_WITHDRAWAL_STATS = {
  completedAmount: 0,
  pendingAmount: 0,
  failedAmount: 0,
  rejectedAmount: 0
}

/** Sum a summary field across providers (fallback for older backends). */
function sumSummaryField(summary, providers, field) {
  if (!summary || typeof summary !== 'object') return 0
  let total = 0
  for (const key of providers) {
    const block = summary[key]
    if (!block || typeof block !== 'object') continue
    total += Number(block[field]) || 0
  }
  return total
}

function depositStatsFromResponse(res) {
  if (!res) return { ...EMPTY_DEPOSIT_STATS }
  const t = res.totals
  if (t && typeof t === 'object') {
    const hasBreakdown =
      typeof t.completedAmount === 'number' ||
      typeof t.pendingAmount === 'number' ||
      typeof t.expiredAmount === 'number' ||
      typeof t.failedAmount === 'number'
    if (hasBreakdown) {
      return {
        completedAmount: Number(t.completedAmount) || 0,
        pendingAmount: Number(t.pendingAmount) || 0,
        expiredAmount: Number(t.expiredAmount) || 0,
        failedAmount: Number(t.failedAmount) || 0
      }
    }
  }
  const providers = ['orionstarspay', 'dollarpay', 'xxpay', 'chime']
  return {
    completedAmount: sumSummaryField(res.summary, providers, 'completedAmount'),
    pendingAmount: sumSummaryField(res.summary, providers, 'pendingAmount'),
    expiredAmount: 0,
    failedAmount: 0
  }
}

function withdrawalStatsFromResponse(res) {
  if (!res) return { ...EMPTY_WITHDRAWAL_STATS }
  const t = res.totals
  if (t && typeof t === 'object') {
    const hasBreakdown =
      typeof t.completedAmount === 'number' ||
      typeof t.pendingAmount === 'number' ||
      typeof t.failedAmount === 'number' ||
      typeof t.rejectedAmount === 'number'
    if (hasBreakdown) {
      return {
        completedAmount: Number(t.completedAmount) || 0,
        pendingAmount: Number(t.pendingAmount) || 0,
        failedAmount: Number(t.failedAmount) || 0,
        rejectedAmount: Number(t.rejectedAmount) || 0
      }
    }
  }
  const providers = ['orionstarspay', 'chime', 'cashapp', 'dollarpay', 'xxpay']
  return {
    completedAmount: sumSummaryField(res.summary, providers, 'completedAmount'),
    pendingAmount: sumSummaryField(res.summary, providers, 'pendingAmount'),
    failedAmount: 0,
    rejectedAmount: 0
  }
}

function formatDepositProviderLabel(row) {
  if (row?.providerDisplayLabel) return row.providerDisplayLabel
  const key = String(row?.provider || '').toLowerCase()
  if (key === 'dollarpay') return 'Dpay'
  if (key === 'xxpay') return 'Xpay'
  if (key === 'orionstarspay') return 'OrionStarPay'
  if (key === 'chime') return 'Manual Chime'
  return row?.provider || '—'
}

/** Deposit-tab details: package buy + daily bonus voucher discount. */
function formatDepositBuyDetails(row) {
  const lines = []
  if (row.packageTitle || row.packageId != null) {
    lines.push(
      row.packageTitle
        ? `Package: ${row.packageTitle}${row.packageId != null ? ` (#${row.packageId})` : ''}`
        : `Package #${row.packageId}`
    )
  }
  const isEmailCampaign =
    Boolean(row.emailCampaignCode) || row.discountSource === 'email_campaign'
  const hasDailyBonusDiscount =
    !isEmailCampaign &&
    row.discountPercent != null &&
    Number(row.discountPercent) > 0 &&
    (row.originalPayAmount != null || row.discountAmount != null)
  const hasEmailCampaignDiscount =
    isEmailCampaign &&
    (row.originalPayAmount != null ||
      row.discountAmount != null ||
      row.emailCampaignDiscountValue != null ||
      row.discountPercent != null)
  if (hasEmailCampaignDiscount) {
    if (row.emailCampaignCode) {
      lines.push(`Email campaign code: ${row.emailCampaignCode}`)
    }
    if (row.originalPayAmount != null) {
      lines.push(`Original price: $${formatMoney(row.originalPayAmount)}`)
    }
    const type = String(row.emailCampaignDiscountType || '').toLowerCase()
    const val =
      row.emailCampaignDiscountValue != null
        ? row.emailCampaignDiscountValue
        : row.discountPercent
    if (val != null && Number(val) > 0) {
      if (type === 'percentage' || type === 'percent' || (type === '' && row.discountPercent != null)) {
        lines.push(`Email campaign discount: ${formatMoney(val)}% off`)
      } else if (type === 'fixed' || type === 'amount') {
        lines.push(`Email campaign discount: $${formatMoney(val)} off`)
      } else if (row.discountPercent != null) {
        lines.push(`Email campaign discount: ${formatMoney(row.discountPercent)}% off`)
      } else {
        lines.push(`Email campaign discount: $${formatMoney(val)} off`)
      }
    }
    if (row.discountAmount != null) {
      lines.push(`Discount saved: $${formatMoney(row.discountAmount)}`)
    }
    if (row.amount != null) {
      lines.push(`Paid after discount: $${formatMoney(row.amount)}`)
    }
  } else if (hasDailyBonusDiscount) {
    if (row.originalPayAmount != null) {
      lines.push(`Original price: $${formatMoney(row.originalPayAmount)}`)
    }
    lines.push(`Daily bonus discount: ${formatMoney(row.discountPercent)}% off`)
    if (row.discountAmount != null) {
      lines.push(`Discount saved: $${formatMoney(row.discountAmount)}`)
    }
    if (row.amount != null) {
      lines.push(`Paid after discount: $${formatMoney(row.amount)}`)
    }
  }
  if (!lines.length) return '—'
  return (
    <div className="ud-wallet-detail">
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
}

function initialsFromUser(u) {
  if (!u) return '?'
  const f = (u.firstName || '').trim()
  const l = (u.lastName || '').trim()
  if (f && l) return (f[0] + l[0]).toUpperCase()
  const un = (u.username || '').trim()
  if (un.length >= 2) return un.slice(0, 2).toUpperCase()
  if (un.length === 1) return un.toUpperCase()
  return '?'
}

function displayName(u) {
  if (!u) return 'User'
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  if (u.username) return u.username
  return `User #${u.userId}`
}

function statusPillVariant(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('pending')) return 'warn'
  if (s.includes('reject') || s.includes('fail') || s.includes('cancel')) return 'danger'
  if (s.includes('approv') || s.includes('complet') || s === 'paid') return 'success'
  return 'neutral'
}

function Badge({ variant, children }) {
  return <span className={`ud-badge ud-badge--${variant}`}>{children}</span>
}

function kycDisplay(status) {
  const s = String(status || 'not_started').toLowerCase()
  if (s === 'approved') {
    return {
      key: 'approved',
      label: 'Approved',
      hint: 'Identity verified — withdrawals allowed',
      icon: 'check',
    }
  }
  if (s === 'declined' || s === 'rejected') {
    return {
      key: 'declined',
      label: 'Declined',
      hint: 'Verification failed — withdrawals blocked',
      icon: 'x',
    }
  }
  if (s === 'pending' || s === 'in_review' || s === 'in review') {
    return {
      key: 'pending',
      label: s === 'in_review' || s === 'in review' ? 'In review' : 'Pending',
      hint: 'Waiting on Didit decision',
      icon: 'clock',
    }
  }
  return {
    key: 'not_started',
    label: 'Not started',
    hint: 'User has not completed KYC yet',
    icon: 'shield',
  }
}

function KycStatusIcon({ type }) {
  if (type === 'check') {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'x') {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'clock') {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" strokeLinejoin="round" />
    </svg>
  )
}

export default function UserDetail() {
  const { userId } = useParams()
  const { user: adminUser } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const showPlayerEmail = canShowPlayerEmailColumn(adminUser?.role)
  // Super admin (no adminRoleId) + technical staff (master_admin with role) can see phone numbers.
  const canViewUserPhone = adminUser?.role === ROLES.MASTER_ADMIN
  const canAdjustWallet =
    adminUser?.role === ROLES.DISTRIBUTOR_ADMIN ||
    (adminUser?.role === ROLES.MASTER_ADMIN
      ? canAccessAdminFeature(adminUser, ADMIN_FEATURE_KEYS.WALLET_ADJUST)
      : canAccessFeature(adminUser, STORE_FEATURE_KEYS.WALLET_ADJUST))

  const [tab, setTab] = useState('overview')
  const [page, setPage] = useState(1)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [detail, setDetail] = useState({ user: null, balance: null, emailCampaignOffer: null })
  const [listLoading, setListLoading] = useState(false)
  const [listData, setListData] = useState({ list: [], total: 0 })
  const [depositTabStats, setDepositTabStats] = useState({ ...EMPTY_DEPOSIT_STATS })
  const [withdrawalTabStats, setWithdrawalTabStats] = useState({ ...EMPTY_WITHDRAWAL_STATS })
  const [txType, setTxType] = useState('')
  const [activityType, setActivityType] = useState('')

  const [deductPsc, setDeductPsc] = useState('')
  const [deductBsc, setDeductBsc] = useState('')
  const [deductRsc, setDeductRsc] = useState('')
  const [deductReason, setDeductReason] = useState('')
  const [deducting, setDeducting] = useState(false)
  const [addPsc, setAddPsc] = useState('')
  const [addBsc, setAddBsc] = useState('')
  const [addRsc, setAddRsc] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addingSc, setAddingSc] = useState(false)
  const [walletRefresh, setWalletRefresh] = useState(0)
  const [gameAccountsRefresh, setGameAccountsRefresh] = useState(0)
  const [editAccountModal, setEditAccountModal] = useState(null)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadOverview = useCallback(() => {
    setOverviewLoading(true)
    getUserDetail(userId)
      .then((res) => {
        setDetail({
          user: res.user || null,
          balance: res.balance || null,
          emailCampaignOffer: res.emailCampaignOffer || null
        })
      })
      .catch((e) => {
        toast.error(e.message || 'Failed to load user')
        setDetail({ user: null, balance: null, emailCampaignOffer: null })
      })
      .finally(() => setOverviewLoading(false))
  }, [userId, toast])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  useEffect(() => {
    setPage(1)
  }, [tab, txType, activityType])

  useEffect(() => {
    if (tab === 'overview') return
    setListLoading(true)
    const params = { page, limit: PAGE_SIZE }
    if (tab === 'wallet' && txType) params.type = txType
    if (tab === 'game_activity' && activityType) params.activityType = activityType

    const loaders = {
      wallet: () => getUserTransactions(userId, params),
      game_activity: () => getUserGameActivities(userId, params),
      game_accounts: () => getUserGameAccounts(userId).then((r) => ({ list: r.list || [], total: (r.list || []).length })),
      manual: () => getUserGameManualRequests(userId, params),
      deposits: () =>
        getUserDepositRequests(userId, params).then((depRes) => {
          setDepositTabStats(depositStatsFromResponse(depRes))
          return depRes
        }),
      withdrawals: () =>
        getUserWithdrawalRequests(userId, params).then((wdRes) => {
          setWithdrawalTabStats(withdrawalStatsFromResponse(wdRes))
          return wdRes
        }),
      casino_transactions: () => getUserGitslotparkTransactions(userId, params)
    }

    const fn = loaders[tab]
    if (!fn) {
      setListLoading(false)
      return
    }

    fn()
      .then((res) => {
        setListData({ list: res.list || [], total: typeof res.total === 'number' ? res.total : (res.list || []).length })
      })
      .catch((e) => {
        toast.error(e.message || 'Failed to load data')
        setListData({ list: [], total: 0 })
        if (tab === 'deposits') {
          setDepositTabStats({ ...EMPTY_DEPOSIT_STATS })
        } else if (tab === 'withdrawals') {
          setWithdrawalTabStats({ ...EMPTY_WITHDRAWAL_STATS })
        }
      })
      .finally(() => setListLoading(false))
  }, [tab, page, userId, txType, activityType, walletRefresh, gameAccountsRefresh, toast])

  const openEditAccount = async (row) => {
    setEditAccountModal({ row, credentials: null, logs: [], loadingCredentials: true })
    try {
      const [credentials, logsRes] = await Promise.all([
        getUserGameAccountCredentials(userId, row.id),
        getUserGameAccountCredentialLogs(userId, row.id)
      ])
      setEditAccountModal({
        row,
        credentials,
        logs: logsRes?.list || [],
        loadingCredentials: false
      })
    } catch (err) {
      toast.error(err?.message || 'Failed to load credentials.')
      setEditAccountModal(null)
    }
  }

  const handleOpenHistory = async () => {
    setHistoryModalOpen(true)
    setLoadingHistory(true)
    try {
      const res = await getUserGameCredentialsHistory(userId)
      setHistoryData(res.list || [])
    } catch (err) {
      toast.error(err?.message || 'Failed to load credentials history.')
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleDeleteCredentials = async (row) => {
    const ok = await confirm({
      title: 'Delete Credentials',
      message: `Are you sure you want to delete the game username and password for ${row.game?.name || 'this game'}? This action is tracked in history.`
    })
    if (!ok) return

    try {
      await deleteUserGameAccountCredentials(userId, row.id)
      toast.success('Credentials deleted successfully.')
      setGameAccountsRefresh((r) => r + 1)
    } catch (err) {
      toast.error(err?.message || 'Failed to delete credentials.')
    }
  }

  const handleDeleteAllCredentials = async () => {
    const ok = await confirm({
      title: 'Delete All Credentials',
      message: 'Are you sure you want to delete the game username and password for ALL games of this user? This action is tracked in history.'
    })
    if (!ok) return

    try {
      await deleteAllUserGameCredentials(userId)
      toast.success('All game credentials deleted successfully.')
      setGameAccountsRefresh((r) => r + 1)
    } catch (err) {
      toast.error(err?.message || 'Failed to delete all credentials.')
    }
  }

  const closeEditAccountModal = () => setEditAccountModal(null)

  const handleEditAccountCredentials = async (extraData = {}) => {
    if (!editAccountModal?.row) return
    setSavingCredentials(true)
    try {
      await updateUserGameAccountCredentials(userId, editAccountModal.row.id, extraData)
      toast.success('Credentials updated successfully.')
      closeEditAccountModal()
      setGameAccountsRefresh((n) => n + 1)
    } catch (err) {
      toast.error(err?.message || 'Failed to update credentials.')
    } finally {
      setSavingCredentials(false)
    }
  }

  const u = detail.user
  const b = detail.balance
  const emailCampaignOffer = detail.emailCampaignOffer
  const title = useMemo(() => displayName(u), [u])
  const totalPages = Math.max(1, Math.ceil(listData.total / PAGE_SIZE))
  const from = listData.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, listData.total)

  const onToggleActive = async () => {
    if (!u) return
    const next = !u.isActive
    const ok = await confirm({
      title: next ? 'Activate account' : 'Deactivate account',
      message: next
        ? 'This user will be able to sign in and use the store again.'
        : 'This user will not be able to sign in until the account is activated again.',
      confirmLabel: next ? 'Activate' : 'Deactivate',
      variant: next ? 'primary' : 'danger'
    })
    if (!ok) return
    try {
      await patchUserAdmin(userId, { isActive: next })
      toast.success(next ? 'Account activated.' : 'Account deactivated.')
      setDetail((d) => ({ ...d, user: d.user ? { ...d.user, isActive: next } : null }))
    } catch (e) {
      toast.error(e.message || 'Update failed')
    }
  }

  const submitDeduct = async (e) => {
    e.preventDefault()
    const psc = deductPsc.trim() === '' ? null : Number(deductPsc)
    const bsc = deductBsc.trim() === '' ? null : Number(deductBsc)
    const rsc = deductRsc.trim() === '' ? null : Number(deductRsc)
    const hasPsc = psc != null && Number.isFinite(psc) && psc > 0
    const hasBsc = bsc != null && Number.isFinite(bsc) && bsc > 0
    const hasRsc = rsc != null && Number.isFinite(rsc) && rsc > 0
    if (!hasPsc && !hasBsc && !hasRsc) {
      toast.error('Enter how much to take from at least one wallet.')
      return
    }
    const ok = await confirm({
      title: 'Take SC away?',
      message:
        'This removes ready balance from the customer. Amounts on hold stay. A note is saved in Wallet activity.',
      confirmLabel: 'Take SC',
      variant: 'danger'
    })
    if (!ok) return
    setDeducting(true)
    try {
      const res = await postUserWalletDeduct(userId, {
        psc: hasPsc ? psc : undefined,
        bsc: hasBsc ? bsc : undefined,
        rsc: hasRsc ? rsc : undefined,
        reason: deductReason.trim()
      })
      toast.success('SC taken.')
      setDetail((d) => ({ ...d, balance: res.balance || d.balance }))
      setDeductPsc('')
      setDeductBsc('')
      setDeductRsc('')
      setDeductReason('')
      if (tab === 'wallet') {
        setPage(1)
        setWalletRefresh((x) => x + 1)
      }
    } catch (e) {
      toast.error(e.message || 'Could not take coins')
    } finally {
      setDeducting(false)
    }
  }

  const submitAddSc = async (e) => {
    e.preventDefault()
    const psc = addPsc.trim() === '' ? null : Number(addPsc)
    const bsc = addBsc.trim() === '' ? null : Number(addBsc)
    const rsc = addRsc.trim() === '' ? null : Number(addRsc)
    const description = addDescription.trim()
    const hasPsc = psc != null && Number.isFinite(psc) && psc > 0
    const hasBsc = bsc != null && Number.isFinite(bsc) && bsc > 0
    const hasRsc = rsc != null && Number.isFinite(rsc) && rsc > 0
    if (!hasPsc && !hasBsc && !hasRsc) {
      toast.error('Enter how much to give in at least one wallet.')
      return
    }
    if (!description) {
      toast.error('Write why you are giving SC.')
      return
    }
    const ok = await confirm({
      title: 'Give SC?',
      message: 'Credits go into the wallets you filled. Your note is saved in Wallet activity.',
      confirmLabel: 'Give SC',
      variant: 'success'
    })
    if (!ok) return
    setAddingSc(true)
    try {
      const res = await postUserWalletAddSc(userId, {
        psc: hasPsc ? psc : undefined,
        bsc: hasBsc ? bsc : undefined,
        rsc: hasRsc ? rsc : undefined,
        description
      })
      toast.success('SC added.')
      setDetail((d) => ({ ...d, balance: res.balance || d.balance }))
      setAddPsc('')
      setAddBsc('')
      setAddRsc('')
      setAddDescription('')
      if (tab === 'wallet') {
        setPage(1)
        setWalletRefresh((x) => x + 1)
      }
    } catch (e) {
      toast.error(e.message || 'Could not add coins')
    } finally {
      setAddingSc(false)
    }
  }

  const showWorkspace = overviewLoading || u

  return (
    <div className="users-page user-detail-page">
      <nav className="ud-breadcrumb" aria-label="Breadcrumb">
        <Link to="/users">Users</Link>
        <span className="ud-breadcrumb-sep" aria-hidden>/</span>
        <span className="ud-breadcrumb-current" title={title}>
          {overviewLoading ? 'Loading…' : u ? title : `User #${userId}`}
        </span>
      </nav>

      {overviewLoading ? (
        <div className="ud-hero ud-hero--skeleton" aria-busy="true">
          <div className="ud-skel" style={{ width: 52, height: 52, borderRadius: 12 }} />
          <div className="ud-hero-body" style={{ flex: 1 }}>
            <div className="ud-skel ud-skel-line" />
            <div className="ud-skel ud-skel-line ud-skel-line--short" />
          </div>
        </div>
      ) : u ? (
        <header className="ud-hero">
          <div className="ud-hero-avatar" aria-hidden>
            {initialsFromUser(u)}
          </div>
          <div className="ud-hero-body">
            <div className="ud-hero-title-row">
              <h1 className="ud-hero-title">{title}</h1>
              {u.isActive === false ? (
                <Badge variant="warn">Inactive</Badge>
              ) : (
                <Badge variant="success">Active</Badge>
              )}
              {(() => {
                const kyc = kycDisplay(u.kycStatus)
                const variant =
                  kyc.key === 'approved'
                    ? 'success'
                    : kyc.key === 'declined'
                      ? 'danger'
                      : kyc.key === 'pending'
                        ? 'warn'
                        : 'neutral'
                return <Badge variant={variant}>KYC · {kyc.label}</Badge>
              })()}
              <Badge variant={u.isPhoneVerified ? 'success' : 'neutral'}>
                Phone · {u.isPhoneVerified ? 'Verified' : 'Not verified'}
              </Badge>
            </div>
            <p className="ud-hero-meta">
              <span>
                User ID <code>{u.userId}</code>
              </span>
              {' · '}
              <span>
                Store <code>{u.storeCode ?? '—'}</code>
              </span>
              {' · '}
              <span>
                Distributor <code>{u.distributorCode ?? '—'}</code>
              </span>
              {showPlayerEmail && u.email ? (
                <>
                  {' · '}
                  <span>{u.email}</span>
                </>
              ) : null}
            </p>
            {b ? (
              <div className="ud-hero-balances" aria-label="Quick wallet summary">
                <div className="ud-mini-stat ud-mini-stat--psc">
                  <span className="ud-mini-stat-label">Purchased SC</span>
                  <span className="ud-mini-stat-value">{formatMoney(b.usable_balance_psc ?? 0)}</span>
                  <span className="ud-mini-stat-hint">from deposits</span>
                </div>
                <div className="ud-mini-stat ud-mini-stat--bsc">
                  <span className="ud-mini-stat-label">Bonus SC</span>
                  <span className="ud-mini-stat-value">{formatMoney(b.usable_balance_bsc ?? 0)}</span>
                  <span className="ud-mini-stat-hint">from bonuses</span>
                </div>
                <div className="ud-mini-stat ud-mini-stat--rsc">
                  <span className="ud-mini-stat-label">Redeemable SC</span>
                  <span className="ud-mini-stat-value">{formatMoney(b.usable_balance_rsc ?? 0)}</span>
                  <span className="ud-mini-stat-hint">can withdraw</span>
                </div>
              </div>
            ) : null}
          </div>
        </header>
      ) : (
        <div className="ud-empty" role="status">
          <h2 className="ud-empty-title">We couldn’t open this profile</h2>
          <p>Either the user does not exist, or your role is not allowed to view this store’s customers.</p>
          <p style={{ marginTop: '1rem' }}>
            <Link className="admin-btn admin-btn-sm admin-btn-primary" to="/users">
              Back to users
            </Link>
          </p>
        </div>
      )}

      {showWorkspace && u ? (
        <>
          <div className="ud-tabs-wrap">
            <div className="ud-tabs" role="tablist" aria-label="User sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className="ud-tab"
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {TAB_HELP[tab] ? <p className="ud-tab-desc">{TAB_HELP[tab]}</p> : null}
          </div>

          {tab === 'overview' ? (
            <>
              <section className="ud-section">
                <div className="ud-section-header">
                  <h2 className="ud-section-title">Customer details</h2>
                  <p className="ud-section-desc">Read-only fields from the customer record.</p>
                </div>
                <div className="ud-section-body">
                  <dl className="ud-dl-grid">
                    <div className="ud-dl-item">
                      <dt>User ID</dt>
                      <dd>{u.userId}</dd>
                    </div>
                    {showPlayerEmail ? (
                      <div className="ud-dl-item">
                        <dt>Email</dt>
                        <dd>{u.email || '—'}</dd>
                      </div>
                    ) : null}
                    <div className="ud-dl-item">
                      <dt>Username</dt>
                      <dd>{u.username || '—'}</dd>
                    </div>
                    <div className="ud-dl-item">
                      <dt>Phone</dt>
                      <dd>
                        <span>
                          {canViewUserPhone ? (u.phone || '—') : 'Hidden'}
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          <Badge variant={u.isPhoneVerified ? 'success' : 'warn'}>
                            {u.isPhoneVerified ? 'Verified' : 'Not verified'}
                          </Badge>
                        </span>
                      </dd>
                    </div>
                    <div className="ud-dl-item">
                      <dt>Joined</dt>
                      <dd>{formatDt(u.createdAt)}</dd>
                    </div>
                    <div className="ud-dl-item">
                      <dt>Device visitor ID</dt>
                      <dd>
                        <span className="ud-mono">{u.deviceVisitorId || '—'}</span>
                      </dd>
                    </div>
                    <div className="ud-dl-item">
                      <dt>Referral code</dt>
                      <dd>
                        <span className="ud-mono">{u.userReferralCode || '—'}</span>
                      </dd>
                    </div>
                    <div className="ud-dl-item">
                      <dt>Free spins (queued)</dt>
                      <dd>{u.pendingFreeSpins ?? 0}</dd>
                    </div>
                  </dl>

                  {(() => {
                    const kyc = kycDisplay(u.kycStatus)
                    return (
                      <div className={`ud-kyc-card ud-kyc-card--${kyc.key}`} role="status">
                        <div className="ud-kyc-card-icon" aria-hidden>
                          <KycStatusIcon type={kyc.icon} />
                        </div>
                        <div className="ud-kyc-card-body">
                          <div className="ud-kyc-card-eyebrow">Identity verification (KYC)</div>
                          <div className="ud-kyc-card-status">{kyc.label}</div>
                          <p className="ud-kyc-card-hint">{kyc.hint}</p>
                          <div className="ud-kyc-card-meta">
                            {u.kycVerifiedAt ? (
                              <span>
                                Verified <strong>{formatDt(u.kycVerifiedAt)}</strong>
                              </span>
                            ) : (
                              <span>Not verified yet</span>
                            )}
                            {u.diditSessionId ? (
                              <span className="ud-kyc-session">
                                Session <code>{u.diditSessionId}</code>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {(() => {
                    const verified = Boolean(u.isPhoneVerified)
                    const key = verified ? 'approved' : 'not_started'
                    return (
                      <div className={`ud-kyc-card ud-kyc-card--${key}`} role="status">
                        <div className="ud-kyc-card-icon" aria-hidden>
                          <KycStatusIcon type={verified ? 'check' : 'shield'} />
                        </div>
                        <div className="ud-kyc-card-body">
                          <div className="ud-kyc-card-eyebrow">Phone verification</div>
                          <div className="ud-kyc-card-status">{verified ? 'Verified' : 'Not verified'}</div>
                          <p className="ud-kyc-card-hint">
                            {verified
                              ? 'Phone number confirmed via OTP'
                              : canViewUserPhone && u.phone
                                ? 'Phone on file but not verified with OTP'
                                : canViewUserPhone
                                  ? 'No phone number on file'
                                  : 'Phone number is only visible to super admin and technical staff'}
                          </p>
                          <div className="ud-kyc-card-meta">
                            {canViewUserPhone ? (
                              u.phone ? (
                                <span>
                                  Number <strong>{u.phone}</strong>
                                </span>
                              ) : (
                                <span>No number</span>
                              )
                            ) : (
                              <span>Number <strong>Hidden</strong></span>
                            )}
                            {verified && u.phoneVerifiedAt ? (
                              <span>
                                Verified <strong>{formatDt(u.phoneVerifiedAt)}</strong>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {emailCampaignOffer?.claimed ? (
                    <div
                      className={`ud-kyc-card ud-kyc-card--${
                        emailCampaignOffer.redeemed
                          ? 'approved'
                          : emailCampaignOffer.codeApplied
                            ? 'pending'
                            : 'not_started'
                      }`}
                      role="status"
                    >
                      <div className="ud-kyc-card-icon" aria-hidden>
                        <KycStatusIcon
                          type={
                            emailCampaignOffer.redeemed
                              ? 'check'
                              : emailCampaignOffer.codeApplied
                                ? 'clock'
                                : 'shield'
                          }
                        />
                      </div>
                      <div className="ud-kyc-card-body">
                        <div className="ud-kyc-card-eyebrow">Email campaign offer</div>
                        <div className="ud-kyc-card-status">
                          {emailCampaignOffer.redeemed
                            ? 'Redeemed on deposit'
                            : emailCampaignOffer.codeApplied
                              ? 'Claimed — code applied'
                              : 'Claimed'}
                        </div>
                        <p className="ud-kyc-card-hint">
                          {emailCampaignOffer.campaignName
                            ? `${emailCampaignOffer.campaignName}`
                            : 'No-deposit reengagement offer'}
                          {emailCampaignOffer.discountCode
                            ? ` · Code ${emailCampaignOffer.discountCode}`
                            : ''}
                          {emailCampaignOffer.discountValue != null
                            ? emailCampaignOffer.discountValueType === 'percentage'
                              ? ` · ${formatMoney(emailCampaignOffer.discountValue)}% off pay amount`
                              : ` · $${formatMoney(emailCampaignOffer.discountValue)} off pay amount`
                            : ''}
                        </p>
                        <div className="ud-kyc-card-meta">
                          {emailCampaignOffer.claimedAt ? (
                            <span>
                              Claimed <strong>{formatDt(emailCampaignOffer.claimedAt)}</strong>
                            </span>
                          ) : null}
                          {emailCampaignOffer.codeAppliedAt ? (
                            <span>
                              Applied <strong>{formatDt(emailCampaignOffer.codeAppliedAt)}</strong>
                            </span>
                          ) : (
                            <span>Code not applied on deposit yet</span>
                          )}
                          {emailCampaignOffer.redeemed ? (
                            <span>
                              Status <strong>Used</strong>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              {b ? (
                <section className="ud-section">
                  <div className="ud-section-header">
                    <h2 className="ud-section-title">Wallet balances</h2>
                    <p className="ud-section-desc">
                      Games use Purchased SC first, then Bonus SC, then Redeemable SC. Withdrawals use Redeemable SC only.
                    </p>
                  </div>
                  <div className="ud-section-body">
                    <div className="ud-wallet-grid">
                      <div className="ud-wallet-card ud-wallet-card--psc">
                        <h4>Purchased SC</h4>
                        <p className="ud-wallet-card-sub">From deposits</p>
                        <p className="ud-wallet-big">{formatMoney(b.usable_balance_psc ?? 0)}</p>
                        <p className="ud-wallet-big-label">ready to play</p>
                        {(Number(b.play_balance_psc) > 0 || Number(b.frozen_balance_psc) > 0) && (
                          <ul className="ud-wallet-notes">
                            {Number(b.play_balance_psc) > 0 ? (
                              <li>Must play in games first: {formatMoney(b.play_balance_psc)}</li>
                            ) : null}
                            {Number(b.frozen_balance_psc) > 0 ? (
                              <li>On hold: {formatMoney(b.frozen_balance_psc)}</li>
                            ) : null}
                          </ul>
                        )}
                      </div>
                      <div className="ud-wallet-card ud-wallet-card--bsc">
                        <h4>Bonus SC</h4>
                        <p className="ud-wallet-card-sub">From bonuses</p>
                        <p className="ud-wallet-big">{formatMoney(b.usable_balance_bsc ?? 0)}</p>
                        <p className="ud-wallet-big-label">ready to play</p>
                        {(Number(b.play_balance_bsc) > 0 || Number(b.frozen_balance_bsc) > 0) && (
                          <ul className="ud-wallet-notes">
                            {Number(b.play_balance_bsc) > 0 ? (
                              <li>Must play in games first: {formatMoney(b.play_balance_bsc)}</li>
                            ) : null}
                            {Number(b.frozen_balance_bsc) > 0 ? (
                              <li>On hold: {formatMoney(b.frozen_balance_bsc)}</li>
                            ) : null}
                          </ul>
                        )}
                      </div>
                      <div className="ud-wallet-card ud-wallet-card--rsc">
                        <h4>Redeemable SC</h4>
                        <p className="ud-wallet-card-sub">From game wins</p>
                        <p className="ud-wallet-big">{formatMoney(b.available_to_withdraw_sc ?? b.usable_balance_rsc ?? 0)}</p>
                        <p className="ud-wallet-big-label">ready to withdraw</p>
                        {Number(b.frozen_balance_rsc) > 0 ? (
                          <ul className="ud-wallet-notes">
                            <li>On hold (waiting withdrawal): {formatMoney(b.frozen_balance_rsc)}</li>
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="ud-section">
                <div className="ud-section-header">
                  <h2 className="ud-section-title">Account access</h2>
                  <p className="ud-section-desc">Block sign-in without deleting the customer record.</p>
                </div>
                <div className="ud-section-body">
                  <div className="ud-actions-row">
                    <button
                      type="button"
                      className={`admin-btn admin-btn-sm ${u.isActive === false ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                      onClick={onToggleActive}
                    >
                      {u.isActive === false ? 'Activate account' : 'Deactivate account'}
                    </button>
                    <span className="ud-actions-hint">
                      {u.isActive === false
                        ? 'The customer cannot log in while inactive.'
                        : 'Use deactivation for fraud, chargebacks, or policy violations.'}
                    </span>
                  </div>
                </div>
              </section>

              {canAdjustWallet ? (
              <section className="ud-section ud-caution">
                <div className="ud-section-header">
                  <h2 className="ud-section-title">Adjust wallet (admin)</h2>
                  <p className="ud-section-desc">
                    Give or take Purchased SC, Bonus SC, or Redeemable SC. Write a reason when giving. Every change is saved in Wallet activity.
                  </p>
                </div>
                <div className="ud-section-body">
                  <form onSubmit={submitAddSc} className="ud-adjust-form">
                    <div className="ud-adjust-form-head">
                      <h3>Give SC</h3>
                      <p>Fill any wallet you want to top up. Description is required.</p>
                    </div>
                    <div className="ud-form-grid">
                      <div className="users-filter-field">
                        <label htmlFor="add-psc">Purchased SC</label>
                        <input
                          id="add-psc"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={addPsc}
                          onChange={(e) => setAddPsc(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="users-filter-field">
                        <label htmlFor="add-bsc">Bonus SC</label>
                        <input
                          id="add-bsc"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={addBsc}
                          onChange={(e) => setAddBsc(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="users-filter-field">
                        <label htmlFor="add-rsc">Redeemable SC</label>
                        <input
                          id="add-rsc"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={addRsc}
                          onChange={(e) => setAddRsc(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="users-filter-field" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="add-sc-description">Why? (required)</label>
                        <input
                          id="add-sc-description"
                          type="text"
                          maxLength={500}
                          placeholder="Example: Manual package fix"
                          value={addDescription}
                          onChange={(e) => setAddDescription(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="ud-form-actions">
                      <button type="submit" className="admin-btn admin-btn-sm ud-btn-add-sc" disabled={addingSc}>
                        {addingSc ? 'Giving…' : 'Give SC'}
                      </button>
                    </div>
                  </form>

                  <form onSubmit={submitDeduct}>
                    <div className="ud-adjust-form-head">
                      <h3>Take SC away</h3>
                      <p>Take from each wallet separately. Amounts on hold stay.</p>
                    </div>
                    <div className="ud-form-grid">
                      <div className="users-filter-field">
                        <label htmlFor="deduct-psc">Take Purchased SC</label>
                        <input
                          id="deduct-psc"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={deductPsc}
                          onChange={(e) => setDeductPsc(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="users-filter-field">
                        <label htmlFor="deduct-bsc">Take Bonus SC</label>
                        <input
                          id="deduct-bsc"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={deductBsc}
                          onChange={(e) => setDeductBsc(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="users-filter-field">
                        <label htmlFor="deduct-rsc">Take Redeemable SC</label>
                        <input
                          id="deduct-rsc"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={deductRsc}
                          onChange={(e) => setDeductRsc(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div className="users-filter-field" style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="deduct-reason">Internal note (optional)</label>
                        <input
                          id="deduct-reason"
                          type="text"
                          maxLength={500}
                          placeholder="Shown on the ledger for support staff"
                          value={deductReason}
                          onChange={(e) => setDeductReason(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="ud-form-actions">
                      <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary" disabled={deducting}>
                        {deducting ? 'Taking…' : 'Take SC'}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
              ) : null}
            </>
          ) : null}

          {tab !== 'overview' && tab !== 'game_accounts' ? (
            <>
              {(tab === 'wallet' || tab === 'game_activity') && (
                <div className="ud-toolbar">
                  {tab === 'wallet' ? (
                    <div className="users-filter-field">
                      <label htmlFor="tx-type">Event type</label>
                      <select id="tx-type" value={txType} onChange={(e) => setTxType(e.target.value)}>
                        <option value="">All events</option>
                        {Object.entries(TX_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {tab === 'game_activity' ? (
                    <div className="users-filter-field">
                      <label htmlFor="act-type">Activity</label>
                      <select id="act-type" value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                        <option value="">All activities</option>
                        {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              )}
              {listLoading ? (
                <div className="page-loading">Loading…</div>
              ) : (
                <>
                  {tab === 'deposits' ? (
                    <div className="ud-hero-balances ud-deposit-tab-stats" aria-label="Deposit summary by status">
                      <div className="ud-mini-stat ud-mini-stat--psc">
                        <span className="ud-mini-stat-label">Total completed</span>
                        <span className="ud-mini-stat-value">{formatMoney(depositTabStats.completedAmount)} SC</span>
                        <span className="ud-mini-stat-hint">completed top-ups only</span>
                      </div>
                      <div className="ud-mini-stat ud-mini-stat--bsc">
                        <span className="ud-mini-stat-label">Total pending</span>
                        <span className="ud-mini-stat-value">{formatMoney(depositTabStats.pendingAmount)} SC</span>
                        <span className="ud-mini-stat-hint">awaiting payment</span>
                      </div>
                      <div className="ud-mini-stat ud-mini-stat--expired">
                        <span className="ud-mini-stat-label">Total expired</span>
                        <span className="ud-mini-stat-value">{formatMoney(depositTabStats.expiredAmount)} SC</span>
                        <span className="ud-mini-stat-hint">expired / timed out</span>
                      </div>
                      {depositTabStats.failedAmount > 0 ? (
                        <div className="ud-mini-stat ud-mini-stat--failed">
                          <span className="ud-mini-stat-label">Total failed</span>
                          <span className="ud-mini-stat-value">{formatMoney(depositTabStats.failedAmount)} SC</span>
                          <span className="ud-mini-stat-hint">failed / rejected</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {tab === 'withdrawals' ? (
                    <div className="ud-hero-balances ud-deposit-tab-stats" aria-label="Withdrawal summary by status">
                      <div className="ud-mini-stat ud-mini-stat--psc">
                        <span className="ud-mini-stat-label">Total completed</span>
                        <span className="ud-mini-stat-value">{formatMoney(withdrawalTabStats.completedAmount)} SC</span>
                        <span className="ud-mini-stat-hint">paid out successfully</span>
                      </div>
                      <div className="ud-mini-stat ud-mini-stat--bsc">
                        <span className="ud-mini-stat-label">Total pending</span>
                        <span className="ud-mini-stat-value">{formatMoney(withdrawalTabStats.pendingAmount)} SC</span>
                        <span className="ud-mini-stat-hint">pending / processing</span>
                      </div>
                      <div className="ud-mini-stat ud-mini-stat--failed">
                        <span className="ud-mini-stat-label">Total failed</span>
                        <span className="ud-mini-stat-value">{formatMoney(withdrawalTabStats.failedAmount)} SC</span>
                        <span className="ud-mini-stat-hint">failed requests</span>
                      </div>
                      {withdrawalTabStats.rejectedAmount > 0 ? (
                        <div className="ud-mini-stat ud-mini-stat--expired">
                          <span className="ud-mini-stat-label">Total rejected</span>
                          <span className="ud-mini-stat-value">{formatMoney(withdrawalTabStats.rejectedAmount)} SC</span>
                          <span className="ud-mini-stat-hint">rejected / cancelled</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {listData.total > 0 ? (
                    <p className="ud-table-meta">
                      Showing {from}–{to} of {listData.total}
                      {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
                    </p>
                  ) : null}
                  <div className="table-wrap">
                    <table className="admin-table">
                      <thead>
                        {tab === 'wallet' && (
                          <tr>
                            <th scope="col">Date &amp; time</th>
                            <th scope="col">Event</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Currency</th>
                            <th scope="col">Details</th>
                          </tr>
                        )}
                        {tab === 'casino_transactions' && (
                          <tr>
                            <th scope="col">Date &amp; time</th>
                            <th scope="col">Operation</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Game</th>
                          </tr>
                        )}
                        {tab === 'game_activity' && (
                          <tr>
                            <th scope="col">Date &amp; time</th>
                            <th scope="col">Game</th>
                            <th scope="col">Activity</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Details</th>
                            <th scope="col">Source</th>
                          </tr>
                        )}
                        {tab === 'manual' && (
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Game</th>
                            <th scope="col">Request</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Status</th>
                          </tr>
                        )}
                        {tab === 'deposits' && (
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Method</th>
                            <th scope="col">Status</th>
                            <th scope="col">Provider</th>
                            <th scope="col">Details</th>
                          </tr>
                        )}
                        {tab === 'withdrawals' && (
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Status</th>
                            <th scope="col">Method</th>
                            <th scope="col">Currency</th>
                            <th scope="col">Approved by</th>
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {tab === 'wallet' && listData.list.length === 0 && (
                          <tr>
                            <td colSpan={5}>
                              <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                                <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                  No wallet events yet
                                </p>
                                <p>This list will populate after deposits, game transfers, spin wheel wins, or withdrawals.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                        {tab === 'wallet' &&
                          listData.list.map((row) => (
                            <tr key={row.id}>
                              <td>{formatDt(row.createdAt)}</td>
                              <td>
                                <span className="ud-table-type">
                                  {TX_TYPE_LABELS[row.type] || row.type}
                                  {TX_TYPE_LABELS[row.type] ? (
                                    <code className="ud-mono"> ({row.type})</code>
                                  ) : null}
                                </span>
                              </td>
                              <td>{formatMoney(row.amount)}</td>
                              <td>{row.currencyCode}</td>
                              <td className="ud-wallet-detail-td">{formatWalletActivityDetails(row)}</td>
                            </tr>
                          ))}
                        {tab === 'casino_transactions' && listData.list.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                                <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                  No transactions found
                                </p>
                                <p>This list will populate after applicable events occur.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                        {tab === 'casino_transactions' &&
                          listData.list.map((row) => (
                            <tr key={row.id}>
                              <td>{formatDt(row.createdAt || row.created_at)}</td>
                              <td>
                                <span className="ud-table-type">{humanizeSnake(row.operation)}</span>
                              </td>
                              <td>{formatMoney(row.amount)}</td>
                              <td>{row.gameName || row.gameId || '—'}</td>
                            </tr>
                          ))}
                        {tab === 'game_activity' && listData.list.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                                <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                  No in-game activity
                                </p>
                                <p>Events appear when the user registers a game, tops up, withdraws to a game, or redeems.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                        {tab === 'game_activity' &&
                          listData.list.map((row) => (
                            <tr key={row.id}>
                              <td>{formatDt(row.createdAt)}</td>
                              <td>{row.game?.name ?? '—'}</td>
                              <td>{ACTIVITY_LABELS[row.activityType] || row.activityType}</td>
                              <td>{row.amount != null ? formatMoney(row.amount) : '—'}</td>
                              <td className="ud-wallet-detail-td">{formatGameActivityDetails(row)}</td>
                              <td>{formatActivitySource(row.operationDoneBy)}</td>
                            </tr>
                          ))}
                        {tab === 'manual' && listData.list.length === 0 && (
                          <tr>
                            <td colSpan={5}>
                              <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                                <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                  No manual requests
                                </p>
                                <p>Nothing is queued for manual processing for this user.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                        {tab === 'manual' &&
                          listData.list.map((row) => (
                            <tr key={row.id}>
                              <td>{formatDt(row.createdAt)}</td>
                              <td>{row.game?.name ?? '—'}</td>
                              <td>{REQUEST_TYPE_LABELS[row.requestType] || row.requestType}</td>
                              <td>{row.amount != null ? formatMoney(row.amount) : '—'}</td>
                              <td>
                                <Badge variant={statusPillVariant(row.status)}>{row.status}</Badge>
                              </td>
                            </tr>
                          ))}
                        {tab === 'deposits' && listData.list.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                                <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                  No deposits
                                </p>
                                <p>No payment top-ups are recorded for this user.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                        {tab === 'deposits' &&
                          listData.list.map((row) => (
                            <tr key={row.id}>
                              <td>{formatDt(row.createdAt)}</td>
                              <td>{formatMoney(row.amount, ` ${row.currencyCode || ''}`)}</td>
                              <td>{row.methodDisplayLabel || row.method || '—'}</td>
                              <td>
                                <Badge variant={statusPillVariant(row.status)}>{row.status}</Badge>
                              </td>
                              <td>{formatDepositProviderLabel(row)}</td>
                              <td className="ud-wallet-detail-td">{formatDepositBuyDetails(row)}</td>
                            </tr>
                          ))}
                        {tab === 'withdrawals' && listData.list.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                                <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                  No withdrawals
                                </p>
                                <p>No cash-out requests for this user.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                        {tab === 'withdrawals' &&
                          listData.list.map((row) => (
                            <tr key={row.uid || row.id}>
                              <td>{formatDt(row.createdAt)}</td>
                              <td>{formatMoney(row.amount)}</td>
                              <td>
                                <Badge variant={statusPillVariant(row.status)}>{row.status}</Badge>
                              </td>
                              <td>{row.paymentMethodLabel || row.method || '—'}</td>
                              <td>{row.currency || '—'}</td>
                              <td>
                                {row.approvedBy?.displayName || '—'}
                                {row.approvedBy?.panelRoleName || row.approvedBy?.role ? (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', marginTop: 2 }}>
                                    {row.approvedBy.panelRoleName || row.approvedBy.role}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {listData.total > PAGE_SIZE ? (
                    <div className="pagination">
                      <span className="pagination-info">
                        {listData.total > 0 ? `Showing ${from}–${to} of ${listData.total}` : 'No results'}
                        {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
                      </span>
                      <div className="pagination-buttons">
                        <button type="button" className="admin-btn admin-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                          Previous
                        </button>
                        <button type="button" className="admin-btn admin-btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {tab === 'game_accounts' && u ? (
            listLoading ? (
              <div className="page-loading">Loading…</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <p className="ud-table-meta" style={{ margin: 0 }}>Linked provider accounts for this customer.</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      onClick={handleOpenHistory}
                    >
                      View Credential History
                    </button>
                    {listData.list.some(row => row.botUsername || row.botPassword) && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-danger"
                        onClick={handleDeleteAllCredentials}
                      >
                        Delete All Credentials
                      </button>
                    )}
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Game</th>
                        <th scope="col">Game username</th>
                        <th scope="col">Password</th>
                        <th scope="col">Link status</th>
                        <th scope="col">Linked on</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.list.length === 0 && (
                        <tr>
                          <td colSpan={6}>
                            <div className="ud-empty" style={{ border: 'none', background: 'transparent', padding: '1.25rem' }}>
                              <p className="ud-empty-title" style={{ fontSize: '0.9rem' }}>
                                No game accounts
                              </p>
                              <p>This user has not registered any games yet.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {listData.list.map((row) => (
                        <tr key={row.id}>
                          <td>{row.game?.name ?? '—'}</td>
                          <td>
                            <span className="ud-mono">{row.botUsername || '—'}</span>
                          </td>
                          <td>
                            <span className="ud-mono">{row.botPassword || '—'}</span>
                          </td>
                          <td>
                            <Badge variant={row.status === 'active' ? 'success' : 'neutral'}>{row.status}</Badge>
                          </td>
                          <td>{formatDt(row.createdAt)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="admin-btn admin-btn-sm admin-btn-secondary"
                                onClick={() => openEditAccount(row)}
                              >
                                Edit
                              </button>
                              {(row.botUsername || row.botPassword) && (
                                <button
                                  type="button"
                                  className="admin-btn admin-btn-sm admin-btn-danger"
                                  onClick={() => handleDeleteCredentials(row)}
                                >
                                  Delete
                                </button>
                              )}
                              {!(row.botUsername || row.botPassword) && !row.credentialsEditable && null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {editAccountModal && (
                  <EditManualRegisterCredentialsModal
                    userName={title}
                    gameName={editAccountModal.row.game?.name || '—'}
                    credentials={editAccountModal.credentials}
                    logs={editAccountModal.logs}
                    loadingCredentials={editAccountModal.loadingCredentials}
                    onConfirm={handleEditAccountCredentials}
                    onClose={closeEditAccountModal}
                    saving={savingCredentials}
                  />
                )}
                {historyModalOpen && (
                  <CredentialHistoryModal
                    userName={title}
                    history={historyData}
                    loading={loadingHistory}
                    onClose={() => setHistoryModalOpen(false)}
                  />
                )}
              </>
            )
          ) : null}
        </>
      ) : null}
    </div>
  )
}
