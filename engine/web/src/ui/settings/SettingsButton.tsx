// Top-bar gear icon button that opens the settings dialog.

import { useState } from 'react';
import { SettingsDialog } from './SettingsDialog';

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="topbar__gear"
        onClick={() => setOpen(true)}
        aria-label="Open settings"
      >
        ⚙
      </button>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
