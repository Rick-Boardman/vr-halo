import assert from "node:assert/strict";
import test from "node:test";
import { buildQualityTiers, createQualityCalibration } from "../src/quality-calibration.js";

function memoryStorage(initial = null) {
  const data = new Map();
  if (initial) data.set("halo.graphics.v1", initial);
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    raw: data,
  };
}

test("tiers stop at the renderer cap", () => {
  assert.deepEqual(buildQualityTiers(1.5, 2), [0.5, 0.75, 1, 1.25, 1.5]);
  assert.deepEqual(buildQualityTiers(1, 1), [0.5, 0.75, 1]);
  assert.deepEqual(buildQualityTiers(3, 2), [0.5, 0.75, 1, 1.25, 1.5, 2]);
});

test("a fresh machine starts low and stops before a bad tier", () => {
  const applied = [];
  const storage = memoryStorage();
  const quality = createQualityCalibration({
    devicePixelRatio: 2,
    cap: 2,
    storage,
    sampleSeconds: 0.5,
    warmupSeconds: 0.2,
    targetFps: 50,
    renderer: { setPixelRatio(value) { applied.push(value); } },
  });
  quality.start();
  assert.equal(quality.pixelRatio, 0.5);
  assert.equal(applied[0], 0.5);

  quality.tick(0.2);
  for (let i = 0; i < 30; i += 1) quality.tick(1 / 60);
  assert.equal(quality.pixelRatio, 0.75);
  assert.equal(quality.phase, "warmup");

  const saved = JSON.parse(storage.raw.get("halo.graphics.v1"));
  assert.equal(saved.good, 0);
  assert.equal(saved.tried, 1);

  quality.tick(0.2);
  assert.equal(quality.phase, "sample");
  quality.tick(0.12);
  assert.equal(quality.pixelRatio, 0.5);
  assert.equal(quality.phase, "settled");
  const after = JSON.parse(storage.raw.get("halo.graphics.v1"));
  assert.equal(after.tried, null);
  assert.equal(after.ceiling, 1);
  assert.equal(after.good, 0);
  quality.dispose();
});

test("a hitch while a new tier warms up does not reject that tier", () => {
  const quality = createQualityCalibration({
    devicePixelRatio: 2,
    cap: 2,
    storage: memoryStorage(),
    sampleSeconds: 0.5,
    warmupSeconds: 0.2,
    targetFps: 50,
    badFrameMs: 90,
    renderer: { setPixelRatio() {} },
  });
  quality.start();
  quality.tick(0.2);
  for (let i = 0; i < 30; i += 1) quality.tick(1 / 60);
  assert.equal(quality.pixelRatio, 0.75);
  quality.tick(0.2);
  assert.equal(quality.pixelRatio, 0.75);
  assert.notEqual(quality.phase, "settled");
  for (let i = 0; i < 30; i += 1) quality.tick(1 / 60);
  assert.equal(quality.pixelRatio, 1);
  quality.dispose();
});

test("settle keeps the last accepted tier and stops the climb", () => {
  const storage = memoryStorage();
  const quality = createQualityCalibration({
    devicePixelRatio: 2,
    cap: 2,
    storage,
    sampleSeconds: 0.5,
    warmupSeconds: 0.2,
    targetFps: 50,
    renderer: { setPixelRatio() {} },
  });
  quality.start();
  quality.tick(0.2);
  for (let i = 0; i < 30; i += 1) quality.tick(1 / 60);
  assert.equal(quality.pixelRatio, 0.75);
  assert.equal(quality.phase, "warmup");
  quality.settle();
  assert.equal(quality.pixelRatio, 0.5);
  assert.equal(quality.phase, "settled");
  const saved = JSON.parse(storage.raw.get("halo.graphics.v1"));
  assert.equal(saved.good, 0);
  assert.equal(saved.tried, null);
  quality.settle();
  assert.equal(quality.pixelRatio, 0.5);
  assert.equal(quality.phase, "settled");
  quality.dispose();
});

test("a tier that froze the last launch is not tried again", () => {
  const storage = memoryStorage(JSON.stringify({
    good: 1,
    tried: 2,
    ceiling: null,
    mode: "auto",
    manual: null,
    volume: 0.4,
    muted: false,
  }));
  const quality = createQualityCalibration({
    devicePixelRatio: 2,
    cap: 2,
    storage,
    renderer: { setPixelRatio() {} },
  });
  quality.start();
  assert.equal(quality.pixelRatio, 0.75);
  assert.equal(quality.phase, "settled");
  assert.equal(quality.audio.volume, 0.4);
  const saved = JSON.parse(storage.raw.get("halo.graphics.v1"));
  assert.equal(saved.ceiling, 2);
  assert.equal(saved.tried, null);
  quality.dispose();
});

test("volume and mute keep the stored level", () => {
  const heard = [];
  const quality = createQualityCalibration({
    devicePixelRatio: 1,
    cap: 1,
    storage: memoryStorage(),
    renderer: { setPixelRatio() {} },
    onAudio: (info) => heard.push(info),
  });
  quality.start();
  quality.setVolume(0.9);
  assert.equal(quality.audio.level, 0.9);
  assert.equal(quality.audio.volume, 0.9);
  assert.equal(quality.mode, "auto");
  quality.setMuted(true);
  assert.equal(quality.audio.muted, true);
  assert.equal(quality.audio.volume, 0);
  assert.equal(quality.audio.level, 0.9);
  quality.setVolume(0.4);
  assert.equal(quality.audio.muted, false);
  assert.equal(quality.audio.volume, 0.4);
  assert.equal(heard.at(-1).volume, 0.4);
  quality.dispose();
});
