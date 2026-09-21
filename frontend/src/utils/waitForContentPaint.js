const PAINT_WAIT_MS = 400;

function waitForImages(root) {
  if (!root) return Promise.resolve();
  const imgs = [...root.querySelectorAll('img')];
  // Lazy images stay pending while off-screen — never gate reveal on them.
  const pending = imgs.filter(
    (img) => img.getAttribute('loading') !== 'lazy' && !(img.complete && img.naturalWidth > 0)
  );
  if (!pending.length) return Promise.resolve();

  return Promise.all(
    pending.map(
      (img) =>
        new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })
    )
  );
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    }),
  ]);
}

/**
 * Light paint settle before optional reveal.
 * Does NOT await document.fonts.ready — that can stall for seconds (or hang
 * after a backgrounded tab) and must not block navigation / tab resume.
 */
export async function waitForContentPaint() {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const root = document.querySelector('main') || document.querySelector('.dash-root') || document.body;
  await withTimeout(waitForImages(root), PAINT_WAIT_MS);
}
