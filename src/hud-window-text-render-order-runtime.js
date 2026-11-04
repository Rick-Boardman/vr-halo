// SPDX-License-Identifier: Apache-2.0
import { HUD_RENDER_ORDER_TEXT_OFFSET } from "./hud-layout-policy.js";

/**
 * Create shared HUD Troika render-order synchronization helpers for window text layers.
 * @param {object} [options={}] Text render-order runtime dependencies.
 * @param {{ objects?: { windows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {boolean} [options.featureTroikaTextRequested=true] Feature flag indicating whether Troika text rendering is enabled.
 * @param {() => Set<any> | null | undefined} options.getTroikaTextInstances Callback resolving the live Troika text instance registry.
 * @returns {{ syncTroikaRegistryRenderOrders: (args: { renderOrderBaseFor: (windowKey: string) => number }) => void, syncWindowTroikaRenderOrders: (objs: any) => void }} Helpers that keep asynchronously-updated Troika mesh ordering aligned with window stacking.
 * Side effects: mutates Troika text and color-layer render orders for window-bound text meshes.
 */
export function createHudWindowTextRenderOrderRuntime({
  hud,
  featureTroikaTextRequested = true,
  getTroikaTextInstances,
} = {}) {
  function syncTroikaRegistryRenderOrders({ renderOrderBaseFor } = {}) {
    if (!featureTroikaTextRequested) return;
    if (typeof renderOrderBaseFor !== "function") return;

    const troikaTextInstances = getTroikaTextInstances?.();
    if (!troikaTextInstances || troikaTextInstances.size === 0) return;

    for (const inst of troikaTextInstances) {
      const mesh = inst?.mesh;
      if (!mesh) continue;
      const windowKey = mesh?.userData?.windowKey;
      if (!windowKey) continue;

      const objs = hud.objects?.windows?.[windowKey];
      if (!objs) continue;

      const roBase = Number.isFinite(objs._renderOrderBase)
        ? Math.floor(objs._renderOrderBase)
        : renderOrderBaseFor(windowKey);

      const off = Number.isFinite(mesh?.userData?.hudRoOffset)
        ? Math.floor(mesh.userData.hudRoOffset)
        : HUD_RENDER_ORDER_TEXT_OFFSET;

      try {
        inst.setRenderOrder(roBase + off);
      } catch {
        // no-op
      }
    }
  }

  function syncWindowTroikaRenderOrders(objs) {
    if (!objs) return;
    const roTextBase =
      Number.isFinite(objs._textRenderOrderBase)
        ? Math.floor(objs._textRenderOrderBase)
        : null;
    const roColor =
      Number.isFinite(objs._colorLayerRenderOrderOverride)
        ? Math.floor(objs._colorLayerRenderOrderOverride)
        : null;

    if (roTextBase != null) {
      try {
        if (typeof objs.titleText?.setRenderOrder === "function") {
          objs.titleText.setRenderOrder(roTextBase);
        }
      } catch {
        // no-op
      }
      try {
        if (typeof objs.contentText?.setRenderOrder === "function") {
          objs.contentText.setRenderOrder(roTextBase);
        }
      } catch {
        // no-op
      }
      try {
        if (typeof objs.minLabel?.setRenderOrder === "function") {
          objs.minLabel.setRenderOrder(roTextBase);
        }
      } catch {
        // no-op
      }
      try {
        if (typeof objs.closeLabel?.setRenderOrder === "function") {
          objs.closeLabel.setRenderOrder(roTextBase);
        }
      } catch {
        // no-op
      }
      try {
        if (typeof objs.actionLabel?.setRenderOrder === "function") {
          objs.actionLabel.setRenderOrder(roTextBase);
        }
      } catch {
        // no-op
      }
      try {
        if (objs._troikaContentText) objs._troikaContentText.setRenderOrder(roTextBase);
      } catch {
        // no-op
      }
      try {
        if (Array.isArray(objs._troikaLineTexts)) {
          for (const lineText of objs._troikaLineTexts) {
            if (!lineText) continue;
            lineText.setRenderOrder(roTextBase);
          }
        }
      } catch {
        // no-op
      }
    }

    if (roColor != null && objs._troikaColorLayers && objs._troikaColorLayers instanceof Map) {
      for (const layer of objs._troikaColorLayers.values()) {
        if (!layer) continue;
        try {
          layer.setRenderOrder(roColor);
        } catch {
          // no-op
        }
      }
    }
  }

  return {
    syncTroikaRegistryRenderOrders,
    syncWindowTroikaRenderOrders,
  };
}
