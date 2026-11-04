// SPDX-License-Identifier: Apache-2.0
import {
  createHudVrResizeDragBasisScratch,
} from "./hud-vr-basis-runtime.js";

/**
 * Purpose: Encapsulate all mutable drag/resize interaction state and expose getter/setter closures consumed by HUD subsystems.
 * @param {object} options
 * @param {object} options.THREE Three.js namespace for allocating the VR resize-drag basis scratch vectors.
 * @returns {object} Named getter/setter closures for drag mode, window key, scroll grab, VR resize-drag basis, VR move-drag yaw/pitch offsets, VR move-drag ray anchoring, and VR depth adjustment flags.
 * Side effects: allocates VR resize-drag basis scratch vectors via THREE.
 */
export function createHudDragState({ THREE }) {
  // Core drag state
  let _dragMode = null; // 'move' | 'resize' | 'scroll' | 'content-scroll'
  let _dragWindowKey = null;
  let _scrollGrabY = 0;

  // Content-area drag-to-scroll (touch).
  let _contentScrollStartY = 0;
  let _contentScrollStartScrollTop = 0;
  let _contentScrollLineH = 24;
  let _contentScrollMaxAbsDelta = 0;
  let _contentScrollTapCallback = null;

  // VR resize-drag stability: freeze the plane/basis used for mapping ray hits to layout px/py.
  // Otherwise, changing w/h during resize changes winCx/winCy, which feeds back into the
  // mapping and causes oscillation/jitter (width/height changing when moving mostly vertically).
  let _vrResizeDragKey = null;
  let _vrResizeDragBasisActive = false;
  const _vrResizeDragBasis = createHudVrResizeDragBasisScratch({ THREE });

  // VR move-drag stability: if we use yaw/pitch mapping during drag to reduce far-depth jitter,
  // latch an offset so we remain continuous with the plane-hit mapping at drag start.
  let _vrMoveDragYawPitchKey = null;
  let _vrMoveDragYawPitchHasOffset = false;
  let _vrMoveDragYawPitchOffsetX = 0;
  let _vrMoveDragYawPitchOffsetY = 0;

  // VR depth push/pull happens after render(), so the render-time mesh matrix is stale for the
  // current frame. While depth-adjusting during move-drag, use a theoretical basis (layout+vrZ)
  // for picking so the panel stays on the controller ray.
  let _vrMoveDragUseTheoreticalBasisThisFrame = false;

  // VR move-drag ray anchoring: store local offsets (u/v meters on the panel) and ray distance (t)
  // to make push/pull follow the controller ray trajectory, not just "straight out."
  let _vrMoveDragRayHasAnchor = false;
  let _vrMoveDragRayT = 0;
  let _vrMoveDragGrabU = 0;
  let _vrMoveDragGrabV = 0;
  let _vrMoveDragDepthAdjustedThisFrame = false;

  return {
    getDragMode: () => _dragMode,
    setDragMode: (mode) => { _dragMode = mode; },
    getDragWindowKey: () => _dragWindowKey,
    setDragWindowKey: (key) => { _dragWindowKey = key; },
    getScrollGrabY: () => _scrollGrabY,
    setScrollGrabY: (value) => { _scrollGrabY = value; },

    getContentScrollStartY: () => _contentScrollStartY,
    setContentScrollStartY: (v) => { _contentScrollStartY = v; },
    getContentScrollStartScrollTop: () => _contentScrollStartScrollTop,
    setContentScrollStartScrollTop: (v) => { _contentScrollStartScrollTop = v; },
    getContentScrollLineH: () => _contentScrollLineH,
    setContentScrollLineH: (v) => { _contentScrollLineH = v; },
    getContentScrollMaxAbsDelta: () => _contentScrollMaxAbsDelta,
    setContentScrollMaxAbsDelta: (v) => { _contentScrollMaxAbsDelta = v; },
    getContentScrollTapCallback: () => _contentScrollTapCallback,
    setContentScrollTapCallback: (fn) => { _contentScrollTapCallback = typeof fn === "function" ? fn : null; },

    vrResizeDragBasis: _vrResizeDragBasis,
    getVrResizeDragBasis: () => _vrResizeDragBasis,
    getVrResizeDragKey: () => _vrResizeDragKey,
    setVrResizeDragKey: (key) => { _vrResizeDragKey = key; },
    getVrResizeDragBasisActive: () => _vrResizeDragBasisActive,
    setVrResizeDragBasisActive: (active) => { _vrResizeDragBasisActive = !!active; },

    getVrMoveDragYawPitchKey: () => _vrMoveDragYawPitchKey,
    setVrMoveDragYawPitchKey: (key) => { _vrMoveDragYawPitchKey = key; },
    getVrMoveDragYawPitchHasOffset: () => _vrMoveDragYawPitchHasOffset,
    setVrMoveDragYawPitchHasOffset: (active) => { _vrMoveDragYawPitchHasOffset = !!active; },
    getVrMoveDragYawPitchOffsetX: () => _vrMoveDragYawPitchOffsetX,
    setVrMoveDragYawPitchOffsetX: (value) => { _vrMoveDragYawPitchOffsetX = value; },
    getVrMoveDragYawPitchOffsetY: () => _vrMoveDragYawPitchOffsetY,
    setVrMoveDragYawPitchOffsetY: (value) => { _vrMoveDragYawPitchOffsetY = value; },

    getVrMoveDragUseTheoreticalBasisThisFrame: () => _vrMoveDragUseTheoreticalBasisThisFrame,
    setVrMoveDragUseTheoreticalBasisThisFrame: (active) => { _vrMoveDragUseTheoreticalBasisThisFrame = !!active; },
    getVrMoveDragRayHasAnchor: () => _vrMoveDragRayHasAnchor,
    setVrMoveDragRayHasAnchor: (active) => { _vrMoveDragRayHasAnchor = !!active; },
    getVrMoveDragRayT: () => _vrMoveDragRayT,
    setVrMoveDragRayT: (value) => { _vrMoveDragRayT = value; },
    getVrMoveDragGrabU: () => _vrMoveDragGrabU,
    setVrMoveDragGrabU: (value) => { _vrMoveDragGrabU = value; },
    getVrMoveDragGrabV: () => _vrMoveDragGrabV,
    setVrMoveDragGrabV: (value) => { _vrMoveDragGrabV = value; },
    getVrMoveDragDepthAdjustedThisFrame: () => _vrMoveDragDepthAdjustedThisFrame,
    setVrMoveDragDepthAdjustedThisFrame: (active) => { _vrMoveDragDepthAdjustedThisFrame = !!active; },
  };
}
