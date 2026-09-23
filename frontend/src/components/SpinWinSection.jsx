import { lazy, Suspense, useCallback, useState } from 'react';

const GuestSlotSpinWheelModal = lazy(() =>
  import('./SpinWheel/GuestSlotSpinWheelModal').then((m) => ({ default: m.GuestSlotSpinWheelModal }))
);

/**
 * Guest home — spin card matching DragonFury.online landing treatment.
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
              <h2 className="dash-spin-title">Spin the wheel</h2>
              <p className="dash-spin-desc">
                Register and claim eligible rewards shown before you spin.
              </p>
              <button type="button" className="dash-spin-cta" onClick={openSpinModal}>
                Spin Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {spinLoaded ? (
        <Suspense fallback={null}>
          <GuestSlotSpinWheelModal open={spinModalOpen} onClose={() => setSpinModalOpen(false)} />
        </Suspense>
      ) : null}
    </section>
  );
}
