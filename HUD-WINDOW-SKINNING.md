# HUD window skinning (Halo)

How an app skins Halo HUD windows with 9-slice frames and matching chrome.

Halo owns mesh allocation, UV mapping, title-chrome layout, click/hover
hit-testing, and VR billboard anchoring. The app owns **textures** and
**which window keys** to skin. Do not re-implement 9-slice quads, title-bar
crops, or control hit boxes in the app.

This is WebGL-only (desktop, touch, and Quest). Never use DOM/CSS for HUD
chrome, text, tooltips, scrollbars, or the hotbar.

Implementation: [`src/hud-window-skin-runtime.js`](./src/hud-window-skin-runtime.js).
The consuming application supplies its own textures.

---

## When to use this

Use it when an app wants textured panel frames (stone, metal, wood, etc.)
instead of the default solid-color Halo chrome.

Do **not** duplicate this in the app. If a primitive is missing (new control
type, new chrome surface), extend Halo so every project benefits.

---

## Asset contract

Put textures in the app, typically `assets/hud/`. Halo loads them by filename.

### Required 9-slice pieces

A 1024×1024 (or similar) panel frame, sliced into:

| File | Role |
| --- | --- |
| `tl.png` `tr.png` `bl.png` `br.png` | Corners — fixed size, never stretch |
| `top.png` `bottom.png` | Horizontal edges — stretch in X only |
| `left.png` `right.png` | Vertical edges — stretch in Y only |
| `center.png` | Inner fill — stretch in X and Y |

`cornerSize` (layout pixels, default **40**) must capture the ornamental border
so stretching does not smear corner knots. Ascent uses 40 for a ~256px corner
on a 1024 source.

Corners stay put; edges stretch on one axis; center fills the content well.

### Title strip

| File | Role |
| --- | --- |
| `header_bar.png` | Full-bleed **horizontal strip** (e.g. 1024×128), not a square banner |

Map it 1:1 onto the title mesh (`repeat 1,1`). Do **not** crop a 10% band out
of a square image — that squashes ornament and does not match the frame.

Optional: `header_bar_fill.png` — same size, calmer center (used by
`?titlePoc=fill`).

### Rules for generated art

- No letters, logos, or UI copy in the textures (games localize; models garble text).
- 9-slice: ornament in corners, uniform edges, empty/dark center.
- Title strip: uniform middle so it survives stretch; optional rails on top/bottom.
- Match the frame palette. Do not prompt a different game’s UI style into the
  title bar (that is how a mismatched banner gets produced).

---

## App wiring

Create windows first, then skin them. Unknown or not-yet-created keys are skipped.

```js
const textures = hudSystem.loadWindowSkinTextures("assets/hud/");
hudSystem.applyWindowSkinToWindows(
  ["inventory", "status", "debug"],
  textures,
  { cornerSize: 40 },
);
```

Single window:

```js
hudSystem.applyWindowSkin("inventory", textures, { cornerSize: 40 });
```

The app should keep a short list of **game** window keys. Skip runtime chrome
that is not a panel (`hotbar` is themed as a tray, not 9-sliced, unless you
explicitly pass it).

Enter VR and Exit VR are one HUD window, key `xr`. `applyWindowSkinToWindows`
always skins that window when it exists, even when the caller's list leaves it
out, and grows it so the 9-slice frame and the action label both fit. The title
stays `VR`. The body reads `ENTER VR` before a session and `EXIT VR` while
presenting. One skin covers both labels. Do not add a second page button for
Exit VR, and do not mount `VRButton` as another control.

`applyWindowSkin` skins the one window you pass. It does not add `xr` and it
does not theme overlays. `applyWindowSkinToWindows` turns on shared stone
chrome (see below).

---

## What Halo does after apply

For each skinned window:

- Allocates nine `PlaneGeometry` meshes on `hud.plane` and stores them on
  `objs.nineSlice`.
- Positions corners/edges/center every frame as the window moves or resizes.
- Hides default outline/bg/bevels while the frame is large enough
  (`height >= 2 * cornerSize`). Collapsed bars hide the 9-slice pieces.
- Maps `header_bar.png` full-bleed onto the title mesh.
- Insets the title plaque between left/right frame pieces when expanded.
- Collapsed skinned windows keep the nameplate, title treatment, and
  min/close buttons on the compact title strip.
- Replaces min / close / action / resize glyphs with olive-gold plates.
- Insets the resize handle inside the frame corner (not on the outer ornament).
- Click, hover, and VR Troika anchors all use those same control rects.
- The `xr` action label is centered in the well. Once the frame is tall enough
  to draw, that label is parchment with an ink outline. Title-bar clicks still
  drag. A click in the body enters or exits the session.

Shared chrome (when `applyWindowSkinToWindows` runs):

- Sets `hud.ui.stoneSkin` so overlays and the hotbar pick olive/gold/parchment.
- Tooltips and context menus: olive well, parchment text, gold hover.
- Scrollbars: olive track, gold thumb and arrows.
- Hotbar tray: olive fill, gold rim, gold slot outlines, parchment numbers.

Hotbar items may still pass per-slot `outlineColor`; gold-family values match
the skin. Cyan/blue outlines will fight it.

---

## Title text on a busy frame

Default treatment is **plaque + outline** (`both`): parchment glyphs, dark
outline, olive nameplate.

Override (debug / comparison):

- `hud.ui.titleReadabilityPoc = "outline"` (or `"plaque"`, `"fill"`, `"ink"`)
- or `?titlePoc=outline` on the page URL

| Value | Effect |
| --- | --- |
| `both` (default) | Nameplate + outlined parchment |
| `outline` | Outlined parchment on the knotwork, no plate |
| `plaque` | Nameplate, no outline |
| `fill` | Uses `header_bar_fill.png` |
| `ink` | Dark text, no plate/outline (poor on gold knotwork) |

Do not paint window titles into the texture.

---

## Layout and hit-testing (do not fork)

Skinned control positions live in `getHudWindowTitleChrome` and
`getHudWindowControlRects` (`hud-window-skin-runtime.js`).

If a tooltip, click, or VR label misses a control, fix those helpers — do not
hard-code `win.x + win.w - titleHeight` in the app. Halo’s click runtime,
overlay hover, and Troika VR anchors already consume the same rects.

---

## Checklist for a new app

1. Create HUD windows with `hudSystem.createWindow(...)`.
2. Add 9-slice + `header_bar.png` under `assets/hud/` (names above).
3. After windows exist, call `loadWindowSkinTextures` then
   `applyWindowSkinToWindows`.
4. Do not allocate extra title/frame meshes in the app.
5. Validate **desktop and Quest**: resize, collapse, hover “Resize” on the
   inset grip, tooltip color, scrollbar, hotbar.

Working example: Ascent Protocol lists game window keys and delegates load/apply
to Halo (`js/hud-nine-slice.js`). That list can omit `xr`. Halo still skins the
VR window.

---

## Preparing application artwork

Use an image editor, renderer, or image-generation tool to create the textures
specified above. Keep source artwork and its redistribution permission with the
consuming application. Halo supplies the runtime contract, not panel artwork.

Match corner and edge pixels, render title bars as horizontal strips, avoid baked
text or third-party logos, and verify resize behavior in desktop and immersive
views. Do not require a particular workstation, local service, or model provider.
