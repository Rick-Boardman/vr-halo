// SPDX-License-Identifier: Apache-2.0
// Bootstrap helper: constructs the canonical scene rig + HUD in one place.
// Goal: eliminate harness drift (especially controller parenting + vrAnchor) that can cause Quest-only regressions.

import { createSceneRig } from "./rig.js";
import { createSceneNavigation } from "./navigation/scene-navigation.js";
import { createXrControllers } from "./xr-controllers.js";
import { createHudSystem } from "./hud.js?v=hud-fix-1";
import { createRemoteLogAdapter } from "./remote-log-adapter.js";
import { createQualityCalibration } from "./quality-calibration.js";

/**
 * Purpose: Create the canonical scene renderer, rig, controllers, HUD, navigation, and remote logging wiring used by shared app harnesses.
 * @param {object} [options={}] Bootstrap configuration.
 * @param {object} options.THREE Three.js namespace used to construct the renderer, scene, rig, controllers, HUD, and navigation stack.
 * @param {HTMLCanvasElement} [options.canvas] Canvas element used when the bootstrap needs to construct its own renderer.
 * @param {unknown} [options.renderer] Optional prebuilt renderer; when omitted the bootstrap creates a canonical WebGLRenderer.
 * @param {object} [options.rendererOptions] Optional WebGLRenderer construction overrides applied when a renderer is created internally.
 * @param {(renderer: unknown) => void} [options.configureRenderer] Optional hook invoked after renderer creation or selection.
 * @param {unknown} [options.scene] Optional prebuilt scene; when omitted the bootstrap creates a new Three.Scene.
 * @param {(scene: unknown) => void} [options.configureScene] Optional hook invoked after scene creation or selection.
 * @param {object} [options.rigOptions] Options forwarded into createSceneRig.
 * @param {(context: { THREE: object, renderer: unknown, scene: unknown, camera: unknown, rig: { player: unknown, playerYaw: unknown, playerPitch: unknown, playerRoll: unknown, head: unknown }, look: unknown }) => Array<unknown> | { worldRaycastTargets?: Array<unknown> } | void} [options.buildWorld] Optional world-construction hook invoked after rig creation and before HUD creation.
 * @param {object} [options.hudOptions] Options forwarded into createHudSystem.
 * @param {object} [options.navigationOptions] Options forwarded into createSceneNavigation.
 * @param {() => boolean} [options.isTyping] Optional predicate used to suppress navigation input while typing.
 * @param {string | null} [options.remoteLogUrl] Optional explicit remote-log collector URL used by the bootstrap diagnostics adapter.
 * @param {false | { onTier?: (info: object) => void, onAudio?: (info: { volume: number, muted: boolean }) => void, cap?: number, devicePixelRatio?: number, storage?: object | null, targetFps?: number, badFrameMs?: number, sampleSeconds?: number, warmupSeconds?: number }} [options.qualityCalibration] Graphics calibration. Pass false to keep the renderer's pixel ratio. Otherwise the ladder starts low and stops at the pixel ratio set by configureRenderer.
 * @returns {{ renderer: unknown, scene: unknown, camera: unknown, rig: { player: unknown, playerYaw: unknown, playerPitch: unknown, playerRoll: unknown, head: unknown }, look: unknown, controllers: unknown, hudSystem: unknown, navigation: unknown, remoteLogger: unknown, worldRaycastTargets: Array<unknown> | null, setWorldControlsEnabled: (enabled: boolean) => void, getWorldControlsEnabled: () => boolean, quality: object | null }} Canonical bootstrap result containing the live renderer/scene stack, rig/look API, controllers, HUD, navigation, logging adapter, world-control toggles, and the graphics calibration controller.
 * Side effects: may construct a renderer and scene, mutates renderer XR state and sizing, may add rig objects to the scene, may build world content, creates HUD/navigation/controller systems, and may install remote logging.
 */
export function createSceneHudBootstrap({
  THREE,
  canvas,
  renderer: providedRenderer,
  rendererOptions,
  configureRenderer,
  scene: providedScene,
  configureScene,

  rigOptions,

  // Called after rig creation and before HUD creation.
  // May mutate the scene (lights, world meshes, etc).
  // Return value:
  // - Array<Object3D>: treated as worldRaycastTargets
  // - { worldRaycastTargets: Array<Object3D> }
  buildWorld,

  // HUD options (forwarded into createHudSystem).
  hudOptions,

  // Navigation options (forwarded into createSceneNavigation).
  navigationOptions,

  // Optional typing gate for navigation.
  isTyping,

  // Optional explicit remote log collector URL for diagnostics.
  remoteLogUrl: providedRemoteLogUrl,

  // false keeps the pixel ratio from configureRenderer. An object forwards
  // onTier / onAudio and optional calibration knobs.
  qualityCalibration,
} = {}) {
  if (!THREE) throw new Error("createSceneHudBootstrap: THREE is required");

  const renderer =
    providedRenderer ||
    (() => {
      if (!canvas)
        throw new Error(
          "createSceneHudBootstrap: canvas is required when renderer is not provided"
        );

      const r = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        ...(rendererOptions || {}),
      });

      // Canonical defaults for repo entrypoints.
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(window.innerWidth, window.innerHeight, false);
      try {
        r.outputColorSpace = THREE.SRGBColorSpace;
      } catch {
        // no-op
      }

      r.xr.enabled = true;
      try {
        r.xr.setReferenceSpaceType("local-floor");
      } catch {
        // no-op
      }

      return r;
    })();

  if (typeof configureRenderer === "function") {
    configureRenderer(renderer);
  }

  const quality = startQualityCalibration(renderer, qualityCalibration);

  const scene = providedScene || new THREE.Scene();
  if (typeof configureScene === "function") {
    configureScene(scene);
  }

  // ------------------------------------------------------------
  // URL-driven diagnostics (kept lightweight; no extra HUD UI)
  // ------------------------------------------------------------

  function _getUrlParam(name) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch {
      return null;
    }
  }

  // Facing crosshair: default ON (desktop + VR) for now.
  // Disable with ?crosshair=0
  const crosshairRaw = String(_getUrlParam("crosshair") ?? "").toLowerCase();
  const debugFacingCrosshair = !(crosshairRaw === "0" || crosshairRaw === "false" || crosshairRaw === "off");

  // Remote logging: opt in via bootstrap config or query params.
  // Provide remoteLogUrl or ?logUrl=https://... ; disable with ?log=0 or ?logUrl=off
  // (CORS must allow POST).
  const remoteLogger = createRemoteLogAdapter({
    logUrl:
      providedRemoteLogUrl ??
      _getUrlParam("logUrl") ??
      _getUrlParam("remoteLogUrl"),
    logSwitch: _getUrlParam("log"),
  });

  const rig = createSceneRig({
    THREE,
    renderer,
    scene,
    ...(rigOptions || {}),
  });

  const { camera, look, desktopStartPos } = rig;
  const { player, playerYaw, playerPitch, playerRoll } = rig.rig;

  const _vrEnterYaw = Number(rigOptions?.initialYaw) || 0;
  const _vrEnterPitch = Number(rigOptions?.initialPitch) || 0;
  const _vrResetOnEnter = !(rigOptions && Object.prototype.hasOwnProperty.call(rigOptions, "vrResetOnEnter") && rigOptions.vrResetOnEnter === false);

  // Canonical controller wiring (non-negotiable for stability):
  // parent to pitch node and always pass controllers + vrAnchor explicitly into HUD.
  const controllers = createXrControllers({
    THREE,
    renderer,
    parent: playerPitch,
    attachRays: true,
    attachGrips: true,
    addGripDebugMeshes: true,
  });

  // World targets are harness/world-specific; collect them before HUD creation.
  let worldRaycastTargets = null;
  if (typeof buildWorld === "function") {
    const res = buildWorld({
      THREE,
      renderer,
      scene,
      camera,
      rig: rig.rig,
      look,
    });

    if (Array.isArray(res)) {
      worldRaycastTargets = res;
    } else if (res && Array.isArray(res.worldRaycastTargets)) {
      worldRaycastTargets = res.worldRaycastTargets;
    }
  }

  let worldControlsEnabled = true;
  function setWorldControlsEnabled(enabled) {
    worldControlsEnabled = !!enabled;
  }

  const hudSystem = createHudSystem({
    THREE,
    renderer,
    camera,
    scene,
    movementTarget: player,
    rigDebug: {
      player,
      playerYaw,
      playerPitch,
      playerRoll,
      lookState: look?.state,
      getWorldControlsEnabled: () => worldControlsEnabled,
    },
    controllers,
    vrAnchor: playerPitch,
    setWorldControlsEnabled,
    getWorldControlsEnabled: () => worldControlsEnabled,
    worldRaycastTargets,
    showControllerRays: true,
    ...(hudOptions || {}),

    // Canonical VR enter/exit defaults (caller may override in hudOptions).
    onEnterVR:
      (hudOptions && typeof hudOptions.onEnterVR === "function")
        ? hudOptions.onEnterVR
        : () => {
            if (_vrResetOnEnter) {
              player.position.set(0, 0, 0);
              try {
                // Deterministic VR start orientation across apps.
                // This is invoked before presenting (see createHudSystem.enterVR).
                look.setYaw(_vrEnterYaw);
                look.setPitch(_vrEnterPitch);
                look.setRoll(0);
              } catch {
                // no-op
              }
            }
          },
    onExitVR:
      (hudOptions && typeof hudOptions.onExitVR === "function")
        ? hudOptions.onExitVR
        : () => {
            player.position.copy(desktopStartPos);
            try {
              // Preserve continuity: don't pull wrapped Euler angles from the
              // scene graph back into the stored look state.
              // The look state is the authoritative (continuous) yaw/pitch.
              look.applyLook();
            } catch {
              // no-op
            }
          },
  });

  const navigation = createSceneNavigation({
    THREE,
    renderer,
    camera,
    scene,
    worldRaycastTargets,
    player,
    hudSystem,
    isEnabled: () => worldControlsEnabled,
    isTyping: typeof isTyping === "function" ? isTyping : () => false,
    look: {
      getYaw: look.getYaw,
      setYaw: look.setYaw,
      getPitch: look.getPitch,
      setPitch: look.setPitch,
      getRoll: look.getRoll,
      setRoll: look.setRoll,
      getQuaternion: look.getQuaternion,
      setQuaternion: look.setQuaternion,
      rotateYaw: look.rotateYaw,
      rotatePitch: look.rotatePitch,
      rotateRoll: look.rotateRoll,
      applyLook: look.applyLook,
    },
    // Desktop contract for this repo: LMB drag looks around unless pointer is over HUD UI.
    // (Graph scenes also expect this; they add click fallback to preserve selection.)
    mouseLookButton:
      navigationOptions && Object.prototype.hasOwnProperty.call(navigationOptions, "mouseLookButton")
        ? navigationOptions.mouseLookButton
        : 0,
    debugFacingCrosshair,
    remoteLogger,
    ...(navigationOptions || {}),
  });

  quality?.attach(hudSystem);

  return {
    renderer,
    scene,
    camera,
    rig: rig.rig,
    look,
    controllers,
    hudSystem,
    navigation,
    worldRaycastTargets,
    setWorldControlsEnabled,
    getWorldControlsEnabled: () => worldControlsEnabled,
    quality,
  };
}

function browserStorage() {
  try {
    const store = globalThis.localStorage;
    if (store && typeof store.getItem === "function" && typeof store.setItem === "function") {
      return store;
    }
  } catch {
    // private mode or a non-browser host
  }
  return null;
}

function browserPixelRatio() {
  const ratio = Number(globalThis.devicePixelRatio);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function startQualityCalibration(renderer, qualityCalibration) {
  if (qualityCalibration === false) return null;
  const extra = qualityCalibration && typeof qualityCalibration === "object" ? qualityCalibration : {};
  const currentRatio = Number(renderer?.getPixelRatio?.());
  const quality = createQualityCalibration({
    renderer,
    devicePixelRatio: extra.devicePixelRatio ?? browserPixelRatio(),
    cap: extra.cap ?? (Number.isFinite(currentRatio) && currentRatio > 0 ? currentRatio : undefined),
    storage: Object.prototype.hasOwnProperty.call(extra, "storage") ? extra.storage : browserStorage(),
    targetFps: extra.targetFps,
    badFrameMs: extra.badFrameMs,
    sampleSeconds: extra.sampleSeconds,
    warmupSeconds: extra.warmupSeconds,
    onTier: extra.onTier,
    onAudio: extra.onAudio,
  });
  quality.start();
  return quality;
}
