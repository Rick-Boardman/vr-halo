// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { hudContrastRatio } from "../src/hud-appearance-tokens.js";
import { dockTile, resolveHotbarDock } from "../src/hud-hotbar-appearance.js";

test("native dock is opted in and preserves distinct readable control states",()=>{
  assert.equal(resolveHotbarDock("light",null),null);
  assert.equal(resolveHotbarDock("legacy",{hotbarFill:0x162131}),null);
  for(const mode of ["light","dark"]){
    const dock=resolveHotbarDock(mode,{hotbarFill:0x162131});
    const idle=dockTile(dock,{});
    const hover=dockTile(dock,{},{hovered:true});
    const active=dockTile(dock,{},{active:true});
    const disabled=dockTile(dock,{interactive:false},{active:true,hovered:true});
    const danger=dockTile(dock,{activeBgColor:0x7f2f35},{active:true});
    assert.notEqual(idle.fill,hover.fill);
    assert.notEqual(idle.fill,active.fill);
    assert.equal(disabled.fill,dock.disabled);
    assert.notEqual(danger.fill,active.fill);
    assert(hudContrastRatio(dock.ink,dock.shell)>=4.5);
    for(const state of [idle,hover,active,danger])assert(hudContrastRatio(dock.actionInk,state.fill)>=4.5);
  }
});
