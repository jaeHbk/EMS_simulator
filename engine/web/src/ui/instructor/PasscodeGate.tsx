// Tiny passcode prompt. Clinical-training installs typically use a
// shared instructor code; this is a UX guard, not a security boundary.
// Code is hard-coded "1234" for now — swap for an env var when the
// training deployment story matures.

import { useState } from 'react';
import { useSettings } from '../settings/useSettings';

const INSTRUCTOR_CODE = '1234';

export function PasscodeGate({ onSuccess }: { onSuccess: () => void }) {
  const unlock = useSettings((s) => s.unlockInstructor);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (code === INSTRUCTOR_CODE) {
      unlock();
      onSuccess();
    } else {
      setError(true);
    }
  };

  return (
    <form className="passcode-gate" onSubmit={handleSubmit}>
      <label>
        <span>Instructor passcode</span>
        <input
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          aria-invalid={error}
          aria-describedby={error ? 'passcode-error' : undefined}
        />
      </label>
      {error && (
        <span id="passcode-error" role="alert">
          Wrong passcode.
        </span>
      )}
      <button type="submit">Unlock</button>
    </form>
  );
}
