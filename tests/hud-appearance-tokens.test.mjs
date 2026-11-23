// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { contrastHudInk, hudContrastRatio, styleHudListEntry } from "../src/hud-appearance-tokens.js";

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

test("control palettes retain readable text, boundaries, icons and selection", () => {
  const modes = [
    {panel:0xf8fafc,field:0xffffff,border:0x5e748a,ink:0x173754,focus:0x1d5790,selected:0xc1d8f3,selectionInk:0x142f4a},
    {panel:0x182536,field:0x23384d,border:0x8aa3bd,ink:0xf1f6fc,focus:0xa8d4ff,selected:0x42648a,selectionInk:0xffffff},
  ];
  for (const c of modes) {
    assert(hudContrastRatio(c.ink,c.field) >= 4.5);
    assert(hudContrastRatio(c.border,c.panel) >= 3);
    assert(hudContrastRatio(c.border,c.field) >= 3);
    assert(hudContrastRatio(c.focus,c.field) >= 3);
    assert(hudContrastRatio(c.selectionInk,c.selected) >= 4.5);
  }
  assert(hudContrastRatio(0xf4f8fc,0x245e96) >= 3);
  assert(hudContrastRatio(0xfdfefe,0x1c3249) >= 3);
});
