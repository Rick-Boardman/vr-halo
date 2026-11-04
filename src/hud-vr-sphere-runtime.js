// SPDX-License-Identifier: Apache-2.0
/**
 * Create reusable VR sphere scratch state for HUD depth and billboard calculations.
 * @param {object} [options={}] VR sphere dependencies.
 * @param {object} options.THREE Three.js namespace used to allocate vectors/spheres.
 * @param {number} options.vrDistance Radius in meters for the HUD interaction sphere.
 * @returns {{ vrSphereCenterW: any, vrSphere: any }} Scratch sphere center vector and sphere instance reused by VR HUD math.
 * Side effects: allocates vector and sphere instances.
 */
export function createHudVrSphereRuntime({ THREE, vrDistance } = {}) {
  const vrSphereCenterW = new THREE.Vector3();
  const vrSphere = new THREE.Sphere(vrSphereCenterW, vrDistance);
  return {
    vrSphereCenterW,
    vrSphere,
  };
}
