import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import * as promotionsApi from '../../api/promotions';
import { PromotionCard } from '../../components/Promotions/PromotionCard';
import { PromotionsHero, PromotionsQuestStrip } from '../../components/Promotions/PromotionsHero';
import { usePageContentReady } from '../../context/PageReadyContext';
import '../../components/Promotions/df-promotions.css';

export function Promotions() {
  const { toast } = useToast();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState(null);

  usePageContentReady(!loading);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await promotionsApi.getPromotions();
        const list = res.promotions ?? [];
        setPromotions(Array.isArray(list) ? list : []);
      } catch (e) {
        toast.error(e.message || 'Unable to load promotions. Please try again later.');
        setPromotions([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  const firstPromoWithEnd = promotions.find((p) => p.end_date);
  const firstPromotion = promotions[0];

  useEffect(() => {
    if (!firstPromoWithEnd?.end_date) {
      setCountdownSeconds(null);
      return;
    }
    const end = new Date(firstPromoWithEnd.end_date).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setCountdownSeconds(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [firstPromoWithEnd?.id, firstPromoWithEnd?.end_date]);

  const bonusCount = useMemo(
    () => promotions.filter((p) => p.bonus_value != null && p.bonus_trigger_type).length,
    [promotions]
  );

  return (
    <div className="dash-page dash-promotions-page df-promo-page w-full min-w-0">
      <header className="dash-deposit-header dash-animate-in">
        <p className="df-promo-kicker">Rewards</p>
        <h1 className="dash-deposit-title">Promotions</h1>
        <p className="dash-deposit-sub">
          Bonuses and special offers. Claim rewards and unlock exclusive deals.
        </p>
      </header>

      <PromotionsHero
        offerCount={promotions.length}
        bonusCount={bonusCount}
        countdownSeconds={countdownSeconds}
        featuredTitle={firstPromotion?.title}
      />

      <PromotionsQuestStrip />

      {promotions.length === 0 ? (
        <section className="dash-promo-empty dash-panel dash-animate-in dash-delay-2" aria-label="No promotions">
          <span className="dash-promo-empty-icon" aria-hidden>
            🎁
          </span>
          <h2 className="dash-panel-title">No offers right now</h2>
          <p className="dash-panel-desc dash-promo-empty-desc">
            Check back soon — new bonuses and power-ups drop regularly.
          </p>
        </section>
      ) : (
        <section className="dash-promo-grid-section dash-animate-in dash-delay-2" aria-label="Available promotions">
          <div className="dash-section-head">
            <h2 className="dash-section-title">Available Offers</h2>
            <p className="dash-section-sub">
              {promotions.length} {promotions.length === 1 ? 'offer' : 'offers'} ready to claim
            </p>
          </div>
          <div className="dash-promo-grid">
            {promotions.map((promo, index) => (
              <PromotionCard key={promo.id} promotion={promo} index={index} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
