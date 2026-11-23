// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { layoutHudAccordionRow } from "../src/hud-render-list-runtime.js";

const ink = {body:1,heading:2,rail:3,border:4,selected:5};
const render = (role, top, height, viewport=100, selected=false) =>
  layoutHudAccordionRow(role, 200, top, height, viewport, ink, selected);

test("native accordion has continuous rails, a header divider and one closing edge",()=>{
  const rows = [render("header",0,24), render("item",24,22), render("last",46,22)];
  assert.deepEqual(rows.map(row=>row.find(r=>r.color===3)).map(({y,h})=>[y,h]),[[0,24],[24,22],[46,22]]);
  assert.deepEqual(rows.flat().filter(r=>r.color===4&&r.w>100).map(r=>r.y),[0,23,67]);
  assert.deepEqual(render("single",74,24).filter(r=>r.color===4&&r.w>100).map(r=>r.y),[74,97]);
});
test("clipped and scrolled native accordion fragments do not create fake edges",()=>{
  const middle=render("item",0,22,10,true);
  assert(middle.every(r=>r.y>=0&&r.y+r.h<=10));
  assert(!middle.some(r=>r.color===4&&r.w>100));
  assert(middle.some(r=>r.color===5&&r.x>7));
  assert(!render("last",12,22,20).some(r=>r.color===4&&r.w>100));
  assert.deepEqual(render("unexpected",0,22),[]);
});
