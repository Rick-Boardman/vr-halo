// SPDX-License-Identifier: Apache-2.0
const NAV_PROVE_KEY = "navProve";

function createCommonProveState() {
  return {
    yawBefore: 0,
    yawAfter: 0,
    rawDelta: 0,
    wrappedDelta: 0,
    pitchBefore: 0,
    pitchAfter: 0,
    rollBefore: 0,
    rollAfter: 0,
  };
}

function createDesktopProveState() {
  return {
    ...createCommonProveState(),
    keysDown: [],
    lastKeyEvent: null,
  };
}

function createVrProveState() {
  return {
    ...createCommonProveState(),
    blocked: "",
    enabled: true,
    overUi: false,
  };
}

/**
 * Create the shared navigation debug-state adapter that publishes desktop and VR prove data into the HUD data model.
 * Purpose: provide a stable runtime bridge for walkabout navigation code to accumulate proof/debug values and expose them to HUD panels without coupling the navigation core directly to panel implementations.
 * @param {object} [options={}] Debug adapter configuration.
 * @param {any} [options.hudSystem] HUD system whose `hud.ui.data` bag receives the navigation prove state when `publish()` is called.
 * @returns {{desktop: ReturnType<typeof createDesktopProveState>, vr: ReturnType<typeof createVrProveState>, publish: () => void}} Shared debug-state object with mutable `desktop` and `vr` prove state records plus `publish()` for copying the latest snapshot into the HUD UI data map.
 * Side effects: allocates new desktop and VR prove-state objects and, when `publish()` runs, mutates `hudSystem.hud.ui.data.navProve` if that HUD data path exists.
 */
export function createNavigationDebugStateAdapter({ hudSystem } = {}) {
  const debugState = {
    desktop: createDesktopProveState(),
    vr: createVrProveState(),
  };

  function publish() {
    try {
      const hudUiData = hudSystem?.hud?.ui?.data;
      if (hudUiData) {
        hudUiData[NAV_PROVE_KEY] = debugState;
      }
    } catch {
      // no-op
    }
  }

  return {
    desktop: debugState.desktop,
    vr: debugState.vr,
    publish,
  };
}
