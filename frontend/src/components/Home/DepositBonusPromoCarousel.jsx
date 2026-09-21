import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { depositTierLabel, formatTierBonus } from '../../hooks/useDepositBonusEligibility';
import './deposit-bonus-promo-carousel.css';

const SLIDE_INTERVAL_MS = 5500;
const SWIPE_THRESHOLD_PX = 48;

const TIER_ACCENTS = ['#ffd54f', '#c084fc', '#34d399'];

function tierAccent(index) {
  return TIER_ACCENTS[index] ?? TIER_ACCENTS[0];
}

function tierStatus(tier, eligibility) {
  const n = tier.deposit_number ?? tier.depositNumber;
  if (!eligibility) return 'available';
  const completed = Number(eligibility.completed_deposits) || 0;
  if (completed >= n) return 'claimed';
  if (eligibility.in_program && eligibility.next_deposit_number === n) return 'active';
  return 'upcoming';
}

export function DepositBonusPromoCarousel({
  tiers = [],
  expiryHours = 24,
  isAuthenticated = false,
  eligibility = null,
}) {
  const slides = tiers.filter((t) => formatTierBonus(t));
  const initialSlide = Math.max(
    0,
    slides.findIndex((t) => tierStatus(t, eligibility) === 'active'),
  );

  const [activeSlide, setActiveSlide] = useState(initialSlide >= 0 ? initialSlide : 0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const carouselRef = useRef(null);
  const dragStartXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const activeSlideRef = useRef(0);

  activeSlideRef.current = activeSlide;

  const goToSlide = useCallback(
    (index) => {
      const total = slides.length;
      if (total === 0) return;
      setActiveSlide(((index % total) + total) % total);
    },
    [slides.length],
  );

  const goNext = useCallback(() => goToSlide(activeSlideRef.current + 1), [goToSlide]);
  const goPrev = useCallback(() => goToSlide(activeSlideRef.current - 1), [goToSlide]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = setInterval(goNext, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeSlide, goNext, slides.length]);

  const finishDrag = useCallback(
    (clientX) => {
      if (!isDraggingRef.current) return;
      const delta = clientX - dragStartXRef.current;
      isDraggingRef.current = false;
      setIsDragging(false);
      setDragOffset(0);
      if (delta < -SWIPE_THRESHOLD_PX) goNext();
      else if (delta > SWIPE_THRESHOLD_PX) goPrev();
    },
    [goNext, goPrev],
  );

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    setIsDragging(true);
    setDragOffset(0);
    carouselRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return;
    carouselRef.current?.releasePointerCapture(e.pointerId);
    finishDrag(e.clientX);
  };

  if (slides.length === 0) return null;

  const hours = Math.max(1, Number(expiryHours) || 24);
  const ctaTo = isAuthenticated ? '/deposit' : '/register';
  const ctaLabel = isAuthenticated ? 'Deposit now' : 'Sign up & claim';

  const trackStyle = {
    transform: `translateX(calc(-${activeSlide * 100}% + ${dragOffset}px))`,
    transition: isDragging ? 'none' : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
  };

  return (
    <section className="dbp-section dbp-section--guest-polish dash-animate-in" aria-label="Promotions" aria-roledescription="carousel">
      <div className="dash-section-head dbp-head">
        <p className="dash-payments-kick">Limited welcome offer</p>
        <h2 className="dash-payments-title">Promotions</h2>
        <p className="dash-spin-desc dbp-sub">
          First 3 deposit bonuses, valid {hours}h after signup
        </p>
      </div>

      <div
        ref={carouselRef}
        className={`dbp-shell${isDragging ? ' dbp-shell--dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => {
          if (!isDraggingRef.current) return;
          setDragOffset(e.clientX - dragStartXRef.current);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => {
          if (isDraggingRef.current && !e.currentTarget.hasPointerCapture(e.pointerId)) {
            finishDrag(e.clientX);
          }
        }}
      >
        <div className="dbp-track" style={trackStyle}>
          {slides.map((tier, index) => {
            const n = tier.deposit_number ?? tier.depositNumber;
            const accent = tierAccent(index);
            const highlight = formatTierBonus(tier);
            const status = tierStatus(tier, eligibility);
            const title = tier.title?.trim() || `${depositTierLabel(n)} Deposit Bonus`;

            return (
              <article
                key={`dbp-${n}`}
                className={`dbp-slide${index === activeSlide ? ' dbp-slide--active' : ''}`}
                style={{ '--dbp-accent': accent }}
                aria-hidden={index !== activeSlide}
              >
                <div className="dbp-slide-bg" aria-hidden>
                  <span className="dbp-bg-mesh" />
                  <span className="dbp-bg-glow" />
                  <img className="dbp-bg-coin dbp-bg-coin--1" src="/icons/coin.png" alt="" aria-hidden />
                  <img className="dbp-bg-coin dbp-bg-coin--2" src="/icons/bonus.png" alt="" aria-hidden />
                </div>

                <div className="dbp-slide-body">
                  <div className="dbp-slide-copy">
                    <span className="dbp-tier-badge">{depositTierLabel(n)} deposit</span>
                    <h3 className="dbp-slide-title">{title}</h3>
                    <p className="dbp-slide-bonus">
                      <span className="dbp-slide-bonus-value">{highlight}</span>
                      <span className="dbp-slide-bonus-label">extra</span>
                    </p>
                    {status === 'claimed' ? (
                      <span className="dbp-slide-tag dbp-slide-tag--claimed">Claimed</span>
                    ) : status === 'active' ? (
                      <span className="dbp-slide-tag dbp-slide-tag--active">Your next bonus</span>
                    ) : null}
                  </div>

                  <Link
                    to={ctaTo}
                    className="dbp-cta no-underline"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {ctaLabel}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {slides.length > 1 ? (
          <div className="dbp-dots" role="tablist" aria-label="Bonus slides" onPointerDown={(e) => e.stopPropagation()}>
            {slides.map((tier, index) => {
              const n = tier.deposit_number ?? tier.depositNumber;
              return (
                <button
                  key={`dbp-dot-${n}`}
                  type="button"
                  role="tab"
                  aria-selected={index === activeSlide}
                  aria-label={`${depositTierLabel(n)} deposit bonus`}
                  className={`dbp-dot${index === activeSlide ? ' dbp-dot--active' : ''}`}
                  onClick={() => goToSlide(index)}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
