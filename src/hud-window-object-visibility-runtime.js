// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers for status-extra visibility and bulk window-object visibility toggling.
 * @param {object} [options={}] Visibility-runtime dependencies.
 * @param {{ objects?: { statusBars?: any, statusNameText?: any, statusMetaText?: any, statusSpeedText?: any, statusSpeedBg?: any } }} options.hud Shared HUD state model.
 * @returns {{ hideStatusExtras: () => void, hideHotbarExtras: () => void, setAllWindowObjectsVisible: (objs: any, visible: boolean) => void }} Visibility helpers used by updateUi window rendering.
 * Side effects: mutates visibility flags on status meshes/text and on per-window object collections.
 */
export function createHudWindowObjectVisibilityRuntime({ hud } = {}) {
  function hideStatusExtras() {
    if (hud.objects.statusBars) {
      if (hud.objects.statusBars.healthBg) hud.objects.statusBars.healthBg.visible = false;
      if (hud.objects.statusBars.healthFg) hud.objects.statusBars.healthFg.visible = false;
      if (hud.objects.statusBars.staminaBg) hud.objects.statusBars.staminaBg.visible = false;
      if (hud.objects.statusBars.staminaFg) hud.objects.statusBars.staminaFg.visible = false;
    }
    if (hud.objects.statusNameText?.mesh) hud.objects.statusNameText.mesh.visible = false;
    if (hud.objects.statusMetaText?.mesh) hud.objects.statusMetaText.mesh.visible = false;
    if (hud.objects.statusSpeedText?.mesh) hud.objects.statusSpeedText.mesh.visible = false;
    if (hud.objects.statusSpeedBg) hud.objects.statusSpeedBg.visible = false;
  }

  function hideHotbarExtras() {
    for (const slot of hud.objects.hotbarSlots ?? []) {
      if (slot?.bg) slot.bg.visible = false;
      if (slot?.outline) slot.outline.visible = false;
    }
    if (hud.objects.hotbarNumbersText?.mesh) hud.objects.hotbarNumbersText.mesh.visible = false;
    for (const text of hud.objects.hotbarNumberTexts ?? []) {
      if (text?.mesh) text.mesh.visible = false;
    }
    for (const text of hud.objects.hotbarIconTexts ?? []) {
      if (text?.mesh) text.mesh.visible = false;
    }
    if (hud.objects.hotbarHeaderText?.mesh) hud.objects.hotbarHeaderText.mesh.visible = false;
    if (hud.objects.hotbarStatusBg) hud.objects.hotbarStatusBg.visible = false;
    if (hud.objects.hotbarStatusText?.mesh) hud.objects.hotbarStatusText.mesh.visible = false;
    for (const dot of hud.objects.hotbarGripDots ?? []) {
      if (dot) dot.visible = false;
    }
  }

  function setAllWindowObjectsVisible(objs, visible) {
    if (!objs) return;
    const v = !!visible;

    if (objs._troikaColorLayers && objs._troikaColorLayers instanceof Map) {
      for (const layer of objs._troikaColorLayers.values()) {
        if (!layer) continue;
        if (layer.mesh) layer.mesh.visible = v;
      }
    }

    if (objs._troikaContentText?.mesh) objs._troikaContentText.mesh.visible = v;

    if (objs.nineSlice && typeof objs.nineSlice === "object") {
      for (const piece of Object.values(objs.nineSlice)) {
        if (piece?.isObject3D) piece.visible = v;
      }
    }

    for (const value of Object.values(objs)) {
      if (!value) continue;

      if (Array.isArray(value)) {
        for (const entry of value) {
          if (!entry) continue;
          if (entry.isObject3D || entry.isMesh || entry.isInstancedMesh) {
            entry.visible = v;
            continue;
          }
          if (entry.mesh && entry.mesh.isObject3D) entry.mesh.visible = v;
        }
        continue;
      }

      if (value.isObject3D) {
        value.visible = v;
        continue;
      }
      if (value.isMesh || value.isInstancedMesh) {
        value.visible = v;
        continue;
      }
      if (value.mesh && value.mesh.isObject3D) value.mesh.visible = v;
    }
  }

  return {
    hideStatusExtras,
    hideHotbarExtras,
    setAllWindowObjectsVisible,
  };
}
