# Halo quick start

Halo is plain JavaScript ES modules. Use Node.js 24 and npm 11 for the
repository tooling. The included browser example uses local installed dependencies.

## Run from a clean checkout

```sh
git clone https://github.com/Rick-Boardman/vr-halo.git
cd vr-halo
npm ci
npm start
```

Visit http://127.0.0.1:8080/examples/chat-panel/.
The server binds to loopback only. Stop it with Ctrl+C. Open the example's
[index.html](../examples/chat-panel/index.html) for the complete import map and
[main.js](../examples/chat-panel/main.js) for the complete working application.

The example builds a lit scene, creates a HUD chat panel using a local fake
transport, renders it through Halo's frame loop, and exposes the panel for
inspection. It sends nothing to a server. Replace the fake transport with an
application-owned transport when integrating a real service.

TABLE ONE is one window. The line you type is a field in its footer, not a
second window. HELP opens on the right with keyboard and mouse navigation.
Narrow viewports stack the panels. Click the footer to type, press Enter to
send, and Escape or click away to return to scene navigation. Text-editing
keys are consumed by the focused editor. Clicking and dragging the world
releases the field and looks around on that first drag. A successful send
clears the field and keeps it focused for the next message. Failed sends keep
the draft, and a delayed send never clears text edited while waiting.

## Install a versioned package in another application

```sh
npm install three@0.160.1 troika-three-text@0.52.4 https://github.com/Rick-Boardman/vr-halo/releases/download/v0.2.0/rb-halo-0.2.0.tgz
```

Import the bootstrap from `@rb/halo` and the chat panel from `@rb/halo/ui`.
A bundler can resolve these package imports. For browser-native ESM, use an import
map like the included example, adapting the module roots to your host. Map
`three` and all Troika transitive imports to a single compatible installation.

Copy Halo's asset directory and its accompanying font licenses together when
self-hosting modules. Serve JavaScript with a JavaScript MIME type.

## Validate

```sh
npm run build
npx playwright install chromium
npm run test:browser
npm run audit:release
```

The browser check creates an actual WebGL context and saves a screenshot under
`dist/shots/`. Its simulated-XR step forces `renderer.xr.isPresenting` with no XR
session or controllers. Headless software rendering does not prove headset behavior.
Check physical-device input, text entry, and XR presentation on the devices you
support. Immersive WebXR requires a secure context and compatible hardware.

## Developer and AI-agent boundaries

Read [AGENTS.md](../AGENTS.md) before extending the library. Inspect actual
exports and option documentation rather than inventing APIs. Reuse shared
runtime and graph primitives, keep application policy in the application,
and report the checks you actually ran. Public hosted URLs may track a moving
release; use a tagged package for reproducible applications.
