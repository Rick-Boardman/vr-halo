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

const { renderer, scene, camera, hudSystem, navigation, rig, look } = createSceneHudBootstrap({
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
  hudOptions: { uiPreset: "minimal", visibleWindowKeys: ["help", "hotbar", "xr"] },
  isTyping: () => Boolean(globalThis.__haloChatPanel?.isTyping?.()),
});

const panel = createHudChatPanel({
  hudSystem,
  renderer,
  transport: createFakeTransport(),
  key: "table-one",
  title: "TABLE ONE",
  // Use an application-owned key so the built-in CHAT layout cannot move
  // the transcript away from its composer.
  x: 24,
  y: 24,
  w: 460,
  h: 260,
});

// Exposed so the headless check can drive the panel the way a person would —
// and so a human poking at the console can too.
globalThis.__haloChatPanel = panel;
globalThis.__haloChatExample = { hudSystem, navigation, rig, look };

hudSystem.ensureSharedWindow("help");
hudSystem.toggleHelp();
hudSystem.setHelpExtraLines([
  { text: "Z/C = roll" },
  { text: "Click SAY to type; Enter sends." },
  { text: "Escape leaves text entry." },
]);
hudSystem.setWindowHidden("debug", true);

let layoutSize = "";
function layoutDemoPanels() {
  if (renderer.xr.isPresenting) return;
  const { layoutW: width, layoutH: height, ui } = hudSystem.hud;
  const size = width + "x" + height;
  if (size === layoutSize && ui._layoutInitialized) return;
  hudSystem.update(0);
  layoutSize = size;
  const margin = 16;
  const gap = 12;
  const columns = width >= 960;
  const panelWidth = columns ? Math.min(460, (width - margin * 3) / 2) : width - margin * 2;
  const keys = panel.windowKeys();
  const transcript = ui.windows[keys.transcript];
  const composer = ui.windows[keys.composer];
  Object.assign(transcript, { x: margin, y: margin, w: panelWidth, h: columns ? 260 : 180 });
  Object.assign(composer, { x: margin, y: transcript.y + transcript.h + gap, w: panelWidth, h: 110 });
  const help = ui.windows.help;
  const helpY = columns ? margin : composer.y + composer.h + gap;
  Object.assign(help, {
    x: columns ? width - panelWidth - margin : margin,
    y: helpY,
    w: panelWidth,
    h: Math.max(220, Math.min(520, height - helpY - 100)),
  });
  hudSystem.bringToFront(keys.composer);
}

startAnimationLoop({
  renderer,
  THREE,
  maxDelta: 0.05,
  onFrame: ({ dt }) => {
    layoutDemoPanels();
    renderHudFrame({ renderer, scene, camera, dt, hudSystem, navigation });
  },
});
