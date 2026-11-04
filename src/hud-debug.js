// SPDX-License-Identifier: Apache-2.0
// Debug utilities for the shared runtime HUD namespace.
//
// Goal: provide in-headset diagnostics without changing interaction math.
// This module is intentionally small and isolated so it can be kept (or re-applied)
// even if interaction experiments are reverted.

/**
 * Purpose: Create a HUD-scoped collider-debug controller that can reveal shared HUD hit targets in place.
 * @param {object} options Debug tool dependencies.
 * @param {{ MeshBasicMaterial: new (options?: object) => unknown, DoubleSide: number }} options.THREE Three.js namespace used to create the shared debug material.
 * @param {{ objects?: { windows?: Record<string, { hit?: unknown }>, enterBtn?: unknown, exitBtn?: unknown, debugBtn?: unknown } }} options.hud HUD system object whose collider meshes should be toggled.
 * @returns {{ enabled: boolean, setEnabled: (next: boolean) => void, toggle: () => void }} State object for enabling or disabling collider visualization.
 * Side effects: creates a shared debug material, swaps HUD collider mesh materials/renderOrder while enabled, and mutates mesh visibility state.
 */
export function createHudDebugTools({ THREE, hud }) {
  if (!THREE) throw new Error("createHudDebugTools requires THREE");
  if (!hud) throw new Error("createHudDebugTools requires hud");

/** Bright yellow tint applied to HUD collider meshes when debug visualization is active. */
  const DEBUG_COLLIDER_COLOR = 0xffff00;
  /** Low opacity so debug colliders overlay the HUD without fully obscuring content. */
  const DEBUG_COLLIDER_OPACITY = 0.22;
  /** Minimum render order that pushes debug colliders above most HUD content. */
  const DEBUG_COLLIDER_MIN_RENDER_ORDER = 900;

  const colliderDebugMaterial = new THREE.MeshBasicMaterial({
    color: DEBUG_COLLIDER_COLOR,
    transparent: true,
    opacity: DEBUG_COLLIDER_OPACITY,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const original = new Map(); // Mesh -> { material, opacity, color, renderOrder }

  function collectColliderMeshes() {
    const meshes = [];

    // Per-window raycast targets
    const winMap = hud.objects?.windows;
    if (winMap) {
      for (const objs of Object.values(winMap)) {
        const hit = objs?.hit;
        if (hit && (hit.isMesh || hit.isInstancedMesh)) meshes.push(hit);
      }
    }

    // VR button collider (also the visible button background)
    if (hud.objects?.enterBtn) meshes.push(hud.objects.enterBtn);
    if (hud.objects?.exitBtn) meshes.push(hud.objects.exitBtn);
    if (hud.objects?.debugBtn) meshes.push(hud.objects.debugBtn);

    return meshes;
  }

  function setCollidersVisible(enabled) {
    const on = !!enabled;
    const meshes = collectColliderMeshes();

    if (on) {
      for (const mesh of meshes) {
        if (!mesh) continue;
        if (!original.has(mesh)) {
          original.set(mesh, {
            material: mesh.material,
            renderOrder: mesh.renderOrder,
          });
        }
        mesh.material = colliderDebugMaterial;
        mesh.renderOrder = Math.max(mesh.renderOrder ?? 0, DEBUG_COLLIDER_MIN_RENDER_ORDER);
        mesh.visible = true;
      }
    } else {
      for (const [mesh, o] of original.entries()) {
        if (!mesh) continue;
        mesh.material = o.material;
        mesh.renderOrder = o.renderOrder;
      }
      original.clear();
    }
  }

  const state = {
    enabled: false,
    setEnabled(next) {
      const v = !!next;
      if (state.enabled === v) return;
      state.enabled = v;
      setCollidersVisible(v);
    },
    toggle() {
      state.setEnabled(!state.enabled);
    },
  };

  return state;
}
