// SPDX-License-Identifier: Apache-2.0
function getWindowSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function normalizeViewportSize(size) {
  return {
    width: Math.max(1, Math.floor(size?.width ?? window.innerWidth)),
    height: Math.max(1, Math.floor(size?.height ?? window.innerHeight)),
  };
}

/**
 * Purpose: Wire desktop resize events so the renderer, camera, and optional callback stay synchronized with the viewport.
 * @param {object} [options={}] Resize wiring options.
 * @param {{ setSize: (width: number, height: number, updateStyle?: boolean) => void, xr?: { isPresenting?: boolean } }} options.renderer Renderer whose framebuffer size should track the viewport.
 * @param {{ aspect: number, updateProjectionMatrix: () => void }} options.camera Camera whose aspect and projection matrix should update on resize.
 * @param {(context: { renderer: unknown, camera: unknown }) => { width?: number, height?: number }} [options.getSize] Optional size resolver that can override the window dimensions.
 * @param {(size: { width: number, height: number }) => void} [options.onResize] Optional callback invoked after renderer and camera resize updates complete.
 * @param {boolean} [options.updateStyle=true] Whether renderer.setSize should also update the canvas style attributes.
 * @param {boolean} [options.runImmediately=false] Whether the resize handler should run once immediately after wiring.
 * @returns {() => void} Disposal function that removes the installed window resize listener.
 * Side effects: installs and removes a window resize listener, mutates renderer size, mutates camera aspect/projection, and may invoke onResize.
 */
export function wireDesktopResize({
  renderer,
  camera,
  getSize,
  onResize,
  updateStyle = true,
  runImmediately = false,
} = {}) {
  if (!renderer) throw new Error("wireDesktopResize: missing renderer");
  if (!camera) throw new Error("wireDesktopResize: missing camera");

  const resolveSize = typeof getSize === "function" ? getSize : getWindowSize;

  function handleResize() {
    if (renderer.xr?.isPresenting) return;

    let size;
    try {
      size = resolveSize({ renderer, camera });
    } catch {
      size = getWindowSize();
    }

    const { width, height } = normalizeViewportSize(size);

    renderer.setSize(width, height, updateStyle);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    try {
      onResize?.({ width, height });
    } catch {
      // no-op
    }
  }

  window.addEventListener("resize", handleResize);

  if (runImmediately) {
    try {
      handleResize();
    } catch {
      // no-op
    }
  }

  return () => window.removeEventListener("resize", handleResize);
}
