# Runtime contracts

Halo owns the scene rig, render loop, navigation, selection, HUD, and XR input.
Applications provide world objects, domain interpretation, and service transports.

- Use `createSceneHudBootstrap` and `renderHudFrame` for normal integration.
- Keep controllers parented to the scene rig and HUD anchored through Halo's APIs.
- HUD input gets first refusal; world interaction must respect the UI hit test.
- Visible HUD text and controls render in WebGL. An invisible attached text input
  is used only as an input-method bridge where the immersive browser requires it.
- Use a single application-provided Three.js instance. Do not import another copy
  from a CDN or bundle it independently into a shared runtime.
- Dispose listeners, frame loops, graphics resources, and temporary DOM endpoints.
- Keep endpoint URLs, authentication, persistence, and application policy outside
  the library; feed panels through application-owned adapters/transports.

[The API guide](../src/README.md) documents entry points and examples.
[HUD skinning](../HUD-WINDOW-SKINNING.md) defines texture and hit-testing contracts.
[System keyboard](../SYSTEM-KEYBOARD.md) documents feature detection and the
physical-device verification boundary. Propose behavior changes in an issue
and validate the affected desktop, touch, and immersive paths.

## Shared game boundary review (2026-11-09)

This records the owner's decisions from backlog ticket
`2026-11-09-vr-game-shared-library-review` and a source review, not a runtime
certification. The owner approved a separate game library using Halo, multiplayer
for Gravacrest, and a backend scope per game. The later decision assigns lobby UI,
party client and matching to Magna. Those capabilities must not be extracted into
the game library. `@rb/arcade` and a VR repository named `arcade` remain tentative;
approval of the boundary does not approve those identifiers or create a repository.

### Sources and current integration

Sources below are repository-relative paths in the named repository. Snapshot
commits: garbage-can-race `d50d0a4f5a7c8c052be7087b52c19fbec16752c4`,
Gravacrest `bf2bd85e218f16d061414fb86d069055da78730e`, Valley Line
`a3332969cb80f0e61f1b71d77118000bc873de09`, and Halo
`e36bc31885967dc9a74c2a998a114eed9d3165a7`. Garbage-can-race's phone-input files
also had active, uncommitted work during inspection; that work is not treated as
a released extraction source. These references are evidence for this review,
not dependencies on neighboring checkouts.

| Game | Observed Halo integration | Observed game-owned capabilities |
| --- | --- | --- |
| Garbage Can Race | `package.json` pins Halo v0.2.5 and Three.js 0.160.1. `src/main.js` uses `createSceneHudBootstrap`, `renderHudFrame`, and `startAnimationLoop`. | `src/course.js`, `road.js`, `town.js`: seeded downhill sampling, road ribbons, streamed scenery. `party.js` and `lobby.js`: play client and lobby. `input.js`, `vr-chrome.js`, `graphics-panel.js`, `audio.js`: input mapping, panel mounting, settings controls and sound. |
| Gravacrest | `package.json` pins Halo v0.2.5 and Three.js ^0.160.0. `js/app-main.js` uses Halo bootstrap and loop; `runtime/two-car-race.js` also uses Halo's fullscreen overlay lifecycle. | `js/course-builders.js`: layout generation, corner relaxation, statistics and scenery. `runtime/arcade-track.js` and `two-car-race.js`: car alignment, laps, gaps and avoidance. Its instructions keep these local until this boundary is settled. |
| Valley Line | Already pins Halo v0.2.5. `src/game-engine/halo-bridge.js` exports HUD, quality calibration and XR keyboard integration. `engine.ts` constructs `WebGLRenderer`, calls `setAnimationLoop`, requests immersive sessions and attaches controllers itself. | Train motion, stations, world/rail meshes and audio live under `src/game-engine/`. `src/app/core/bff-client.ts` and `bff/src/` own world/session/events and a WebSocket connection. |

Valley Line is therefore partly on Halo today. Moving renderer, frame loop and XR
ownership onto Halo is an adoption task, not an initial installation. Its
`package.json` uses Three.js ^0.185.1, versus Halo's exact 0.160.1 peer.
`tools/register-halo-bundler.mjs` redirects Three.js resolution and strips query
strings in relative imports; `AGENTS.md` documents deliberate peer-check bypass.
That can enforce one module instance but does not prove renderer/API compatibility.
Before migration, a separate Halo compatibility task must establish a supported
version using actual builds and browser checks for all affected consumers. A peer
version bump, if needed, is a separate release; do not silently bundle another Three.js.
That task has run: Halo v0.3.0 moves the peer to 0.185.1, recorded in
[Three.js 0.185.1 peer (v0.3.0)](#threejs-01851-peer-v030).

### Duplication and extraction recommendations

These are implementation recommendations within the approved ownership boundary;
they are not new APIs or claims that the implementations are interchangeable.

| Capability and evidence | Destination | Consumer policy that stays local |
| --- | --- | --- |
| Both `src/graphics-panel.js` (GCR) and `src/game-engine/graphics-panel.ts` plus `graphics-controls.ts` (Valley Line) draw and hit-test form controls over Halo settings. | Halo: reusable WebGL form widgets and graphics/sound settings integration with quality calibration. | Palette, presets, extreme-mode policy, asset quality and persistence. |
| GCR `src/vr-chrome.js`, particularly `placeHudMount` and `stageVrPanels`, compensates for a path-locked camera while preserving HUD raycasting. | Halo: optional path-camera mount and placement primitive. | Named windows, road clearance and preferred layout. |
| GCR `src/input.js` maps keys, hands, sticks and orientation into ride input. | Halo: device normalization and configurable axis/action mapping; carry the completed phone-permission fix forward. | Vehicle semantics, acceleration, ejection, steering sensitivity and on-foot rules. |
| Gravacrest `js/course-builders.js` already calls Halo `buildRoadSurfaceGeometry` and `createHorizontalCurveNormal`; GCR `src/road.js` builds open ribbons; Valley Line `meshes/track.ts` samples closed rail frames. | Halo retains general curve/surface primitives. Game library owns seeded course layout, sampling policy, lanes and map validation built on them. | District themes, buildings, track types, rail gauge/profile, station placement and art. Do not move whole world builders. |
| Gravacrest `runtime/two-car-race.js` computes lap wrap and race gaps; GCR `party.js` mixes race separation/poses with transport. | Game library: race progress, standings/finish and configurable in-world presentation, separate from network client code. | Car/can physics, collision response, train timetable and scoring rules. |
| GCR `name-tag.js`, `looks.js`, `remotes.js` supply in-world player presentation. | Game library: configurable tags/appearance application and remote presentation lifecycle. | Character geometry, wardrobe assets and identity policy; lobby dresser hooks belong to Magna's contract. |
| GCR `audio.js` uses Web Audio and cue planning; Valley Line `audio.ts` uses HTML audio, a motion loop and whistle. | Game library: gesture unlock, master mix/mute and disposable loop/cue adapters. This is shared lifecycle, not a common sound implementation today. | Sound files/licenses, engine/whistle/race cue selection and motion-to-pitch mapping. |

The course work should address Gravacrest's reported map problems with reproducible
seeds and geometric validation before extraction. Code shows smoothing and corner
relaxation policy, but this review did not reproduce an actual broken map. Capture
failing fixtures for cusps, self-intersections, width/curvature limits, road/scenery
clearance and loop seams; validate expected figure-eight crossings separately from
accidental intersections. GCR travels along local -Z (`course.js`, `town.js`), while
Gravacrest's orientation helper describes yaw zero as +Z (`arcade-track.js`). Define
distance units, handedness, lateral sign, open/closed behavior and seam handling
explicitly. Valley Line's rail profile and track frame construction are useful
counterexamples to treating every path as a road. Sharing geometry does not imply
sharing a world generator or a train simulation.

### Multiplayer and backend boundary

The recorded owner flow is: remain in Magna's lobby while tables fill; enter when
the table starts; report each player in; use Magna's common countdown once all are
in. The game displays its private game chat through Halo's HUD. Existing tickets
`2026-11-09-magna-play-instances` and `2026-11-09-magna-play-lobby` own the server
flow and lobby delivery. The former is waiting for owner decisions about missing
players and room lifetime. This review does not invent answers or duplicate them.
`2026-11-09-gcr-adopt-magna-lobby` already owns GCR's lobby adoption.

Per-game backend scope means game identity/configuration and game-specific data
remain isolated; it does not authorize provisioning a server per game. The library
receives the released Magna handoff and countdown through application adapters.
It neither implements the party client nor selects endpoints or credentials.
Use WebSockets for ongoing synchronization; this review approves no polling.

Valley Line's `bff/src/ws-hub.mjs` broadcasts only peer counts and acknowledges
hello/other messages; its Lambda handler acknowledges routes. The browser client
consumes peer counts and sends telemetry. There are no table, matching or shared
train-state operations in those files. `http-router.mjs` separately serves world,
sessions and score events. Thus this code is not a competing lobby implementation
that must be moved into the library. Recommendation: adopt Magna for lobby/start
and keep the existing game BFF responsibilities during adoption. Removing the BFF,
replacing telemetry transport, or adding authoritative train synchronization would
need a separately agreed task. Peer counts alone do not prove multiplayer gameplay.
Gravacrest's approved multiplayer adoption must define game-state authority and
disconnect behavior against the released Magna contract; it cannot inherit GCR's
car/can-specific pose protocol unchanged.

### Follow-up sequence and limits

Inbox proposals created from this review are deliberately not implementation
authorization. Each changes one repository and must be groomed/triaged before work:

| Ticket id (prefix `2026-11-09-`) | Repository | Deliverable and ordering |
| --- | --- | --- |
| `halo-game-settings` | Halo | Form widgets and standard settings integration, tests/docs and a release. |
| `halo-path-camera-hud` | Halo | Optional mount/placement API with raycast and cleanup checks, then release. |
| `halo-vehicle-input` | Halo | Configurable input mapping; waits for `gcr-phone-tilt-steering`, preserves secure-context and activation permission handling, then release. |
| `halo-valley-three-compatibility` | Halo | Compatibility evidence and supported peer decision before Valley Line renderer adoption; if needed, version change and tagged release. |
| `arcade-library-foundation` | Workspace | Confirm tentative name/location, register repository in inventory and establish release prerequisites. No recurring infrastructure. |
| `arcade-course-map` | Tentative game library | README/install contract plus seeded course/map validation and sampling over Halo; waits for foundation. |
| `arcade-racing` | Tentative game library | Progress/standings/finish helpers; waits for course release. |
| `arcade-world-presentation` | Tentative game library | Disposable tags, looks and remote presentation; waits for foundation. |
| `arcade-audio` | Tentative game library | Unlock/mix/loop/cue adapters; waits for foundation. |
| `arcade-game-entry` | Tentative game library | Consume released Magna handoff/countdown through an injected adapter; waits for foundation and Magna lobby/instances. |
| `gcr-adopt-shared-game-library` | Garbage Can Race | Adopt released game modules and Halo primitives after their releases and existing lobby adoption; remove extracted duplicates. |
| `gravacrest-adopt-shared-game-library` | Gravacrest | Adopt validated maps, settings/input and multiplayer entry/presentation; waits for game/Halo releases and Magna lobby. |
| `valley-adopt-halo-game-library` | Valley Line | Adopt Halo renderer/loop/XR and shared settings/audio/entry; waits for compatibility, game/Halo releases and Magna lobby; preserve train BFF duties. |

The foundation proposal names the tentative destination so dependency planning is
possible; its owner naming gate must resolve before any new-repository ticket can
be built. The game library README belongs in that new repository, not Halo.
The workspace inventory change belongs only in the workspace ticket. All library
changes require their own PR, build, merge and release tag before consumers update
package pins; consumers never import source from a neighboring checkout.

No library, backend, resource, consumer migration or public API is implemented by
this review. Source reading establishes ownership and duplication, not performance,
visual correctness, multiplayer reliability, map quality or physical-device input.
Halo's prescribed build/browser/release audit validate this documentation branch;
they do not test these consumer migrations. Physical Quest, iPhone and Android
testing and live Magna flow verification remain follow-up acceptance work. Expected
cloud cost impact of this review is zero; follow-ups must reuse existing services
and obtain approval before adding any recurring baseline charge.

## Three.js 0.185.1 peer (v0.3.0)

From v0.3.0 Halo's peer and devDependency are exactly `three` 0.185.1 (was 0.160.1);
`troika-three-text` stays `^0.52.4`. The owner chose on 2026-11-11 (backlog ticket
`2026-11-09-halo-valley-three-compatibility`) to raise the peer for every consumer
rather than hold Valley Line at 0.160.1. This is a breaking release: a consumer moves
its Halo pin and its `three` together. Evidence below is from builds and headless
Chromium runs on 2026-11-11 (SwiftShader WebGL). No physical Quest and no immersive
session was run, so XR presentation on the new version is not proven.

### What Valley Line needs from its Three.js

Valley Line `a3332969cb80f0e61f1b71d77118000bc873de09`, built with this branch of Halo in place of v0.2.5:

| Build | Result |
| --- | --- |
| `three` 0.185.1 (its lockfile) | `npm run build` and its 32 unit tests pass. One Three.js r185 per bundle. In the browser the splash and the boarded game render, with Halo's HUD windows drawn and no page errors; the only failed request is its absent BFF (`/api/v1/health`). |
| `three` 0.160.1, `@types/three` 0.160.0 | The build fails: `TS2339: Property 'environmentIntensity' does not exist on type 'Scene'` at `src/game-engine/engine.ts:1205` and `:1208`. `Scene.environmentIntensity` is absent from 0.160.1's `Scene.js` and present in 0.185.1's. |

Everything else Valley Line imports from `three` and from the addons (`GLTFLoader`,
`RGBELoader`, `Sky`, `BufferGeometryUtils`, `XRControllerModelFactory`) type-checks on
0.160.1. Its renderer setup (sRGB output, ACES tone mapping, PMREM environment, PCF
shadows, `local-floor` reference space, foveation, controller and grip objects) uses
APIs present in both. On 0.185.1 it logs two deprecations of its own:
`PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead` and `RGBELoader has
been deprecated. Please use HDRLoader instead`. Revisions between 0.160.1 and 0.185.1
were not built; 0.185.1 was chosen because Valley Line already runs on it.

### What 0.185.1 changes in Halo

- `startAnimationLoop` advances a `THREE.Timer` with the loop's timestamp instead of a
  `THREE.Clock`, which is deprecated since r183 and warns when constructed. It now
  throws `missing THREE.Timer` when handed a Three.js older than r179. Callers already
  pass the whole `THREE` namespace; no call changes.
- Nothing else in `src/` needed a change. `npm run build` (63 tests), `npm run
  test:browser` (chat panel, settings window on desktop and touch) and `npm run
  audit:release` pass on 0.185.1, and the chat-panel page logs no Three.js warning.
- 0.185's `build/three.module.js` imports `./three.core.js`, so a host that serves or
  copies only `three.module.js` breaks; serve the whole `build/` directory.

### What it breaks in consumers

`npm run gate` now serves this checkout's `three` to each consumer's
`node_modules/three` (`--own-three` keeps each consumer's copy). Run against the v0.3.0
candidate and the 12 consumers beside it, at the consumer commits named here (several
were moving their import maps that day; stellarops moved from esm.sh to `node_modules`
between runs):

| Consumer (commit) | `three` 0.185.1 | Own `three` (0.160.x) |
| --- | --- | --- |
| ascent-protocol `0bb3891`, game-civ `f3dddf4`, goblin-quest `1640d71`, gravacrest `11ea61b`, stellarops `6e2d0a0` | ok | fail: `missing THREE.Timer` |
| conduit `750d294`, loom `5ff7727` (Lattice v0.2.1) | ok | ok (no `startAnimationLoop`) |
| garbage-can-race `bd4e0e9` | fail: `THREE.BatchedMesh: Invalid instanceId 0` | fail: `missing THREE.Timer` |
| demo `c84f0a4` (esm.sh three 0.160.0, troika 0.49.0) | ok once three is 0.185.1 and troika 0.52.4 | fail: `missing THREE.Timer` |
| chorus `2bf4d3c`, helix `c46052a`, insight `804614e` (Lattice; esm.sh three 0.160.0, troika 0.49.0) | ok once three is 0.185.1 and troika 0.52.4 | ok (no `startAnimationLoop`) |

The esm.sh rows came from a one-off run that rewrote those consumers' esm.sh requests
to the 0.185.1 copy and troika 0.52.4; the gate itself cannot switch a CDN import. With
three 0.185.1 and troika 0.49.0, chorus, demo and insight fail with `Cannot set property
customDepthMaterial of ... which has only a getter`: 0.185.1's `Object3D` constructor
assigns `customDepthMaterial`, which troika 0.49.0's text mesh defines as a getter only.
Troika 0.52.4 has the setter. Lattice's runtime ran on 0.185.1 inside conduit, game-civ,
helix, loom, chorus and insight; Lattice's own build and tests on 0.185.1 were not run here.

### Migration notes

Each is the consumer's own change, made when it moves to Halo v0.3.0:

1. Move `three` to exactly `0.185.1` in the same change as the Halo pin
   (`github:Rick-Boardman/vr-halo#v0.3.0`); TypeScript consumers move `@types/three`
   to 0.185. Keep one Three.js instance.
2. Use `troika-three-text` 0.52.4 (Halo's peer). 0.49.0 breaks on 0.185.1.
3. Consumers whose import map loads three or troika from esm.sh (chorus, demo, helix,
   insight) point the map at the installed 0.185.1 and 0.52.4, serving the whole
   `three/build/` directory.
4. garbage-can-race: in 0.185.1 `BatchedMesh.addGeometry` returns a geometry id and
   an instance comes from `addInstance(geometryId)` (0.160.1 has no `addInstance`);
   pass the instance id to `setMatrixAt` (`src/props.js`).
5. Lattice moves its own `three` peer and devDependency to 0.185.1 and releases first;
   Lattice consumers (chorus, conduit, game-civ, helix, insight, loom) then move
   Halo, Lattice and `three` together.
6. Valley Line no longer needs a peer mismatch: once on v0.3.0, its `three` matches
   Halo's peer. Its `HDRLoader` and `PCFShadowMap` deprecations are its own.
