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

type OrbitLike = {
  target: Vector3;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
};

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  // OrbitControls registers itself as the default controls (makeDefault).
  // `s.controls` is typed as THREE.EventDispatcher | null, so go through
  // `unknown` to the structural shape we actually use.
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
