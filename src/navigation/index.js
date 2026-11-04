// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the shared isometric navigation factory from the broad navigation barrel.
 * Parameters: forwarded from createIsoNavigation in ../iso-navigation.js.
 * Return value: forwards the createIsoNavigation return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createIsoNavigation.
 */
export { createIsoNavigation } from "../iso-navigation.js";

/**
 * Purpose: Re-export the canonical scene navigation factory from the broad navigation barrel.
 * Parameters: forwarded from createSceneNavigation in ./scene-navigation.js.
 * Return value: forwards the createSceneNavigation return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createSceneNavigation.
 */
export { createSceneNavigation } from "./scene-navigation.js";

/**
 * Purpose: Re-export the canonical scene rig factory from the broad navigation barrel.
 * Parameters: forwarded from createSceneRig in ../rig.js.
 * Return value: forwards the createSceneRig return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createSceneRig.
 */
export { createSceneRig } from "../rig.js";

/**
 * Purpose: Re-export the shared flat-scene viewport controller from the navigation barrel.
 * Parameters: forwarded from createFlatSceneViewportControls in ./flat-scene-viewport-controls.js.
 * Return value: forwards the createFlatSceneViewportControls return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createFlatSceneViewportControls.
 */
export { createFlatSceneViewportControls } from "./flat-scene-viewport-controls.js";

/**
 * Purpose: Re-export the shared scene selection/hover coordinator from the navigation barrel.
 * Parameters: forwarded from wireSceneSelection in ./scene-selection.js.
 * Return value: forwards the wireSceneSelection return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke wireSceneSelection.
 */
export { wireSceneSelection } from "./scene-selection.js";
