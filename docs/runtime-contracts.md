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
