import { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } from './permissions'

/**
 * Permission layout for store role form UI.
 */
export const PERMISSION_GROUPS = [
  { key: STORE_FEATURE_KEYS.DASHBOARD, label: 'Dashboard', description: 'Access to dashboard and overview' },
  { key: STORE_FEATURE_KEYS.USERS_LIST, label: 'Users', description: 'View and manage users list' },
  {
    key: STORE_FEATURE_KEYS.WALLET_ADJUST,
    label: 'Add / remove SC',
    description: 'Add SC or deduct SC/RSC on your store’s users from User Detail. Requires Users. Existing roles that already had Users keep this until you turn it off.'
  },
  { key: STORE_FEATURE_KEYS.REPORTS, label: 'Reports', description: 'View reports and analytics' },
  {
    key: STORE_FEATURE_KEYS.WALLET_SC_RECONCILIATION,
    label: 'SC coin story',
    description: 'See bought coins (PSC), gift coins (BSC), and redeem coins (RSC) for this store. Turn this on to give store staff the page.'
  },
  {
    key: STORE_FEATURE_KEYS.DAILY_SC_REPORT,
    label: 'Daily SC report',
    description: 'See each day’s SC in, SC out, leftover, and leftover carried to the next day. Roles with SC coin story or Reports may access this even when this box is off.'
  },
  { key: STORE_FEATURE_KEYS.GAMES, label: 'Games', description: 'Games management and CRUD' },
  { key: STORE_FEATURE_KEYS.GAME_LOGS, label: 'Game Logs', description: 'View automated game logs (signup/deposit/withdraw) and GitSlotPark slots transactions' },
  {
    key: STORE_FEATURE_KEYS.CASINO_GAMES_REPORT,
    label: 'Casino games report',
    description: 'SC wagered, SC won, GGR, and payout by casino game. Off by default — super admin must turn this on for the store owner or staff role.'
  },
  {
    groupLabel: 'Manual Requests',
    groupDescription: 'Grant access to game manual requests by request type.',
    children: [
      { key: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS, label: 'All' },
      { key: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER, label: 'Register' },
      { key: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT, label: 'Deposit' },
      { key: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM, label: 'Redeem' }
    ]
  },
  { key: STORE_FEATURE_KEYS.SPIN_WHEEL, label: 'Spin wheel', description: 'Spin wheel settings and management' },
  { key: STORE_FEATURE_KEYS.VIP, label: 'VIP', description: 'VIP levels and settings' },
  { key: STORE_FEATURE_KEYS.AFFILIATE, label: 'Affiliate', description: 'Refer & Earn settings and referral transactions report' },
  { key: STORE_FEATURE_KEYS.DEPOSIT_BONUSES, label: 'Deposit bonuses', description: 'New user 1st/2nd/3rd deposit bonus settings' },
  { key: STORE_FEATURE_KEYS.WELCOME_SIGNUP_BONUS, label: 'Welcome signup bonus', description: 'Free SC credited once when a new user signs up' },
  { key: STORE_FEATURE_KEYS.DASHBOARD_SLIDESHOW, label: 'Homepage pictures', description: 'Upload homepage and casino page slideshow images (computer and phone)' },
  { key: STORE_FEATURE_KEYS.DASHBOARD_PROMO_MODALS, label: 'Dashboard promo modals', description: 'Post-login modal sequence, order, and delays on the player dashboard' },
  { key: STORE_FEATURE_KEYS.DAILY_BONUS, label: 'Daily bonus', description: 'Configure 7-day daily bonus (SC, bonus spin, package vouchers) and whether it repeats after 7 days' },
  { key: STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS, label: 'Email campaigns', description: 'PlayJuwa no-deposit email campaigns, test allowlist, and send status' },
  { key: STORE_FEATURE_KEYS.PUSH_CAMPAIGNS, label: 'Push notifications', description: 'Browser push notifications, permission stats, and click tracking' },
  { key: STORE_FEATURE_KEYS.DEPOSIT_PACKAGES, label: 'Deposit packages', description: 'Manage store deposit package tiers shown before payment' },
  { key: STORE_FEATURE_KEYS.STORE_ROLES_MANAGE, label: 'Store roles', description: 'Create and manage store roles from Role and staff management' },
  { key: STORE_FEATURE_KEYS.STORE_STAFF_MANAGE, label: 'Store staff', description: 'Add and manage store staff from Role and staff management' },
  { key: STORE_FEATURE_KEYS.PAYMENT_PROVIDERS, label: 'Payment providers', description: 'Enable or disable payment methods (deposit/withdraw) for your store users' },
  { key: STORE_FEATURE_KEYS.USER_DEPOSITS, label: 'User deposits', description: 'View user wallet deposit history for your store' },
  {
    key: STORE_FEATURE_KEYS.PAYMENT_TOTALS,
    label: 'Payment totals',
    description: 'See live deposit and withdrawal totals on the Dashboard. Store admin has this by default. Store staff only see it when this box is on.'
  },
  { key: STORE_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS, label: 'Chime / Cash App withdrawals', description: 'Review and approve Chime and Cash App manual withdrawal requests' },
  { key: STORE_FEATURE_KEYS.CHIME_DEPOSITS, label: 'Chime deposits', description: 'Review and approve Chime deposit requests' },
  {
    key: STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS,
    label: 'Account totals',
    description: 'See total USD received per pay-to Chime username on the Chime deposits page. Off until super admin or technical staff turn this on for the role.'
  },
  { key: STORE_FEATURE_KEYS.CHIME_ACCOUNTS, label: 'Chime accounts', description: 'Manage pay-to Chime accounts (cashtags, QR codes, app links) for deposits' },
  { key: STORE_FEATURE_KEYS.HELP_CONTENT, label: 'Help content', description: 'Manage help guides (Create Account, Recharge, Redeem, etc.) for your store; use platform default or custom content' },
  {
    key: STORE_FEATURE_KEYS.SUPPORT_TICKETS,
    label: 'Support tickets',
    description: 'View and reply to player support tickets for your store. Enable this on a store role to give store staff access.'
  },
  { key: STORE_FEATURE_KEYS.BLOG_POSTS, label: 'Blog posts', description: 'Create and manage blog posts shown on your store’s user site' },
  { key: STORE_FEATURE_KEYS.LINK2PLAY, label: 'Link2Play', description: 'Manage Link2Play games on the store landing page (not available for casinoslots / grandsweeps)' },
  { key: STORE_FEATURE_KEYS.FOOTER_PAGES, label: 'Footer pages', description: 'Add and edit website footer menu groups and pages for your store' },
  { key: STORE_FEATURE_KEYS.BONUS_CODES, label: 'Bonus codes', description: 'Create and manage URL signup / deposit bonus codes for your store' },
  { key: STORE_FEATURE_KEYS.GEO_IP_ALLOWLIST, label: 'Geo IP allowlist', description: 'Add or remove IPs that bypass geo-blocking for your store’s user site' },
  { key: STORE_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST, label: 'Signup device IP allowlist', description: 'Add or remove IPs that can create multiple accounts on the same device for testing' },
  { key: STORE_FEATURE_KEYS.SOCIAL_LINKS, label: 'Social media links', description: 'Facebook, Facebook Group, Messenger, and WhatsApp URLs on the public landing page' },
  { key: STORE_FEATURE_KEYS.LANDING_PAYMENT_LINKS, label: 'Landing payment links', description: 'Deposit and withdrawal dropdown links on the public landing page' }
]

/** Flatten all permission keys from groups (for form state). */
export function getAllRolePermissionKeys() {
  const keys = []
  PERMISSION_GROUPS.forEach((item) => {
    if (item.key) keys.push(item.key)
    if (item.children) item.children.forEach((c) => keys.push(c.key))
  })
  return keys
}

/**
 * Permission layout for admin role form UI (master_admin panel).
 */
export const ADMIN_PERMISSION_GROUPS = [
  { key: ADMIN_FEATURE_KEYS.DASHBOARD, label: 'Dashboard', description: 'Access to dashboard' },
  { key: ADMIN_FEATURE_KEYS.DISTRIBUTORS, label: 'Distributors', description: 'Manage distributors' },
  { key: ADMIN_FEATURE_KEYS.STORES, label: 'Stores', description: 'Manage stores' },
  { key: ADMIN_FEATURE_KEYS.USERS, label: 'Users', description: 'View and manage users' },
  {
    key: ADMIN_FEATURE_KEYS.CONTACT_LISTS,
    label: 'Email & phone lists',
    description: 'View and download player email and mobile number lists. Super admin always has this. Technical staff only get it when you turn this on for their role. Every download is tracked.'
  },
  {
    key: ADMIN_FEATURE_KEYS.WALLET_ADJUST,
    label: 'Add / remove SC',
    description: 'Add SC or deduct SC/RSC on end-user wallets from User Detail. Requires Users. Existing roles that already had Users keep this until you turn it off.'
  },
  { key: ADMIN_FEATURE_KEYS.REPORTS, label: 'Reports', description: 'View reports' },
  {
    key: ADMIN_FEATURE_KEYS.BONUS_REPORT,
    label: 'Bonus report',
    description: 'See free SC bonuses across stores (welcome, codes, daily, VIP, spin, referral). Super admin and technical staff only. Roles with Reports or any bonus feature may access this even when this box is off.'
  },
  {
    key: ADMIN_FEATURE_KEYS.BONUS_SC_USAGE,
    label: 'Bonus SC used & left',
    description: 'See how much Bonus SC is still left vs already used. Super admin and technical staff only. Roles with Bonus report, Reports, or any bonus feature may access this even when this box is off.'
  },
  {
    key: ADMIN_FEATURE_KEYS.PAYMENT_REPORT,
    label: 'Payment report',
    description: 'Payment method and provider success/failure rates across stores. Super admin and technical staff only. Roles with Reports, Payment providers, User deposits, or Payment totals may access this even when this box is off.'
  },
  {
    key: ADMIN_FEATURE_KEYS.WALLET_ADJUST_REPORT,
    label: 'Wallet adjust report',
    description: 'Audit of admin/staff PSC, BSC, and RSC add/remove on player wallets (who handled it, when, amount). Super admin and technical staff only. Roles with Reports, Add/remove SC, or Users may access this even when this box is off.'
  },
  {
    key: ADMIN_FEATURE_KEYS.WALLET_SC_RECONCILIATION,
    label: 'SC coin story',
    description: 'See bought, gift, and redeem SC for all stores and players. Turn this on for technical staff. For store staff, turn it on under store roles.'
  },
  {
    key: ADMIN_FEATURE_KEYS.DAILY_SC_REPORT,
    label: 'Daily SC report',
    description: 'Each day’s SC in, SC out, leftover, and leftover carried to the next day. Roles with SC coin story or Reports may access this even when this box is off.'
  },
  {
    key: ADMIN_FEATURE_KEYS.CASINO_GAMES_REPORT,
    label: 'Casino games report',
    description: 'SC wagered, SC won, GGR, and payout by casino game. Super admin and technical staff. Roles with Game Logs or Reports may access this even when this box is off. Grant the same page to a store from Edit Store or a store role.'
  },
  {
    key: ADMIN_FEATURE_KEYS.STORE_WALLET_SUMMARY,
    label: 'Store wallet summary',
    description: 'Per-store topup and withdrawal totals (date range). Roles with Reports, Payment providers, or Games may access this page even when this box is off.'
  },
  {
    key: ADMIN_FEATURE_KEYS.PAYMENT_TOTALS,
    label: 'Payment totals',
    description: 'See live store deposit and withdrawal totals on the Dashboard (and store detail). Super admin and technical staff have this by default. Other admin roles only see it when this box is on.'
  },
  { key: ADMIN_FEATURE_KEYS.GAMES, label: 'Games', description: 'Games management' },
  {
    key: ADMIN_FEATURE_KEYS.AUTOMATION_USAGE,
    label: 'Automation usage',
    description: 'Third-party bot API call volume and error reporting for automation games. Roles with Games may access this page even when this box is off.'
  },
  { key: ADMIN_FEATURE_KEYS.GAME_LOGS, label: 'Game Logs', description: 'Game logs and slots transactions across stores' },
  { key: ADMIN_FEATURE_KEYS.SPIN_WHEEL, label: 'Spin wheel', description: 'Spin wheel settings (when exposed to master admin users)' },
  { key: ADMIN_FEATURE_KEYS.VIP, label: 'VIP', description: 'VIP levels and settings' },
  { key: ADMIN_FEATURE_KEYS.AFFILIATE, label: 'Refer & Earn', description: 'Affiliate settings and referral transactions report' },
  { key: ADMIN_FEATURE_KEYS.DEPOSIT_BONUSES, label: 'Deposit bonuses', description: 'New user 1st/2nd/3rd deposit bonus settings' },
  { key: ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS, label: 'Welcome signup bonus', description: 'View and edit free SC welcome signup bonus for any store' },
  { key: ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW, label: 'Homepage pictures', description: 'View and edit homepage and casino slideshow pictures for any store' },
  { key: ADMIN_FEATURE_KEYS.DASHBOARD_PROMO_MODALS, label: 'Dashboard promo modals', description: 'Configure post-login modal order and delays for any store' },
  { key: ADMIN_FEATURE_KEYS.DAILY_BONUS, label: 'Daily bonus', description: 'Configure 7-day daily bonus for stores (SC, bonus spin, vouchers) and whether it repeats after 7 days' },
  { key: ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS, label: 'Email campaigns', description: 'PlayJuwa no-deposit email campaigns (isolated from other stores)' },
  { key: ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS, label: 'Push notifications', description: 'Browser push notifications for each store' },
  { key: ADMIN_FEATURE_KEYS.DEPOSIT_PACKAGES, label: 'Deposit packages', description: 'Manage store deposit package tiers shown before payment' },
  {
    groupLabel: 'Manual Requests',
    groupDescription: 'Grant access to game manual requests by request type.',
    children: [
      { key: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS, label: 'All' },
      { key: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER, label: 'Register' },
      { key: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT, label: 'Deposit' },
      { key: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM, label: 'Redeem' }
    ]
  },
  { key: ADMIN_FEATURE_KEYS.SUBSCRIPTIONS, label: 'Subscriptions', description: 'Subscription plans' },
  { key: ADMIN_FEATURE_KEYS.SUBSCRIPTION_REQUESTS, label: 'Subscription requests', description: 'Approve/reject subscription requests' },
  { key: ADMIN_FEATURE_KEYS.PAYMENT_PROVIDERS, label: 'Payment providers', description: 'Platform payment providers' },
  {
    key: ADMIN_FEATURE_KEYS.TRANSACTION_FEES,
    label: 'Transaction fees',
    description: 'Set payin and payout fee % per store. Super admin and technical staff. Roles with Payment providers, User deposits, Payment totals, or Stores may access this even when this box is off.'
  },
  { key: ADMIN_FEATURE_KEYS.USER_DEPOSITS, label: 'User deposits', description: 'View user wallet deposit history across stores. Roles with Payment providers may access this page even when this box is off.' },
  { key: ADMIN_FEATURE_KEYS.CHIME_CASHAPP_WITHDRAWALS, label: 'Chime / Cash App withdrawals', description: 'Review and approve Chime and Cash App manual withdrawals across stores' },
  { key: ADMIN_FEATURE_KEYS.CHIME_DEPOSITS, label: 'Chime deposits', description: 'Review Chime deposit requests across stores' },
  {
    key: ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS,
    label: 'Account totals',
    description: 'Chime deposits tab: total USD received per pay-to username. Super admin and technical staff can allow or remove this for a role. On by default for technical staff.'
  },
  { key: ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS, label: 'Chime accounts', description: 'Manage pay-to Chime accounts (cashtags, QR codes, app links) across stores' },
  { key: ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE, label: 'Admin roles', description: 'Create and manage platform roles from Role and staff management' },
  { key: ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE, label: 'Admin staff', description: 'Manage platform staff and any store’s people and access from Role and staff management' },
  {
    key: ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE,
    label: 'Staff attendance',
    description: 'See store staff check-in/out, opening and closing balances, approved deposits/withdrawals, working hours, and approve off-shift logins. Super admin and technical staff. Roles with Admin staff may access this even when this box is off.'
  },
  { key: ADMIN_FEATURE_KEYS.HELP_CONTENT, label: 'Help content', description: 'Edit platform default help pages; store admins can use these or set their own' },
  { key: ADMIN_FEATURE_KEYS.SUPPORT_TICKETS, label: 'Support tickets', description: 'View and reply to player support tickets across stores' },
  {
    key: ADMIN_FEATURE_KEYS.BLOG_POSTS,
    label: 'Blog posts',
    description: 'Let this role manage blog posts. After Allow, choose All stores or one store.',
    storeScope: true,
    storeScopeNoun: 'blog posts'
  },
  { key: ADMIN_FEATURE_KEYS.LINK2PLAY, label: 'Link2Play', description: 'Manage Link2Play landing catalog per store (name, image, platform links)' },
  {
    key: ADMIN_FEATURE_KEYS.FOOTER_PAGES,
    label: 'Footer pages',
    description: 'Let this role manage website footer links. After Allow, choose All stores or one store.',
    storeScope: true,
    storeScopeNoun: 'footer links'
  },
  { key: ADMIN_FEATURE_KEYS.TECHNICAL_ERROR_EMAIL_NOTIFICATION, label: 'Technical error email notification', description: 'Receive technical error notifications via email' },
  { key: ADMIN_FEATURE_KEYS.BONUS_CODES, label: 'Bonus codes', description: 'Manage bonus codes across stores' },
  { key: ADMIN_FEATURE_KEYS.SOCIAL_LINKS, label: 'Social media links', description: 'Manage landing-page social links for any store' },
  { key: ADMIN_FEATURE_KEYS.LANDING_PAYMENT_LINKS, label: 'Landing payment links', description: 'Manage landing-page deposit and withdrawal dropdown links for any store' },
  { key: ADMIN_FEATURE_KEYS.GEO_BLOCK, label: 'Geo blocking', description: 'Turn geo location blocking on or off for each store' },
  { key: ADMIN_FEATURE_KEYS.GEO_IP_ALLOWLIST, label: 'Geo IP allowlist', description: 'Add or remove store-scoped IPs that bypass geo-blocking on user sites' },
  { key: ADMIN_FEATURE_KEYS.FINGERPRINT_SIGNUP_IP_ALLOWLIST, label: 'Signup device IP allowlist', description: 'Add or remove IPs that skip the one-account-per-device signup block for QA/testing' },
  { key: ADMIN_FEATURE_KEYS.DIDIT_KYC, label: 'KYC Config', description: 'Manage identity KYC store toggles and view KYC reports' },
  { key: ADMIN_FEATURE_KEYS.PHONE_VERIFICATION, label: 'Phone verification', description: 'Enable or disable phone OTP verification per store' }
]

/** Flatten all admin permission keys (for admin role form state). */
export function getAllAdminRolePermissionKeys() {
  const keys = []
  ADMIN_PERMISSION_GROUPS.forEach((item) => {
    if (item.key) keys.push(item.key)
    if (item.children) item.children.forEach((c) => keys.push(c.key))
  })
  return keys
}
