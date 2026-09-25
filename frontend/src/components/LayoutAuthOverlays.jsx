import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboardPromoModals } from '../hooks/useDashboardPromoModals';
import { useDailyBonusPromoModal } from '../hooks/useDailyBonusPromoModal';
import { useDashboardPromoModalsConfig } from '../hooks/useDashboardPromoModalsConfig';
import { useGamePlayEligibility } from '../hooks/useDepositRequiredGate';
import * as affiliateApi from '../api/affiliate';
import * as depositBonusesApi from '../api/depositBonuses';
import * as promotionsApi from '../api/promotions';

// Tutorial hidden — keep the walkthrough component, do not mount it.
// const OnboardingTutorial = lazy(() =>
//   import('./Onboarding/OnboardingTutorial').then((m) => ({ default: m.OnboardingTutorial }))
// );
const FirstDepositBonusModal = lazy(() =>
  import('./Home/FirstDepositBonusModal').then((m) => ({ default: m.FirstDepositBonusModal }))
);
const InviteFriendsEarnModal = lazy(() =>
  import('./Home/InviteFriendsEarnModal').then((m) => ({ default: m.InviteFriendsEarnModal }))
);
const SpinWheelReadyModal = lazy(() =>
  import('./Home/SpinWheelReadyModal').then((m) => ({ default: m.SpinWheelReadyModal }))
);
const CustomPromoModal = lazy(() =>
  import('./Home/CustomPromoModal').then((m) => ({ default: m.CustomPromoModal }))
);
const DailyBonusModalHost = lazy(() =>
  import('./DailyBonus/DailyBonusModalHost').then((m) => ({ default: m.DailyBonusModalHost }))
);
const BackgroundMusic = lazy(() =>
  import('./BackgroundMusic').then((m) => ({ default: m.BackgroundMusic }))
);

/**
 * Authenticated-only overlays. Lazy-loaded from Layout so guest landing does
 * not download onboarding, promo modals, or their API clients on first paint.
 */
export function LayoutAuthOverlays({ isAuthPage }) {
  const { pathname } = useLocation();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { config: promoConfig, loading: promoConfigLoading } = useDashboardPromoModalsConfig({
    enabled: isAuthenticated,
  });
  const [firstDepositPromotion, setFirstDepositPromotion] = useState(null);
  const [depositBonusEligibility, setDepositBonusEligibility] = useState(null);
  const [affiliateData, setAffiliateData] = useState(null);

  const dailyBonusPromo = useDailyBonusPromoModal({
    isAuthenticated,
    authLoading,
    user,
  });

  const {
    spinModalOpen,
    firstDepositModalOpen,
    inviteModalOpen,
    customModalOpen,
    customModalStep,
    closeSpinModal,
    closeSpinModalForSpin,
    closeFirstDepositModal,
    closeFirstDepositForDeposit,
    closeInviteModal,
    closeCustomModal,
    closeAllPromoModals,
  } = useDashboardPromoModals({
    isAuthenticated,
    authLoading,
    user,
    depositBonusEligibility,
    promoConfig,
    promoConfigLoading,
    dailyBonusPromo,
  });

  // Sequence hook coordinates daily bonus with other promos — do not force-close here.

  const [bgmModalOpen, setBgmModalOpen] = useState(false);
  const closeDailyBonus = dailyBonusPromo.close;

  useEffect(() => {
    const onOpen = () => {
      setBgmModalOpen(true);
      closeAllPromoModals();
      closeDailyBonus();
    };
    const onClose = () => setBgmModalOpen(false);
    window.addEventListener('bgm:modal-open', onOpen);
    window.addEventListener('bgm:modal-close', onClose);
    return () => {
      window.removeEventListener('bgm:modal-open', onOpen);
      window.removeEventListener('bgm:modal-close', onClose);
    };
  }, [closeAllPromoModals, closeDailyBonus]);

  const otherPromosAllowed = !dailyBonusPromo.open && !bgmModalOpen;
  const { activationBonusType } = useGamePlayEligibility({
    enabled: isAuthenticated && !authLoading,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setAffiliateData(null);
      return undefined;
    }
    let cancelled = false;
    affiliateApi
      .getAffiliateStats()
      .then((res) => {
        if (cancelled) return;
        setAffiliateData(res);
      })
      .catch(() => {
        if (!cancelled) setAffiliateData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFirstDepositPromotion(null);
      setDepositBonusEligibility(null);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      depositBonusesApi.getDepositBonusEligibility().catch(() => null),
      promotionsApi.getPromotions().catch(() => ({ promotions: [] })),
    ])
      .then(([eligibility, res]) => {
        if (cancelled) return;
        setDepositBonusEligibility(eligibility);
        const list = Array.isArray(res?.promotions) ? res.promotions : [];
        const promo =
          list.find((p) => p.bonus_trigger_type === 'first_deposit') ||
          list.find((p) => String(p.slug || '').includes('first-deposit')) ||
          null;
        setFirstDepositPromotion(promo);
      })
      .catch(() => {
        if (!cancelled) {
          setDepositBonusEligibility(null);
          setFirstDepositPromotion(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const refreshEligibility = () => {
      depositBonusesApi
        .getDepositBonusEligibility({ force: true })
        .then((data) => setDepositBonusEligibility(data))
        .catch(() => setDepositBonusEligibility(null));
    };
    window.addEventListener('wallet:refresh', refreshEligibility);
    return () => window.removeEventListener('wallet:refresh', refreshEligibility);
  }, [isAuthenticated]);

  return (
    <>
      {/* Tutorial hidden
      <Suspense fallback={null}>
        <OnboardingTutorial />
      </Suspense>
      */}
      {!isAuthPage && (
        <Suspense fallback={null}>
          <DailyBonusModalHost
            open={dailyBonusPromo.open && !bgmModalOpen}
            onClose={dailyBonusPromo.close}
            status={dailyBonusPromo.status}
            loading={dailyBonusPromo.loading}
            claimingDay={dailyBonusPromo.claimingDay}
            setClaimingDay={dailyBonusPromo.setClaimingDay}
            refreshSilent={dailyBonusPromo.refreshSilent}
          />
        </Suspense>
      )}
      {!isAuthPage && pathname === '/' && (
        <Suspense fallback={null}>
          <SpinWheelReadyModal
            open={otherPromosAllowed && spinModalOpen}
            onClose={closeSpinModal}
            onSpinNow={closeSpinModalForSpin}
          />
          <FirstDepositBonusModal
            open={otherPromosAllowed && firstDepositModalOpen}
            onClose={closeFirstDepositModal}
            onClaimBonus={closeFirstDepositForDeposit}
            promotion={firstDepositPromotion}
            eligibility={depositBonusEligibility}
            activationBonusType={activationBonusType}
          />
          <InviteFriendsEarnModal
            open={otherPromosAllowed && inviteModalOpen}
            onClose={closeInviteModal}
            affiliateData={affiliateData}
          />
          <CustomPromoModal
            open={otherPromosAllowed && customModalOpen}
            onClose={closeCustomModal}
            step={customModalStep}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <BackgroundMusic hideControls={dailyBonusPromo.open} />
      </Suspense>
    </>
  );
}
