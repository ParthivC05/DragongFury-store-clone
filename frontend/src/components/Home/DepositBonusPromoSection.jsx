import { useEffect, useMemo, useState } from 'react';
import * as depositBonusesApi from '../../api/depositBonuses';
import { DepositBonusPromoCarousel } from './DepositBonusPromoCarousel';

export function DepositBonusPromoSection({ isAuthenticated }) {
  const [publicPromo, setPublicPromo] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [depositBonusEligibility, setDepositBonusEligibility] = useState(null);

  useEffect(() => {
    let cancelled = false;
    depositBonusesApi
      .getDepositBonusPromoPublic()
      .then((data) => {
        if (!cancelled) setPublicPromo(data);
      })
      .catch(() => {
        if (!cancelled) setPublicPromo(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setDepositBonusEligibility(null);
      return undefined;
    }
    let cancelled = false;
    depositBonusesApi
      .getDepositBonusEligibility()
      .then((data) => {
        if (!cancelled) setDepositBonusEligibility(data);
      })
      .catch(() => {
        if (!cancelled) setDepositBonusEligibility(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const visible = useMemo(() => {
    if (!loaded) return false;
    if (!publicPromo?.enabled || !Array.isArray(publicPromo.tiers) || publicPromo.tiers.length === 0) {
      return false;
    }
    if (!isAuthenticated) return true;
    const completed = Number(depositBonusEligibility?.completed_deposits) || 0;
    return depositBonusEligibility?.in_program === true && completed < 3;
  }, [loaded, publicPromo, isAuthenticated, depositBonusEligibility]);

  if (!visible) return null;

  return (
    <DepositBonusPromoCarousel
      tiers={publicPromo.tiers}
      expiryHours={publicPromo.expiry_hours}
      isAuthenticated={isAuthenticated}
      eligibility={depositBonusEligibility}
    />
  );
}
