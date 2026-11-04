// SPDX-License-Identifier: Apache-2.0
const ACTIVE_AXIS_THRESHOLD = 0.1;
const DEFAULT_DIAGNOSTIC_CONSOLE_API_NAME = "webxrHud3Diagnostic";

import { isQuestControllerInputSource } from "./quest-controller-profile.js";

function getDiagnosticConsoleCommand(apiName, methodName) {
  return `${apiName}.${methodName}()`;
}

function getUnavailableInputRouterErrorMessage(apiName) {
  return `❌ Quest 3 diagnostic input router unavailable. Reload the demo before using ${getDiagnosticConsoleCommand(apiName, "run")}.`;
}

function getQuest3DiagnosticState(inputRouter) {
  return inputRouter?.getXrDiagnosticState?.() ?? null;
}

function getInputRouterDetails(inputRouter) {
  return {
    camera: !!inputRouter?.camera,
    scene: !!inputRouter?.scene,
    renderer: !!inputRouter?.renderer,
    xrEnabled: !!inputRouter?.renderer?.xr?.enabled,
  };
}

function getRendererDiagnostics(inputRouter) {
  const rendererInfo = inputRouter?.renderer?.info;
  if (!rendererInfo) {
    return null;
  }

  return {
    renderCalls: rendererInfo.render.calls,
    triangles: rendererInfo.render.triangles,
    geometries: rendererInfo.memory.geometries,
    textures: rendererInfo.memory.textures,
  };
}

/**
 * Create a live Quest controller monitoring helper for the shared XR input router.
 * Purpose: provide a console-driven monitor that samples active XR input sources each animation frame and prints pressed buttons plus active axes for Quest controller debugging.
 * @param {any} inputRouter Shared runtime input router that exposes XR diagnostic state through `getXrDiagnosticState()`.
 * @param {object} [options={}] Monitoring configuration.
 * @param {string} [options.apiName="webxrHud3Diagnostic"] Console API namespace used when logging follow-up commands.
 * @returns {{start: () => void, stop: () => void}} Frozen monitoring controller with `start()` and `stop()` methods.
 * Side effects: logs monitoring status to the console, schedules repeated `requestAnimationFrame` polling while active, reads live XR session input-source state, and stops automatically when the XR session ends.
 */
export function createControllerMonitoring(
  inputRouter,
  { apiName = DEFAULT_DIAGNOSTIC_CONSOLE_API_NAME } = {}
) {
  let monitoring = false;

  function start() {
    if (monitoring) {
      console.log("🎮 Controller monitoring is already running.");
      return;
    }

    monitoring = true;
    console.log(
      `🎮 Starting controller monitoring... (run ${getDiagnosticConsoleCommand(apiName, "stopControllerMonitoring")} to stop)`
    );

    const monitor = () => {
      const diagnosticState = getQuest3DiagnosticState(inputRouter);
      const session = diagnosticState?.session;

      if (!monitoring) {
        return;
      }

      if (!session) {
        monitoring = false;
        console.log("⚠️ XR session ended. Controller monitoring stopped.");
        return;
      }

      session.inputSources.forEach((source) => {
        if (!source.gamepad) {
          return;
        }

        const pressedButtons = [];
        source.gamepad.buttons.forEach((button, buttonIndex) => {
          if (button.pressed || button.touched) {
            pressedButtons.push(
              `B${buttonIndex}:${button.pressed ? "P" : "T"}(${button.value.toFixed(2)})`
            );
          }
        });

        const axes = source.gamepad.axes
          .map((axis, axisIndex) =>
            Math.abs(axis) > ACTIVE_AXIS_THRESHOLD
              ? `A${axisIndex}:${axis.toFixed(2)}`
              : null
          )
          .filter(Boolean);

        if (pressedButtons.length === 0 && axes.length === 0) {
          return;
        }

        const output = [];
        if (pressedButtons.length > 0) {
          output.push(`Buttons: ${pressedButtons.join(" ")}`);
        }
        if (axes.length > 0) {
          output.push(`Axes: ${axes.join(" ")}`);
        }
        console.log(`🎮 ${source.handedness}: ${output.join(" | ")}`);
      });

      requestAnimationFrame(monitor);
    };

    monitor();
  }

  function stop() {
    monitoring = false;
    console.log("🛑 Controller monitoring stopped");
  }

  return Object.freeze({ start, stop });
}

/**
 * Run the shared Quest 3 diagnostic report for the current XR input router.
 * Purpose: print a structured console diagnostic covering WebXR support, router state, XR session status, controller detection, pointer highlights, registered UI objects, renderer counters, and follow-up commands.
 * @param {any} inputRouter Shared runtime input router whose XR diagnostic state should be inspected.
 * @param {object} [options={}] Diagnostic configuration.
 * @param {string} [options.apiName="webxrHud3Diagnostic"] Console API namespace referenced in the printed follow-up commands.
 * @returns {void} Does not return a value.
 * Side effects: reads browser WebXR capabilities plus live XR session state and writes the full diagnostic report to the developer console.
 */
export function runQuest3Diagnostic(
  inputRouter,
  { apiName = DEFAULT_DIAGNOSTIC_CONSOLE_API_NAME } = {}
) {
  console.log("🎮 Quest 3 VR Controller Diagnostic Tool");
  console.log("==========================================");

  console.log("\n1. WebXR Support Check:");
  if (!window.navigator || !navigator.xr) {
    console.error("❌ WebXR not supported in this browser");
    return;
  }
  console.log("✅ WebXR API available");

  if (!window.isSecureContext) {
    console.warn("⚠️ Not in secure context (HTTPS required for some features)");
  } else {
    console.log("✅ Secure context");
  }

  console.log("\n2. Shared Input Router Check:");
  if (!inputRouter) {
    console.error("❌ Quest diagnostic input router unavailable");
    return;
  }

  const routerDetails = getInputRouterDetails(inputRouter);
  console.log("✅ Input router available");
  console.log("   - Camera:", !!routerDetails.camera);
  console.log("   - Scene:", !!routerDetails.scene);
  console.log("   - Renderer:", !!routerDetails.renderer);
  console.log("   - XR enabled:", !!routerDetails.xrEnabled);

  const diagnosticState = getQuest3DiagnosticState(inputRouter);
  const session = diagnosticState?.session;

  console.log("\n3. XR Session Status:");
  if (!session) {
    console.warn("⚠️ No active XR session (Enter VR first)");
  } else {
    console.log("✅ XR session active");
    console.log("   - Input sources:", session.inputSources.length);
    console.log("   - Reference space:", !!diagnosticState?.hasReferenceSpace);

    console.log("\n4. Controller Detection:");
    if (session.inputSources.length === 0) {
      console.error("❌ No controllers detected");
      console.log("💡 Try restarting VR session or check controller pairing");
    } else {
      session.inputSources.forEach((source, index) => {
        console.log(`\n   Controller ${index + 1} (${source.handedness}):`);
        console.log("   - Profiles:", source.profiles);
        console.log("   - Target ray space:", !!source.targetRaySpace);
        console.log("   - Grip space:", !!source.gripSpace);
        console.log("   - Gamepad:", !!source.gamepad);

        if (source.gamepad) {
          console.log("   - Buttons:", source.gamepad.buttons.length);
          console.log("   - Axes:", source.gamepad.axes.length);

          const pressedButtons = [];
          source.gamepad.buttons.forEach((button, buttonIndex) => {
            if (button.pressed) {
              pressedButtons.push(`${buttonIndex}(${button.value.toFixed(2)})`);
            }
          });
          if (pressedButtons.length > 0) {
            console.log("   - Currently pressed:", pressedButtons.join(", "));
          }
        }

        console.log(
          "   - Quest controller:",
          isQuestControllerInputSource(source) ? "✅" : "❓"
        );
      });
    }
  }

  console.log("\n5. VR Visual Indicators:");
  const pointerHighlights = diagnosticState?.pointerHighlights ?? [];
  console.log("   - Active highlights:", pointerHighlights.length);
  pointerHighlights.forEach(({ inputSource, highlight }) => {
    console.log(`   - ${inputSource.handedness}: visible=${!!highlight?.visible}`);
  });

  console.log("\n6. Registered UI Objects:");
  const registeredObjects = diagnosticState?.registeredObjects ?? [];
  console.log("   - Count:", registeredObjects.length);
  registeredObjects.forEach((obj, index) => {
    console.log(
      `   - ${index}: ${obj.constructor?.name || "Object3D"} (${obj.name || "unnamed"})`
    );
  });

  console.log("\n7. Performance Indicators:");
  const rendererInfo = getRendererDiagnostics(inputRouter);
  if (rendererInfo) {
    console.log("   - Render calls:", rendererInfo.renderCalls);
    console.log("   - Triangles:", rendererInfo.triangles);
    console.log("   - Memory geometries:", rendererInfo.geometries);
    console.log("   - Memory textures:", rendererInfo.textures);
  }

  console.log("\n8. Live Monitoring:");
  console.log("📊 To monitor controller input in real-time, run:");
  console.log(`   ${getDiagnosticConsoleCommand(apiName, "startControllerMonitoring")}`);

  console.log("\n✅ Diagnostic complete! Check results above.");
  console.log(
    `💡 Re-run ${getDiagnosticConsoleCommand(apiName, "testControllerButtons")} after entering VR if needed.`
  );
}

/**
 * Dump the currently active Quest controller button and axis state to the console.
 * Purpose: provide a one-shot console inspection of XR controller button, touch, value, and axis activity for the shared input router.
 * @param {any} inputRouter Shared runtime input router whose XR diagnostic state should be queried.
 * @returns {void} Does not return a value.
 * Side effects: logs controller status to the console and resets the router's XR button test log when that helper is available.
 */
export function testControllerButtons(inputRouter) {
  const diagnosticState = getQuest3DiagnosticState(inputRouter);
  const session = diagnosticState?.session;
  if (!session) {
    console.log("❌ No VR session active. Enter VR first.");
    return;
  }

  console.log("🎮 Testing controller buttons...");
  console.log("Press any button on your controllers now!");

  console.log(`Found ${session.inputSources.length} input sources`);

  session.inputSources.forEach((source, index) => {
    console.log(`\nController ${index + 1} (${source.handedness}):`);
    console.log(`- Profiles: ${source.profiles.join(", ")}`);
    console.log(`- Has gamepad: ${!!source.gamepad}`);

    if (!source.gamepad) {
      return;
    }

    console.log(`- Button count: ${source.gamepad.buttons.length}`);
    console.log(`- Axes count: ${source.gamepad.axes.length}`);

    source.gamepad.buttons.forEach((button, buttonIndex) => {
      if (button.pressed || button.touched || button.value > 0) {
        console.log(
          `  Button ${buttonIndex}: pressed=${button.pressed}, touched=${button.touched}, value=${button.value}`
        );
      }
    });

    source.gamepad.axes.forEach((axis, axisIndex) => {
      if (Math.abs(axis) > ACTIVE_AXIS_THRESHOLD) {
        console.log(`  Axis ${axisIndex}: ${axis.toFixed(3)}`);
      }
    });
  });

  inputRouter.resetXrButtonTestLog?.();
  console.log(
    "\n✅ Button test complete. Now press buttons to see live detection!"
  );
}

/**
 * Install the shared Quest 3 console diagnostic API on a global object.
 * Purpose: expose console commands that resolve the current shared XR input router on demand and forward to the Quest diagnostic helpers without app-specific glue code.
 * @param {object} [options={}] Console API installation configuration.
 * @param {() => any} [options.getInputRouter=null] Callback that returns the current shared XR input router when a console command runs.
 * @param {string} [options.apiName="webxrHud3Diagnostic"] Property name used when publishing the console API onto the target global object.
 * @param {Record<string, any>} [options.globalTarget=globalThis] Global object that receives the installed console API.
 * @returns {{run: () => void, testControllerButtons: () => void, startControllerMonitoring: () => void, stopControllerMonitoring: () => void}} Frozen console API with commands for the shared Quest diagnostic helpers.
 * Side effects: installs the returned console API on `globalTarget[apiName]`, logs errors when no input router is available, and creates or reuses a controller-monitoring helper tied to the active input router.
 */
export function installQuest3DiagnosticConsoleApi({
  getInputRouter = null,
  apiName = DEFAULT_DIAGNOSTIC_CONSOLE_API_NAME,
  globalTarget = globalThis,
} = {}) {
  let controllerMonitoring = null;
  let controllerMonitoringInputRouter = null;

  function resolveInputRouter() {
    const inputRouter =
      typeof getInputRouter === "function" ? getInputRouter() : null;

    if (!inputRouter) {
      console.error(getUnavailableInputRouterErrorMessage(apiName));
      return null;
    }

    return inputRouter;
  }

  function resolveControllerMonitoring(inputRouter) {
    if (
      controllerMonitoring &&
      controllerMonitoringInputRouter &&
      controllerMonitoringInputRouter !== inputRouter
    ) {
      controllerMonitoring.stop?.();
      controllerMonitoring = null;
      controllerMonitoringInputRouter = null;
    }

    if (!controllerMonitoring) {
      controllerMonitoring = createControllerMonitoring(inputRouter, {
        apiName,
      });
      controllerMonitoringInputRouter = inputRouter;
    }

    return controllerMonitoring;
  }

  function run() {
    const inputRouter = resolveInputRouter();
    if (!inputRouter) {
      return;
    }

    runQuest3Diagnostic(inputRouter, { apiName });
  }

  function runButtonTest() {
    const inputRouter = resolveInputRouter();
    if (!inputRouter) {
      return;
    }

    testControllerButtons(inputRouter);
  }

  function startControllerMonitoring() {
    const inputRouter = resolveInputRouter();
    if (!inputRouter) {
      return;
    }

    resolveControllerMonitoring(inputRouter).start();
  }

  function stopControllerMonitoring() {
    if (controllerMonitoring) {
      controllerMonitoring.stop();
      return;
    }

    const inputRouter = resolveInputRouter();
    if (!inputRouter) {
      return;
    }

    resolveControllerMonitoring(inputRouter).stop();
  }

  const consoleApi = Object.freeze({
    run,
    testControllerButtons: runButtonTest,
    startControllerMonitoring,
    stopControllerMonitoring,
  });

  globalTarget[apiName] = consoleApi;

  return consoleApi;
}
