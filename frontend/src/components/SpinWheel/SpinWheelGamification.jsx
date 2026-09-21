import { useReducedMotion } from 'framer-motion';
import { VipConfetti } from '../Vip/VipGamification';

const PARTICLES = [
  { id: 1, emoji: '✨', top: '10%', left: '6%', delay: 0 },
  { id: 2, emoji: '🪙', top: '20%', right: '8%', delay: 0.5 },
  { id: 3, emoji: '⭐', top: '52%', left: '4%', delay: 1 },
  { id: 4, emoji: '💎', top: '68%', right: '10%', delay: 0.3 },
  { id: 5, emoji: '🎰', top: '32%', right: '18%', delay: 1.4 },
  { id: 6, emoji: '✨', top: '78%', left: '14%', delay: 0.8 },
];

export const spinFadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function SpinWheelParticles() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="dash-vip-gfx-particle absolute select-none text-lg"
          style={{ top: p.top, left: p.left, right: p.right, animationDelay: `${p.delay}s` }}
        >
          {p.emoji}
        </span>
      ))}
      <div className="dash-vip-gfx-orbit dash-vip-gfx-orbit-a" />
      <div className="dash-vip-gfx-orbit dash-vip-gfx-orbit-b" />
    </div>
  );
}

export function SpinWheelConfetti({ active }) {
  return <VipConfetti show={active} />;
}
