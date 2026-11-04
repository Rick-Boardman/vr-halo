// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD debug-panel entry generation and throttled refresh helpers.
 * @param {object} [options={}] Debug-entry runtime dependencies.
 * @param {object} options.THREE Three.js namespace used for temporary vector allocation.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to report XR presenting state.
 * @param {{ layoutW?: number, layoutH?: number, xr?: { supported?: boolean, status?: string }, vrPointer?: { _debugPick?: string }, ui?: { focus?: string | null, _vrAutoLayoutDone?: boolean, data?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {{ player?: any, playerYaw?: any, playerPitch?: any, lookState?: { yaw?: number, pitch?: number } | null, getWorldControlsEnabled?: (() => boolean) | null } | null} [options.rigDebug=null] Optional rig-debug references surfaced in debug entries.
 * @param {{ getWorldPosition?: (target: any) => void } | null} [options.vrAnchor=null] Optional VR anchor reported in debug entries.
 * @param {(value: unknown) => string} options.fmtBool Boolean formatter helper.
 * @param {(value: unknown) => string} options.fmtVec3 Vector formatter helper.
 * @param {(value: unknown) => string} options.fmtRad Radian formatter helper.
 * @param {number} options.textDefaultColor Default debug text color.
 * @param {number} options.textMutedColor Secondary/muted debug text color.
 * @param {() => string | null} options.getDragWindowKey Callback returning current drag-window key.
 * @param {() => string | null} options.getDragMode Callback returning current drag mode.
 * @param {() => void} options.markDirty Callback invoked when debug entry content changes.
 * @returns {{ updateDebugPanel: (dt?: number) => void, buildDebugEntries: () => Array<{ text: string, color: number }> }} Debug-panel refresh helpers.
 * Side effects: mutates `hud.ui.data.debugLines` and triggers rerender dirty-marking when debug content changes.
 */
export function createHudDebugEntriesRuntime({
  THREE,
  renderer,
  hud,
  rigDebug = null,
  vrAnchor = null,
  fmtBool,
  fmtVec3,
  fmtRad,
  textDefaultColor,
  textMutedColor,
  getDragWindowKey,
  getDragMode,
  markDirty,
} = {}) {
  const tmpV0 = new THREE.Vector3();
  const tmpForward = { x: 0, y: 0, z: 0 };
  let debugAccumT = 0;
  let debugLastSig = "";

  function sanitizeSignedZero(value) {
    return Math.abs(value) < 1e-6 ? 0 : value;
  }

  function pushEntry(entries, text, color) {
    const value = String(text ?? "");
    if (!value.trim()) return;
    entries.push({ text: value, color });
  }

  function buildDebugEntries() {
    const entries = [];
    const presenting = !!renderer?.xr?.isPresenting;

    pushEntry(entries, `XR: ${presenting ? "ON" : "OFF"} | supported=${fmtBool(!!hud?.xr?.supported)} | layout=${Math.floor(hud.layoutW)}×${Math.floor(hud.layoutH)}`, textDefaultColor);
    try {
      const status = String(hud?.xr?.status ?? "").trim();
      if (status) pushEntry(entries, `XR status: ${status}`, textMutedColor);
    } catch {
      // no-op
    }

    try {
      const player = rigDebug?.player;
      const playerYaw = rigDebug?.playerYaw;
      const playerPitch = rigDebug?.playerPitch;
      const lookState = rigDebug?.lookState;
      const worldControlsEnabled =
        typeof rigDebug?.getWorldControlsEnabled === "function"
          ? !!rigDebug.getWorldControlsEnabled()
          : null;
      const yaw = Number.isFinite(lookState?.yaw)
        ? Number(lookState.yaw)
        : (playerYaw?.rotation && Number.isFinite(playerYaw.rotation.y) ? Number(playerYaw.rotation.y) : null);
      const pitch = Number.isFinite(lookState?.pitch)
        ? Number(lookState.pitch)
        : (playerPitch?.rotation && Number.isFinite(playerPitch.rotation.x) ? Number(playerPitch.rotation.x) : null);
      const parts = [];
      if (player?.position) parts.push(`pos=${fmtVec3(player.position)}`);
      if (Number.isFinite(yaw)) parts.push(`yaw=${fmtRad(yaw)}`);
      if (Number.isFinite(pitch)) parts.push(`pitch=${fmtRad(pitch)}`);
      if (worldControlsEnabled != null) parts.push(`worldCtrl=${fmtBool(worldControlsEnabled)}`);
      if (parts.length) pushEntry(entries, `Rig: ${parts.join(" | ")}`, textDefaultColor);
      if (Number.isFinite(yaw) || Number.isFinite(pitch)) {
        const safeYaw = Number.isFinite(yaw) ? yaw : 0;
        const safePitch = Number.isFinite(pitch) ? pitch : 0;
        const cosPitch = Math.cos(safePitch);
        tmpForward.x = sanitizeSignedZero(-Math.sin(safeYaw) * cosPitch);
        tmpForward.y = sanitizeSignedZero(Math.sin(safePitch));
        tmpForward.z = sanitizeSignedZero(-Math.cos(safeYaw) * cosPitch);
        pushEntry(entries, `Rig.fwd: ${fmtVec3(tmpForward)}`, textMutedColor);
      }
    } catch {
      // no-op
    }

    try {
      const focus = String(hud?.ui?.focus ?? "") || "(none)";
      const dragWindowKey = getDragWindowKey();
      const dragMode = getDragMode();
      const drag = dragWindowKey ? `${dragMode || "?"}(${dragWindowKey})` : "none";
      pushEntry(entries, `HUD: focus=${focus} | drag=${drag} | vrAutoLayoutDone=${fmtBool(!!hud?.ui?._vrAutoLayoutDone)}`, textDefaultColor);
    } catch {
      // no-op
    }

    if (vrAnchor && typeof vrAnchor.getWorldPosition === "function") {
      try {
        vrAnchor.getWorldPosition(tmpV0);
        pushEntry(entries, `vrAnchor.posW: ${fmtVec3(tmpV0)}`, textMutedColor);
      } catch {
        // no-op
      }
    }

    if (presenting) {
      try {
        const pick = String(hud?.vrPointer?._debugPick ?? "");
        if (pick) pushEntry(entries, `vrPick: ${pick}`, textMutedColor);
      } catch {
        // no-op
      }
    }

    try {
      const p = hud?.ui?.data?.navProve;
      const vr = p?.vr;
      if (vr?.loco) {
        const l = vr.loco;
        pushEntry(entries, `VR move (L): hand=${String(l.handedness || "")} | map=${String(l.mapping || "")} | axes=${String(l.axesLen ?? "")} | pair=${String(l.pair || "")} | raw=${String(l.raw || "")}`, textDefaultColor);
      }
      if (vr?.turn) {
        const t = vr.turn;
        pushEntry(entries, `VR look (R): hand=${String(t.handedness || "")} | map=${String(t.mapping || "")} | axes=${String(t.axesLen ?? "")} | pair=${String(t.pair || "")} | raw=${String(t.raw || "")}`, textDefaultColor);
      }

      const srcs = Array.isArray(vr?.sources) ? vr.sources : null;
      if (srcs && srcs.length) {
        pushEntry(entries, `XR sources: ${srcs.length}`, textMutedColor);
        for (const s of srcs) {
          const hand = String(s?.handedness ?? "");
          const map = String(s?.mapping ?? "");
          const axesLen = String(s?.axesLen ?? "");
          const buttonsLen = String(s?.buttonsLen ?? "");
          const pair = String(s?.pair ?? "");
          const id = String(s?.id ?? "");
          const rayMode = String(s?.targetRayMode ?? "");
          const profiles = Array.isArray(s?.profiles) ? s.profiles.map(String).filter(Boolean) : [];
          const profile = profiles.length ? profiles[0] : "";
          const parts = [
            `hand=${hand}`,
            `map=${map}`,
            `axes=${axesLen}`,
            `btn=${buttonsLen}`,
            `pair=${pair}`,
            `id=${id || "(none)"}`,
            profile ? `profile=${profile}` : "",
            rayMode ? `ray=${rayMode}` : "",
          ].filter(Boolean);
          pushEntry(entries, `  - ${parts.join(" | ")}`, textMutedColor);
        }
      }
    } catch {
      // no-op
    }

    return entries;
  }

  function updateDebugPanel(dt) {
    debugAccumT += Number.isFinite(dt) ? dt : 0;
    if (debugAccumT < 0.25) return;
    debugAccumT = 0;

    try {
      const entries = buildDebugEntries();
      const sig = entries.map((entry) => `${entry.text}|${entry.color ?? 0}`).join("\n");
      if (sig === debugLastSig) return;
      debugLastSig = sig;
      hud.ui.data.debugLines = entries;
      markDirty();
    } catch {
      // no-op
    }
  }

  return {
    updateDebugPanel,
    buildDebugEntries,
  };
}
