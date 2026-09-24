/** Shared authenticated lobby destinations — desktop navbar + mobile quick menu. */
export const AUTH_LOBBY_LINKS = [
  {
    id: 'home',
    to: '/',
    label: 'Home',
    art: '/df-online/menu/menu-home.webp',
    match: (path) => path === '/'
  },
  {
    id: 'games',
    to: '/casino',
    label: 'Games',
    art: '/df-online/menu/menu-games.webp',
    match: (path) => path === '/casino' || path.startsWith('/casino/')
  },
  {
    id: 'store',
    to: '/store',
    label: 'Store',
    art: '/df-online/menu/menu-store.webp',
    match: (path) => path === '/deposit' || path === '/store'
  },
  {
    id: 'redeem',
    to: '/redeem',
    label: 'Redeem',
    art: '/df-online/menu/menu-redeem.webp',
    match: (path) => path === '/redeem' || path === '/withdraw'
  },
  {
    id: 'bonus',
    to: '/bonus',
    label: 'Bonus',
    art: '/df-online/menu/menu-bonus.webp',
    match: (path) => path === '/bonus',
    desktop: false
  },
  {
    id: 'promotions',
    to: '/promotions',
    label: 'Promotions',
    art: '/df-online/menu/menu-promos.webp',
    match: (path) => path === '/promotions'
  },
  {
    id: 'spin',
    to: '/spinwheel',
    label: 'Spin',
    art: '/df-online/menu/menu-spin.webp',
    match: (path) => path === '/spinwheel' || path.startsWith('/spin')
  },
  {
    id: 'vip',
    to: '/account/vip',
    label: 'VIP',
    art: '/df-online/menu/menu-vip.webp',
    match: (path) => path.startsWith('/account/vip')
  },
  {
    id: 'refer',
    to: '/account/affiliate',
    label: 'Refer',
    art: '/df-online/menu/menu-refer.webp',
    match: (path) => path.startsWith('/account/affiliate')
  },
  {
    id: 'profile',
    to: '/settings',
    label: 'Profile',
    art: '/df-online/menu/menu-profile.webp',
    match: (path) => path === '/settings'
  },
  {
    id: 'txns',
    to: '/account/transactions',
    label: 'Txns',
    art: '/df-online/menu/menu-txns.webp',
    match: (path) => path.startsWith('/account/transactions')
  },
  {
    id: 'install',
    to: '/install',
    label: 'How to Install',
    art: '/df-online/menu/menu-install.webp',
    match: (path) => path === '/install' || path === '/download'
  },
  {
    id: 'blog',
    to: '/blog',
    label: 'Blog posts',
    art: '/df-online/menu/menu-blog.webp',
    match: (path) => path === '/blog' || path.startsWith('/blog/')
  },
  {
    id: 'support',
    to: '/help',
    label: 'Support',
    art: '/df-online/menu/menu-support.webp',
    match: (path) => path === '/help' || path.startsWith('/support'),
    desktop: false,
    openLiveChat: true
  }
];
