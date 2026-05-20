// Settings modal — uses the native <dialog> element so the browser
// handles focus trap, ESC dismissal, and the modal scrim.

import { useEffect, useRef } from 'react';
import { useSettings } from './useSettings';
import { unlockAudio } from '../monitor/audio/tones';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const s = useSettings();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="settings-title"
    >
      <header className="settings-dialog__header">
        <h2 id="settings-title">Settings</h2>
        <button
          type="button"
          className="settings-dialog__close"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </header>

      <form
        className="settings-dialog__body"
        method="dialog"
        onSubmit={(e) => e.preventDefault()}
      >
        <section>
          <h3>Audio</h3>
          <label className="setting-row">
            <span>Audible alarms</span>
            <input
              type="checkbox"
              checked={!s.audioMuted}
              onChange={(e) => {
                if (e.target.checked) unlockAudio();
                s.setAudioMuted(!e.target.checked);
              }}
            />
          </label>
          <label className="setting-row">
            <span>Alarm volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.alarmVolume}
              onChange={(e) => s.setAlarmVolume(Number(e.target.value))}
              aria-valuetext={`${Math.round(s.alarmVolume * 100)} percent`}
            />
          </label>
          <label className="setting-row">
            <span>Ambient volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.ambientVolume}
              onChange={(e) => s.setAmbientVolume(Number(e.target.value))}
              aria-valuetext={`${Math.round(s.ambientVolume * 100)} percent`}
            />
          </label>
        </section>

        <section>
          <h3>Accessibility</h3>
          <label className="setting-row">
            <span>Color-blind palette</span>
            <select
              value={s.colorBlindMode}
              onChange={(e) =>
                s.setColorBlindMode(e.target.value as typeof s.colorBlindMode)
              }
            >
              <option value="none">None</option>
              <option value="deuteranopia">Deuteranopia</option>
              <option value="protanopia">Protanopia</option>
              <option value="tritanopia">Tritanopia</option>
            </select>
          </label>
          <label className="setting-row">
            <span>Reduce motion</span>
            <input
              type="checkbox"
              checked={s.reducedMotion}
              onChange={(e) => s.setReducedMotion(e.target.checked)}
            />
          </label>
          <label className="setting-row">
            <span>Large vitals</span>
            <input
              type="checkbox"
              checked={s.largeVitals}
              onChange={(e) => s.setLargeVitals(e.target.checked)}
            />
          </label>
        </section>

        <section>
          <h3>Units</h3>
          <label className="setting-row">
            <span>Temperature</span>
            <select
              value={s.tempUnit}
              onChange={(e) =>
                s.setTempUnit(e.target.value as typeof s.tempUnit)
              }
            >
              <option value="celsius">Celsius (°C)</option>
              <option value="fahrenheit">Fahrenheit (°F)</option>
            </select>
          </label>
        </section>
      </form>
    </dialog>
  );
}
