// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared help-content state helpers for HUD navigation profiles and default/override help entries.
 * @param {object} [options={}] Help-content runtime dependencies.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to select VR vs desktop default help content.
 * @param {() => void} options.markDirty Callback invoked when help state mutations require rerender.
 * @param {number | string} options.textDefaultColor Default text color token for standard help lines.
 * @param {number | string} options.textInfoColor Info/accent text color token for section headers and secondary lines.
 * @param {number | string} options.textEmphasisColor Emphasis text color token for section labels.
 * @returns {{setNavigationHelpProfile: (profile: string | null | undefined) => void, setHelpExtraLines: (lines: Array<unknown> | unknown) => void, setHelpOverrideLines: (lines: Array<unknown> | unknown | null | undefined) => void, getResolvedHelpEntries: (additionalEntries?: Array<unknown> | unknown) => Array<unknown>}} Help-content helpers for HUD API and rendering paths.
 * Side effects: mutates internal help-state fields and marks HUD rendering dirty on state updates.
 */
export function createHudHelpContentRuntime({
  renderer,
  markDirty,
  textDefaultColor,
  textInfoColor,
  textEmphasisColor,
} = {}) {
  let navHelpProfile = "fly";
  let helpExtraLines = [];
  let helpOverrideLines = null;

  function setNavigationHelpProfile(profile) {
    const p = String(profile || "").trim();
    navHelpProfile = p || "fly";
    markDirty();
  }

  function setHelpExtraLines(lines) {
    helpExtraLines = Array.isArray(lines) ? lines : (lines ? [lines] : []);
    markDirty();
  }

  function setHelpOverrideLines(lines) {
    helpOverrideLines = lines == null ? null : (Array.isArray(lines) ? lines : [lines]);
    markDirty();
  }

  function getDefaultHelpEntries() {
    const presenting = !!renderer?.xr?.isPresenting;
    const lines = [];

    if (presenting) {
      lines.push({ text: "VR Controls", color: textInfoColor });
      lines.push({ text: "", color: textDefaultColor });
      lines.push({ text: "- Point controller ray at HUD", color: textDefaultColor });
      lines.push({ text: "- Select/trigger = click", color: textDefaultColor });
      lines.push({ text: "- Long-press = context menu", color: textDefaultColor });
      lines.push({ text: "", color: textDefaultColor });
      lines.push({ text: "Locomotion", color: textEmphasisColor });

      if (navHelpProfile === "fly") {
        lines.push({ text: "- Left stick: strafe + fly forward/back", color: textDefaultColor });
        lines.push({ text: "- Right stick: yaw + pitch", color: textDefaultColor });
        lines.push({ text: "- Movement is relative to view (includes pitch)", color: textDefaultColor });
      } else {
        lines.push({ text: "- Use thumbsticks (if enabled by nav mode)", color: textDefaultColor });
      }
      return lines;
    }

    lines.push({ text: "Desktop Controls", color: textInfoColor });
    lines.push({ text: "", color: textDefaultColor });

    if (navHelpProfile === "fly") {
      lines.push({ text: "- Mouse drag = look", color: textDefaultColor });
      lines.push({ text: "- WASD = move", color: textDefaultColor });
      lines.push({ text: "- Shift = faster (if enabled)", color: textDefaultColor });
      lines.push({ text: "- Q/E = yaw  R/F = pitch", color: textInfoColor });
      lines.push({ text: "- T = up  G = down", color: textInfoColor });
      lines.push({ text: "- X = toggle auto-walk", color: textInfoColor });
    } else {
      lines.push({ text: "- Mouse/keys: navigation depends on scene", color: textDefaultColor });
    }

    lines.push({ text: "", color: textDefaultColor });
    lines.push({ text: "HUD", color: textEmphasisColor });
    lines.push({ text: "- Scroll wheel / drag thumb = scroll panels", color: textDefaultColor });
    lines.push({ text: "- Drag title bar = move  corner = resize", color: textDefaultColor });
    lines.push({ text: "- Right click / long-press = context", color: textDefaultColor });

    return lines;
  }

  function getResolvedHelpEntries(additionalEntries = []) {
    const base = helpOverrideLines != null ? helpOverrideLines : getDefaultHelpEntries();
    const extra = helpOverrideLines != null ? [] : helpExtraLines;
    const extra2 = Array.isArray(additionalEntries)
      ? additionalEntries
      : [additionalEntries];

    return ([]).concat(
      Array.isArray(base) ? base : [base],
      Array.isArray(extra) ? extra : [extra],
      extra2
    );
  }

  return {
    setNavigationHelpProfile,
    setHelpExtraLines,
    setHelpOverrideLines,
    getResolvedHelpEntries,
  };
}
