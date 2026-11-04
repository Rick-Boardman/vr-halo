// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the shared XR controller bootstrap factory from the broad XR barrel.
 * Parameters: forwarded from createXrControllers in ../xr-controllers.js.
 * Return value: forwards the createXrControllers return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createXrControllers.
 */
export { createXrControllers } from "../xr-controllers.js";

/**
 * Purpose: Re-export the shared VR pointer highlight factory from the broad XR barrel.
 * Parameters: forwarded from createVRPointerHighlight in ./vr-pointer-highlight.js.
 * Return value: forwards the createVRPointerHighlight return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createVRPointerHighlight.
 */
export { createVRPointerHighlight } from "./vr-pointer-highlight.js";

/**
 * Purpose: Re-export the shared VRButton constructor from the broad XR barrel.
 * Parameters: forwarded from VRButton in ./vr-button.js.
 * Return value: forwards the VRButton public API from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke VRButton methods.
 */
export { VRButton } from "./vr-button.js";
