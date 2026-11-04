// SPDX-License-Identifier: Apache-2.0
const QUEST_CONTROLLER_PROFILE_MATCHERS = [
  "oculus-touch-v3",
  "oculus-touch-v2",
  "oculus-touch-plus",
  "meta-quest-touch-plus",
  "meta-quest-touch",
];

const QUEST_CONTROLLER_KEYWORDS = ["oculus", "meta", "quest"];

/**
 * Return the normalized profile strings exposed by a WebXR input source.
 * Purpose: provide a shared XR helper that safely extracts controller profile identifiers from browser input-source objects before runtime diagnostics or capability checks inspect them.
 * @param {any} inputSource WebXR input-source-like object whose `profiles` array may contain controller identifier strings.
 * @returns {string[]} Lower-level profile identifiers converted to strings, or an empty array when the input source does not expose a profiles array.
 * Side effects: none.
 */
export function getInputSourceProfiles(inputSource) {
  return Array.isArray(inputSource?.profiles)
    ? inputSource.profiles.map((profile) => String(profile))
    : [];
}

/**
 * Test whether a WebXR controller profile string represents a Quest-family controller.
 * Purpose: centralize Quest controller matching for XR diagnostics and controller-specific behavior by checking normalized profile strings against explicit Quest profile ids and broader vendor keywords.
 * @param {string} profile Controller profile identifier to evaluate.
 * @returns {boolean} `true` when the normalized profile string matches a known Quest controller id or includes the shared Quest vendor keywords; otherwise `false`.
 * Side effects: none.
 */
export function isQuestControllerProfile(profile) {
  const normalizedProfile = String(profile).toLowerCase();
  return (
    QUEST_CONTROLLER_PROFILE_MATCHERS.some((questProfile) =>
      normalizedProfile.includes(questProfile.toLowerCase())
    ) ||
    QUEST_CONTROLLER_KEYWORDS.some((keyword) =>
      normalizedProfile.includes(keyword)
    )
  );
}

/**
 * Test whether a WebXR input source reports any Quest-family controller profiles.
 * Purpose: provide a higher-level XR predicate for diagnostics and runtime controller routing that evaluates an input source through the shared Quest profile matcher.
 * @param {any} inputSource WebXR input-source-like object whose `profiles` array should be inspected.
 * @returns {boolean} `true` when at least one reported profile matches the shared Quest controller predicate; otherwise `false`.
 * Side effects: none.
 */
export function isQuestControllerInputSource(inputSource) {
  return getInputSourceProfiles(inputSource).some(isQuestControllerProfile);
}
