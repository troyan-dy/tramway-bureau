import {paintAtlas} from './atlas.js';
import {segmentPath} from './geo.js';
import {LINE_COLORS} from './graphics.js';

const W=1000,H=680, clamp=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const clothes=['#314b4b','#b56138','#5a766c','#946640','#48748a','#886b83'];
export function cityMap(get, ui, onSite, onPerson) {
  const area=document.querySelector('#map-window'), world=document.querySelector('#map-world');
  const atlas=document.querySelector('#atlas'), actors=document.querySelector('#transit');
  const ctx=actors.getContext('2d'), targets=document.querySelector('#map-targets');
  let zoom=1,ox=0,oy=0,drag=null,atlasKey='',labelKey='',lastClick=0,quality=1,overlayKey='',overlay;
  function updateCamera(){
    ox=clamp(ox,1-zoom,0); oy=clamp(oy,1-zoom,0);
    world.style.transform='translate('+(ox*100)+'%,'+(oy*100)+'%) scale('+zoom+')';
    area.classList.toggle('zoomed',zoom>1);
    targets.style.setProperty('--counter-scale',1/zoom);
    document.querySelector('#zoom-out').disabled=zoom===1;document.querySelector('#zoom-in').disabled=zoom>=3;
    document.querySelector('.map-scale span').style.width=(44*zoom)+'px';
  }
  function changeZoom(to,fx=.5,fy=.5){
    const old=zoom;zoom=clamp(to,1,3);
    ox=fx-(fx-ox)*zoom/old;oy=fy-(fy-oy)*zoom/old;updateCamera();paint(true);
  }
  document.querySelector('#zoom-in').onclick=()=>changeZoom(zoom+.5);
  document.querySelector('#zoom-out').onclick=()=>changeZoom(zoom-.5);
  document.querySelector('#zoom-reset').onclick=()=>changeZoom(1);
  area.addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const r=area.getBoundingClientRect();changeZoom(zoom+(e.deltaY<0?.25:-.25),(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height)},{passive:false});
  area.addEventListener('pointerdown',e=>{if(zoom<=1||e.target.closest('.map-zoom'))return;drag={x:e.clientX,y:e.clientY,ox,oy,id:e.pointerId,moved:false}});
  area.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    if(!drag.moved){area.setPointerCapture(e.pointerId);drag.moved=true}
    ox=drag.ox+dx/area.clientWidth;oy=drag.oy+dy/area.clientHeight;area.classList.add('dragging');updateCamera();
  });
  function endDrag(){if(drag?.moved)lastClick=performance.now();drag=null;area.classList.remove('dragging')}
  area.addEventListener('pointerup',endDrag);area.addEventListener('pointercancel',endDrag);
  area.addEventListener('click',e=>{
    if(lastClick&&performance.now()-lastClick<160||e.target.closest('.map-zoom'))return;
    const site=e.target.closest('[data-site]');if(site){onSite(+site.dataset.site);return}
    if(ui.mode!=='overview'||ui.draft)return;
    const rect=world.getBoundingClientRect(),x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;
    const proximity=clamp(12*W/rect.width,9,29);
    let best=null,bestD=proximity;
    for(const p of get().people){if(p.state==='ride')continue;const d=Math.hypot(x-p.x,y-p.y);if(d<bestD){best=p;bestD=d}}
    if(best)onPerson(best.id)
  });
  function path(c,points){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y))}
  function network(g){
    const key=[g.seed,JSON.stringify(g.tracks),g.lines.map(l=>l.stops.join('.')).join('/'),ui.draft?.join('.'),ui.line,quality].join('|');
    if(key===overlayKey)return;overlayKey=key;overlay=document.createElement('canvas');overlay.width=actors.width;overlay.height=actors.height;
    const c=overlay.getContext('2d');c.scale(quality,quality);c.lineJoin='round';c.lineCap='round';
    for(const [a,b] of g.tracks){path(c,segmentPath(g.sites[a],g.sites[b]));c.lineWidth=7.7;c.strokeStyle='#faf1d4';c.stroke();c.lineWidth=5.3;c.strokeStyle='#696e5f';c.stroke();c.lineWidth=2.2;c.strokeStyle='#d9d6b7';c.stroke()}
    // Bundle lines side by side on shared street sections.
    const links=new Map();
    for(const line of g.lines){for(let i=1;i<line.stops.length;i++){const points=segmentPath(g.sites[line.stops[i-1]],g.sites[line.stops[i]]);
      for(let j=1;j<points.length;j++){let a=points[j-1],b=points[j];if(a.x>b.x||a.x===b.x&&a.y>b.y)[a,b]=[b,a];
        const k=[a.x,a.y,b.x,b.y].join(',');if(!links.has(k))links.set(k,{a,b,lines:new Set()});links.get(k).lines.add(line.id)}
    }}
    for(const {a,b,lines} of links.values()){const ids=[...lines],len=Math.hypot(b.x-a.x,b.y-a.y)||1;ids.forEach((id,j)=>{
      const off=(j-(ids.length-1)/2)*4,xx=-(b.y-a.y)*off/len,yy=(b.x-a.x)*off/len;
      path(c,[{x:a.x+xx,y:a.y+yy},{x:b.x+xx,y:b.y+yy}]);c.strokeStyle='#fff6de';c.lineWidth=ids.length>1?6:8;c.stroke();c.strokeStyle=LINE_COLORS[id];c.lineWidth=ids.length>1?3.4:4.5;c.stroke()
    })}
    if(ui.draft){c.setLineDash([5,6]);c.strokeStyle='#65502b';c.lineWidth=3;for(let i=1;i<ui.draft.length;i++){path(c,segmentPath(g.sites[ui.draft[i-1]],g.sites[ui.draft[i]]));c.stroke()}c.setLineDash([])}
  }
  function walker(p,focus){
    if(p.state==='ride')return;
    const tint=clothes[p.id%clothes.length], active=ui.flow||focus;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(active?1.13:1,active?1.13:1);
    ctx.fillStyle='#3b54443d';ctx.beginPath();ctx.ellipse(1.4,1.5,3.0,1.3,0,0,7);ctx.fill();
    if(focus){ctx.strokeStyle='#fff9de';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,-2,7,0,7);ctx.stroke();ctx.strokeStyle='#a74e26';ctx.lineWidth=1.2;ctx.stroke()}
    ctx.fillStyle=tint;ctx.fillRect(-1.55,-2,3.2,4.2);ctx.fillStyle='#393e36';ctx.fillRect(-1.6,2,1.1,1.3);ctx.fillRect(.55,2,1.1,1.3);
    ctx.fillStyle='#edd3af';ctx.beginPath();ctx.arc(0,-3.1,1.6,0,7);ctx.fill();ctx.fillStyle='#594939';ctx.fillRect(-1.3,-4.6,2.6,1);
    if(active){ctx.fillStyle=p.state==='walk'?'#536e65':LINE_COLORS[p.line]||'#a94b2e';ctx.fillRect(-2.3,-8.2,4.6,1.6)}
    ctx.restore()
  }
  function vehicle(v){
    ctx.save();ctx.translate(v.x,v.y);ctx.rotate(v.angle||0);
    // Ivory roof, glazed cab ends and a roof-mounted current collector.
    ctx.shadowColor='#29382c88';ctx.shadowBlur=2;ctx.shadowOffsetY=2;
    const box=(x,y,w,h,r,fill)=>{ctx.fillStyle=fill;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);ctx.fill()};
    box(-14,-6.8,28,13.6,3,'#514c39');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    box(-13,-5.6,26,11.2,2.4,LINE_COLORS[v.line]);box(-10.5,-4.5,21,8.3,1.7,'#f4dfaa');
    box(-12,-3.5,2.3,7,1,'#597e7d');box(9.9,-3.5,2.3,7,1,'#547777');ctx.strokeStyle='#737768';ctx.lineWidth=1;path(ctx,[{x:-5,y:.5},{x:0,y:-2.4},{x:5,y:.5},{x:0,y:2.5},{x:-5,y:.5}]);ctx.stroke();ctx.fillStyle='#ffeaa0';ctx.fillRect(12,-4,1.6,2);ctx.fillRect(12,2,1.6,2);
    ctx.restore()
  }
  function labelSites(g){
    const key=[g.seed,g.stops.join(','),g.lines.map(l=>l.stops.join('.')).join('/'),ui.draft?.join('.'),ui.site,ui.flow].join('|');
    if(key!==labelKey){labelKey=key;
      targets.innerHTML=g.sites.map(s=>{
        const built=g.stops.includes(s.id),line=g.lines.find(l=>l.stops.includes(s.id));
        return '<button type="button" class="site '+(built?'built ':'')+(ui.site===s.id?'selected ':'')+(ui.draft?.includes(s.id)?'draft':'')+'" style="left:'+s.x/W*100+'%;top:'+s.y/H*100+'%;--line:'+(line?LINE_COLORS[line.id]:'#63806a')+'" data-site="'+s.id+'" aria-label="'+s.name+(built?', остановка':', место для остановки')+'"><span class="site-pin">'+(built?'':'+')+'</span><span class="site-label">'+s.name+'</span><span class="queue"></span></button>'
      }).join('');
    }
    const queues=Array(g.sites.length).fill(0);for(const p of g.people)if(p.state==='wait'&&p.at>=0)queues[p.at]++;
    for(let i=0;i<queues.length;i++){const el=targets.children[i].lastElementChild;const t=queues[i]&&(ui.flow||queues[i]>=4)?String(queues[i]):'';if(el.textContent!==t)el.textContent=t}
  }
  function paint(force=false){
    const g=get(), q=clamp(Math.ceil(area.clientWidth*(devicePixelRatio||1)/W*zoom*2)/2,1,2);
    const k=g.seed+':'+q;
    if(atlasKey!==k){quality=q;atlasKey=k;for(const canvas of [atlas,actors]){canvas.width=Math.ceil(W*q);canvas.height=Math.ceil(H*q)}
      const ac=atlas.getContext('2d');ac.setTransform(q,0,0,q,0,0);paintAtlas(ac,g.sites,g.seed);overlayKey='';force=true
    }
    network(g);ctx.setTransform(quality,0,0,quality,0,0);ctx.clearRect(0,0,W,H);
    ctx.drawImage(overlay,0,0,W,H);
    if(ui.flow&&ui.person!==null){const p=g.people.find(p=>p.id===ui.person);if(p){const d=g.sites[p.dest];ctx.save();ctx.setLineDash([3,7]);ctx.strokeStyle='#415f56bb';ctx.lineWidth=1.7;path(ctx,[p,d]);ctx.stroke();ctx.restore()}}
    for(const p of g.people)walker(p,p.id===ui.person);
    for(const v of g.vehicles)vehicle(v);
    if(force)labelSites(g);
  }
  updateCamera();new ResizeObserver(()=>paint(true)).observe(area);
  return {paint, reset:()=>{zoom=1;ox=oy=0;atlasKey='';labelKey='';updateCamera();paint(true)}};
}
