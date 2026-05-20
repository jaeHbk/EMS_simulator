// Bottom-anchored drawer with pause/resume + time-warp + restart.
// Hidden behind a passcode gate. Once unlocked the drawer slides up
// from above the alarm banner; click the chevron to collapse.

import { useState } from 'react';
import { useSettings } from '../settings/useSettings';
import { runControls, useRunMode } from './useRunControls';
import { PasscodeGate } from './PasscodeGate';
import { TimeWarpControl } from './TimeWarpControl';

export function InstructorDrawer() {
  const unlocked = useSettings((s) => s.instructorUnlocked);
  const lock = useSettings((s) => s.lockInstructor);
  const [open, setOpen] = useState(false);

  if (!unlocked) {
    return (
      <details className="instructor-drawer instructor-drawer--locked">
        <summary>Instructor mode</summary>
        <div className="instructor-drawer__body">
          <PasscodeGate onSuccess={() => setOpen(true)} />
        </div>
      </details>
    );
  }

  return (
    <div
      className={`instructor-drawer ${open ? 'is-open' : 'is-closed'}`}
      role="region"
      aria-label="Instructor controls"
    >
      <button
        type="button"
        className="instructor-drawer__handle"
        aria-expanded={open}
        aria-controls="instructor-drawer-body"
        onClick={() => setOpen((o) => !o)}
      >
        Instructor {open ? '▾' : '▴'}
      </button>
      {open && (
        <div id="instructor-drawer-body" className="instructor-drawer__body">
          <PauseResumeControl />
          <TimeWarpControl />
          <button
            type="button"
            className="instructor-drawer__btn instructor-drawer__btn--danger"
            onClick={() => {
              if (window.confirm('Restart scenario?')) {
                void runControls.restart();
              }
            }}
          >
            Restart
          </button>
          <button
            type="button"
            className="instructor-drawer__btn"
            onClick={lock}
          >
            Lock
          </button>
        </div>
      )}
    </div>
  );
}

function PauseResumeControl() {
  const mode = useRunMode();
  const isPaused = mode === 'paused';
  return (
    <button
      type="button"
      className="instructor-drawer__btn"
      onClick={() => void (isPaused ? runControls.resume() : runControls.pause())}
      aria-pressed={isPaused}
    >
      {isPaused ? 'Resume' : 'Pause'}
    </button>
  );
}
