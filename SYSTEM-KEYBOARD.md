# System keyboard in immersive WebXR

Halo's canonical `createHudTextEditor` automatically connects editable HUD text to the Meta Quest Browser system keyboard when an immersive session reports `XRSession.isSystemKeyboardSupported === true`.

The editor remains a WebGL/Troika HUD surface. Halo creates a one-pixel, transparent, fixed-position DOM `textarea` only as the browser input-method endpoint, focuses it to request the Horizon OS keyboard, mirrors `input` values into the HUD editor, and removes it when the keyboard blurs, the editor closes, or the XR session ends. It is not a second visible interface.

## Consumer behavior

Projects using `createHudTextEditor`, `createHudTextPrompt`, `createHudPropertySheet`, or Halo's chat input receive the bridge automatically. Continue to pass the active renderer and use Halo's runtime exports. Do not add a product-local DOM field or product-specific virtual keyboard.

Source-checkout consumers receive the behavior as soon as they use this Halo source. Projects installed from a packaged Halo tarball must install a package built after this change.

## Platform contract

The standard WebXR Device API has no text-keyboard API. Meta Quest Browser supplies the nonstandard `isSystemKeyboardSupported` session attribute and opens its immersive system keyboard when an attached HTML input is focused. Halo feature-detects that attribute instead of checking a user-agent string.

Meta documents these current constraints:

- Each showing of the keyboard starts a new underlying editing session; the first key can replace the existing field value.
- The browser exposes the text field value and `input` changes, not individual system-keyboard key events.
- The input must be attached to the DOM. Halo keeps it fixed inside the viewport so it does not deliberately move the underlying page to an off-screen field.

Official references:

- [Meta: System Keyboard in WebXR](https://developers.meta.com/horizon/documentation/web/webxr-keyboard/)
- [Meta: Virtual keyboard design guidance](https://developers.meta.com/horizon/design/virtual-keyboard/)

## Verification boundary

`npm test` verifies feature detection, value synchronization, dismissal, and cleanup with a simulated DOM/session. A physical Quest test must still confirm keyboard presentation, controller and hand entry, dictation, Done/dismiss behavior, existing-value replacement, multiline JSON, and return to the HUD on the supported Quest Browser version.

On an immersive browser that does not report system-keyboard support, Halo leaves ordinary keyboard events available but cannot promise controller-only text entry. Products that require controller-only operation must surface that unsupported capability before opening editable text.
