// SPDX-License-Identifier: Apache-2.0
// Optional HUD mount and panel placement for a camera locked to a path.
//
// Halo's VR placement keeps the HUD root still in its VR anchor's frame and
// lets the headset look around the sphere. A camera that rides a path (a road,
// a rail, a cutscene track) turns the picture away from that sphere, so a
// window that should sit beside the look ends up behind the player. The mount
// below is a Group inserted between the root and the anchor; it turns the
// sphere toward the look while the root keeps its own transform:
//
//   anchor (Halo's VR parent) -> mount (yaw, then pitch, about root.position) -> hud.root
//
// Coordinate contract:
// - `hud.root.rotation` stays (0, 0, 0) and `hud.root.position` stays the point
//   Halo captured in the anchor's frame. Layout pixels map onto the sphere in
//   root-local coordinates exactly as without a mount, so window x/y keep
//   their meaning and saved layouts do not change.
// - Picking reads `hud.root.matrixWorld`, which now includes the mount. The
//   mount refreshes its world matrix (and its ancestors') on every update so a
//   ray cast in the same frame matches what is drawn.
// - The mount pivots about `hud.root.position`, so the sphere centre (the
//   captured head point) does not move when the look turns.
//
// Panel placement is in the same layout pixels, as a yaw/pitch off the sphere
// centre: x = layoutW * (0.5 + yaw / yawSpan), the inverse of the mapping the
// VR pointer uses for move-drags. Halo's hidden-window convention (y < -1000)
// is respected: a hidden window is never moved, so its saved restore point
// survives. A window being dragged is left alone, and once dropped it keeps
// where the person put it until `reset()`.

/** Default yaw off the look for a side column: past Halo's ±37° forward cap, still in a headset lens. */
export const HUD_PATH_CAMERA_SIDE_YAW_RAD = (50 * Math.PI) / 180;

/** Default vertical gap between stacked windows, in layout pixels. */
export const HUD_PATH_CAMERA_GAP_PX = 24;

/** Default highest top edge a staged window may take, in layout pixels (above Halo's hidden threshold). */
export const HUD_PATH_CAMERA_MIN_Y_PX = -900;

// Halo parks hidden windows below this y (see hud-window-visibility-runtime.js).
const HIDDEN_Y = -1000;

/**
 * Create a mount that turns the HUD sphere toward a path-locked look while
 * presenting in VR. Desktop is untouched: when the renderer is not presenting,
 * `update` releases the root back to its anchor.
 * @param {object} options
 * @param {object} options.THREE Three.js namespace of the application (no second instance).
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer whose `xr.isPresenting` selects VR.
 * @param {{ root: object }} options.hud The HUD state model (`hudSystem.hud`).
 * @param {string} [options.name="hud-path-camera-mount"] Name given to the mount Group.
 * @returns {{ mount: object, update: (look?: { yaw?: number, pitch?: number }) => boolean, release: () => void, dispose: () => void }}
 *   `update` returns true when the mount is holding the root this frame.
 * Side effects: reparents `hud.root` under the mount while presenting; the
 *   mount joins whatever object Halo has made the root's VR parent.
 */
export function createHudPathCameraMount({ THREE, renderer, hud, name = "hud-path-camera-mount" } = {}) {
  if (!THREE?.Group) throw new Error("[halo:path-camera] createHudPathCameraMount needs THREE");
  if (!hud?.root) throw new Error("[halo:path-camera] createHudPathCameraMount needs hud.root (pass hudSystem.hud)");

  const mount = new THREE.Group();
  mount.name = name;
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const qYaw = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const spun = new THREE.Vector3();
  let disposed = false;

  function attach() {
    const root = hud.root;
    if (root.parent === mount) return true;
    const anchor = root.parent;
    if (!anchor) return false;
    if (mount.parent !== anchor) {
      mount.removeFromParent();
      anchor.add(mount);
    }
    mount.add(root);
    return true;
  }

  function release() {
    const root = hud.root;
    const anchor = mount.parent;
    mount.quaternion.identity();
    mount.position.set(0, 0, 0);
    if (root.parent === mount) {
      if (anchor) anchor.add(root);
      else mount.remove(root);
    }
    mount.updateMatrixWorld(true);
  }

  function update({ yaw = 0, pitch = 0 } = {}) {
    if (disposed) return false;
    if (!renderer?.xr?.isPresenting) {
      if (hud.root.parent === mount) release();
      return false;
    }
    if (!attach()) return false;
    const root = hud.root;
    qYaw.setFromAxisAngle(axisY, Number(yaw) || 0);
    qPitch.setFromAxisAngle(axisX, Number(pitch) || 0);
    mount.quaternion.copy(qYaw).multiply(qPitch);
    // Pivot about the root's point: mount.position = p - R·p keeps the
    // sphere centre where Halo captured it.
    spun.copy(root.position).applyQuaternion(mount.quaternion);
    mount.position.copy(root.position).sub(spun);
    root.rotation.set(0, 0, 0);
    mount.updateWorldMatrix(true, true);
    return true;
  }

  function dispose() {
    if (disposed) return;
    release();
    mount.removeFromParent();
    disposed = true;
  }

  return { mount, update, release, dispose };
}

/**
 * Create a placement that holds open windows in columns at fixed yaws off the
 * look, for a HUD whose sphere follows a path-locked camera (see
 * `createHudPathCameraMount`). Which windows go where is the application's.
 * @param {object} options
 * @param {object} options.hudSystem The HUD system (`createHudSystem` / bootstrap `hudSystem`).
 * @param {Array<{ yaw: number, keys?: string[], showKeys?: string[] }>} options.columns
 *   Columns in order. `yaw` is radians off the look, positive to the right.
 *   `keys` are stacked top to bottom when open. `showKeys` are placed even when
 *   parked (for a window such as Enter/Exit VR that must be reachable).
 * @param {boolean} [options.placeOthers=true] Spread open windows that no column names across the columns.
 * @param {number} [options.gapPx=HUD_PATH_CAMERA_GAP_PX] Vertical gap between stacked windows.
 * @param {number} [options.minYPx=HUD_PATH_CAMERA_MIN_Y_PX] Highest top edge a staged window may take.
 * @returns {{ place: (look?: { pitch?: number, layoutW?: number, layoutH?: number }) => void, reset: () => void, isUserPlaced: (key: string) => boolean }}
 *   `place` stages windows for this frame; `pitch` (radians, positive up)
 *   moves the stacks' vertical centre off the sphere centre.
 * Side effects: `place` writes `x`/`y` of open, undragged windows in `hudSystem.hud.ui.windows`
 *   and requests a HUD render when those coordinates change.
 */
export function createHudPathCameraPanels({
  hudSystem,
  columns,
  placeOthers = true,
  gapPx = HUD_PATH_CAMERA_GAP_PX,
  minYPx = HUD_PATH_CAMERA_MIN_Y_PX,
} = {}) {
  if (!hudSystem?.hud) throw new Error("[halo:path-camera] createHudPathCameraPanels needs hudSystem");
  if (!Array.isArray(columns) || !columns.length || !columns.every((c) => Number.isFinite(c?.yaw))) {
    throw new Error("[halo:path-camera] createHudPathCameraPanels needs columns with a numeric yaw");
  }
  const userPlaced = new Set();
  let lastDragKey = null;

  function isOpen(win) {
    return !!win && Number(win.y) >= HIDDEN_Y;
  }

  function trackDrag() {
    const key = hudSystem.getDragWindowKey?.() ?? null;
    if (lastDragKey && lastDragKey !== key) userPlaced.add(lastDragKey);
    lastDragKey = key;
    return key;
  }

  function place({ pitch = 0, layoutW, layoutH } = {}) {
    const hud = hudSystem.hud;
    const windows = hud.ui?.windows;
    if (!windows) return;
    const dragKey = trackDrag();
    const width = Math.max(1, Number(layoutW) || Number(hud.layoutW) || 1);
    const height = Math.max(1, Number(layoutH) || Number(hud.layoutH) || 1);
    const yawSpan = Math.max(1e-6, Number(hudSystem.getVrYawPerScreen?.()) || 0);
    const pitchSpan = Math.max(1e-6, Number(hudSystem.getVrPitchPerScreen?.()) || 0);
    const look = Number(pitch) || 0;
    const named = new Set();
    const plans = columns.map((col) => {
      const show = new Set(col.showKeys ?? []);
      const items = [];
      for (const key of [...(col.keys ?? []), ...show]) {
        if (named.has(key)) continue;
        named.add(key);
        const win = windows[key];
        if (!win || (!show.has(key) && !isOpen(win))) continue;
        items.push({ key, win });
      }
      return { col, items };
    });

    if (placeOthers) {
      for (const key of Object.keys(windows)) {
        if (named.has(key) || !isOpen(windows[key])) continue;
        // The rest go one at a time to the bottom of the column holding the fewest.
        let best = plans[0];
        for (const plan of plans) if (plan.items.length < best.items.length) best = plan;
        best.items.push({ key, win: windows[key] });
      }
    }

    for (const { col, items } of plans) {
      if (!items.length) continue;
      let total = gapPx * (items.length - 1);
      for (const item of items) total += Math.max(1, Number(item.win.h) || 1);
      const cx = width * (0.5 + col.yaw / yawSpan);
      let y = height * (0.5 - look / pitchSpan) - total / 2;
      for (const { key, win } of items) {
        const h = Math.max(1, Number(win.h) || 1);
        const w = Math.max(1, Number(win.w) || 1);
        // A held or dropped window keeps its spot; its slot in the stack stays reserved.
        if (key !== dragKey && !userPlaced.has(key)) {
          const x = Math.round(cx - w / 2);
          const nextY = Math.max(minYPx, Math.round(y));
          if (win.x !== x || win.y !== nextY) {
            win.x = x;
            win.y = nextY;
            // Coordinate fields are plain values; the normal frame update only
            // rebuilds rendered panels and their hit meshes when HUD is dirty.
            hud._dirty = true;
          }
        }
        y = Math.max(minYPx, Math.round(y)) + h + gapPx;
      }
    }
  }

  function reset() {
    userPlaced.clear();
    lastDragKey = null;
  }

  return { place, reset, isUserPlaced: (key) => userPlaced.has(key) };
}
