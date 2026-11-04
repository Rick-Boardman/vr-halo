// SPDX-License-Identifier: Apache-2.0
const NAV_KEYS = new Set(["W", "A", "S", "D", "Q", "E", "R", "F", "Z", "C", "T", "G", "X"])

import { createDomListenerRegistry } from "./dom-listener-registry.js"
import { DESKTOP_NAVIGATION_DEFAULTS } from "./desktop-navigation-policy.js"

/**
 * Create the shared desktop navigation controller for walkabout movement and look input.
 * Purpose: provide the canonical desktop keyboard-and-pointer navigation path for runtime walkabout scenes, including drag-to-look, keyboard locomotion, auto-walk, speed-ramp policy, and optional debug prove publishing.
 * @param {object} [options={}] Desktop navigation configuration.
 * @param {any} options.THREE Three.js namespace that must expose Vector3 and Quaternion for movement-basis calculations.
 * @param {{ domElement: HTMLCanvasElement, xr?: { isPresenting?: boolean } }} options.renderer Renderer whose canvas receives desktop pointer input and whose XR state disables desktop controls while presenting.
 * @param {any} [options.hudSystem] Optional HUD system used to suppress mouse-look while the pointer is over UI.
 * @param {{ position: { add: (value: unknown) => unknown, addScaledVector?: (direction: unknown, scale: number) => unknown } }} options.player Player or rig root whose position is mutated by desktop locomotion.
 * @param {() => number} options.getYaw Current yaw accessor in radians.
 * @param {() => number} options.getPitch Current pitch accessor in radians.
 * @param {() => number} options.getRoll Current roll accessor in radians.
 * @param {(delta: number) => void} options.rotateYaw Yaw mutator applied during keyboard and drag-look updates.
 * @param {(delta: number) => void} options.rotatePitch Pitch mutator applied during keyboard and drag-look updates.
 * @param {(delta: number) => void} options.rotateRoll Roll mutator applied during keyboard updates.
 * @param {() => void} options.applyLook Callback that commits the updated look state to the camera or rig.
 * @param {(out: unknown) => unknown} [options.getQuaternion] Optional callback that writes the current look quaternion for movement-basis derivation.
 * @param {() => boolean} [options.isEnabled] Optional predicate that disables desktop navigation updates when false.
 * @param {() => boolean} [options.isTyping] Optional predicate that suppresses desktop controls while text entry is active.
 * @param {number} [options.mouseLookButton=DESKTOP_NAVIGATION_DEFAULTS.mouseLookButton] Mouse button index that activates drag-to-look.
 * @param {number} [options.mouseLookSensitivity=DESKTOP_NAVIGATION_DEFAULTS.mouseLookSensitivity] Pointer-look sensitivity in radians per pixel.
 * @param {number} [options.mouseDragThresholdPx=DESKTOP_NAVIGATION_DEFAULTS.mouseDragThresholdPx] Minimum drag distance in pixels before look dragging engages.
 * @param {number} [options.baseSpeed=DESKTOP_NAVIGATION_DEFAULTS.baseSpeed] Base locomotion speed in world units per second.
 * @param {number} [options.fastMultiplier=DESKTOP_NAVIGATION_DEFAULTS.fastMultiplier] Speed multiplier applied while the fast-move modifier is held.
 * @param {boolean} [options.speedRampEnabled=DESKTOP_NAVIGATION_DEFAULTS.speedRampEnabled] Whether fast movement ramps smoothly instead of switching instantly.
 * @param {number} [options.speedRampMaxMultiplier=DESKTOP_NAVIGATION_DEFAULTS.speedRampMaxMultiplier] Maximum speed multiplier reachable while ramping.
 * @param {number} [options.speedRampAccelPerSec=DESKTOP_NAVIGATION_DEFAULTS.speedRampAccelPerSec] Per-second acceleration of the speed ramp.
 * @param {number} [options.speedRampDecelPerSec=DESKTOP_NAVIGATION_DEFAULTS.speedRampDecelPerSec] Per-second deceleration of the speed ramp.
 * @param {number} [options.yawSpeed=DESKTOP_NAVIGATION_DEFAULTS.yawSpeed] Keyboard yaw speed in radians per second.
 * @param {number} [options.pitchSpeed=DESKTOP_NAVIGATION_DEFAULTS.pitchSpeed] Keyboard pitch speed in radians per second.
 * @param {number} [options.rollSpeed=DESKTOP_NAVIGATION_DEFAULTS.rollSpeed] Keyboard roll speed in radians per second.
 * @param {string} [options.keyboardKeyMode=DESKTOP_NAVIGATION_DEFAULTS.keyboardKeyMode] Keyboard mapping mode: `smart`, `key`, or `code`.
 * @param {any} [options.desktopProve=null] Optional debug prove state object that records key and rotation snapshots.
 * @param {() => void} [options.publishProve] Optional callback invoked after debug prove state changes.
 * @param {(delta: number) => number} [options.wrappedAngleDeltaRad] Optional angle-normalization helper for prove reporting.
 * @returns {DesktopNavigationControls} Desktop navigation controller instance with `tick(dt)`, `dispose()`, live `keysDown`, `autoWalk`, and `isLookDragging` accessors.
 * Side effects: allocates movement working vectors and quaternions, registers window and canvas DOM listeners through the shared listener registry, mutates player position and look state during updates, toggles canvas cursor visibility during look drags, and may publish desktop prove diagnostics.
 */
export function createDesktopNavigationControls({
  THREE,
  renderer,
  hudSystem,
  player,
  getYaw,
  getPitch,
  getRoll,
  rotateYaw,
  rotatePitch,
  rotateRoll,
  applyLook,
  getQuaternion,
  isEnabled,
  isTyping,
  mouseLookButton = DESKTOP_NAVIGATION_DEFAULTS.mouseLookButton,
  mouseLookSensitivity = DESKTOP_NAVIGATION_DEFAULTS.mouseLookSensitivity,
  mouseDragThresholdPx = DESKTOP_NAVIGATION_DEFAULTS.mouseDragThresholdPx,
  baseSpeed = DESKTOP_NAVIGATION_DEFAULTS.baseSpeed,
  fastMultiplier = DESKTOP_NAVIGATION_DEFAULTS.fastMultiplier,
  zoomEnabled = false,
  zoomMin = 1,
  zoomMax = 50,
  zoomSpeed = 0.15,
  speedRampEnabled = DESKTOP_NAVIGATION_DEFAULTS.speedRampEnabled,
  speedRampMaxMultiplier = DESKTOP_NAVIGATION_DEFAULTS.speedRampMaxMultiplier,
  speedRampAccelPerSec = DESKTOP_NAVIGATION_DEFAULTS.speedRampAccelPerSec,
  speedRampDecelPerSec = DESKTOP_NAVIGATION_DEFAULTS.speedRampDecelPerSec,
  yawSpeed = DESKTOP_NAVIGATION_DEFAULTS.yawSpeed,
  pitchSpeed = DESKTOP_NAVIGATION_DEFAULTS.pitchSpeed,
  rollSpeed = DESKTOP_NAVIGATION_DEFAULTS.rollSpeed,
  keyboardKeyMode = DESKTOP_NAVIGATION_DEFAULTS.keyboardKeyMode,
  desktopProve = null,
  publishProve,
  wrappedAngleDeltaRad,
} = {}) {
  return new DesktopNavigationControls({
    THREE,
    renderer,
    hudSystem,
    player,
    getYaw,
    getPitch,
    getRoll,
    rotateYaw,
    rotatePitch,
    rotateRoll,
    applyLook,
    getQuaternion,
    isEnabled,
    isTyping,
    mouseLookButton,
    mouseLookSensitivity,
    mouseDragThresholdPx,
    baseSpeed,
    fastMultiplier,
    zoomEnabled,
    zoomMin,
    zoomMax,
    zoomSpeed,
    speedRampEnabled,
    speedRampMaxMultiplier,
    speedRampAccelPerSec,
    speedRampDecelPerSec,
    yawSpeed,
    pitchSpeed,
    rollSpeed,
    keyboardKeyMode,
    desktopProve,
    publishProve,
    wrappedAngleDeltaRad,
  })
}

class DesktopNavigationControls {
  constructor({
    THREE,
    renderer,
    hudSystem,
    player,
    getYaw,
    getPitch,
    getRoll,
    rotateYaw,
    rotatePitch,
    rotateRoll,
    applyLook,
    getQuaternion,
    isEnabled,
    isTyping,
    mouseLookButton,
    mouseLookSensitivity,
    mouseDragThresholdPx,
    baseSpeed,
    fastMultiplier,
    zoomEnabled,
    zoomMin,
    zoomMax,
    zoomSpeed,
    speedRampEnabled,
    speedRampMaxMultiplier,
    speedRampAccelPerSec,
    speedRampDecelPerSec,
    yawSpeed,
    pitchSpeed,
    rollSpeed,
    keyboardKeyMode,
    desktopProve,
    publishProve,
    wrappedAngleDeltaRad,
  }) {
    if (!THREE) {
      throw new Error("createDesktopNavigationControls: THREE is required")
    }
    if (!renderer) {
      throw new Error("createDesktopNavigationControls: renderer is required")
    }
    if (!player) {
      throw new Error("createDesktopNavigationControls: player is required")
    }

    this.renderer = renderer
    this.hudSystem = hudSystem ?? null
    this.player = player
    this.keysDown = new Set()

    this._getYaw = getYaw
    this._getPitch = getPitch
    this._getRoll = getRoll
    this._rotateYaw = rotateYaw
    this._rotatePitch = rotatePitch
    this._rotateRoll = rotateRoll
    this._applyLook = applyLook
    this._getQuaternion = getQuaternion
    this._isEnabled = typeof isEnabled === "function" ? isEnabled : () => true
    this._isTyping = typeof isTyping === "function" ? isTyping : () => false
    this._mouseLookButton = mouseLookButton
    this._mouseLookSensitivity = mouseLookSensitivity
    this._mouseDragThresholdPx = mouseDragThresholdPx
    this._baseSpeed = baseSpeed
    this._fastMultiplier = fastMultiplier
    this._speedRampEnabled = !!speedRampEnabled
    this._speedRampMaxMultiplier = speedRampMaxMultiplier
    this._speedRampAccelPerSec = speedRampAccelPerSec
    this._speedRampDecelPerSec = speedRampDecelPerSec
    this._yawSpeed = yawSpeed
    this._pitchSpeed = pitchSpeed
    this._rollSpeed = rollSpeed
    this._keyMode = String(keyboardKeyMode || "smart").toLowerCase()
    this._desktopProve = desktopProve
    this._publishProve = typeof publishProve === "function" ? publishProve : () => {}
    this._wrappedAngleDeltaRad =
      typeof wrappedAngleDeltaRad === "function" ? wrappedAngleDeltaRad : (delta) => delta

    this._autoWalk = false
    this._speedMult = 1
    this._dragActive = false
    this._dragMoved = false
    this._downX = 0
    this._downY = 0
    this._lastX = 0
    this._lastY = 0
    this._activePointerId = null
    this._cursorBeforeDrag = null

    // Zoom (wheel + pinch)
    this._zoomEnabled = !!zoomEnabled
    this._zoomMin = Number(zoomMin) || 1
    this._zoomMax = Number(zoomMax) || 50
    this._zoomSpeed = Number(zoomSpeed) || 0.15
    this._pointers = new Map()
    this._isPinching = false
    this._pinchStartDist = 0
    this._pinchStartY = 0

    this._worldUp = new THREE.Vector3(0, 1, 0)
    this._walkForward = new THREE.Vector3()
    this._walkRight = new THREE.Vector3()
    this._walkUp = new THREE.Vector3()
    this._walkDelta = new THREE.Vector3()
    this._qTmp = new THREE.Quaternion()
    this._domListeners = createDomListenerRegistry(this)

    this._domListeners.listen(window, "keydown", "_onKeyDown")
    this._domListeners.listen(window, "keyup", "_onKeyUp")
    this._domListeners.listen(this.renderer.domElement, "pointerdown", "_onPointerDown", {
      passive: false,
    })
    this._domListeners.listen(window, "pointermove", "_onPointerMove", {
      passive: true,
    })
    this._domListeners.listen(window, "pointerup", "_onPointerUpOrCancel", {
      passive: true,
    })
    this._domListeners.listen(window, "pointercancel", "_onPointerUpOrCancel", {
      passive: true,
    })
    this._domListeners.listen(this.renderer.domElement, "contextmenu", "_onContextMenu")
    if (this._zoomEnabled) {
      this._domListeners.listen(this.renderer.domElement, "wheel", "_onWheel", {
        passive: false,
      })
    }
  }

  get autoWalk() {
    return this._autoWalk
  }

  set autoWalk(value) {
    this._autoWalk = !!value
  }

  get isLookDragging() {
    return !!(this._dragActive && this._dragMoved)
  }

  tick(dt) {
    if (this.renderer.xr.isPresenting) return
    if (this._isTyping()) return
    if (!this._isEnabled()) return

    this._applyKeyboardRotation(dt)

    const shift = this.keysDown.has("Shift")
    let moveX = 0
    let moveZ = 0
    let moveY = 0

    if (this.keysDown.has("W") || this._autoWalk) moveZ += 1
    if (this.keysDown.has("S")) moveZ -= 1
    if (this.keysDown.has("A")) moveX -= 1
    if (this.keysDown.has("D")) moveX += 1
    if (this.keysDown.has("T")) moveY += 1
    if (this.keysDown.has("G")) moveY -= 1

    const movementLength = Math.hypot(moveX, moveZ, moveY)
    if (movementLength > 0) {
      moveX /= movementLength
      moveZ /= movementLength
      moveY /= movementLength
    }

    if (movementLength === 0) return

    let speed = this._baseSpeed * (shift ? this._fastMultiplier : 1)
    if (this._speedRampEnabled) {
      if (shift) {
        this._speedMult = Math.max(this._speedMult, this._fastMultiplier)
        this._speedMult = Math.min(
          this._speedRampMaxMultiplier,
          this._speedMult + this._speedRampAccelPerSec * dt
        )
      } else {
        this._speedMult = Math.max(
          1,
          this._speedMult - this._speedRampDecelPerSec * dt
        )
      }
      speed = this._baseSpeed * this._speedMult
    }

    this._computeWalkBasis()

    this._walkDelta.set(0, 0, 0)
    this._walkDelta.addScaledVector(this._walkRight, moveX * speed * dt)
    this._walkDelta.addScaledVector(this._walkForward, moveZ * speed * dt)
    this._walkDelta.addScaledVector(this._walkUp, moveY * speed * dt)

    this.player.position.add(this._walkDelta)
  }

  _applyKeyboardRotation(dt) {
    const yawBefore = this._getYaw()
    const pitchBefore = this._getPitch()
    const rollBefore = this._getRoll()

    const shift = this.keysDown.has("Shift")
    const fastRotationMultiplier = shift ? this._fastMultiplier : 1
    const yawSpeed = this._yawSpeed * fastRotationMultiplier
    const pitchSpeed = this._pitchSpeed * fastRotationMultiplier
    const rollSpeed = this._rollSpeed * fastRotationMultiplier

    let yawDelta = 0
    let pitchDelta = 0
    let rollDelta = 0
    if (this.keysDown.has("Q")) yawDelta += yawSpeed * dt
    if (this.keysDown.has("E")) yawDelta -= yawSpeed * dt
    if (this.keysDown.has("R")) pitchDelta += pitchSpeed * dt
    if (this.keysDown.has("F")) pitchDelta -= pitchSpeed * dt
    if (this.keysDown.has("Z")) rollDelta -= rollSpeed * dt
    if (this.keysDown.has("C")) rollDelta += rollSpeed * dt

    if (yawDelta === 0 && pitchDelta === 0 && rollDelta === 0) return

    if (yawDelta !== 0) this._rotateYaw(yawDelta)
    if (pitchDelta !== 0) this._rotatePitch(pitchDelta)
    if (rollDelta !== 0) this._rotateRoll(rollDelta)
    this._applyLook()

    const yawAfter = this._getYaw()
    const pitchAfter = this._getPitch()
    const rollAfter = this._getRoll()
    const rawDelta = yawAfter - yawBefore
    this._publishDesktopRotationProve({
      yawBefore,
      yawAfter,
      rawDelta,
      pitchBefore,
      pitchAfter,
      rollBefore,
      rollAfter,
    })
  }

  _computeWalkBasis() {
    if (this._getQuaternion) {
      // Rotate the canonical navigation basis vectors (-Z forward, +X right,
      // +Y up in this Y-up runtime) by the current look quaternion so desktop
      // movement follows the rig's actual facing instead of world axes.
      this._getQuaternion(this._qTmp)
      this._walkForward.set(0, 0, -1).applyQuaternion(this._qTmp).normalize()
      this._walkRight.set(1, 0, 0).applyQuaternion(this._qTmp).normalize()
      this._walkUp.set(0, 1, 0).applyQuaternion(this._qTmp).normalize()
    } else {
      const yaw = this._getYaw()
      const pitch = this._getPitch()
      const cosPitch = Math.cos(pitch)
      // dir = (-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch)).
      // This repo uses Y-up and yaw=0 facing -Z for walkabout navigation, so
      // pitch lifts the forward vector while yaw spins it around the vertical axis.
      this._walkForward
        .set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch)
        .normalize()
      // right = (cos(yaw), 0, -sin(yaw)) keeps strafing on the horizontal plane,
      // then up = right x forward restores the local orthonormal movement basis.
      this._walkRight.set(Math.cos(yaw), 0, -Math.sin(yaw))
      if (this._walkRight.lengthSq() < 1e-8) this._walkRight.set(1, 0, 0)
      this._walkUp.crossVectors(this._walkRight, this._walkForward).normalize()
      if (this._walkUp.lengthSq() < 1e-8) this._walkUp.copy(this._worldUp)
    }
  }

  dispose() {
    this._domListeners.clear()
  }

  _snapshotNavKeysDown() {
    const keys = []
    for (const key of NAV_KEYS) {
      if (this.keysDown.has(key)) keys.push(key)
    }
    if (this.keysDown.has("Shift")) keys.push("Shift")
    keys.sort()
    return keys
  }

  _canonicalKey(event) {
    const keyRaw = event?.key
    const keyUpper =
      typeof keyRaw === "string" && keyRaw.length === 1
        ? keyRaw.toUpperCase()
        : typeof keyRaw === "string"
          ? keyRaw
          : ""

    const code = event?.code
    if (code === "ShiftLeft" || code === "ShiftRight") return "Shift"

    if (this._keyMode === "key") return keyUpper

    if (this._keyMode === "smart") {
      if (NAV_KEYS.has(keyUpper)) return keyUpper
      if (keyUpper === "Shift") return "Shift"
    }

    if (typeof code === "string" && code.startsWith("Key") && code.length === 4) {
      return code.slice(3).toUpperCase()
    }

    return keyUpper
  }

  _setKey(event, isDown) {
    const key = this._canonicalKey(event)
    if (!key) return
    if (isDown) this.keysDown.add(key)
    else this.keysDown.delete(key)
  }

  _publishDesktopKeyProve(type, event) {
    if (!this._desktopProve) return
    try {
      this._desktopProve.lastKeyEvent = {
        type,
        key: String(event?.key ?? ""),
        code: String(event?.code ?? ""),
        canonical: String(this._canonicalKey(event) ?? ""),
        mode: this._keyMode,
      }
      this._desktopProve.keysDown = this._snapshotNavKeysDown()
      this._publishProve()
    } catch {
      // no-op
    }
  }

  _publishDesktopRotationProve({
    yawBefore,
    yawAfter,
    rawDelta,
    pitchBefore,
    pitchAfter,
    rollBefore,
    rollAfter,
  }) {
    if (!this._desktopProve) return
    this._desktopProve.yawBefore = yawBefore
    this._desktopProve.yawAfter = yawAfter
    this._desktopProve.rawDelta = rawDelta
    this._desktopProve.wrappedDelta = this._wrappedAngleDeltaRad(rawDelta)
    this._desktopProve.pitchBefore = pitchBefore
    this._desktopProve.pitchAfter = pitchAfter
    this._desktopProve.rollBefore = rollBefore
    this._desktopProve.rollAfter = rollAfter
    this._desktopProve.keysDown = this._snapshotNavKeysDown()
    this._publishProve()
  }

  _isClientPointOverUi(clientX, clientY) {
    if (this.hudSystem && typeof this.hudSystem.isClientPointOverUi === "function") {
      return !!this.hudSystem.isClientPointOverUi(clientX, clientY)
    }
    return false
  }

  _onKeyDown(event) {
    if (this._isTyping()) return

    this._setKey(event, true)
    this._publishDesktopKeyProve("down", event)

    if (this._canonicalKey(event) === "X" && !event.repeat) {
      this._autoWalk = !this._autoWalk
    }

    const key = this._canonicalKey(event)
    if (NAV_KEYS.has(key) || key === "Shift") {
      event.preventDefault()
    }
  }

  _onKeyUp(event) {
    if (this._isTyping()) return
    this._setKey(event, false)
    this._publishDesktopKeyProve("up", event)
  }

  _onPointerDown(event) {
    if (this.renderer.xr.isPresenting) return
    if (event.button !== this._mouseLookButton) return
    if (!this._isEnabled()) return
    if (this._isTyping()) return
    if (this._isClientPointOverUi(event.clientX, event.clientY)) return

    try {
      event.preventDefault()
    } catch {
      // no-op
    }

    // Track all touch pointers for pinch-to-zoom detection.
    if (this._zoomEnabled && event.pointerType === "touch") {
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (this._pointers.size === 2) {
        // Second finger down: switch from look-drag to pinch.
        this._dragActive = false
        this._dragMoved = false
        this._isPinching = true
        const pts = [...this._pointers.values()]
        this._pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        this._pinchStartY = this.player.position.y
        return
      }
    }

    // Ignore additional pointers while one is already tracked for look-drag.
    if (this._activePointerId != null) return

    this._dragActive = true
    this._dragMoved = false
    this._downX = event.clientX
    this._downY = event.clientY
    this._lastX = event.clientX
    this._lastY = event.clientY
    this._activePointerId = event.pointerId

    if (this._cursorBeforeDrag === null) {
      try {
        this._cursorBeforeDrag = this.renderer.domElement.style.cursor || ""
        this.renderer.domElement.style.cursor = "none"
      } catch {
        this._cursorBeforeDrag = ""
      }
    }

    try {
      this.renderer.domElement.setPointerCapture(event.pointerId)
    } catch {
      // no-op
    }
  }

  _onPointerMove(event) {
    if (this.renderer.xr.isPresenting) return

    // Pinch-to-zoom: track both pointers and adjust player Y.
    if (this._isPinching && this._zoomEnabled) {
      if (this._pointers.has(event.pointerId)) {
        this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      }
      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()]
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        if (this._pinchStartDist > 0) {
          const scale = dist / this._pinchStartDist
          // Pinch out (spread) = zoom in = lower Y; pinch in (close) = zoom out = raise Y.
          const nextY = this._pinchStartY / scale
          this.player.position.y = Math.max(this._zoomMin, Math.min(this._zoomMax, nextY))
        }
      }
      return
    }

    if (!this._dragActive) return
    if (this._activePointerId != null && event.pointerId !== this._activePointerId) return
    if (!this._isEnabled()) return

    const dx = event.clientX - this._lastX
    const dy = event.clientY - this._lastY
    this._lastX = event.clientX
    this._lastY = event.clientY

    if (!this._dragMoved) {
      const moveDx = event.clientX - this._downX
      const moveDy = event.clientY - this._downY
      if (Math.hypot(moveDx, moveDy) >= this._mouseDragThresholdPx) {
        this._dragMoved = true
      }
    }

    if (!this._dragMoved) return

    // Mouse-look convention: drag right → look right (scene moves left).
    // Touch convention: drag right → scene follows finger (scene moves right).
    // Flip the sign for touch so the scene tracks the finger direction.
    const sign = event.pointerType === "touch" ? 1 : -1;
    this._rotateYaw(sign * dx * this._mouseLookSensitivity)
    this._rotatePitch(sign * dy * this._mouseLookSensitivity)
    this._applyLook()
  }

  _onPointerUpOrCancel(event) {
    // Clean up pinch tracking.
    if (this._zoomEnabled) {
      this._pointers.delete(event.pointerId)
      if (this._isPinching) {
        if (this._pointers.size < 2) {
          this._isPinching = false
          this._pinchStartDist = 0
          // Clear remaining pointer to avoid stale look-drag activation.
          this._pointers.clear()
          // Reset drag state so the next single-finger touch can start a new drag.
          this._dragActive = false
          this._dragMoved = false
          this._activePointerId = null
          this._cursorBeforeDrag = null
        }
        return
      }
    }

    if (event.button !== this._mouseLookButton) return
    if (this._activePointerId != null && event.pointerId !== this._activePointerId) return
    this._dragActive = false
    this._dragMoved = false
    this._activePointerId = null

    if (this._cursorBeforeDrag !== null) {
      try {
        this.renderer.domElement.style.cursor = this._cursorBeforeDrag
      } catch {
        // no-op
      }
    }
    this._cursorBeforeDrag = null

    try {
      this.renderer.domElement.releasePointerCapture(event.pointerId)
    } catch {
      // no-op
    }
  }

  _onWheel(event) {
    if (!this._zoomEnabled) return
    if (this.renderer.xr.isPresenting) return
    if (event.ctrlKey) return
    if (this._isClientPointOverUi(event.clientX, event.clientY)) return

    // Move along the camera's forward vector (same direction as W/S).
    const delta = event.deltaY > 0 ? -1 : 1
    this._computeWalkBasis()
    const speed = this._zoomSpeed * this.player.position.y
    const step = delta * speed
    const rawNextY = this.player.position.y + this._walkForward.y * step
    const clampedY = Math.max(this._zoomMin, Math.min(this._zoomMax, rawNextY))
    const dyRequested = this._walkForward.y * step
    if (Math.abs(dyRequested) > 1e-8) {
      const dyAllowed = clampedY - this.player.position.y
      const t = dyAllowed / dyRequested
      this.player.position.addScaledVector(this._walkForward, step * t)
    } else {
      this.player.position.addScaledVector(this._walkForward, step)
    }
    this.player.position.y = clampedY
    event.preventDefault()
  }

  _onContextMenu(event) {
    if (this._mouseLookButton === 2) {
      try {
        event.preventDefault()
      } catch {
        // no-op
      }
      return false
    }
    return undefined
  }
}
