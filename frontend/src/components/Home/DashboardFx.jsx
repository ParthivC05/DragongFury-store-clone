import { useEffect, useRef } from 'react';
import { scheduleAfterLoad } from '../../utils/scheduleAfterLoad';

/**
 * Ambient gamification effects from the casino-slots-redesign mockup:
 *  - a slow rising "sparks" particle field behind the dashboard
 *  - a confetti burst triggered by the `dash:confetti` window event
 * Honours prefers-reduced-motion (renders nothing in that case).
 * Starts after idle so first interactions are not competing with rAF (INP).
 */
export function DashboardFx() {
  const ambientRef = useRef(null);
  const confettiRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;

    let cancelled = false;
    let cleanupFx = null;
    let cancelSchedule = () => {};

    const startFx = () => {
      if (cancelled) return;
      const ambient = ambientRef.current;
      const confetti = confettiRef.current;
      if (!ambient || !confetti) return;

      const actx = ambient.getContext('2d');
      const cctx = confetti.getContext('2d');
      let width = 0;
      let height = 0;
      let parts = [];
      let confs = [];
      let rafA = 0;
      let rafC = 0;
      let running = false;

      const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        [ambient, confetti].forEach((c) => {
          c.width = width;
          c.height = height;
        });
        parts = [];
        const count = Math.min(34, Math.round(width / 48));
        for (let i = 0; i < count; i += 1) {
          parts.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.6 + 0.4,
            vy: Math.random() * 0.22 + 0.05,
            a: Math.random() * 0.45 + 0.12,
            h: Math.random() < 0.5 ? '245,196,81' : '47,209,122',
          });
        }
      };

      const drawAmbient = () => {
        if (!running) return;
        actx.clearRect(0, 0, width, height);
        parts.forEach((p) => {
          p.y -= p.vy;
          if (p.y < -5) {
            p.y = height + 5;
            p.x = Math.random() * width;
          }
          actx.beginPath();
          actx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          actx.fillStyle = `rgba(${p.h},${p.a})`;
          actx.fill();
        });
        rafA = requestAnimationFrame(drawAmbient);
      };

      const cols = ['#F5C451', '#2FD17A', '#FF5630', '#7B6CF6', '#3FC9E0', '#FFE89A'];
      const burst = (x, y, n = 80) => {
        for (let i = 0; i < n; i += 1) {
          const ang = Math.random() * Math.PI * 2;
          const sp = Math.random() * 8 + 3;
          confs.push({
            x,
            y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 4,
            g: 0.22 + Math.random() * 0.12,
            s: Math.random() * 7 + 4,
            c: cols[(Math.random() * cols.length) | 0],
            r: Math.random() * 6,
            vr: (Math.random() - 0.5) * 0.4,
            life: 1,
          });
        }
      };

      const drawConfetti = () => {
        if (!running) return;
        cctx.clearRect(0, 0, width, height);
        confs = confs.filter((o) => o.life > 0);
        confs.forEach((o) => {
          o.vy += o.g;
          o.x += o.vx;
          o.y += o.vy;
          o.r += o.vr;
          o.life -= 0.008;
          cctx.save();
          cctx.translate(o.x, o.y);
          cctx.rotate(o.r);
          cctx.globalAlpha = Math.max(o.life, 0);
          cctx.fillStyle = o.c;
          cctx.fillRect(-o.s / 2, -o.s / 2, o.s, o.s * 0.6);
          cctx.restore();
        });
        rafC = requestAnimationFrame(drawConfetti);
      };

      const startLoops = () => {
        if (running || cancelled) return;
        running = true;
        rafA = requestAnimationFrame(drawAmbient);
        rafC = requestAnimationFrame(drawConfetti);
      };

      const stopLoops = () => {
        running = false;
        cancelAnimationFrame(rafA);
        cancelAnimationFrame(rafC);
        rafA = 0;
        rafC = 0;
        actx.clearRect(0, 0, width, height);
        cctx.clearRect(0, 0, width, height);
      };

      const onVisibility = () => {
        if (document.hidden) {
          stopLoops();
          return;
        }
        // Tab resume: reset canvas buffers (can go black after GPU discard).
        resize();
        startLoops();
      };

      const onConfetti = (e) => {
        const x = e?.detail?.x ?? window.innerWidth / 2;
        const y = e?.detail?.y ?? window.innerHeight * 0.4;
        burst(x, y, 90);
        if (!running && !document.hidden) startLoops();
      };

      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('dash:confetti', onConfetti);
      document.addEventListener('visibilitychange', onVisibility);
      if (!document.hidden) startLoops();

      cleanupFx = () => {
        stopLoops();
        window.removeEventListener('resize', resize);
        window.removeEventListener('dash:confetti', onConfetti);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    };

    cancelSchedule = scheduleAfterLoad(startFx);

    return () => {
      cancelled = true;
      cancelSchedule();
      cleanupFx?.();
    };
  }, []);

  return (
    <>
      <canvas ref={ambientRef} className="dash-fx-ambient" aria-hidden />
      <canvas ref={confettiRef} className="dash-fx-confetti" aria-hidden />
    </>
  );
}
