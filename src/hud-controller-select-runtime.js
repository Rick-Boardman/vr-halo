// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD handlers for XR controller select start/end events.
 * @param {object} [options={}] Controller-select runtime dependencies.
 * @param {(controller: any) => void} [options.setActiveUiController] Setter invoked when a select event identifies the active UI controller.
 * @param {(inputSource: any) => void} [options.setActiveUiInputSource] Setter invoked when a select event identifies the active XR input source.
 * @param {(isDown: boolean) => void} [options.setVrPointerDown] Setter that updates HUD VR pointer down-state.
 * @param {(justPressed: boolean) => void} [options.setVrPointerJustPressed] Setter that flags a VR pointer just-pressed transition.
 * @param {(justReleased: boolean) => void} [options.setVrPointerJustReleased] Setter that flags a VR pointer just-released transition.
 * @param {() => void} [options.markDirty] Callback used to request a HUD refresh after pointer state changes.
 * @param {() => void} [options.endDragResize] Callback used to end drag/resize interactions on select end.
 * @returns {{ onSelectStart: (event: any) => void, onSelectEnd: (event: any) => void }} Event handlers for XR controller select lifecycle callbacks.
 * Side effects: mutates controller `userData.inputSource` when provided by events and triggers caller-provided state setters/callbacks.
 */
export function createHudControllerSelectRuntime({
  setActiveUiController,
  setActiveUiInputSource,
  setVrPointerDown,
  setVrPointerJustPressed,
  setVrPointerJustReleased,
  markDirty,
  endDragResize,
} = {}) {
  function onSelectStart(event) {
    if (event?.target) {
      setActiveUiController?.(event.target);
    }
    if (event?.inputSource) {
      setActiveUiInputSource?.(event.inputSource);
    }
    if (event?.target && event?.inputSource) {
      // Keep inputSource accessible to consumers (e.g. for gamepad access).
      event.target.userData.inputSource = event.inputSource;
    }
    setVrPointerDown?.(true);
    setVrPointerJustPressed?.(true);
    markDirty?.();
  }

  function onSelectEnd(event) {
    if (event?.target) {
      setActiveUiController?.(event.target);
    }
    if (event?.inputSource) {
      setActiveUiInputSource?.(event.inputSource);
    }
    if (event?.target && event?.inputSource) {
      event.target.userData.inputSource = event.inputSource;
    }
    setVrPointerDown?.(false);
    setVrPointerJustReleased?.(true);
    markDirty?.();
    endDragResize?.();
  }

  return {
    onSelectStart,
    onSelectEnd,
  };
}
