# Notes from Granite Mesa (2026-11-08)

Made at the owner's request while fixing Granite Mesa's workflow editor. The owner's standing instruction: improve the
libraries where needed instead of working around them, and leave notes like these. Keep or rework as you see fit.

- **Facing mark** (`src/navigation/facing-crosshair-overlay.js`, `src/frame-loop.js`, `syncOverlay` in
  `src/navigation/scene-navigation.js`): on desktop the mark is placed from the camera that draws the frame, just before
  drawing. It read the navigation rig's position and look, one frame late, so it jumped when an application moved the
  camera without the rig (Conduit's and Loom's viewports). `createFacingCrosshairOverlay` no longer takes `player`, `getYaw`,
  `getPitch` or `getQuaternion`. XR is unchanged. Tests: `tests/facing-crosshair.test.mjs`. An app that should have no
  mark passes `debugFacingCrosshair: false` in its navigation options (Conduit and Loom do).
- **Fitted views stay fitted** (`src/navigation/flat-scene-viewport-controls.js`): after `fitBounds`, a change in the
  element's size (browser resized or zoomed, pane laid out again) fits the view again, until the person or the
  application moves it (`setTarget`, `setDistance`, any pan or zoom). The aspect comes from the element, not the camera,
  so it does not depend on resize order. New option `shiftX`, a fraction of the box's width: an application's deliberate
  offset, kept when it fits again; moving the view after `fitBounds` with `setTarget` ends the fit. Tests:
  `tests/flat-viewport-fit.test.mjs`.
- **Fonts**: `src/assets/LICENSES/README.md` records the GSUB lookups removed from Inter and the Latin fallback, so
  Troika stops printing "unsupported GSUB table LookupType 6". If those fonts are refreshed from upstream the messages come
  back unless the same lookups are removed.
- **HUD windows keep their place in the viewer** (`src/hud-window-anchor.js`, `reanchorWindows` in
  `src/hud-window-layout-runtime.js`, `src/hud-resize-runtime.js`): a resize no longer sets `_layoutInitialized = false`, which
  re-ran the default or saved layout. Each window stays against its nearest edge on each axis (or the centre, in the middle
  third), and goes back to its place after being clamped by a small viewer. Saved layouts record the viewer's size
  (`__viewer`), so a reload in another size keeps the same edges.
- **`win.userPlaced`** (`src/hud-click-runtime.js`, `src/hud-drag-reset-runtime.js`): set when a person drags a window; saved
  with the layout. Applications that lay out windows should leave those alone (Conduit and Loom now do). Tests:
  `tests/hud-window-anchor.test.mjs`.
