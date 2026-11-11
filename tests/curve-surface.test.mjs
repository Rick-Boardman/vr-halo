import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildRibbonSurfaceGeometry, buildRoadSurfaceGeometry } from "@rb/halo/curve-surface";

const pair = (x, y, z, width = 2) => ({
  leftPoint: { x: x - width / 2, y, z },
  rightPoint: { x: x + width / 2, y, z },
});

function assertUp(geometry, triangles) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const indices = geometry.getIndex();
  assert.equal(indices.count, triangles * 3);
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(position, indices.getX(i + j)));
    const face = b.sub(a).cross(c.sub(a)).normalize();
    assert.ok(face.y > 0, `face ${i / 3} must face up`);
  }
  for (let i = 0; i < normal.count; i += 1) {
    const n = new THREE.Vector3().fromBufferAttribute(normal, i);
    assert.ok(n.y > 0, `vertex ${i} must face up`);
    assert.ok(Math.abs(n.length() - 1) < 1e-6);
  }
}

for (const sloped of [false, true]) {
  test(`open ${sloped ? "sloped" : "flat"} strip faces up for either travel direction and edge naming`, () => {
    const original = [pair(0, 0, 0), pair(0, sloped ? 2 : 0, -3), pair(1, sloped ? 3 : 0, -6)];
    const snapshot = structuredClone(original);
    for (const reverse of [false, true]) {
      for (const swap of [false, true]) {
        let pairs = reverse ? original.toReversed() : original;
        if (swap) pairs = pairs.map(({ leftPoint, rightPoint }) => ({ leftPoint: rightPoint, rightPoint: leftPoint }));
        const geometry = buildRibbonSurfaceGeometry(pairs, { uvScale: 4 });
        assert.equal(geometry.getAttribute("position").count, 6);
        assertUp(geometry, 4);
        assert.deepEqual(Array.from(geometry.getAttribute("uv").array), [0, 0, 0, 1, 2, 0, 2, 1, 4, 0, 4, 1]);
        if (sloped) assert.ok(Math.abs(geometry.getAttribute("normal").getZ(0)) > 0.1);
        geometry.dispose();
      }
    }
    assert.deepEqual(original, snapshot);
  });
}

test("closed strips join the last pair to the first with a UV seam in either direction", () => {
  const pairs = Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    const point = (radius) => ({ x: Math.cos(angle) * radius, y: Math.sin(angle), z: Math.sin(angle) * radius });
    return { leftPoint: point(3), rightPoint: point(5) };
  });
  for (const ordered of [pairs, pairs.toReversed()]) {
    for (const repeated of [false, true]) {
      const geometry = buildRibbonSurfaceGeometry(repeated ? [...ordered, ordered[0]] : ordered, { closed: true });
      assertUp(geometry, 16);
      const position = geometry.getAttribute("position");
      assert.equal(position.count, 18);
      assert.deepEqual(Array.from(position.array.slice(0, 6)), Array.from(position.array.slice(-6)));
      assert.equal(geometry.getAttribute("uv").getX(16), 1);
      geometry.dispose();
    }
  }
});

test("each triangle is oriented independently even for a twisted edge pair", () => {
  const geometry = buildRibbonSurfaceGeometry([pair(0, 0, 0), pair(0, 1, -3, -2)]);
  assertUp(geometry, 2);
  geometry.dispose();
});

test("invalid and vertically projected or degenerate faces fail explicitly", () => {
  assert.throws(() => buildRibbonSurfaceGeometry(null), TypeError);
  assert.throws(() => buildRibbonSurfaceGeometry([]), RangeError);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(0, 0, 0)]), RangeError);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(0, 0, 0), pair(0, 0, 1)], { closed: true }), RangeError);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(0, 0, 0), pair(0, NaN, 1)]), TypeError);
  assert.throws(() => buildRibbonSurfaceGeometry([{}, {}]), TypeError);
  assert.throws(() => buildRibbonSurfaceGeometry(new Array(2)), TypeError);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(0, 0, 0), pair(0, 0, 1)], { uvScale: Infinity }), TypeError);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(0, 0, 0), pair(0, 1, 0)]), /nonzero XZ area/);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(0, 0, 0), pair(0, 0, 0)]), /nonzero XZ area/);
  assert.throws(() => buildRibbonSurfaceGeometry([pair(1e20, 0, 0, 1e20), pair(1e20, 0, 1e20, 1e20)]), /normal precision/);
});

test("existing curve sampler retains its return shape and winding", () => {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 0)];
  const result = buildRoadSurfaceGeometry({
    curve: { getPointAt: (t) => points[t * 2] },
    segmentCount: 2,
    createRoadCrossSection: ({ point }) => pair(point.x, point.y, point.z),
  });
  assert.deepEqual(result.sampledPoints, points);
  assert.deepEqual(Array.from(result.geometry.getIndex().array), [0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  result.geometry.dispose();
});
