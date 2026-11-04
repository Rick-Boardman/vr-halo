// SPDX-License-Identifier: Apache-2.0
/**
 * Create the shared XR pointer highlight object used by controller-driven HUD and world interactions.
 * Purpose: construct a Three.js object that renders a controller ray, hit indicators, and trigger feedback so runtime XR input paths can visualize pointer state without reimplementing the geometry and animation stack.
 * @param {object} [options={}] XR pointer highlight configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Vector3, BufferGeometry, LineBasicMaterial, Line, SphereGeometry, RingGeometry, MeshBasicMaterial, Mesh, and DoubleSide.
 * @param {number} [options.rayLength=3] Default local-space ray length used when the live pointer distance is not supplied.
 * @param {number} [options.rayColor=0x00ff00] Base ray color shown while the pointer is active without a hit.
 * @param {number} [options.hitColor=0xff0000] Highlight color used for the hit indicator meshes and hit-state ray tint.
 * @param {number} [options.triggerColor=0xffff00] Trigger-feedback color used for the pulsing controller ring.
 * @returns {any} Three.js Object3D instance with `show()`, `hide()`, `updateRay(origin, direction, distance)`, `showHit(hitPoint)`, `hideHit()`, `showTriggerPressed()`, `hideTriggerPressed()`, `updateTriggerAnimation(deltaTime)`, `setTarget(target)`, and `dispose()` methods.
 * Side effects: allocates Three.js geometries, materials, and meshes for the ray plus hit indicators, mutates their visibility and transforms as pointer state changes, and requires `dispose()` to release allocated graphics resources.
 */
export function createVRPointerHighlight({
  THREE,
  rayLength = 3,
  rayColor = 0x00ff00,
  hitColor = 0xff0000,
  triggerColor = 0xffff00,
} = {}) {
  if (!THREE) throw new Error("createVRPointerHighlight requires THREE");

  class VRPointerHighlight extends THREE.Object3D {
    constructor() {
      super();

      this._THREE = THREE;
      this._rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -rayLength),
      ]);
      this._rayMaterial = new THREE.LineBasicMaterial({
        color: rayColor,
        opacity: 0.6,
        transparent: true,
        linewidth: 2,
      });
      this._rayLine = new THREE.Line(this._rayGeometry, this._rayMaterial);
      this.add(this._rayLine);

      this._rayGlowMaterial = new THREE.LineBasicMaterial({
        color: rayColor,
        opacity: 0.2,
        transparent: true,
        linewidth: 4,
      });
      this._rayGlow = new THREE.Line(this._rayGeometry, this._rayGlowMaterial);
      this.add(this._rayGlow);

      this._hitGeometry = new THREE.SphereGeometry(0.01, 8, 8);
      this._hitMaterial = new THREE.MeshBasicMaterial({
        color: hitColor,
        opacity: 0.8,
        transparent: true,
      });
      this._hitIndicator = new THREE.Mesh(this._hitGeometry, this._hitMaterial);
      this.add(this._hitIndicator);
      this._hitIndicator.visible = false;

      this._hitGlowGeometry = new THREE.SphereGeometry(0.015, 8, 8);
      this._hitGlowMaterial = new THREE.MeshBasicMaterial({
        color: hitColor,
        opacity: 0.3,
        transparent: true,
      });
      this._hitGlow = new THREE.Mesh(
        this._hitGlowGeometry,
        this._hitGlowMaterial
      );
      this.add(this._hitGlow);
      this._hitGlow.visible = false;

      this._triggerGeometry = new THREE.RingGeometry(0.02, 0.03, 8);
      this._triggerMaterial = new THREE.MeshBasicMaterial({
        color: triggerColor,
        opacity: 0.7,
        transparent: true,
        side: THREE.DoubleSide,
      });
      this._triggerIndicator = new THREE.Mesh(
        this._triggerGeometry,
        this._triggerMaterial
      );
      this._triggerIndicator.rotation.x = -Math.PI / 2;
      this.add(this._triggerIndicator);
      this._triggerIndicator.visible = false;

      this._triggerTime = 0;
      this.visible = false;
    }

    show() {
      this.visible = true;
    }

    hide() {
      this.visible = false;
      this._hitIndicator.visible = false;
      this._hitGlow.visible = false;
      this._triggerIndicator.visible = false;
    }

    updateRay(origin, direction, distance = 3) {
      if (!this.visible) return;

      const endPoint = origin
        .clone()
        .add(direction.clone().multiplyScalar(distance));
      this._rayGeometry.setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -distance),
      ]);
      this._rayGeometry.attributes.position.needsUpdate = true;

      this.position.copy(origin);
      this.lookAt(endPoint);
      this._triggerIndicator.position.set(0, 0, 0);

      const baseColor = this._hitIndicator.visible ? 0xff4444 : 0x00ff00;
      this._rayMaterial.color.setHex(baseColor);
      this._rayGlowMaterial.color.setHex(baseColor);
    }

    showHit(hitPoint) {
      if (!this.visible) return;

      this._hitIndicator.visible = true;
      this._hitGlow.visible = true;

      const localHitPoint = this.worldToLocal(hitPoint.clone());
      this._hitIndicator.position.copy(localHitPoint);
      this._hitGlow.position.copy(localHitPoint);
    }

    hideHit() {
      this._hitIndicator.visible = false;
      this._hitGlow.visible = false;
    }

    showTriggerPressed() {
      this._triggerIndicator.visible = true;
      this._triggerTime = 0;
    }

    hideTriggerPressed() {
      this._triggerIndicator.visible = false;
    }

    updateTriggerAnimation(deltaTime) {
      if (this._triggerIndicator.visible) {
        this._triggerTime += deltaTime;

        // opacity = 0.8 * (0.8 + 0.2 * sin(t * 8)); the sine term keeps the
        // trigger ring pulsing between 60% and 80% opacity while preserving a
        // positive baseline so the feedback never fully disappears.
        const pulse = 0.8 + 0.2 * Math.sin(this._triggerTime * 8);
        this._triggerIndicator.material.opacity = pulse * 0.8;

        // scale = 1 + 0.1 * sin(t * 6); a small sinusoidal scale offset makes
        // the ring breathe around unit size instead of changing its center.
        const scale = 1 + 0.1 * Math.sin(this._triggerTime * 6);
        this._triggerIndicator.scale.set(scale, scale, scale);

        const hue = Math.max(0.15 - this._triggerTime * 0.05, 0);
        this._triggerIndicator.material.color.setHSL(hue, 1, 0.6);
      }

      if (this._hitGlow.visible) {
        const time = performance.now() * 0.005;
        // glow opacity and scale both use low-amplitude sine waves so the hit
        // marker expands and fades smoothly instead of stepping between states.
        const glowPulse = 0.2 + 0.1 * Math.sin(time * 3);
        this._hitGlow.material.opacity = glowPulse;
        const glowScale = 1 + 0.2 * Math.sin(time * 4);
        this._hitGlow.scale.set(glowScale, glowScale, glowScale);
      }
    }

    setTarget(target) {
      this._target = target;
    }

    dispose() {
      this._rayGeometry?.dispose();
      this._hitGeometry?.dispose();
      this._hitGlowGeometry?.dispose();
      this._triggerGeometry?.dispose();
      this._rayMaterial?.dispose();
      this._rayGlowMaterial?.dispose();
      this._hitMaterial?.dispose();
      this._hitGlowMaterial?.dispose();
      this._triggerMaterial?.dispose();
    }
  }

  return new VRPointerHighlight();
}
