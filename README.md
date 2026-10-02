# Panorama Viewer

A panorama and 360° photo viewer built with React and Bun. Drop in your images, drag to look around.

There's no 3D library: a single WebGL2 fragment shader projects the photo directly.

```bash
bun install
bun run dev        # http://localhost:3000 (or the next free port), with hot reload
bun run build      # static bundle in dist/
bun run start      # production server
```

## What it does

- **360° photos.** Equirectangular images at a 2:1 ratio open as a full sphere. JPEGs with Google Photo Sphere (GPano) metadata are also read for partial spheres, compass heading and initial view.
- **Panoramas.** Any other width opens as a cylindrical panorama. A slider sets how far around it reaches, and the view is clamped so you never look past the edge of the photo.
- **Little planet.** A stereographic projection for full 360° images, with an animated transition from perspective.
- **Several images at once.** Every image you add lines up in a strip along the bottom. Click one to switch, or hover it to remove it.
- **Navigation.** Drag with inertia, scroll or pinch to zoom toward the cursor, double-click or double-tap to focus. Save the current view as a PNG, or go fullscreen.

Add images by dropping them anywhere, with **Choose images** or the **+** tile, or by pasting from the clipboard. Everything stays in your browser; nothing is uploaded.

Large images are downscaled to fit the GPU (up to 16k px per side or 40 MP on desktop, 16 MP on touch devices).

## Keys

| Key | Action |
| --- | --- |
| `O` | Open images |
| Arrows (Shift = faster) | Look around |
| `+` / `-` | Zoom |
| `P` | Toggle little planet |
| `0` | Recentre |
| `Space` | Auto-rotate |
| `[` / `]`, `1`–`9` | Switch image |
| `F` | Fullscreen |

## Layout

```
src/viewer/     camera (state, inertia, limits, transitions), WebGL renderer, input
src/lib/        scene model and projection maths, file loading, GPano parser
src/components/ filmstrip, controls, overlays
```
