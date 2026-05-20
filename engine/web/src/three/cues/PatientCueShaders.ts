// Shader injectors for patient-state cues.
//
// onBeforeCompile patches into the standard MeshStandardMaterial fragment
// shader. We add two uniforms (uCyanosis, uPallor) and lerp the final
// fragment color toward two target colors. Once a real GLTF lands with a
// vertex-color cyanosis mask, the same uniforms drive a per-vertex weight
// — the only change will be reading the mask channel instead of applying
// uniformly to the whole mesh.

import type { MeshStandardMaterial } from 'three';
import type { MutableRefObject } from 'react';

/** Cyanotic blue target — slightly desaturated indigo. */
const CYANOSIS_RGB = 'vec3(0.18, 0.30, 0.55)';
/** Pallor target — pale, blood-drained warm grey. */
const PALLOR_RGB = 'vec3(0.92, 0.86, 0.78)';

interface CueRefs {
  cyanosis: MutableRefObject<{ value: number }>;
  pallor: MutableRefObject<{ value: number }>;
}

/** Patch a material so its base color is shifted by the cue uniforms.
 *  Caller must dispose the material if the parent unmounts; we don't hold
 *  any global state. */
export function injectPatientCues(
  material: MeshStandardMaterial,
  refs: CueRefs,
): void {
  // Idempotency guard so a remount doesn't double-inject.
  const tag = '__cuesInjected';
  type Tagged = MeshStandardMaterial & { [k: string]: unknown };
  if ((material as Tagged)[tag]) return;
  (material as Tagged)[tag] = true;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCyanosis = refs.cyanosis.current;
    shader.uniforms.uPallor = refs.pallor.current;

    shader.fragmentShader =
      `uniform float uCyanosis;\nuniform float uPallor;\n` +
      shader.fragmentShader.replace(
        '#include <output_fragment>',
        `
        {
          vec3 cyanotic = ${CYANOSIS_RGB};
          vec3 pale = ${PALLOR_RGB};
          // Pallor first (overall washing-out), then cyanosis (blue tint).
          gl_FragColor.rgb = mix(gl_FragColor.rgb, pale, clamp(uPallor, 0.0, 1.0) * 0.6);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, cyanotic, clamp(uCyanosis, 0.0, 1.0));
        }
        #include <output_fragment>`,
      );
  };
  material.needsUpdate = true;
}
