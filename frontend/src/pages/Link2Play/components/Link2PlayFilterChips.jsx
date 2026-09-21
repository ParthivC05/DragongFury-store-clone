export function Link2PlayFilterChips({ value, onChange, filters }) {
  if (!filters?.length) return null;

  return (
    <div className="l2p-chips" role="group" aria-label="Filter games">
      {filters.map((chip) => {
        const active = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            className={`l2p-chip${active ? ' l2p-chip--active' : ''}`}
            onClick={() => onChange?.(chip.id)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
