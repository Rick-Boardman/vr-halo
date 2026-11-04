// SPDX-License-Identifier: Apache-2.0
const HUD_CONTEXT_LONG_PRESS_SECONDS = 0.45;
const HUD_CONTEXT_LONG_PRESS_SLOP_PX = 10;

/**
 * Create pointer-step input helpers for HUD click/drag and context-menu long-press handling.
 * @param {object} [options={}] Pointer-step runtime configuration.
 * @param {any} options.hud Shared HUD model containing overlay state used to guard long-press context actions.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer whose XR presentation state gates click handling.
 * @param {() => boolean} options.isDragModeActive Callback that reports whether HUD drag mode is currently active.
 * @param {{ getContextTargetAt?: (x: number, y: number) => {holdEligible?: boolean} | null, openContextMenuAtPointer?: (pointer: any) => void }} options.uiOverlays Overlay helpers for context-target hit testing and context-menu opening.
 * @param {(pointer: any) => void} options.handleClick Callback that applies HUD click interactions.
 * @param {(pointer: any) => void} options.handleDrag Callback that applies HUD drag interactions.
 * @returns {{stepInput: (pointer: any, dt: number) => void}} Pointer-step helpers for one-frame HUD input processing.
 * Side effects: mutates transient pointer hold/click/release flags, may open HUD context menus, and may dispatch click or drag handlers.
 */
export function createHudPointerStepRuntime({
  hud,
  renderer,
  isDragModeActive,
  uiOverlays,
  handleClick,
  handleDrag,
} = {}) {
  function stepInput(pointer, dt) {
    if (pointer.justPressed) {
      pointer._holdTime = 0;
      pointer._holdStartX = pointer.x;
      pointer._holdStartY = pointer.y;
      pointer._holdFired = false;
      pointer._holdEligible = !!uiOverlays
        .getContextTargetAt(pointer.x, pointer.y)
        ?.holdEligible;
    }

    if (pointer.contextJustRequested) {
      uiOverlays.openContextMenuAtPointer(pointer);
      pointer.contextJustRequested = false;
    }

    if (
      pointer.down &&
      pointer.active &&
      !isDragModeActive?.() &&
      !hud.overlay?.contextMenu?.open &&
      !pointer._holdFired &&
      !!pointer._holdEligible
    ) {
      const dx = pointer.x - (pointer._holdStartX ?? pointer.x);
      const dy = pointer.y - (pointer._holdStartY ?? pointer.y);
      const moved = Math.abs(dx) + Math.abs(dy);
      if (moved > HUD_CONTEXT_LONG_PRESS_SLOP_PX) {
        pointer._holdTime = 0;
        pointer._holdStartX = pointer.x;
        pointer._holdStartY = pointer.y;
      } else {
        pointer._holdTime += dt;
        if (pointer._holdTime >= HUD_CONTEXT_LONG_PRESS_SECONDS) {
          uiOverlays.openContextMenuAtPointer(pointer);
          pointer._holdFired = true;
        }
      }
    }

    if (pointer.justPressed) {
      if (!renderer.xr.isPresenting || pointer.active) {
        handleClick?.(pointer);
      }
      pointer.justPressed = false;
    }

    if (pointer.down && pointer.active) {
      handleDrag?.(pointer);
    }

    if (pointer.justReleased) {
      pointer._holdTime = 0;
      pointer._holdFired = false;
      pointer._holdEligible = false;
      pointer.justReleased = false;
    }
  }

  return {
    stepInput,
  };
}
