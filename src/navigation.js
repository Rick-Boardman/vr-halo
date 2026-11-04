// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the canonical scene navigation factory from the shared navigation entrypoint.
 * Parameters: forwarded from createSceneNavigation in ./navigation/scene-navigation.js.
 * Return value: forwards the createSceneNavigation return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createSceneNavigation.
 */
export { createSceneNavigation } from "./navigation/scene-navigation.js";
