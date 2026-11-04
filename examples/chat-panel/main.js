/**
 * Purpose: the smallest scene that proves the HUD chat panel draws, scrolls and
 * sends — with a FAKE transport, because Halo owns the panel and knows nothing
 * about any chat service.
 *
 * This is the page `scripts/look-at-chat-panel.mjs` drives headlessly, and the
 * page a human opens to see the panel. It is also the worked example of the
 * transport contract: whatever an app has (Magna's `@magna/chat-client`
 * `ChatRoomSession`, a game server, a mock like this one) only has to
 * `subscribe`, `send`, and optionally name an author.
 */

import * as THREE from "three";
import { createSceneHudBootstrap, renderHudFrame, startAnimationLoop } from "../../src/core.js";
import { createHudChatPanel } from "../../src/ui/index.js";

/** A transport with no server behind it: it holds messages in an array and
 *  tells its listener whenever that array changes. Exactly the surface a real
 *  client exposes, and nothing more. */
function createFakeTransport() {
  const names = { "usr-ada": "Ada Lovelace", "usr-grace": "Grace Hopper" };
  const messages = [
    { id: "m1", authorUserId: "usr-ada", body: "Table is open. Two seats left.", createdAt: new Date(Date.now() - 120000).toISOString() },
    { id: "m2", authorUserId: "usr-grace", body: "On my way.", createdAt: new Date(Date.now() - 60000).toISOString() },
  ];
  const listeners = new Set();
  const publish = () => {
    for (const listener of listeners) listener({ messages: [...messages], status: "live", watching: 2, hasMore: false });
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      listener({ messages: [...messages], status: "live", watching: 2, hasMore: false });
      return () => listeners.delete(listener);
    },
    async send(body) {
      messages.push({ id: `m${messages.length + 1}`, authorUserId: "usr-ada", body, createdAt: new Date().toISOString() });
      publish();
    },
    nameFor: (userId) => names[userId] ?? "Someone",
  };
}

const canvas = document.getElementById("c");

const { renderer, scene, camera, hudSystem, navigation } = createSceneHudBootstrap({
  THREE,
  canvas,
  buildWorld: ({ scene }) => {
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20242c, 1.1));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 0.1, 32),
      new THREE.MeshStandardMaterial({ color: 0x3d5a45, roughness: 0.6 }),
    );
    table.position.set(0, 0.75, -2.5);
    scene.add(table);
    return [table];
  },
  hudOptions: { uiPreset: "minimal" },
  isTyping: () => Boolean(globalThis.__haloChatPanel?.isTyping?.()),
});

const panel = createHudChatPanel({
  hudSystem,
  renderer,
  transport: createFakeTransport(),
  key: "chat",
  title: "TABLE ONE",
  // Clear of the built-in STATUS window, which the HUD parks top-centre. An
  // app chooses where its panels live; Halo only refuses the reserved KEYS.
  x: 24,
  y: 380,
  w: 460,
  h: 260,
});

// Exposed so the headless check can drive the panel the way a person would —
// and so a human poking at the console can too.
globalThis.__haloChatPanel = panel;

startAnimationLoop({
  renderer,
  THREE,
  maxDelta: 0.05,
  onFrame: ({ dt }) => renderHudFrame({ renderer, scene, camera, dt, hudSystem, navigation }),
});
