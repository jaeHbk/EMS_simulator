// Bottom-center preset pill. Requests a camera preset via the bridge store;
// CameraRig (in the Canvas) performs the move.

import {
  CAMERA_PRESETS,
  PRESET_ORDER,
} from '../../three/interaction/cameraPresets';
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
