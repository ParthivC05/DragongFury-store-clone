/**
 * Shared wrapper for help tab content.
 * Layout: title → step-by-step guide (children) → one image (optional) → note (optional).
 */
export function HelpTabPage({ title, children, image, note }) {
  return (
    <div className="rounded-2xl bg-card border border-gray-700 p-4 sm:p-6">
      {title && (
        <h2 className="text-base sm:text-lg font-semibold text-gray-100 m-0 mb-3">{title}</h2>
      )}
      <div className="help-tab-body text-sm text-gray-200">
        {children}
        {note && <p className="mt-4 italic text-gray-400 m-0">{note}</p>}
      </div>
      {image?.src && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Guide image</p>
          <div className="relative w-full max-w-lg rounded-xl border border-gray-600 overflow-hidden bg-gray-800/50">
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
            <div className="hidden absolute inset-0 items-center justify-center p-4 text-center text-sm text-gray-500">
              Add your guide image (e.g. in public/help/) or set image.src to your URL.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
