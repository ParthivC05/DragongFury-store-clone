/**
 * Shared wrapper for help tab content.
 * Layout: title → step-by-step guide (children) → one image (optional) → note (optional).
 */
export function HelpTabPage({ title, children, image, note }) {
  return (
    <div className="df-help-panel-card">
      {title ? <h2>{title}</h2> : null}
      <div className="help-tab-body">
        {children}
        {note ? <p className="mt-4 italic m-0" style={{ color: 'rgba(255,255,255,0.55)' }}>{note}</p> : null}
      </div>
      {image?.src ? (
        <div className="mt-6">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2 m-0"
            style={{ color: 'rgba(255,224,106,0.85)' }}
          >
            Guide image
          </p>
          <div
            className="relative w-full max-w-lg rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(217,184,255,0.35)', background: 'rgba(10,6,32,0.5)' }}
          >
            <img
              src={image.src}
              alt={image.alt ?? 'Guide'}
              className="w-full rounded-xl object-cover shadow-md min-h-[200px]"
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) {
                  fallback.classList.remove('hidden');
                  fallback.style.display = 'flex';
                }
              }}
            />
            <div
              className="hidden absolute inset-0 items-center justify-center p-4 text-center text-sm"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Add your guide image (e.g. in public/help/) or set image.src to your URL.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
