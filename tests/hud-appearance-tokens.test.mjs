// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { contrastHudInk, styleHudListEntry } from "../src/hud-appearance-tokens.js";

test("window appearance renders light text contrast and distinguishes ordinary, selected and action rows", () => {
  const palette = {surface:0xf8fafc,text:0x22354a,row:0xf1f5f9,selectedRow:0xd7e7f8,
    field:0xdde9f6,fieldText:0x173754,accent:0x245e96,accentText:0xffffff};
  const action = () => {};
  const entry = {text:"Example",color:0xe9efff,rowBgColor:0x1c2836,
    colorRanges:[{start:0,end:1,color:0xeeebaa}],actionButtonOnClick:action,
    rowBgOpacity:0.96,actionButtonText:"Use",actionButtonBgColor:0x245e96};
  assert.equal(styleHudListEntry(entry,null),entry);
  const rendered=styleHudListEntry(entry,palette);
  assert.equal(rendered.rowBgColor,palette.row);
  assert.equal(rendered.actionButtonBgColor,palette.accent);
  assert.equal(rendered.actionButtonOnClick,action);
  assert.equal(rendered.colorRanges[0].start,0);
  assert.notEqual(rendered.colorRanges[0].color,entry.colorRanges[0].color);
  assert.notEqual(rendered.color,entry.color);
  assert.equal(entry.rowBgOpacity,0.96);
  assert.equal(styleHudListEntry({...entry,rowBgColor:0x2a4a6e},palette).rowBgColor,palette.selectedRow);
  assert.equal(contrastHudInk(0x145387,palette.surface,palette.text),0x145387);
});
