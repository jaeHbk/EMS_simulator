// Collapsible left rail. Today it's just a placeholder; week 3 fills it
// with the equipment tray and action log. Collapse state persists in
// localStorage so the user's preference survives reloads.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ems.leftrail.collapsed.v1';

export function LeftRail() {
  const [collapsed, setCollapsed] = useState<boolean>(() => readPersisted());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // localStorage may be disabled (private mode, quota); preference
      // simply doesn't persist — not worth surfacing.
    }
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
            <p className="leftrail__hint">Equipment tray lands in week 3.</p>
          </section>
          <section className="leftrail__section">
            <h2>Action Log</h2>
            <p className="leftrail__hint">Action log lands in week 3.</p>
          </section>
        </div>
      )}
    </div>
  );
}

function readPersisted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
