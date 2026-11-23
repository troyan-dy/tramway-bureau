import { cityGeometry, coast, coastY, randomSource } from './geo.js';

// World-space drawing. This plate is rendered once per city, below the live network.
const ink = '#635f4c', wall = '#e5d5af';
const roofs = [
  ['#c98363', '#a5644c', '#d69976'], ['#ad7963', '#915f4e', '#c99274'],
  ['#96a59a', '#738a82', '#aab4a4'], ['#c59172', '#a7785d', '#d8aa86'],
  ['#aaa693', '#898b7a', '#bab49e'], ['#d1aa77', '#ad885d', '#ddba8a']
];
const greens = [
  ['#61846c', '#8fa782', '#b1be91'], ['#789063', '#9ead7b', '#bbc596'],
  ['#648371', '#869e7f', '#a4b892'], ['#7b977a', '#a1b492', '#b9c7a1']
];
const pp = (x, y) => ({ x, y });
const mix = (a, b, t) => pp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const move = (p, x, y) => pp(p.x + x, p.y + y);
const loc = (q, u, v) => mix(mix(q[0], q[1], u), mix(q[3], q[2], u), v);
const rect = (q, x, y, w, h) => [loc(q,x,y),loc(q,x+w,y),loc(q,x+w,y+h),loc(q,x,y+h)];
const points = arr => arr.map(([x,y]) => pp(x,y));
const choose = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];

function shape(ctx, pts, fill, stroke, width = 1, close = true) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
const stroke = (ctx, pts, color, width) => shape(ctx, pts, null, color, width, false);
function oval(ctx, x, y, rx, ry, fill, outline = null, width = 1, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = width; ctx.stroke(); }
}
function local(ctx, x, y, fn) {
  ctx.save(); ctx.translate(x, y); fn(); ctx.restore();
}
function landPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-100, -150); ctx.lineTo(1100, -150);
  for (let i = coast.length - 1; i >= 0; i--) ctx.lineTo(coast[i][0], coast[i][1]);
  ctx.closePath();
}

function coastPlate(ctx, rnd) {
  const water = ctx.createLinearGradient(450, 420, 790, 765);
  water.addColorStop(0, '#b5d2c5'); water.addColorStop(.45, '#a8c9bf'); water.addColorStop(1, '#91b9b5');
  ctx.fillStyle = water; ctx.fillRect(0, 0, 1000, 680);
  // Fine short engraving strokes follow the prevailing wind, with occasional white crests.
  for (let i = 0; i < 4000; i++) {
    const x = rnd() * 1020 - 10, y = rnd() * 690;
    if (y < coastY(x) - 12) continue;
    const length = 1 + rnd() ** 2 * 13;
    stroke(ctx, [pp(x,y),pp(x+length*.55,y-.5),pp(x+length,y-1.2)], rnd() < .45 ? '#e9e8cf80' : '#618f863d', .5 + rnd()*.4);
  }
  const shore = points(coast);
  for (const [distance, width, color] of [[38,1,'#779e924e'],[26,1.2,'#e6e9ce98'],[16,.9,'#789f9278'],[9,2,'#ededd49e'],[3,5,'#dbe1bc']]) {
    stroke(ctx, shore.map((p, i) => move(p, distance*.25, distance + Math.sin(i*1.6)*distance*.12)), color, width);
  }
  landPath(ctx); ctx.fillStyle = '#e7dfbf'; ctx.fill();
  stroke(ctx, shore, '#b0ad8a', 1.3);
  stroke(ctx, shore.map(p=>move(p,0,-5)), '#f4e6c2', 8);
}

function tree(ctx, x, y, size, color, style, turn) {
  oval(ctx,x+size*.37,y+1,size*.83,size*.29,'#66776138',null,1,-.16);
  stroke(ctx,[pp(x-1,y-3),pp(x,y+.3)],'#796f54',Math.max(1,size*.17));
  if (style === 'spire') {
    const w = size*.51, h = size*2.1;
    shape(ctx,[pp(x,y-h),pp(x+w*.75,y-h*.58),pp(x+w,y-h*.33),pp(x+w*.45,y-h*.15),pp(x-w*.62,y-h*.17),pp(x-w,y-h*.37)],color[0], '#6f806a',.65);
    shape(ctx,[pp(x,y-h+.5),pp(x-w*.2,y-h*.4),pp(x-w*.8,y-h*.29),pp(x-w*.8,y-h*.53)],color[1]);
    return;
  }
  const segments = 17;
  const crown = (s, dx, dy) => Array.from({length:segments}, (_, i) => {
    const angle = i / segments * 2*Math.PI, r = size*s*(1+.10*Math.sin(5*angle+turn)+.045*Math.sin(7*angle-turn));
    return pp(x+dx+Math.cos(angle)*r, y+dy+Math.sin(angle)*r*.82);
  });
  shape(ctx,crown(1,0,-size*.93),color[0],'#6c806740',.8);
  shape(ctx,crown(.86,-size*.14,-size*1.13),color[1]);
  stroke(ctx,[pp(x-size*.59,y-size*1.04),pp(x-size*.66,y-size*1.23),pp(x-size*.33,y-size*1.45)],color[2],size*.13+.4);
  stroke(ctx,[pp(x+size*.05,y-size*1.29),pp(x+size*.23,y-size*1.4)],color[2],size*.1+.3);
}

function windows(ctx, a, b, height, tint) {
  const length = Math.hypot(a.x-b.x,a.y-b.y);
  const n = Math.max(1,Math.floor(length / 6.5));
  for (let i = 0; i < n; i++) {
    const p = mix(a,b,(i+.5)/n);
    stroke(ctx,[move(p,0,-height*.72),move(p,0,-height*.35)],tint,1.5);
    stroke(ctx,[move(p,1.1,-height*.72),move(p,1.1,-height*.4)],'#f1ddb0',.55);
  }
}
function house(ctx, foot, h, roof, style = 'hip', opts = {}) {
  const top = foot.map(p => move(p, 0, -h));
  const shadow = foot.map(p=>move(p,h*.46,h*.25));
  shape(ctx,shadow,'#6d705344');
  for (const [a,b,fill] of [[0,1,wall],[1,2,wall],[3,0,opts.side || '#bdba98'],[2,3,opts.front || '#e2cfaa']]) {
    shape(ctx,[top[a],top[b],foot[b],foot[a]],fill,'#786f596b',.7);
    if ((a===2 || a===3) && h>4.8) windows(ctx,foot[a],foot[b],h,opts.windows || '#777b69');
  }
  const center = loc(top,.5,.5);
  const eaves = top.map(p => pp(p.x+(p.x-center.x)*.035,p.y+(p.y-center.y)*.05));
  const pitch = style === 'flat' ? .9 : Math.max(3, Math.min(9, h*.49));
  const inset = style === 'hip' ? .17 : .025;
  const rl = move(loc(eaves,inset,.5),0,-pitch), rr = move(loc(eaves,1-inset,.5),0,-pitch);
  shape(ctx,[eaves[0],eaves[1],rr,rl],roof[2], '#716b5366',.7);
  shape(ctx,[eaves[1],eaves[2],rr],roof[0], '#716b5355',.6);
  shape(ctx,[eaves[3],eaves[0],rl],roof[0], '#716b5366',.6);
  shape(ctx,[eaves[2],eaves[3],rl,rr],roof[1],'#716b5377',.7);
  stroke(ctx,[rl,rr],roof[2],1.1);
  stroke(ctx,[eaves[3],eaves[2]],'#f0d6a8',1);
  if (style !== 'flat') {
    for (const u of [.22,.4,.58,.77]) {
      const a = mix(rl,rr,u), b = mix(eaves[3],eaves[2],u);
      stroke(ctx,[mix(a,b,.28),mix(a,b,.87)],'#f5d2a63d',.8);
    }
    if(opts.dormers) for (const u of [.22,.52,.79]) {
      const p=mix(mix(rl,rr,u),mix(eaves[3],eaves[2],u),.65);
      shape(ctx,[move(p,-2.4,0),move(p,-2.1,-2.8),move(p,0,-4.8),move(p,2.1,-3.1),move(p,2.1,.3)],'#cdb999','#746f58',.55);
      stroke(ctx,[move(p,0,-2.5),move(p,0,-.4)],'#6f8177',1.2);
    }
  }
  if (opts.chimney) {
    const p = mix(rl,rr,.28);
    ctx.fillStyle = '#98745c'; ctx.fillRect(p.x,p.y-4,2.6,4.6);
    ctx.fillStyle = '#dbb18b'; ctx.fillRect(p.x-.6,p.y-4.6,3.8,1.1);
  }
}

function addTree(list, p, size, rnd, spire = false) {
  if(p.y+2>coastY(p.x)-10) return;
  const color = choose(rnd,greens), phase = rnd()*7;
  list.push({y:p.y, draw:ctx=>tree(ctx,p.x,p.y,size,color,spire?'spire':'round',phase)});
}
function addHouse(list,q,h,roof,type,opts) {
  if(q.some(p=>p.y>coastY(p.x)-12)) return;
  list.push({y:Math.max(...q.map(p=>p.y)),draw:ctx=>house(ctx,q,h,roof,type,opts)});
}
function blockPlate(ctx,q,style,rnd) {
  const boundary=rect(q,.047,.065,.906,.87);
  const tone = style==='green' ? choose(rnd,['#bac7a2','#c2cbaa','#b3c4a2']) : choose(rnd,['#d9d4b7','#ddcfb0','#d9d3b2','#d3ceb3']);
  shape(ctx,boundary,tone,'#b8b79a',1);
  for(let i=0;i<30;i++) {
    const p=loc(q,.065+rnd()*.87,.075+rnd()*.82);
    stroke(ctx,[p,move(p,2.5,-.55)],style==='green'?'#98a98565':'#b8ab8866',.65);
  }
}
function homes(ctx,list,q,rnd,area) {
  const pattern=Math.floor(rnd()*6);
  if(pattern===0 || pattern===1) {
    const rows=pattern===0?2:3;
    for(let v=0;v<2;v++) for(let u=0;u<rows;u++){
      const x=.075+u*(.86/rows)+rnd()*.025;
      const y=v===0?.12+rnd()*.045:.57+rnd()*.085;
      const width=(.77/rows)*(.68+rnd()*.27),depth=.17+rnd()*.07;
      addHouse(list,rect(q,x,y,width,depth),7+rnd()*6,choose(rnd,roofs),rnd()<.6?'hip':'gable',{chimney:rnd()<.7});
    }
    stroke(ctx,[loc(q,.09,.48),loc(q,.9,.48)],'#ece0c1',2.6);
    for(let i=0;i<3;i++) addTree(list,loc(q,.12+rnd()*.77,.38+rnd()*.17),3.3+rnd()*2.5,rnd);
  } else if(pattern===2) {
    for (let i=0;i<3;i++) {
      const x=.09+i*.277;
      addHouse(list,rect(q,x,.66,.22,.17),8+rnd()*5,choose(rnd,roofs),'gable',{chimney:true});
    }
    addHouse(list,rect(q,.1,.11,.18,.39),9,choose(rnd,roofs),'hip',{});
    addHouse(list,rect(q,.51,.16,.33,.24),11,choose(rnd,roofs),'hip',{chimney:true});
    for(let i=0;i<5;i++) addTree(list,loc(q,.13+rnd()*.73,.45+rnd()*.13),3+rnd()*3,rnd);
  } else if(pattern===3) {
    const gardens=rect(q,.1,.12,.46,.53);
    shape(ctx,gardens,'#b7bf98','#a6ae89',1);
    stroke(ctx,[loc(q,.15,.19),loc(q,.53,.61)],'#e1dcba',2);
    for(let i=0;i<7;i++) addTree(list,loc(gardens,.08+rnd()*.84,.15+rnd()*.73),3.6+rnd()*3.5,rnd,i%4===0);
    addHouse(list,rect(q,.64,.18,.18,.42),8+rnd()*3,choose(rnd,roofs),'hip',{chimney:true});
    addHouse(list,rect(q,.15,.7,.43,.15),10,choose(rnd,roofs),'hip',{});
  } else if(pattern===4) {
    const facades=choose(rnd,roofs);
    shape(ctx,rect(q,.24,.24,.53,.46),'#c2c4a1','#adad8c',.8);
    addHouse(list,rect(q,.13,.12,.72,.17),11.5,facades,'hip',{dormers:true,chimney:true});
    addHouse(list,rect(q,.69,.30,.16,.33),11.5,facades,'gable',{});
    addHouse(list,rect(q,.13,.42,.14,.36),12,choose(rnd,roofs),'hip',{});
    addHouse(list,rect(q,.31,.71,.5,.14),8,choose(rnd,roofs),'hip',{});
    for(let i=0;i<4;i++) addTree(list,loc(q,.32+rnd()*.31,.35+rnd()*.24),4+rnd()*3,rnd);
  } else {
    const shared=choose(rnd,roofs);
    for(let i=0;i<4;i++) {
      addHouse(list,rect(q,.10+i*.20,.15,.183,.235+(i%2)*.035),9+i%2*2,i===1?roofs[0]:shared,'gable',{chimney:i%2===0});
    }
    const laneA=loc(q,.11,.53),laneB=loc(q,.88,.53);
    stroke(ctx,[laneA,laneB],'#b8ad90',3.6);stroke(ctx,[laneA,laneB],'#e9dcbc',2.3);
    addHouse(list,rect(q,.11,.67,.37,.17),10,choose(rnd,roofs),'hip',{dormers:true,chimney:true});
    addHouse(list,rect(q,.68,.64,.16,.19),7.5,choose(rnd,roofs),'hip',{});
    for(let i=0;i<3;i++) addTree(list,loc(q,.46+i*.065,.66+rnd()*.15),4.1+rnd()*2,rnd);
  }
  if(area<.28) addTree(list,loc(q,.91,.71),4+rnd()*2,rnd);
}

function grove(ctx,list,q,rnd) {
  const a=loc(q,.07,.83), b=loc(q,.55,.43), c=loc(q,.95,.15);
  stroke(ctx,[a,b,c],'#a6b28b',5);
  stroke(ctx,[a,b,c],'#e6dfba',3.2);
  for(let i=0;i<32;i++){
    const u=.065+rnd()*.865,v=.09+rnd()*.8;
    if(Math.abs(v-(.89-.8*u))>.1) addTree(list,loc(q,u,v),4.2+rnd()*6.4,rnd,i%8===0);
  }
}

function tower(ctx,x,y,mode) {
  local(ctx,x,y,()=>{
    const poly=(pts,fill,edge=ink,w=.9)=>shape(ctx,points(pts),fill,edge,w);
    if(mode==='water'){
      oval(ctx,5,1,14,3,'#6979563b');
      poly([[-6,0],[-5,-29],[5,-29],[7,-1]],'#c38666');
      for(let i=0;i<4;i++) stroke(ctx,[pp(-5,-4-i*6),pp(6,-5-i*6)],'#e0ac80',1);
      stroke(ctx,[pp(1,-14),pp(1,-20)],'#606f65',2);
      poly([[-9,-31],[-8,-23],[-4,-20],[6,-20],[9,-23],[9,-31]],'#79958a');
      poly([[-11,-31],[-5,-35],[0,-38],[10,-33],[11,-31],[1,-29]],'#93aa98');
      return;
    }
    const isClock=mode==='clock';
    const top=isClock?-22:-28;
    poly([[-6,0],[-6,top],[0,top-2],[7,top],[7,-1],[0,2]],'#e5cfa2');
    poly([[-6,0],[-6,top],[-1,top],[-1,1]],'#c7b793',null);
    if(isClock) {
      oval(ctx,2,-17,3.6,3.6,'#fcf0d0',ink,.85);
      stroke(ctx,[pp(2,-19.2),pp(2,-17),pp(4.2,-16.2)],ink,.75);
      poly([[-8,-22],[-5,-25],[-2,-31],[3,-31],[5,-25],[9,-23],[4,-21]],'#65847b');
    }else{
      for(const x of [-3,2]) {
        ctx.fillStyle='#776f55';ctx.fillRect(x,-23,2.4,5);
        oval(ctx,x+1.2,-23,1.2,1.3,'#776f55');
      }
      poly([[-8,-28],[-9,-30],[-5,-33],[-4,-37],[0,-42],[4,-37],[5,-32],[8,-30],[7,-28],[0,-26]],'#719489');
      stroke(ctx,[pp(0,-42),pp(0,-48)],'#726f52',1);
      stroke(ctx,[pp(-2,-46),pp(2,-46)],'#726f52',.9);
    }
  });
}

function pavilion(ctx,x,y) {
  local(ctx,x,y,()=>{
    oval(ctx,2,1,13,4,'#7186654a');
    oval(ctx,0,0,10,3,'#d6c5a1',ink,.65);
    for(const px of [-7,-2,4,7]) stroke(ctx,[pp(px,0),pp(px,-9)],'#a78863',1);
    shape(ctx,points([[-12,-9],[-8,-12],[0,-18],[8,-12],[12,-9],[2,-7]]),'#79988c',ink,.8);
    stroke(ctx,[pp(0,-18),pp(0,-21)],ink,.7);
  });
}

function archWindow(ctx,x,y,s) {
  ctx.fillStyle='#718378';ctx.beginPath();
  ctx.moveTo(x-s,y);ctx.lineTo(x-s,y-s*1.2);
  ctx.arc(x,y-s*1.2,s,Math.PI,Math.PI*2);
  ctx.lineTo(x+s,y);ctx.fill();
  stroke(ctx,[pp(x,y-2*s),pp(x,y)],'#c0b797',.7);
}

function awning(ctx,q,colors) {
  const top = q.map(p=>move(p,0,-5));
  stroke(ctx,[q[3],top[3]],ink,1);
  stroke(ctx,[q[2],top[2]],ink,1);
  for(let i=0;i<5;i++) shape(ctx,rect(top,i/5,0,1/5,1),colors[i%2]);
  stroke(ctx,[top[3],top[2]],colors[0],2);
  stroke(ctx,[top[0],top[1],top[2]],'#837961',.65);
}

function chimney(ctx,p,h,w) {
  shape(ctx,[move(p,-w,0),move(p,-w*.6,-h),move(p,w*.6,-h),move(p,w,0)],'#ac775d',ink,.8);
  stroke(ctx,[move(p,-w*.24,-1),move(p,-w*.24,-h+1)],'#d59b76',w*.55);
  for(let y=7;y<h;y+=8) stroke(ctx,[move(p,-w*.75,-y),move(p,w*.75,-y)],'#755f4f',.7);
  stroke(ctx,[move(p,-w*.9,-h),move(p,w*.9,-h)],'#83705b',1.7);
}
function crane(ctx,x,y,side=1) {
  local(ctx,x,y,()=>{
    ctx.scale(side,1);
    const rail='#6c8073';
    stroke(ctx,[pp(-5,1),pp(-3,-23),pp(1,-26),pp(5,0)],rail,2);
    stroke(ctx,[pp(-3,-20),pp(4,-6),pp(-3,-7),pp(3,-17)],rail,1);
    stroke(ctx,[pp(-10,-21),pp(0,-29),pp(20,-30),pp(1,-24),pp(-10,-21)],rail,1.6);
    stroke(ctx,[pp(20,-30),pp(20,-17),pp(18.3,-16.2)],'#747665',.9);
    ctx.fillStyle='#b8986d';ctx.fillRect(-7,-25,9,5);
  });
}

function feature(ctx,list,q,site,rnd) {
  const {landmark:k}=site;
  const treeAt=(u,v,s,spire=false)=>addTree(list,loc(q,u,v),s,rnd,spire);
  const building=(u,v,w,d,h,roof,style='hip',opts={})=>addHouse(list,rect(q,u,v,w,d),h,roof,style,opts);
  const item=(u,v,fn,order=0)=>{const p=loc(q,u,v);list.push({y:p.y+order,draw:ct=>fn(ct,p)});};
  const chalk='#ede2c1';
  if(k==='garden' || k==='church' || k==='villas'){
    shape(ctx,rect(q,.055,.075,.89,.85),'#bac8a4','#aab797',1);
    for(const [a,b] of [[[.02,.49],[.98,.49]],[[.45,.04],[.45,.96]]]) {
      stroke(ctx,[loc(q,...a),loc(q,...b)],chalk,5);
    }
  }
  if(k==='church') {
    building(.29,.32,.43,.26,12,roofs[2],'gable',{front:'#e4cda6'});
    item(.33,.59,(ct,p)=>tower(ct,p.x,p.y,'bell'),22);
    for(const [u,v] of [[.13,.25],[.83,.16],[.83,.65],[.19,.67],[.67,.78]]) treeAt(u,v,6,true);
  } else if(k==='market') {
    const square=rect(q,.07,.12,.86,.74);shape(ctx,square,'#e5d5b1','#c6b99a',1);
    for(let c=0;c<5;c++) stroke(ctx,[loc(square,c/5,0),loc(square,c/5,1)],'#c8b99960',.7);
    for(let r=0;r<2;r++) for(let c=0;c<4;c++){
      const stall=rect(q,.12+c*.2,.28+r*.31,.125,.105);
      const color=choose(rnd,['#ba775c','#83a199','#bd965e']);
      list.push({y:stall[2].y,draw:ct=>awning(ct,stall,[color,'#f3e6bf'])});
    }
    treeAt(.1,.78,5);treeAt(.92,.77,5);
  } else if(k==='station') {
    for(const v of [.12,.21]){
      for(let i=0;i<23;i++) stroke(ctx,[loc(q,.03+i*.042,v-.017),loc(q,.03+i*.042,v+.02)],'#9d9981',1.2);
      for(const dv of [-.012,.012]) stroke(ctx,[loc(q,.01,v+dv),loc(q,.99,v+dv)],'#878d79',.9);
    }
    shape(ctx,rect(q,.075,.25,.84,.09),'#c0b99b','#a9a488',.8);
    building(.08,.37,.78,.26,15,roofs[2],'hip',{front:'#dbbf98',windows:'#746b57',dormers:true});
    building(.36,.39,.23,.32,18,roofs[2],'gable',{front:'#eddbb7'});
    item(.47,.73,(ct,p)=>{tower(ct,p.x,p.y,'clock');archWindow(ct,p.x+1,p.y,2);},23);
    for(let i=0;i<3;i++) treeAt(.21+i*.25,.82,4.7);
  } else if(k==='villas') {
    building(.14,.25,.22,.26,12,roofs[0],'hip',{chimney:true});
    building(.58,.34,.25,.34,14,roofs[2],'hip',{chimney:true});
    for(const [u,v] of [[.15,.72],[.4,.16],[.48,.14],[.72,.77],[.87,.2],[.45,.83]]) treeAt(u,v,6.8);
  } else if(k==='tower') {
    for(let r=0;r<2;r++) building(.12,.2+r*.37,.53,.17,8,roofs[r],'gable',{chimney:true});
    item(.78,.55,(ct,p)=>tower(ct,p.x,p.y,'water'));
    treeAt(.8,.8,6);treeAt(.78,.2,4.5);
  } else if(k==='garden') {
    const o=loc(q,.45,.49);
    const ring=rect(q,.2,.22,.51,.53);
    stroke(ctx,[...ring,ring[0]],chalk,4);
    oval(ctx,o.x,o.y,11,7,'#ced5ac','#ede2c1',3);
    oval(ctx,o.x,o.y,6,3.8,'#99bdb1','#abb093',.7);
    item(.75,.27,(ct,p)=>pavilion(ct,p.x,p.y));
    for(let i=0;i<16;i++) {
      const v=.14+(i%8)*.1;
      treeAt(i<8?.12:.87,v,4+rnd()*1.8,i%3===0);
    }
  } else if(k==='mill'){
    for(let i=0;i<3;i++) building(.14,.22+i*.167,.52,.13,7,roofs[2],'gable',{front:'#bf9278'});
    building(.71,.55,.16,.24,8,roofs[0],'flat',{front:'#bb8b70'});
    item(.73,.42,(ct,p)=>chimney(ct,p,31,3.2));
    item(.81,.39,(ct,p)=>chimney(ct,p,24,2.7));
  } else if(k==='yard'){
    building(.12,.2,.36,.19,9,roofs[2],'gable',{front:'#d0ba90'});
    building(.15,.47,.4,.16,9,roofs[4],'gable',{});
    item(.67,.61,(ct,p)=>crane(ct,p.x,p.y));
    item(.83,.37,(ct,p)=>crane(ct,p.x,p.y,-1));
  } else if(k==='baths'){
    building(.12,.21,.41,.19,8,roofs[2],'hip',{});
    for(let i=0;i<3;i++) {
      const k=rect(q,.14+i*.22,.55,.12,.13);
      list.push({y:k[2].y,draw:ct=>awning(ct,k,[i%2?'#c88a6d':'#81a89d','#f2e7c9'])});
    }
    treeAt(.8,.4,7);
  }
}

function boat(ctx,x,y,length,angle,sail,color='#b57e61') {
  local(ctx,x,y,()=>{
    ctx.rotate(angle);
    const h=length*.16;
    for(let k=0;k<2;k++){
      stroke(ctx,[pp(-length*.52,(-1+2*k)*h*.4),pp(-length*.8,(-1+2*k)*h),pp(-length,(-1+2*k)*h*1.18)],'#e5e9d0a8',.9);
    }
    shape(ctx,[pp(-length*.47,-h*.44),pp(-length*.30,-h),pp(length*.18,-h*.94),pp(length*.53,0),pp(length*.28,h*.75),pp(-length*.3,h),pp(-length*.47,h*.65)],'#728a7f',ink,.8);
    shape(ctx,[pp(-length*.36,-h*.52),pp(length*.15,-h*.63),pp(length*.39,-h*.04),pp(length*.15,h*.53),pp(-length*.36,h*.5)],color);
    if(sail){
      shape(ctx,[pp(length*.03,-length*.6),pp(-length*.27,-h*.18),pp(length*.07,h*.19)],'#f3e6c8','#899986',.7);
      shape(ctx,[pp(length*.085,-length*.5),pp(length*.13,-h*.14),pp(length*.39,0)],'#dfd5b4','#899986',.5);
      stroke(ctx,[pp(length*.03,-length*.63),pp(length*.11,h*.4)],'#717a65',.8);
    }else{
      ctx.fillStyle='#e7d5ad';ctx.fillRect(-length*.2,-h*.53,length*.29,h*1.05);
      ctx.fillStyle='#7c8c81';ctx.fillRect(-length*.16,-h*.46,length*.16,h*.9);
    }
  });
}
function pier(ctx,x,y,dx,dy,width) {
  const p=pp(x,y),q=pp(x+dx,y+dy),length=Math.hypot(dx,dy);
  const nx=-dy/length*width*.5,ny=dx/length*width*.5;
  const deck=[move(p,nx,ny),move(q,nx,ny),move(q,-nx,-ny),move(p,-nx,-ny)];
  shape(ctx,deck.map(a=>move(a,2,3)),'#55877c59');
  shape(ctx,deck,'#c7b491','#8c9077',.95);
  for(let i=0;i<length;i+=3.5){
    const a=mix(p,q,i/length);
    stroke(ctx,[move(a,nx*.9,ny*.9),move(a,-nx*.9,-ny*.9)],'#9c957965',.7);
  }
  for(let i=0;i<=length;i+=13){
    const a=mix(p,q,i/length);
    for(const s of [-1,1]) oval(ctx,a.x+s*nx,a.y+s*ny,1.35,1.1,'#9b9173','#faf0cf',.45);
  }
}
function island(ctx,site,rnd) {
  const {x,y}=site;
  const blob=(rx,ry,dx,dy)=>Array.from({length:40},(_,i)=>{
    const a=i/40*Math.PI*2,n=1+.07*Math.sin(a*3)+.055*Math.cos(a*7);
    return pp(x+dx+Math.cos(a)*rx*n,y+dy+Math.sin(a)*ry*n);
  });
  shape(ctx,blob(60,35,10,1),null,'#d7e3cd',1.5);
  shape(ctx,blob(55,32,10,1),'#d8dbb9','#a9bba2',1);
  shape(ctx,blob(49,27,10,0),'#bec5a0','#e4d9b8',3);
  for(let i=0;i<16;i++){
    const a=rnd()*Math.PI*2;
    const px=x+10+Math.cos(a)*46,py=y+Math.sin(a)*26;
    shape(ctx,[pp(px-3,py),pp(px-1,py-2),pp(px+3,py-1),pp(px+4,py+1)],'#a8b29e','#cfd1b6',.6);
  }
  stroke(ctx,[pp(x-19,y-17),pp(x+1,y+1),pp(x+28,y+4)],'#e0d5ae',4);
  const foot=points([[x+4,y+4],[x+18,y+1],[x+21,y+7],[x+7,y+10]]);
  house(ctx,foot,5,roofs[0],'gable',{});
  local(ctx,x+30,y+6,()=>{
    oval(ctx,4,1,11,3,'#6c83634d');
    const beam=(y)=>6.5+(y/38)*3.7;
    for(let i=0;i<5;i++){
      const a=-i*7.4,b=-(i+1)*7.4;
      shape(ctx,[pp(-beam(a),a),pp(beam(a),a),pp(beam(b),b),pp(-beam(b),b)],i%2?'#b46c50':'#eee1bb','#8e8d7459',.6);
    }
    stroke(ctx,[pp(-5,0),pp(-2.4,-36)],'#c1baa1',1.2);
    oval(ctx,0,-37,4.9,1.5,'#6b7969',ink,.8);
    shape(ctx,points([[-3,-37],[-3,-43],[3,-43],[3,-37]]),'#dfca88',ink,.75);
    shape(ctx,points([[-4.8,-43],[0,-47],[4.8,-43],[0,-42]]),'#718a7b',ink,.75);
    stroke(ctx,[pp(0,-43),pp(0,-36)],'#7a7963',.85);
    stroke(ctx,[pp(0,-48),pp(0,-50)],ink,.8);
  });
}
function streets(ctx,city) {
  const visible=city.edges.filter(({p,q,bridge})=>!bridge && Math.max(p.x,q.x)>-8 && Math.min(p.x,q.x)<1008 && Math.max(p.y,q.y)>-8 && Math.min(p.y,q.y)<690);
  for(const [major,w,col] of [[false,8,'#b9b89c'],[true,12,'#b7b397'],[false,6.6,'#eee5c9'],[true,10,'#f3ead0']]){
    ctx.beginPath();
    for(const {p,q,major:m} of visible) if(m===major){ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}
    ctx.strokeStyle=col;ctx.lineWidth=w;ctx.stroke();
  }
}
function bridge(ctx,city,site) {
  const a=city.at(4,5),b=site;
  stroke(ctx,[move(a,4,4),move(b,4,4)],'#5f928555',9);
  stroke(ctx,[a,b],'#8e9d86',10);stroke(ctx,[a,b],'#e4dbc0',7);
  const slope=Math.atan2(b.y-a.y,b.x-a.x);
  for(let i=0;i<=10;i++) {
    const p=mix(a,b,i/10),nx=-Math.sin(slope)*4,ny=Math.cos(slope)*4;
    for(const s of [-1,1]) stroke(ctx,[move(p,nx*s,ny*s),move(p,nx*s,ny*s-2.6)],'#8c967e',1.1);
  }
}
function chartType(ctx,x,y,text,size,angle,color,serif=false) {
  local(ctx,x,y,()=>{
    ctx.rotate(angle);ctx.fillStyle=color;
    ctx.font=(serif?'italic ':'500 ')+size+'px '+(serif?'Georgia, serif':'Arial, sans-serif');
    ctx.textAlign='center';ctx.fillText(text,0,0);
  });
}
function compass(ctx,x,y){
  local(ctx,x,y,()=>{
    ctx.strokeStyle='#648b7f';ctx.lineWidth=.7;
    ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<4;i++){
      ctx.save();ctx.rotate(i*Math.PI*.5);
      const length=i%2?12:17;
      shape(ctx,[pp(0,-length),pp(-2.8,0),pp(0,0)],'#729689','#648b7f',.65);
      shape(ctx,[pp(0,-length),pp(2.8,0),pp(0,0)],'#cfdbc2','#648b7f',.65);ctx.restore();
    }
    oval(ctx,0,0,1.6,1.6,'#6b8b79');chartType(ctx,0,-22,'С',8,0,'#537b70');
  });
}
export function paintAtlas(ctx,sites,seed) {
  const city=cityGeometry(seed),rnd=randomSource(seed ^ 0x457863);
  ctx.save(); ctx.lineJoin='round';ctx.lineCap='round';
  coastPlate(ctx,rnd);
  ctx.save();landPath(ctx);ctx.clip();
  const features=new Map();
  for(const site of sites.filter(s=>s.landmark!=='lighthouse')){
    const col=site.c+(site.landmark==='baths'?-1:0);
    const row=site.r+(site.landmark==='villas'?0:-1);
    features.set(col+'/'+row,site);
  }
  const scenery=[];
  for(let r=-3;r<9;r++) for(let c=-6;c<10;c++){
    const q=[city.at(c,r),city.at(c+1,r),city.at(c+1,r+1),city.at(c,r+1)];
    if(Math.max(...q.map(p=>p.x))<-6 || Math.min(...q.map(p=>p.x))>1006 || Math.max(...q.map(p=>p.y))<-4 || Math.min(...q.map(p=>p.y))>660) continue;
    const mid=loc(q,.5,.5);
    if(mid.y>coastY(mid.x)+77) continue;
    const blockRng=randomSource(seed ^ Math.imul(c+31,27187) ^ Math.imul(r+17,73421));
    const f=features.get(c+'/'+r);
    const park=(c<0 && (c+r)%4===0)||(c===2 && r<1)||(c>6 && r%3===0)||(!f && blockRng()<.085);
    blockPlate(ctx,q,park?'green':'stone',blockRng);
    if(f) feature(ctx,scenery,q,f,blockRng);
    else if(park) grove(ctx,scenery,q,blockRng);
    else homes(ctx,scenery,q,blockRng,blockRng());
  }
  streets(ctx,city);
  // The waterfront road ties the cut-off blocks into a continuous quay.
  const quay=points(coast).map(p=>move(p,-1.5,-7));
  stroke(ctx,quay,'#b8b797',6);stroke(ctx,quay,'#eaddba',4.7);
  for(const entry of scenery.sort((a,b)=>a.y-b.y)) entry.draw(ctx);
  ctx.restore();
  const seaSite=sites.find(s=>s.landmark==='lighthouse');
  island(ctx,seaSite,rnd);
  bridge(ctx,city,seaSite);
  for(const [x,dx,dy,w] of [[470,9,26,5],[493,14,32,5],[698,23,25,6],[884,26,15,6],[905,31,14,5],[931,36,12,5]]) pier(ctx,x,coastY(x)-1,dx,dy,w);
  for(const [x,y,l,a,s] of [[530,581,15,-.38,true],[735,531,20,-.43,false],[924,422,27,-.88,false],[906,453,18,-.65,true],[377,663,15,-.22,true],[686,640,26,-.26,true],[962,396,16,-.79,false],[986,534,16,-.22,true]]) boat(ctx,x,y,l,a,s);
  chartType(ctx,580,625,'Приморский залив',24,-.10,'#547f76',true);
  compass(ctx,946,596);
  // A faint two-colour fibre plate pulls the architecture and water into one printed sheet.
  for(let i=0;i<12500;i++){
    const x=rnd()*1000,y=rnd()*680;
    ctx.fillStyle=i%2?'rgba(255,250,215,.13)':'rgba(93,85,58,.075)';
    ctx.fillRect(x,y,rnd()*1.35+.3,rnd()*.65+.3);
  }
  ctx.restore();
}
