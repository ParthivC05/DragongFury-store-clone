import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';

const BASE = `${API_BASE}/api/dashboard-promo-modals`;

export const DEFAULT_PROMO_MODAL_STEPS = [
  { id: 'daily_bonus', type: 'daily_bonus', enabled: true, delaySeconds: 5 },
  { id: 'spin_wheel', type: 'spin_wheel', enabled: true, delaySeconds: 5 },
  { id: 'first_deposit', type: 'first_deposit', enabled: true, delaySeconds: 5 },
  { id: 'invite_friends', type: 'invite_friends', enabled: true, delaySeconds: 5 },
];

export const DEFAULT_DASHBOARD_PROMO_MODALS = {
  enabled: true,
  initialLoginDelaySeconds: 5,
  afterOnboardingDelaySeconds: 5,
  steps: DEFAULT_PROMO_MODAL_STEPS,
};

let configCache = null;
let configInflight = null;

export function invalidateDashboardPromoModalsCache() {
  configCache = null;
  configInflight = null;
}

function uniqueStepId(type) {
  try {
    return `${type}-${crypto.randomUUID()}`;
  } catch {
    return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function normalizeStep(raw) {
  const type = String(raw?.type || '').trim().toLowerCase();
  const delayRaw = raw?.delaySeconds ?? raw?.delay_seconds;
  const delayNum = Number(delayRaw);
  const step = {
    id: raw?.id || uniqueStepId(type),
    type,
    enabled: raw?.enabled !== false,
    delaySeconds: Number.isFinite(delayNum) && delayNum >= 0 ? delayNum : 0,
  };
  if (type === 'custom') {
    step.title = raw?.title || 'Special offer';
    step.imageUrl = raw?.imageUrl ?? raw?.image_url ?? null;
    step.ctaLabel = raw?.ctaLabel ?? raw?.cta_label ?? null;
    step.ctaUrl = raw?.ctaUrl ?? raw?.cta_url ?? null;
  }
  return step;
}

export function normalizeDashboardPromoModals(data) {
  const src = data?.dashboardPromoModals ?? data ?? {};
  const steps = Array.isArray(src.steps) && src.steps.length > 0
    ? src.steps.map(normalizeStep)
    : DEFAULT_PROMO_MODAL_STEPS.map((s) => ({ ...s }));

  const parseDelay = (raw, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return {
    enabled: src.enabled !== false,
    initialLoginDelaySeconds: parseDelay(
      src.initialLoginDelaySeconds ?? src.initial_login_delay_seconds,
      DEFAULT_DASHBOARD_PROMO_MODALS.initialLoginDelaySeconds,
    ),
    afterOnboardingDelaySeconds: parseDelay(
      src.afterOnboardingDelaySeconds ?? src.after_onboarding_delay_seconds,
      DEFAULT_DASHBOARD_PROMO_MODALS.afterOnboardingDelaySeconds,
    ),
    steps,
  };
}

export function getDashboardPromoModalsConfig(options = {}) {
  const force = options.force === true;
  if (force) invalidateDashboardPromoModalsCache();
  if (configCache && !force) return Promise.resolve(configCache);
  if (configInflight && !force) return configInflight;

  configInflight = getRequest(`${BASE}/config`)
    .then((res) => {
      const normalized = normalizeDashboardPromoModals(res);
      configCache = normalized;
      configInflight = null;
      return normalized;
    })
    .catch(() => {
      configInflight = null;
      return { ...DEFAULT_DASHBOARD_PROMO_MODALS, steps: DEFAULT_PROMO_MODAL_STEPS.map((s) => ({ ...s })) };
    });

  return configInflight;
}
