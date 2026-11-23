let context, voice=0, phrase=0, enabled=false;
const chimes=[196,246.94,293.66,369.99,329.63,246.94,220,293.66];
export function soundSet(value){
  enabled=value;
  if(value){try{context??=new (window.AudioContext||window.webkitAudioContext)();context.resume().catch(()=>{});sound('bell')}catch{enabled=false}}
  else if(context)context.suspend().catch(()=>{});
  return enabled;
}
function note(hz,when,length,volume=.05,type='sine'){
  const osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.value=hz;
  gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(volume,when+.015);
  gain.gain.exponentialRampToValueAtTime(.0001,when+length);osc.connect(gain);gain.connect(context.destination);osc.start(when);osc.stop(when+length+.01);
}
export function sound(event){
  if(!enabled||!context||context.state!=='running')return;
  const t=context.currentTime+.01;
  if(event==='bell'||event==='start'){note(793,t,.64,.042);note(1191,t,.24,.013);note(794,t+.18,.67,.029)}
  else if(event==='build'){note(261.6,t,.13,.05,'triangle');note(392,t+.085,.24,.045,'triangle')}
  else if(event==='finish'){[293.7,370,440,587.3].forEach((f,i)=>note(f,t+i*.14,.72,.04,'triangle'))}
  else if(event==='tick'){note(chimes[phrase++%8],t,1.8,.015,'sine');if(phrase%2===1)note(chimes[(phrase+3)%8]/2,t,2.5,.018)}
  else {note(405+(voice++%3)*32,t,.08,.024,'triangle')}
}
