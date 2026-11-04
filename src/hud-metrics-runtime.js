// SPDX-License-Identifier: Apache-2.0
/** Seconds of frame times to accumulate before refreshing the FPS readout. */
const FPS_SAMPLE_INTERVAL_S = 0.5;
/** Seconds of distance samples to accumulate before refreshing speed. */
const SPEED_SAMPLE_INTERVAL_S = 0.25;
/** Single-frame distance (metres) above which the step is treated as a teleport. */
const TELEPORT_STEP_THRESHOLD_M = 3.0;
/** Exact conversion factor: 1 m/s ≈ 2.237 mph. */
const MS_TO_MPH = 2.2369362920544;
/** Single-frame movement below this threshold is treated as positional noise. */
const SPEED_NOISE_EPSILON_M = 1e-4;
/** MPH values below this threshold are displayed as zero to avoid idle jitter. */
const SPEED_IDLE_MPH_THRESHOLD = 0.05;

/**
 * Purpose: Create the shared HUD metrics updater that computes FPS and movement speed text.
 * @param {object} [options={}] Metrics updater dependencies.
 * @param {any} options.THREE Three.js namespace that provides `Vector3`.
 * @param {{ ui?: { metrics?: { fps?: number|string, speed?: string } } } | null} [options.hud=null] HUD state object whose metrics fields are updated.
 * @param {{ getWorldPosition?: (out: any) => void } | null} [options.movementTarget=null] Optional world-space object used to compute speed.
 * @param {(() => void) | null} [options.markDirty=null] Callback invoked when rendered metric text should refresh.
 * @returns {{ updateMetrics: (dtn: number) => void }} Metrics updater API.
 * Side effects: mutates `hud.ui.metrics.fps` and `hud.ui.metrics.speed`, and calls `markDirty()` when metric text changes.
 */
export function createHudMetricsUpdater({
  THREE,
  hud = null,
  movementTarget = null,
  markDirty = null,
} = {}) {
  const target = movementTarget && typeof movementTarget.getWorldPosition === "function"
    ? movementTarget
    : null;

  const moveCur = new THREE.Vector3();
  const movePrev = new THREE.Vector3();

  let moveInit = false;
  let metricsSeeded = false;
  let fpsAccumT = 0;
  let fpsFrames = 0;
  let fpsLastInt = 0;
  let speedAccumD = 0;
  let speedAccumT = 0;
  let speedLastText = "0.00 MPH";

  function updateMetrics(dtn) {
    const dt = Number(dtn);
    if (!Number.isFinite(dt) || dt <= 0) return;

    if (!metricsSeeded) {
      const fps0 = Number(hud?.ui?.metrics?.fps);
      if (Number.isFinite(fps0)) fpsLastInt = fps0;
      speedLastText = String(hud?.ui?.metrics?.speed ?? speedLastText);
      metricsSeeded = true;
    }

    fpsAccumT += dt;
    fpsFrames += 1;
    if (fpsAccumT >= FPS_SAMPLE_INTERVAL_S) {
      const fps = fpsFrames / fpsAccumT;
      const fpsInt = Math.max(0, Math.round(fps));
      fpsFrames = 0;
      fpsAccumT = 0;
      if (fpsInt !== fpsLastInt) {
        fpsLastInt = fpsInt;
        if (hud?.ui?.metrics) hud.ui.metrics.fps = fpsInt;
        if (typeof markDirty === "function") markDirty();
      }
    }

    if (!target) return;

    target.getWorldPosition(moveCur);
    if (!moveInit) {
      movePrev.copy(moveCur);
      moveInit = true;
    } else {
      const stepD = moveCur.distanceTo(movePrev);
      if (stepD > TELEPORT_STEP_THRESHOLD_M) {
        movePrev.copy(moveCur);
        speedAccumD = 0;
        speedAccumT = 0;
      } else {
        if (stepD > SPEED_NOISE_EPSILON_M) speedAccumD += stepD;
        speedAccumT += dt;
        movePrev.copy(moveCur);
      }
    }

    if (speedAccumT >= SPEED_SAMPLE_INTERVAL_S) {
      const metersPerSecond = speedAccumT > 0 ? speedAccumD / speedAccumT : 0;
      const mph = metersPerSecond * MS_TO_MPH;
      const mphClamped = mph < SPEED_IDLE_MPH_THRESHOLD ? 0 : mph;
      const nextText = `${mphClamped.toFixed(2)} MPH`;
      speedAccumD = 0;
      speedAccumT = 0;
      if (nextText !== speedLastText) {
        speedLastText = nextText;
        if (hud?.ui?.metrics) hud.ui.metrics.speed = nextText;
        if (typeof markDirty === "function") markDirty();
      }
    }
  }

  return { updateMetrics };
}
