export function SortableTh({ label, sortKey, currentSortBy, sortOrder, onSort }) {
  const isActive = currentSortBy === sortKey

  return (
    <th
      className={`sortable ${isActive ? 'active' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="sort-label">
        {label}
        <span className="sort-icon" aria-hidden>
          {!isActive ? (
            <SortNoneIcon />
          ) : sortOrder === 'asc' ? (
            <SortAscIcon />
          ) : (
            <SortDescIcon />
          )}
        </span>
      </span>
    </th>
  )
}

function SortNoneIcon({
  size = 20,
  strokeWidth = 1.8,
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Up arrow */}
      <path d="M8 9l4-4 4 4" />
      <path d="M12 5v10" opacity="0.4" />

      {/* Down arrow */}
      <path d="M16 15l-4 4-4-4" />
      <path d="M12 9v10" opacity="0.4" />
    </svg>
  );
}

function SortAscIcon({
  size = 20,
  strokeWidth = 2,
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Strong up arrow */}
      <path d="M12 5l5 6H7l5-6z" fill="currentColor" />
      <path d="M12 11v8" />

      {/* Subtle down */}
      <path d="M16 17l-4 4-4-4" opacity="0.25" />
    </svg>
  );
}

function SortDescIcon({
  size = 20,
  strokeWidth = 2,
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Strong down arrow */}
      <path d="M12 19l-5-6h10l-5 6z" fill="currentColor" />
      <path d="M12 5v8" />

      {/* Subtle up */}
      <path d="M8 7l4-4 4 4" opacity="0.25" />
    </svg>
  );
}
