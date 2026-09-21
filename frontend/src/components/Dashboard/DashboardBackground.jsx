import { useEffect, useRef } from 'react';
import { scheduleAfterLoad } from '../../utils/scheduleAfterLoad';

export function DashboardBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;

    let cancelled = false;
    let cleanup = () => {};
    let cancelSchedule = () => {};

    const startFx = () => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      let width = 0;
      let height = 0;
      let stars = [];
      let frameId = 0;

      const resize = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        stars = [];
        const count = Math.min(40, Math.round(width / 48));
        for (let i = 0; i < count; i += 1) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: 0.2 + Math.random() * 1.4,
            a: Math.random(),
            da: (0.001 + Math.random() * 0.003) * (Math.random() > 0.5 ? 1 : -1),
            cool: Math.random() > 0.4,
          });
        }
      };

      const draw = () => {
        ctx.clearRect(0, 0, width, height);
        stars.forEach((s) => {
          s.a = Math.max(0, Math.min(1, s.a + s.da));
          if (s.a <= 0 || s.a >= 1) s.da *= -1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = s.cool
            ? `rgba(0,255,224,${s.a * 0.7})`
            : `rgba(255,215,0,${s.a * 0.8})`;
          ctx.fill();
        });
        frameId = requestAnimationFrame(draw);
      };

      const start = () => {
        if (frameId) return;
        frameId = requestAnimationFrame(draw);
      };

      const stop = () => {
        if (!frameId) return;
        cancelAnimationFrame(frameId);
        frameId = 0;
      };

      const onVisibility = () => {
        if (document.hidden) {
          stop();
          return;
        }
        resize();
        start();
      };

      resize();
      if (!document.hidden) start();
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', onVisibility);

      cleanup = () => {
        stop();
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    };

    cancelSchedule = scheduleAfterLoad(startFx);

    return () => {
      cancelled = true;
      cancelSchedule();
      cleanup();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="dash-bg-canvas" aria-hidden />
      <div className="dash-lightning" aria-hidden />
    </>
  );
}
