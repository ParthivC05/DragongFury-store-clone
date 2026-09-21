import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { GAME_PLACEHOLDER } from '../../utils/gitslotparkLandingGames';

const SLIDE_MS = 3000;
const ANIM_MS = 650;
const DRAG_CLICK_PX = 8;

function previewSrc(game) {
  if (typeof game?.image === 'string' && game.image.trim()) return game.image.trim();
  const icons = Array.isArray(game?.iconUrls) ? game.iconUrls : [];
  const first = icons.find((url) => typeof url === 'string' && url.trim());
  return first ? first.trim() : '';
}

function gameKey(game, copy, index) {
  return `${copy}-${index}-${game?.id || game?.gameid || game?.title || 'g'}`;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function copyCountFor(baseCount, visible) {
  if (baseCount < 2) return 1;
  const side = Math.ceil(visible / 2) + 3;
  const perSide = Math.max(2, Math.ceil(side / baseCount));
  return perSide * 2 + 1;
}

export function HomeCasinoCoverflow({ games, onPlay, playingGameId, label, categoryId = null }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const inViewRef = useRef(true);
  const wrapTimerRef = useRef(0);
  const resumeTimerRef = useRef(0);
  const coverRef = useRef(null);
  const layoutRef = useRef({ slideW: 120, visible: 7, mobile: false, copies: 5, mid: 0 });
  const liveAspectRef = useRef(3 / 4);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startIndex: 0,
    moved: false,
    axis: '',
    pointerId: null,
    captured: false,
  });

  const list = useMemo(() => (Array.isArray(games) ? games.filter(Boolean) : []), [games]);
  const baseCount = list.length;
  const copies = useMemo(() => copyCountFor(baseCount, 13), [baseCount]);
  const midStart = useMemo(
    () => (baseCount < 2 ? 0 : Math.floor(copies / 2) * baseCount),
    [baseCount, copies]
  );

  const looped = useMemo(() => {
    if (!baseCount) return [];
    const out = [];
    for (let copy = 0; copy < copies; copy += 1) {
      list.forEach((game, index) => out.push({ game, copy, index }));
    }
    return out;
  }, [baseCount, copies, list]);

  const setTrackAnimating = useCallback((animate) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate
      ? `transform ${ANIM_MS}ms cubic-bezier(0.22, 0.8, 0.28, 1)`
      : 'none';
  }, []);

  const moduloIndex = useCallback(
    (value) => {
      if (baseCount < 2) return 0;
      return ((Math.round(value) % baseCount) + baseCount) % baseCount;
    },
    [baseCount]
  );

  const snapToMiddle = useCallback(
    (value) => {
      if (baseCount < 2) return Math.max(0, Math.min(value, Math.max(looped.length - 1, 0)));
      return midStart + moduloIndex(value);
    },
    [baseCount, looped.length, midStart, moduloIndex]
  );

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return layoutRef.current;
    const width = viewport.clientWidth || 360;
    const mobile = width < 768;
    const visible = mobile ? 3 : 13;
    const slideW = width / visible;
    const liveCasino = String(categoryId || '') === 'live-casino';
    const cardW = liveCasino
      ? mobile
        ? slideW * 1.72
        : slideW * 2.2
      : mobile
        ? slideW * 1.28
        : slideW * 1.65;
    const overlap = (cardW - slideW) / -2;
    const cardH = liveCasino
      ? Math.round(cardW * liveAspectRef.current)
      : Math.round(cardW * (mobile ? 1.12 : 1.18));
    viewport.style.setProperty('--cover-slide', `${slideW}px`);
    viewport.style.setProperty('--cover-card-w', `${cardW}px`);
    viewport.style.setProperty('--cover-overlap', `${overlap}px`);
    viewport.style.setProperty('--cover-card-h', `${cardH}px`);
    layoutRef.current = { slideW, visible, mobile, copies, mid: midStart };
    return layoutRef.current;
  }, [categoryId, copies, midStart]);

  const applyTransforms = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const { slideW, visible, mobile } = layoutRef.current;
    const origin = viewport.clientWidth / 2 - slideW / 2;
    const offset = origin - indexRef.current * slideW;
    track.style.transform = `translate3d(${offset}px, 0, 0)`;
    const maxAbs = mobile ? 1.15 : visible / 2 + 0.15;
    const rotateStep = mobile ? 16 : 12;

    for (let i = 0; i < track.children.length; i += 1) {
      const node = track.children[i];
      const card = node.firstElementChild;
      if (!card) continue;
      const dx = i - indexRef.current;
      const abs = Math.abs(dx);
      const hidden = abs > maxAbs;
      node.style.visibility = hidden ? 'hidden' : 'visible';
      node.style.pointerEvents = hidden ? 'none' : 'auto';
      const rotate = Math.max(-58, Math.min(58, -dx * rotateStep));
      const scaleX = Math.max(0.34, (mobile ? 1.1 : 1.18) - abs * (mobile ? 0.16 : 0.13));
      const scaleY = Math.max(0.7, (mobile ? 1.06 : 1.1) - abs * (mobile ? 0.07 : 0.05));
      node.style.zIndex = String(80 - Math.round(abs * 4));
      card.classList.toggle('is-center', abs < 0.45);
      card.style.transform = `translateZ(${-abs * (mobile ? 18 : 28)}px) rotateY(${rotate}deg) scale(${scaleX}, ${scaleY})`;
    }
  }, []);

  const rebaseIfNearEdge = useCallback(() => {
    if (baseCount < 2) return;
    const wrapped = snapToMiddle(indexRef.current);
    if (wrapped === indexRef.current) return;
    setTrackAnimating(false);
    indexRef.current = wrapped;
    applyTransforms();
  }, [applyTransforms, baseCount, setTrackAnimating, snapToMiddle]);

  const goTo = useCallback(
    (nextIndex, animate) => {
      window.clearTimeout(wrapTimerRef.current);
      if (baseCount >= 2) {
        const min = midStart - baseCount;
        const max = midStart + baseCount * 2;
        while (nextIndex < min) nextIndex += baseCount;
        while (nextIndex >= max) nextIndex -= baseCount;
      }
      indexRef.current = nextIndex;
      setTrackAnimating(animate);
      applyTransforms();
      wrapTimerRef.current = window.setTimeout(() => {
        const wrapped = snapToMiddle(indexRef.current);
        if (wrapped === indexRef.current) return;
        setTrackAnimating(false);
        indexRef.current = wrapped;
        applyTransforms();
      }, animate ? ANIM_MS + 40 : 0);
    },
    [applyTransforms, baseCount, midStart, setTrackAnimating, snapToMiddle]
  );

  useLayoutEffect(() => {
    measure();
    indexRef.current = snapToMiddle(midStart);
    setTrackAnimating(false);
    applyTransforms();
  }, [applyTransforms, measure, midStart, setTrackAnimating, snapToMiddle, looped.length]);

  useEffect(() => {
    if (String(categoryId || '') !== 'live-casino') return undefined;
    const src = previewSrc(list[0]);
    if (!src) return undefined;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
      liveAspectRef.current = img.naturalHeight / img.naturalWidth;
      measure();
      applyTransforms();
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [applyTransforms, categoryId, list, measure]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const resize = new ResizeObserver(() => {
      measure();
      rebaseIfNearEdge();
      setTrackAnimating(false);
      applyTransforms();
    });
    resize.observe(viewport);

    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        ([entry]) => {
          inViewRef.current = Boolean(entry?.isIntersecting);
        },
        { threshold: 0.12 }
      );
      io.observe(viewport);
    }

    const timer = window.setInterval(() => {
      if (!inViewRef.current || pausedRef.current || prefersReducedMotion() || baseCount < 2) return;
      rebaseIfNearEdge();
      goTo(indexRef.current + 1, true);
    }, SLIDE_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(wrapTimerRef.current);
      resize.disconnect();
      io?.disconnect();
    };
  }, [applyTransforms, baseCount, goTo, measure, rebaseIfNearEdge, setTrackAnimating, looped.length]);

  useEffect(() => {
    const el = coverRef.current;
    if (!el || baseCount < 2) return undefined;

    const point = (event) => {
      if (event.touches?.length) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
      if (event.changedTouches?.length) {
        return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
      }
      return { x: event.clientX, y: event.clientY };
    };

    const pointerGuardRef = { current: false };

    const startDrag = (event) => {
      const isTouch = event.type.startsWith('touch');
      if (isTouch && pointerGuardRef.current) return;
      if (!isTouch) pointerGuardRef.current = true;
      if (event.pointerType === 'mouse' && event.button != null && event.button !== 0) return;
      window.clearTimeout(resumeTimerRef.current);
      pausedRef.current = true;
      rebaseIfNearEdge();
      setTrackAnimating(false);
      const { x, y } = point(event);
      dragRef.current = {
        active: true,
        startX: x,
        startY: y,
        startIndex: indexRef.current,
        moved: false,
        axis: '',
        pointerId: event.pointerId ?? null,
        captured: false,
      };
    };

    const moveDrag = (event) => {
      if (event.type.startsWith('touch') && pointerGuardRef.current) return;
      const drag = dragRef.current;
      if (!drag.active) return;
      const { x, y } = point(event);
      const dx = x - drag.startX;
      const dy = y - drag.startY;

      if (!drag.axis) {
        if (Math.abs(dx) < DRAG_CLICK_PX && Math.abs(dy) < DRAG_CLICK_PX) return;
        drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (drag.axis === 'y') {
          drag.active = false;
          pausedRef.current = false;
          return;
        }
        drag.moved = true;
        el.classList.add('is-dragging');
        if (drag.pointerId != null && !drag.captured) {
          try {
            el.setPointerCapture(drag.pointerId);
            drag.captured = true;
          } catch {
            void 0;
          }
        }
      }

      if (drag.axis !== 'x') return;
      if (event.cancelable) event.preventDefault();
      const slideW = layoutRef.current.slideW || 1;
      indexRef.current = drag.startIndex - dx / slideW;
      applyTransforms();
    };

    const endDrag = (event) => {
      if (event?.type?.startsWith('touch') && pointerGuardRef.current) return;
      if (event?.type?.startsWith('pointer')) pointerGuardRef.current = false;
      const drag = dragRef.current;
      if (!drag.active) return;
      const wasHorizontal = drag.axis === 'x' || drag.moved;
      drag.active = false;
      el.classList.remove('is-dragging');
      if (drag.captured && drag.pointerId != null) {
        try {
          el.releasePointerCapture(drag.pointerId);
        } catch {
          void 0;
        }
      }
      drag.captured = false;
      drag.pointerId = null;
      drag.axis = '';
      if (wasHorizontal) goTo(Math.round(indexRef.current), true);
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = window.setTimeout(() => {
        pausedRef.current = false;
        dragRef.current.moved = false;
      }, wasHorizontal ? 1800 : 0);
    };

    el.addEventListener('pointerdown', startDrag);
    window.addEventListener('pointermove', moveDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    el.addEventListener('touchstart', startDrag, { passive: true });
    el.addEventListener('touchmove', moveDrag, { passive: false });
    el.addEventListener('touchend', endDrag);
    el.addEventListener('touchcancel', endDrag);

    return () => {
      el.classList.remove('is-dragging');
      window.clearTimeout(resumeTimerRef.current);
      el.removeEventListener('pointerdown', startDrag);
      window.removeEventListener('pointermove', moveDrag);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('touchstart', startDrag);
      el.removeEventListener('touchmove', moveDrag);
      el.removeEventListener('touchend', endDrag);
      el.removeEventListener('touchcancel', endDrag);
    };
  }, [applyTransforms, baseCount, goTo, rebaseIfNearEdge, setTrackAnimating]);

  const handleCardClick = (event, game, loopIndex) => {
    if (dragRef.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (Math.abs(loopIndex - indexRef.current) > 0.45) {
      goTo(loopIndex, true);
      return;
    }
    onPlay?.(game);
  };

  if (!baseCount) return null;

  return (
    <div
      ref={coverRef}
      className={`dash-home-cover${String(categoryId || '') === 'live-casino' ? ' dash-home-cover--live' : ''}`}
    >
      <div ref={viewportRef} className="dash-home-cover-viewport" aria-label={label}>
        <div ref={trackRef} className="dash-home-cover-track">
          {looped.map(({ game, copy, index }, loopIndex) => {
            const playing =
              playingGameId != null && String(playingGameId) === String(game.gameid);
            const src = previewSrc(game) || GAME_PLACEHOLDER;
            return (
              <div key={gameKey(game, copy, index)} className="dash-home-cover-slide">
                <button
                  type="button"
                  className={`dash-home-cover-card${playing ? ' is-playing' : ''}`}
                  aria-label={`Play ${game.title}`}
                  disabled={playing}
                  onClick={(event) => handleCardClick(event, game, loopIndex)}
                >
                  <img
                    src={src}
                    alt=""
                    className="dash-home-cover-img"
                    draggable={false}
                    loading="lazy"
                    onError={(event) => {
                      if (event.currentTarget.src.includes(GAME_PLACEHOLDER)) return;
                      event.currentTarget.src = GAME_PLACEHOLDER;
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
