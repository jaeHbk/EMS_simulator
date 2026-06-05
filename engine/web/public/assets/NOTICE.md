# Third-party assets

All assets are CC0 or CC-BY with attribution preserved next to the binary.

Each asset has a `<filename>.LICENSE` sidecar with the canonical attribution
(source URL, author, license). This file is the aggregated roll-up.

## HDRI

| File | Source | Author | License |
|---|---|---|---|
| `hdri/clinical-room-1k.hdr` | _add when downloaded_ | _author_ | CC0 |

## Patient

| File | Source | Author | License |
|---|---|---|---|
| `patient/patient-supine.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |

## Equipment

| File | Source | Author | License |
|---|---|---|---|
| `equipment/defibrillator.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/iv-pole.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/bvm.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/nrb-mask.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/intubation-kit.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/drug-box.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/oxygen-tank.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |
| `equipment/monitor-bedside.glb` | _add when downloaded_ | _author_ | CC0 / CC-BY |

## Floor

| File | Source | Author | License |
|---|---|---|---|
| `floor/floor-albedo.jpg` | _add when downloaded_ | _author_ | CC0 |
| `floor/floor-normal.jpg` | _add when downloaded_ | _author_ | CC0 |
| `floor/floor-roughness.jpg` | _add when downloaded_ | _author_ | CC0 |

## How to populate

This directory tree is committed empty. Download CC0 / permissive assets from
Poly Haven (HDRI, textures), Quaternius (rigged characters), or Sketchfab
(filter by CC0 license) and drop them at the paths above. The
`useGltfWithFallback` wrapper means the scene continues to render with
placeholder cubes until the real GLBs arrive — no build step is gated on the
asset binaries.

When dropping a file, write a sidecar `.LICENSE` next to it with:

```
Source: <URL>
Author: <name>
License: <CC0 / CC-BY-4.0 / etc.>
```

and update the matching row in this file.
