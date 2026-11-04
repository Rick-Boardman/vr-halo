// SPDX-License-Identifier: Apache-2.0
import * as THREE from "three";
import { createVRPointerHighlight } from "../xr/index.js";
import { createDomListenerRegistry } from "../navigation/dom-listener-registry.js";
import { createDesktopOrbitCameraControls } from "../navigation/desktop-orbit-camera-controls.js";
import { getClientPointNdc } from "../pointer-coordinates.js";
import {
  getInputRouterXrControllerButtons,
  inputRouterXrDebug,
  logInputRouterXrGamepadState,
  logInputRouterXrInputSourcesChange,
  logInputRouterXrSessionStart,
} from "../xr/input-router-xr-debug.js";

/**
 * Route desktop pointer and XR controller input into shared runtime HUD widgets and world targets.
 * Purpose: centralize hit testing, drag routing, desktop orbit blocking, XR pointer visualization, and XR controller gesture handling for shared UI surfaces.
 * Return value: constructed InputRouter instances expose registration, lifecycle, diagnostic, and per-frame update methods for app harnesses.
 * Side effects: instances install DOM and XR session listeners, allocate raycasting and highlight helpers, mutate registered object interaction state, drive desktop camera controls, and may emit diagnostic console output during XR interaction.
 */
export class InputRouter {
  /**
   * Create a new input router for one camera/scene/renderer trio.
   * @param {any} camera Active camera used for pointer raycasts and camera-space HUD transforms.
   * @param {any} scene Scene that owns world targets and XR pointer highlight objects.
   * @param {any} renderer Renderer whose canvas receives desktop pointer events and whose XR session lifecycle is observed.
   */
  constructor(camera, scene, renderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    this._objects = [];
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._dragTarget = null;
    this._dragging = false;
    this._lastPanel = null;
    this._pointerDownOnUI = false; // Track if pointerdown was on UI
    this._domListeners = createDomListenerRegistry(this);

    // VR pointer highlights (one per controller)
    this._vrPointerHighlights = new Map();
    this._lastTime = 0;

    // Listen for pointer events on the renderer's canvas
    this._canvas = document.querySelector("canvas");
    if (this._canvas) {
      this._domListeners.listen(this._canvas, "pointerdown", "_onPointerDown");
      this._domListeners.listen(window, "pointermove", "_onPointerMove");
      this._domListeners.listen(window, "pointerup", "_onPointerUp");
    }
    this._desktopCameraControls = createDesktopOrbitCameraControls({
      THREE,
      camera: this.camera,
      canvas: this._canvas,
      isBlocked: () => this._pointerDownOnUI,
    });

    // XR variables
    this._xrSession = null;
    this._xrReferenceSpace = null;
    this._xrInputSources = [];
    this._xrLastFrame = null;
    this._onXrInputSourcesChange = null;
    this._buttonTestDone = false; // Flag to prevent spam logging

    // If renderer is provided and supports XR, hook session events
    if (renderer && renderer.xr) {
      this._domListeners.listen(renderer.xr, "sessionstart", "_onXrSessionStart");
      this._domListeners.listen(renderer.xr, "sessionend", "_onXrSessionEnd");
    }
  }

  /**
   * Dispose router-owned listeners, controls, and XR highlight state.
   * @returns {void} Does not return a value.
   * Side effects: removes DOM and XR listeners, disposes desktop controls, clears registered objects, and removes XR highlight meshes from the scene.
   */
  dispose() {
    this._onXrSessionEnd();
    this._desktopCameraControls?.dispose?.();
    this._domListeners.clear();
    this._objects = [];
    this._dragTarget = null;
    this._dragging = false;
    this._pointerDownOnUI = false;
  }

  /**
   * Register an interactive object for desktop and XR hit testing.
   * @param {any} object3D Object or widget root that should receive pointer events.
   * @returns {void} Does not return a value.
   * Side effects: mutates the router's internal registered-object list when the object is not already present.
   */
  register(object3D) {
    if (!this._objects.includes(object3D)) this._objects.push(object3D);
  }

  /**
   * Remove an object from desktop and XR hit testing.
   * @param {any} object3D Previously registered object or widget root.
   * @returns {void} Does not return a value.
   * Side effects: mutates the router's internal registered-object list.
   */
  unregister(object3D) {
    this._objects = this._objects.filter((o) => o !== object3D);
  }

  /**
   * Return the current XR diagnostic snapshot used by Quest debugging helpers.
   * @returns {{ session: any, hasReferenceSpace: boolean, pointerHighlights: Array<{ inputSource: any, highlight: any }>, registeredObjects: any[] }} Diagnostic state describing the active XR session, pointer highlights, and registered objects.
   * Side effects: returns shallow snapshots of internal router state without mutating it.
   */
  getXrDiagnosticState() {
    return {
      session: this._xrSession,
      hasReferenceSpace: !!this._xrReferenceSpace,
      pointerHighlights: Array.from(
        this._vrPointerHighlights,
        ([inputSource, highlight]) => ({
          inputSource,
          highlight,
        })
      ),
      registeredObjects: this._objects.slice(),
    };
  }

  /**
   * Reset the one-shot XR button logging guard used by the Quest diagnostics helpers.
   * @returns {void} Does not return a value.
   * Side effects: clears the internal button-log suppression flag.
   */
  resetXrButtonTestLog() {
    this._buttonTestDone = false;
  }

  _onXrSessionStart() {
    this._xrSession = this.renderer?.xr?.getSession?.() ?? null;
    this._xrReferenceSpace =
      this.renderer?.xr?.getReferenceSpace?.() ?? null;
    logInputRouterXrSessionStart(this._xrSession, this._xrReferenceSpace);

    if (this._xrSession) {
      this._onXrInputSourcesChange = (event) => {
        logInputRouterXrInputSourcesChange(this._xrSession, event);
      };
      this._xrSession.addEventListener(
        "inputsourceschange",
        this._onXrInputSourcesChange
      );
    }
  }

  _onXrSessionEnd() {
    if (this._xrSession && this._onXrInputSourcesChange) {
      this._xrSession.removeEventListener(
        "inputsourceschange",
        this._onXrInputSourcesChange
      );
    }
    this._onXrInputSourcesChange = null;
    this._xrSession = null;
    this._xrReferenceSpace = null;
    this._vrPointerHighlights.forEach((highlight) => {
      this.scene.remove(highlight);
      if (highlight.dispose) highlight.dispose();
    });
    this._vrPointerHighlights.clear();
    inputRouterXrDebug.sessionEnd();
  }

  _getPointer(event) {
    const pointerNdc = getClientPointNdc(event.clientX, event.clientY, this._canvas);
    if (!pointerNdc) return;
    this._pointer.x = pointerNdc.x;
    this._pointer.y = pointerNdc.y;
  }

  _intersectObjects() {
    this._raycaster.setFromCamera(this._pointer, this.camera);
    let allHits = [];
    for (const obj of this._objects) {
      if (!obj) continue;
      let mesh = obj.isMesh ? obj : obj.children.find((c) => c.isMesh);
      if (!mesh) continue;
      const intersects = this._raycaster.intersectObject(mesh, false);
      if (intersects.length > 0) {
        allHits.push({ obj, intersect: intersects[0] });
      }
    }
    // Sort by distance (closest first)
    allHits.sort((a, b) => a.intersect.distance - b.intersect.distance);
    return allHits;
  }

  _onPointerDown(event) {
    this._getPointer(event);
    const hits = this._intersectObjects();
    if (hits.length > 0) {
      const { obj } = hits[0];
      console.log(
        "[InputRouter] pointerdown hit:",
        obj,
        obj.name || obj.constructor?.name || obj.type
      );
      this._dragTarget = obj;
      this._dragging = true;
      this._pointerDownOnUI = true; // Mark that pointerdown was on UI
      // Create a synthetic event object to track preventDefault/stopPropagation
      let prevented = false;
      let stopped = false;
      const syntheticEvent = {
        clientX: event.clientX,
        clientY: event.clientY,
        preventDefault: () => {
          prevented = true;
        },
        stopPropagation: () => {
          stopped = true;
        },
        get defaultPrevented() {
          return prevented;
        },
        get propagationStopped() {
          return stopped;
        },
      };
      obj.dispatchEvent({
        type: "pointerdown",
        ...syntheticEvent,
      });
      // If the event was prevented by the UI, do not allow world/camera drag
      if (prevented) {
        return;
      }
    } else {
      this._pointerDownOnUI = false; // Not on UI
    }
  }

  _onPointerMove(event) {
    if (!this._dragging || !this._dragTarget) return;
    this._dragTarget.dispatchEvent({
      type: "pointermove",
      clientX: event.clientX,
      clientY: event.clientY,
      stopPropagation: () => {},
    });
  }

  _onPointerUp(event) {
    if (!this._dragging || !this._dragTarget) {
      this._pointerDownOnUI = false;
      return;
    }
    this._dragTarget.dispatchEvent({
      type: "pointerup",
      clientX: event.clientX,
      clientY: event.clientY,
      stopPropagation: () => {},
    });
    this._dragging = false;
    this._dragTarget = null;
    this._pointerDownOnUI = false;
  }

  // --- VR Controller Ray Pointer Events ---
  _dispatchVRPointerEvents(frame) {
    if (!this._xrSession) {
      inputRouterXrDebug.noSession();
      return;
    }

    // Debug input sources count
    const inputSourceCount = this._xrSession.inputSources.length;
    if (inputSourceCount === 0) {
      inputRouterXrDebug.noInputSources();
      return;
    }

    // Get reference space with fallback
    let referenceSpace = this._xrReferenceSpace;
    if (!referenceSpace && this.renderer && this.renderer.xr) {
      try {
        referenceSpace = this.renderer.xr.getReferenceSpace();
        this._xrReferenceSpace = referenceSpace; // Cache it
      } catch (e) {
        inputRouterXrDebug.referenceSpaceError(e);
        return;
      }
    }
    if (!referenceSpace) {
      inputRouterXrDebug.noReferenceSpace();
      return;
    }

    inputRouterXrDebug.inputSourceCount(inputSourceCount);

    for (const inputSource of this._xrSession.inputSources) {
      inputRouterXrDebug.inputSourceFrame(inputSource);

      if (!inputSource.targetRaySpace) {
        inputRouterXrDebug.missingTargetRaySpace(inputSource);
        continue;
      }

      if (!inputSource.gamepad) {
        inputRouterXrDebug.missingGamepad(inputSource);
        continue;
      }

      // Get or create pointer highlight for this input source
      if (!this._vrPointerHighlights.has(inputSource)) {
        const highlight = createVRPointerHighlight({ THREE });
        this._vrPointerHighlights.set(inputSource, highlight);
        this.scene.add(highlight);
        inputRouterXrDebug.pointerHighlightCreated();
      }
      const highlight = this._vrPointerHighlights.get(inputSource);

      let pose;
      try {
        pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
      } catch (e) {
        inputRouterXrDebug.poseError(e);
        continue;
      }
      if (!pose) {
        inputRouterXrDebug.noPose();
        continue;
      }

      // Build a THREE.Ray from pose
      const origin = new THREE.Vector3(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
      );
      // Convert orientation quaternion to forward vector
      const orientation = pose.transform.orientation;
      const quat = new THREE.Quaternion(
        orientation.x,
        orientation.y,
        orientation.z,
        orientation.w
      );
      // Forward vector = q * (0, 0, -1) because the runtime camera and controller convention treats negative Z as "aim forward" in a right-handed space.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat); // Get button states using enhanced controller detection FIRST
      const buttons = getInputRouterXrControllerButtons(inputSource);
      const triggerPressed = buttons.trigger;
      const gripPressed = buttons.grip;

      // Show and update ray visualization
      highlight.show();
      highlight.updateRay(origin, forward, 3); // Raycast against registered objects (UI panels, HUDBox, TitleBar, etc)
      const shouldLogRaycastDebug = inputRouterXrDebug.shouldLogRaycast(
        inputSource,
        triggerPressed
      );

      // Enhanced debugging for hit detection
      if (shouldLogRaycastDebug) {
        inputRouterXrDebug.raycastStart(
          inputSource,
          origin,
          forward,
          this._objects.length,
          triggerPressed
        );
        inputRouterXrDebug.registeredObjects(
          this._objects,
          () => new THREE.Vector3()
        );
      }

      const hit = this._findClosestVrHit(origin, forward, shouldLogRaycastDebug);

      if (hit) {
        highlight.showHit(hit.intersect.point);
        if (shouldLogRaycastDebug) {
          inputRouterXrDebug.finalHit(hit);
        }
      } else {
        highlight.hideHit();
        if (shouldLogRaycastDebug) {
          inputRouterXrDebug.noHits();
        }
      }

      // Debug: Log all button states for troubleshooting
      this._buttonTestDone = logInputRouterXrGamepadState(
        inputSource,
        this._buttonTestDone
      );

      // Track trigger state for this inputSource
      inputSource._lastTriggerPressed =
        inputSource._lastTriggerPressed || false;

      // Update trigger visual indicator
      if (triggerPressed) {
        highlight.showTriggerPressed();
      } else {
        highlight.hideTriggerPressed();
      }

      // --- VR World Dragging (Grip button) ---
      inputSource._lastGripPressed = inputSource._lastGripPressed || false;

      // Only allow world drag if not dragging a UI element
      if (!this._dragging) {
        if (gripPressed && !inputSource._lastGripPressed) {
          // Start world drag
          inputSource._worldDragStart = {
            controllerPos: origin.clone(),
            target: this._desktopCameraControls.cloneTarget(),
          };
          console.log("[InputRouter] VR world drag started");
        } else if (gripPressed && inputSource._worldDragStart) {
          // While dragging, update world target based on controller movement
          const start = inputSource._worldDragStart;
          const delta = origin.clone().sub(start.controllerPos);
          // Apply drag with dampening for smoother control
          const dragScale = 2.0; // Make world dragging more responsive
          this._desktopCameraControls.setTarget(
            start.target.clone().sub(delta.multiplyScalar(dragScale))
          );
        } else if (
          !gripPressed &&
          inputSource._lastGripPressed &&
          inputSource._worldDragStart
        ) {
          // End world drag
          console.log("[InputRouter] VR world drag ended");
          inputSource._worldDragStart = null;
        }
      }
      inputSource._lastGripPressed = gripPressed;
      // --- End VR World Dragging ---
      this._handleVrTriggerInteraction(inputSource, hit, origin, frame, triggerPressed);
      inputSource._lastTriggerPressed = triggerPressed;
    }
  }

  _findClosestVrHit(origin, forward, shouldLogRaycastDebug) {
    let hit = null;
    let closestDistance = Infinity;

    for (const obj of this._objects) {
      let mesh = obj.isMesh ? obj : obj.children.find((c) => c.isMesh);
      if (!mesh) {
        if (shouldLogRaycastDebug) {
          inputRouterXrDebug.objectWithoutMesh(obj);
        }
        continue;
      }

      // Create raycaster for each object
      let raycaster;

      // Check if object is parented to camera (HUD elements)
      if (obj.parent && obj.parent.isCamera) {
        // Camera-space hit ray = inverse(cameraWorld) * world ray so HUD children parented to the camera are tested in the same local frame they are positioned in.
        const cameraMatrix = this.camera.matrixWorld.clone().invert();
        const cameraOrigin = origin.clone().applyMatrix4(cameraMatrix);
        const cameraForward = forward
          .clone()
          .transformDirection(cameraMatrix)
          .normalize();
        raycaster = new THREE.Raycaster(cameraOrigin, cameraForward);

        if (shouldLogRaycastDebug) {
          inputRouterXrDebug.cameraSpaceRaycast(
            obj,
            origin,
            cameraOrigin,
            forward,
            cameraForward
          );
        }
      } else {
        // For world-space objects, use world-space ray
        raycaster = new THREE.Raycaster(origin, forward);
      }

      // Force update world matrix to ensure proper raycast in VR
      if (mesh.parent) {
        mesh.parent.updateMatrixWorld(true);
      }
      mesh.updateMatrixWorld(true);

      const intersects = raycaster.intersectObject(mesh, false);
      if (shouldLogRaycastDebug) {
        inputRouterXrDebug.raycastTest(
          mesh,
          intersects,
          () => new THREE.Vector3()
        );
      }

      if (intersects.length > 0 && intersects[0].distance < closestDistance) {
        hit = { obj, intersect: intersects[0] };
        closestDistance = intersects[0].distance;
        if (shouldLogRaycastDebug) {
          inputRouterXrDebug.hitFound(obj, intersects[0]);
        }
      }
    }

    return hit;
  }

  _handleVrTriggerInteraction(inputSource, hit, origin, frame, triggerPressed) {
    // Synthesize pointer events for UI dragging (trigger button)
    if (triggerPressed && !inputSource._lastTriggerPressed && hit) {
      // pointerdown
      console.log(
        "[InputRouter] VR pointerdown on:",
        hit.obj.name || hit.obj.constructor?.name
      );

      // For camera-parented objects (HUD elements), store camera-relative drag info
      if (hit.obj.parent && hit.obj.parent.isCamera) {
        console.log("[InputRouter] Starting VR HUD drag");
        inputSource._vrHudDragState = {
          startControllerPos: origin.clone(),
          startObjectPos: hit.obj.position.clone(),
          camera: this.camera,
        };
      }

      hit.obj.dispatchEvent({
        type: "pointerdown",
        clientX: 0, // Not meaningful in VR
        clientY: 0,
        isXRController: true,
        inputSource,
        frame,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      this._dragTarget = hit.obj;
      this._dragging = true;
      console.log("[InputRouter] VR drag started on UI element");
    } else if (triggerPressed && this._dragging && this._dragTarget) {
      // pointermove - handle VR dragging
      if (inputSource._vrHudDragState) {
        // Camera-space HUD dragging
        const dragState = inputSource._vrHudDragState;
        const camera = dragState.camera;

        // Transform current controller position to camera space
        const cameraMatrix = camera.matrixWorld.clone().invert();
        const startControllerCameraSpace = dragState.startControllerPos
          .clone()
          .applyMatrix4(cameraMatrix);
        const currentControllerCameraSpace = origin
          .clone()
          .applyMatrix4(cameraMatrix);

        // delta_camera = current_controller_camera - start_controller_camera; applying the drag delta in camera space keeps HUD movement aligned with the viewer plane instead of world axes.
        const deltaInCameraSpace = currentControllerCameraSpace
          .clone()
          .sub(startControllerCameraSpace);

        // Scale the movement for better control (reduce sensitivity)
        deltaInCameraSpace.multiplyScalar(0.5);

        // Apply movement to object position (which is already in camera space)
        const newPos = dragState.startObjectPos
          .clone()
          .add(deltaInCameraSpace);
        this._dragTarget.position.copy(newPos);

        inputRouterXrDebug.hudDragUpdate(deltaInCameraSpace, newPos);
      }

      this._dragTarget.dispatchEvent({
        type: "pointermove",
        clientX: 0,
        clientY: 0,
        isXRController: true,
        inputSource,
        frame,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    } else if (
      !triggerPressed &&
      inputSource._lastTriggerPressed &&
      this._dragging &&
      this._dragTarget
    ) {
      // pointerup
      console.log("[InputRouter] VR pointerup - drag ended");

      // Clean up VR drag state
      if (inputSource._vrHudDragState) {
        console.log("[InputRouter] VR HUD drag ended");
        inputSource._vrHudDragState = null;
      }

      this._dragTarget.dispatchEvent({
        type: "pointerup",
        clientX: 0,
        clientY: 0,
        isXRController: true,
        inputSource,
        frame,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
      this._dragTarget = null;
      this._dragging = false;
    }
  }

  /**
   * Advance per-frame input state, desktop camera transforms, and XR controller routing.
   * @param {any} frame Optional XR frame supplied by the renderer animation loop.
   * @returns {void} Does not return a value.
   * Side effects: updates XR highlight animation state, applies pending desktop camera transforms, stores the latest XR frame, and may dispatch pointer events to registered objects.
   */
  update(frame) {
    // Calculate delta time for animations
    const currentTime = performance.now();
    const deltaTime = (currentTime - this._lastTime) / 1000;
    this._lastTime = currentTime;

    // Update VR pointer highlights animations
    this._vrPointerHighlights.forEach((highlight) => {
      highlight.updateTriggerAnimation(deltaTime);
    });

    this._desktopCameraControls.applyCameraTransform();
    // --- VR pointer/controller support ---
    if (frame) {
      this._xrLastFrame = frame;
      this._dispatchVRPointerEvents(frame);
    }
  }
}
