/**
 * Placeholder page for routes not yet implemented. Use for Step 3 nav structure.
 */
export function PagePlaceholder({ title, description, children }) {
  return (
    <div className="max-w-xl mx-auto py-12 px-4 text-center">
      <h1 className="text-2xl font-bold text-gray-100 mb-2">{title}</h1>
      {description && <p className="text-gray-400 mb-8">{description}</p>}
      {children}
    </div>
  );
}
