// SPDX-License-Identifier: Apache-2.0
import { applyDomStyles, setDomOverlayVisible } from "./dom-overlays.js";
import { UI_CORNER_INSET_PX } from "./ui-positioning-policy.js";

const DEFAULT_OVERLAY_BACKGROUND = "rgba(20,40,40,0.98)";
const DEFAULT_OVERLAY_Z_INDEX = "1000";
const DEFAULT_CLOSE_BUTTON_Z_INDEX = "1001";
const DEFAULT_BACKGROUND_DISPLAY_VALUE = "block";

function resolveElement({ element = null, elementId = "" } = {}) {
  if (element) {
    return element;
  }

  if (!elementId) {
    return null;
  }

  return document.getElementById(elementId);
}

function setBackgroundElementVisible({
  backgroundElement = null,
  backgroundElementId = "",
  visible,
  backgroundDisplayValue = DEFAULT_BACKGROUND_DISPLAY_VALUE,
} = {}) {
  const resolvedElement = resolveElement({
    element: backgroundElement,
    elementId: backgroundElementId,
  });

  if (!resolvedElement) {
    return null;
  }

  setDomOverlayVisible(resolvedElement, visible, backgroundDisplayValue);
  return resolvedElement;
}

/**
 * Create or reuse a fullscreen DOM overlay shell for demos that need a dedicated canvas host and close button.
 * Purpose: centralize the shared DOM structure used by fullscreen runtime demos instead of rebuilding overlay markup in each app.
 * @param {object} [options={}] Fullscreen overlay configuration.
 * @param {string} [options.containerId] DOM id assigned to the fullscreen overlay root.
 * @param {string} [options.closeButtonId] DOM id assigned to the overlay close button when default markup is used.
 * @param {string} [options.title] Title text rendered into the default overlay header when `contentHtml` is omitted.
 * @param {string} [options.canvasId] DOM id assigned to the default canvas host element.
 * @param {string} [options.extraHtml] Additional HTML appended after the default canvas host when `contentHtml` is omitted.
 * @param {string} [options.contentHtml] Complete overlay HTML that replaces the default overlay markup when provided.
 * @param {HTMLElement} [options.parent=document.body] Parent element that receives a newly created overlay root.
 * @param {HTMLElement | null} [options.backgroundElement=null] Existing page element that should be hidden while the overlay is open.
 * @param {string} [options.backgroundElementId=""] DOM id used to resolve the background element when `backgroundElement` is not supplied.
 * @param {string} [options.backgroundDisplayValue="block"] Display value restored on the background element when the overlay closes.
 * @param {string} [options.overlayBackground="rgba(20,40,40,0.98)"] CSS background applied to the overlay root.
 * @param {string} [options.overlayZIndex="1000"] CSS z-index applied to the overlay root.
 * @param {string} [options.closeButtonZIndex="1001"] CSS z-index applied to the default close button.
 * @returns {{ backgroundDisplayValue: string, backgroundElement: HTMLElement | null, backgroundElementId: string, canvasHost: HTMLElement | null, closeButton: HTMLElement | null, overlayElement: HTMLElement }} Overlay DOM handles used by shared demo lifecycle helpers.
 * Side effects: may hide a background element, create and append a fullscreen DOM node, mutate existing overlay markup, and resolve descendant elements by id.
 */
export function createFullscreenOverlay({
  containerId,
  closeButtonId,
  title,
  canvasId,
  extraHtml,
  contentHtml,
  parent = document.body,
  backgroundElement = null,
  backgroundElementId = "",
  backgroundDisplayValue = DEFAULT_BACKGROUND_DISPLAY_VALUE,
  overlayBackground = DEFAULT_OVERLAY_BACKGROUND,
  overlayZIndex = DEFAULT_OVERLAY_Z_INDEX,
  closeButtonZIndex = DEFAULT_CLOSE_BUTTON_Z_INDEX,
} = {}) {
  const resolvedBackgroundElement = setBackgroundElementVisible({
    backgroundElement,
    backgroundElementId,
    visible: false,
    backgroundDisplayValue,
  });

  let overlayElement = document.getElementById(containerId);
  if (!overlayElement) {
    overlayElement = document.createElement("div");
    overlayElement.id = containerId;
    applyDomStyles(overlayElement, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: overlayBackground,
      zIndex: overlayZIndex,
    });
    parent.appendChild(overlayElement);
  } else {
    overlayElement.style.display = "block";
  }

  if (contentHtml) {
    overlayElement.innerHTML = contentHtml;
  } else {
    overlayElement.innerHTML =
      '<button id="' +
      closeButtonId +
      '" style="position:absolute;top:' +
      UI_CORNER_INSET_PX +
      'px;right:' +
      UI_CORNER_INSET_PX +
      'px;z-index:' +
      closeButtonZIndex +
      ';">Back</button>' +
      '<div style="color:white;position:absolute;top:' +
      UI_CORNER_INSET_PX +
      'px;left:' +
      UI_CORNER_INSET_PX +
      'px;font-size:2em;">' +
      title +
      "</div>" +
      '<div id="' +
      canvasId +
      '" style="width:100vw;height:100vh;"></div>' +
      (extraHtml || "");
  }

  return {
    backgroundDisplayValue,
    backgroundElement: resolvedBackgroundElement,
    backgroundElementId,
    canvasHost: canvasId ? document.getElementById(canvasId) : null,
    closeButton: closeButtonId ? document.getElementById(closeButtonId) : null,
    overlayElement,
  };
}

/**
 * Tear down a fullscreen demo overlay and restore the underlying page surface.
 * Purpose: provide one shared cleanup path for overlay demos so animation loops, renderers, and background visibility all unwind consistently.
 * @param {object} [options={}] Overlay close configuration.
 * @param {number | null} [options.animationFrameId=null] Active requestAnimationFrame handle to cancel before disposing resources.
 * @param {HTMLElement | null} [options.overlayElement=null] Overlay root element whose display should be hidden.
 * @param {HTMLElement | null} [options.backgroundElement=null] Background page element to show again after the overlay closes.
 * @param {string} [options.backgroundElementId=""] DOM id used to resolve the background element when `backgroundElement` is not supplied.
 * @param {string} [options.backgroundDisplayValue="block"] Display value restored on the background element.
 * @param {{ domElement?: HTMLElement | null, dispose?: () => void } | null} [options.renderer=null] Renderer instance whose canvas may be removed and whose resources should be disposed.
 * @param {{ dispose?: () => void } | null} [options.controls=null] Optional control instance disposed during close.
 * @param {boolean} [options.removeCanvas=false] Whether the renderer canvas should be removed from the DOM before disposal.
 * @returns {void} Does not return a value.
 * Side effects: cancels animation frames, toggles overlay and background visibility, may remove a renderer canvas from the DOM, and disposes renderer or control resources.
 */
export function closeFullscreenOverlay({
  animationFrameId = null,
  overlayElement = null,
  backgroundElement = null,
  backgroundElementId = "",
  backgroundDisplayValue = DEFAULT_BACKGROUND_DISPLAY_VALUE,
  renderer = null,
  controls = null,
  removeCanvas = false,
} = {}) {
  if (animationFrameId !== null && animationFrameId !== undefined) {
    cancelAnimationFrame(animationFrameId);
  }

  if (overlayElement) {
    overlayElement.style.display = "none";
  }

  setBackgroundElementVisible({
    backgroundElement,
    backgroundElementId,
    visible: true,
    backgroundDisplayValue,
  });

  if (renderer) {
    if (removeCanvas) {
      const canvas = renderer.domElement;
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
    renderer.dispose();
  }

  if (controls && typeof controls.dispose === "function") {
    controls.dispose();
  }
}

/**
 * Attach the standard close-button behavior for a fullscreen overlay lifecycle.
 * Purpose: connect overlay close buttons to the shared teardown routine without duplicating per-demo DOM wiring.
 * @param {object} [options={}] Close-button binding configuration.
 * @param {HTMLElement | null} [options.closeButton=null] Button element that should close the overlay when clicked.
 * @param {HTMLElement | null} [options.overlayElement=null] Overlay root element passed to closeFullscreenOverlay(...).
 * @param {HTMLElement | null} [options.backgroundElement=null] Background page element restored after close.
 * @param {string} [options.backgroundElementId=""] DOM id used to resolve the background element when `backgroundElement` is not supplied.
 * @param {string} [options.backgroundDisplayValue="block"] Display value restored on the background element.
 * @param {(() => number | null) | null} [options.getAnimationFrameId=null] Callback that returns the current requestAnimationFrame handle.
 * @param {(() => ({ domElement?: HTMLElement | null, dispose?: () => void } | null)) | null} [options.getRenderer=null] Callback that returns the current renderer.
 * @param {(() => ({ dispose?: () => void } | null)) | null} [options.getControls=null] Callback that returns the current control instance.
 * @param {(() => void) | null} [options.onAfterClose=null] Optional callback invoked after the shared close routine completes.
 * @returns {void} Does not return a value.
 * Side effects: installs an onclick handler on the supplied button that closes the overlay, disposes resources, and may invoke a follow-up callback.
 */
export function bindFullscreenOverlayCloseButton({
  closeButton = null,
  overlayElement = null,
  backgroundElement = null,
  backgroundElementId = "",
  backgroundDisplayValue = DEFAULT_BACKGROUND_DISPLAY_VALUE,
  getAnimationFrameId = null,
  getRenderer = null,
  getControls = null,
  onAfterClose = null,
} = {}) {
  if (!closeButton) {
    return;
  }

  closeButton.onclick = function () {
    closeFullscreenOverlay({
      animationFrameId:
        typeof getAnimationFrameId === "function" ? getAnimationFrameId() : null,
      overlayElement,
      backgroundElement,
      backgroundElementId,
      backgroundDisplayValue,
      renderer: typeof getRenderer === "function" ? getRenderer() : null,
      controls: typeof getControls === "function" ? getControls() : null,
    });

    if (typeof onAfterClose === "function") {
      onAfterClose();
    }
  };
}

/**
 * Run the standard animation loop and close lifecycle for a fullscreen overlay demo.
 * Purpose: share the common requestAnimationFrame orchestration used by fullscreen runtime demos that render into a temporary overlay scene.
 * @param {object} [options={}] Fullscreen render-loop configuration.
 * @param {{ renderer?: { render?: (scene: unknown, camera: unknown) => void } | null, scene?: unknown, camera?: unknown, closeButton?: HTMLElement | null, overlayElement?: HTMLElement | null, demoDiv?: HTMLElement | null, backgroundElement?: HTMLElement | null, backgroundElementId?: string, backgroundDisplayValue?: string, controls?: { dispose?: () => void } | null }} [options.overlayContext=null] Shared overlay runtime state used for rendering and cleanup.
 * @param {(() => void) | null} [options.updateFrame=null] Optional per-frame update callback invoked before rendering.
 * @param {((overlayContext: object) => void) | null} [options.renderFrame=null] Optional custom render callback; defaults to `renderer.render(scene, camera)` when omitted.
 * @param {(() => void) | null} [options.onAfterClose=null] Optional callback invoked after the overlay is closed and local references are cleared.
 * @returns {void} Does not return a value.
 * Side effects: starts a requestAnimationFrame loop, renders the overlay scene each frame, binds the overlay close button, and nulls renderer/control references after close.
 */
export function runFullscreenOverlayRenderLoop({
  overlayContext = null,
  updateFrame = null,
  renderFrame = null,
  onAfterClose = null,
} = {}) {
  if (
    !overlayContext ||
    !overlayContext.renderer ||
    !overlayContext.scene ||
    !overlayContext.camera
  ) {
    return;
  }

  let animationFrameId = null;

  function animate() {
    if (typeof updateFrame === "function") {
      updateFrame();
    }

    if (typeof renderFrame === "function") {
      renderFrame(overlayContext);
    } else {
      overlayContext.renderer.render(overlayContext.scene, overlayContext.camera);
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  animate();

  bindFullscreenOverlayCloseButton({
    closeButton: overlayContext.closeButton,
    overlayElement: overlayContext.overlayElement ?? overlayContext.demoDiv,
    backgroundElement: overlayContext.backgroundElement,
    backgroundElementId: overlayContext.backgroundElementId,
    backgroundDisplayValue:
      overlayContext.backgroundDisplayValue ?? DEFAULT_BACKGROUND_DISPLAY_VALUE,
    getAnimationFrameId: function () {
      return animationFrameId;
    },
    getRenderer: function () {
      return overlayContext.renderer;
    },
    getControls: function () {
      return overlayContext.controls;
    },
    onAfterClose: function () {
      if (typeof onAfterClose === "function") {
        onAfterClose();
      }

      animationFrameId = null;
      overlayContext.renderer = null;
      overlayContext.controls = null;
    },
  });
}
