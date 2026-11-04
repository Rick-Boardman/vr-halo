// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Create a deterministic linear-congruential pseudo-random number generator for shared runtime and tooling call sites that need stable seeded floats in the [0, 1) range.
 * @param {number} [seed=0x12345678] Unsigned 32-bit seed used to initialize the generator state.
 * @returns {() => number} Zero-argument generator function that advances internal state and returns the next pseudo-random float in the [0, 1) range.
 * @sideEffects Captures mutable generator state inside the returned closure and mutates that internal state on each invocation.
 */
export function createLcgRng(seed = 0x12345678) {
  let state = (Number(seed) >>> 0) || 0x12345678;
  return function lcgRng() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Purpose: Create a deterministic Mulberry32 pseudo-random number generator for shared runtime and tooling call sites that need stable seeded floats in the [0, 1) range.
 * @param {number} [seed=1] Unsigned 32-bit seed used to initialize the generator state.
 * @returns {() => number} Zero-argument generator function that advances internal state and returns the next pseudo-random float in the [0, 1) range.
 * @sideEffects Captures mutable generator state inside the returned closure and mutates that internal state on each invocation.
 */
export function createMulberry32Rng(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return function mulberry32Rng() {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Purpose: Advance a seeded pseudo-random generator once and return a uniformly sampled element from the provided array.
 * @template T
 * @param {() => number} rng Zero-argument pseudo-random generator that returns floats in the [0, 1) range.
 * @param {T[]} values Candidate array to sample from.
 * @returns {T | undefined} Randomly selected array element, or undefined when the array is empty.
 * @sideEffects Advances the supplied generator state by one iteration.
 */
export function pickRandomArrayElement(rng, values) {
  return values[Math.floor(rng() * values.length)];
}
