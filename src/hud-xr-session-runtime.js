// SPDX-License-Identifier: Apache-2.0
import { HUD_TEXT_INFO_COLOR } from "./hud-text-style.js";

/**
 * Create XR session management runtime for the HUD system.
 *
 * Handles WebXR session lifecycle: capability detection, enter/exit VR,
 * and state transitions including layout resets and HUD re-anchoring.
 *
 * @param {object} deps Session management dependencies.
 * @param {object} deps.hud The mutable HUD state object (reads/writes `.xr`, `.ui`).
 * @param {object} deps.renderer Three.js renderer with `.xr` session support.
 * @param {() => void} deps.markDirty Marks the HUD as needing a re-render.
 * @param {(entry: { text: string, color?: number }) => void} deps.appendChatLine Appends a system log line to the HUD chat.
 * @param {() => void} deps.setLayoutForMode Reconfigures HUD layout for current VR/desktop mode.
 * @param {() => void} deps.updatePlacementForMode Repositions HUD elements for current mode.
 * @param {() => void} deps.updateHudQuadSize Resizes the HUD quad geometry.
 * @param {() => void} deps.autoLayoutWindowsForVr Auto-positions HUD windows for VR.
 * @param {() => void} deps.setHudAnchorForMode Re-anchors HUD to the correct parent for current mode.
 * @param {(() => void) | null} [deps.onEnterVR] Optional callback invoked before VR presenting begins.
 * @param {(() => void) | null} [deps.onExitVR] Optional callback invoked after VR session ends.
 * @param {number | null} [deps.xrFramebufferScaleFactor] Optional framebuffer scale factor set before presenting.
 * @returns {{ updateXRSupport: () => Promise<void>, enterVR: () => Promise<void>, exitVR: () => Promise<void> }}
 *   XR session lifecycle API.
 * Side effects: queries `navigator.xr`, mutates `hud.xr.*` and `hud.ui.*` state,
 *   calls `renderer.xr.setSession()`, registers XR session event listeners.
 */
export function createHudXrSessionRuntime({
  hud,
  renderer,
  markDirty,
  appendChatLine,
  setLayoutForMode,
  updatePlacementForMode,
  updateHudQuadSize,
  autoLayoutWindowsForVr,
  setHudAnchorForMode,
  onEnterVR = null,
  onExitVR = null,
  xrFramebufferScaleFactor = null,
} = {}) {
  let xrSession = null;

  async function updateXRSupport() {
    if (!("xr" in navigator)) {
      hud.xr.supported = false;
      hud.xr.status = "WebXR not available.";
      if (!updateXRSupport._didLogVrCapability) {
        updateXRSupport._didLogVrCapability = true;
        try {
          appendChatLine({ text: "[System] VR: N/A", color: HUD_TEXT_INFO_COLOR });
        } catch {
          // no-op
        }
      }
      try {
        if (hud.ui) hud.ui._layoutInitialized = false;
      } catch {
        // no-op
      }
      markDirty();
      return;
    }
    try {
      const supported = await navigator.xr.isSessionSupported("immersive-vr");
      hud.xr.supported = !!supported;
      hud.xr.status = supported
        ? "WebXR immersive-vr supported."
        : "WebXR immersive-vr not supported.";

      try {
        if (hud.ui) hud.ui._layoutInitialized = false;
      } catch {
        // no-op
      }

      if (!supported && !updateXRSupport._didLogVrCapability) {
        updateXRSupport._didLogVrCapability = true;
        try {
          appendChatLine({ text: "[System] VR: N/A", color: HUD_TEXT_INFO_COLOR });
        } catch {
          // no-op
        }
      }
      markDirty();
    } catch {
      hud.xr.supported = false;
      hud.xr.status = "WebXR support check failed.";
      if (!updateXRSupport._didLogVrCapability) {
        updateXRSupport._didLogVrCapability = true;
        try {
          appendChatLine({ text: "[System] VR: N/A", color: HUD_TEXT_INFO_COLOR });
        } catch {
          // no-op
        }
      }
      try {
        if (hud.ui) hud.ui._layoutInitialized = false;
      } catch {
        // no-op
      }
      markDirty();
    }
  }

  async function enterVR() {
    if (!hud.xr.supported || xrSession) return;
    try {
      xrSession = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor"],
      });

      xrSession.addEventListener("end", () => {
        xrSession = null;
        hud.xr.presenting = false;

        try {
          appendChatLine({ text: "[System] VR: OFF", color: HUD_TEXT_INFO_COLOR });
        } catch {
          // no-op
        }

        try {
          if (typeof onExitVR === "function") onExitVR();
        } catch {
          // no-op
        }

        setLayoutForMode();
        updatePlacementForMode();
        updateHudQuadSize();
        hud.ui._vrAutoLayoutDone = false;
        markDirty();
      });

      try {
        if (typeof onEnterVR === "function") onEnterVR();
      } catch {
        // no-op
      }

      if (xrFramebufferScaleFactor != null) {
        try {
          renderer.xr.setFramebufferScaleFactor?.(xrFramebufferScaleFactor);
        } catch {
          // no-op
        }
      }

      await renderer.xr.setSession(xrSession);
      hud.xr.presenting = true;

      try {
        setHudAnchorForMode();
      } catch {
        // no-op
      }

      setLayoutForMode();
      updatePlacementForMode();
      updateHudQuadSize();
      if (!hud.ui._vrAutoLayoutDone) autoLayoutWindowsForVr();
      try {
        if (hud.ui) hud.ui._layoutInitialized = true;
      } catch {
        // no-op
      }
      markDirty();
    } catch (err) {
      hud.xr.status = `Enter VR failed: ${err?.message || String(err)}`;
      xrSession = null;
      hud.xr.presenting = false;
      markDirty();
    }
  }

  async function exitVR() {
    if (!xrSession) return;
    try {
      await xrSession.end();
    } catch (err) {
      hud.xr.status = `Exit VR failed: ${err?.message || String(err)}`;
      markDirty();
    }
  }

  // Kick off initial capability detection.
  updateXRSupport();

  return {
    updateXRSupport,
    enterVR,
    exitVR,
  };
}
