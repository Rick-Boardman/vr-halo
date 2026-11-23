// SPDX-License-Identifier: Apache-2.0
const freeze=Object.freeze;
const modes=freeze({
  light:freeze({shell:0xe9f0f7,top:0xf7fafc,edge:0x9aafc4,grip:0x526d87,ink:0x172e44,
    idle:0x45617b,hover:0x335372,tileEdge:0x5f7e9d,active:0x245d96,activeEdge:0x98c2e8,
    disabled:0x8598a9,disabledEdge:0xa8b8c6,rule:0x9aafc3,status:0x344d66,statusEdge:0x55718d,actionInk:0xf4f8fc}),
  dark:freeze({shell:0x17283c,top:0x20354b,edge:0x597590,grip:0x9fb7ce,ink:0xe8f3ff,
    idle:0x3b5169,hover:0x4b6683,tileEdge:0x647f9c,active:0x245d96,activeEdge:0xa3ccef,
    disabled:0x304254,disabledEdge:0x4e6277,rule:0x58718b,status:0x354f6b,statusEdge:0x7495b5,actionInk:0xf4f8fc}),
});

/** Only opted-in graph HUDs get the dock treatment; no custom skins are replaced. */
export function resolveHotbarDock(mode, appearance) {
  return appearance?.hotbarDock ?? (Number.isFinite(appearance?.hotbarFill) ? (modes[mode] ?? null) : null);
}

export function dockTile(dock, item, { active=false, hovered=false }={}) {
  const disabled=item?.disabled===true || item?.enabled===false || item?.interactive===false;
  const raw=item?.activeBgColor??0;
  const danger=active && ((raw>>16)&255)>((raw>>8)&255)*1.6;
  if (disabled) return {fill:dock.disabled,edge:dock.disabledEdge};
  if (danger) return {fill:hovered?0x963d46:0x7b3038,edge:0xce7781};
  if (active) return {fill:hovered?0x2f6fae:dock.active,edge:dock.activeEdge};
  return {fill:hovered?dock.hover:dock.idle,edge:dock.tileEdge};
}

/** Reuse original meshes. Cache the small set of DPI-independent rounded textures. */
export function createHotbarDockPainter(THREE) {
  const textures=new Map(), original=new WeakMap();
  const css=c=>"#"+(c>>>0).toString(16).padStart(6,"0");
  function apply(mesh,w,h,{fill,edge,top,radius=7,stroke=1}={}) {
    const mat=mesh?.material;
    if (!mat) return;
    if (!Number.isFinite(fill)) {
      const state=original.get(mat);
      if (state) {mat.map=state.map;mat.color.setHex(state.color);mat.opacity=state.opacity;mat.needsUpdate=true;original.delete(mat);}
      return;
    }
    if (!THREE?.CanvasTexture || typeof document==="undefined") return;
    const width=Math.max(12,Math.min(2304,Math.round(w/4)*8)),height=Math.max(12,Math.round(h/2)*4);
    const scale=height/Math.max(1,h), key=[width,height,fill,edge,top,radius,stroke].join(":");
    let texture=textures.get(key);
    if (!texture && textures.size<240) {
      const cv=document.createElement("canvas");cv.width=width;cv.height=height;
      const c=cv.getContext("2d");if(!c)return;
      const line=stroke*scale, inset=line/2+0.5;
      c.beginPath();
      if(typeof c.roundRect==="function")c.roundRect(inset,inset,width-inset*2,height-inset*2,Math.min(height/2-inset,radius*scale));
      else c.rect(inset,inset,width-inset*2,height-inset*2);
      if(Number.isFinite(top)){const g=c.createLinearGradient(0,0,0,height);g.addColorStop(0,css(top));g.addColorStop(1,css(fill));c.fillStyle=g;}
      else c.fillStyle=css(fill);
      c.fill();
      if(Number.isFinite(edge)){c.strokeStyle=css(edge);c.lineWidth=line;c.stroke();}
      texture=new THREE.CanvasTexture(cv);texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;textures.set(key,texture);
    }
    if (!texture) return;
    if (!original.has(mat)) original.set(mat,{map:mat.map,color:mat.color.getHex(),opacity:mat.opacity});
    if (mat.map!==texture) {mat.map=texture;mat.needsUpdate=true;}
    mat.color.setHex(0xffffff);mat.opacity=1;
  }
  return {apply,dispose(){for(const t of textures.values())t.dispose();textures.clear();}};
}
