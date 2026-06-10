// Presentational ESI selector for the ESI_ASSIGNMENT stage. Renders levels 1..5
// with short descriptors and calls back with the chosen level. Pure / props-driven
// — no store access. ESI 1 = most acute, ESI 5 = least acute.

export interface EsiLevelMeta {
  level: number;
  name: string;
  descriptor: string;
}

export const ESI_LEVELS: readonly EsiLevelMeta[] = [
  {
    level: 1,
    name: "Resuscitation",
    descriptor: "Immediate life-saving intervention required.",
  },
  {
    level: 2,
    name: "Emergent",
    descriptor: "High-risk situation; should not wait.",
  },
  {
    level: 3,
    name: "Urgent",
    descriptor: "Stable but needs multiple resources.",
  },
  {
    level: 4,
    name: "Less urgent",
    descriptor: "Stable; needs one resource.",
  },
  {
    level: 5,
    name: "Non-urgent",
    descriptor: "Stable; needs no resources.",
  },
];

export interface EsiSelectorProps {
  /** Currently chosen level, or null if none picked yet. */
  value: number | null;
  onSelect: (level: number) => void;
  disabled?: boolean;
}

export function EsiSelector({
  value,
  onSelect,
  disabled = false,
}: EsiSelectorProps): JSX.Element {
  return (
    <fieldset className="esi-selector" aria-label="ESI level">
      <legend className="esi-selector__legend">Assign an ESI level</legend>
      <ul className="esi-selector__list" role="radiogroup" aria-label="ESI level">
        {ESI_LEVELS.map((meta) => {
          const checked = value === meta.level;
          return (
            <li key={meta.level} className="esi-selector__item">
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={disabled}
                className={`esi-selector__option esi-selector__option--esi${
                  meta.level
                }${checked ? " esi-selector__option--checked" : ""}`}
                data-level={meta.level}
                onClick={() => onSelect(meta.level)}
              >
                <span className="esi-selector__level">ESI {meta.level}</span>
                <span className="esi-selector__name">{meta.name}</span>
                <span className="esi-selector__descriptor">
                  {meta.descriptor}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
