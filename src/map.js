import {paintAtlas} from './atlas.js';
import {segmentPath} from './geo.js';
import {LINE_COLORS} from './graphics.js';
import {busiestTrips} from './dispatch.js';

const W=1000,H=680, clamp=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const clothes=['#314b4b','#b56138','#5a766c','#946640','#48748a','#886b83'];
export function cityMap(get, ui, onSite, onPerson) {
  const area=document.querySelector('#map-window'), world=document.querySelector('#map-world');
  const atlas=document.querySelector('#atlas'), actors=document.querySelector('#transit');
  const ctx=actors.getContext('2d'), targets=document.querySelector('#map-targets');
  let zoom=1,ox=0,oy=0,drag=null,atlasKey='',labelKey='',lastClick=0,quality=1,overlayKey='',overlay;
  const screenUnit=()=>W/Math.max(1,area.clientWidth*zoom);
  const boarding=new Map();
  function personPoint(p){
    if(p.state!=='wait')return p;
    const site=get().sites[p.at],unit=screenUnit();
    const row=Math.floor(p.id/4)%3;
    const side=site.x<45*unit?1:-1;
    return {x:site.x+side*(10+(p.id%4)*4.7)*unit,y:site.y-(5+row*4.2)*unit};
  }
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
    for(const p of get().people){if(p.state==='ride')continue;const pos=personPoint(p),d=Math.hypot(x-pos.x,y-pos.y);if(d<bestD){best=p;bestD=d}}
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
    const pos=personPoint(p),unit=screenUnit();
    const size=Math.max(1.15,unit)*(active?1.16:1);
    ctx.save();ctx.translate(pos.x,pos.y);ctx.scale(size,size);
    ctx.fillStyle='#3b54443d';ctx.beginPath();ctx.ellipse(1.4,1.5,3.0,1.3,0,0,7);ctx.fill();
    if(focus){ctx.strokeStyle='#fff9de';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,-2,7,0,7);ctx.stroke();ctx.strokeStyle='#a74e26';ctx.lineWidth=1.2;ctx.stroke()}
    ctx.fillStyle='#fff3d6';ctx.fillRect(-2.35,-2.5,4.7,5.3);
    ctx.fillStyle=tint;ctx.fillRect(-1.8,-2.1,3.6,4.8);ctx.fillStyle='#393e36';ctx.fillRect(-1.6,2,1.1,1.5);ctx.fillRect(.55,2,1.1,1.5);
    ctx.fillStyle='#f1ce9b';ctx.beginPath();ctx.arc(0,-3.3,1.9,0,7);ctx.fill();ctx.strokeStyle='#5c4f3e';ctx.lineWidth=.65;ctx.stroke();ctx.fillStyle='#594939';ctx.fillRect(-1.45,-5,2.9,1);
    if(active){ctx.fillStyle=p.state==='walk'?'#536e65':LINE_COLORS[p.line]||'#a94b2e';ctx.fillRect(-2.3,-8.2,4.6,1.6)}
    ctx.restore()
  }
  function vehicle(v,g){
    const unit=screenUnit(),scale=Math.max(1.03,unit*.88);
    // Park one car-length down the track from the junction. A fixed platform
    // side keeps the drawn position continuous as a car reverses at a terminal.
    const endpoints=[g.sites[v.from],g.sites[v.to]];
    const distance=s=>Math.hypot(v.x-s.x,v.y-s.y);
    const stop=distance(endpoints[0])<=distance(endpoints[1])?endpoints[0]:endpoints[1];
    const route=g.lines[v.line].stops,index=route.indexOf(stop.id);
    const neighbour=route[index+1]??route[index-1]??(stop.id===v.from?v.to:v.from);
    const street=segmentPath(stop,g.sites[neighbour]);
    const next=street[1]||stop,dx=next.x-stop.x,dy=next.y-stop.y,len=Math.hypot(dx,dy)||1;
    const offset=Math.max(26*unit,21);
    const tripLength=Math.hypot(endpoints[0].x-endpoints[1].x,endpoints[0].y-endpoints[1].y);
    const reach=Math.min(offset*2.65,tripLength*.48)||1;
    const t=1-clamp(distance(stop)/reach,0,1),blend=t*t*(3-2*t)*Math.min(offset,len*.65,reach*.63);
    const x=v.x+dx/len*blend,y=v.y+dy/len*blend;
    ctx.save();ctx.translate(x,y);
    ctx.rotate(v.angle||0);ctx.scale(scale,scale);
    // Ivory roof, glazed cab ends and a roof-mounted current collector.
    ctx.shadowColor='#29382c88';ctx.shadowBlur=2;ctx.shadowOffsetY=2;
    const box=(x,y,w,h,r,fill)=>{ctx.fillStyle=fill;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);ctx.fill()};
    box(-14,-6.8,28,13.6,3,'#514c39');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    box(-13,-5.6,26,11.2,2.4,LINE_COLORS[v.line]);box(-10.5,-4.2,21,6.4,1.7,'#f4dfaa');
    for(let i=0;i<5;i++)box(-9+i*3.8,2.1,2.8,2.1,.3,'#648b83');
    box(-12,-3.5,2.3,7,1,'#597e7d');box(9.9,-3.5,2.3,7,1,'#547777');ctx.strokeStyle='#737768';ctx.lineWidth=1;path(ctx,[{x:-5,y:.5},{x:0,y:-2.4},{x:5,y:.5},{x:0,y:2.5},{x:-5,y:.5}]);ctx.stroke();ctx.fillStyle='#ffeaa0';ctx.fillRect(12,-4,1.6,2);ctx.fillRect(12,2,1.6,2);
    ctx.restore();
    const last=boarding.get(v.id);
    if(!last||last.load!==v.load){
      boarding.set(v.id,{load:v.load,delta:last?v.load-last.load:0,at:g.elapsed});
    }
    const event=boarding.get(v.id),age=g.elapsed-event.at;
    if(event.delta>0&&age>=0&&age<2.8){
      ctx.save();ctx.translate(x,y);ctx.scale(unit,unit);
      ctx.globalAlpha=Math.min(1,(2.8-age)*2);
      ctx.fillStyle='#215548';ctx.fillRect(-10,-22-age*1.7,20,12);
      ctx.fillStyle='#fff5ce';ctx.textAlign='center';ctx.font='bold 9px sans-serif';
      ctx.fillText('+'+event.delta,0,-13-age*1.7);ctx.restore();
    }
  }
  function flowArrows(g){
    const unit=screenUnit(),trips=busiestTrips(g);
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    trips.forEach(({origin,dest,count},rank)=>{
      const a=g.sites[origin],b=g.sites[dest],dx=b.x-a.x,dy=b.y-a.y;
      const distance=Math.hypot(dx,dy);
      if(!distance)return;
      const bend=Math.min(distance*.24,66);
      const mid={x:(a.x+b.x)/2-dy/distance*bend,y:(a.y+b.y)/2+dx/distance*bend};
      const point=t=>({x:(1-t)**2*a.x+2*t*(1-t)*mid.x+t*t*b.x,y:(1-t)**2*a.y+2*t*(1-t)*mid.y+t*t*b.y});
      const start=point(.07),end=point(.92),middle=point((.07+.92)/2);
      ctx.beginPath();ctx.moveTo(start.x,start.y);
      ctx.quadraticCurveTo(2*middle.x-(start.x+end.x)/2,2*middle.y-(start.y+end.y)/2,end.x,end.y);
      ctx.strokeStyle='#f8f4daba';ctx.lineWidth=(rank?3.5:4.5)*unit;ctx.stroke();
      ctx.setLineDash([4*unit,3*unit]);ctx.strokeStyle='#286d69';ctx.lineWidth=(rank?1.6:2.3)*unit;ctx.stroke();ctx.setLineDash([]);
      for(const t of [.60,.84]){
        const p=point(t),q=point(t+.01),angle=Math.atan2(q.y-p.y,q.x-p.x);
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.scale(unit,unit);
        path(ctx,[{x:3.5,y:0},{x:-4,y:-3.6},{x:-2,y:0},{x:-4,y:3.6},{x:3.5,y:0}]);
        ctx.strokeStyle='#f8f4da';ctx.lineWidth=1.9;ctx.stroke();ctx.fillStyle='#286d69';ctx.fill();ctx.restore();
      }
      if(count>1){
        const p=point(.47);
        ctx.save();ctx.translate(p.x,p.y);ctx.scale(unit,unit);ctx.font='bold 9px sans-serif';ctx.textAlign='center';
        const caption=String(count),width=ctx.measureText(caption).width+7;
        ctx.fillStyle='#286d69';ctx.fillRect(-width/2,-6,width,12);
        ctx.fillStyle='#fff6db';ctx.fillText(caption,0,3);ctx.restore();
      }
    });
    ctx.restore();
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
    if(ui.flow&&!ui.draft)flowArrows(g);
    if(ui.flow&&ui.person!==null){const p=g.people.find(p=>p.id===ui.person);if(p){const d=g.sites[p.dest];ctx.save();ctx.setLineDash([3,7]);ctx.strokeStyle='#415f56bb';ctx.lineWidth=1.7;path(ctx,[p,d]);ctx.stroke();ctx.restore()}}
    for(const p of g.people)walker(p,p.id===ui.person);
    for(const v of g.vehicles)vehicle(v,g);
    if(force)labelSites(g);
  }
  updateCamera();new ResizeObserver(()=>paint(true)).observe(area);
  return {paint, reset:()=>{zoom=1;ox=oy=0;atlasKey='';labelKey='';boarding.clear();updateCamera();paint(true)}};
}
