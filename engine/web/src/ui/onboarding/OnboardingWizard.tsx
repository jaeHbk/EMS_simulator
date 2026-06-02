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
