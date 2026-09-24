import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as Dialog from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as walletApi from '../../api/wallet';
import * as depositBonusesApi from '../../api/depositBonuses';
import { fetchDepositPageData } from '../../api/depositPage';
import * as depositPackagesApi from '../../api/depositPackages';
import * as dailyBonusApi from '../../api/dailyBonus';
import {
  normalizePackageCatalog,
  catalogContainsPackage,
  catalogHasVisiblePackages
} from '../../utils/depositPackageAvailability';
import { useDepositBonusCountdown, depositTierLabel, formatBonusHighlight } from '../../hooks/useDepositBonusEligibility';
import { DfStoreDepositView } from '../../components/deposit/DfStoreDepositView';
import { usePageContentReady } from '../../context/PageReadyContext';
import { preloadStoreChestImages } from '../../utils/storeChest';
import { SecurePaymentModal } from '../../components/deposit/SecurePaymentModal';
import { PaymentSuccessScreen } from '../../components/deposit/PaymentSuccessScreen';
import { ChimeDepositModal } from '../../components/deposit/ChimeDepositModal';
import { ApplyCampaignCodePanel } from '../../components/deposit/ApplyCampaignCodePanel';
import { ChimeLogoMark, ChimeLogoMarkLight } from '../../components/payment/ChimeLogo';
import { notifyDepositEligibilityChanged } from '../../utils/depositRequired';
import { PaymentCardIcon, ApplePayIcon, GooglePayIcon, CashAppIcon, PayPalIcon, ZelleIcon, CryptoPayIcon } from '../../assets/icons';
import { formatSc, roundTo2 } from '../../utils/currency';
import { isPurchaseProfileComplete, needsPhoneVerification } from '../../utils/purchaseProfile';
import { PhoneVerifyGateModal } from '../../components/Auth/PhoneVerifyGateModal';
import { normalizeDepositHistoryStatus } from '../../utils/depositHistoryStatus';
import {
  dollarpayNeedsOrionFallback,
  isDollarpayConstrainedPaymentType,
  paymentTypeUsesDollarpay,
  toDollarpayPayinAmount
} from '../../utils/dollarpayAmounts';
import {
  expandDepositRails,
  findDepositRail,
  flattenCatalogPackages,
  packagePayableOnRail,
  customAmountsForRail,
  customAmountsForAllRails,
  isChimeManualRail,
  isCryptoDirectRail,
  isCryptoQrProvider,
  cryptoNetworkLabel,
  packSavePercent,
  railSupportsAmount
} from '../../utils/depositRails';
import { CryptoCurrencyPicker } from '../../components/deposit/CryptoCurrencyPicker';
import { scrollToTop, isOnboardingScrollActive } from '../../utils/scrollToTop';
import { showIntercomLauncher } from '../../components/intercomApi';
import '../../components/deposit/deposit-amount-field.css';

const PAYMENT_SUCCESS_VARIANTS = new Set(['credited', 'submitted']);

function normalizePaymentSuccessPayload(payload) {
  const variant = PAYMENT_SUCCESS_VARIANTS.has(payload?.variant) ? payload.variant : 'credited';
  const amountRaw = payload?.amount;
  const amount =
    amountRaw != null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null;
  const currency = String(payload?.currency || 'USD').trim() || 'USD';
  return { amount, currency, variant };
}

const DEPOSIT_METHOD_LABELS = {
  card: 'Credit/Debit Card',
  credit_card: 'Credit/Debit Card',
  debit_card: 'Credit/Debit Card',
  cashapp: 'Cash App',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  crypto: 'Crypto',
  scrypto: 'Crypto',
  selfcrypto: 'Direct Crypto',
  payment: 'Credit/Debit Card',
  orionstarspay: 'Credit/Debit Card',
  chime: 'Chime'
};

function depositMethodLabel(row) {
  return row.methodDisplayLabel || DEPOSIT_METHOD_LABELS[(row.method || '').toLowerCase()] || row.method || '—';
}

/** Chime manual request rows from API (camelCase or snake_case). */
function chimeRequestDepositType(r) {
  return String(r?.depositType ?? r?.deposit_type ?? '').trim().toLowerCase();
}

function chimeRequestCreatedAt(r) {
  return r?.createdAt ?? r?.created_at ?? null;
}

/** Payment type key -> icon component (for "pay by Card / Crypto" first-step UX). Crypto uses emoji. */
const PAYMENT_TYPE_ICONS = {
  card: PaymentCardIcon,
  credit_card: PaymentCardIcon,
  debit_card: PaymentCardIcon,
  cashapp: CashAppIcon,
  chime: ChimeLogoMark,
  apple_pay: ApplePayIcon,
  google_pay: GooglePayIcon,
  paypal: PayPalIcon,
  zelle: ZelleIcon,
  crypto: CryptoPayIcon // rendered as ⚡ below
};

function filterVisibleDepositPaymentTypes(types = []) {
  return Array.isArray(types) ? types : [];
}

/** Prefer first provider for a payment type (backend already ranks XXPay / DollarPay ahead of Orion). */
function pickProviderCodeForPaymentType(paymentTypes, paymentTypeKey) {
  const key = String(paymentTypeKey || '').trim().toLowerCase();
  if (!key) return null;
  const pt = (paymentTypes || []).find((p) => p.key === key);
  const code = pt?.providers?.[0]?.providerCode
    ? String(pt.providers[0].providerCode).toLowerCase()
    : null;
  // Legacy Chime = manual receive modal (Orion/Manual). XXPay Chime uses cashier URL like Cash App.
  if (key === 'chime' && code !== 'xxpay') return null;
  return code;
}

/** Orionstars (CentryOS) payment options. `chime` is manual (modal + admin approval), not CentryOS API. */
const ORIONSTARS_PAYMENT_OPTIONS = [
  { label: 'Cards', value: 'card', Icon: PaymentCardIcon },
  { label: 'Apple Pay', value: 'apple_pay', Icon: ApplePayIcon },
  { label: 'Google Pay', value: 'google_pay', Icon: GooglePayIcon },
  { label: 'Cash App', value: 'cashapp', Icon: CashAppIcon },
  { label: 'Chime', value: 'chime', Icon: ChimeLogoMarkLight }
];

function formatPayableAmount(amount, currency) {
  const code = currency === 'SC' ? 'USD' : currency;
  return code === 'USD' ? `$${formatSc(amount)}` : `${code} ${formatSc(amount)}`;
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString(undefined, { dateStyle: 'short' }) + ' ' + date.toLocaleTimeString(undefined, { timeStyle: 'short' });
}

function mergePendingWithDepositRefresh(pendingRows = [], depositRefresh = []) {
  const refreshByDepositId = new Map(
    (Array.isArray(depositRefresh) ? depositRefresh : [])
      .filter((r) => r && r.depositId != null)
      .map((r) => [String(r.depositId), r])
  );
  return (Array.isArray(pendingRows) ? pendingRows : []).map((row) => {
    const rawId = typeof row?.id === 'string' && row.id.startsWith('pending-') ? row.id.slice('pending-'.length) : row?.id;
    const match = refreshByDepositId.get(String(rawId));
    if (!match) return row;
    const nextStatusRaw = match.status != null ? String(match.status).trim() : '';
    const nextStatus = nextStatusRaw ? nextStatusRaw.toLowerCase() : (row?.status || 'pending');
    return {
      ...row,
      status: nextStatus,
      feeCharged: match.feeCharged != null ? Number(match.feeCharged) : (row?.feeCharged ?? null)
    };
  });
}

export function Deposit() {
  const { user, refreshBalance, refreshUser } = useAuth();
  const { toast } = useToast();
  const [phoneGateOpen, setPhoneGateOpen] = useState(false);
  const phoneGateClearedRef = useRef(false);
  const [phoneGateCleared, setPhoneGateCleared] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [balance, setBalance] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [limits, setLimits] = useState(null);
  const [depositMethods, setDepositMethods] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [selectedPaymentType, setSelectedPaymentType] = useState(null);
  const [selectedRailKey, setSelectedRailKey] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [selectedTargetCurrency, setSelectedTargetCurrency] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [selectedOrionstarsPaymentOption, setSelectedOrionstarsPaymentOption] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [closingSyncing, setClosingSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  // Modal state: sessionPayload = depositSession (create-session response); depositId = depositSession?.depositId. Null when modal closed.
  const [depositSession, setDepositSession] = useState(null);

  const [chimeDepositRequests, setChimeDepositRequests] = useState([]);
  const [chimeModalOpen, setChimeModalOpen] = useState(false);
  /** OTP reconnect modal — OTP is sent automatically; user only enters the code. */
  const [relinkModalOpen, setRelinkModalOpen] = useState(false);
  const [relinkOtpEmail, setRelinkOtpEmail] = useState('');
  const [relinkOtp, setRelinkOtp] = useState('');
  const [relinkOtpSending, setRelinkOtpSending] = useState(false);
  const [relinkOtpVerifying, setRelinkOtpVerifying] = useState(false);
  const [relinkOtpSent, setRelinkOtpSent] = useState(false);
  /** Step 1: whether local OrionStars credentials are already linked. */
  const [orionAccountAvailable, setOrionAccountAvailable] = useState(null); // null | true | false
  const [chimeSubmitting, setChimeSubmitting] = useState(false);
  const [chimeDestinationUsername, setChimeDestinationUsername] = useState(null);
  const [chimeDestinationQrUrl, setChimeDestinationQrUrl] = useState(null);
  const [chimeDestinationAppLink, setChimeDestinationAppLink] = useState(null);
  const [chimeDestinationLoading, setChimeDestinationLoading] = useState(false);
  const [chimeDestinationError, setChimeDestinationError] = useState(null);
  /** During onboarding Chime flow: block closing modal until submit succeeds or user skips tutorial. */
  const [allowChimeModalClose, setAllowChimeModalClose] = useState(true);
  const [elevateChimeForOnboarding, setElevateChimeForOnboarding] = useState(false);
  const hasRefreshedForPaymentAccount = useRef(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const submitLockRef = useRef(false);
  /** Prevents re-firing onboarding payment-selected for the same payment selection. */
  const paymentAccountPrepKeyRef = useRef('');
  /** After OTP reconnect, auto-open deposit iframe. */
  const pendingDepositAfterRelinkRef = useRef(false);
  /** Allows deposit to proceed before React user state has refreshed hasPaymentAccount. */
  const paymentAccountReadyRef = useRef(false);
  /** Avoid infinite retry when deposit still fails after auto-create. */
  const depositEnsureRetryRef = useRef(false);
  const paymentSuccessHandledRef = useRef(false);
  const [onboardingDepositSubmit, setOnboardingDepositSubmit] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState('');
  const [depositBonusEligibility, setDepositBonusEligibility] = useState(null);
  const depositBonusCountdown = useDepositBonusCountdown(depositBonusEligibility?.expires_at);
  const [packageCatalog, setPackageCatalog] = useState({ enabled: false, groups: [] });
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [dailyBonusVouchers, setDailyBonusVouchers] = useState([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState(null);
  const [campaignCodeModalOpen, setCampaignCodeModalOpen] = useState(false);
  const [campaignOfferApplied, setCampaignOfferApplied] = useState(null);
  /** When true, user chose a preset amount (not a package). */
  const [customAmountMode, setCustomAmountMode] = useState(false);
  const [amountAdjustNote, setAmountAdjustNote] = useState('');
  const [customAmountTouched, setCustomAmountTouched] = useState(false);
  const [packageSelectionTouched, setPackageSelectionTouched] = useState(false);
  const packageEmptyRetryRef = useRef(false);

  useEffect(() => {
    preloadStoreChestImages();
  }, []);

  usePageContentReady(!(loading && balance == null));

  // Hide the Intercom launcher on the deposit page; restore it when leaving.
  useEffect(() => {
    document.body.classList.add('hide-intercom-launcher');
    return () => {
      document.body.classList.remove('hide-intercom-launcher');
      showIntercomLauncher();
    };
  }, []);

  // Open apply-code modal when arriving from claim page (?offerCode=1).
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get('offerCode') === '1') {
        setCampaignCodeModalOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadDepositBonusEligibility = useCallback((force = false) => {
    depositBonusesApi
      .getDepositBonusEligibility(force ? { force: true } : undefined)
      .then((data) => setDepositBonusEligibility(data))
      .catch(() => setDepositBonusEligibility(null));
  }, []);

  useEffect(() => {
    loadDepositBonusEligibility();
  }, [loadDepositBonusEligibility]);

  useEffect(() => {
    const onRefresh = () => loadDepositBonusEligibility(true);
    window.addEventListener('wallet:refresh', onRefresh);
    return () => window.removeEventListener('wallet:refresh', onRefresh);
  }, [loadDepositBonusEligibility]);

  useEffect(() => {
    const syncOnboardingStep = () => {
      try {
        const pending = localStorage.getItem('onboarding_pending') === 'true';
        const step = pending ? localStorage.getItem('onboarding_step') || '' : '';
        setOnboardingStep(step);
        setOnboardingDepositSubmit(pending && step === 'focus_deposit_submit');
      } catch {
        setOnboardingStep('');
        setOnboardingDepositSubmit(false);
      }
    };
    syncOnboardingStep();
    window.addEventListener('onboarding:updated', syncOnboardingStep);
    window.addEventListener('onboarding:ended', syncOnboardingStep);
    window.addEventListener('onboarding:start', syncOnboardingStep);
    return () => {
      window.removeEventListener('onboarding:updated', syncOnboardingStep);
      window.removeEventListener('onboarding:ended', syncOnboardingStep);
      window.removeEventListener('onboarding:start', syncOnboardingStep);
    };
  }, []);

  const onboardingPaymentMethodsFocus =
    onboardingStep === 'focus_payment_methods';

  useEffect(() => {
    if (!onboardingPaymentMethodsFocus) return undefined;
    const notify = () => {
      try {
        window.dispatchEvent(new CustomEvent('onboarding:deposit-payment-focused'));
      } catch (_) {}
    };
    notify();
    const t1 = window.setTimeout(notify, 50);
    const t2 = window.setTimeout(notify, 300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onboardingPaymentMethodsFocus]);

  const hasPaymentAccount = user?.hasPaymentAccount === true;
  // Phone gate: only when store requires phone OTP and user is not verified.
  // Session ref/state prevent post-verify click-through from reopening the modal.
  const profileComplete =
    phoneGateClearedRef.current ||
    phoneGateCleared ||
    user?.isPhoneVerified === true ||
    isPurchaseProfileComplete(user);

  const clearPhoneGate = useCallback(() => {
    phoneGateClearedRef.current = true;
    setPhoneGateCleared(true);
    setPhoneGateOpen(false);
    try {
      if (user?.userId != null) {
        sessionStorage.setItem(`phone_gate_cleared_${user.userId}`, '1');
      }
    } catch (_) {}
  }, [user?.userId]);

  useEffect(() => {
    try {
      if (user?.userId != null && sessionStorage.getItem(`phone_gate_cleared_${user.userId}`) === '1') {
        phoneGateClearedRef.current = true;
        setPhoneGateCleared(true);
      }
    } catch (_) {}
    if (user?.isPhoneVerified === true) {
      phoneGateClearedRef.current = true;
      setPhoneGateCleared(true);
      setPhoneGateOpen(false);
    }
  }, [user?.userId, user?.isPhoneVerified]);

  const requirePurchaseProfile = useCallback(() => {
    if (
      phoneGateClearedRef.current ||
      phoneGateCleared ||
      user?.isPhoneVerified === true ||
      isPurchaseProfileComplete(user)
    ) {
      return true;
    }
    setPhoneGateOpen(true);
    return false;
  }, [phoneGateCleared, user]);

  useEffect(() => {
    if (profileComplete) setPhoneGateOpen(false);
  }, [profileComplete]);
  const usePaymentTypeFlow = paymentTypes.length > 0;
  const depositRails = useMemo(() => expandDepositRails(paymentTypes), [paymentTypes]);
  const selectedRail = findDepositRail(depositRails, selectedRailKey);
  const usePackageFlow = packageCatalog?.enabled === true;
  const usingPackageAmount = usePackageFlow && !customAmountMode && Boolean(selectedPackage?.id);
  const amountLocked = usingPackageAmount || selectedAmount != null;
  const freeAmountValue = selectedAmount != null ? selectedAmount : (parseFloat(customAmount) || 0);
  const amount = usingPackageAmount
    ? Number(selectedPackage.final_price)
    : freeAmountValue;
  const applicableVouchers = useMemo(() => {
    if (!usingPackageAmount || !selectedPackage?.id) return [];
    return (dailyBonusVouchers || []).filter((v) => {
      if (v.package_scope === 'all') return true;
      const ids = Array.isArray(v.package_ids) ? v.package_ids.map(Number) : [];
      return ids.includes(Number(selectedPackage.id));
    });
  }, [dailyBonusVouchers, usingPackageAmount, selectedPackage]);
  const selectedVoucher = useMemo(
    () => applicableVouchers.find((v) => Number(v.id) === Number(selectedVoucherId)) || null,
    [applicableVouchers, selectedVoucherId]
  );
  const discountedPackagePay = useMemo(() => {
    if (!usingPackageAmount || !selectedVoucher) return null;
    const base = Number(selectedPackage.final_price);
    const percent = Number(selectedVoucher.percent_off);
    if (!(base > 0) || !(percent > 0)) return null;
    // Match backend applyDailyBonusVoucher: round discount first, then subtract.
    const discountAmount = Math.round(((base * percent) / 100) * 100) / 100;
    const discounted = Math.round((base - discountAmount) * 100) / 100;
    return discounted > 0 ? Math.max(0.01, discounted) : 0.01;
  }, [usingPackageAmount, selectedPackage, selectedVoucher]);

  const amountAfterVoucher = discountedPackagePay != null ? discountedPackagePay : amount;

  const campaignPayDiscount = useMemo(() => {
    if (!campaignOfferApplied?.applied) return null;
    const base = Number(amountAfterVoucher);
    const value = Number(campaignOfferApplied.discountValue) || 0;
    if (!(base > 0) || !(value > 0)) return null;
    let discountAmount = 0;
    if (campaignOfferApplied.discountValueType === 'percentage') {
      discountAmount = Math.round(((base * value) / 100) * 100) / 100;
    } else if (campaignOfferApplied.discountValueType === 'fixed') {
      discountAmount = Math.round(Math.min(value, base - 0.01) * 100) / 100;
    }
    if (!(discountAmount > 0)) return null;
    const discounted = Math.round((base - discountAmount) * 100) / 100;
    const payAmount = discounted > 0 ? Math.max(0.01, discounted) : 0.01;
    return {
      payAmount,
      discountAmount: Math.round((base - payAmount) * 100) / 100,
      listAmount: usingPackageAmount ? Number(selectedPackage.final_price) : Number(amount)
    };
  }, [campaignOfferApplied, amountAfterVoucher, usingPackageAmount, selectedPackage, amount]);

  const payableAmount = campaignPayDiscount?.payAmount != null ? campaignPayDiscount.payAmount : amountAfterVoucher;
  /** Original list amount before campaign pay discount (for SC credit on custom amounts). */
  const listAmountForDeposit = usingPackageAmount
    ? Number(selectedPackage?.final_price)
    : Number(amount);
  const visiblePaymentTypes = paymentTypes;
  const selectedProviderCode = selectedRail
    ? (String(selectedRail.providerCode || '').toLowerCase() === 'manual'
      ? null
      : (String(selectedRail.providerCode || '').toLowerCase() || null))
    : (usePaymentTypeFlow && selectedPaymentType
      ? pickProviderCodeForPaymentType(paymentTypes, selectedPaymentType)
      : (selectedMethod?.providerCode || '').toString().toLowerCase() || null);
  const effectiveMethod =
    usePaymentTypeFlow && selectedPaymentType === 'crypto'
      ? depositMethods.find((m) => (m.providerCode || '').toLowerCase() === (
        selectedRail?.providerCode
          ? String(selectedRail.providerCode).toLowerCase()
          : 'selfcrypto'
      ))
      : usePaymentTypeFlow && selectedProviderCode
        ? depositMethods.find((m) => (m.providerCode || '').toLowerCase() === selectedProviderCode) || selectedMethod
        : selectedMethod;
  const isOrionstarspay = (effectiveMethod?.providerCode || selectedProviderCode || '').toLowerCase() === 'orionstarspay'
    || (!usePaymentTypeFlow && (selectedMethod?.providerCode || '').toLowerCase() === 'orionstarspay');
  const isDollarpay = (effectiveMethod?.providerCode || selectedProviderCode || '').toLowerCase() === 'dollarpay';
  const isXxpay = (effectiveMethod?.providerCode || selectedProviderCode || '').toLowerCase() === 'xxpay';
  const useChimeManualFlow =
    isChimeManualRail(selectedRail)
    || (usePaymentTypeFlow && selectedPaymentType === 'chime' && !isXxpay && selectedProviderCode !== 'xxpay')
    || (!usePaymentTypeFlow && isOrionstarspay && selectedOrionstarsPaymentOption === 'chime');
  const depositMin = useChimeManualFlow
    ? (limits?.depositMin ?? 10)
    : effectiveMethod?.minAmount != null ? Number(effectiveMethod.minAmount) : (limits?.depositMin ?? 10);
  const platformDepositMax = limits?.depositMax != null ? Number(limits.depositMax) : 5000;
  const depositMax = useChimeManualFlow
    ? platformDepositMax
    : effectiveMethod?.maxAmount != null ? Number(effectiveMethod.maxAmount) : platformDepositMax;
  const currency = limits?.currency || 'SC';
  /** Custom (non-package) deposits use admin wallet-limits min/max. */
  const customDepositMin = depositMin;
  const railAmountBounds = { min: customDepositMin, max: depositMax };
  /** Package checkout: provider amount lists matter more than custom-deposit min. */
  const packageRailBounds = useMemo(
    () => ({ min: 0, max: platformDepositMax }),
    [platformDepositMax]
  );
  const allCatalogPacks = useMemo(
    () => flattenCatalogPackages(packageCatalog?.groups),
    [packageCatalog]
  );
  /** Store chests stay visible regardless of selected rail; methods filter per package in the modal. */
  const storePackageGroups = useMemo(
    () =>
      (Array.isArray(packageCatalog?.groups) ? packageCatalog.groups : [])
        .map((group) => ({
          ...group,
          packages: (group.packages || []).map((pkg) => ({
            ...pkg,
            group_key: group.group_key,
            group_title: group.title
          }))
        }))
        .filter((group) => (group.packages || []).length > 0),
    [packageCatalog]
  );
  const storeOpenPacks = useMemo(
    () => flattenCatalogPackages(storePackageGroups),
    [storePackageGroups]
  );
  const visiblePackageGroups = useMemo(
    () => (Array.isArray(packageCatalog?.groups) ? packageCatalog.groups : [])
      .map((group) => ({
        ...group,
        packages: (group.packages || [])
          .filter((pkg) => (
            selectedRail
              ? packagePayableOnRail(pkg, selectedRail, railAmountBounds)
              : true
          ))
          .map((pkg) => ({
            ...pkg,
            group_key: group.group_key,
            group_title: group.title
          }))
      }))
      .filter((group) => (group.packages || []).length > 0),
    [packageCatalog, selectedRail, customDepositMin, depositMax]
  );
  const openPacks = useMemo(
    () => flattenCatalogPackages(visiblePackageGroups),
    [visiblePackageGroups]
  );
  const railCustomAmounts = useMemo(
    () => (selectedRail
      ? customAmountsForRail(selectedRail, railAmountBounds)
      : customAmountsForAllRails(depositRails, railAmountBounds)),
    [selectedRail, depositRails, customDepositMin, depositMax]
  );

  const freeAmountValid =
    Number.isFinite(freeAmountValue) && freeAmountValue >= customDepositMin && freeAmountValue <= depositMax;
  const customAmountRaw =
    selectedAmount != null
      ? Number(selectedAmount)
      : (customAmount !== '' ? parseFloat(customAmount) : NaN);
  const customAmountInRange =
    Number.isFinite(customAmountRaw) &&
    customAmountRaw >= customDepositMin &&
    customAmountRaw <= depositMax;
  const freeAmountReady = freeAmountValid;
  const packageStepComplete = usingPackageAmount || (customAmountMode && freeAmountReady);

  const amountValid = usingPackageAmount
    ? Number.isFinite(payableAmount) && payableAmount > 0
    : freeAmountReady;
  /** SC the user receives: package final_sc, or 1:1 with pay amount for preset. */
  const creditSc = usingPackageAmount
    ? Number(selectedPackage.final_sc)
    : amount;
  const packSavePct = selectedPackage ? packSavePercent(selectedPackage) : 0;
  const packWasPrice = selectedPackage ? Number(selectedPackage.actual_price) : 0;
  const packSavedAmt = packWasPrice > payableAmount ? packWasPrice - payableAmount : 0;
  const depositSaveLabel = packSavedAmt > 0
    ? `$${formatSc(packSavedAmt)}${packSavePct > 0 ? ` (${packSavePct}%)` : ''}`
    : '—';
  const customAmountNumber = parseFloat(customAmount);
  const customAmountError = selectedAmount == null && customAmount !== ''
    ? (!Number.isFinite(customAmountNumber)
      ? 'Please enter a valid amount.'
      : customAmountNumber < customDepositMin
        ? `Minimum allowed amount is ${currency} ${customDepositMin}.`
        : customAmountNumber > depositMax
          ? `Maximum allowed amount is ${currency} ${depositMax}.`
          : '')
    : '';
  const isScrypto = isCryptoQrProvider(effectiveMethod?.providerCode);
  const scryptoPaymentMethods = isScrypto && selectedTargetCurrency && effectiveMethod?.paymentMethodsByTargetCurrency
    ? (effectiveMethod.paymentMethodsByTargetCurrency[selectedTargetCurrency] || [])
    : [];
  const cryptoRequirementsMet = !effectiveMethod?.isCrypto || (
    isScrypto
      ? selectedTargetCurrency && selectedPaymentMethod && scryptoPaymentMethods.includes(selectedPaymentMethod)
      : (
          (!effectiveMethod.supportedAssets?.length || (selectedAsset != null && selectedAsset !== '')) &&
          (!effectiveMethod.supportedNetworks?.length || (selectedNetwork != null && selectedNetwork !== ''))
        )
  );
  const orionstarsPaymentMet = !isOrionstarspay || !!selectedOrionstarsPaymentOption;
  const paymentTypeNeedsAccount =
    !isDollarpay &&
    !isXxpay &&
    (selectedPaymentType === 'card' ||
      selectedPaymentType === 'credit_card' ||
      selectedPaymentType === 'debit_card' ||
      selectedPaymentType === 'cashapp' ||
      selectedPaymentType === 'apple_pay' ||
      selectedPaymentType === 'google_pay');
  const dollarpayFallbackNeedsAccount =
    Boolean(selectedPaymentType) &&
    isDollarpayConstrainedPaymentType(selectedPaymentType) &&
    paymentTypeUsesDollarpay(paymentTypes, selectedPaymentType) &&
    amountValid &&
    dollarpayNeedsOrionFallback(payableAmount, selectedPaymentType, {
      isPackage: usingPackageAmount
    });

  const canSubmitPaymentTypeFlow =
        selectedPaymentType &&
    amountValid &&
    (!usePackageFlow || packageStepComplete) &&
    !submitting &&
    (selectedPaymentType !== 'crypto' || cryptoRequirementsMet);

  const legacyOrionNeedsPaymentAccount = isOrionstarspay && selectedOrionstarsPaymentOption !== 'chime';
  const selectedPaymentNeedsAccount =
    (usePaymentTypeFlow && ((paymentTypeNeedsAccount && isOrionstarspay) || dollarpayFallbackNeedsAccount)) ||
    (!usePaymentTypeFlow && legacyOrionNeedsPaymentAccount);
  const canSubmitLegacyFlow =
        selectedMethod &&
    cryptoRequirementsMet &&
    orionstarsPaymentMet &&
    amountValid &&
    (!usePackageFlow || packageStepComplete) &&
    !submitting;

  const hasPendingChimeDeposit = useMemo(
    () =>
      chimeDepositRequests.some(
        (r) =>
          chimeRequestDepositType(r) === 'chime' &&
          (r.status === 'pending' || r.status === 'processing')
      ),
    [chimeDepositRequests]
  );

  const canSubmit =
    (usePaymentTypeFlow ? canSubmitPaymentTypeFlow : canSubmitLegacyFlow) && !chimeSubmitting;

  const [termsPolicyModalOpen, setTermsPolicyModalOpen] = useState(false);
  const [termsPolicyPage, setTermsPolicyPage] = useState('terms'); // 'terms' | 'policy'
  /** Avoid auto-firing onboarding when API auto-selects on load */
  const [paymentSelectionTouched, setPaymentSelectionTouched] = useState(false);

  const paymentStepComplete = useMemo(() => {
    if (usePaymentTypeFlow) {
      if (!selectedPaymentType) return false;
      if (selectedPaymentType === 'crypto' && !cryptoRequirementsMet) return false;
      return true;
    }
    if (!selectedMethod) return false;
    if (!orionstarsPaymentMet) return false;
    if (!cryptoRequirementsMet) return false;
    return true;
  }, [
    usePaymentTypeFlow,
    selectedPaymentType,
    selectedMethod,
    orionstarsPaymentMet,
    cryptoRequirementsMet
  ]);

  const selectedPaymentLabel = useMemo(() => {
    if (selectedRail?.label) {
      let label = selectedRail.label;
      if (selectedPaymentType === 'crypto') {
        if (selectedTargetCurrency) label += ` · ${selectedTargetCurrency}`;
        if (selectedPaymentMethod) {
          const pmLabel = cryptoNetworkLabel(selectedPaymentMethod) || selectedPaymentMethod;
          label += ` (${pmLabel})`;
        }
      }
      return label;
    }
    if (usePaymentTypeFlow && selectedPaymentType) {
      const pt = paymentTypes.find((p) => p.key === selectedPaymentType);
      let label = pt?.label || selectedPaymentType;
      if (selectedPaymentType === 'crypto') {
        if (selectedTargetCurrency) label += ` · ${selectedTargetCurrency}`;
        if (selectedPaymentMethod) {
          const pmLabel = cryptoNetworkLabel(selectedPaymentMethod) || selectedPaymentMethod;
          label += ` (${pmLabel})`;
        }
      }
      return label;
    }
    if (!selectedMethod) return '';
    if (isOrionstarspay && selectedOrionstarsPaymentOption) {
      const opt = ORIONSTARS_PAYMENT_OPTIONS.find((o) => o.value === selectedOrionstarsPaymentOption);
      return opt?.label || selectedOrionstarsPaymentOption;
    }
    if (selectedMethod.isCrypto) {
      const parts = [selectedMethod.providerName || 'Crypto'];
      if (selectedAsset) parts.push(selectedAsset);
      if (selectedNetwork) parts.push(selectedNetwork);
      return parts.join(' · ');
    }
    return selectedMethod.providerName || selectedMethod.providerCode || '';
  }, [
    usePaymentTypeFlow,
    selectedPaymentType,
    selectedRail,
    paymentTypes,
    selectedTargetCurrency,
    selectedPaymentMethod,
    selectedMethod,
    isOrionstarspay,
    selectedOrionstarsPaymentOption,
    selectedAsset,
    selectedNetwork
  ]);

  const depositPayingWithLabel = selectedPaymentLabel || selectedRail?.label || '—';

  // Deposit page scroll — skip while onboarding owns focus scrolls.
  const hadDepositSessionRef = useRef(false);

  useEffect(() => {
    if (!paymentSuccess || isOnboardingScrollActive()) return;
    scrollToTop();
  }, [paymentSuccess]);

  // Payment modal unlock restores the pre-modal scroll Y; snap back to top only after a real close.
  useEffect(() => {
    if (depositSession) {
      hadDepositSessionRef.current = true;
      return undefined;
    }
    if (!hadDepositSessionRef.current) return undefined;
    hadDepositSessionRef.current = false;
    if (isOnboardingScrollActive()) return undefined;
    scrollToTop({ defer: true });
    return undefined;
  }, [depositSession]);

  // Notify onboarding when amount/package is locked (single-screen; no step advance).
  useEffect(() => {
    if (!packageSelectionTouched || !packageStepComplete) return;
    try {
      window.dispatchEvent(new CustomEvent('onboarding:package-selected'));
    } catch (_) {}
  }, [packageSelectionTouched, packageStepComplete]);

  // Check whether OrionStars payment credentials are already linked locally.
  useEffect(() => {
    let cancelled = false;
    if (hasPaymentAccount) {
      setOrionAccountAvailable(true);
      paymentAccountReadyRef.current = true;
      return undefined;
    }
    paymentAccountReadyRef.current = false;
    setOrionAccountAvailable(false);
    const email = (user?.paymentEmail || user?.email || '').trim();
    if (!email) return undefined;
    (async () => {
      try {
        await walletApi.checkPaymentAccountDirect(email);
      } catch (_) {
        /* non-blocking probe */
      }
      if (!cancelled) setOrionAccountAvailable(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hasPaymentAccount,
    user?.paymentEmail,
    user?.email
  ]);

  useEffect(() => {
    if (hasPaymentAccount) {
      setOrionAccountAvailable(true);
      paymentAccountReadyRef.current = true;
    }
  }, [hasPaymentAccount]);

  // Notify onboarding when payment is selected.
  useEffect(() => {
    if (!(paymentSelectionTouched && paymentStepComplete && amountLocked)) return undefined;

    const prepKey = [
      selectedPaymentType || '',
      selectedMethod?.providerCode || '',
      selectedOrionstarsPaymentOption || '',
      selectedAsset || '',
      selectedNetwork || '',
      selectedTargetCurrency || '',
      selectedPaymentMethod || ''
    ].join('|');
    if (paymentAccountPrepKeyRef.current === prepKey) return undefined;
    paymentAccountPrepKeyRef.current = prepKey;
    try {
      window.dispatchEvent(
        new CustomEvent('onboarding:payment-selected', { detail: { usePackageFlow } })
      );
    } catch (_) {}
    return undefined;
  }, [
    usePackageFlow,
    paymentSelectionTouched,
    paymentStepComplete,
    amountLocked,
    selectedPaymentType,
    selectedMethod?.providerCode,
    selectedOrionstarsPaymentOption,
    selectedAsset,
    selectedNetwork,
    selectedTargetCurrency,
    selectedPaymentMethod
  ]);

  const markPaymentTouched = useCallback(() => {
    setPaymentSelectionTouched(true);
  }, []);

  const resetPaymentSubSelections = useCallback(() => {
    setSelectedAsset(null);
    setSelectedNetwork(null);
    setSelectedTargetCurrency(null);
    setSelectedPaymentMethod(null);
    setSelectedOrionstarsPaymentOption(null);
    paymentAccountPrepKeyRef.current = '';
    if (!customAmountMode) {
      setSelectedAmount(null);
      setCustomAmount('');
    }
  }, [customAmountMode]);

  const handleSelectRail = useCallback((rail) => {
    if (!rail?.railKey) return;
    if (!requirePurchaseProfile()) return;
    markPaymentTouched();
    setSelectedRailKey(rail.railKey);
    setSelectedPaymentType(rail.key);
    if (isChimeManualRail(rail)) {
      const om = depositMethods.find((m) => (m.providerCode || '').toLowerCase() === 'orionstarspay');
      setSelectedMethod(om || null);
    } else if (String(rail.providerCode || '').toLowerCase() === 'xxpay') {
      const xm = depositMethods.find((m) => (m.providerCode || '').toLowerCase() === 'xxpay');
      setSelectedMethod(xm || null);
    } else if (isCryptoQrProvider(rail.providerCode)) {
      const cm = depositMethods.find((m) => (m.providerCode || '').toLowerCase() === String(rail.providerCode).toLowerCase());
      setSelectedMethod(cm || null);
    } else {
      setSelectedMethod(null);
    }
    setSelectedAsset(null);
    setSelectedNetwork(null);
    setSelectedTargetCurrency(null);
    setSelectedPaymentMethod(null);
    setSelectedOrionstarsPaymentOption(null);
    paymentAccountPrepKeyRef.current = '';
    const bounds = {
      min: isChimeManualRail(rail) ? (limits?.depositMin ?? 10) : customDepositMin,
      max: depositMax
    };
    const keepPkg = selectedPackage && packagePayableOnRail(selectedPackage, rail, bounds);
    const keepChip = selectedAmount != null && railSupportsAmount(rail, selectedAmount, bounds);
    const typedN = parseFloat(customAmount);
    const keepTyped = customAmountMode && selectedAmount == null && Number.isFinite(typedN) && railSupportsAmount(rail, typedN, bounds);
    setSelectedPackage(keepPkg ? selectedPackage : null);
    if (!keepPkg) setSelectedVoucherId(null);
    if (keepPkg) {
      setCustomAmountMode(false);
      setSelectedAmount(null);
      setCustomAmount('');
    } else if (keepChip) {
      setCustomAmountMode(true);
      setSelectedAmount(selectedAmount);
      setCustomAmount('');
    } else if (keepTyped) {
      setCustomAmountMode(true);
      setSelectedAmount(null);
    } else {
      setCustomAmountMode(false);
      setSelectedAmount(null);
      setCustomAmount('');
    }
    setAmountAdjustNote('');
    try {
      window.dispatchEvent(
        new CustomEvent('onboarding:payment-selected', { detail: { usePackageFlow: true } })
      );
    } catch (_) {}
  }, [
    requirePurchaseProfile,
    markPaymentTouched,
    depositMethods,
    limits?.depositMin,
    customDepositMin,
    depositMax,
    selectedPackage,
    selectedAmount,
    customAmount,
    customAmountMode
  ]);

  useEffect(() => {
    if (!selectedRailKey) return;
    if (depositRails.some((r) => r.railKey === selectedRailKey)) return;
    setSelectedRailKey(null);
    setSelectedPaymentType(null);
    setSelectedMethod(null);
    resetPaymentSubSelections();
  }, [depositRails, selectedRailKey, resetPaymentSubSelections]);

  const handleSelectPackage = useCallback((pkg) => {
    if (!requirePurchaseProfile()) return;
    if (!pkg?.id) return;
    const max = pkg.max_purchases_per_user ?? pkg.maxPurchasesPerUser;
    if (max != null) {
      const remaining = pkg.purchases_remaining;
      if (remaining != null && Number(remaining) <= 0) return;
    }
    const groupKey = pkg.group_key ?? pkg.groupKey;
    if (groupKey === 'welcome') {
      const welcomeGroup = (packageCatalog?.groups || []).find(
        (g) => String(g.group_key || g.groupKey) === 'welcome'
      );
      if (welcomeGroup) {
        const groupRemaining = welcomeGroup.purchases_remaining;
        if (groupRemaining != null && Number(groupRemaining) <= 0) return;
      }
    }
    setSelectedPackage(pkg);
    setSelectedVoucherId(null);
    setCustomAmountMode(false);
    setPackageSelectionTouched(true);
    setSelectedAmount(null);
    setCustomAmount('');
    setAmountAdjustNote('');
    try {
      window.dispatchEvent(new CustomEvent('onboarding:package-selected'));
    } catch (_) {}
  }, [requirePurchaseProfile, packageCatalog]);


  const refreshDepositsAndBalance = useCallback(async () => {
    setClosingSyncing(true);
    try {
      const refreshRes = await walletApi.refreshDepositTransactionsStatus();
      if (refreshRes?.deposits) {
        setDeposits(refreshRes.deposits.deposits || []);
        setPendingDeposits(
          mergePendingWithDepositRefresh(refreshRes.deposits.pendingDeposits || [], refreshRes?.depositRefresh || [])
        );
      }
      const balRes = await walletApi.getBalance();
      setBalance(balRes);
      await refreshBalance?.();
      window.dispatchEvent(new Event('wallet:refresh'));
      notifyDepositEligibilityChanged();
    } catch {
      try {
        const [balRes, depRes] = await Promise.all([
          walletApi.getBalance(),
          walletApi.getDeposits({ limit: 60 })
        ]);
        setBalance(balRes);
        setDeposits(depRes.deposits || []);
        setPendingDeposits(depRes.pendingDeposits || []);
        await refreshBalance?.();
        window.dispatchEvent(new Event('wallet:refresh'));
        notifyDepositEligibilityChanged();
      } catch (_) {}
    } finally {
      setClosingSyncing(false);
    }
  }, [refreshBalance]);

  const resetDepositFlow = useCallback(() => {
    setPaymentSelectionTouched(false);
    setPackageSelectionTouched(false);
    setSelectedPackage(null);
    setSelectedVoucherId(null);
    setCustomAmountMode(false);
    setSelectedAmount(null);
    setCustomAmount('');
  }, []);

  const refreshPackageCatalog = useCallback(async () => {
    setPackagesLoading(true);
    try {
      const next = await depositPackagesApi.fetchNormalizedDepositPackagesCatalog();
      setPackageCatalog(next);
      setSelectedPackage((prev) => (
        prev?.id && catalogContainsPackage(next, prev.id) ? prev : null
      ));
      return next;
    } catch (_) {
      return null;
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  const handlePaymentSuccess = useCallback((payload) => {
    if (paymentSuccessHandledRef.current) return;
    paymentSuccessHandledRef.current = true;

    const normalized = normalizePaymentSuccessPayload(payload);

    setDepositSession(null);
    setTermsPolicyModalOpen(false);
    resetDepositFlow();
    setPaymentSuccess(normalized);
    if (localStorage.getItem('onboarding_pending') === 'true') {
      window.dispatchEvent(new CustomEvent('onboarding:payment-modal-closed'));
    }
    void refreshDepositsAndBalance();
    void refreshPackageCatalog();
  }, [resetDepositFlow, refreshDepositsAndBalance, refreshPackageCatalog]);

  const dismissPaymentSuccess = useCallback(() => {
    paymentSuccessHandledRef.current = false;
    setPaymentSuccess(null);
  }, []);

  const handlePaymentModalClose = useCallback((options) => {
    if (options?.success) return;
    setDepositSession(null);
    setTermsPolicyModalOpen(false);
    resetDepositFlow();
    if (localStorage.getItem('onboarding_pending') === 'true') {
      window.dispatchEvent(new CustomEvent('onboarding:payment-modal-closed'));
    }
    void refreshDepositsAndBalance();
  }, [resetDepositFlow, refreshDepositsAndBalance]);

  // Ensure we have full user (hasPaymentAccount) so payment section shows correctly on first load.
  // Also refresh user on mount if they haven't connected their payment account yet, to catch any updates from Settings.
  useEffect(() => {
    if (!user || !refreshUser || hasRefreshedForPaymentAccount.current) return;
    if (user.hasPaymentAccount === undefined || user.hasPaymentAccount === false) {
      hasRefreshedForPaymentAccount.current = true;
      refreshUser();
    }
  }, [user?.userId, user?.hasPaymentAccount, refreshUser]);

  // Daily-bonus package vouchers (any store with an available voucher)
  useEffect(() => {
    if (!user?.userId) {
      setDailyBonusVouchers([]);
      return undefined;
    }
    let cancelled = false;
    dailyBonusApi
      .listDailyBonusVouchers()
      .then((res) => {
        if (!cancelled) setDailyBonusVouchers(Array.isArray(res?.vouchers) ? res.vouchers : []);
      })
      .catch(() => {
        if (!cancelled) setDailyBonusVouchers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  useEffect(() => {
    if (!selectedVoucherId) return;
    const stillValid = applicableVouchers.some((v) => Number(v.id) === Number(selectedVoucherId));
    if (!stillValid) setSelectedVoucherId(null);
  }, [applicableVouchers, selectedVoucherId]);

  // Auto-select single asset/network when only one option (crypto, non-QR)
  useEffect(() => {
    if (!selectedMethod?.isCrypto || isCryptoQrProvider(selectedMethod?.providerCode)) return;
    const assets = selectedMethod.supportedAssets || [];
    const networks = selectedMethod.supportedNetworks || [];
    if (assets.length === 1 && selectedAsset !== assets[0]) setSelectedAsset(assets[0]);
    if (networks.length === 1 && selectedNetwork !== networks[0]) setSelectedNetwork(networks[0]);
  }, [selectedMethod?.providerCode, selectedMethod?.supportedAssets, selectedMethod?.supportedNetworks]);

  // When using payment-type flow and user selects Crypto, set selectedMethod from the rail
  useEffect(() => {
    if (!usePaymentTypeFlow || selectedPaymentType !== 'crypto') return;
    const wanted = String(selectedRail?.providerCode || 'selfcrypto').toLowerCase();
    const cryptoMethod = depositMethods.find((m) => (m.providerCode || '').toLowerCase() === wanted);
    if (cryptoMethod && selectedMethod?.providerCode !== wanted) setSelectedMethod(cryptoMethod);
  }, [usePaymentTypeFlow, selectedPaymentType, selectedRail?.providerCode, depositMethods, selectedMethod?.providerCode]);

  // Auto-select single target currency / payment method when only one option (SCrypto)
  useEffect(() => {
    if (!isScrypto || !effectiveMethod?.targetCurrencies?.length) return;
    const targets = effectiveMethod.targetCurrencies || [];
    if (targets.length === 1 && selectedTargetCurrency !== targets[0]) setSelectedTargetCurrency(targets[0]);
  }, [isScrypto, effectiveMethod?.targetCurrencies]);
  useEffect(() => {
    if (!isScrypto || !selectedTargetCurrency || !scryptoPaymentMethods.length) return;
    if (scryptoPaymentMethods.length === 1 && selectedPaymentMethod !== scryptoPaymentMethods[0]) {
      setSelectedPaymentMethod(scryptoPaymentMethods[0]);
    }
  }, [isScrypto, selectedTargetCurrency, scryptoPaymentMethods.join(',')]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDepositPageData()
      .then((data) => {
        if (cancelled || !data) return;
        setLimits(data.limitsRes);
        setBalance(data.balRes);
        setDeposits(data.depRes.deposits || []);
        setPendingDeposits(
          mergePendingWithDepositRefresh(data.depRes.pendingDeposits || [], data.refreshRes?.depositRefresh || [])
        );
        setDepositMethods(data.methodsRes?.methods || []);
        setPaymentTypes(filterVisibleDepositPaymentTypes(data.methodsRes?.paymentTypes || []));
        setChimeDepositRequests(Array.isArray(data.chimeReqRes?.data) ? data.chimeReqRes.data : []);
        // packagesRes is already normalized in fetchDepositPageData
        setPackageCatalog(
          data.packagesRes?.enabled != null || Array.isArray(data.packagesRes?.groups)
            ? {
                enabled: data.packagesRes.enabled === true,
                groups: Array.isArray(data.packagesRes.groups) ? data.packagesRes.groups : []
              }
            : normalizePackageCatalog(data.packagesRes)
        );
        const applyRefresh = (refreshRes) => {
          if (cancelled || !refreshRes) return;
          if (refreshRes.deposits) {
            setDeposits(refreshRes.deposits.deposits || []);
            setPendingDeposits(
              mergePendingWithDepositRefresh(
                refreshRes.deposits.pendingDeposits || [],
                refreshRes.depositRefresh || []
              )
            );
          } else if (refreshRes.depositRefresh) {
            setPendingDeposits((prev) => mergePendingWithDepositRefresh(prev, refreshRes.depositRefresh));
          }
        };
        if (data.refreshRes) applyRefresh(data.refreshRes);
        else if (data.refreshPromise) data.refreshPromise.then(applyRefresh);
      })
      .catch((err) => {
        if (!cancelled) toastRef.current.error(err.message || 'Failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Clear selection if it is no longer in the loaded methods list (no default selection)
  useEffect(() => {
    if (paymentTypes.length > 0) {
      setSelectedPaymentType((prev) => {
        if (!prev) return null;
        return paymentTypes.some((pt) => pt.key === prev) ? prev : null;
      });
    } else if (depositMethods.length > 0) {
      setSelectedMethod((prev) => {
        if (!prev) return null;
        const prevCode = prev?.providerCode ?? prev?.code;
        return depositMethods.some((m) => (m.providerCode ?? m.code) === prevCode) ? prev : null;
      });
    }
  }, [paymentTypes, depositMethods]);

  // When there are pending deposits, poll sync every 45s so status updates automatically
  useEffect(() => {
    if (pendingDeposits.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const res = await walletApi.syncDeposits();
        if (res?.deposits) {
          setDeposits(res.deposits.deposits || []);
          setPendingDeposits(res.deposits.pendingDeposits || []);
          await refreshBalance?.();
        }
      } catch (_) {}
    }, 45000);
    return () => clearInterval(interval);
  }, [pendingDeposits.length, refreshBalance]);

  // If packages are enabled but first response had no visible cards, retry once (transient races).
  useEffect(() => {
    if (loading || packagesLoading || packageEmptyRetryRef.current) return;
    if (packageCatalog?.enabled === true && !catalogHasVisiblePackages(packageCatalog)) {
      packageEmptyRetryRef.current = true;
      void refreshPackageCatalog();
    }
  }, [loading, packagesLoading, packageCatalog, refreshPackageCatalog]);

  // If the selected package is no longer available (limit used), clear it.
  useEffect(() => {
    if (!selectedPackage?.id) return;
    if (!catalogContainsPackage(packageCatalog, selectedPackage.id)) {
      setSelectedPackage(null);
      if (!customAmountMode) setPackageSelectionTouched(false);
    }
  }, [packageCatalog, selectedPackage?.id, customAmountMode]);

  // Notify tutorial that we entered the deposit page (deferred so Layout's OnboardingTutorial listeners exist;
  // sync-on-pathname in OnboardingTutorial is the reliable fix for production).
  useEffect(() => {
    if (localStorage.getItem('onboarding_pending') !== 'true') return;
    if (loading) return;
    const notify = () =>
      window.dispatchEvent(
        new CustomEvent('onboarding:deposit-page-entered', { detail: { usePackageFlow } })
      );
    notify();
    const t = window.setTimeout(notify, 0);
    return () => window.clearTimeout(t);
  }, [loading, usePackageFlow]);
  useEffect(() => {
    if (!hasPendingChimeDeposit) return;
    const interval = setInterval(() => {
      walletApi.getChimeDepositRequests({ limit: 100 })
        .then((res) => {
          const next = Array.isArray(res?.data) ? res.data : [];
          setChimeDepositRequests((prev) => {
            const prevCompleted = new Set(
              (Array.isArray(prev) ? prev : [])
                .filter((r) => String(r?.status || '').toLowerCase() === 'completed')
                .map((r) => String(r.id))
            );
            const newlyCompleted = next.some(
              (r) =>
                String(r?.status || '').toLowerCase() === 'completed' &&
                !prevCompleted.has(String(r.id))
            );
            if (newlyCompleted) {
              try {
                window.dispatchEvent(new Event('wallet:refresh'));
                notifyDepositEligibilityChanged();
              } catch {
                /* ignore */
              }
            }
            return next;
          });
          // Limits can free up when a pending Chime is rejected/expired.
          void refreshPackageCatalog();
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [hasPendingChimeDeposit, refreshPackageCatalog]);

  useEffect(() => {
    if (!chimeModalOpen) {
      setElevateChimeForOnboarding(false);
      return;
    }
    try {
      const pending = localStorage.getItem('onboarding_pending') === 'true';
      setElevateChimeForOnboarding(pending);
      if (pending) {
        setAllowChimeModalClose(false);
        window.dispatchEvent(new CustomEvent('onboarding:chime-modal-opened'));
      } else {
        setAllowChimeModalClose(true);
      }
    } catch (_) {
      setElevateChimeForOnboarding(false);
      setAllowChimeModalClose(true);
    }
  }, [chimeModalOpen]);

  useEffect(() => {
    const onOnboardingEnded = () => {
      setAllowChimeModalClose(true);
      setElevateChimeForOnboarding(false);
    };
    window.addEventListener('onboarding:ended', onOnboardingEnded);
    return () => window.removeEventListener('onboarding:ended', onOnboardingEnded);
  }, []);

  useEffect(() => {
    if (!chimeModalOpen) return;
    let cancelled = false;
    setChimeDestinationLoading(true);
    setChimeDestinationError(null);
    setChimeDestinationUsername(null);
    setChimeDestinationQrUrl(null);
    setChimeDestinationAppLink(null);
    walletApi
      .getChimeReceivePreview()
      .then((res) => {
        if (cancelled) return;
        const name = res?.data?.destinationUsername;
        if (!name) throw new Error('No pay-to account returned.');
        setChimeDestinationUsername(name);
        setChimeDestinationQrUrl(res?.data?.qrUrl || null);
        setChimeDestinationAppLink(res?.data?.appLink || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setChimeDestinationError(err.message || 'Could not load pay-to account.');
        setChimeDestinationUsername(null);
        setChimeDestinationQrUrl(null);
        setChimeDestinationAppLink(null);
      })
      .finally(() => {
        if (!cancelled) setChimeDestinationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chimeModalOpen]);

  async function handleChimeModalSubmit({ sourceUsername, destinationUsername }) {
    if (hasPendingChimeDeposit) {
      toast.error(
        'You already have a Chime deposit waiting for approval. Wait until it is approved before submitting another request.'
      );
      return;
    }
    const trimmedSource = (sourceUsername || '').trim();
    if (!trimmedSource) {
      toast.error('Enter your Chime name.');
      return;
    }
    if (!destinationUsername || !String(destinationUsername).trim()) {
      toast.error('Pay-to account is missing. Close and open the deposit again.');
      return;
    }
    setChimeSubmitting(true);
    try {
      const baseCurrency = currency === 'SC' ? 'USD' : currency;
      await walletApi.createChimeDeposit({
        depositType: 'chime',
        amount: roundTo2(payableAmount),
        sourceUsername: trimmedSource,
        destinationUsername,
        currency: baseCurrency || 'USD',
        ...(usingPackageAmount && selectedPackage?.id ? { package_id: selectedPackage.id } : {}),
        ...(usingPackageAmount && selectedPackage?.id && selectedVoucher?.id
          ? { voucher_id: selectedVoucher.id }
          : {}),
        ...(campaignOfferApplied?.applied
          ? { list_amount: roundTo2(listAmountForDeposit) }
          : {})
      });
      setAllowChimeModalClose(true);
      setElevateChimeForOnboarding(false);
      setChimeModalOpen(false);
      toast.success(
        'Chime deposit request submitted. Your SC will be credited once our team confirms your payment.'
      );
      const [depRes, chimeReqRes] = await Promise.all([
        walletApi.getDeposits({ limit: 60 }),
        walletApi.getChimeDepositRequests({ limit: 100 })
      ]);
      setDeposits(depRes.deposits || []);
      setPendingDeposits(depRes.pendingDeposits || []);
      setChimeDepositRequests(Array.isArray(chimeReqRes?.data) ? chimeReqRes.data : []);
      // Voucher is consumed when the manual request is submitted (not on approval).
      setSelectedVoucherId(null);
      try {
        const voucherRes = await dailyBonusApi.listDailyBonusVouchers();
        setDailyBonusVouchers(Array.isArray(voucherRes?.vouchers) ? voucherRes.vouchers : []);
      } catch (_) {
        setDailyBonusVouchers([]);
      }
      // Package limit may now be consumed (pending Chime holds a slot) — hide it immediately.
      resetDepositFlow();
      await refreshPackageCatalog();
      try {
        window.dispatchEvent(new CustomEvent('notifications:refresh'));
      } catch (_) {}
    } catch (err) {
      toast.error(err.message || 'Request failed.');
    } finally {
      setChimeSubmitting(false);
    }
  }

  async function openPaymentRelinkForDeposit() {
    const email = (user?.paymentEmail || user?.email || '').trim().toLowerCase();
    if (!email) {
      toast.error('Please complete your profile email first.');
      return;
    }
    pendingDepositAfterRelinkRef.current = true;
    setRelinkOtpEmail(email);
    setRelinkOtp('');
    setRelinkOtpSent(false);
    setRelinkModalOpen(true);
    setRelinkOtpSending(true);
    try {
      const res = await walletApi.requestPaymentAccountPasswordResetOtp(email);
      if (res?.success === false) {
        throw new Error(res.message || 'Could not send verification code.');
      }
      setRelinkOtpSent(true);
      toast.success(`We've sent a verification code to ${email}. Enter it below to continue.`);
    } catch (err) {
      const msg = String(err.message || '');
      if (msg.toLowerCase().includes('no account found for this email and store code')) {
        try {
          const createRes = await walletApi.createPaymentAccount();
          if (createRes?.remoteAccountAlreadyExists) {
            toast.error('Could not send verification code. Please try again.');
            setRelinkModalOpen(false);
            pendingDepositAfterRelinkRef.current = false;
            return;
          }
          paymentAccountReadyRef.current = true;
          setOrionAccountAvailable(true);
          await refreshUser?.();
          setRelinkModalOpen(false);
          pendingDepositAfterRelinkRef.current = false;
          submitLockRef.current = false;
          setSubmitting(false);
          window.setTimeout(() => handleDeposit(), 100);
          return;
        } catch (createErr) {
          toast.error(createErr.message || 'Could not create payment account.');
          setRelinkModalOpen(false);
          pendingDepositAfterRelinkRef.current = false;
          return;
        }
      }
      toast.error(err.message || 'Could not send verification code.');
      setRelinkModalOpen(false);
      pendingDepositAfterRelinkRef.current = false;
    } finally {
      setRelinkOtpSending(false);
    }
  }

  async function handleRelinkOtpSubmit(e) {
    e?.preventDefault?.();
    const emailTrim = (relinkOtpEmail || '').trim().toLowerCase();
    const otpTrim = (relinkOtp || '').trim();
    if (!emailTrim || otpTrim.length !== 6) {
      toast.error('Please enter the 6-digit verification code.');
      return;
    }
    setRelinkOtpVerifying(true);
    try {
      await walletApi.verifyPaymentAccountPasswordResetOtp(emailTrim, otpTrim);
      await walletApi.confirmPaymentAccountPasswordReset(emailTrim);
      paymentAccountReadyRef.current = true;
      setOrionAccountAvailable(true);
      await refreshUser?.();
      setRelinkModalOpen(false);
      setRelinkOtp('');
      setRelinkOtpSent(false);
      const shouldDeposit = pendingDepositAfterRelinkRef.current;
      pendingDepositAfterRelinkRef.current = false;
      toast.success('Payment account connected. Opening payment…');
      if (shouldDeposit) {
        window.setTimeout(() => handleDeposit(), 100);
      }
    } catch (err) {
      toast.error(err.message || 'Could not verify the code. Please try again.');
    } finally {
      setRelinkOtpVerifying(false);
    }
  }

  /**
   * Ensure OrionStars credentials before opening the pay iframe.
   * Always user-check first on Continue:
   * - exists === false → create/register (never OTP)
   * - exists === true + no local link → forgot-password OTP
   * - exists === true + local link → proceed to deposit
   */
  async function ensureOrionPaymentAccount() {
    const email = (user?.paymentEmail || user?.email || '').trim().toLowerCase();
    if (!email) {
      toast.error('Please complete your profile email first.');
      return { ok: false };
    }

    const check = await walletApi.checkPaymentAccountDirect(email);
    const remoteExists = check?.exists === true;

    if (!remoteExists) {
      // No CentryOS account → create/register. Never call forgot-password OTP.
      const createRes = await walletApi.createPaymentAccount();
      if (createRes?.remoteAccountAlreadyExists) {
        await openPaymentRelinkForDeposit();
        return { ok: false, awaitingOtp: true };
      }
      paymentAccountReadyRef.current = true;
      setOrionAccountAvailable(true);
      await refreshUser?.();
      return { ok: true };
    }

    // Remote account exists.
    if (hasPaymentAccount || paymentAccountReadyRef.current) {
      return { ok: true };
    }

    await openPaymentRelinkForDeposit();
    return { ok: false, awaitingOtp: true };
  }

  async function handleDeposit() {
    if (submitLockRef.current) return;
    if (!requirePurchaseProfile()) return;

    if (useChimeManualFlow) {
      if (hasPendingChimeDeposit) {
        toast.error(
          'You already have a Chime deposit waiting for approval. Wait until it is approved before submitting another request.'
        );
        return;
      }
      if (!amountValid || submitting) {
        if (!amountValid) toast.error(`Amount must be between ${currency} ${customDepositMin} and ${currency} ${depositMax}.`);
        return;
      }
      setPaymentSuccess(null);
      paymentSuccessHandledRef.current = false;
      setChimeModalOpen(true);
      return;
    }
    if (usePaymentTypeFlow) {
      if (!selectedPaymentType) return;
      if (selectedPaymentType === 'crypto') {
        if (isScrypto) {
          if (!selectedTargetCurrency || !selectedPaymentMethod) {
            toast.error('Please select target currency and payment method.');
            document.getElementById('deposit-crypto-network')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        } else {
          if (effectiveMethod?.supportedAssets?.length && !selectedAsset) {
            toast.error('Please select an asset.');
            document.getElementById('deposit-crypto-asset')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          if (effectiveMethod?.supportedNetworks?.length && !selectedNetwork) {
            toast.error('Please select a network.');
            document.getElementById('deposit-crypto-asset')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }
      }
    } else {
      if (!selectedMethod) return;
      if (isScrypto) {
        if (!selectedTargetCurrency || !selectedPaymentMethod) {
          toast.error('Please select target currency and payment method.');
          document.getElementById('deposit-crypto-network')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      } else if (isOrionstarspay) {
        if (!selectedOrionstarsPaymentOption) {
          toast.error('Please select how you want to pay (Card, Cash App, Chime, Google Pay, or Apple Pay).');
          return;
        }
      } else if (selectedMethod?.isCrypto) {
        if (selectedMethod.supportedAssets?.length && !selectedAsset) {
          toast.error('Please select an asset.');
          return;
        }
        if (selectedMethod.supportedNetworks?.length && !selectedNetwork) {
          toast.error('Please select a network.');
          return;
        }
      }
    }
    if (!amountValid || submitting) {
      if (!amountValid) {
        toast.error(
          usePackageFlow && selectedPackage && !customAmountMode
            ? 'Selected package has an invalid price.'
            : `Amount must be between ${currency} ${customDepositMin} and ${currency} ${depositMax}.`
        );
      }
      return;
    }

    // Amount is locked to package/preset chips (exact). No custom snap UX.
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      if (selectedPaymentNeedsAccount) {
        const ensured = await ensureOrionPaymentAccount();
        if (!ensured.ok) {
          return;
        }
      }

      const baseCurrency = currency === 'SC' ? 'USD' : currency;
      const packageBody = {
        ...(usingPackageAmount && selectedPackage?.id ? { package_id: selectedPackage.id } : {}),
        ...(usingPackageAmount && selectedPackage?.id && selectedVoucher?.id
          ? { voucher_id: selectedVoucher.id }
          : {}),
        ...(campaignOfferApplied?.applied
          ? { list_amount: roundTo2(listAmountForDeposit) }
          : {})
      };
      const resolvedProvider =
        usePaymentTypeFlow && selectedPaymentType
          ? (selectedPaymentType === 'crypto'
              ? (selectedRail?.providerCode
                  ? String(selectedRail.providerCode).toLowerCase()
                  : (isCryptoQrProvider(effectiveMethod?.providerCode) ? effectiveMethod.providerCode : 'selfcrypto'))
              : isChimeManualRail(selectedRail)
                ? null
                : (selectedRail?.providerCode
                    ? String(selectedRail.providerCode).toLowerCase()
                    : pickProviderCodeForPaymentType(paymentTypes, selectedPaymentType)))
          : null;
      let sessionAmount = roundTo2(payableAmount);
      const providerForSession = (
        resolvedProvider ||
        selectedMethod?.providerCode ||
        ''
      ).toString().toLowerCase();
      if (
        providerForSession === 'dollarpay' &&
        selectedPaymentType &&
        !usingPackageAmount
      ) {
        const snapped = toDollarpayPayinAmount(sessionAmount, selectedPaymentType);
        if (snapped != null) sessionAmount = snapped;
      }
      const body =
        usePaymentTypeFlow && selectedPaymentType
          ? selectedPaymentType === 'crypto'
            ? {
                provider_code: resolvedProvider || 'selfcrypto',
                amount: sessionAmount,
                currency: baseCurrency,
                target_currency: selectedTargetCurrency,
                payment_method: selectedPaymentMethod,
                ...packageBody
              }
            : {
                provider_code: resolvedProvider || undefined,
                payment_type: selectedPaymentType,
                amount: sessionAmount,
                currency: baseCurrency,
                ...packageBody
              }
          : isScrypto
            ? {
                provider_code: selectedMethod?.providerCode || 'selfcrypto',
                amount: sessionAmount,
                currency: baseCurrency,
                target_currency: selectedTargetCurrency,
                payment_method: selectedPaymentMethod,
                ...packageBody
              }
            : {
                provider_code: selectedMethod.providerCode,
                amount: sessionAmount,
                ...packageBody,
                ...(selectedAsset && { asset_code: selectedAsset }),
                ...(selectedNetwork && { network: selectedNetwork }),
                ...(isOrionstarspay && selectedOrionstarsPaymentOption && {
                  accepted_payment_options: [selectedOrionstarsPaymentOption]
                })
              };
      const res = await walletApi.createDepositSession(body);
      depositEnsureRetryRef.current = false;
      setPaymentSuccess(null);
      paymentSuccessHandledRef.current = false;
      setDepositSession({
        ...res,
        creditSc: Number.isFinite(Number(creditSc)) ? Number(creditSc) : null,
        saveLabel: depositSaveLabel,
        packageValue: packWasPrice > 0 ? packWasPrice : (Number.isFinite(Number(creditSc)) ? Number(creditSc) : null),
        discountPct: packSavePct,
        payingWithLabel: depositPayingWithLabel,
        payingWithKey: selectedRail?.key || selectedRail?.railKey || selectedPaymentType || '',
      });
      // Voucher is marked used when the payment session/request is created.
      if (selectedVoucher?.id) {
        setSelectedVoucherId(null);
        try {
          const voucherRes = await dailyBonusApi.listDailyBonusVouchers();
          setDailyBonusVouchers(Array.isArray(voucherRes?.vouchers) ? voucherRes.vouchers : []);
        } catch (_) {
          setDailyBonusVouchers((prev) =>
            (prev || []).filter((v) => Number(v.id) !== Number(selectedVoucher.id))
          );
        }
      }
      if (localStorage.getItem('onboarding_pending') === 'true') {
        window.dispatchEvent(new CustomEvent('onboarding:payment-started'));
      }
      if (!customAmountMode) {
        setSelectedAmount(null);
        setCustomAmount('');
      }
      try {
        window.dispatchEvent(new CustomEvent('notifications:refresh'));
        window.dispatchEvent(new CustomEvent('vip:refresh'));
      } catch (_) {}
      // Refresh history so the new deposit shows as pending immediately.
      try {
        const depRes = await walletApi.getDeposits({ limit: 60 });
        setDeposits(depRes.deposits || []);
        setPendingDeposits(depRes.pendingDeposits || []);
      } catch (_) {}
    } catch (err) {
      if (err.code === 'PAYMENT_ACCOUNT_RELINK_REQUIRED') {
        // User-check already ran on the backend:
        // emailExists true  → OTP reconnect
        // emailExists false → create/register (never forgot-password OTP)
        paymentAccountReadyRef.current = false;
        if (err.body?.emailExists === true) {
          await openPaymentRelinkForDeposit();
        } else {
          try {
            const createRes = await walletApi.createPaymentAccount();
            if (createRes?.remoteAccountAlreadyExists) {
              await openPaymentRelinkForDeposit();
            } else if (depositEnsureRetryRef.current) {
              toast.error('Could not connect your payment account. Please try again.');
            } else {
              depositEnsureRetryRef.current = true;
              paymentAccountReadyRef.current = true;
              setOrionAccountAvailable(true);
              await refreshUser?.();
              submitLockRef.current = false;
              setSubmitting(false);
              return handleDeposit();
            }
          } catch (createErr) {
            toast.error(createErr.message || 'Could not create payment account. Please try again.');
          }
        }
      } else if (err.message?.toLowerCase().includes('payment account') || err.message?.toLowerCase().includes('profile')) {
        toast.error(err.message);
      } else {
        toast.error(err.message || 'Could not start deposit. Please try again or use another method.');
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleSyncDeposits() {
    setSyncing(true);
    try {
      const res = await walletApi.refreshDepositTransactionsStatus();
      if (res?.deposits) {
        setDeposits(res.deposits.deposits || []);
        setPendingDeposits(mergePendingWithDepositRefresh(res.deposits.pendingDeposits || [], res?.depositRefresh || []));
        await refreshBalance?.();
      }
      if (!res?.errors?.length) {
        toast.success('Deposit status updated successfully');
      }
    } catch (err) {
      toast.error(err.message || 'Could not refresh status.');
    } finally {
      setSyncing(false);
    }
  }

  const handleSelectCustomAmount = useCallback((value) => {
    if (!requirePurchaseProfile()) return;
    setSelectedPackage(null);
    setSelectedVoucherId(null);
    setCustomAmountMode(true);
    setSelectedAmount(value);
    setCustomAmount('');
    setAmountAdjustNote('');
    setCustomAmountTouched(true);
    setPackageSelectionTouched(true);
    try {
      window.dispatchEvent(new CustomEvent('onboarding:amount-selected'));
    } catch (_) {}
  }, [requirePurchaseProfile]);

  const handleCustomAmountInput = useCallback((value) => {
    if (!requirePurchaseProfile()) return;
    setSelectedPackage(null);
    setSelectedVoucherId(null);
    setCustomAmountMode(true);
    setSelectedAmount(null);
    setCustomAmount(value);
    setAmountAdjustNote('');
    setCustomAmountTouched(true);
    setPackageSelectionTouched(Boolean(value));
  }, [requirePurchaseProfile]);

  const handleRetryPurchase = useCallback((row) => {
    const methodKey = String(row?.method || '').toLowerCase();
    const amt = Number(row?.amount);
    const bounds = { min: customDepositMin, max: depositMax };
    const rail =
      depositRails.find((r) => r.key === methodKey && Number.isFinite(amt) && railSupportsAmount(r, amt, bounds))
      || depositRails.find((r) => r.key === methodKey)
      || (methodKey === 'chime' ? depositRails.find((r) => r.railKey === 'chime-manual') : null);
    if (rail) handleSelectRail(rail);
    const hit = Number.isFinite(amt)
      ? allCatalogPacks.find((p) => Number(p.final_price) === amt)
      : null;
    if (hit && rail && packagePayableOnRail(hit, rail, bounds)) {
      setTimeout(() => handleSelectPackage(hit), 0);
      return;
    }
    if (Number.isFinite(amt) && amt > 0) {
      setTimeout(() => handleSelectCustomAmount(amt), 0);
    }
  }, [
    customDepositMin,
    depositMax,
    depositRails,
    allCatalogPacks,
    handleSelectRail,
    handleSelectPackage,
    handleSelectCustomAmount
  ]);

  const allDepositsForTable = useMemo(() => {
    const depositList = (deposits || []).map((d) => {
      const date = d.date ?? d.createdAt ?? d.created_at;
      return {
        ...d,
        date,
        status: normalizeDepositHistoryStatus(d.status, date)
      };
    });
    const creditedChimeRequestIds = new Set(
      depositList
        .map((d) => {
          const ptid = d.providerTransactionId ?? d.provider_transaction_id;
          const m = ptid != null ? String(ptid).match(/^cdr-(\d+)-/) : null;
          return m ? m[1] : null;
        })
        .filter(Boolean)
    );

    const chimeRows = (chimeDepositRequests || [])
      .filter((r) => {
        const dt = chimeRequestDepositType(r);
        if (dt !== 'chime' && dt !== 'cashapp') return false;
        const st = String(r.status || '').toLowerCase();
        if (st === 'completed' && creditedChimeRequestIds.has(String(r.id))) return false;
        return true;
      })
      .map((r) => {
        const dt = chimeRequestDepositType(r);
        const methodKey = dt === 'cashapp' ? 'cashapp' : 'chime';
        return {
          id: `chime-req-${r.id}`,
          amount: r.amount,
          feeCharged: null,
          method: methodKey,
          methodDisplayLabel: dt === 'cashapp' ? 'Cash App' : 'Chime',
          status: r.status === 'processing' ? 'pending' : r.status || 'pending',
          provider: null,
          date: chimeRequestCreatedAt(r)
        };
      });
    return [
      ...depositList,
      ...(pendingDeposits || []).map((p) => {
        const date = p.date ?? p.createdAt ?? p.created_at;
        return {
          id: p.id,
          amount: p.amount,
          feeCharged: p.feeCharged ?? null,
          method: p.method,
          methodDisplayLabel: p.methodDisplayLabel,
          status: normalizeDepositHistoryStatus(p.status || 'pending', date),
          provider: p.provider || null,
          cryptoCurrency: p.cryptoCurrency || p.crypto_currency || null,
          paymentMethod: p.paymentMethod || p.payment_method || null,
          date
        };
      }),
      ...chimeRows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [deposits, pendingDeposits, chimeDepositRequests]);

  const totalSc = balance?.usable_balance_sc != null ? Number(balance.usable_balance_sc) : (balance?.balance_sc != null && balance?.frozen_balance_sc != null ? Math.max(0, Number(balance.balance_sc) - Number(balance.frozen_balance_sc)) : balance?.balance_sc != null ? Number(balance.balance_sc) : 0);

  const showDepositBonusBanner =
    depositBonusEligibility?.in_program === true &&
    (depositBonusEligibility?.completed_deposits ?? 0) < 3 &&
    formatBonusHighlight(depositBonusEligibility);
  const nextTierLabel = depositTierLabel(depositBonusEligibility?.next_deposit_number || 1);

  return (
    <div
      className={`dash-page dash-deposit-page lw-ac-page w-full min-w-0${
        onboardingPaymentMethodsFocus ? ' dash-deposit-page--onb-payment' : ''
      }`}
    >
      {showDepositBonusBanner && (
        <section className="dash-alert dash-alert--info dash-animate-in dash-delay-1" role="status">
          <h2 className="dash-alert-title">
            {nextTierLabel} deposit bonus: {formatBonusHighlight(depositBonusEligibility)} extra
          </h2>
          <p className="dash-alert-text">
            New user offer — deposit now to claim your {nextTierLabel.toLowerCase()} deposit bonus.
            {depositBonusCountdown ? ` Offer ends in ${depositBonusCountdown}.` : ''}
          </p>
        </section>
      )}

      <DfStoreDepositView
        rails={depositRails}
        amountBounds={packageRailBounds}
        selectedRail={selectedRail}
        onSelectRail={handleSelectRail}
        openPacks={storeOpenPacks}
        packageGroups={storePackageGroups}
        packagesLoading={packagesLoading || loading}
        selectedPackage={selectedPackage}
        onSelectPackage={handleSelectPackage}
        customAmounts={railCustomAmounts}
        customAmountMode={customAmountMode}
        selectedAmount={selectedAmount}
        customAmount={customAmount}
        customAmountError={customAmountError}
        onSelectCustomAmount={handleSelectCustomAmount}
        onCustomAmountChange={handleCustomAmountInput}
        allowCustomField={isChimeManualRail(selectedRail) || isCryptoDirectRail(selectedRail)}
        applicableVouchers={applicableVouchers}
        selectedVoucherId={selectedVoucherId}
        onSelectVoucher={(id) => setSelectedVoucherId(id)}
        payableAmount={payableAmount}
        creditSc={creditSc}
        selectedPaymentLabel={selectedPaymentLabel}
        canSubmit={canSubmit}
        submitting={submitting || chimeSubmitting}
        useChimeManualFlow={useChimeManualFlow}
        onPay={handleDeposit}
        purchases={allDepositsForTable}
        onRefreshPurchases={handleSyncDeposits}
        syncing={syncing}
        closingSyncing={closingSyncing}
        onRetryPurchase={handleRetryPurchase}
        currency={currency}
        cryptoStepPending={Boolean(isScrypto && !cryptoRequirementsMet)}
        extraFields={(
          <>
            {isScrypto && Number(payableAmount) > 0 && (selectedMethod || effectiveMethod)?.targetCurrencies?.length > 0 && (
              <CryptoCurrencyPicker
                currencies={(selectedMethod || effectiveMethod).targetCurrencies || []}
                selectedCurrency={selectedTargetCurrency}
                onSelectCurrency={(tc, network) => {
                  markPaymentTouched();
                  setSelectedTargetCurrency(tc);
                  setSelectedPaymentMethod(network || null);
                }}
                networks={scryptoPaymentMethods}
                selectedNetwork={selectedPaymentMethod}
                onSelectNetwork={(pm) => {
                  markPaymentTouched();
                  setSelectedPaymentMethod(pm);
                }}
                isDirect={String((selectedMethod || effectiveMethod)?.providerCode || '').toLowerCase() === 'selfcrypto'}
                methodsByCurrency={(selectedMethod || effectiveMethod)?.paymentMethodsByTargetCurrency || {}}
              />
            )}
            {selectedMethod?.isCrypto && !isScrypto && Number(payableAmount) > 0 && (selectedMethod.supportedAssets?.length > 0 || selectedMethod.supportedNetworks?.length > 0) && (
              <section className="pj-ac-sec" id="deposit-crypto-asset">
                <div className="pj-ac-sec-top">
                  <h2>Asset &amp; network</h2>
                  <p className="pj-ac-lede">Select the crypto asset and network for your deposit.</p>
                </div>
                {selectedMethod.supportedAssets?.length > 0 && (
                  <div className="pj-ac-chips">
                    {(selectedMethod.supportedAssets || []).map((asset) => (
                      <button
                        key={asset}
                        type="button"
                        onClick={() => {
                          markPaymentTouched();
                          setSelectedAsset(asset);
                        }}
                        className={`pj-ac-chip${selectedAsset === asset ? ' on' : ''}`}
                        aria-pressed={selectedAsset === asset}
                      >
                        {asset}
                      </button>
                    ))}
                  </div>
                )}
                {selectedMethod.supportedNetworks?.length > 0 && (
                  <div className="pj-ac-chips" style={{ marginTop: 12 }}>
                    {(selectedMethod.supportedNetworks || []).map((net) => (
                      <button
                        key={net}
                        type="button"
                        onClick={() => {
                          markPaymentTouched();
                          setSelectedNetwork(net);
                        }}
                        className={`pj-ac-chip${selectedNetwork === net ? ' on' : ''}`}
                        aria-pressed={selectedNetwork === net}
                      >
                        {net}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
              <ApplyCampaignCodePanel
                openModal={campaignCodeModalOpen}
                onOpenModalChange={setCampaignCodeModalOpen}
                depositAmount={amountAfterVoucher}
                onAppliedChange={setCampaignOfferApplied}
              />
          </>
        )}
      />

      <ChimeDepositModal
        open={chimeModalOpen}
        onClose={() => {
          if (!allowChimeModalClose) return;
          setChimeModalOpen(false);
        }}
        currency={currency}
        depositMin={depositMin}
        amountNum={payableAmount}
        submitting={chimeSubmitting}
        onSubmit={handleChimeModalSubmit}
        destinationUsername={chimeDestinationUsername}
        destinationQrUrl={chimeDestinationQrUrl}
        destinationAppLink={chimeDestinationAppLink}
        destinationLoading={chimeDestinationLoading}
        destinationError={chimeDestinationError}
        closeDisabled={!allowChimeModalClose}
        elevateForOnboarding={elevateChimeForOnboarding}
      />

      {/* Secure payment modal — provider-specific content (iframe for CentryOS, QR + copy for Speed). Status polling and postMessage auto-close on completion. */}
      <SecurePaymentModal
        open={!!depositSession}
        onClose={handlePaymentModalClose}
        onPaymentSuccess={handlePaymentSuccess}
        depositId={depositSession?.depositId}
        sessionPayload={depositSession}
        creditSc={creditSc}
        saveLabel={depositSaveLabel}
        payingWithLabel={depositPayingWithLabel}
        payingWithKey={selectedRail?.key || selectedRail?.railKey || selectedPaymentType || ''}
        onOpenTerms={() => setTermsPolicyModalOpen(true)}
      />

      {paymentSuccess && (
        <PaymentSuccessScreen
          open
          amount={paymentSuccess.amount}
          currency={paymentSuccess.currency}
          variant={paymentSuccess.variant}
          onDismiss={dismissPaymentSuccess}
        />
      )}

      {/* OTP reconnect — OTP sent automatically; user only enters the code, then iframe opens. */}
      <Dialog.Root
        open={relinkModalOpen}
        onOpenChange={(open) => {
          if (relinkOtpVerifying || relinkOtpSending) return;
          setRelinkModalOpen(open);
          if (!open) {
            pendingDepositAfterRelinkRef.current = false;
            setRelinkOtp('');
            setRelinkOtpSent(false);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[10090] dash-chime-modal-backdrop" />
          <Dialog.Content
            className="dash-payment-otp-modal dash-modal fixed left-1/2 top-1/2 z-[10091] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl shadow-xl p-5"
            onEscapeKeyDown={(event) => (relinkOtpVerifying || relinkOtpSending) && event.preventDefault()}
            onPointerDownOutside={(event) => (relinkOtpVerifying || relinkOtpSending) && event.preventDefault()}
          >
            <Dialog.Close
              className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--dash-muted)] hover:text-[var(--dash-gold)] hover:bg-[rgba(239,68,68,0.1)] z-10 transition disabled:opacity-40"
              aria-label="Close"
              disabled={relinkOtpVerifying || relinkOtpSending}
            />
            <div className="dash-payment-otp-icon" aria-hidden>✉</div>
            <Dialog.Title className="dash-payment-otp-title">
              {relinkOtpSending ? 'Sending code…' : 'Enter verification code'}
            </Dialog.Title>
            <Dialog.Description className="dash-payment-otp-desc">
              {relinkOtpSending
                ? `Sending a verification code to ${relinkOtpEmail || 'your email'}…`
                : relinkOtpSent
                  ? (
                    <>
                      We&apos;ve sent a 6-digit code to <strong>{relinkOtpEmail}</strong>. Enter that code here to connect your payment account and continue.
                    </>
                  )
                  : 'Enter the verification code from your email to continue.'}
            </Dialog.Description>
            <form onSubmit={handleRelinkOtpSubmit} className="dash-payment-otp-form">
              <div>
                <label htmlFor="deposit-relink-otp" className="dash-field-label">
                  Verification code
                </label>
                <input
                  id="deposit-relink-otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={relinkOtp}
                  onChange={(e) => setRelinkOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="dash-payment-otp-input"
                  autoComplete="one-time-code"
                  disabled={relinkOtpSending || relinkOtpVerifying || !relinkOtpSent}
                  autoFocus
                />
                <p className="dash-payment-otp-hint">The code expires in 5 minutes.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRelinkModalOpen(false);
                    pendingDepositAfterRelinkRef.current = false;
                    setRelinkOtp('');
                    setRelinkOtpSent(false);
                  }}
                  disabled={relinkOtpVerifying || relinkOtpSending}
                  className="dash-btn-outline text-sm px-4 py-2.5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={relinkOtpVerifying || relinkOtpSending || !relinkOtpSent || relinkOtp.trim().length !== 6}
                  className={`dash-btn-cta dash-payment-otp-submit text-sm px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed${
                    relinkOtp.trim().length === 6 ? ' dash-payment-otp-submit--ready' : ''
                  }`}
                >
                  {relinkOtpVerifying ? 'Verifying…' : 'Submit'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Terms & Policy popup (shown from payment overlay link) */}
      <Dialog.Root open={termsPolicyModalOpen} onOpenChange={(open) => !open && setTermsPolicyModalOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[10090] dash-chime-modal-backdrop" />
          <Dialog.Content
            className="dash-terms-dialog dash-modal fixed left-1/2 top-1/2 z-[10090] w-[calc(100%-1.5rem)] sm:w-full max-w-lg max-h-[85vh] -translate-x-1/2 -translate-y-1/2 rounded-xl shadow-xl flex flex-col overflow-hidden"
            onEscapeKeyDown={() => setTermsPolicyModalOpen(false)}
            onPointerDownOutside={() => setTermsPolicyModalOpen(false)}
          >
            <Dialog.Title className="sr-only">Terms & Policy</Dialog.Title>
            <Dialog.Close
              className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--dash-muted)] hover:text-[var(--dash-gold)] hover:bg-[rgba(239,68,68,0.1)] z-10 transition"
              aria-label="Close"
            />
            <div className="dash-terms-tabs flex shrink-0">
              <button
                type="button"
                onClick={() => setTermsPolicyPage('terms')}
                className={`dash-terms-tab touch-manipulation ${termsPolicyPage === 'terms' ? 'dash-terms-tab--active' : ''}`}
              >
                Terms of use
              </button>
              <button
                type="button"
                onClick={() => setTermsPolicyPage('policy')}
                className={`dash-terms-tab touch-manipulation ${termsPolicyPage === 'policy' ? 'dash-terms-tab--active' : ''}`}
              >
                Privacy policy
              </button>
            </div>
            <div className="dash-terms-body flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 text-sm leading-relaxed">
              {termsPolicyPage === 'terms' && (
                <div className="space-y-4">
                  <h3>Terms of use</h3>
                  <p>Last updated: January 1, 2025.</p>
                  <p>These terms govern your use of the payment and deposit services. By proceeding with a payment, you agree to these terms.</p>
                  <p>You must be at least 18 years of age and have the legal capacity to enter into this agreement. You are responsible for keeping your account credentials secure and for all activity under your account.</p>
                  <p>We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance. For questions, contact support.</p>
                  <p>This is placeholder content for demonstration. Replace with your actual terms of use.</p>
                </div>
              )}
              {termsPolicyPage === 'policy' && (
                <div className="space-y-4">
                  <h3>Privacy policy</h3>
                  <p>Last updated: January 1, 2025.</p>
                  <p>This privacy policy describes how we collect, use, and protect your information when you use our payment services.</p>
                  <p>We collect information you provide (e.g. name, email, payment details) and usage data necessary to process transactions and prevent fraud. We do not sell your personal information to third parties.</p>
                  <p>Data may be stored and processed in accordance with applicable laws. You may request access to or deletion of your data by contacting us. We use industry-standard security measures to protect your information.</p>
                  <p>This is placeholder content for demonstration. Replace with your actual privacy policy.</p>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <PhoneVerifyGateModal
        open={phoneGateOpen && !profileComplete && needsPhoneVerification(user)}
        onClose={() => setPhoneGateOpen(false)}
        onVerified={clearPhoneGate}
      />
    </div>
  );
}

/**
 * Shown when payment provider redirects to /deposit/return (e.g. in iframe after "Done").
 * Tells the parent window to close the overlay and sync so payment appears on the platform.
 */
export function DepositReturn() {
  usePageContentReady(true);

  useEffect(() => {
    const targetOrigin = window.location.origin;
    if (window.parent !== window) {
      const depositId = new URLSearchParams(window.location.search).get('depositId');
      window.parent.postMessage(
        {
          type: 'PAYMENT_COMPLETE',
          ...(depositId ? { depositId } : {}),
        },
        targetOrigin
      );
    }
  }, []);
  return (
    <div className="dash-root min-h-screen flex items-center justify-center p-6">
      <p className="text-[var(--dash-text)] font-semibold">Payment complete. Closing window…</p>
    </div>
  );
}
