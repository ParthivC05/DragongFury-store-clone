import { useEffect, useRef } from 'react';
import { site } from '../../config/site';

export function AuthBackground() {
  const canvasRef = useRef(null);
  const platformShort = site.platformName;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let stars = [];
    let frameId = 0;

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      stars = [];
      for (let i = 0; i < 160; i += 1) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.2 + Math.random() * 1.6,
          a: Math.random(),
          da: (0.0012 + Math.random() * 0.004) * (Math.random() > 0.5 ? 1 : -1),
          warm: Math.random() > 0.35
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
        ctx.fillStyle = s.warm
          ? `rgba(249,208,56,${s.a})`
          : `rgba(255,160,50,${s.a * 0.6})`;
        ctx.fill();
      });
      frameId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <>
      <div className="pj-bg-base" aria-hidden />
      <div className="pj-felt" aria-hidden />
      <div className="pj-ring r1" aria-hidden />
      <div className="pj-ring r2" aria-hidden />
      <div className="pj-ring r3" aria-hidden />
      <canvas ref={canvasRef} className="pj-stars" aria-hidden />
      <div className="pj-suit s1" aria-hidden>
        ♠
      </div>
      <div className="pj-suit s2" aria-hidden>
        ♥
      </div>
      <div className="pj-suit s3" aria-hidden>
        ♦
      </div>
      <div className="pj-suit s4" aria-hidden>
        ♣
      </div>
      <div className="pj-neon-strip ns-left" aria-hidden>
        ★ {platformShort} Casino ★ Win Big ★ Play Now ★
      </div>
      <div className="pj-neon-strip ns-right" aria-hidden>
        ★ Jackpot Daily ★ Spin &amp; Win ★ Best Odds ★
      </div>
    </>
  );
}
