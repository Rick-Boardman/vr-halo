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
