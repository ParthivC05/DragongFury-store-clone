import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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

  const useApiContent = activeTopic && ((activeTopic.content != null && String(activeTopic.content).trim() !== '') || (activeTopic.video_url != null && String(activeTopic.video_url).trim() !== ''));
  const TabComponent = TAB_COMPONENTS[activeTab];
  const activeLabel = useMemo(() => tabs.find((t) => t.id === activeTab)?.label ?? 'Help', [tabs, activeTab]);
  const activePageTitle = useMemo(() => DEFAULT_TABS.find((t) => t.id === activeTab)?.pageTitle ?? activeLabel, [activeTab, activeLabel]);

  return (
    <div className="min-h-full">
      <div className="w-full">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-100 m-0">Help</h2>
            <p className="mt-2 text-sm text-gray-400">
              Guides for Create Account, Recharge, Redeem, Promotions, VIP, Spin Wheel, and Refer & Earn.
            </p>
          </div>
          <span className="hidden sm:inline-flex flex-shrink-0 rounded-full bg-card border border-gray-700 px-3 py-1 text-xs text-gray-300">
            {activeLabel}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-b border-gray-800">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={[
                  'px-4 py-2 text-sm font-semibold rounded-t-xl border-b-2 transition',
                  isActive
                    ? 'text-orange-300 border-orange-400 bg-card'
                    : 'text-gray-300 border-transparent hover:text-gray-100 hover:bg-card/60',
                ].join(' ')}
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
          className="mt-4"
        >
          {loading ? (
            <div className="rounded-2xl bg-card border border-gray-700 p-4 sm:p-6 animate-pulse" role="status" aria-label="Loading">
              <div className="h-5 w-1/3 rounded bg-gray-600/60 mb-4" />
              <div className="space-y-2 mb-4">
                <div className="h-3 w-full rounded bg-gray-600/50" />
                <div className="h-3 w-11/12 rounded bg-gray-600/50" />
                <div className="h-3 w-4/5 rounded bg-gray-600/50" />
              </div>
              <div className="space-y-2 mb-6">
                <div className="h-3 w-full rounded bg-gray-600/40" />
                <div className="h-3 w-5/6 rounded bg-gray-600/40" />
                <div className="h-3 w-full rounded bg-gray-600/40" />
                <div className="h-3 w-3/4 rounded bg-gray-600/40" />
              </div>
              <div className="h-32 rounded-xl bg-gray-600/30" />
            </div>
          ) : useApiContent ? (
            <HelpContentFromApi topic={activeTopic} pageTitle={activePageTitle} />
          ) : TabComponent ? (
            <TabComponent title={activePageTitle} />
          ) : (
            <p className="text-gray-400 text-sm">No content for this topic yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
