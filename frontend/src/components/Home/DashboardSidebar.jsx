import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSpinWheelStatus } from '../../context/SpinWheelStatusContext';
import {
  GamesIcon,
  SlotIcon,
  SpinIcon,
  GiftIcon,
  ReferEarnIcon,
  CrownIcon,
  DepositIcon,
  WithdrawIcon,
  ChatIcon,
  PlayIcon,
  BlogIcon,
  DownloadIcon,
} from '../../assets/icons';
import { openSupportWidget } from '../intercomApi';
import { startOnboardingTutorial } from '../../utils/onboardingTutorial';
import * as dailyBonusApi from '../../api/dailyBonus';
import { useEnabledSlotProviders } from '../../hooks/useEnabledSlotProviders';
import { warmupCasino } from '../../utils/preloadCasino';
import {
  ORIONSTAR_CATEGORY_ORDER,
  getSlotCategoryPath,
  isHiddenSlotCategoryId,
} from '../../utils/gitslotparkLandingGames';

const SIDEBAR_SLOT_CATEGORIES = ORIONSTAR_CATEGORY_ORDER.filter(
  (category) =>
    !['plinko', 'video-poker', 'casual-games'].includes(category.id) &&
    !isHiddenSlotCategoryId(category.id)
);

/**
 * Dashboard left rail — Reelhouse-style flat rows (no collapse / hamburger).
 * Same destinations as before; quieter help rows at the bottom.
 */
export function DashboardSidebar({
  activeView = 'games',
  onSelectView,
  hasSlots = false,
  onNavigate,
  isAuthenticated = true,
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { canSpin } = useSpinWheelStatus();
  const onCasinoPage = pathname === '/casino' || pathname.startsWith('/casino/');
  const { providers, loaded: providersLoaded } = useEnabledSlotProviders({
    enabled: isAuthenticated || onCasinoPage,
  });
  const showSlotCategories = providersLoaded && hasSlots && providers.onegamehub === true;
  const [dailyBonusEnabled, setDailyBonusEnabled] = useState(false);
  const onPlatformPage = pathname === '/platform';
  const onLink2PlayPage = pathname === '/link2play';
  const onBlogPage = pathname === '/blog' || pathname.startsWith('/blog/');
  const onInstallPage = pathname === '/install';
  const onDailyBonusPage = pathname === '/daily-bonus';
  const onSpinPage = pathname === '/spinwheel';
  const onPromotionsPage = pathname === '/promotions';
  const onVipPage = pathname === '/account/vip';
  const onAffiliatePage = pathname === '/account/affiliate';
  const onDepositPage = pathname === '/deposit';
  const onWithdrawPage = pathname === '/withdraw';
  const [slotsOpen, setSlotsOpen] = useState(onCasinoPage);

  useEffect(() => {
    if (onCasinoPage) setSlotsOpen(true);
  }, [onCasinoPage]);

  useEffect(() => {
    if (!isAuthenticated) {
      setDailyBonusEnabled(false);
      return undefined;
    }
    let cancelled = false;
    dailyBonusApi
      .getDailyBonusStatus({ start: false })
      .then((data) => {
        if (!cancelled) setDailyBonusEnabled(data?.available === true);
      })
      .catch(() => {
        if (!cancelled) setDailyBonusEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const go = (to) => {
    navigate(isAuthenticated ? to : '/register');
  };

  const sections = [
    {
      id: 'lobby',
      label: 'Lobby',
      items: [
        {
          id: 'platforms',
          title: 'Platforms',
          accent: 'gold',
          Icon: GamesIcon,
          onClick: () => {
            if (!isAuthenticated) {
              navigate('/platform');
              return;
            }
            if (onCasinoPage || onLink2PlayPage || onPlatformPage) navigate('/#games');
            else if (onSelectView) onSelectView('games');
            else navigate('/#games');
          },
          active:
            onPlatformPage ||
            (isAuthenticated &&
              !onCasinoPage &&
              !onLink2PlayPage &&
              (activeView === 'games' || activeView === 'platforms')),
        },
        hasSlots
          ? {
              id: 'casino',
              title: 'Casino',
              accent: 'purple',
              Icon: SlotIcon,
              onClick: () => {
                warmupCasino();
                navigate('/casino');
              },
              active: onCasinoPage,
              badge: { text: 'HOT', variant: 'hot' },
            }
          : null,
        {
          id: 'link2play',
          title: 'Link2Play',
          accent: 'gold',
          Icon: GamesIcon,
          to: '/link2play',
          public: true,
          guestOnly: true,
          active: onLink2PlayPage,
        },
      ].filter(Boolean),
    },
    {
      id: 'menu',
      label: 'Menu',
      items: [
        {
          id: 'daily-spin',
          title: 'Daily Spin',
          accent: 'teal',
          Icon: SpinIcon,
          to: '/spinwheel',
          active: onSpinPage,
          badge: canSpin ? { text: 'Ready', variant: 'ready' } : null,
        },
        {
          id: 'daily-bonus',
          title: 'Daily Bonus',
          accent: 'gold',
          Icon: GiftIcon,
          authOnly: true,
          active: onDailyBonusPage,
          badge: { text: 'FREE', variant: 'ready' },
          onClick: () => {
            if (!isAuthenticated) {
              navigate('/register');
              return;
            }
            try {
              window.dispatchEvent(new CustomEvent('daily-bonus:open'));
            } catch (_) {
              navigate('/daily-bonus');
            }
          },
        },
        {
          id: 'promotions',
          title: 'Promotions',
          accent: 'fire',
          Icon: GiftIcon,
          to: '/promotions',
          active: onPromotionsPage,
        },
        {
          id: 'referral',
          title: 'Referral',
          accent: 'green',
          Icon: ReferEarnIcon,
          to: '/account/affiliate',
          public: true,
          active: onAffiliatePage,
        },
        {
          id: 'vip',
          title: 'VIP',
          accent: 'gold',
          Icon: CrownIcon,
          to: '/account/vip',
          active: onVipPage,
        },
        {
          id: 'purchase',
          title: 'Buy SC',
          accent: 'green',
          Icon: DepositIcon,
          to: '/deposit',
          active: onDepositPage,
        },
        {
          id: 'cashout',
          title: 'Withdraw SC',
          accent: 'red',
          Icon: WithdrawIcon,
          to: '/withdraw',
          active: onWithdrawPage,
        },
      ],
    },
    {
      id: 'help',
      label: null,
      divider: true,
      items: [
        {
          id: 'howtoplay',
          title: 'How to play?',
          accent: 'teal',
          Icon: PlayIcon,
          quiet: true,
          authOnly: true,
          onClick: () => {
            if (!isAuthenticated) {
              navigate('/register');
              return;
            }
            startOnboardingTutorial({ navigate, userId: user?.userId });
          },
        },
        {
          id: 'support-chat',
          title: 'Support',
          accent: 'teal',
          Icon: ChatIcon,
          quiet: true,
          public: true,
          onClick: () => openSupportWidget(),
        },
        {
          id: 'install',
          title: 'How to Install',
          accent: 'gold',
          Icon: DownloadIcon,
          quiet: true,
          to: '/install',
          public: true,
          active: onInstallPage,
        },
        {
          id: 'blog',
          title: 'Blog posts',
          accent: 'purple',
          Icon: BlogIcon,
          quiet: true,
          to: '/blog',
          public: true,
          active: onBlogPage,
        },
      ],
    },
  ];

  const goCasinoCategory = (to) => {
    warmupCasino();
    navigate(to);
    onNavigate?.();
  };

  const renderCasinoDropdown = () => (
    <div key="casino" className={`dash-side-slots${slotsOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        onClick={() => setSlotsOpen((open) => !open)}
        className={`dash-side-item dash-side-item--purple${onCasinoPage ? ' active' : ''}`}
        aria-expanded={slotsOpen}
        aria-controls="dash-side-casino-list"
      >
        <span className="dash-side-icon" aria-hidden>
          <SlotIcon className="w-[16px] h-[16px]" />
        </span>
        <span className="dash-side-item-title">Casino</span>
        <span className="dash-side-chevron" aria-hidden />
      </button>
      {slotsOpen ? (
        <div id="dash-side-casino-list" className="dash-side-slots-sub" role="group" aria-label="Casino categories">
          <button
            type="button"
            onClick={() => goCasinoCategory('/casino')}
            className={`dash-side-subitem${pathname === '/casino' ? ' active' : ''}`}
            aria-current={pathname === '/casino' ? 'true' : undefined}
          >
            All Casino Games
          </button>
          {SIDEBAR_SLOT_CATEGORIES.map((category) => {
            const to = getSlotCategoryPath(category.id);
            const active = pathname === to;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => goCasinoCategory(to)}
                className={`dash-side-subitem${active ? ' active' : ''}`}
                aria-current={active ? 'true' : undefined}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const renderItem = (item) => {
    const {
      id,
      title,
      accent = 'gold',
      Icon,
      to,
      badge,
      quiet,
      public: isPublic,
      guestOnly,
      authOnly,
      onClick: customClick,
      active,
    } = item;

    if (guestOnly && isAuthenticated) return null;
    if (authOnly && !isAuthenticated) return null;

    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          if (customClick) customClick();
          else if (isPublic) navigate(to);
          else go(to);
          onNavigate?.();
        }}
        className={`dash-side-item dash-side-item--${accent}${quiet ? ' dash-side-item--quiet' : ''}${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className="dash-side-icon" aria-hidden>
          <Icon className="w-[16px] h-[16px]" />
        </span>
        <span className="dash-side-item-title">{title}</span>
        {badge?.text ? (
          <span className={`dash-side-badge dash-side-badge--${badge.variant || 'hot'}`}>
            {badge.text}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside className="dash-side" aria-label="Dashboard navigation">
      <nav className="dash-side-nav">
        {sections.map((section) => {
          const visible = section.items.filter((item) => {
            if (item.guestOnly && isAuthenticated) return false;
            if (item.authOnly && !isAuthenticated) return false;
            if (item.id === 'daily-bonus' && !dailyBonusEnabled) return false;
            return true;
          });
          if (!visible.length) return null;
          return (
            <div key={section.id} className="dash-side-group">
              {section.divider ? <div className="dash-side-divider" aria-hidden /> : null}
              {section.label ? (
                <div className="dash-side-group-head">
                  <p className="dash-side-group-label">{section.label}</p>
                </div>
              ) : null}
              <div className="dash-side-group-list">
                {visible.map((item) =>
                  item.id === 'casino' && showSlotCategories ? renderCasinoDropdown() : renderItem(item)
                )}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
