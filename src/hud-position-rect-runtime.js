// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD rectangle-placement helpers for VR spherical layout and desktop plane layout.
 * @param {object} [options={}] Position-runtime dependencies.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to branch VR-vs-desktop placement behavior.
 * @param {{ layoutW?: number, layoutH?: number, ui?: { windows?: Record<string, any>, _vrVirtualWindows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {number} options.titleHeightPx HUD title-bar height used for collapsed-window center calculations.
 * @param {number} options.vrDistance VR HUD sphere radius baseline in meters.
 * @param {() => string | null} options.getDragMode Callback returning active drag mode.
 * @param {() => string | null} options.getDragWindowKey Callback returning active drag window key.
 * @param {() => boolean} options.getVrResizeDragBasisActive Callback indicating whether a frozen VR resize basis is active.
 * @param {() => string | null} options.getVrResizeDragKey Callback returning the active VR resize drag key.
 * @param {() => { winCx?: number, winCy?: number }} options.getVrResizeDragBasis Callback returning frozen resize-basis coordinates.
 * @param {() => number} options.vrYawPerScreen Callback returning full-screen yaw span in radians.
 * @param {() => number} options.vrPitchPerScreen Callback returning full-screen pitch span in radians.
 * @param {() => number} options.vrMetersPerPxX Callback returning VR horizontal meters-per-pixel scale.
 * @param {() => number} options.vrMetersPerPxY Callback returning VR vertical meters-per-pixel scale.
 * @param {(x: number, y: number, w: number, h: number) => { lx: number, ly: number }} options.rectToLocalCenter Desktop local-center helper.
 * @param {(w: number, h: number) => { sx: number, sy: number }} options.sizeToLocalScale Desktop local-scale helper.
 * @param {any} options.vrDir Scratch vector storing panel-center direction in HUD-local space.
 * @param {any} options.vrToHead Scratch vector storing panel normal facing toward head.
 * @param {any} options.vrUp Scratch vector storing panel up axis.
 * @param {any} options.vrGravityUpL Scratch vector storing gravity/head up direction in HUD-local coordinates.
 * @param {any} options.vrRight Scratch vector storing panel right axis.
 * @param {any} options.vrBasisMat Scratch matrix storing panel orthonormal basis.
 * @returns {{ positionRect: (mesh: any, x: number, y: number, w: number, h: number, z: number) => void }} Rectangle placement helper used by HUD window rendering and overlays.
 * Side effects: mutates mesh position/quaternion/scale/visibility according to VR spherical placement or desktop plane placement.
 */
export function createHudPositionRectRuntime({
  renderer,
  hud,
  titleHeightPx,
  vrDistance,
  getDragMode,
  getDragWindowKey,
  getVrResizeDragBasisActive,
  getVrResizeDragKey,
  getVrResizeDragBasis,
  vrYawPerScreen,
  vrPitchPerScreen,
  vrMetersPerPxX,
  vrMetersPerPxY,
  rectToLocalCenter,
  sizeToLocalScale,
  vrDir,
  vrToHead,
  vrUp,
  vrGravityUpL,
  vrRight,
  vrBasisMat,
} = {}) {
  function positionRect(mesh, x, y, w, h, z) {
    if (renderer.xr.isPresenting) {
      const key = mesh?.userData?.windowKey;
      const win = key
        ? hud.ui?.windows?.[key] ?? hud.ui?._vrVirtualWindows?.[key]
        : null;
      if (win) {
        const titleH = titleHeightPx;
        const winH = win.collapsed ? titleH : win.h;

        // VR resize stability (render-time): while resizing, keep the billboard basis
        // anchored to the window center that existed at resize start.
        // Otherwise, changing w/h changes winCx/winCy, which changes yaw/pitch and
        // makes the whole panel tilt/rotate as it resizes.
        let winCx = win.x + win.w / 2;
        let winCy = win.y + winH / 2;
        if (
          getDragMode() === "resize" &&
          getDragWindowKey() === key &&
          getVrResizeDragBasisActive() &&
          getVrResizeDragKey() === key
        ) {
          const resizeBasis = getVrResizeDragBasis();
          const fx = Number(resizeBasis?.winCx);
          const fy = Number(resizeBasis?.winCy);
          if (Number.isFinite(fx)) winCx = fx;
          if (Number.isFinite(fy)) winCy = fy;
        }

        const yaw = (winCx / hud.layoutW - 0.5) * vrYawPerScreen();
        const pitch = (0.5 - winCy / hud.layoutH) * vrPitchPerScreen();

        // Window center direction in HUD-local space (origin at head).
        vrDir
          .set(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch)
          )
          .normalize();

        const vrZ = Number(win.vrZ ?? 0);
        const dz = Number.isFinite(vrZ) ? vrZ : 0;
        const radius = Math.max(0.12, vrDistance - (dz + z));

        // Roll-locked billboard rotation:
        // - panel +Z faces the head (toward origin)
        // - panel +Y aligns with headset up (projected onto the panel plane)
        vrToHead.copy(vrDir).multiplyScalar(-1).normalize(); // local +Z

        // Project gravity up onto plane orthogonal to vrToHead to define "level".
        vrUp.copy(vrGravityUpL);
        vrUp.addScaledVector(vrToHead, -vrUp.dot(vrToHead));
        if (vrUp.lengthSq() < 1e-6) {
          // Fallback if head-up is nearly parallel to the normal.
          vrUp.set(0, 1, 0);
          vrUp.addScaledVector(vrToHead, -vrUp.dot(vrToHead));
        }
        vrUp.normalize();
        vrRight.crossVectors(vrUp, vrToHead).normalize();
        vrUp.crossVectors(vrToHead, vrRight).normalize();

        vrBasisMat.makeBasis(vrRight, vrUp, vrToHead);
        mesh.quaternion.setFromRotationMatrix(vrBasisMat);

        const cx = x + w / 2;
        const cy = y + h / 2;
        const mx = (cx - winCx) * vrMetersPerPxX();
        const my = (winCy - cy) * vrMetersPerPxY();

        mesh.position
          .copy(vrDir)
          .multiplyScalar(radius)
          .addScaledVector(vrRight, mx)
          .addScaledVector(vrUp, my);

        mesh.scale.set(w * vrMetersPerPxX(), h * vrMetersPerPxY(), 1);
        mesh.visible = true;
        return;
      }
    }

    const { lx, ly } = rectToLocalCenter(x, y, w, h);
    const { sx, sy } = sizeToLocalScale(w, h);
    mesh.position.set(lx, ly, z);
    mesh.quaternion.identity();
    mesh.scale.set(sx, sy, 1);
    mesh.visible = true;
  }

  return {
    positionRect,
  };
}
