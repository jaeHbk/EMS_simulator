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
