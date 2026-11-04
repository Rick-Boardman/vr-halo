// SPDX-License-Identifier: Apache-2.0
import { UI_CORNER_INSET_PX } from "../ui/ui-positioning-policy.js";

class VRButton {
  static createButton(renderer) {
    const button = document.createElement("button");

    function setupButtonStyle(isEnabled = true) {
      button.style.display = "";
      button.style.cursor = isEnabled ? "pointer" : "not-allowed";
      button.style.position = "absolute";
      button.style.bottom = `${UI_CORNER_INSET_PX}px`;
      button.style.right = `${UI_CORNER_INSET_PX}px`;
      button.style.padding = "12px";
      button.style.border = "1px solid #fff";
      button.style.borderRadius = "4px";
      button.style.background = isEnabled
        ? "rgba(0,0,0,0.1)"
        : "rgba(60,60,60,0.3)";
      button.style.color = "#fff";
      button.style.font = "normal 13px sans-serif";
      button.style.textAlign = "center";
      button.style.opacity = isEnabled ? "0.85" : "0.5";
      button.style.outline = "none";
      button.style.zIndex = "999";
      button.style.minWidth = "100px";
      button.style.transition = "all 0.3s ease";
    }

    function showVREnabled() {
      setupButtonStyle(true);
      button.textContent = "ENTER VR";

      button.onmouseenter = () => {
        button.style.opacity = "1.0";
        button.style.background = "rgba(20,20,20,0.3)";
      };
      button.onmouseleave = () => {
        button.style.opacity = "0.85";
        button.style.background = "rgba(0,0,0,0.1)";
      };

      button.onclick = async () => {
        if (!renderer.xr.isPresenting) {
          try {
            const session = await navigator.xr.requestSession("immersive-vr", {
              optionalFeatures: ["local-floor", "bounded-floor"],
            });

            session.addEventListener("end", () => {
              button.textContent = "ENTER VR";
              renderer.xr.isPresenting = false;
            });

            await renderer.xr.setSession(session);
            button.textContent = "EXIT VR";
          } catch (error) {
            console.warn("Error starting VR session:", error);
            showVRError(error.message || "Failed to start VR session");
          }
        } else {
          const session = renderer.xr.getSession();
          if (session) {
            session.end();
          }
        }
      };
    }

    function showVRError(message) {
      setupButtonStyle(false);
      button.textContent = "VR ERROR";
      button.title = message;
      button.style.background = "rgba(180,60,60,0.3)";
      button.onclick = null;
    }

    if (!window.isSecureContext || !("xr" in navigator)) {
      button.style.display = "none";
      return button;
    }

    navigator.xr
      .isSessionSupported("immersive-vr")
      .then((supported) => {
        if (supported) {
          showVREnabled();
        } else {
          button.style.display = "none";
        }
      })
      .catch(() => {
        button.style.display = "none";
      });

    return button;
  }
}

export { VRButton };
