// Top-level grid. Owns layout only; every interactive piece is a slot.
// Layout (≥ 1280):
//   row 1: top bar (48px)
//   row 2: left rail (auto) | scene (1fr) | right rail (auto)
//   row 3: alarm banner (auto)
// Below 1280 the right rail narrows; below 768 the left rail collapses to a
// drawer.
//
// A11y: a skip-link at the very top jumps focus to the main scene region
// for keyboard users. The right rail's accessible name comes from the
// MonitorShell's <section aria-label> — the outer <aside> stays unnamed
// to avoid duplicate landmark labels.

import type { ReactNode } from 'react';

interface Props {
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
}

export function AppShell({ top, left, center, right, bottom }: Props) {
  return (
    <div className="shell">
      <a className="visually-hidden" href="#scene-main">
        Skip to main content
      </a>
      <header className="shell__top">{top}</header>
      <aside className="shell__left" aria-label="Equipment and action log">
        {left}
      </aside>
      <main id="scene-main" className="shell__center">{center}</main>
      <aside className="shell__right">{right}</aside>
      <section className="shell__bottom" aria-label="Alarms and instructor controls">
        {bottom}
      </section>
    </div>
  );
}
