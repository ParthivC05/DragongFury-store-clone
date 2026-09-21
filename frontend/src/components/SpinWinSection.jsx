import { lazy, Suspense, useCallback, useState } from 'react';
import { GuestTopPlayersLive } from './Home/GuestTopPlayersLive';

const GuestSlotSpinWheelModal = lazy(() =>
  import('./SpinWheel/GuestSlotSpinWheelModal').then((m) => ({ default: m.GuestSlotSpinWheelModal }))
);

/**
 * Guest home — inspo duo: spin card + top players live table (#spin).
 * Modal / framer-motion / landing CSS load only after the first spin click.
 */
export function SpinWinSection() {
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [spinLoaded, setSpinLoaded] = useState(false);

  const openSpinModal = useCallback(() => {
    setSpinLoaded(true);
    setSpinModalOpen(true);
  }, []);

  return (
    <section id="spin" className="dash-spin-duo-section dash-animate-in" aria-label="Spin and win">
      <div className="dash-spin-duo">
        <div className="dash-spin-card">
          <div className="dash-spin-card-inner">
            <button
              type="button"
              className="dash-spin-deco-wheel"
              onClick={openSpinModal}
              aria-label="Open spin wheel"
            >
              <span className="dash-spin-deco-hub">SPIN</span>
            </button>

            <div className="dash-spin-card-copy">
              <p className="dash-spin-kick">SPIN &amp; WIN</p>
              <h2 className="dash-spin-title">Register &amp; win — spin the wheel on your schedule</h2>
              <p className="dash-spin-desc">
                Win real prizes per account rules. Rewards shown before you spin.
              </p>
              <button type="button" className="dash-spin-cta" onClick={openSpinModal}>
                🎡 SPIN NOW — FREE
              </button>
            </div>
          </div>
        </div>

        <GuestTopPlayersLive />
      </div>

      {spinLoaded ? (
        <Suspense fallback={null}>
          <GuestSlotSpinWheelModal open={spinModalOpen} onClose={() => setSpinModalOpen(false)} />
        </Suspense>
      ) : null}
    </section>
  );
}
