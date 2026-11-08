// SPDX-License-Identifier: Apache-2.0
// Start a game below the renderer's pixel-ratio cap and step up while frames stay healthy.
// The last good tier is saved before a higher tier is tried, so a freeze does not
// come back as the next launch's starting quality.

const STORAGE_KEY = "halo.graphics.v1";
const TIER_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const active = new Set();

/**
 * Pixel ratios from half a pixel up to min(device pixel ratio, cap).
 * @param {number} devicePixelRatio
 * @param {number} cap
 * @returns {number[]}
 */
export function buildQualityTiers(devicePixelRatio, cap) {
  const dpr = Math.max(0.5, Number(devicePixelRatio) || 1);
  const limit = Math.max(0.5, Math.min(dpr, Number(cap) > 0 ? Number(cap) : dpr));
  const tiers = [];
  for (const step of TIER_STEPS) {
    const ratio = Math.min(step, limit);
    const rounded = Math.round(ratio * 100) / 100;
    if (tiers.length && Math.abs(tiers[tiers.length - 1] - rounded) < 0.02) continue;
    tiers.push(rounded);
    if (ratio >= limit - 0.001) break;
  }
  if (!tiers.length) tiers.push(Math.round(limit * 100) / 100);
  return tiers;
}

function blankRecord() {
  return {
    good: 0,
    tried: null,
    ceiling: null,
    mode: "auto",
    manual: null,
    volume: 1,
    muted: false,
  };
}

function clampIndex(index, count) {
  const n = Number(index);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(n)));
}

/**
 * @param {object} [options]
 * @param {{ setPixelRatio?: (value: number) => void, getPixelRatio?: () => number }} [options.renderer]
 * @param {number} [options.devicePixelRatio]
 * @param {number} [options.cap]
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void } | null} [options.storage]
 * @param {number} [options.targetFps]
 * @param {number} [options.badFrameMs]
 * @param {number} [options.sampleSeconds]
 * @param {number} [options.warmupSeconds]
 * @param {(info: object) => void} [options.onTier]
 * @param {(info: { volume: number, muted: boolean }) => void} [options.onAudio]
 */
export function createQualityCalibration({
  renderer = null,
  devicePixelRatio = 1,
  cap = null,
  storage = null,
  targetFps = 50,
  badFrameMs = 90,
  sampleSeconds = 0.75,
  warmupSeconds = 0.35,
  onTier = null,
  onAudio = null,
} = {}) {
  const resolvedCap = Number(cap) > 0
    ? Number(cap)
    : Number(renderer?.getPixelRatio?.()) > 0
      ? Number(renderer.getPixelRatio())
      : Number(devicePixelRatio) || 1;
  const tiers = buildQualityTiers(devicePixelRatio, resolvedCap);
  let record = blankRecord();
  let index = 0;
  let phase = "settled";
  let accum = 0;
  let frames = 0;
  let panelSig = "";
  let hudSystem = null;
  let started = false;

  function load() {
    const next = blankRecord();
    try {
      const raw = storage?.getItem?.(STORAGE_KEY);
      if (!raw) return next;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return next;
      next.good = clampIndex(parsed.good, tiers.length);
      next.tried = parsed.tried == null ? null : clampIndex(parsed.tried, tiers.length);
      next.ceiling = parsed.ceiling == null ? null : clampIndex(parsed.ceiling, tiers.length);
      next.mode = parsed.mode === "manual" ? "manual" : "auto";
      next.manual = parsed.manual == null ? null : clampIndex(parsed.manual, tiers.length);
      const volume = Number(parsed.volume);
      next.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
      next.muted = !!parsed.muted;
    } catch {
      return blankRecord();
    }
    return next;
  }

  function save() {
    try {
      storage?.setItem?.(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // ignore private-mode and quota failures
    }
  }

  function emitAudio() {
    const detail = { volume: record.muted ? 0 : record.volume, muted: !!record.muted };
    try {
      onAudio?.(detail);
    } catch {
      // no-op
    }
    try {
      globalThis.dispatchEvent?.(new CustomEvent("halo-audio", { detail }));
    } catch {
      // no-op
    }
  }

  function apply(kind) {
    const pixelRatio = tiers[index];
    try {
      renderer?.setPixelRatio?.(pixelRatio);
    } catch {
      // no-op
    }
    const info = {
      index,
      count: tiers.length,
      pixelRatio,
      mode: record.mode,
      phase,
      kind,
    };
    try {
      onTier?.(info);
    } catch {
      // no-op
    }
    try {
      globalThis.dispatchEvent?.(new CustomEvent("halo-quality", { detail: info }));
    } catch {
      // no-op
    }
    refreshPanel();
  }

  function resetSample() {
    accum = 0;
    frames = 0;
  }

  function canTry(nextIndex) {
    if (nextIndex < 0 || nextIndex >= tiers.length) return false;
    if (record.ceiling != null && nextIndex >= record.ceiling) return false;
    return true;
  }

  function failTier() {
    const failed = index;
    record.ceiling = failed;
    record.tried = null;
    record.mode = "auto";
    index = Math.max(0, failed - 1);
    if (record.ceiling != null && index >= record.ceiling) index = Math.max(0, record.ceiling - 1);
    record.good = index;
    phase = "settled";
    save();
    apply("reverted");
  }

  function beginClimb() {
    const next = index + 1;
    if (!canTry(next)) {
      phase = "settled";
      record.tried = null;
      record.good = index;
      save();
      refreshPanel();
      return;
    }
    record.good = index;
    record.tried = next;
    save();
    index = next;
    // Warm the new tier before counting frames. The first frames after a
    // pixel-ratio change or a shadow-map allocation are a hitch, and that
    // hitch used to fail an otherwise healthy tier.
    phase = "warmup";
    resetSample();
    apply("raise");
  }

  function acceptTier() {
    record.good = index;
    record.tried = null;
    if (record.mode === "manual") {
      record.manual = index;
      phase = "settled";
      save();
      refreshPanel();
      return;
    }
    save();
    beginClimb();
  }

  function lines() {
    const ratio = tiers[index].toFixed(2);
    const busy = phase !== "settled";
    const mid = Math.max(0, Math.min(tiers.length - 1, Math.floor((tiers.length - 1) / 2)));
    return [
      { text: busy ? `Calibrating ${ratio}` : `Graphics ${ratio}`, color: 0xd7e4f2 },
      { text: record.mode === "auto" ? "Mode: auto" : "Mode: chosen", onClick: () => setAuto() },
      { text: "Calibrate again", onClick: () => recalibrate() },
      { text: `Low ${tiers[0].toFixed(2)}`, onClick: () => lockTier(0) },
      { text: `Medium ${tiers[mid].toFixed(2)}`, onClick: () => lockTier(mid) },
      { text: `High ${tiers[tiers.length - 1].toFixed(2)}`, onClick: () => lockTier(tiers.length - 1) },
      {
        text: record.muted ? "Sound: muted" : `Sound: ${Math.round(record.volume * 100)}%`,
        onClick: () => toggleMute(),
      },
      { text: "Quieter", onClick: () => addVolume(-0.1) },
      { text: "Louder", onClick: () => addVolume(0.1) },
    ];
  }

  function refreshPanel() {
    if (!hudSystem?.setWindowLines) return;
    const next = lines();
    const sig = next.map((line) => line.text).join("|");
    if (sig === panelSig) return;
    panelSig = sig;
    try {
      hudSystem.setWindowLines("settings", next);
    } catch {
      // no-op
    }
  }

  function setAuto() {
    record.mode = "auto";
    record.manual = null;
    record.ceiling = null;
    record.tried = null;
    record.good = index;
    phase = "warmup";
    resetSample();
    save();
    apply("auto");
  }

  function recalibrate() {
    record.mode = "auto";
    record.manual = null;
    record.ceiling = null;
    record.tried = null;
    record.good = 0;
    index = 0;
    phase = "warmup";
    resetSample();
    save();
    apply("calibrate");
  }

  function lockTier(nextIndex) {
    const target = clampIndex(nextIndex, tiers.length);
    record.mode = "manual";
    record.good = index;
    record.tried = target;
    record.manual = target;
    save();
    index = target;
    phase = "warmup";
    resetSample();
    apply("manual");
  }

  function addVolume(delta) {
    record.volume = Math.max(0, Math.min(1, Math.round((record.volume + delta) * 10) / 10));
    if (record.volume > 0) record.muted = false;
    save();
    emitAudio();
    refreshPanel();
  }

  function toggleMute() {
    record.muted = !record.muted;
    save();
    emitAudio();
    refreshPanel();
  }

  function setVolume(next) {
    const value = Number(next);
    if (!Number.isFinite(value)) return;
    record.volume = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    if (record.volume > 0) record.muted = false;
    save();
    emitAudio();
    refreshPanel();
  }

  function setMuted(muted) {
    record.muted = !!muted;
    save();
    emitAudio();
    refreshPanel();
  }

  function settle() {
    if (phase === "settled") return;
    if (record.tried != null) {
      index = clampIndex(record.good, tiers.length);
      record.tried = null;
    }
    record.good = index;
    phase = "settled";
    save();
    apply("settle");
  }

  function start() {
    if (started) return api;
    started = true;
    active.add(api);
    record = load();
    if (record.tried != null) {
      record.ceiling = record.tried;
      record.tried = null;
      if (record.mode === "manual") record.mode = "auto";
    }
    index = record.mode === "manual" && record.manual != null ? record.manual : record.good;
    index = clampIndex(index, tiers.length);
    if (record.ceiling != null && index >= record.ceiling) {
      index = Math.max(0, record.ceiling - 1);
    }
    record.good = index;
    const climbing = record.mode === "auto" && canTry(index + 1);
    phase = climbing ? "warmup" : "settled";
    resetSample();
    save();
    apply("start");
    emitAudio();
    return api;
  }

  function tick(dt) {
    if (!started) return;
    const step = Number(dt);
    if (!Number.isFinite(step) || step <= 0 || phase === "settled") return;
    if (step * 1000 >= badFrameMs && phase !== "warmup") {
      failTier();
      return;
    }
    accum += step;
    frames += 1;
    if (phase === "warmup") {
      if (accum >= warmupSeconds) {
        phase = "sample";
        resetSample();
      }
      return;
    }
    // A run of 16.7 ms frames can sum to just under the sample window.
    if (accum + 1e-4 < sampleSeconds) return;
    const fps = frames / accum;
    if (fps < targetFps) failTier();
    else acceptTier();
  }

  function attach(nextHud) {
    hudSystem = nextHud || null;
    panelSig = "";
    refreshPanel();
  }

  function dispose() {
    active.delete(api);
    hudSystem = null;
  }

  const api = {
    start,
    tick,
    attach,
    dispose,
    get tiers() {
      return tiers.slice();
    },
    get index() {
      return index;
    },
    get phase() {
      return phase;
    },
    get pixelRatio() {
      return tiers[index];
    },
    get mode() {
      return record.mode;
    },
    get audio() {
      return {
        volume: record.muted ? 0 : record.volume,
        muted: !!record.muted,
        level: record.volume,
      };
    },
    recalibrate,
    settle,
    lockTier,
    setAuto,
    setVolume,
    setMuted,
  };
  return api;
}

export function tickQualityCalibrations(dt) {
  for (const item of active) {
    try {
      item.tick(dt);
    } catch {
      // no-op
    }
  }
}
