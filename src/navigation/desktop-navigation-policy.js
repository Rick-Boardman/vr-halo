// SPDX-License-Identifier: Apache-2.0
/**
 * Canonical desktop navigation defaults for the shared walkabout input controller.
 * Purpose: define the baseline mouse-look, keyboard, and movement-speed policy values consumed by desktop navigation factories so app harnesses inherit a stable default control scheme.
 * @type {{mouseLookButton: number, mouseLookSensitivity: number, mouseDragThresholdPx: number, baseSpeed: number, fastMultiplier: number, speedRampEnabled: boolean, speedRampMaxMultiplier: number, speedRampAccelPerSec: number, speedRampDecelPerSec: number, yawSpeed: number, pitchSpeed: number, rollSpeed: number, keyboardKeyMode: string}}
 * Properties: `mouseLookButton` selects the drag-look mouse button, `mouseLookSensitivity` scales pointer look deltas, `mouseDragThresholdPx` debounces click-vs-drag transitions, `baseSpeed` and `fastMultiplier` set movement speed, `speedRamp*` tune acceleration ramping, `yawSpeed`/`pitchSpeed`/`rollSpeed` define keyboard look speeds, and `keyboardKeyMode` selects the keyboard mapping policy.
 * Side effects: none; the exported object is frozen to preserve a shared immutable default policy.
 */
export const DESKTOP_NAVIGATION_DEFAULTS = Object.freeze({
  mouseLookButton: 2,
  mouseLookSensitivity: 0.003,
  mouseDragThresholdPx: 3,
  baseSpeed: 2.2,
  fastMultiplier: 2.2,
  speedRampEnabled: false,
  speedRampMaxMultiplier: 6.0,
  speedRampAccelPerSec: 2.8,
  speedRampDecelPerSec: 3.8,
  yawSpeed: 1.6,
  pitchSpeed: 1.4,
  rollSpeed: 1.6,
  keyboardKeyMode: "smart",
})
