// SPDX-License-Identifier: Apache-2.0
function degToRad(degrees) {
  return (Number(degrees) * Math.PI) / 180;
}

function createSizeTarget() {
  return {
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    set(x, y) {
      this.width = x;
      this.height = y;
      this.x = x;
      this.y = y;
      return this;
    },
  };
}

export function calculateScreenScaleFactor(
  currentViewportHeight,
  referenceViewportHeight,
  currentFov,
  referenceFov
) {
  // Scale combines viewport height ratio with the perspective ratio tan(fov/2),
  // so HUD sizing stays visually stable as screen height and vertical FOV change.
  const viewportScale = referenceViewportHeight / currentViewportHeight;
  const fovScale =
    Math.tan(degToRad(currentFov) / 2) /
    Math.tan(degToRad(referenceFov) / 2);

  return viewportScale * fovScale;
}

/**
 * Compute the half extents of the camera plane at a given forward distance.
 * Purpose: convert camera FOV and aspect into world-space half-width and half-height values used by screen-space HUD placement helpers.
 * @param {{ fov: number, aspect: number }} camera Perspective camera whose projection defines the camera plane.
 * @param {number} distance Positive forward distance from the camera in world units.
 * @returns {{ halfWidth: number, halfHeight: number }} Camera-plane half extents in world units.
 * Side effects: none; pure projection helper.
 */
export function getCameraPlaneHalfExtents(camera, distance) {
  const verticalFov = degToRad(camera.fov);
  // Perspective half-height: h/2 = tan(verticalFov / 2) * distance, with width
  // derived from aspect so the helper stays aligned with the camera frustum.
  const halfHeight = Math.tan(verticalFov / 2) * distance;

  return {
    halfWidth: halfHeight * camera.aspect,
    halfHeight,
  };
}

/**
 * Convert a HUD rectangle from world-space size into normalized device coordinate half extents.
 * Purpose: map HUD width and height into NDC so callers can reason about screen coverage relative to the active camera projection.
 * @param {{ fov: number, aspect: number }} camera Perspective camera whose projection defines the camera plane.
 * @param {number} width HUD width in world units.
 * @param {number} height HUD height in world units.
 * @param {number} [distance=1.2] Camera-local forward distance in world units.
 * @param {number} [scaleX=1] Horizontal scale multiplier applied before conversion.
 * @param {number} [scaleY=1] Vertical scale multiplier applied before conversion.
 * @returns {{ x: number, y: number }} HUD half extents in normalized device coordinates.
 * Side effects: none; pure projection helper.
 */
export function calculateHudHalfExtentsInNdc(
  camera,
  width,
  height,
  distance = 1.2,
  scaleX = 1,
  scaleY = 1
) {
  const { halfWidth, halfHeight } = getCameraPlaneHalfExtents(camera, distance);

  return {
    // NDC uses [-1, 1] across the full camera plane, so dividing HUD half-size by
    // the plane half extents yields the fraction of that normalized range it occupies.
    x: ((width * scaleX) / 2) / halfWidth,
    y: ((height * scaleY) / 2) / halfHeight,
  };
}

/**
 * Position a camera-local HUD object from normalized screen coordinates.
 * Purpose: place HUD objects directly in camera-local space using normalized screen coordinates instead of ad hoc world offsets.
 * @param {{ position: { set: (x: number, y: number, z: number) => void } }} object Camera-local object to position.
 * @param {{ fov: number, aspect: number }} camera Perspective camera whose plane extents define the placement space.
 * @param {number} [screenX=0] Horizontal normalized screen coordinate where `-1` is left and `1` is right.
 * @param {number} [screenY=0] Vertical normalized screen coordinate where `-1` is bottom and `1` is top.
 * @param {number} [distance=1.2] Camera-local forward distance in world units.
 * @returns {unknown} The positioned object's local position vector.
 * Side effects: mutates the supplied object's local position.
 */
export function setCameraLocalHudPosition(
  object,
  camera,
  screenX = 0,
  screenY = 0,
  distance = 1.2
) {
  const { halfWidth, halfHeight } = getCameraPlaneHalfExtents(camera, distance);
  // Convert normalized screen coordinates back into camera-plane world units by
  // scaling against the current plane half extents at the chosen forward distance.
  object.position.set(screenX * halfWidth, screenY * halfHeight, -distance);
  return object.position;
}

/**
 * Capture a reference screen-size pin state for a set of HUD objects.
 * Purpose: snapshot the current camera, viewport, and object transforms so later resizes can preserve perceived on-screen scale.
 * @param {{ fov: number, aspect: number, position: { clone: () => unknown } }} camera Perspective camera whose reference projection state should be captured.
 * @param {{ getSize: (target: { set: (x: number, y: number) => unknown }) => { width: number, height: number } }} renderer Renderer used to read the current viewport size.
 * @param {Array<{ scale: { clone: () => unknown }, position: { clone: () => unknown } }>} [objects=[]] Objects whose original scale and position should be captured.
 * @returns {{ referenceWidth: number, referenceHeight: number, referenceFov: number, referenceAspect: number, referenceCameraPosition: unknown, objects: Array<{ object: unknown, originalScale: unknown, originalPosition: unknown }> }} Reference pin state used by later resize helpers.
 * Side effects: reads renderer size and clones camera and object transforms.
 */
export function createScreenSizePin(camera, renderer, objects = []) {
  const size = renderer.getSize(createSizeTarget());

  return {
    referenceWidth: size.width,
    referenceHeight: size.height,
    referenceFov: camera.fov,
    referenceAspect: camera.aspect,
    referenceCameraPosition: camera.position.clone(),
    objects: objects.map((object) => ({
      object,
      originalScale: object.scale.clone(),
      originalPosition: object.position.clone(),
    })),
  };
}

/**
 * Reapply screen-size pinning so HUD objects keep their apparent size after a projection change.
 * Purpose: rescale pinned HUD objects against the current viewport and FOV using a previously captured reference state.
 * @param {{ fov: number }} camera Perspective camera whose current FOV participates in the scale calculation.
 * @param {{ getSize: (target: { set: (x: number, y: number) => unknown }) => { width: number, height: number } }} renderer Renderer used to read the current viewport size.
 * @param {{ referenceHeight: number, referenceFov: number, objects: Array<{ object: { scale: { copy: (value: unknown) => { multiplyScalar: (value: number) => unknown } } }, originalScale: unknown }> }} pinState Reference pin state returned by createScreenSizePin(...).
 * @returns {void} Does not return a value.
 * Side effects: mutates the scale of each pinned object.
 */
export function applyScreenSizePin(camera, renderer, pinState) {
  const currentSize = renderer.getSize(createSizeTarget());

  const scaleFactor = calculateScreenScaleFactor(
    currentSize.height,
    pinState.referenceHeight,
    camera.fov,
    pinState.referenceFov
  );

  pinState.objects.forEach(({ object, originalScale }) => {
    object.scale.copy(originalScale).multiplyScalar(scaleFactor);
  });
}

/**
 * Resize the renderer and camera, then reapply screen-size pinning for a set of HUD objects.
 * Purpose: centralize the shared resize flow for camera-local HUD objects that should maintain apparent on-screen scale.
 * @param {{ aspect: number, updateProjectionMatrix: () => void, fov: number, position: { clone: () => unknown } }} camera Perspective camera to resize.
 * @param {{ getSize: (target: { set: (x: number, y: number) => unknown }) => { width: number, height: number }, setSize: (width: number, height: number) => void }} renderer Renderer to resize.
 * @param {number} newWidth New viewport width in pixels.
 * @param {number} newHeight New viewport height in pixels.
 * @param {Array<{ scale: { clone: () => unknown }, position: { clone: () => unknown } }>} [objects=[]] HUD objects whose scale should be preserved across the resize.
 * @returns {{ referenceWidth: number, referenceHeight: number, referenceFov: number, referenceAspect: number, referenceCameraPosition: unknown, objects: Array<{ object: unknown, originalScale: unknown, originalPosition: unknown }> }} Pin state captured before the resize.
 * Side effects: resizes the renderer, mutates camera aspect and projection, and mutates the scale of pinned HUD objects.
 */
export function handleScreenSizeResize(
  camera,
  renderer,
  newWidth,
  newHeight,
  objects = []
) {
  const pinState = createScreenSizePin(camera, renderer, objects);

  renderer.setSize(newWidth, newHeight);
  camera.aspect = newWidth / newHeight;
  camera.updateProjectionMatrix();
  applyScreenSizePin(camera, renderer, pinState);

  return pinState;
}

/**
 * Position an object at a normalized screen coordinate in world space while aligning it to the camera orientation.
 * Purpose: place HUD objects at screen edges or corners in world space using the active camera projection and object size.
 * @param {{ position: { clone: () => { set: (x: number, y: number, z: number) => unknown, applyMatrix4: (matrix: unknown) => unknown }, copy: (value: unknown) => unknown }, quaternion: { copy: (value: unknown) => unknown }, scale: { x: number, y: number }, width?: number, height?: number, options?: { width?: number, height?: number } }} object Object to position.
 * @param {{ matrixWorld: unknown, quaternion: unknown, fov: number, aspect: number }} camera Perspective camera whose plane and orientation define the placement space.
 * @param {number} [screenX=-1] Horizontal normalized anchor where `-1` is left and `1` is right.
 * @param {number} [screenY=1] Vertical normalized anchor where `-1` is bottom and `1` is top.
 * @param {number} [distance=1.2] Forward distance from the camera in world units.
 * @param {number} [marginX=0.03] Horizontal margin in world units.
 * @param {number} [marginY=0.03] Vertical margin in world units.
 * @returns {void} Does not return a value.
 * Side effects: mutates the supplied object's world position and quaternion.
 */
export function positionAtScreenCoordinate(
  object,
  camera,
  screenX = -1,
  screenY = 1,
  distance = 1.2,
  marginX = 0.03,
  marginY = 0.03
) {
  const { halfWidth, halfHeight } = getCameraPlaneHalfExtents(camera, distance);

  // Start from the requested NDC-style anchor by mapping [-1, 1] coordinates onto
  // the camera-plane half extents at the chosen forward distance.
  let x = screenX * halfWidth;
  let y = screenY * halfHeight;

  if (screenX < 0) x += marginX;
  else if (screenX > 0) x -= marginX;

  if (screenY > 0) y -= marginY;
  else if (screenY < 0) y += marginY;

  if (object.width && object.height) {
    const scaledWidth = object.width * object.scale.x;
    const scaledHeight = object.height * object.scale.y;

    if (screenX < 0) x += scaledWidth / 2;
    else if (screenX > 0) x -= scaledWidth / 2;

    if (screenY > 0) y -= scaledHeight / 2;
    else if (screenY < 0) y += scaledHeight / 2;
  } else if (object.options && object.options.width && object.options.height) {
    const scaledWidth = object.options.width * object.scale.x;
    const scaledHeight = object.options.height * object.scale.y;

    if (screenX < 0) x += scaledWidth / 2;
    else if (screenX > 0) x -= scaledWidth / 2;

    if (screenY > 0) y -= scaledHeight / 2;
    else if (screenY < 0) y += scaledHeight / 2;
  }

  const localPosition = object.position.clone();
  // Convert the camera-local placement back into world space so the object stays
  // glued to the requested screen coordinate while inheriting the camera orientation.
  localPosition.set(x, y, -distance);
  localPosition.applyMatrix4(camera.matrixWorld);
  object.position.copy(localPosition);
  object.quaternion.copy(camera.quaternion);
}
