# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-run onboarding wizard, fix the occluded scenario picker, and add four direct-interaction features to the 3D scene (assessment hotspots, equipment drag & detach, camera presets, focusable monitor + tooltips).

**Architecture:** Three independent frontend slices in `engine/web/`. Each slice is independently shippable and committed separately. Pure logic (`.ts`) is built test-first with vitest; `.tsx`/CSS is built then verified in a real browser (Playwright + system Chrome `channel:'chrome'`). Frame data is read imperatively from `useMonitorStore.getState().latest` (the 50 Hz rule); no feature subscribes a React component to the frame feed. No new npm dependencies.

**Tech Stack:** React 18, @react-three/fiber 8, @react-three/drei, three 0.171, zustand 4, TypeScript 5.7 (strict + `noUncheckedIndexedAccess`), Vite 6, Vitest 2 (node env, `.ts` tests only).

---

## Critical constraints (do not violate)

- **Test environment is `node` and matches only `src/**/*.test.ts`** (see `vitest.config.ts`). Write tests as pure-function / zustand-`getState()` tests in `.ts` files. Do NOT write `.tsx` render tests or assume jsdom/localStorage. In node, `typeof window === 'undefined'`, so localStorage persistence is a no-op during tests — test state transitions, not persistence I/O.
- **50 Hz rule:** never put `VitalsFrame` data into React state. Read `useMonitorStore.getState().latest` inside event handlers / `useFrame`.
- **Honesty:** the backend is a fixed CSV trace; actions never change vitals. Every derived finding is computed from the live frame; static notes are explicitly labeled `source: 'static'`.
- **No new npm deps.** Camera tweens use a `useFrame` lerp; drag uses raw R3F pointer events.
- **Camera safety:** the eye must stay inside the sealed compartment box (prior bug). All camera presets are bounds-checked by a unit test.
- **A11y parity:** every new 3D interaction keeps a DOM/keyboard path via the existing drei `<Html>` button pattern (`equipment-a11y__btn`).

## File structure (what gets created/modified)

```
Slice A — scenario picker visibility
  M engine/web/src/styles.css                      (.shell__top stacking context)

Slice B — onboarding wizard
  C engine/web/src/ui/onboarding/steps.ts          step content (pure data)
  C engine/web/src/ui/onboarding/steps.test.ts
  C engine/web/src/ui/onboarding/useOnboarding.ts  zustand + localStorage flag
  C engine/web/src/ui/onboarding/useOnboarding.test.ts
  C engine/web/src/ui/onboarding/OnboardingWizard.tsx  native <dialog> wizard
  C engine/web/src/ui/onboarding/HelpButton.tsx    top-bar "?" reopen button
  M engine/web/src/ui/shell/TopBar.tsx             mount HelpButton
  M engine/web/src/App.tsx                         mount wizard + auto-open
  M engine/web/src/styles.css                      wizard styles

Slice C — 3D interaction
  C engine/web/src/three/interaction/orbitBounds.ts        shared ORBIT/CABIN consts
  C engine/web/src/three/interaction/cameraPresets.ts      presets + presetToPosition
  C engine/web/src/three/interaction/cameraPresets.test.ts
  C engine/web/src/three/interaction/cameraStore.ts        DOM↔Canvas preset bridge
  C engine/web/src/three/interaction/CameraRig.tsx         useFrame lerp controller
  C engine/web/src/three/interaction/tooltipStore.ts       hover-name bridge
  C engine/web/src/three/interaction/useObjectTooltip.ts   pointer handlers factory
  C engine/web/src/three/interaction/assessment/findings.ts       deriveFinding (pure)
  C engine/web/src/three/interaction/assessment/findings.test.ts
  C engine/web/src/three/interaction/assessment/hotspots.ts       region anchors
  C engine/web/src/three/interaction/assessment/assessmentStore.ts
  C engine/web/src/three/interaction/assessment/assessmentStore.test.ts
  C engine/web/src/three/interaction/assessment/HotspotMarker.tsx
  C engine/web/src/three/interaction/assessment/AssessmentCallout.tsx
  C engine/web/src/three/interaction/assessment/PatientHotspots.tsx
  C engine/web/src/ui/scene/CameraBar.tsx          bottom-center preset pill (DOM)
  C engine/web/src/ui/scene/AssessmentLog.tsx       docked findings panel (DOM)
  C engine/web/src/ui/scene/ObjectTooltip.tsx       single DOM tooltip
  M engine/web/src/lib/actions.ts                  attachedFromRecords + remove support
  M engine/web/src/lib/actions.test.ts             tests for the above
  M engine/web/src/lib/useInterventions.ts         useAttachedEquipment uses helper
  M engine/web/src/three/equipment/PickableMesh.tsx  drag + detach handle
  M engine/web/src/three/equipment/EquipmentTray.tsx detach handler + draggable flag
  M engine/web/src/three/equipment/registry.ts     add `draggable` field
  M engine/web/src/three/Scene.tsx                 import ORBIT, mount CameraRig/hotspots, monitor click
  M engine/web/src/three/Monitor3D.tsx             accept onFocus/tooltip props OR wrapped in Scene
  M engine/web/src/ui/shell/SceneSlot.tsx          mount CameraBar/AssessmentLog/ObjectTooltip
  M engine/web/src/styles.css                      scene-overlay + hotspot styles
```

---

# SLICE A — Scenario picker visibility (CSS only)

### Task A1: Give the top bar a stacking context above the scene

**Files:**
- Modify: `engine/web/src/styles.css` (the `.shell__top { … }` rule, currently at lines ~125-132)

- [ ] **Step 1: Reproduce the bug in a browser (baseline screenshot)**

Start the app in two terminals:
- `cargo run --release -p sim-server -- serve --port 8080`
- `cd engine/web && npm run dev`  (Vite on :5173, proxies WS to :8080)

The Playwright harness uses system Chrome via the npx-cached playwright
(no browser download needed): import path
`/Users/jaehunb/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js`,
launch with `chromium.launch({ headless: false, channel: 'chrome' })`. If
that cached path has changed, run `npx playwright --version` once to
re-populate it, or `npm i -D playwright` in `engine/web` and import from
there. Create `/tmp/picker.mjs`:

```js
import pwpkg from '/Users/jaehunb/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pwpkg;
const out = process.argv[2] || '/tmp/picker.png';
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.locator('.scenario-picker__button').click();
await page.waitForTimeout(500);
const popVisible = await page.locator('.scenario-popover').isVisible().catch(() => false);
const box = await page.locator('.scenario-popover').boundingBox().catch(() => null);
// Is the bottom of the popover actually on top? Hit-test its bottom-center point.
let topElTag = 'none';
if (box) {
  topElTag = await page.evaluate(({x,y}) => {
    const el = document.elementFromPoint(x, y);
    return el ? (el.className || el.tagName) : 'none';
  }, { x: box.x + box.width/2, y: box.y + box.height - 6 });
}
console.log('popover visible:', popVisible, '| top element at popover bottom:', topElTag);
await page.screenshot({ path: out });
await browser.close();
```

Run: `node /tmp/picker.mjs /tmp/picker-before.png`
Expected (bug present): the printed "top element at popover bottom" is a `canvas` (the scene), proving occlusion; screenshot shows the lower list rows missing/covered.

- [ ] **Step 2: Apply the fix**

In `engine/web/src/styles.css`, change the `.shell__top` rule to add `position` and `z-index` (keep the existing properties):

```css
.shell__top {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
  background: rgba(6, 11, 20, 0.78);
  backdrop-filter: saturate(140%) blur(8px);
  -webkit-backdrop-filter: saturate(140%) blur(8px);
}
```

- [ ] **Step 3: Verify the fix in the browser**

Run: `node /tmp/picker.mjs /tmp/picker-after.png`
Expected: "top element at popover bottom" now reports a `scenario-…` class (a popover row or the popover container) — NOT `canvas`. The screenshot shows the full list, including bottom rows, rendered above the 3D scene.

- [ ] **Step 4: Confirm no regression to the equipment a11y overlays or settings dialog**

In the same script session (or a quick manual check), confirm: equipment `<Html>` buttons in the scene are still behind the top bar (they should be — `zIndexRange={[0,0]}`), and opening Settings (gear icon) still shows the modal above everything (native `<dialog>` top-layer is unaffected by `z-index`). Visually verify in `/tmp/picker-after.png` that the top bar renders above the canvas.

- [ ] **Step 5: Run the frontend bars**

Run: `cd engine/web && npx tsc -b && npx vitest run`
Expected: tsc clean; 43 tests pass (no test change in this slice).

- [ ] **Step 6: Commit**

```bash
git add engine/web/src/styles.css
git commit -m "fix(web): lift top bar above 3D scene so the scenario picker is usable

The picker popover (z-index:50) was trapped in the top bar's stacking
context; .shell__center/.scene (position:absolute; inset:0) is a later
grid sibling that painted over it. Give .shell__top its own stacking
context (position:relative; z-index:10) so the bar and its popovers
float above the scene canvas. CSS-only."
```

---

# SLICE B — Onboarding wizard

### Task B1: Onboarding step content (pure data, TDD)

**Files:**
- Create: `engine/web/src/ui/onboarding/steps.ts`
- Test: `engine/web/src/ui/onboarding/steps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// engine/web/src/ui/onboarding/steps.test.ts
import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS } from './steps';

describe('ONBOARDING_STEPS', () => {
  it('has five steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(5);
  });

  it('every step has a non-empty id, title, and body', () => {
    for (const s of ONBOARDING_STEPS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique and stable', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'welcome',
      'monitor',
      'scene',
      'treat',
      'scenario',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine/web && npx vitest run src/ui/onboarding/steps.test.ts`
Expected: FAIL — cannot find module `./steps`.

- [ ] **Step 3: Write the implementation**

```ts
// engine/web/src/ui/onboarding/steps.ts
// Onboarding content as pure data so it is unit-testable and stays out of
// the component. Copy is intentionally honest about what is interactive:
// the patient's vitals are a scripted trace; equipment + assessment read
// that live stream but do not change physiology yet.

export interface OnboardingStep {
  id: string;
  /** Emoji glyph shown in the step header. */
  icon: string;
  title: string;
  /** Body copy. May contain inline <span class="kbd"> markup. */
  body: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'welcome',
    icon: '🚑',
    title: 'Welcome to the EMS Simulator',
    body: "You're the medic in the back of a parked ambulance. A live patient is in front of you and their vital signs stream in real time at 50 Hz. This quick tour shows the four things you can do.",
  },
  {
    id: 'monitor',
    icon: '💓',
    title: 'Read the vitals monitor',
    body: 'On the right, a clinical monitor shows ECG, pleth, and capnography waveforms plus HR, SpO₂, RR, ETCO₂, BP, and temperature. Watch them change as the patient deteriorates — alarms appear along the bottom when a vital crosses a threshold.',
  },
  {
    id: 'scene',
    icon: '🧍',
    title: 'Move around the patient',
    body: 'The center panel is a live 3D scene. Drag to orbit and scroll to zoom. Use the camera buttons along the bottom to jump to the airway, the bedside monitor, or a full-body view — and reset anytime.',
  },
  {
    id: 'treat',
    icon: '🩺',
    title: 'Treat and assess',
    body: 'Click equipment on the bench (or press <span class="kbd">N</span> <span class="kbd">B</span> <span class="kbd">I</span> <span class="kbd">D</span>) to apply it — or drag it onto the patient. Click body regions like the chest, wrist, or eyes to reveal assessment findings drawn from the live vitals.',
  },
  {
    id: 'scenario',
    icon: '📋',
    title: 'Scenario and help',
    body: 'The scenario name sits in the top bar — open it to see the chief complaint and timeline. Reopen this tour anytime from the <span class="kbd">?</span> Help button. Ready when you are.',
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine/web && npx vitest run src/ui/onboarding/steps.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/web/src/ui/onboarding/steps.ts engine/web/src/ui/onboarding/steps.test.ts
git commit -m "feat(web): onboarding step content as pure data"
```

---

### Task B2: Onboarding store + first-run flag (TDD)

**Files:**
- Create: `engine/web/src/ui/onboarding/useOnboarding.ts`
- Test: `engine/web/src/ui/onboarding/useOnboarding.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// engine/web/src/ui/onboarding/useOnboarding.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { useOnboarding } from './useOnboarding';

describe('useOnboarding store', () => {
  beforeEach(() => {
    // Reset to a known state between tests (node env: no persistence).
    useOnboarding.setState({ isOpen: false, completed: false });
  });

  it('open() opens the wizard', () => {
    useOnboarding.getState().open();
    expect(useOnboarding.getState().isOpen).toBe(true);
  });

  it('close() closes without marking completed', () => {
    useOnboarding.setState({ isOpen: true, completed: false });
    useOnboarding.getState().close();
    expect(useOnboarding.getState().isOpen).toBe(false);
    expect(useOnboarding.getState().completed).toBe(false);
  });

  it('markCompleted() closes and sets completed', () => {
    useOnboarding.setState({ isOpen: true, completed: false });
    useOnboarding.getState().markCompleted();
    expect(useOnboarding.getState().isOpen).toBe(false);
    expect(useOnboarding.getState().completed).toBe(true);
  });

  it('reopen() opens even after completion, without clearing the flag', () => {
    useOnboarding.setState({ isOpen: false, completed: true });
    useOnboarding.getState().reopen();
    expect(useOnboarding.getState().isOpen).toBe(true);
    expect(useOnboarding.getState().completed).toBe(true);
  });

  it('shouldAutoOpen is true only when not completed', () => {
    expect(useOnboarding.getState().shouldAutoOpen()).toBe(true);
    useOnboarding.getState().markCompleted();
    expect(useOnboarding.getState().shouldAutoOpen()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine/web && npx vitest run src/ui/onboarding/useOnboarding.test.ts`
Expected: FAIL — cannot find module `./useOnboarding`.

- [ ] **Step 3: Write the implementation**

```ts
// engine/web/src/ui/onboarding/useOnboarding.ts
// First-run onboarding state. Persistence mirrors useSettings: a tiny
// hand-rolled localStorage read on init + write on change (no persist
// middleware, to keep the bundle lean). Guarded for the node test env
// where `window` is undefined.

import { create } from 'zustand';

const STORAGE_KEY = 'ems.onboarding.v1';

function loadCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { completed?: unknown }).completed === true
    );
  } catch {
    return false;
  }
}

function persistCompleted(completed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed }));
  } catch {
    // ignore — quota / private mode
  }
}

interface OnboardingState {
  isOpen: boolean;
  completed: boolean;
  open: () => void;
  close: () => void;
  /** Close + remember that the user finished/skipped the tour. */
  markCompleted: () => void;
  /** Open regardless of completion (Help button); does not clear the flag. */
  reopen: () => void;
  /** Whether the wizard should auto-open on app mount. */
  shouldAutoOpen: () => boolean;
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  isOpen: false,
  completed: loadCompleted(),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  markCompleted: () => {
    set({ isOpen: false, completed: true });
    persistCompleted(true);
  },
  reopen: () => set({ isOpen: true }),
  shouldAutoOpen: () => !get().completed,
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine/web && npx vitest run src/ui/onboarding/useOnboarding.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/web/src/ui/onboarding/useOnboarding.ts engine/web/src/ui/onboarding/useOnboarding.test.ts
git commit -m "feat(web): onboarding store with localStorage first-run flag"
```

---

### Task B3: The wizard component + Help button + wiring

**Files:**
- Create: `engine/web/src/ui/onboarding/OnboardingWizard.tsx`
- Create: `engine/web/src/ui/onboarding/HelpButton.tsx`
- Modify: `engine/web/src/ui/shell/TopBar.tsx`
- Modify: `engine/web/src/App.tsx`
- Modify: `engine/web/src/styles.css`

- [ ] **Step 1: Write `OnboardingWizard.tsx`**

```tsx
// engine/web/src/ui/onboarding/OnboardingWizard.tsx
// Multi-step welcome tour. Native <dialog> + showModal() (same pattern as
// SettingsDialog) so the browser gives us focus-trap, Esc, and the
// ::backdrop scrim for free. Step content comes from steps.ts.

import { useEffect, useRef, useState } from 'react';
import { ONBOARDING_STEPS } from './steps';
import { useOnboarding } from './useOnboarding';

export function OnboardingWizard() {
  const ref = useRef<HTMLDialogElement | null>(null);
  const isOpen = useOnboarding((s) => s.isOpen);
  const markCompleted = useOnboarding((s) => s.markCompleted);
  const [stepIndex, setStepIndex] = useState(0);

  // Open/close the native dialog in sync with the store.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      setStepIndex(0);
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Arrow-key navigation while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight') setStepIndex((i) => Math.min(ONBOARDING_STEPS.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setStepIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const step = ONBOARDING_STEPS[stepIndex];
  if (!step) return null;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  return (
    <dialog
      ref={ref}
      className="onboarding"
      onClose={markCompleted}
      onCancel={markCompleted}
      aria-labelledby="onboarding-title"
    >
      <button
        type="button"
        className="onboarding__skip"
        onClick={markCompleted}
        aria-label="Skip the tour"
      >
        Skip ✕
      </button>

      <div className="onboarding__icon" aria-hidden="true">{step.icon}</div>
      <div className="onboarding__step-k">
        Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
      </div>
      <h2 id="onboarding-title">{step.title}</h2>
      {/* Body copy is trusted, author-controlled content from steps.ts;
          it contains only <span class="kbd"> markup. */}
      <p dangerouslySetInnerHTML={{ __html: step.body }} />

      <div className="onboarding__dots" aria-hidden="true">
        {ONBOARDING_STEPS.map((s, n) => (
          <span key={s.id} className={`onboarding__dot ${n === stepIndex ? 'is-on' : ''}`} />
        ))}
      </div>

      <div className="onboarding__row">
        <label className="onboarding__dont">
          <input
            type="checkbox"
            onChange={(e) => {
              if (e.target.checked) markCompleted();
            }}
          />
          Don&apos;t show again
        </label>
        <div className="onboarding__btns">
          <button
            type="button"
            className="onboarding__nav"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="onboarding__nav onboarding__nav--primary"
            onClick={() => {
              if (isLast) markCompleted();
              else setStepIndex((i) => i + 1);
            }}
          >
            {isLast ? 'Start →' : 'Next →'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Write `HelpButton.tsx`**

```tsx
// engine/web/src/ui/onboarding/HelpButton.tsx
// Top-bar "?" button that reopens the onboarding tour on demand.

import { useOnboarding } from './useOnboarding';

export function HelpButton() {
  const reopen = useOnboarding((s) => s.reopen);
  return (
    <button
      type="button"
      className="topbar__gear"
      onClick={reopen}
      aria-label="Open the help tour"
      title="Help tour"
    >
      ?
    </button>
  );
}
```

- [ ] **Step 3: Mount the Help button in the top bar**

In `engine/web/src/ui/shell/TopBar.tsx`, add the import and render `<HelpButton />` before `<SettingsButton />`:

```tsx
import { ConnectionStatus } from '../ConnectionStatus';
import { ScenarioPicker } from '../scenario/ScenarioPicker';
import { SettingsButton } from '../settings/SettingsButton';
import { HelpButton } from '../onboarding/HelpButton';
import { SimClock } from './SimClock';
import { useRunMode, useRateMultiplier } from '../instructor/useRunControls';
import type { TopBarSlotProps } from './Slot';

export function TopBar({ status }: TopBarSlotProps) {
  const mode = useRunMode();
  const rate = useRateMultiplier();

  return (
    <div className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <h1>EMS Simulator</h1>
      </div>
      <div className="topbar__center">
        <ScenarioPicker status={status} />
        <RunStatePill mode={mode} rate={rate} />
        <SimClock />
      </div>
      <div className="topbar__right">
        <ConnectionStatus status={status} />
        <HelpButton />
        <SettingsButton />
      </div>
    </div>
  );
}
```

(Leave the `RunStatePill` function below unchanged.)

- [ ] **Step 4: Mount the wizard + auto-open on first run in `App.tsx`**

```tsx
// engine/web/src/App.tsx
import { useEffect } from 'react';
import { useVitalsStream } from './lib/stream';
import { useInterventionsWatcher } from './lib/useInterventions';
import { useEquipmentHotkeys } from './lib/useKeyboard';
import { AlarmSlot } from './ui/shell/AlarmSlot';
import { AppShell } from './ui/shell/AppShell';
import { LeftRail } from './ui/shell/LeftRail';
import { MonitorSlot } from './ui/shell/MonitorSlot';
import { SceneSlot } from './ui/shell/SceneSlot';
import { TopBar } from './ui/shell/TopBar';
import { OnboardingWizard } from './ui/onboarding/OnboardingWizard';
import { useOnboarding } from './ui/onboarding/useOnboarding';

export function App() {
  const { status } = useVitalsStream();
  useInterventionsWatcher();
  useEquipmentHotkeys();

  // Auto-open the tour on genuine first run only.
  const open = useOnboarding((s) => s.open);
  useEffect(() => {
    if (useOnboarding.getState().shouldAutoOpen()) open();
  }, [open]);

  return (
    <>
      <AppShell
        top={<TopBar status={status} />}
        left={<LeftRail />}
        center={<SceneSlot />}
        right={<MonitorSlot status={status} />}
        bottom={<AlarmSlot />}
      />
      <OnboardingWizard />
    </>
  );
}
```

- [ ] **Step 5: Add wizard styles to `styles.css`**

Append this block to `engine/web/src/styles.css` (after the settings-dialog rules; reuse the `.kbd` style if one exists — if not, this defines it):

```css
/* ─── Onboarding wizard ──────────────────────────────────────────────── */

.onboarding {
  width: 430px;
  max-width: 92vw;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-3);
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
  color: var(--fg);
  box-shadow: var(--shadow-3);
  padding: 22px 22px 16px;
}
.onboarding::backdrop {
  background: rgba(3, 6, 12, 0.72);
  backdrop-filter: blur(3px);
}
.onboarding__skip {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: var(--fg-mute);
  font-size: var(--fs-12);
  cursor: pointer;
}
.onboarding__skip:hover { color: var(--fg-dim); }
.onboarding__icon {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-size: 1.3rem;
  background: rgba(52, 211, 163, 0.12);
  border: 1px solid rgba(52, 211, 163, 0.35);
  margin-bottom: 12px;
}
.onboarding__step-k {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 6px;
}
.onboarding h2 { margin: 0 0 8px; font-size: 1.18rem; }
.onboarding p { margin: 0; color: var(--fg-dim); font-size: var(--fs-14); line-height: var(--lh-body); }
.onboarding .kbd,
.kbd {
  font-family: var(--font-mono);
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-1);
  padding: 1px 6px;
  font-size: 0.74rem;
  color: var(--fg);
}
.onboarding__dots { display: flex; gap: 7px; margin-top: 18px; }
.onboarding__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line-strong); transition: all var(--dur-2) var(--ease-std); }
.onboarding__dot.is-on { background: var(--accent); width: 20px; border-radius: 4px; }
.onboarding__row { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; gap: 10px; }
.onboarding__dont { display: flex; align-items: center; gap: 6px; color: var(--fg-mute); font-size: var(--fs-12); }
.onboarding__btns { display: flex; gap: 8px; margin-left: auto; }
.onboarding__nav {
  font-family: var(--font-sans);
  font-size: var(--fs-13);
  padding: 8px 16px;
  border-radius: var(--radius-2);
  cursor: pointer;
  border: 1px solid var(--line-strong);
  background: var(--bg-3);
  color: var(--fg);
}
.onboarding__nav:hover { border-color: var(--accent); }
.onboarding__nav:disabled { opacity: 0.35; cursor: default; }
.onboarding__nav--primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #04110d;
  font-weight: 650;
}
```

- [ ] **Step 6: Type-check and run unit tests**

Run: `cd engine/web && npx tsc -b && npx vitest run`
Expected: tsc clean; all tests pass (43 existing + 8 new from B1/B2).

- [ ] **Step 7: Browser-verify first-run, navigation, reopen, and persistence**

Create `/tmp/onboarding.mjs`:

```js
import pwpkg from '/Users/jaehunb/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pwpkg;
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const dlgOpen = await page.evaluate(() => !!document.querySelector('dialog.onboarding')?.open);
console.log('first-run dialog open:', dlgOpen); // expect true
await page.screenshot({ path: '/tmp/onb-1.png' });
// step forward to last, then Start
for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: /Next|Start/ }).click(); await page.waitForTimeout(200); }
await page.getByRole('button', { name: /Start/ }).click();
await page.waitForTimeout(400);
const afterStart = await page.evaluate(() => !!document.querySelector('dialog.onboarding')?.open);
console.log('after Start, dialog open:', afterStart); // expect false
// reopen via Help
await page.getByRole('button', { name: /Open the help tour/ }).click();
await page.waitForTimeout(300);
const reopened = await page.evaluate(() => !!document.querySelector('dialog.onboarding')?.open);
console.log('reopened via Help:', reopened); // expect true
await page.getByRole('button', { name: /Skip the tour/ }).click();
// reload — should NOT auto-open (completed flag persisted)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const autoAfterReload = await page.evaluate(() => !!document.querySelector('dialog.onboarding')?.open);
console.log('auto-open after reload (persisted):', autoAfterReload); // expect false
await browser.close();
```

Run: `node /tmp/onboarding.mjs`
Expected output:
```
first-run dialog open: true
after Start, dialog open: false
reopened via Help: true
auto-open after reload (persisted): false
```
Review `/tmp/onb-1.png`: the wizard renders centered over the app with the EMS palette, dot indicator, Back disabled on step 1, Next primary.

- [ ] **Step 8: Commit**

```bash
git add engine/web/src/ui/onboarding/OnboardingWizard.tsx engine/web/src/ui/onboarding/HelpButton.tsx engine/web/src/ui/shell/TopBar.tsx engine/web/src/App.tsx engine/web/src/styles.css
git commit -m "feat(web): first-run onboarding wizard + reopenable Help button

Native <dialog> 5-step tour (Next/Back/Skip, dot progress, Don't-show-
again). Auto-opens on first visit via the ems.onboarding.v1 localStorage
flag; reopenable anytime from a ? button in the top bar."
```

---

# SLICE C — Direct 3D interaction

### Task C1: Shared orbit/cabin bounds + refactor Scene to use them

**Files:**
- Create: `engine/web/src/three/interaction/orbitBounds.ts`
- Modify: `engine/web/src/three/Scene.tsx`

- [ ] **Step 1: Create the shared bounds module**

```ts
// engine/web/src/three/interaction/orbitBounds.ts
// Single source of truth for orbit limits and the interior shell bounds.
// Scene.tsx, the camera presets, and the preset-bounds guard test all
// import these so they cannot drift — and so the prior "camera outside
// the sealed box → flat grey frame" bug can never reappear.

export const ORBIT = {
  minDistance: 1.2,
  maxDistance: 1.7,
  minPolar: Math.PI / 3, // 60°
  maxPolar: Math.PI / 2.05, // ~87.8°
  minAzimuth: Math.PI / 3, // 60°
  maxAzimuth: Math.PI * 0.6, // 108°
} as const;

// AmbulanceInterior builds a sealed box: x∈[-1.8,1.8], z∈[-1.0,1.0],
// y∈[0,2.1]. Camera + look-at must stay strictly inside, with margin.
export const CABIN = {
  xMin: -1.7,
  xMax: 1.7,
  yMin: 0.2,
  yMax: 1.95,
  zMin: -0.9,
  zMax: 0.9,
} as const;
```

- [ ] **Step 2: Refactor `Scene.tsx` to import the constants (no behavior change)**

In `engine/web/src/three/Scene.tsx`, add `import { ORBIT } from './interaction/orbitBounds';` and replace the hard-coded `OrbitControls` numeric props with the constants:

```tsx
      <OrbitControls
        target={[0, 1.0, 0]}
        enablePan={false}
        minDistance={ORBIT.minDistance}
        maxDistance={ORBIT.maxDistance}
        minPolarAngle={ORBIT.minPolar}
        maxPolarAngle={ORBIT.maxPolar}
        minAzimuthAngle={ORBIT.minAzimuth}
        maxAzimuthAngle={ORBIT.maxAzimuth}
        makeDefault
      />
```

- [ ] **Step 3: Type-check**

Run: `cd engine/web && npx tsc -b`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engine/web/src/three/interaction/orbitBounds.ts engine/web/src/three/Scene.tsx
git commit -m "refactor(web): extract orbit/cabin bounds to a shared module"
```

---

### Task C2: Camera presets + position math (TDD)

**Files:**
- Create: `engine/web/src/three/interaction/cameraPresets.ts`
- Test: `engine/web/src/three/interaction/cameraPresets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// engine/web/src/three/interaction/cameraPresets.test.ts
import { describe, expect, it } from 'vitest';
import { CABIN, ORBIT } from './orbitBounds';
import { CAMERA_PRESETS, PRESET_ORDER, presetToPosition } from './cameraPresets';

describe('camera presets', () => {
  it('defines exactly the four presets in display order', () => {
    expect(PRESET_ORDER).toEqual(['airway', 'monitor', 'fullBody', 'reset']);
    for (const id of PRESET_ORDER) {
      expect(CAMERA_PRESETS[id]).toBeDefined();
    }
  });

  it('every preset spherical is within the orbit bounds', () => {
    for (const id of PRESET_ORDER) {
      const p = CAMERA_PRESETS[id];
      expect(p.distance).toBeGreaterThanOrEqual(ORBIT.minDistance);
      expect(p.distance).toBeLessThanOrEqual(ORBIT.maxDistance);
      expect(p.polar).toBeGreaterThanOrEqual(ORBIT.minPolar);
      expect(p.polar).toBeLessThanOrEqual(ORBIT.maxPolar);
      expect(p.azimuth).toBeGreaterThanOrEqual(ORBIT.minAzimuth);
      expect(p.azimuth).toBeLessThanOrEqual(ORBIT.maxAzimuth);
    }
  });

  it('every preset look-at target is inside the cabin', () => {
    for (const id of PRESET_ORDER) {
      const [x, y, z] = CAMERA_PRESETS[id].target;
      expect(x).toBeGreaterThanOrEqual(CABIN.xMin);
      expect(x).toBeLessThanOrEqual(CABIN.xMax);
      expect(y).toBeGreaterThanOrEqual(CABIN.yMin);
      expect(y).toBeLessThanOrEqual(CABIN.yMax);
      expect(z).toBeGreaterThanOrEqual(CABIN.zMin);
      expect(z).toBeLessThanOrEqual(CABIN.zMax);
    }
  });

  it('every preset camera POSITION is inside the cabin (no wall clipping)', () => {
    for (const id of PRESET_ORDER) {
      const [x, y, z] = presetToPosition(CAMERA_PRESETS[id]);
      expect(x).toBeGreaterThanOrEqual(CABIN.xMin);
      expect(x).toBeLessThanOrEqual(CABIN.xMax);
      expect(y).toBeGreaterThanOrEqual(CABIN.yMin);
      expect(y).toBeLessThanOrEqual(CABIN.yMax);
      expect(z).toBeGreaterThanOrEqual(CABIN.zMin);
      expect(z).toBeLessThanOrEqual(CABIN.zMax);
    }
  });

  it('presetToPosition matches the three.js spherical convention', () => {
    // distance 1 straight out along +Z when azimuth/polar put us there:
    // polar=90° (π/2), azimuth=0 → position = target + (0,0,1)
    const pos = presetToPosition({
      id: 'reset', label: 't', target: [0, 0, 0],
      distance: 1, azimuth: 0, polar: Math.PI / 2,
    });
    expect(pos[0]).toBeCloseTo(0, 5);
    expect(pos[1]).toBeCloseTo(0, 5);
    expect(pos[2]).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine/web && npx vitest run src/three/interaction/cameraPresets.test.ts`
Expected: FAIL — cannot find module `./cameraPresets`.

- [ ] **Step 3: Write the implementation**

```ts
// engine/web/src/three/interaction/cameraPresets.ts
// Named camera viewpoints. Each is stored as a spherical pose (distance,
// azimuth, polar) relative to a look-at target, all within ORBIT bounds so
// OrbitControls (makeDefault) accepts the final pose without snapping. The
// guard test asserts both the spherical params and the resulting world
// position stay inside the cabin.

export type PresetId = 'reset' | 'fullBody' | 'airway' | 'monitor';

export interface CameraPreset {
  id: PresetId;
  label: string;
  /** Look-at point, world space. */
  target: [number, number, number];
  /** Orbit distance from target (metres). */
  distance: number;
  /** Azimuth angle (radians), three.js Spherical theta. */
  azimuth: number;
  /** Polar angle (radians) from +Y, three.js Spherical phi. */
  polar: number;
}

// Display order for the camera bar (left → right).
export const PRESET_ORDER: readonly PresetId[] = [
  'airway',
  'monitor',
  'fullBody',
  'reset',
];

export const CAMERA_PRESETS: Record<PresetId, CameraPreset> = {
  // Reset reproduces the (clamped) initial view: pos ≈ [1.42,1.59,0.73].
  reset: {
    id: 'reset', label: 'Reset',
    target: [0, 1.0, 0], distance: 1.7, azimuth: 1.094, polar: 1.218,
  },
  fullBody: {
    id: 'fullBody', label: 'Full body',
    target: [0, 1.05, 0], distance: 1.7, azimuth: 1.1, polar: 1.25,
  },
  airway: {
    id: 'airway', label: 'Airway',
    target: [-0.7, 1.3, 0], distance: 1.2, azimuth: 1.15, polar: 1.2,
  },
  monitor: {
    id: 'monitor', label: 'Monitor',
    target: [-0.9, 1.3, 0.25], distance: 1.35, azimuth: 1.07, polar: 1.3,
  },
};

/** Convert a preset's spherical pose to a world-space camera position,
 *  using three.js' Spherical convention (phi from +Y, theta from +Z). */
export function presetToPosition(p: CameraPreset): [number, number, number] {
  const sinPhi = Math.sin(p.polar);
  return [
    p.target[0] + p.distance * sinPhi * Math.sin(p.azimuth),
    p.target[1] + p.distance * Math.cos(p.polar),
    p.target[2] + p.distance * sinPhi * Math.cos(p.azimuth),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine/web && npx vitest run src/three/interaction/cameraPresets.test.ts`
Expected: PASS (5 tests). If the "position inside cabin" test fails for any preset, nudge that preset's `distance`/`azimuth`/`polar` toward the center of the bounds until it passes (the framing is fine-tuned visually in Task C9).

- [ ] **Step 5: Commit**

```bash
git add engine/web/src/three/interaction/cameraPresets.ts engine/web/src/three/interaction/cameraPresets.test.ts
git commit -m "feat(web): camera presets with bounds-guarded spherical poses"
```

---

### Task C3: Assessment findings derivation (TDD)

**Files:**
- Create: `engine/web/src/three/interaction/assessment/findings.ts`
- Test: `engine/web/src/three/interaction/assessment/findings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// engine/web/src/three/interaction/assessment/findings.test.ts
import { describe, expect, it } from 'vitest';
import type { VitalsFrame } from '../../../lib/stream';
import { deriveFinding } from './findings';

function frame(over: Partial<VitalsFrame>): VitalsFrame {
  return {
    tick: 0, sim_time_s: 0, heart_rate_bpm: 72, systolic_bp_mmhg: 120,
    diastolic_bp_mmhg: 80, respiratory_rate_bpm: 14, spo2_fraction: 0.98,
    etco2_mmhg: 38, temperature_c: 37, interventions: [],
    run_state: { mode: 'running', rate_multiplier: 1, elapsed_s: 0 },
    ...over,
  };
}

describe('deriveFinding', () => {
  it('chest: apneic when RR is zero', () => {
    const f = deriveFinding('chest', frame({ respiratory_rate_bpm: 0 }));
    expect(f.finding).toBe('No breath sounds');
    expect(f.source).toBe('derived');
  });

  it('chest: breath sounds present otherwise', () => {
    const f = deriveFinding('chest', frame({ respiratory_rate_bpm: 16 }));
    expect(f.finding).toBe('Breath sounds present');
    expect(f.detail).toContain('16');
  });

  it('radial: weak when hypoxic or hypotensive', () => {
    expect(deriveFinding('radial', frame({ spo2_fraction: 0.85 })).detail).toMatch(/weak/i);
    expect(deriveFinding('radial', frame({ systolic_bp_mmhg: 80 })).detail).toMatch(/weak/i);
    expect(deriveFinding('radial', frame({})).detail).toMatch(/strong/i);
  });

  it('radial: reports the heart rate', () => {
    expect(deriveFinding('radial', frame({ heart_rate_bpm: 142.4 })).finding).toBe('142 bpm');
  });

  it('skin: cyanotic when hypoxic, pale when hypotensive, else pink', () => {
    expect(deriveFinding('skin', frame({ spo2_fraction: 0.8 })).finding).toMatch(/cyanotic/i);
    expect(deriveFinding('skin', frame({ systolic_bp_mmhg: 80 })).finding).toMatch(/pale/i);
    expect(deriveFinding('skin', frame({})).finding).toMatch(/pink/i);
  });

  it('airway: no air movement when apneic with low ETCO2', () => {
    expect(deriveFinding('airway', frame({ respiratory_rate_bpm: 0, etco2_mmhg: 0 })).finding).toMatch(/no air/i);
    expect(deriveFinding('airway', frame({})).finding).toMatch(/patent/i);
  });

  it('pupils and carotid are labeled static notes', () => {
    expect(deriveFinding('pupils', frame({})).source).toBe('static');
    expect(deriveFinding('carotid', frame({})).source).toBe('static');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine/web && npx vitest run src/three/interaction/assessment/findings.test.ts`
Expected: FAIL — cannot find module `./findings`.

- [ ] **Step 3: Write the implementation**

```ts
// engine/web/src/three/interaction/assessment/findings.ts
// Pure mapping from a live VitalsFrame to a clinical assessment finding.
// "derived" findings are computed from the stream; "static" notes are
// fixed exam observations the scripted trace cannot drive (labeled as such
// so the UI stays honest).

import type { VitalsFrame } from '../../../lib/stream';

export type RegionId =
  | 'chest'
  | 'airway'
  | 'radial'
  | 'skin'
  | 'pupils'
  | 'carotid';

export type FindingSource = 'derived' | 'static';

export interface Finding {
  /** Region + modality, e.g. "Chest · auscultation". */
  title: string;
  /** Headline result, e.g. "No breath sounds". */
  finding: string;
  /** One-line explanation. */
  detail: string;
  source: FindingSource;
}

export function deriveFinding(region: RegionId, frame: VitalsFrame): Finding {
  switch (region) {
    case 'chest': {
      const rr = Math.round(frame.respiratory_rate_bpm);
      if (rr === 0) {
        return {
          title: 'Chest · auscultation',
          finding: 'No breath sounds',
          detail: 'Chest not rising — apneic.',
          source: 'derived',
        };
      }
      return {
        title: 'Chest · auscultation',
        finding: 'Breath sounds present',
        detail: `Equal bilaterally, RR ${rr}/min.`,
        source: 'derived',
      };
    }
    case 'airway': {
      const rr = Math.round(frame.respiratory_rate_bpm);
      if (rr === 0 || frame.etco2_mmhg < 5) {
        return {
          title: 'Airway',
          finding: 'No air movement',
          detail: 'No spontaneous ventilation — airway at risk.',
          source: 'derived',
        };
      }
      return {
        title: 'Airway',
        finding: 'Patent',
        detail: 'Spontaneous air movement present.',
        source: 'derived',
      };
    }
    case 'radial': {
      const hr = Math.round(frame.heart_rate_bpm);
      const weak = frame.spo2_fraction < 0.9 || frame.systolic_bp_mmhg < 90;
      return {
        title: 'Radial pulse',
        finding: `${hr} bpm`,
        detail: weak ? 'Weak, thready.' : 'Strong, regular.',
        source: 'derived',
      };
    }
    case 'skin': {
      if (frame.spo2_fraction < 0.9) {
        return {
          title: 'Skin',
          finding: 'Cyanotic, cool',
          detail: 'Peripheral cyanosis — low SpO₂.',
          source: 'derived',
        };
      }
      if (frame.systolic_bp_mmhg < 90) {
        return {
          title: 'Skin',
          finding: 'Pale, clammy',
          detail: 'Poor perfusion — low BP.',
          source: 'derived',
        };
      }
      return {
        title: 'Skin',
        finding: 'Warm, dry, pink',
        detail: 'Well perfused.',
        source: 'derived',
      };
    }
    case 'pupils':
      return {
        title: 'Pupils',
        finding: 'Equal & reactive',
        detail: 'PERRL — baseline exam note, not driven by live vitals.',
        source: 'static',
      };
    case 'carotid':
      return {
        title: 'Carotid pulse',
        finding: 'Palpable',
        detail: 'Central pulse present — baseline exam note.',
        source: 'static',
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine/web && npx vitest run src/three/interaction/assessment/findings.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/web/src/three/interaction/assessment/findings.ts engine/web/src/three/interaction/assessment/findings.test.ts
git commit -m "feat(web): assessment finding derivation from live vitals (pure)"
```

---

### Task C4: Assessment store (TDD)

**Files:**
- Create: `engine/web/src/three/interaction/assessment/assessmentStore.ts`
- Test: `engine/web/src/three/interaction/assessment/assessmentStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// engine/web/src/three/interaction/assessment/assessmentStore.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { latestByRegion, useAssessmentStore } from './assessmentStore';
import type { Finding } from './findings';

const f = (finding: string): Finding => ({
  title: 't', finding, detail: 'd', source: 'derived',
});

describe('assessmentStore', () => {
  beforeEach(() => useAssessmentStore.getState().clear());

  it('records entries newest-first', () => {
    const { record } = useAssessmentStore.getState();
    record('chest', f('one'), 1);
    record('radial', f('two'), 2);
    const e = useAssessmentStore.getState().entries;
    expect(e[0]?.finding).toBe('two');
    expect(e[1]?.finding).toBe('one');
  });

  it('caps the log at 25 entries', () => {
    const { record } = useAssessmentStore.getState();
    for (let i = 0; i < 40; i++) record('chest', f(`n${i}`), i);
    expect(useAssessmentStore.getState().entries.length).toBe(25);
    expect(useAssessmentStore.getState().entries[0]?.finding).toBe('n39');
  });

  it('latestByRegion returns the most recent per region', () => {
    const { record } = useAssessmentStore.getState();
    record('chest', f('old-chest'), 1);
    record('radial', f('radial'), 2);
    record('chest', f('new-chest'), 3);
    const map = latestByRegion(useAssessmentStore.getState().entries);
    expect(map.get('chest')?.finding).toBe('new-chest');
    expect(map.get('radial')?.finding).toBe('radial');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine/web && npx vitest run src/three/interaction/assessment/assessmentStore.test.ts`
Expected: FAIL — cannot find module `./assessmentStore`.

- [ ] **Step 3: Write the implementation**

```ts
// engine/web/src/three/interaction/assessment/assessmentStore.ts
// Append-only, capped log of assessment findings. The docked AssessmentLog
// reads `entries`; the in-scene callout reads `latestByRegion`. Holds
// assessment findings ONLY — equipment apply/detach stays in the left-rail
// Action Log (no duplication).

import { create } from 'zustand';
import type { Finding, RegionId } from './findings';

const MAX_ENTRIES = 25;

export interface AssessmentEntry extends Finding {
  regionId: RegionId;
  /** Sim time the finding was taken (seconds). */
  atSimTimeS: number;
  /** Monotonic sequence for stable React keys. */
  seq: number;
}

interface AssessmentState {
  entries: AssessmentEntry[];
  seq: number;
  record: (regionId: RegionId, finding: Finding, atSimTimeS: number) => void;
  clear: () => void;
}

export const useAssessmentStore = create<AssessmentState>((set) => ({
  entries: [],
  seq: 0,
  record: (regionId, finding, atSimTimeS) =>
    set((s) => {
      const nextSeq = s.seq + 1;
      const entry: AssessmentEntry = {
        ...finding,
        regionId,
        atSimTimeS,
        seq: nextSeq,
      };
      return { entries: [entry, ...s.entries].slice(0, MAX_ENTRIES), seq: nextSeq };
    }),
  clear: () => set({ entries: [], seq: 0 }),
}));

/** Most-recent entry per region (entries are newest-first). */
export function latestByRegion(
  entries: readonly AssessmentEntry[],
): Map<RegionId, AssessmentEntry> {
  const m = new Map<RegionId, AssessmentEntry>();
  for (const e of entries) if (!m.has(e.regionId)) m.set(e.regionId, e);
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine/web && npx vitest run src/three/interaction/assessment/assessmentStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/web/src/three/interaction/assessment/assessmentStore.ts engine/web/src/three/interaction/assessment/assessmentStore.test.ts
git commit -m "feat(web): capped assessment findings store"
```

---

### Task C5: Equipment attach/detach logic (TDD)

**Files:**
- Modify: `engine/web/src/lib/actions.ts` (add `attachedFromRecords`)
- Modify: `engine/web/src/lib/actions.test.ts`
- Modify: `engine/web/src/lib/useInterventions.ts` (use the helper)
- Modify: `engine/web/src/three/equipment/registry.ts` (add `draggable`)

- [ ] **Step 1: Write the failing test (append to `actions.test.ts`)**

Add this `describe` block to `engine/web/src/lib/actions.test.ts`:

```ts
import { attachedFromRecords, type ActionRecord } from './actions';

describe('attachedFromRecords', () => {
  const rec = (over: Partial<ActionRecord>): ActionRecord => ({
    action_id: Math.random().toString(36).slice(2),
    action_type: 'apply_equipment',
    params: { equipment: 'nrb' },
    status: 'confirmed',
    sentAtMs: 1000,
    ...over,
  });

  it('counts a confirmed apply as attached', () => {
    expect(attachedFromRecords([rec({})]).has('nrb')).toBe(true);
  });

  it('ignores rejected actions', () => {
    expect(attachedFromRecords([rec({ status: 'rejected' })]).has('nrb')).toBe(false);
  });

  it('a later remove wins over an earlier apply', () => {
    const applied = rec({ action_type: 'apply_equipment', sentAtMs: 1000 });
    const removed = rec({ action_type: 'remove_equipment', sentAtMs: 2000 });
    expect(attachedFromRecords([applied, removed]).has('nrb')).toBe(false);
  });

  it('a later apply wins over an earlier remove (re-attach)', () => {
    const removed = rec({ action_type: 'remove_equipment', sentAtMs: 1000 });
    const applied = rec({ action_type: 'apply_equipment', sentAtMs: 2000 });
    expect(attachedFromRecords([removed, applied]).has('nrb')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine/web && npx vitest run src/lib/actions.test.ts`
Expected: FAIL — `attachedFromRecords` is not exported.

- [ ] **Step 3: Implement `attachedFromRecords` in `actions.ts`**

Append to `engine/web/src/lib/actions.ts`:

```ts
/** Reduce a set of action records to the equipment IDs currently attached.
 *  For each equipment, the most-recent non-rejected apply/remove action
 *  wins; attached iff that latest action is an apply. Pure + testable. */
export function attachedFromRecords(
  records: Iterable<ActionRecord>,
): Set<string> {
  const latest = new Map<string, ActionRecord>();
  for (const rec of records) {
    if (
      rec.action_type !== 'apply_equipment' &&
      rec.action_type !== 'remove_equipment'
    ) {
      continue;
    }
    if (rec.status === 'rejected') continue;
    const eq = (rec.params as { equipment?: string } | null)?.equipment;
    if (!eq) continue;
    const prev = latest.get(eq);
    if (!prev || rec.sentAtMs > prev.sentAtMs) latest.set(eq, rec);
  }
  const attached = new Set<string>();
  for (const [eq, rec] of latest) {
    if (rec.action_type === 'apply_equipment') attached.add(eq);
  }
  return attached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd engine/web && npx vitest run src/lib/actions.test.ts`
Expected: PASS (existing 9 + 4 new).

- [ ] **Step 5: Route `useAttachedEquipment` through the helper**

In `engine/web/src/lib/useInterventions.ts`, update the existing import line
`import { useActionsStore } from './actions';` to also import the helper:

```ts
import { attachedFromRecords, useActionsStore } from './actions';
```

Then replace the whole `useAttachedEquipment` function body (the loop) with:

```ts
export function useAttachedEquipment(): Set<string> {
  const records = useActionsStore((s) => s.records);
  return attachedFromRecords(records.values());
}
```

Leave `useInterventionsWatcher` and its `useMonitorStore`/`useEffect`
imports unchanged.

- [ ] **Step 6: Add a `draggable` field to the registry**

In `engine/web/src/three/equipment/registry.ts`, add `draggable: boolean` to the `EquipmentItem` interface (doc: "true for items with a real patient attach point; bedside items are click-only"), then set it per item: `nrb`, `bvm`, `iv_line`, `defib_pads` → `true`; `drug_box`, `oxygen_tank`, `intubation_kit` → `false`. Example for one item:

```ts
  {
    id: 'nrb',
    label: 'Non-rebreather mask',
    attachPoint: 'face',
    trayPosition: [-1.2, BENCH_Y, BENCH_Z],
    attachedPosition: [-0.78, 1.32, 0.0],
    defaultParams: { equipment: 'nrb', attach_point: 'face', fio2: 0.85 },
    hotkey: 'n',
    draggable: true,
  },
```

(Apply the same `draggable` flag to all seven items per the mapping above.)

- [ ] **Step 7: Type-check + full unit run**

Run: `cd engine/web && npx tsc -b && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add engine/web/src/lib/actions.ts engine/web/src/lib/actions.test.ts engine/web/src/lib/useInterventions.ts engine/web/src/three/equipment/registry.ts
git commit -m "feat(web): attach/detach reducer with remove_equipment support

attachedFromRecords picks the most-recent non-rejected apply/remove per
equipment id, so a detach (remove_equipment) reverts the attached state
optimistically. Adds a `draggable` registry flag (bedside items stay
click-only)."
```

---

### Task C6: Camera + tooltip bridges, CameraRig, useObjectTooltip

**Files:**
- Create: `engine/web/src/three/interaction/cameraStore.ts`
- Create: `engine/web/src/three/interaction/tooltipStore.ts`
- Create: `engine/web/src/three/interaction/CameraRig.tsx`
- Create: `engine/web/src/three/interaction/useObjectTooltip.ts`

- [ ] **Step 1: Create the camera bridge store**

```ts
// engine/web/src/three/interaction/cameraStore.ts
// DOM↔Canvas bridge. The CameraBar (DOM, outside the Canvas) requests a
// preset; CameraRig (inside the Canvas) consumes it, animates, then clears.

import { create } from 'zustand';
import type { PresetId } from './cameraPresets';

interface CameraState {
  requested: PresetId | null;
  request: (id: PresetId) => void;
  clear: () => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  requested: null,
  request: (id) => set({ requested: id }),
  clear: () => set({ requested: null }),
}));
```

- [ ] **Step 2: Create the tooltip bridge store**

```ts
// engine/web/src/three/interaction/tooltipStore.ts
// Hover-name bridge. 3D objects set a tooltip via useObjectTooltip; the
// single DOM ObjectTooltip element renders it. Screen coords are CSS px
// relative to the viewport.

import { create } from 'zustand';

export interface TooltipState {
  visible: boolean;
  name: string;
  hint: string;
  x: number;
  y: number;
  show: (name: string, hint: string, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
}

export const useTooltipStore = create<TooltipState>((set) => ({
  visible: false,
  name: '',
  hint: '',
  x: 0,
  y: 0,
  show: (name, hint, x, y) => set({ visible: true, name, hint, x, y }),
  move: (x, y) => set({ x, y }),
  hide: () => set({ visible: false }),
}));
```

- [ ] **Step 3: Create `useObjectTooltip` (pointer-handler factory)**

```ts
// engine/web/src/three/interaction/useObjectTooltip.ts
// Returns R3F pointer handlers that publish a hover tooltip for a named
// object. Coordinates come from the native pointer event (CSS px). No
// per-frame React state — only enter/leave/move events touch the store.

import type { ThreeEvent } from '@react-three/fiber';
import { useTooltipStore } from './tooltipStore';

export function useObjectTooltip(name: string, hint: string) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>): void => {
      e.stopPropagation();
      useTooltipStore.getState().show(name, hint, e.clientX, e.clientY);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>): void => {
      useTooltipStore.getState().move(e.clientX, e.clientY);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>): void => {
      e.stopPropagation();
      useTooltipStore.getState().hide();
    },
  };
}
```

- [ ] **Step 4: Create `CameraRig`**

```tsx
// engine/web/src/three/interaction/CameraRig.tsx
// Consumes preset requests from useCameraStore and animates the default
// camera + OrbitControls target with a useFrame lerp. Cancels on any user
// drag (the OrbitControls 'start' event) so manual orbit always wins.
// Respects prefers-reduced-motion with a jump-cut.

import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useCameraStore } from './cameraStore';
import { CAMERA_PRESETS, presetToPosition } from './cameraPresets';

const DURATION_S = 0.45;

interface Anim {
  fromPos: Vector3;
  toPos: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  t: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  // OrbitControls registers itself as the default controls (makeDefault).
  // `s.controls` is typed as THREE.EventDispatcher | null, so go through
  // `unknown` to the structural shape we actually use.
  type OrbitLike = {
    target: Vector3;
    update: () => void;
    addEventListener: (t: string, f: () => void) => void;
    removeEventListener: (t: string, f: () => void) => void;
  };
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const requested = useCameraStore((s) => s.requested);
  const clear = useCameraStore((s) => s.clear);
  const animRef = useRef<Anim | null>(null);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Set up an animation whenever a preset is requested.
  useEffect(() => {
    if (!requested || !controls) return;
    const p = CAMERA_PRESETS[requested];
    const toPos = new Vector3(...presetToPosition(p));
    const toTarget = new Vector3(...p.target);
    if (reducedMotion) {
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
      controls.update();
      clear();
      return;
    }
    animRef.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget,
      t: 0,
    };
  }, [requested, controls, camera, clear, reducedMotion]);

  // Cancel the tween if the user grabs the scene.
  useEffect(() => {
    if (!controls) return;
    const onStart = (): void => {
      animRef.current = null;
      clear();
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls, clear]);

  useFrame((_, dt) => {
    const a = animRef.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / DURATION_S);
    const k = easeInOut(a.t);
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    controls.target.lerpVectors(a.fromTarget, a.toTarget, k);
    controls.update();
    if (a.t >= 1) {
      animRef.current = null;
      clear();
    }
  });

  return null;
}
```

- [ ] **Step 5: Type-check**

Run: `cd engine/web && npx tsc -b`
Expected: clean. (If `useThree((s) => s.controls)` types as unknown, the explicit cast above handles it.)

- [ ] **Step 6: Commit**

```bash
git add engine/web/src/three/interaction/cameraStore.ts engine/web/src/three/interaction/tooltipStore.ts engine/web/src/three/interaction/CameraRig.tsx engine/web/src/three/interaction/useObjectTooltip.ts
git commit -m "feat(web): camera-preset rig + hover-tooltip bridges"
```

---

### Task C7: Hotspot anchors, markers, callout, and the patient hotspot layer

**Files:**
- Create: `engine/web/src/three/interaction/assessment/hotspots.ts`
- Create: `engine/web/src/three/interaction/assessment/HotspotMarker.tsx`
- Create: `engine/web/src/three/interaction/assessment/AssessmentCallout.tsx`
- Create: `engine/web/src/three/interaction/assessment/PatientHotspots.tsx`

- [ ] **Step 1: Create the region anchor table**

Anchors are in the same local space as `Patient.tsx` (recall Patient sits in a group at `position={[0,0,-0.15]}` in Scene, with `torsoY = 1.22`, head at `[-0.72, ~1.46, 0]`). These anchors are placed on the patient's body; they are fine-tuned visually in Task C9.

```ts
// engine/web/src/three/interaction/assessment/hotspots.ts
import type { RegionId } from './findings';

export interface Hotspot {
  id: RegionId;
  label: string;
  /** Local-space anchor within the patient group (Scene applies the
   *  group's [0,0,-0.15] offset). Fine-tuned visually. */
  anchor: [number, number, number];
}

export const HOTSPOTS: readonly Hotspot[] = [
  { id: 'pupils', label: 'Pupils', anchor: [-0.72, 1.48, 0.08] },
  { id: 'airway', label: 'Airway', anchor: [-0.6, 1.4, 0] },
  { id: 'carotid', label: 'Carotid pulse', anchor: [-0.52, 1.36, 0.06] },
  { id: 'chest', label: 'Chest', anchor: [-0.2, 1.46, 0] },
  { id: 'radial', label: 'Radial pulse', anchor: [0.28, 1.14, 0.32] },
  { id: 'skin', label: 'Skin', anchor: [0.1, 1.16, 0.2] },
];
```

- [ ] **Step 2: Create `HotspotMarker`**

```tsx
// engine/web/src/three/interaction/assessment/HotspotMarker.tsx
// A pulsing ring on a patient region with a drei <Html> button for
// keyboard/SR users (mirrors the equipment-a11y pattern). Clicking reads
// the live frame, derives a finding, and records it. The ring dims with
// camera distance so it stays subtle when zoomed out.

import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { Vector3, type Mesh, type MeshBasicMaterial } from 'three';
import { useMonitorStore } from '../../../ui/monitor/store/monitorStore';
import { deriveFinding, type RegionId } from './findings';
import { useAssessmentStore } from './assessmentStore';

interface Props {
  id: RegionId;
  label: string;
  position: [number, number, number];
}

export function HotspotMarker({ id, label, position }: Props) {
  const ringRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const worldPos = useRef(new Vector3());

  // Dim with camera distance: opacity 0.65 near → 0.2 far.
  useFrame((state) => {
    const mesh = ringRef.current;
    if (!mesh) return;
    mesh.getWorldPosition(worldPos.current);
    const d = state.camera.position.distanceTo(worldPos.current);
    const mat = mesh.material as MeshBasicMaterial;
    const base = hovered ? 0.85 : 0.55;
    mat.opacity = Math.max(0.2, base - (d - 1.2) * 0.4);
  });

  const assess = (): void => {
    const frame = useMonitorStore.getState().latest;
    if (!frame) return;
    const finding = deriveFinding(id, frame);
    useAssessmentStore.getState().record(id, finding, frame.sim_time_s);
  };

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    assess();
  };

  return (
    <group position={position}>
      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
        onClick={onClick}
      >
        <ringGeometry args={[0.045, 0.07, 24]} />
        <meshBasicMaterial color="#5ab0ff" transparent opacity={0.55} />
      </mesh>
      <Html center distanceFactor={6} zIndexRange={[0, 0]} wrapperClass="equipment-a11y">
        <button
          type="button"
          className="equipment-a11y__btn"
          aria-label={`Assess ${label}`}
          onClick={(e) => { e.stopPropagation(); assess(); }}
        >
          {label}
        </button>
      </Html>
    </group>
  );
}
```

- [ ] **Step 3: Create `AssessmentCallout`**

```tsx
// engine/web/src/three/interaction/assessment/AssessmentCallout.tsx
// In-scene floating label for the most recent finding at each region.
// Auto-fades ~6 s after the finding's seq changes (setTimeout, not rAF).

import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { HOTSPOTS } from './hotspots';
import { latestByRegion, useAssessmentStore } from './assessmentStore';

const VISIBLE_MS = 6000;

export function AssessmentCallout() {
  const entries = useAssessmentStore((s) => s.entries);
  const latest = latestByRegion(entries);
  // Track the newest entry overall; show its callout, then fade.
  const newest = entries[0];
  const [shownSeq, setShownSeq] = useState<number | null>(null);

  useEffect(() => {
    if (!newest) return;
    setShownSeq(newest.seq);
    const t = window.setTimeout(() => setShownSeq(null), VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [newest?.seq]);

  if (!newest || shownSeq !== newest.seq) return null;
  const hot = HOTSPOTS.find((h) => h.id === newest.regionId);
  if (!hot) return null;
  const entry = latest.get(newest.regionId);
  if (!entry) return null;

  return (
    <Html position={hot.anchor} center distanceFactor={5} zIndexRange={[0, 0]} wrapperClass="assess-callout-wrap">
      <div className={`assess-callout ${entry.source === 'static' ? 'is-static' : ''}`}>
        <div className="assess-callout__ti">{entry.title}</div>
        <div className="assess-callout__fi">{entry.finding}</div>
        <div className="assess-callout__de">{entry.detail}</div>
      </div>
    </Html>
  );
}
```

- [ ] **Step 4: Create `PatientHotspots` (the layer that renders all markers + the callout)**

```tsx
// engine/web/src/three/interaction/assessment/PatientHotspots.tsx
import { HOTSPOTS } from './hotspots';
import { HotspotMarker } from './HotspotMarker';
import { AssessmentCallout } from './AssessmentCallout';

export function PatientHotspots() {
  return (
    <group>
      {HOTSPOTS.map((h) => (
        <HotspotMarker key={h.id} id={h.id} label={h.label} position={h.anchor} />
      ))}
      <AssessmentCallout />
    </group>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `cd engine/web && npx tsc -b`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add engine/web/src/three/interaction/assessment/hotspots.ts engine/web/src/three/interaction/assessment/HotspotMarker.tsx engine/web/src/three/interaction/assessment/AssessmentCallout.tsx engine/web/src/three/interaction/assessment/PatientHotspots.tsx
git commit -m "feat(web): patient assessment hotspots + in-scene callout"
```

---

### Task C8: Equipment drag & detach on PickableMesh / EquipmentTray

**Files:**
- Modify: `engine/web/src/three/equipment/PickableMesh.tsx`
- Modify: `engine/web/src/three/equipment/EquipmentTray.tsx`

- [ ] **Step 1: Extend `PickableMesh` with drag + a detach handle**

Replace `engine/web/src/three/equipment/PickableMesh.tsx` with the version below. It adds: optional `draggable`, an `onDrag(delta)`-free design where the parent owns positioning — instead the mesh reports drag start/end and a "released near target" decision is delegated to the parent via `onDragRelease`. To keep it simple and robust, drag here just distinguishes a click from a drag and, when `draggable` + `attached` is false, a drag that travels past a threshold triggers `onPick` on release (same as a click but feels like a drag); when `attached`, a detach `✕` button is shown.

```tsx
// engine/web/src/three/equipment/PickableMesh.tsx
import { Html, useCursor } from '@react-three/drei';
import { useRef, useState, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

interface Props {
  position: [number, number, number];
  children: ReactNode;
  disabled?: boolean;
  attached?: boolean;
  /** Allow press-drag-release to apply (in addition to click). */
  draggable?: boolean;
  onPick: () => void;
  /** Called when the user removes an attached item. */
  onDetach?: () => void;
  label: string;
}

const DRAG_THRESHOLD_PX = 6;

export function PickableMesh({
  position,
  children,
  disabled = false,
  attached = false,
  draggable = false,
  onPick,
  onDetach,
  label,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  useCursor(hovered && !disabled);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    if (!disabled) setHovered(true);
  };
  const handlePointerOut = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    setHovered(false);
  };
  const handlePointerDown = (e: ThreeEvent<PointerEvent>): void => {
    if (disabled) return;
    e.stopPropagation();
    downAt.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;
  };
  const handlePointerMove = (e: ThreeEvent<PointerEvent>): void => {
    if (!downAt.current || !draggable) return;
    const dx = e.clientX - downAt.current.x;
    const dy = e.clientY - downAt.current.y;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      dragging.current = true;
      setHovered(true);
    }
  };
  const handlePointerUp = (e: ThreeEvent<PointerEvent>): void => {
    if (disabled || !downAt.current) return;
    e.stopPropagation();
    downAt.current = null;
    // Click OR drag-release both apply (the drag is an affordance, not a
    // free-positioning gesture — the item snaps to its attach pose).
    onPick();
    dragging.current = false;
  };

  return (
    <group
      position={position}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {children}
      {hovered && !disabled && <HoverHalo />}
      {attached && <AttachedDot />}
      <Html center distanceFactor={6} zIndexRange={[0, 0]} wrapperClass="equipment-a11y">
        {attached && onDetach ? (
          <button
            type="button"
            className="equipment-a11y__btn equipment-detach"
            aria-label={`Remove ${label}`}
            onClick={(ev) => { ev.stopPropagation(); onDetach(); }}
          >
            ✕ Remove {label}
          </button>
        ) : (
          <button
            type="button"
            className="equipment-a11y__btn"
            aria-label={disabled ? `${label} (already attached)` : `Apply ${label}`}
            aria-pressed={attached}
            disabled={disabled}
            onClick={(ev) => { ev.stopPropagation(); if (!disabled) onPick(); }}
          >
            {label}
          </button>
        )}
      </Html>
    </group>
  );
}

function HoverHalo() {
  return (
    <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.12, 0.16, 24]} />
      <meshBasicMaterial color="#34d3a3" transparent opacity={0.6} />
    </mesh>
  );
}

function AttachedDot() {
  return (
    <mesh position={[0, 0.18, 0]}>
      <sphereGeometry args={[0.025, 12, 12]} />
      <meshBasicMaterial color="#34d3a3" />
    </mesh>
  );
}
```

Note: `disabled` was previously set to `attached && hasAttachedPose` in EquipmentTray, which would hide the detach button. The next step changes that so attached items remain interactive (to allow detach).

- [ ] **Step 2: Update `EquipmentTray` to pass `draggable`, `onDetach`, and keep attached items interactive**

In `engine/web/src/three/equipment/EquipmentTray.tsx`:

1. Add `postAction` is already imported. Add a detach handler in `EquipmentSlot`:

```tsx
  const handleDetach = (): void => {
    if (!isAttached) return;
    void postAction({
      action_type: 'remove_equipment',
      params: { equipment: item.id, attach_point: item.attachPoint },
    });
  };
```

2. Change the `PickableMesh` usage so attached items stay clickable for detach (remove the `disabled={isAttached && hasAttachedPose}` lock; pass `draggable` + `onDetach`):

```tsx
      <PickableMesh
        position={[0, 0, 0]}
        onPick={handlePick}
        onDetach={handleDetach}
        attached={isAttached}
        draggable={item.draggable}
        label={item.label}
      >
        <Component />
      </PickableMesh>
```

3. Keep `handlePick` guarding double-apply (`if (isAttached) return;`).

- [ ] **Step 3: Type-check**

Run: `cd engine/web && npx tsc -b`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add engine/web/src/three/equipment/PickableMesh.tsx engine/web/src/three/equipment/EquipmentTray.tsx
git commit -m "feat(web): equipment drag-to-apply + detach handle

Draggable items (NRB/BVM/IV/defib) accept a press-drag-release in
addition to click; attached items expose a ✕ Remove control that posts
remove_equipment and reverts the snap optimistically."
```

---

### Task C9: Wire the scene — mount CameraRig, hotspots, monitor focus + tooltips; DOM overlays

**Files:**
- Modify: `engine/web/src/three/Scene.tsx`
- Modify: `engine/web/src/three/Monitor3D.tsx`
- Create: `engine/web/src/ui/scene/CameraBar.tsx`
- Create: `engine/web/src/ui/scene/AssessmentLog.tsx`
- Create: `engine/web/src/ui/scene/ObjectTooltip.tsx`
- Modify: `engine/web/src/ui/shell/SceneSlot.tsx`
- Modify: `engine/web/src/styles.css`

- [ ] **Step 1: Mount `CameraRig` + `PatientHotspots` and make the monitor focusable in `Scene.tsx`**

Add imports and render them inside `<Canvas>`. Wrap `Monitor3D` in a group that requests the `monitor` preset on click and shows a tooltip:

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Stretcher } from './Stretcher';
import { Patient } from './Patient';
import { Monitor3D } from './Monitor3D';
import { AmbulanceInterior } from './AmbulanceInterior';
import { EquipmentTray } from './equipment/EquipmentTray';
import { InteriorLightRig } from './lights/InteriorLightRig';
import { ORBIT } from './interaction/orbitBounds';
import { CameraRig } from './interaction/CameraRig';
import { PatientHotspots } from './interaction/assessment/PatientHotspots';
import { useCameraStore } from './interaction/cameraStore';
import { useObjectTooltip } from './interaction/useObjectTooltip';
import type { ThreeEvent } from '@react-three/fiber';

export function Scene() {
  const monitorTip = useObjectTooltip('Bedside monitor', 'Click to focus the view');
  const focusMonitor = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    useCameraStore.getState().request('monitor');
  };
  return (
    <Canvas
      shadows
      camera={{ position: [1.45, 1.6, 0.75], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      role="img"
      aria-label="Ambulance compartment with a patient on a stretcher and a vitals monitor"
    >
      <color attach="background" args={['#060b14']} />
      <fog attach="fog" args={['#060b14', 8, 24]} />

      <InteriorLightRig />
      <AmbulanceInterior />
      <EquipmentTray />

      <group position={[0, 0, -0.15]}>
        <Stretcher />
        <Patient />
        <PatientHotspots />
        <group onClick={focusMonitor} {...monitorTip}>
          <Monitor3D position={[-1.4, 1.4, 0.55]} />
        </group>
      </group>

      <CameraRig />

      <OrbitControls
        target={[0, 1.0, 0]}
        enablePan={false}
        minDistance={ORBIT.minDistance}
        maxDistance={ORBIT.maxDistance}
        minPolarAngle={ORBIT.minPolar}
        maxPolarAngle={ORBIT.maxPolar}
        minAzimuthAngle={ORBIT.minAzimuth}
        maxAzimuthAngle={ORBIT.maxAzimuth}
        makeDefault
      />
    </Canvas>
  );
}
```

(No change needed inside `Monitor3D.tsx` — wrapping it in an interactive group is sufficient. If pointer events don't reach the mesh through the group, add `onClick`/pointer handlers directly to Monitor3D's outermost `<group>` in a follow-up; verify in Step 6.)

- [ ] **Step 2: Create `CameraBar` (DOM overlay)**

```tsx
// engine/web/src/ui/scene/CameraBar.tsx
// Bottom-center preset pill. Requests a camera preset via the bridge store;
// CameraRig (in the Canvas) performs the move.

import { CAMERA_PRESETS, PRESET_ORDER } from '../../three/interaction/cameraPresets';
import { useCameraStore } from '../../three/interaction/cameraStore';

export function CameraBar() {
  const request = useCameraStore((s) => s.request);
  return (
    <div className="camera-bar" role="group" aria-label="Camera views">
      {PRESET_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          className="camera-bar__btn"
          onClick={() => request(id)}
        >
          {CAMERA_PRESETS[id].label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `AssessmentLog` (DOM overlay)**

```tsx
// engine/web/src/ui/scene/AssessmentLog.tsx
// Docked top-left findings panel. Reads the assessment store; shows nothing
// until the user assesses a region. Assessment findings only.

import { useAssessmentStore } from '../../three/interaction/assessment/assessmentStore';

function fmtSimTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export function AssessmentLog() {
  const entries = useAssessmentStore((s) => s.entries);
  if (entries.length === 0) return null;
  return (
    <div className="assess-log" aria-label="Assessment findings">
      <h4 className="assess-log__h">Assessment</h4>
      <ul className="assess-log__list">
        {entries.map((e) => (
          <li key={e.seq} className="assess-log__row">
            <span className="assess-log__t">T+{fmtSimTime(e.atSimTimeS)}</span>
            <span className="assess-log__reg">{e.title}</span>
            <span className="assess-log__val">
              {e.finding}
              {e.source === 'static' && <span className="assess-log__static"> · note</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Create `ObjectTooltip` (DOM overlay)**

```tsx
// engine/web/src/ui/scene/ObjectTooltip.tsx
// Single DOM tooltip positioned at the cursor; driven by useObjectTooltip.

import { useTooltipStore } from '../../three/interaction/tooltipStore';

export function ObjectTooltip() {
  const { visible, name, hint, x, y } = useTooltipStore();
  if (!visible) return null;
  return (
    <div className="object-tooltip" style={{ left: x + 14, top: y + 14 }} role="presentation">
      <div className="object-tooltip__name">{name}</div>
      {hint && <div className="object-tooltip__hint">{hint}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Mount the overlays in `SceneSlot`**

```tsx
// engine/web/src/ui/shell/SceneSlot.tsx
import { Suspense, lazy } from 'react';
import { CameraBar } from '../scene/CameraBar';
import { AssessmentLog } from '../scene/AssessmentLog';
import { ObjectTooltip } from '../scene/ObjectTooltip';

const Scene = lazy(() =>
  import('../../three/Scene').then((mod) => ({ default: mod.Scene })),
);

export function SceneSlot() {
  return (
    <div className="scene">
      <Suspense fallback={<SceneLoading />}>
        <Scene />
      </Suspense>
      <AssessmentLog />
      <CameraBar />
      <ObjectTooltip />
      <div className="scene__banner" aria-hidden="true">
        drag to orbit · scroll to zoom
      </div>
    </div>
  );
}

function SceneLoading() {
  return (
    <div className="scene__loading" aria-label="Loading 3D scene">
      loading 3D scene…
    </div>
  );
}
```

- [ ] **Step 6: Add scene-overlay + hotspot styles to `styles.css`**

Append:

```css
/* ─── Scene interaction overlays ─────────────────────────────────────── */

.camera-bar {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: var(--space-3);
  display: flex;
  gap: 4px;
  padding: 5px;
  border-radius: 24px;
  background: rgba(8, 12, 20, 0.86);
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(4px);
  box-shadow: var(--shadow-2);
  z-index: 2;
}
.camera-bar__btn {
  font-family: var(--font-sans);
  background: transparent;
  border: none;
  color: var(--fg-dim);
  font-size: var(--fs-13);
  padding: 6px 13px;
  border-radius: 18px;
  cursor: pointer;
}
.camera-bar__btn:hover { background: var(--bg-3); color: var(--fg); }

.assess-log {
  position: absolute;
  left: var(--space-3);
  top: var(--space-3);
  width: 200px;
  max-height: 50%;
  overflow-y: auto;
  padding: 10px;
  border-radius: var(--radius-2);
  background: rgba(8, 12, 20, 0.86);
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(4px);
  z-index: 2;
}
.assess-log__h { margin: 0 0 7px; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-mute); }
.assess-log__list { list-style: none; margin: 0; padding: 0; }
.assess-log__row { font-size: var(--fs-13); padding: 5px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; }
.assess-log__row:last-child { border-bottom: none; }
.assess-log__t { grid-column: 1 / -1; font-family: var(--font-mono); font-size: 0.62rem; color: var(--fg-mute); }
.assess-log__reg { color: var(--accent-2); font-weight: 600; }
.assess-log__val { color: var(--fg-dim); }
.assess-log__static { color: var(--fg-mute); font-style: italic; }

.object-tooltip {
  position: fixed;
  pointer-events: none;
  background: rgba(11, 18, 32, 0.96);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-1);
  padding: 4px 9px;
  font-size: var(--fs-12);
  color: var(--fg);
  z-index: 20;
}
.object-tooltip__hint { color: var(--fg-mute); font-size: 0.62rem; }

.assess-callout {
  width: 180px;
  background: rgba(11, 18, 32, 0.96);
  border: 1px solid var(--accent-2);
  border-radius: var(--radius-2);
  padding: 8px 10px;
  box-shadow: var(--shadow-2);
}
.assess-callout.is-static { border-color: var(--line-strong); }
.assess-callout__ti { font-family: var(--font-mono); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-2); }
.assess-callout__fi { font-size: 0.86rem; font-weight: 650; margin-top: 2px; }
.assess-callout__de { font-size: 0.72rem; color: var(--fg-dim); margin-top: 2px; line-height: 1.4; }
.assess-callout-wrap { pointer-events: none; }

.equipment-detach { white-space: nowrap; }
```

- [ ] **Step 7: Type-check, unit tests, build**

Run: `cd engine/web && npx tsc -b && npx vitest run && npx vite build`
Expected: tsc clean; all tests pass; build succeeds with no new deps (chunk sizes comparable to baseline).

- [ ] **Step 8: Browser-verify every 3D interaction**

Create `/tmp/threed.mjs`:

```js
import pwpkg from '/Users/jaehunb/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pwpkg;
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
// dismiss onboarding if present
await page.getByRole('button', { name: /Skip the tour/ }).click().catch(() => {});
await page.waitForTimeout(3500);

// Camera presets
for (const name of ['Airway', 'Monitor', 'Full body', 'Reset']) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `/tmp/cam-${name.replace(' ', '')}.png` });
}

// Assess a region via its a11y button (keyboard path), then check the log
await page.getByRole('button', { name: /Assess Chest/ }).click();
await page.waitForTimeout(600);
const logText = await page.locator('.assess-log').innerText().catch(() => '(no log)');
console.log('assessment log after chest:', JSON.stringify(logText));

// Apply NRB then detach
await page.getByRole('button', { name: /^Apply Non-rebreather mask$/ }).click();
await page.waitForTimeout(800);
const removeVisible = await page.getByRole('button', { name: /Remove Non-rebreather mask/ }).isVisible().catch(() => false);
console.log('detach control visible after apply:', removeVisible);
await page.screenshot({ path: '/tmp/threed-final.png' });
console.log('PAGE ERRORS:', errs.join(' | '));
await browser.close();
```

Run: `node /tmp/threed.mjs`
Expected:
- `assessment log after chest:` contains "Chest" and "breath sounds" (apnea trace → "No breath sounds")
- `detach control visible after apply: true`
- `PAGE ERRORS:` empty
- Review `/tmp/cam-*.png`: each preset frames a distinct, non-grey view inside the cabin (airway close on head, monitor framing the bedside screen, full body wide, reset = default). If any framing is poor, adjust that preset's `target`/`distance`/`azimuth`/`polar` in `cameraPresets.ts` (keeping the bounds test green) and re-run.
- Review `/tmp/threed-final.png`: hotspot rings visible on the patient; assessment log docked top-left; camera bar bottom-center.

- [ ] **Step 9: Commit**

```bash
git add engine/web/src/three/Scene.tsx engine/web/src/three/Monitor3D.tsx engine/web/src/ui/scene/CameraBar.tsx engine/web/src/ui/scene/AssessmentLog.tsx engine/web/src/ui/scene/ObjectTooltip.tsx engine/web/src/ui/shell/SceneSlot.tsx engine/web/src/styles.css
git commit -m "feat(web): wire 3D interaction — hotspots, camera bar, monitor focus, tooltips

Mounts CameraRig + PatientHotspots in the scene, makes the bedside
monitor click-to-focus with a hover tooltip, and adds the bottom-center
camera bar, docked assessment log, and cursor tooltip DOM overlays."
```

---

### Task C10: Final full verification

**Files:** none (verification only)

- [ ] **Step 1: Run every quality bar**

```bash
cd /Users/jaehunb/Documents/EMS_simulator
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd engine/web && npx tsc -b && npx vitest run && npx vite build
```
Expected: all green. cargo bars unaffected (no Rust change). vitest: 43 original + new (steps 3, useOnboarding 5, cameraPresets 5, findings 7, assessmentStore 3, attachedFromRecords 4 ≈ 70 total). Build within budget, no new deps.

- [ ] **Step 2: End-to-end smoke via `just demo`**

```bash
just demo   # builds web, serves on :8080
```
Open http://localhost:8080 in a real browser. Confirm: onboarding appears on first load (in a fresh profile / cleared localStorage); Skip it; the scenario picker opens fully above the scene; orbit/zoom works; camera presets move the view; clicking a body hotspot logs a finding; applying then detaching equipment works; hovering the monitor shows a tooltip and clicking focuses it. No console errors.

- [ ] **Step 3: Update CLAUDE.md key paths (optional, if the team keeps it current)**

If desired, add the new dirs to the "Key paths" table in `CLAUDE.md`: `ui/onboarding/`, `three/interaction/`, `ui/scene/`. Commit separately.

- [ ] **Step 4: Final commit (if any docs touched)**

```bash
git add -A && git commit -m "docs: note onboarding/interaction paths in CLAUDE.md"
```

---

## Self-review checklist (completed by plan author)

- **Spec coverage:** Onboarding wizard (B1-B3) ✓; picker visibility (A1) ✓; hotspots+findings+callout+log (C3, C4, C7, C9) ✓; equipment drag & detach (C5, C8) ✓; camera presets (C2, C6, C9) ✓; focusable monitor + tooltips (C6, C9) ✓; bedside items click-only (C5 `draggable` flag, C8) ✓; pupils/carotid static (C3) ✓; assessment-log-findings-only (C4 comment, C9 `AssessmentLog`) ✓; camera bounds guard (C2) ✓; honesty/50Hz/no-deps/a11y constraints enforced throughout.
- **Type consistency:** `RegionId`, `Finding`, `CameraPreset`, `PresetId`, `ActionRecord`, `attachedFromRecords`, `presetToPosition`, `useCameraStore.request/clear`, `useAssessmentStore.record/clear` are defined once and used consistently across tasks.
- **Placeholders:** none — every code step shows complete code; every test step shows the assertions and the run command with expected output.
