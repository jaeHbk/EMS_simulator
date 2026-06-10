// Presentational ESI selector for the ESI_ASSIGNMENT stage. Renders levels 1..5
// with short descriptors and calls back with the chosen level. Pure / props-driven
// — no store access. ESI 1 = most acute, ESI 5 = least acute.

import { cn } from "@/lib/utils";

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

// Acuity color mapping. Color always pairs with the ESI number + name, never alone.
// 1 = destructive (most acute) … 5 = success/muted (least acute).
interface AcuityStyle {
  /** Accent rail + selected ring/border color. */
  accent: string;
  /** Tint applied to the whole tile when selected. */
  selectedTile: string;
  /** Big "ESI n" numeral color. */
  numeral: string;
  /** Small acuity caption text shown under the rail label. */
  caption: string;
}

const ACUITY: Record<number, AcuityStyle> = {
  1: {
    accent: "bg-destructive",
    selectedTile: "border-destructive ring-destructive/40 bg-destructive/10",
    numeral: "text-destructive",
    caption: "Most acute",
  },
  2: {
    accent: "bg-destructive/70",
    selectedTile: "border-destructive/70 ring-destructive/30 bg-destructive/5",
    numeral: "text-destructive/90",
    caption: "High risk",
  },
  3: {
    accent: "bg-warning",
    selectedTile: "border-warning ring-warning/40 bg-warning/10",
    numeral: "text-warning",
    caption: "Urgent",
  },
  4: {
    accent: "bg-muted-foreground/50",
    selectedTile: "border-muted-foreground/40 ring-muted-foreground/20 bg-muted/60",
    numeral: "text-muted-foreground",
    caption: "Lower acuity",
  },
  5: {
    accent: "bg-success",
    selectedTile: "border-success ring-success/40 bg-success/10",
    numeral: "text-success",
    caption: "Least acute",
  },
};

// Neutral fallback so the lookup is total under noUncheckedIndexedAccess (the five
// ESI_LEVELS always have a matching entry; this only guards the type).
const ACUITY_FALLBACK: AcuityStyle = {
  accent: "bg-muted-foreground/50",
  selectedTile: "border-border ring-ring/40 bg-muted/60",
  numeral: "text-foreground",
  caption: "",
};

function acuityFor(level: number): AcuityStyle {
  return ACUITY[level] ?? ACUITY_FALLBACK;
}

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
    <fieldset className="space-y-2" aria-label="ESI level" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-muted-foreground">
        Assign an ESI level
      </legend>
      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="ESI level">
        {ESI_LEVELS.map((meta) => {
          const checked = value === meta.level;
          const acuity = acuityFor(meta.level);
          return (
            <button
              key={meta.level}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              data-level={meta.level}
              onClick={() => onSelect(meta.level)}
              className={cn(
                "group relative flex w-full items-center gap-4 overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
                checked
                  ? cn("ring-2", acuity.selectedTile)
                  : "border-border hover:border-foreground/20 hover:bg-accent/40",
              )}
            >
              {/* Acuity rail — pairs the color with position; not the only cue. */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 w-1.5 transition-opacity",
                  acuity.accent,
                  checked ? "opacity-100" : "opacity-50 group-hover:opacity-80",
                )}
              />
              <span className="flex min-w-[5.5rem] flex-col items-center justify-center pl-1.5">
                <span
                  className={cn(
                    "text-lg font-bold leading-none tracking-tight",
                    acuity.numeral,
                  )}
                >
                  ESI {meta.level}
                </span>
                <span className="mt-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {acuity.caption}
                </span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {meta.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {meta.descriptor}
                </span>
              </span>
              {checked ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
                    acuity.selectedTile,
                    acuity.numeral,
                  )}
                >
                  Selected
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
