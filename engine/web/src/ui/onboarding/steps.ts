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
