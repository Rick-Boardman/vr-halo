// SPDX-License-Identifier: Apache-2.0
// Device input: normalization adapters for keys, XR sticks and buttons, VR
// hands and phone orientation, and a configurable axis and action mapping over
// them. No Three.js import, so it loads in any module context.
// Device limits and the permission rules are documented in ../README.md
// ("Device input") and in ./orientation.js.

export { keyPredicate, anyKeyDown, keyAxis } from "./keyboard.js";
export { stickPair, stickFromSources, buttonDown } from "./sticks.js";
export { handsAxes } from "./hands.js";
export {
  orientationAxes,
  requestOrientationPermission,
  createOrientationInput,
  ORIENTATION_MESSAGES,
  ORIENTATION_LOG,
} from "./orientation.js";
export { mapAxis, createInputMapping, INPUT_SOURCES } from "./mapping.js";
