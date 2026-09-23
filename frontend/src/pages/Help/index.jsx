import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getHelp } from '../../api/help';
import { useAuth } from '../../context/AuthContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { HelpContentFromApi } from './HelpContentFromApi';
import {
  CreateAccountHelp,
  RechargeHelp,
  RedeemHelp,
  PromotionsHelp,
  VipHelp,
  SpinWheelHelp,
  ReferEarnHelp,
} from './tabs';
import '../df-content-pages.css';
import './HelpContent.css';

const DEFAULT_TABS = [
  { id: 'create-account', label: 'Create Account', pageTitle: 'How to create account' },
  { id: 'recharge', label: 'Recharge', pageTitle: 'How to recharge' },
  { id: 'redeem', label: 'Redeem', pageTitle: 'How to redeem' },
  { id: 'promotions', label: 'Promotions', pageTitle: 'Get promotions' },
  { id: 'vip', label: 'VIP', pageTitle: 'VIP benefits' },
  { id: 'spin-wheel', label: 'Spin Wheel', pageTitle: 'How to spin the wheel' },
  { id: 'refer-earn', label: 'Refer & Earn', pageTitle: 'Refer & earn rewards' },
];

const TAB_COMPONENTS = {
  'create-account': CreateAccountHelp,
  recharge: RechargeHelp,
  redeem: RedeemHelp,
  promotions: PromotionsHelp,
  vip: VipHelp,
  'spin-wheel': SpinWheelHelp,
  'refer-earn': ReferEarnHelp,
};

function resolveTabId(tabParam, availableTabs) {
  if (!tabParam || !Array.isArray(availableTabs) || availableTabs.length === 0) {
    return availableTabs?.[0]?.id ?? DEFAULT_TABS[0].id;
  }
  const match = availableTabs.find((tab) => tab.id === tabParam);
  return match?.id ?? availableTabs[0].id;
}

export function Help() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || '';
  const [activeTab, setActiveTab] = useState(DEFAULT_TABS[0].id);
  const [topicsFromApi, setTopicsFromApi] = useState(null);
  const [loading, setLoading] = useState(true);

  usePageContentReady(!loading);

  useEffect(() => {
    setLoading(true);
    getHelp({ store_code: user?.storeCode })
      .then((data) => setTopicsFromApi(data?.topics ?? []))
      .catch(() => setTopicsFromApi([]))
      .finally(() => setLoading(false));
  }, [user?.storeCode]);

  const tabs = useMemo(() => {
    if (Array.isArray(topicsFromApi) && topicsFromApi.length > 0) {
      return topicsFromApi.map((t) => ({ id: t.id, label: t.label }));
    }
    return DEFAULT_TABS;
  }, [topicsFromApi]);

  useEffect(() => {
    setActiveTab(resolveTabId(tabParam, tabs));
  }, [tabParam, tabs]);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    setSearchParams(tabId ? { tab: tabId } : {}, { replace: true });
  };

  const activeTopic = useMemo(() => {
    if (!Array.isArray(topicsFromApi) || topicsFromApi.length === 0) return null;
    return topicsFromApi.find((t) => t.id === activeTab) || null;
  }, [topicsFromApi, activeTab]);

  const useApiContent =
    activeTopic &&
    ((activeTopic.content != null && String(activeTopic.content).trim() !== '') ||
      (activeTopic.video_url != null && String(activeTopic.video_url).trim() !== ''));
  const TabComponent = TAB_COMPONENTS[activeTab];
  const activeLabel = useMemo(
    () => tabs.find((t) => t.id === activeTab)?.label ?? 'Help',
    [tabs, activeTab]
  );
  const activePageTitle = useMemo(
    () => DEFAULT_TABS.find((t) => t.id === activeTab)?.pageTitle ?? activeLabel,
    [activeTab, activeLabel]
  );

  return (
    <div className="df-content-page df-help-page">
      <div className="df-content-card">
        <nav className="df-content-crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>Help</span>
        </nav>
        <span className="df-content-badge">{activeLabel}</span>
        <h1 className="df-content-title">Help Center</h1>
        <p className="df-content-lead">
          Guides for Create Account, Recharge, Redeem, Promotions, VIP, Spin Wheel, and Refer &amp; Earn.
        </p>

        <div className="df-help-tabs" role="tablist" aria-label="Help topics">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                onClick={() => selectTab(tab.id)}
                className={`df-help-tab${isActive ? ' is-active' : ''}`}
                aria-selected={isActive}
                aria-controls={`help-panel-${tab.id}`}
                id={`help-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id={`help-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`help-tab-${activeTab}`}
          className="df-help-panel"
        >
          {loading ? (
            <div className="df-help-panel-card" role="status" aria-label="Loading">
              <p className="df-content-lead" style={{ marginBottom: 0 }}>
                Loading guide…
              </p>
            </div>
          ) : useApiContent ? (
            <div className="df-help-panel-card">
              <HelpContentFromApi topic={activeTopic} pageTitle={activePageTitle} />
            </div>
          ) : TabComponent ? (
            <TabComponent title={activePageTitle} />
          ) : (
            <p className="df-content-lead">No content for this topic yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
