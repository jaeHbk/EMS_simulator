// Single DOM tooltip positioned at the cursor; driven by useObjectTooltip.

import { useTooltipStore } from '../../three/interaction/tooltipStore';

export function ObjectTooltip() {
  const { visible, name, hint, x, y } = useTooltipStore();
  if (!visible) return null;
  return (
    <div
      className="object-tooltip"
      style={{ left: x + 14, top: y + 14 }}
      role="presentation"
    >
      <div className="object-tooltip__name">{name}</div>
      {hint && <div className="object-tooltip__hint">{hint}</div>}
    </div>
  );
}
