// SPDX-License-Identifier: Apache-2.0
const MIN_CROSSHAIR_SIZE = 0.02;
const DEFAULT_CROSSHAIR_SIZE = 0.06;
const MIN_CROSSHAIR_THICKNESS = 0.0015;
const CROSSHAIR_THICKNESS_RATIO = 0.18;
const OUTLINE_SCALE = 1.18;
const CORE_SCALE = 1.0;
const OUTLINE_RENDER_ORDER = 20000;
const CORE_RENDER_ORDER = 20001;
const CROSSHAIR_OUTLINE_COLOR = 0xffffff;
const CROSSHAIR_CORE_COLOR = 0x000000;
const MIN_CROSSHAIR_DISTANCE = 0.35;
const DEFAULT_CROSSHAIR_DISTANCE = 3.0;

/**
 * Create the shared facing-crosshair overlay used by walkabout navigation diagnostics.
 * Purpose: provide a lightweight overlay scene that renders a camera-facing crosshair at the current look direction so desktop and XR navigation can visualize the active facing vector.
 * @param {object} [options={}] Crosshair overlay configuration.
 * @param {any} options.THREE Three.js namespace that must expose Scene, Group, Vector3, Quaternion, MeshBasicMaterial, PlaneGeometry, and Mesh.
 * @param {{ xr?: { isPresenting?: boolean, getCamera?: (camera: unknown) => any } }} options.renderer Renderer whose XR manager distinguishes desktop vs XR crosshair updates.
 * @param {any} options.camera Camera used for overlay rendering and world-space placement fallback.
 * @param {any} [options.scene] Scene that draws the mark in the main pass. When set, render() does not clear depth or render again.
 * @param {(xrCamera: unknown, out: unknown) => unknown} [options.getVrCameraPivotWorldPos] Optional XR pivot helper that resolves the VR camera pivot in world space.
 * @param {() => boolean} [options.isEnabled] Optional predicate that controls crosshair visibility.
 * @param {number} [options.distance=3] World-space offset from the camera or player along the facing vector.
 * @param {number} [options.size=0.06] Base world-space crosshair size before distance scaling.
 * @returns {FacingCrosshairOverlay} Crosshair overlay controller exposing `update()`, `render()`, `hide()`, and `dispose()` methods.
 * Side effects: allocates an overlay scene, crosshair meshes, and working vectors/quaternions, mutates overlay object visibility and transforms during updates, and renders the overlay after the main scene when enabled.
 */
export function createFacingCrosshairOverlay({
  THREE,
  renderer,
  camera,
  scene = null,
  getVrCameraPivotWorldPos,
  isEnabled,
  distance = DEFAULT_CROSSHAIR_DISTANCE,
  size = DEFAULT_CROSSHAIR_SIZE,
} = {}) {
  return new FacingCrosshairOverlay({
    THREE,
    renderer,
    camera,
    scene,
    getVrCameraPivotWorldPos,
    isEnabled,
    distance,
    size,
  });
}

class FacingCrosshairOverlay {
  constructor({
    THREE,
    renderer,
    camera,
    scene = null,
    getVrCameraPivotWorldPos,
    isEnabled,
    distance,
    size,
  }) {
    if (!THREE) {
      throw new Error("createFacingCrosshairOverlay: THREE is required");
    }
    if (!renderer) {
      throw new Error("createFacingCrosshairOverlay: renderer is required");
    }
    if (!camera) {
      throw new Error("createFacingCrosshairOverlay: camera is required");
    }

    this._THREE = THREE;
    this._renderer = renderer;
    this._camera = camera;
    this._scene = scene;
    this._getVrCameraPivotWorldPos =
      typeof getVrCameraPivotWorldPos === "function" ? getVrCameraPivotWorldPos : null;
    this._isEnabled = typeof isEnabled === "function" ? isEnabled : () => false;
    this._distance = distance;
    this._size = size;

    this._facingCrosshair = null;
    this._overlayScene = null;

    this._axisZ = new THREE.Vector3(0, 0, 1);
    this._tmpQuat = new THREE.Quaternion();
    this._crossQuatW = new THREE.Quaternion();
    this._tmpVec3 = new THREE.Vector3();
    this._crossPos = new THREE.Vector3();
    this._camPosW = new THREE.Vector3();
    this._forwardW = new THREE.Vector3();
  }

  update() {
    if (!this._isEnabled()) {
      this.hide();
      return;
    }

    this._ensureCrosshair();
    this._updateCrosshair();
  }

  /** Places the mark from the camera as it is now: the frame loop calls this just before drawing on desktop. */
  sync() {
    if (this._renderer?.xr?.isPresenting) return;
    this.update();
  }

  render() {
    if (!this._isEnabled()) {
      this.hide();
      return;
    }
    // The mark is already in the main scene, drawn with the transparent pass.
    if (this._scene) return;
    if (!this._overlayScene || !this._facingCrosshair || !this._facingCrosshair.visible) {
      return;
    }

    const prevAutoClear = this._renderer.autoClear;
    try {
      this._renderer.autoClear = false;
      this._renderer.clearDepth();
      this._renderer.render(this._overlayScene, this._camera);
    } catch {
      // no-op
    } finally {
      this._renderer.autoClear = prevAutoClear;
    }
  }

  hide() {
    if (this._facingCrosshair) {
      this._facingCrosshair.visible = false;
    }
  }

  dispose() {
    const group = this._facingCrosshair;
    if (group) {
      this._overlayScene?.remove(group);
      this._scene?.remove(group);
      this._disposeObject3D(group);
    }

    this._facingCrosshair = null;
    this._overlayScene = null;
  }

  _ensureCrosshair() {
    if (this._facingCrosshair) {
      this._facingCrosshair.visible = true;
      return;
    }

    if (!this._scene && !this._overlayScene) {
      this._overlayScene = new this._THREE.Scene();
    }

    const group = new this._THREE.Group();
    group.frustumCulled = false;
    group.renderOrder = CORE_RENDER_ORDER;

    const size = Math.max(MIN_CROSSHAIR_SIZE, Number(this._size) || DEFAULT_CROSSHAIR_SIZE);
    const thickness = Math.max(MIN_CROSSHAIR_THICKNESS, size * CROSSHAIR_THICKNESS_RATIO);
    const outlineMeshes = this._createCrosshairMeshes({
      size,
      thickness,
      scale: OUTLINE_SCALE,
      color: CROSSHAIR_OUTLINE_COLOR,
      renderOrder: OUTLINE_RENDER_ORDER,
    });
    const coreMeshes = this._createCrosshairMeshes({
      size,
      thickness,
      scale: CORE_SCALE,
      color: CROSSHAIR_CORE_COLOR,
      renderOrder: CORE_RENDER_ORDER,
    });

    outlineMeshes.concat(coreMeshes).forEach((mesh) => group.add(mesh));

    group.visible = true;
    if (this._scene) this._scene.add(group);
    else this._overlayScene.add(group);
    this._facingCrosshair = group;
  }

  _createCrosshairMeshes({ size, thickness, scale, color, renderOrder }) {
    const material = new this._THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    const horizontalGeometry = new this._THREE.PlaneGeometry(size * scale, thickness * scale);
    const verticalGeometry = new this._THREE.PlaneGeometry(thickness * scale, size * scale);
    const horizontal = new this._THREE.Mesh(horizontalGeometry, material);
    const vertical = new this._THREE.Mesh(verticalGeometry, material);

    horizontal.frustumCulled = false;
    vertical.frustumCulled = false;
    horizontal.renderOrder = renderOrder;
    vertical.renderOrder = renderOrder;

    return [horizontal, vertical];
  }

  _updateCrosshair() {
    if (!this._facingCrosshair || !this._facingCrosshair.visible) {
      return;
    }

    const inVr = !!(this._renderer && this._renderer.xr && this._renderer.xr.isPresenting);
    const distance = this._getDistance();

    if (inVr) {
      this._updateVrCrosshair(distance);
      return;
    }

    this._updateDesktopCrosshair(distance);
  }

  _updateVrCrosshair(distance) {
    try {
      const xrCam = this._renderer.xr.getCamera(this._camera);
      if (this._getVrCameraPivotWorldPos) {
        this._getVrCameraPivotWorldPos(xrCam, this._camPosW);
      } else {
        xrCam.updateMatrixWorld(true);
        xrCam.getWorldPosition(this._camPosW);
      }
      xrCam.updateMatrixWorld(true);
      xrCam.getWorldQuaternion(this._tmpQuat).normalize();
    } catch {
      this._camera.updateMatrixWorld(true);
      this._camera.getWorldPosition(this._camPosW);
      try {
        this._camera.getWorldQuaternion(this._tmpQuat).normalize();
      } catch {
        this._tmpQuat.set(0, 0, 0, 1);
      }
    }

    // VR forward = q * (0, 0, -1). The runtime uses -Z as the canonical forward
    // axis, so rotating that basis vector by the XR camera quaternion yields the
    // world-space direction where the headset is currently facing.
    this._forwardW.set(0, 0, -1).applyQuaternion(this._tmpQuat).normalize();
    this._crossPos.copy(this._camPosW).addScaledVector(this._forwardW, distance);
    this._facingCrosshair.position.copy(this._crossPos);
    this._facingCrosshair.scale.setScalar(1);

    // Face the overlay back toward the camera by mapping the crosshair's local
    // +Z normal onto -forward, so the planar meshes remain readable from the
    // viewer after world-space placement.
    this._tmpVec3.copy(this._forwardW).multiplyScalar(-1).normalize();
    this._crossQuatW.setFromUnitVectors(this._axisZ, this._tmpVec3);
    this._facingCrosshair.quaternion.copy(this._crossQuatW);
    this._facingCrosshair.visible = true;
  }

  _updateDesktopCrosshair(distance) {
    // The mark is at the centre of the view, so it comes from the camera that draws the frame. An application can move
    // the camera without the navigation rig (Conduit's and Loom's viewports do), so the rig's position and look would
    // put the mark somewhere else on the screen every time the view is dragged.
    this._camera.updateWorldMatrix(true, false);
    this._camera.getWorldPosition(this._camPosW);
    this._camera.getWorldQuaternion(this._tmpQuat).normalize();
    this._forwardW.set(0, 0, -1).applyQuaternion(this._tmpQuat).normalize();
    this._crossPos.copy(this._camPosW).addScaledVector(this._forwardW, distance);
    this._facingCrosshair.position.copy(this._crossPos);
    this._facingCrosshair.scale.setScalar(1);
    this._facingCrosshair.quaternion.copy(this._tmpQuat);
    this._facingCrosshair.visible = true;
  }

  _getDistance() {
    return Math.max(MIN_CROSSHAIR_DISTANCE, Number(this._distance) || DEFAULT_CROSSHAIR_DISTANCE);
  }

  _disposeObject3D(root) {
    root.traverse((child) => {
      if (child.geometry && typeof child.geometry.dispose === "function") {
        child.geometry.dispose();
      }

      if (!child.material) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material && typeof material.dispose === "function") {
          material.dispose();
        }
      });
    });
  }
}
