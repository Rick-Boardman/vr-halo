# Halo Runtime

Shared WebXR + desktop + mobile runtime library for the canonical scene rig, HUD,
navigation, and XR plumbing for browser applications.

This directory is shared library code, not a standalone app surface. Validate it
through the narrowest live app harness that exercises a change (for example
`examples/chat-panel/`), on a fresh browser origin, whenever behavior is
browser-facing.

> **New project?** Start from
> [`../docs/quick-start.md`](../docs/quick-start.md).
> Do not re-create a renderer, camera, navigation, HUD, picker, or XR wiring —
> Halo already owns them.

## Goals

- Works in Quest (WebXR), desktop, and mobile from one codebase.
- WebGL-native visible UI with no DOM/CSS overlays or browser dialogs. Editable HUD text uses an invisible DOM endpoint only when a supporting immersive browser requires it to invoke the native system keyboard.
- Stable VR controller interaction (ray → HUD plane → UV → layout coords).
- Draggable HUD windows, buttons, and text rendering.

## Source of Truth (Do Not Change Without Discussion)

These documents are authoritative for how the HUD and navigation work. Do not
change their described behavior without discussing it with the repo owner.

- [`../docs/runtime-contracts.md`](../docs/runtime-contracts.md)
- [`../docs/runtime-contracts.md`](../docs/runtime-contracts.md)
- [`../AGENTS.md`](../AGENTS.md) — extraction goals
  and the ongoing runtime-extraction process.

## Run

Serve the repo over HTTP(S) (WebXR requires a secure context), then open a
consuming harness, for example:

- `examples/chat-panel/` — Halo scene + HUD showcase
- `Lattice's graph example` — graph app (Halo via Lattice)

## Public API

### Preferred entrypoint

The canonical entrypoint for a scene is `createSceneHudBootstrap(...)` plus
`renderHudFrame(...)` (or `startAnimationLoop(...)`).

```js
import * as THREE from "three";
import {
  createSceneHudBootstrap,
  renderHudFrame,
  startAnimationLoop,
} from "./core.js";

const canvas = document.getElementById("c");

const { renderer, scene, camera, hudSystem, navigation } =
  createSceneHudBootstrap({
    THREE,
    canvas,
    buildWorld: ({ scene }) => {
      const worldPickables = [];
      // Add lights and world meshes here.
      // Return the world-space objects that should participate in hover/raycasting.
      return worldPickables;
    },
    hudOptions: { uiPreset: "minimal" },
    isTyping: () => false,
  });

startAnimationLoop({
  renderer,
  THREE,
  maxDelta: 0.05,
  onFrame: ({ dt }) =>
    renderHudFrame({ renderer, scene, camera, dt, hudSystem, navigation }),
});
```

`createSceneHudBootstrap(...)` returns `renderer`, `scene`, `camera`, `rig`
(`player` / `playerYaw` / `playerPitch` / `playerRoll` / `head`), `look`,
`controllers`, `hudSystem`, `navigation`, `remoteLogger`, `worldRaycastTargets`,
`setWorldControlsEnabled(enabled)`, and `getWorldControlsEnabled()`.

This keeps every app aligned on:

- canonical rig + controller parenting
- `vrAnchor: playerPitch`
- shared HUD-first world-control gating
- shared WebXR frame ordering and debug-overlay rendering

### Namespace barrels

Use the narrowest namespace that fits the app; do not reach back into individual
runtime modules.

- [core.js](./core.js) — `createSceneHudBootstrap`, `createHudSystem`,
  `wireSceneSelection`, `renderHudFrame`,
  `startAnimationLoop`.
- [navigation/index.js](./navigation/index.js) — `createSceneNavigation`,
  `createSceneRig`, `createIsoNavigation`, `createFlatSceneViewportControls`,
  `wireSceneSelection`.
- [tiles/index.js](./tiles/index.js) — `createTileBoard`, `createTileCellPicker`,
  `createDiamondGrid`, `createHexGrid`, `createTilePainter`.
- [xr/index.js](./xr/index.js) — `createXrControllers`,
  `createVRPointerHighlight`, `VRButton`.
- [xr/quest3-diagnostic.js](./xr/quest3-diagnostic.js) — Quest controller
  diagnostics and the shared console API installer for XR harnesses.
- [ui/index.js](./ui/index.js) — runtime UI shells, overlays, and input routing.
- [ui/input-router.js](./ui/input-router.js) — shared UI input routing for pointer
  or XR controller event dispatch.
- [ui/editor/index.js](./ui/editor/index.js) — the Troika-backed HUD text editor and WebXR system-keyboard bridge. See [`../SYSTEM-KEYBOARD.md`](../SYSTEM-KEYBOARD.md).
- [curve-surface.js](./curve-surface.js) — curve-sampled strip geometry and
  horizontal curve-normal helpers reused by road/track scene assembly.
- [hud.js](./hud.js) — HUD namespace / compatibility surface.

> Graph scenes, graph mesh building, and Mermaid layout are **not** in Halo —
> they live in Lattice (`https://github.com/Rick-Boardman/vr-lattice`). Racing/vehicle helpers live in
> the owning app (for example Gravacrest `runtime/`), built on Halo primitives
> such as `curve-surface.js`.

## Runtime HUD windows (no visible DOM overlays)

Scenes add their own HUD windows at runtime; they render inside the WebGL surface
and work on desktop, touch, and in VR.

```js
hudSystem.createWindow("details", {
  title: "DETAILS",
  x: 16,
  y: 320,
  w: 520,
  h: 320,
});

hudSystem.setWindowLines(
  "details",
  [
    { text: "Hello", color: 0xdde3ea },
    { text: "This is a custom window.", color: 0x9ec2ff },
  ],
  { scrollMode: "top" },
);
```

`hudSystem` methods include `createWindow(key, layout)`,
`setWindowLines(key, entries, opts)`, `setWindowHidden(key, hidden)`,
`bringToFront(key)`, `isClientPointOverUi(clientX, clientY)`,
`handleResize()`, `loadWindowSkinTextures(basePath)`,
`applyWindowSkin(key, textures, opts)`, and
`applyWindowSkinToWindows(keys, textures, opts)`, and the read-only
`getVrYawPerScreen()`, `getVrPitchPerScreen()` (angular size of the VR surface,
radians) and `getDragWindowKey()` (window being dragged, or `null`). Entry `color`
is a packed hex integer.

To 9-slice frames, title strips, and matching tooltip/scrollbar/hotbar chrome,
see [`../HUD-WINDOW-SKINNING.md`](../HUD-WINDOW-SKINNING.md). Apps supply
textures and window keys; Halo owns meshes, layout, and VR hit-testing.
`applyWindowSkinToWindows` also skins the Enter VR / Exit VR window (`xr`)
whenever that window exists, and grows it so the frame fits.
`applyWindowSkin` does not.

> Reserved window keys: `status` (built-in STATUS window) and the built-in
> SYSTEM LOG window. Do not reuse the key `status`.

### Path-locked camera (VR)

Halo's VR placement keeps the HUD sphere still in the VR anchor's frame and lets
the headset look around it. When the application locks the camera to a path (a
road, a rail, a scripted track), the picture turns away from that sphere. Two
optional helpers from `@rb/halo/hud` (source: [hud-path-camera.js](./hud-path-camera.js))
turn the sphere with the look and hold windows beside it:

```js
import * as THREE from "three";
import {
  createHudPathCameraMount,
  createHudPathCameraPanels,
  HUD_PATH_CAMERA_SIDE_YAW_RAD,
} from "@rb/halo/hud";

const hudMount = createHudPathCameraMount({ THREE, renderer, hud: hudSystem.hud });
const hudPanels = createHudPathCameraPanels({
  hudSystem,
  columns: [
    { yaw: -HUD_PATH_CAMERA_SIDE_YAW_RAD, keys: ["race", "help"] },
    { yaw: HUD_PATH_CAMERA_SIDE_YAW_RAD, keys: ["settings"], showKeys: ["xr"] },
  ],
});

// Every frame, after the app has posed its rig for the path:
if (hudMount.update({ yaw: lookYaw, pitch: lookPitch })) hudPanels.place();
// On teardown:
hudMount.dispose();
```

Coordinate contract:

- The mount is a `Group` between Halo's VR anchor and `hud.root`:
  anchor → mount (yaw about +Y, then pitch about +X, pivoting on
  `hud.root.position`) → `hud.root`. `yaw`/`pitch` are radians in the anchor's
  frame; positive yaw turns toward −X (Three.js right-hand rule), positive pitch up.
- `hud.root.rotation` stays (0, 0, 0) and `hud.root.position` stays the head
  point Halo captured, so layout pixels map to root-local sphere coordinates
  exactly as without a mount, and saved layouts keep their meaning.
- Picking reads `hud.root.matrixWorld`, which includes the mount. `update`
  refreshes the mount's world matrix and its ancestors' so a ray cast in the same
  frame matches what is drawn.
- `update` acts only while `renderer.xr.isPresenting`. Otherwise it gives the
  root back to its anchor and returns `false`; Halo then owns desktop placement
  unchanged. `release()` does that on demand; `dispose()` also detaches the mount.
- Panel columns are a yaw off the sphere centre, in layout pixels
  `x = layoutW · (0.5 + yaw / getVrYawPerScreen())`, the inverse of the VR
  pointer's mapping. In layout pixels +x is screen-right, so a positive column
  `yaw` is to the right. `place({ pitch })` moves the stacks' vertical centre off
  the sphere centre; pass `0` when the mount already aims at the look pitch.
  Changed coordinates request a render on the next HUD update; unchanged
  placement leaves the HUD clean.
- A hidden window (Halo parks it at `y < -1000`) is never moved, so its restore
  point survives; `showKeys` are placed even when parked (for Enter/Exit VR).
  A window being dragged is left alone, and once dropped it keeps its spot
  until `hudPanels.reset()`. Open windows no column names join the column with
  the fewest windows unless `placeOthers: false`.

Which windows go in which column, clearance for the road or track, and any
preferred layout stay in the application.

### Chat panel

`createHudChatPanel(...)` (from [`ui/index.js`](./ui/index.js)) is one transcript
window with a single-line Troika field in its footer, built on the window API
above. It owns the drawing and NOT the service: an app hands in a transport
and Halo shows whatever it says.

```js
import { createHudChatPanel } from "./ui/index.js";

const panel = createHudChatPanel({
  hudSystem,
  renderer,
  title: "TABLE ONE",
  x: 24,
  y: 380,
  transport: {
    subscribe: (listener) => session.subscribe(listener), // -> unsubscribe
    send: (text) => session.send(text),
    nameFor: (userId) => people.nameFor(userId),
  },
});

panel.toggle();
```

Pass `isTyping: () => panel?.isTyping() ?? false` to the scene bootstrap when
wiring a panel after scene creation. The chat panel exposes its editor's focus
state; closing the panel releases focus. The focused HUD editor handles accepted
keyboard events in capture phase and stops them before scene listeners, while
desktop paste retains its browser default.

The transport contract in full is at the top of
[`ui/chat-panel.js`](./ui/chat-panel.js). A message is
`{ id, authorUserId, body, createdAt }` and a view is
`{ messages, status?, watching?, hasMore? }` — the shape a headless chat client
already emits, so an app usually passes its session straight through. Bodies
are drawn as TEXT: no markdown, no links that resolve, no images, because a
panel floating in somebody's field of view is the last place to render whatever
a stranger typed.

`examples/chat-panel/` is a runnable page with a fake transport, and
`scripts/look-at-chat-panel.mjs` drives it headlessly and saves a screenshot.

### Form controls and the settings window

`createHudFormController(...)` (from [`ui/index.js`](./ui/index.js), module
[`hud-form-controls.js`](./hud-form-controls.js)) lays out, hit-tests and paints
rows of WebGL form controls on a 2D canvas: `status`, `dropdown`, `number`,
`checkbox`, `slider` and `button`. Each row reads its value through a callback
and reports changes through one (`onSelect`, `onCommit`, `onToggle`, `onInput`,
`onPress`); it holds no Three.js objects or listeners. Coordinates are window
pixels, origin top-left; a press outside the window's width and height is
ignored. `contentHeight(width, extra)` is the height the rows need, and
`slidingKey` names the slider holding a pressed pointer. `layoutFormRows`,
`contains`, `sanitizeNumberText` and `DEFAULT_FORM_PALETTE` are exported beside it.

`createHudSettingsWindow(...)` ([`hud-settings-window.js`](./hud-settings-window.js))
paints those controls on the HUD `settings` window: Quality (Low/Medium/High
dropdown), Ratio (pixel-ratio number field), Automatic, Volume, Mute, the app's
`extraRows`, and Calibrate again. Quality and sound reach the app only through
the injected `quality` and `audio` callbacks; `settingsCallbacksFromCalibration`
builds both from a `createQualityCalibration` instance such as the bootstrap's
`quality`.

```js
import { createHudSettingsWindow, settingsCallbacksFromCalibration } from "./ui/index.js";

const settings = createHudSettingsWindow({
  THREE,
  hudSystem,
  renderer,
  ...settingsCallbacksFromCalibration(quality), // or your own { quality, audio }
  palette: { accent: "#e8c97a" },               // optional colour overrides
  extraRows: [{ kind: "checkbox", key: "extreme", label: "Extreme crashes",
    checked: () => extreme, onToggle: (next) => saveExtreme(next) }],
  notes: () => ["Saved on this device."],
});

// Each frame: sample input before the HUD update, paint after it.
settings.prepare();
renderHudFrame({ renderer, scene, camera, dt, hudSystem, navigation });
settings.afterHud();
```

Desktop mouse and touch arrive through `hud.pointer`, the XR controller ray
through `hud.vrPointer`. `prepare()` keeps the press edge and `afterHud()` reads
the position the HUD update just refreshed. A press reaches the controls only
when the HUD gave it to this window: inside its visible rectangle, first in the
HUD's window hit order (a window raised over it, or an open context menu, takes
the press), and in XR on a ray with `vrPointer.active` hitting this window
(`vrPointer.windowKey`). A slider being dragged keeps the pointer until release;
a press elsewhere closes an open list and commits typing. The window raises its
`minH` (and `h`) to the height its rows and notes need, so a resize cannot hide
a control. The number field takes desktop keys in capture phase
and, in a session that reports `isSystemKeyboardSupported`, opens the Quest
system keyboard through `webxr-system-keyboard.js`. Pass
`isTyping: () => settings.isTyping()` to the scene bootstrap so typing does not
walk. The window clears the `settings` window's own text lines (the bootstrap's
calibration writes them) and hides its scroll chrome. `dispose()` removes the
key listener, closes the system keyboard, and frees the mesh, material,
geometry and canvas texture. Palette, presets, game modes, asset quality and
persistence stay in the app. `examples/settings-window/` is a runnable page and
`scripts/look-at-settings-window.mjs` drives it with mouse, keyboard and touch.

## World-object picking

Use `wireSceneSelection(...)` instead of a custom raycaster. It unifies desktop
click (with pointer-up fallback), touch, and XR controller-ray picking. The app
supplies only the domain interpretation:

```js
import { wireSceneSelection } from "./core.js";

wireSceneSelection({
  THREE,
  domElement: renderer.domElement,
  controllers,
  isClientPointOverUi: (x, y) => hudSystem.isClientPointOverUi(x, y),
  pickFromClientPoint: (clientX, clientY) => /* domain object id */,
  pickHitFromRay: (origin, dir) => /* { id, distance, point } */,
  onSelect: (id) => {/* ... */},
  onHover: (id) => {/* ... */},
});
```

## Advanced / manual integration

Low-level exports like `createHudSystem(...)` and `createSceneNavigation(...)`
remain available for specialized harnesses, but the bootstrap is the preferred
path. If you wire things manually, keep the same contracts:

- parent XR controllers under the rig pitch node
- pass `controllers` and `vrAnchor: playerPitch` into `createHudSystem(...)`
- keep look state quaternion-authoritative
- preserve the canonical frame ordering or reuse `renderHudFrame(...)`

Prefer bootstrap unless a harness has a documented reason to diverge.

## Troika Text Contract

Shared HUD text is Troika-backed through `hud-troika-text-runtime.js` and the
direct Text wrappers under `ui/`. The shared font contract is:

- primary font: `assets/inter-latin-400-normal.woff`
- unicode fallback data: `assets/unicode-fonts/`
- exported font tokens: `hud-text-style.js`

Keep those assets same-origin. Shared runtime HUD text should not depend on
jsDelivr for initial font loading or unicode fallback resolution.

Whitespace-only strings must be normalized to the empty string before syncing
explicit-font Troika text. Earlier integrations encountered the worker error
`Cannot destructure property 'ascender' of 'he' as it is undefined.`

Validate shared font-path changes in a live shared harness such as
`Lattice's graph example`, then recheck any other affected runtime surface.

## Debug Mode (VR)

To diagnose VR picking issues in-headset (Quest), enable **Debug Mode** from the
HUD-rendered button panel:

- Enter VR, then click `DEBUG: OFF` under `EXIT VR` to toggle `DEBUG: ON`.
- While enabled, all HUD collider meshes render transparent yellow, and the XR
  status text shows the active drag window key and rect `(x, y, w, h)`.

Implementation is isolated in [hud-debug.js](./hud-debug.js) and wired into
[hud.js](./hud.js).

## Quality

From the shared library root:

- `npm test` checks the system-keyboard bridge with simulated DOM/session objects.
- `npm run build` validates imports, package exports, and the unit tests.
- `npm run test:browser` exercises the included WebGL chat and settings-window
  examples, then the path-camera mount on desktop and in simulated XR
  (`scripts/look-at-path-camera.mjs`).
- `npm run audit:release` checks the candidate files and local documentation links.

Use a fresh-origin browser smoke check on the smallest affected harness whenever
a runtime change affects live browser behavior. Remote diagnostics are opt-in:
shared code does not hardcode a collector URL; pass `remoteLogUrl` into
`createSceneHudBootstrap(...)` or supply `?logUrl=https://...` /
`?remoteLogUrl=https://...` at runtime.
