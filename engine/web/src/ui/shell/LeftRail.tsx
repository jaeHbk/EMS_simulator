import { useEffect, useState } from 'react';
import { postAction, useActionsStore, type ActionRecord } from '../../lib/actions';
import { EQUIPMENT, type EquipmentItem } from '../../three/equipment/registry';
import { useAttachedEquipment } from '../../lib/useInterventions';

const STORAGE_KEY = 'ems.leftrail.collapsed.v1';

export function LeftRail() {
  const [collapsed, setCollapsed] = useState<boolean>(() => readPersisted());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch { /* noop */ }
  }, [collapsed]);

  return (
    <div className={`leftrail ${collapsed ? 'leftrail--collapsed' : ''}`}>
      <button
        type="button"
        className="leftrail__toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand left rail' : 'Collapse left rail'}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? '›' : '‹'}
      </button>
      {!collapsed && (
        <div className="leftrail__body">
          <section className="leftrail__section">
            <h2>Equipment</h2>
            <EquipmentPanel />
          </section>
          <section className="leftrail__section">
            <h2>Action Log</h2>
            <ActionLog />
          </section>
        </div>
      )}
    </div>
  );
}

function EquipmentPanel() {
  const attached = useAttachedEquipment();

  return (
    <div className="eq-panel">
      {EQUIPMENT.map((item) => (
        <EquipmentButton key={item.id} item={item} isAttached={attached.has(item.id)} />
      ))}
    </div>
  );
}

function EquipmentButton({ item, isAttached }: { item: EquipmentItem; isAttached: boolean }) {
  const [firing, setFiring] = useState(false);

  const handleClick = (): void => {
    if (isAttached) return;
    setFiring(true);
    void postAction({
      action_type: 'apply_equipment',
      params: item.defaultParams,
    });
    setTimeout(() => setFiring(false), 600);
  };

  return (
    <button
      type="button"
      className={`eq-btn ${isAttached ? 'eq-btn--attached' : ''} ${firing ? 'eq-btn--firing' : ''}`}
      onClick={handleClick}
      disabled={isAttached}
      title={`${item.label} [${item.hotkey.toUpperCase()}]`}
    >
      <span className="eq-btn__icon">{equipmentIcon(item.id)}</span>
      <span className="eq-btn__label">{item.label}</span>
      <span className="eq-btn__status">
        {isAttached ? '✓ Applied' : `[${item.hotkey.toUpperCase()}]`}
      </span>
    </button>
  );
}

function equipmentIcon(id: string): string {
  const icons: Record<string, string> = {
    nrb: '🫁',
    bvm: '💨',
    iv_line: '💉',
    defib_pads: '⚡',
    drug_box: '💊',
    oxygen_tank: '🫧',
    intubation_kit: '🔧',
  };
  return icons[id] ?? '•';
}

function ActionLog() {
  const version = useActionsStore((s) => s.version);
  const records = useActionsStore((s) => s.records);
  const [entries, setEntries] = useState<ActionRecord[]>([]);

  useEffect(() => {
    const arr = Array.from(records.values())
      .sort((a, b) => b.sentAtMs - a.sentAtMs)
      .slice(0, 20);
    setEntries(arr);
  }, [version, records]);

  if (entries.length === 0) {
    return <p className="leftrail__hint">No actions yet. Click equipment to apply.</p>;
  }

  return (
    <div className="action-log">
      {entries.map((rec) => (
        <div key={rec.action_id} className={`action-log__entry action-log__entry--${rec.status}`}>
          <span className="action-log__dot" />
          <span className="action-log__text">
            {friendlyAction(rec.action_type, rec.params)}
          </span>
          <span className="action-log__time">
            {formatRelativeTime(rec.sentAtMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

function friendlyAction(type: string, params: unknown): string {
  if (type === 'apply_equipment' && params && typeof params === 'object') {
    const p = params as Record<string, unknown>;
    const eq = EQUIPMENT.find((e) => e.id === p.equipment);
    return eq?.label ?? String(p.equipment ?? type);
  }
  return type;
}

function formatRelativeTime(ms: number): string {
  const diff = Math.round((Date.now() - ms) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function readPersisted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
