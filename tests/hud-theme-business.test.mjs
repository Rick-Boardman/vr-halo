import assert from "node:assert/strict";
import test from "node:test";
import { HUD_THEME_BUSINESS, resolveHudTheme } from "../src/hud-surface-style.js";

test("the business theme is chosen by name", () => {
  assert.equal(resolveHudTheme("business"), HUD_THEME_BUSINESS);
  assert.equal(resolveHudTheme(HUD_THEME_BUSINESS), HUD_THEME_BUSINESS);
});

test("an override keeps the business controls", () => {
  const theme = resolveHudTheme({ key: "business", accentColor: 0x112233 });
  assert.equal(theme.controlStyle, "quiet");
  assert.equal(theme.accentColor, 0x112233);
  assert.equal(theme.panelBgColor, HUD_THEME_BUSINESS.panelBgColor);
});

test("other themes keep their filled controls", () => {
  assert.equal(resolveHudTheme("professional").controlStyle, undefined);
  assert.equal(resolveHudTheme("terminal").controlStyle, undefined);
});
