// SPDX-License-Identifier: Apache-2.0
const ACTIVE_BUTTON_VALUE_THRESHOLD = 0.1;
const GENERIC_CONTROLLER_PROBE_LIMIT = 6;

import {
  getInputSourceProfiles,
  isQuestControllerProfile,
} from "./quest-controller-profile.js";

function isActiveButton(button) {
  return !!(
    button &&
    (button.pressed ||
      button.touched ||
      button.value > ACTIVE_BUTTON_VALUE_THRESHOLD)
  );
}

function detectControllerType(inputSource) {
  const profiles = getInputSourceProfiles(inputSource);
  const isQuest = profiles.some(isQuestControllerProfile);
  if (isQuest) {
    console.log("[InputRouter] Detected Quest/Meta controller:", profiles);
    return "quest";
  }

  return "generic";
}

function getButtonDebugState(button) {
  return button
    ? {
        pressed: button.pressed,
        value: button.value,
      }
    : null;
}

export function logInputRouterXrSessionStart(session, referenceSpace) {
  console.log("[InputRouter] XR session started");
  console.log("[InputRouter] Session:", session);
  console.log("[InputRouter] Reference space:", referenceSpace);

  if (!session || !session.inputSources) {
    return;
  }

  console.log("[InputRouter] Input sources count:", session.inputSources.length);
  session.inputSources.forEach((source, index) => {
    console.log(`[InputRouter] Input source ${index}:`, {
      handedness: source.handedness,
      targetRayMode: source.targetRayMode,
      profiles: source.profiles,
      gamepad: !!source.gamepad,
      gamepadButtons: source.gamepad ? source.gamepad.buttons.length : 0,
      gamepadAxes: source.gamepad ? source.gamepad.axes.length : 0,
      hasTargetRaySpace: !!source.targetRaySpace,
      hasGripSpace: !!source.gripSpace,
    });

    if (!source.gamepad) {
      return;
    }

    source.gamepad.buttons.forEach((button, buttonIndex) => {
      if (button.pressed || button.touched) {
        console.log(
          `[InputRouter] Button ${buttonIndex} - pressed: ${button.pressed}, touched: ${button.touched}, value: ${button.value}`
        );
      }
    });
  });
}

export function logInputRouterXrInputSourcesChange(session, event) {
  console.log("[InputRouter] Input sources changed:", {
    added: event.added.length,
    removed: event.removed.length,
    total: session ? session.inputSources.length : 0,
  });

  event.added.forEach((source, index) => {
    console.log(`[InputRouter] Added input source ${index}:`, {
      handedness: source.handedness,
      profiles: source.profiles,
    });
  });
}

function getObjectName(obj) {
  return obj?.name || obj?.constructor?.name || obj?.type;
}

function describeRegisteredObject(obj, createVector3) {
  return {
    name: getObjectName(obj),
    isMesh: obj.isMesh,
    hasChildren: obj.children?.length > 0,
    visible: obj.visible,
    position: obj.position?.toArray(),
    worldPosition: obj.parent
      ? obj.getWorldPosition(createVector3()).toArray()
      : "no parent",
    parentedToCamera: obj.parent && obj.parent.isCamera,
    hasGeometry: !!(obj.geometry || obj.children?.find((c) => c.geometry)),
  };
}

function describeRaycastTest(mesh, intersects, createVector3) {
  const worldPosition = mesh.getWorldPosition(createVector3()).toArray();
  return {
    intersects: intersects.length,
    visible: mesh.visible,
    localPosition: mesh.position.toArray(),
    worldPosition,
    hasGeometry: !!mesh.geometry,
    geometryType: mesh.geometry?.type,
    parentedToCamera: mesh.parent && mesh.parent.isCamera,
  };
}

export const inputRouterXrDebug = {
  sessionEnd() {
    console.log("[InputRouter] XR session ended");
  },
  noSession() {
    console.debug("[InputRouter] No XR session available");
  },
  noInputSources() {
    console.warn("[InputRouter] No input sources found in XR session");
  },
  referenceSpaceError(error) {
    console.warn("[InputRouter] Could not get XR reference space:", error);
  },
  noReferenceSpace() {
    console.warn("[InputRouter] No reference space available");
  },
  inputSourceCount(inputSourceCount) {
    console.debug(`[InputRouter] Processing ${inputSourceCount} input sources`);
  },
  inputSourceFrame(inputSource) {
    console.debug("[InputRouter] Processing input source:", {
      handedness: inputSource.handedness,
      targetRayMode: inputSource.targetRayMode,
      profiles: inputSource.profiles,
      hasTargetRaySpace: !!inputSource.targetRaySpace,
      hasGamepad: !!inputSource.gamepad,
      gamepadButtons: inputSource.gamepad
        ? inputSource.gamepad.buttons.length
        : 0,
    });
  },
  missingTargetRaySpace(inputSource) {
    console.warn("[InputRouter] Input source missing targetRaySpace:", inputSource);
  },
  missingGamepad(inputSource) {
    console.warn("[InputRouter] Input source missing gamepad:", inputSource);
  },
  pointerHighlightCreated() {
    console.log("[InputRouter] Created VR pointer highlight for controller");
  },
  poseError(error) {
    console.warn("[InputRouter] Could not get pose for input source:", error);
  },
  noPose() {
    console.warn("[InputRouter] No pose available for input source");
  },
  shouldLogRaycast(inputSource, triggerPressed) {
    return triggerPressed && inputSource.handedness === "left";
  },
  raycastStart(inputSource, origin, forward, registeredObjectsCount, triggerPressed) {
    console.log(`[InputRouter] 🎯 RAYCAST DEBUG (${inputSource.handedness}):`, {
      origin: origin.toArray(),
      forward: forward.toArray(),
      registeredObjects: registeredObjectsCount,
      triggerPressed,
    });
  },
  registeredObjects(objects, createVector3) {
    console.log(
      "[InputRouter] Registered objects:",
      objects.map((obj) => describeRegisteredObject(obj, createVector3))
    );
  },
  objectWithoutMesh(obj) {
    console.warn("[InputRouter] ⚠️ Object has no mesh:", getObjectName(obj));
  },
  cameraSpaceRaycast(obj, origin, cameraOrigin, forward, cameraForward) {
    console.log(`[InputRouter] Camera-space raycast for ${obj.name}:`, {
      worldOrigin: origin.toArray(),
      cameraOrigin: cameraOrigin.toArray(),
      worldForward: forward.toArray(),
      cameraForward: cameraForward.toArray(),
    });
  },
  raycastTest(mesh, intersects, createVector3) {
    console.log(
      `[InputRouter] Raycast test on ${mesh.name || mesh.constructor?.name}:`,
      describeRaycastTest(mesh, intersects, createVector3)
    );
  },
  hitFound(obj, intersect) {
    console.log("[InputRouter] 🎯 HIT FOUND!", {
      object: getObjectName(obj),
      distance: intersect.distance,
      point: intersect.point.toArray(),
    });
  },
  finalHit(hit) {
    console.log("[InputRouter] 🎯 Final hit result:", {
      object: getObjectName(hit.obj),
      distance: hit.intersect.distance,
    });
  },
  noHits() {
    console.log("[InputRouter] ❌ No hits detected");
  },
  hudDragUpdate(deltaInCameraSpace, newPos) {
    console.log("[InputRouter] VR HUD drag update:", {
      deltaCamera: deltaInCameraSpace.toArray(),
      newPos: newPos.toArray(),
    });
  },
};

export function getInputRouterXrControllerButtons(inputSource) {
  const gamepad = inputSource.gamepad;
  if (!gamepad || !gamepad.buttons) {
    console.warn("[InputRouter] No gamepad or buttons found for input source");
    return { trigger: false, grip: false };
  }

  const controllerType = detectControllerType(inputSource);
  let triggerPressed = false;
  let gripPressed = false;

  console.debug(`[InputRouter] Button debug for ${inputSource.handedness}:`, {
    controllerType,
    buttonCount: gamepad.buttons.length,
    button0: getButtonDebugState(gamepad.buttons[0]),
    button1: getButtonDebugState(gamepad.buttons[1]),
  });

  switch (controllerType) {
    case "quest": {
      const triggerButton = gamepad.buttons[0];
      triggerPressed = isActiveButton(triggerButton);

      const gripButton = gamepad.buttons[1];
      gripPressed = isActiveButton(gripButton);

      const aButton = isActiveButton(gamepad.buttons[4]);
      const bButton = isActiveButton(gamepad.buttons[5]);
      const thumbstick = isActiveButton(gamepad.buttons[3]);
      if (triggerPressed || gripPressed || aButton || bButton || thumbstick) {
        console.log("[InputRouter] Quest buttons:", {
          trigger: triggerPressed,
          grip: gripPressed,
          a: aButton,
          b: bButton,
          thumbstick,
          handedness: inputSource.handedness,
          triggerValue: gamepad.buttons[0]?.value || 0,
          gripValue: gamepad.buttons[1]?.value || 0,
        });
      }
      break;
    }
    default:
      triggerPressed = isActiveButton(gamepad.buttons[0]);
      gripPressed = isActiveButton(gamepad.buttons[1]);

      if (!triggerPressed && !gripPressed) {
        for (
          let i = 0;
          i < Math.min(gamepad.buttons.length, GENERIC_CONTROLLER_PROBE_LIMIT);
          i++
        ) {
          const button = gamepad.buttons[i];
          if (!isActiveButton(button)) {
            continue;
          }

          if (!triggerPressed) {
            triggerPressed = true;
            console.log(
              `[InputRouter] Using button ${i} as trigger for generic controller (pressed=${button.pressed}, touched=${button.touched}, value=${button.value})`
            );
          } else if (!gripPressed) {
            gripPressed = true;
            console.log(
              `[InputRouter] Using button ${i} as grip for generic controller (pressed=${button.pressed}, touched=${button.touched}, value=${button.value})`
            );
            break;
          }
        }
      }
      break;
  }

  return { trigger: triggerPressed, grip: gripPressed };
}

export function logInputRouterXrGamepadState(inputSource, buttonTestDone) {
  if (!inputSource.gamepad || !inputSource.gamepad.buttons) {
    return buttonTestDone;
  }

  const pressedButtons = [];
  const touchedButtons = [];
  inputSource.gamepad.buttons.forEach((button, index) => {
    if (button.pressed) {
      pressedButtons.push(`${index}(${button.value.toFixed(2)})`);
    }
    if (button.touched) {
      touchedButtons.push(`${index}(${button.value.toFixed(2)})`);
    }
  });

  if (!buttonTestDone && (pressedButtons.length > 0 || touchedButtons.length > 0)) {
    console.log(
      `🎮 [BUTTON TEST] ${inputSource.handedness} controller detected input!`
    );
    console.log(`   - Pressed buttons: ${pressedButtons.join(", ") || "none"}`);
    console.log(`   - Touched buttons: ${touchedButtons.join(", ") || "none"}`);
    console.log(
      `   - Total buttons available: ${inputSource.gamepad.buttons.length}`
    );
    console.log(
      `   - Controller profiles: ${getProfiles(inputSource).join(", ")}`
    );
    buttonTestDone = true;

    inputSource.gamepad.buttons.forEach((button, index) => {
      console.log(
        `   - Button ${index}: pressed=${button.pressed}, touched=${button.touched}, value=${button.value}`
      );
    });
  }

  if (pressedButtons.length > 0 || touchedButtons.length > 0) {
    console.log(`[InputRouter] ${inputSource.handedness} gamepad:`, {
      pressed: pressedButtons.join(", "),
      touched: touchedButtons.join(", "),
      totalButtons: inputSource.gamepad.buttons.length,
    });
  }

  return buttonTestDone;
}
