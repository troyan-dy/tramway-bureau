import {RULES,newGame,advance,buildStop,setRoute,buyTram,setFare,routeQuote,restoreGame} from './sim.js';
import {cityMap} from './map.js';
import {ico,LINE_COLORS,tramArt} from './graphics.js';
import {soundSet,sound} from './sound.js';
import {nextShiftAdvice,districtOrder,shiftRecords} from './dispatch.js';
const $=selector=>document.querySelector(selector);
const SAVE='tram-bureau.shift.v1',RECORDS='tram-bureau.records.v1',OPTIONS='tram-bureau.options.v1';
const TEXT={home:'Жилой квартал',work:'Место работы',leisure:'Место отдыха',hub:'Транспортный узел'};
const STATE={walk:'Идёт пешком',approach:'Идёт к остановке',wait:'Ждёт вагон',ride:'Едет в трамвае',exit:'Идёт от остановки'};
const TITLES=['Первая линия','Вторая линия','Третья линия'];
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function read(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
const saved=read(SAVE),loaded=restoreGame(saved?.game);
let game=loaded||newGame(1874), running=false,speed=[1,2,4].includes(saved?.speed)?saved.speed:1,soundOn=false;
const opts=read(OPTIONS)||{}, records=read(RECORDS)||{};
let logs=loaded&&Array.isArray(saved?.logs)?saved.logs.filter(v=>typeof v?.message==='string'&&typeof v.time==='string').slice(-70):[];
function restoreRecord(previous, sameReportPrevious) {
  const score = shiftRecords(game, records[game.seed], previous, sameReportPrevious);
  if (game.ended && records[game.seed] !== score.record) {
    records[game.seed] = score.record;
    write(RECORDS, records);
  }
  return score.previous;
}
let bestBefore=restoreRecord(loaded ? saved.bestBefore : 0, loaded?.ended ? 0 : undefined);
let begun=!!(loaded&&(saved.begun||game.elapsed>0)), modal='', clickedStart=false;
const ui={tab:'network',line:0,mode:'overview',site:null,person:null,draft:null,flow:false,selectedPerson:null};
let map,toastTimer,prevStamp='',missionCache='',panelCache='',persistAt=0,lastMoment=null,sector=-1, musicAt=0;
function clock(t=game.elapsed){const minutes=360+Math.floor(960*Math.min(1,t/game.duration)+.00001);return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')}
function word(n,forms){const a=Math.abs(n)%100,b=a%10;return forms[a>10&&a<20?2:b===1?0:b>=2&&b<=4?1:2]}
function amt(n,forms){return n+' '+word(n,forms)}
const cars=n=>amt(n,['вагон','вагона','вагонов']),stops=n=>amt(n,['остановка','остановки','остановок']);
const money=n=>n.toLocaleString('ru-RU')+' ₽';
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3200)}
function log(message){logs.push({time:clock(),message});if(logs.length>70)logs.shift();journal()}
function journal(){const entry=logs.at(-1);$('#log-time').textContent=entry?.time||clock();$('#log-line').textContent=entry?.message||'Открыто движение между Старым городом и Рынком.'}
function save(){
  const ok=write(SAVE,{game,speed,logs,begun,bestBefore});
  $('#save-status').textContent=ok?'Смена сохранена':'Файл сохранения доступен в меню';return ok;
}
function btn(action,label,cls='soft-button',icon='',extra=''){
  const closed = game.ended && (['edit','build-mode','build-here','append-site','buy'].includes(action) || action.startsWith('fare-'));
  return '<button type="button" class="'+cls+'" data-action="'+action+'" '+(closed?'disabled ':'')+extra+'>'+(icon?ico(icon):'')+label+'</button>';
}
function row(label,value){return '<div><span>'+label+'</span><b>'+value+'</b></div>'}
function kicker(icon,text){return '<div class="card-kicker">'+ico(icon)+text+'</div>'}
function display(id,html){
  const el=$(id);if(id==='#panel'&&panelCache===html||id==='#mission'&&missionCache===html)return;
  const focus=el.contains(document.activeElement)?document.activeElement:null;
  const action=focus?.dataset.action, scroll=el.querySelector('.flow-list')?.scrollTop||0;
  el.innerHTML=html;
  if(action)Array.from(el.querySelectorAll('[data-action]')).find(b=>b.dataset.action===action)?.focus({preventScroll:true});
  if(scroll&&el.querySelector('.flow-list'))el.querySelector('.flow-list').scrollTop=scroll;
  if(id==='#panel')panelCache=html;else missionCache=html;
}
function phase(){const h=6+16*game.elapsed/game.duration;return h<10?'Утро':h<12?'До полудня':h<15?'Полдень':h<17?'День':h<20?'Вечерний пик':'Вечер'}
function daytimeStop(){return game.sites[game.brief.site].name}
let forecastCache='';
function forecast(){
  const hour=6+16*game.elapsed/game.duration;
  const periods=[
    [6,11,'Вокзал и предприятия','Из жилых кварталов'],
    [12,15,daytimeStop(),'Сюда едут в полдень'],
    [17,22,'Жилые кварталы','Обратный поток']
  ];
  const order=districtOrder(game);
  const html='<div class="forecast-head">'+ico('flows')+'<h3>Прогноз спроса</h3></div><div class="forecast-list">'+periods.map(([from,to,title,detail])=>{
    const active=hour>=from&&hour<to;
    return '<div class="forecast-row'+(active?' current':'')+'"><time>'+String(from).padStart(2,'0')+'—'+to+'</time><i></i><div><b>'+escapeHTML(title)+'</b><small>'+detail+'</small></div></div>';
  }).join('')+'</div><div class="district-order"><div class="order-title">'+ico('flag')+'<b>Поручение района</b><strong>'+Math.min(order.delivered,order.target)+' / '+order.target+'</strong></div><p>'+
    (order.done?'Выполнено':'Дополнительная цель')+' · Привезти 8 пассажиров за смену к остановке «'+escapeHTML(order.name)+'».</p></div>';
  if(html!==forecastCache){$('#forecast').innerHTML=html;forecastCache=html}
}
function mission(){
  const linked=game.lines.some(l=>l.trams&&l.stops.includes(2)), left=Math.max(0,game.target-game.stats.delivered);
  let body;
  if(game.ended)body='Смена окончена. Итоги и новый план города доступны в путевом листе.';
  else if(!linked&&game.elapsed<game.duration*.25)body='Первый вагон ходит от Старого города до Рынка. Утром жители едут на вокзал.';
  else if(game.elapsed<game.duration*9/16&&game.elapsed>=game.duration*4/16)body='С 12 до 15 часов растёт спрос у остановки «'+escapeHTML(daytimeStop())+'».';
  else if(!left)body='План выполнен. До конца смены можно улучшить свой результат.';
  else if(game.elapsed>game.duration*.67)body='Вечерний поток разворачивается к жилым кварталам. Проверьте очереди на карте.';
  else body='Поездка засчитывается, когда пассажир добрался до цели. Для пересадки нужна общая остановка.';
  let call=game.ended?btn('result','Итоги смены','start','ticket'):!running&&!ui.draft?btn('run',begun?'Продолжить смену':'Начать смену','start','play'):'<div class="progress"><span style="width:'+Math.min(100,Math.round(100*game.stats.delivered/game.target))+'%"></span></div>';
  if(!game.ended&&!begun&&!linked&&!ui.draft)call+=btn('guide','Продлить к вокзалу','mission-guide');
  display('#mission',kicker('ticket','НАРЯД НА СМЕНУ')+'<h2>'+amt(game.target,['пассажир','пассажира','пассажиров'])+' до 22:00</h2><p>'+body+'</p>'+call);
}
function tabs(){
  $('#tab-network').setAttribute('aria-selected',ui.tab==='network');$('#tab-demand').setAttribute('aria-selected',ui.tab==='demand');
  $('#flow-toggle').setAttribute('aria-pressed',ui.flow);
  $('#flow-key').hidden=!ui.flow;
}
function selector(){return '<div class="line-tabs" role="group" aria-label="Выбрать линию">'+game.lines.map(l=>btn('line-'+l.id,(l.stops.length?'':'＋ ')+'0'+(l.id+1),'line-tab '+(ui.line===l.id?'active ':'')+(l.stops.length?'':'empty'),'', 'style="--line:'+LINE_COLORS[l.id]+'" aria-label="Линия 0'+(l.id+1)+'" aria-pressed="'+(ui.line===l.id)+'"')).join('')+'</div>'}
function depot(line){
  return '<hr class="section-sep"><div class="depot">'+tramArt(LINE_COLORS[ui.line])+'<div class="copy"><b>Вагоны · '+line.trams+'</b><small>'+RULES.capacity+' мест в вагоне</small></div>'+btn('buy','+ '+money(RULES.tramCost),'quiet buy','','title="Купить вагон" aria-label="Купить вагон за '+RULES.tramCost+' рублей" '+(!line.stops.length||game.cash<RULES.tramCost?'disabled':''))+'</div>';
}
function fare(){return '<hr class="section-sep"><div class="fare"><div class="fare-label"><b>Единый билет</b><small>На всю поездку</small></div><div class="fare-options">'+[1,2,3].map(n=>btn('fare-'+n,n+' ₽',game.fare===n?'active':'','','aria-label="Тариф '+n+' ₽" aria-pressed="'+(game.fare===n)+'"')).join('')+'</div></div>'}
function networkPanel(){
  const line=game.lines[ui.line],ids=line.stops, col=LINE_COLORS[ui.line];
  const connected=ids.length?'<div class="route-preview" style="--line:'+col+'"><i></i><span>'+game.sites[ids[0]].name+'</span><span class="dash"></span><i></i><span>'+game.sites[ids.at(-1)].name+'</span></div>':'<p class="context-note">Выберите минимум два места на карте и назначьте вагон.</p>';
  return '<div class="section-title"><h3>Маршрутная сеть</h3></div>'+selector()+'<div class="route-head"><span class="route-num" style="--line:'+col+'">0'+(ui.line+1)+'</span><div><strong>'+TITLES[ui.line]+'</strong><span class="route-meta">'+(ids.length?stops(ids.length)+' · '+cars(line.trams):'Свободный маршрут')+'</span></div></div>'+connected+'<div class="route-actions">'+btn('edit',ids.length?'Изменить':'Проложить','primary','route')+btn('build-mode','Остановка','soft-button','plus')+'</div>'+depot(line)+fare()
}
function draftInfo(){
  const missing=ui.draft.filter(id=>!game.stops.includes(id)),temp={...game,stops:[...game.stops,...missing]};
  const rail=routeQuote(temp,ui.line,ui.draft);return {missing,rail,total:rail+missing.length*RULES.stopCost};
}
function editPanel(){
  const d=draftInfo(),valid=Number.isFinite(d.total), changed=ui.draft.join(',')!==game.lines[ui.line].stops.join(',');
  const steps=ui.draft.map((id,index)=>'<div class="step"><span class="step-num">'+(index+1)+'</span>'+game.sites[id].name+(!game.stops.includes(id)?'<span class="caption">новая</span>':'')+btn('drop-'+index,'×','quiet tiny','','aria-label="Убрать '+game.sites[id].name+'"')+'</div>').join('');
  return '<div class="section-title"><h3>Маршрут 0'+(ui.line+1)+'</h3><span class="caption">РЕДАКТОР</span></div><p class="edit-hint">Нажимайте на места в порядке движения. На обратном пути вагон посетит их в обратном порядке.</p><div class="selector-list" style="--line:'+LINE_COLORS[ui.line]+'">'+(steps||'<p class="minor">Выберите начало линии на карте.</p>')+'</div>'+
    (valid?'<div class="stat-list">'+row('Новые остановки',d.missing.length+' · '+money(d.missing.length*RULES.stopCost))+row('Рельсы',money(d.rail))+'</div>':'')+
    '<div class="action-row">'+btn('commit',valid?'Применить · '+money(d.total):'Нужны две остановки','primary','',(!valid||!changed||game.cash<d.total)?'disabled':'')+btn('cancel','Отмена')+'</div>'+(valid&&d.total>game.cash?'<p class="context-note">В кассе не хватает '+money(d.total-game.cash)+'.</p>':'');
}
function sitePanel(){
  const site=game.sites[ui.site],id=site.id,built=game.stops.includes(id),vis=game.stats.bySite[id],wait=game.people.filter(p=>p.state==='wait'&&p.at===id).length;
  const incoming=game.people.filter(p=>p.dest===id).length,lines=game.lines.filter(l=>l.stops.includes(id)).map(l=>'0'+(l.id+1)).join(' · ');
  return btn('cancel','К пульту','back','back')+'<div class="section-title"><h3>'+site.name+'</h3></div><p class="minor">'+TEXT[site.kind]+' · '+(built?'Остановка открыта':'Площадка под остановку')+'</p><div class="stat-list">'+row('Направляются сюда',incoming)+row('Прибыли трамваем / пешком',vis.tram+' / '+vis.walk)+(built?row('На остановке',wait)+row('Линии',lines||'Ещё не назначены'):'')+'</div>'+
    (!built?btn('build-here','Построить · '+money(RULES.stopCost),'primary fullbtn','stop',game.cash<RULES.stopCost?'disabled':''):'')+
    (!game.lines[ui.line].stops.includes(id)?btn('append-site','Добавить к линии 0'+(ui.line+1),'soft-button fullbtn','route'):'')
}
function demandPanel(){
  const s=game.stats,waiting=game.people.filter(p=>p.state==='wait'),riding=game.people.filter(p=>p.state==='ride').length;
  const reasons=s.byReason,reasonCount=Object.keys(reasons).sort((a,b)=>reasons[b]-reasons[a])[0];
  const messages={unconnected:'Нет удобной связи между районами.',slow:'Пешком выходит быстрее. Добавьте вагон или сократите объезд.',expensive:'Дорого ехать. Проверьте спрос с более дешёвым билетом.',crowded:'В нужном вагоне не хватило мест. Поможет дополнительный рейс.',waiting:'Жители устали ждать отправления. Сократите интервал между вагонами.',legacyWait:'Жители долго ждали. Так записано в прежнем сохранении.'};
  const list=game.sites.map(s=>({s,n:game.people.filter(p=>p.dest===s.id).length})).sort((a,b)=>b.n-a.n).slice(0,3);
  return '<div class="section-title"><h3>Пассажиропоток</h3></div><p class="minor">'+phase()+' · '+(game.elapsed<game.duration*.56?'Дневной спрос — '+daytimeStop():'К вечеру поток смещается домой')+'</p><div class="stat-list">'+row('Ждут / в вагонах',waiting.length+' / '+riding)+row('Завершили путь пешком',s.walked)+row('Сделали пересадку',s.transfers)+'</div><hr class="section-sep"><div class="caption">КУДА ЕДУТ И ИДУТ СЕЙЧАС</div>'+list.map(({s,n})=>'<div class="flow-row">'+btn('inspect-'+s.id,s.name,'')+'<b>'+n+'</b></div>').join('')+'<hr class="section-sep"><div class="caption">ПОЧЕМУ ИДУТ ПЕШКОМ · ЗА СМЕНУ</div><p class="context-note">'+(reasons[reasonCount]?messages[reasonCount]:'Здесь появится причина выбора жителей.')+'</p><p class="minor">Стрелки показывают частые направления. Число на стрелке — жители в пути. Нажмите на пешехода, чтобы увидеть его поездку.</p>'
}
function personPanel(){
  const living=game.people.find(p=>p.id===ui.person),p=living||ui.selectedPerson;if(!p)return demandPanel();if(living)ui.selectedPerson={...living};
  return btn('cancel','К потоку','back','back')+'<div class="section-title"><h3>Пассажир № '+p.id+'</h3></div><div class="stat-list">'+row('Отправление',game.sites[p.origin].name)+row('Назначение',game.sites[p.dest].name)+row('Сейчас',living?STATE[p.state]:'Прибыл')+(p.line>=0?row('Линия','0'+(p.line+1)):'')+'</div><p class="context-note">'+escapeHTML(p.reason||'Выбирает путь до цели.')+'</p>';
}
function panel(){
  tabs();let html;
  if(ui.mode==='edit')html=editPanel();
  else if(ui.mode==='build')html='<div class="section-title"><h3>Новая остановка</h3></div><p class="edit-hint">Выберите на карте место со знаком «+». Остановка стоит '+money(RULES.stopCost)+'. После постройки добавьте её в маршрут.</p>'+btn('cancel','Отмена','soft-button');
  else if(ui.mode==='site')html=sitePanel();else if(ui.mode==='person')html=personPanel();
  else html=ui.tab==='network'?networkPanel():demandPanel();
  display('#panel',html);
  const tip=$('#map-tip');tip.hidden=!['edit','build'].includes(ui.mode);tip.textContent=ui.mode==='build'?'Выберите место со знаком «+»':'Линия 0'+(ui.line+1)+' · нажимайте на места по порядку';
  const strip=$('#map-edit-bar');
  strip.hidden=ui.mode!=='edit';
  if(ui.mode==='edit'){
    const price=draftInfo().total;
    const canApply=Number.isFinite(price)&&game.cash>=price&&ui.draft.join(',')!==game.lines[ui.line].stops.join(',');
    const html='<span>Линия 0'+(ui.line+1)+' · '+stops(ui.draft.length)+'</span>'+
      btn('map-apply',Number.isFinite(price)?'Применить · '+money(price):'Выберите места','primary','',canApply?'':'disabled')+
      btn('map-abort','Отмена','quiet');
    if(strip.innerHTML!==html)strip.innerHTML=html;
  }
}
function header(){
  $('#cash').textContent=money(game.cash);$('#delivered').textContent=game.stats.delivered;$('#target').textContent=' / '+game.target;
  $('#clock').textContent=clock();$('#period').textContent=phase();$('#speed').textContent=speed+'×';$('#speed').disabled=game.ended;
  const text=running?'Пауза':game.ended?'Итоги смены':begun?'Продолжить смену':'Начать смену';
  if(prevStamp!==text){prevStamp=text;$('#play').innerHTML=ico(running?'pause':game.ended?'ticket':'play');$('#play').title=text+' · Пробел';$('#play').setAttribute('aria-label',text)}
  $('#map-code').textContent='ЛИСТ № '+game.seed;
}
function refresh(){header();mission();panel();forecast();map?.paint(true)}
function clearSelection(){Object.assign(ui,{site:null,person:null,selectedPerson:null,draft:null,mode:'overview'})}
function planning(){running=false;lastMoment=null}
function jumpTo(where){
  if(innerWidth<=800)$(where==='map'?'.overview':'.controls').scrollIntoView({block:'start',behavior:'smooth'});
}
function onSite(id){
  if(modal)return;
  if(ui.mode==='edit'){
    if(ui.draft.includes(id)){toast('Место уже в маршруте. Уберите его крестиком в списке.');return}
    ui.draft.push(id);sound('button');refresh();return;
  }
  if(ui.mode==='build'&&game.stops.includes(id)){toast('Здесь уже есть остановка. Выберите знак «+».');return}
  const wasBuild=ui.mode==='build';clearSelection();ui.mode='site';ui.site=id;
  if(wasBuild)planning();
  refresh();
  jumpTo('panel')
}
function onPerson(id){clearSelection();ui.person=id;ui.mode='person';ui.tab='demand';ui.flow=true;refresh();jumpTo('panel')}
function edit(append=null){
  planning();clearSelection();ui.tab='network';ui.mode='edit';ui.draft=[...game.lines[ui.line].stops];
  if(append!==null&&!ui.draft.includes(append))ui.draft.push(append);
  refresh();jumpTo('map')
}
function commitDraft(){
  const price=draftInfo(),candidate=restoreGame(game);if(!candidate||!Number.isFinite(price.total)||price.total>game.cash){toast('Не удалось применить маршрут');return}
  for(const id of price.missing){const result=buildStop(candidate,id);if(!result.ok){toast(result.message);return}}
  const res=setRoute(candidate,ui.line,ui.draft);if(!res.ok){toast(res.message);return}
  game=candidate;const last=game.sites[ui.draft.at(-1)].name;const empty=!game.lines[ui.line].trams;
  clearSelection();log('Линия 0'+(ui.line+1)+' проложена до «'+last+'» за '+money(price.total)+'.'+(empty?' Нужен вагон.':''));toast(empty?'Линия готова. Купите первый вагон.':'Маршрут принят. Можно продолжить смену.');sound('build');save();refresh()
}
function run(){
  if(game.ended){openModal('result');return}
  if(modal||ui.draft){toast('Завершите редактирование маршрута');return}
  running=!running;lastMoment=null;
  if(running){if(!begun){begun=true;log('Начало смены. Первый вагон на линии.')}sound('start');jumpTo('map')}
  else save();
  refresh()
}
function changeSpeed(){speed=({1:2,2:4,4:1})[speed];save();refresh();toast('Скорость времени · '+speed+'×')}
function action(key){
  if(key==='run'){run();return}if(key==='result'){openModal('result');return}
  if(key==='jump-map'||key==='jump-panel'){jumpTo(key==='jump-map'?'map':'panel');return}
  if(key==='cancel'||key==='map-abort'){clearSelection();refresh();return}
  if(key.startsWith('line-')){clearSelection();ui.line=Number(key.slice(5));refresh();return}
  if(key.startsWith('inspect-')){onSite(Number(key.slice(8)));return}
  if(game.ended)return;
  if(key==='guide'){ui.line=0;edit();toast('Нажмите «Вокзал» на карте, затем «Применить».');return}
  if(key==='edit'){edit();return}if(key==='commit'||key==='map-apply'){commitDraft();return}
  if(key==='build-mode'){planning();clearSelection();ui.mode='build';refresh();jumpTo('map');return}
  if(key==='append-site'){edit(ui.site);return}
  if(key==='build-here'){const r=buildStop(game,ui.site);if(r.ok){log('Открыта остановка «'+game.sites[ui.site].name+'» за '+money(RULES.stopCost)+'.');sound('build');save()}toast(r.message);refresh();return}
  if(key==='buy'){const r=buyTram(game,ui.line);if(r.ok){log('Линия 0'+(ui.line+1)+' получила новый вагон на '+RULES.capacity+' мест.');sound('bell');save()}toast(r.message);refresh();return}
  const [act,raw]=key.split('-'),n=Number(raw);
  if(act==='fare'){if(game.fare===n)return;const r=setFare(game,n);if(r.ok){log('Единый билет теперь стоит '+money(n)+'.');sound('button');save()}}
  if(act==='drop'){ui.draft.splice(n,1)}
  // Keep all ordinary clicks on the same render path.
  refresh()
}

function resultMarkup(){
  const s=game.stats, achieved=game.won, order=districtOrder(game);
  let last=0;const data=[];
  for(let i=1;i<=8;i++){
    const sample=game.history.filter(h=>h.elapsed<=game.duration*i/8+.02).at(-1);
    const total=i===8?s.delivered:sample?.delivered||0;data.push(total-last);last=total;
  }
  const peak=Math.max(1,...data);
  const bars='<div class="chart" aria-label="Прибытия по двухчасовым периодам">'+data.map((n,i)=>'<div title="'+(6+2*i)+':00–'+(8+2*i)+':00 · '+n+'"><b>'+n+'</b><i style="height:'+(n?Math.max(2,37*n/peak):0)+'px"></i><small>'+String(6+i*2).padStart(2,'0')+'</small></div>').join('')+'</div>';
  return '<div class="report-strip">'+kicker('ticket','ПУТЕВОЙ ЛИСТ · 22:00')+'<h2>'+(achieved?'План выполнен':'Смена окончена')+'</h2><p>'+(achieved?'Последний трамвай вернулся в депо.':'До плана не хватило '+(game.target-s.delivered===1?'одной поездки':amt(game.target-s.delivered,['поездки','поездок','поездок']))+'.')+'</p></div><div class="dialog-inner"><div class="report-numbers"><div><b>'+s.delivered+' / '+game.target+'</b><small>Доставлено</small></div><div><b>'+money(s.revenue)+'</b><small>Выручка</small></div><div><b>'+s.transfers+'</b><small>Пересадки</small></div></div><div class="caption">ПРИБЫТИЯ ПО ВРЕМЕНИ СУТОК</div>'+bars+
    '<div class="report-order">'+ico('flag')+'<span>Поручение района · «'+escapeHTML(order.name)+'»<br><b>'+(order.done?'Выполнено':'Не выполнено')+' · '+order.delivered+' из '+order.target+'</b></span></div><p class="minor">'+(bestBefore?'Прошлый рекорд на этом плане — '+bestBefore+'. ':'Это первая смена на этом плане. ')+nextShiftAdvice(game)+'</p><div class="action-row">'+btn('same','Повторить карту','primary','repeat')+btn('new','Другой район','soft-button','map')+'</div>'+btn('close','Посмотреть сеть','quiet fullbtn','back')+'</div>'
}
function dialogBody(type){
  const head=(title,icon='ticket')=>'<div class="dialog-inner"><div class="dialog-top"><div class="eyebrow">'+ico(icon)+' ТРАМВАЙНОЕ БЮРО</div>'+btn('close','×','quiet','','aria-label="Закрыть"')+'</div><h2 class="dialog-title">'+title+'</h2>';
  if(type==='result')return resultMarkup();
  if(type==='help')return head('Как провести смену','help')+'<p>С 06:00 до 22:00 доставьте '+game.target+' жителей. Засчитывается прибытие к цели после поездки на трамвае.</p><ol><li><b>Продлите первую линию.</b> Нажмите «Изменить», выберите Вокзал на карте и примените маршрут. Цена включает остановку и новые рельсы.</li><li><b>Выпустите вагон.</b> В строке «Вагоны» кнопка «+ '+money(RULES.tramCost)+'» добавляет вагон к выбранной линии. Вагоны разворачиваются на конечных.</li><li><b>Начните смену.</b> Слой «Потоки» показывает очереди и стрелки трёх самых частых направлений среди жителей в пути. Выберите жителя или место, чтобы узнать направление. Утром популярен вокзал, вечером — жилые кварталы.</li><li><b>Настройте сеть.</b> Общая остановка связывает линии пересадкой. За поездку с пересадкой действует один билет. Высокий тариф увеличивает кассу, но часть жителей предпочтёт прогулку.</li></ol><p class="fine">Пробел — пуск и пауза. Клавиши 1, 2 и 3 — скорость 1×, 2× и 4×. На увеличенной карте потяните улицу для обзора. Смена сохраняется автоматически.</p>'+btn('close','К пульту','primary fullbtn','next')+'</div>';
  if(type==='menu')return head('Меню смены','menu')+'<p>План № '+game.seed+' · '+clock()+' · '+(game.stats.delivered)+' из '+game.target+' доставлено</p>'+btn('close','Вернуться на карту','primary fullbtn','back')+btn('download','Скачать сохранение','soft-button fullbtn','save')+btn('import','Открыть файл сохранения','soft-button fullbtn','file')+'<hr class="section-sep">'+btn('restart-same','Начать заново на этой карте','soft-button fullbtn','repeat')+btn('restart-new','Начать в другом районе','soft-button fullbtn','map')+'<p class="fine">Лучший результат этого плана — '+Number(records[game.seed]||0)+'. Игра сохраняется в этом браузере. Файл позволяет перенести смену.</p></div>';
  if(type==='confirm-same'||type==='confirm-new')return head('Открыть новую смену?')+'<p>Текущая смена будет заменена. Её можно скачать в меню. '+(type==='confirm-same'?'Улицы и спрос повторятся.':'Изменятся расположение кварталов и дневной спрос.')+'</p><div class="action-row">'+btn(type==='confirm-same'?'same':'new','Начать смену','primary','repeat')+btn('menu','Назад')+'</div></div>';
  return head('Журнал смены','radio')+(logs.length?[...logs].reverse().map(e=>'<div class="entry"><time>'+escapeHTML(e.time)+'</time><p>'+escapeHTML(e.message)+'</p></div>').join(''):'<p>Записи появятся после первого распоряжения.</p>')+'</div>';
}
let resumeAfterModal=false;
function openModal(type){
  const d=$('#dialog');if(!d.open){resumeAfterModal=running;planning()}
  modal=type;$('#dialog-content').innerHTML=dialogBody(type);
  const label=$('#dialog-content h2');if(label){label.id='dialog-title';d.setAttribute('aria-labelledby','dialog-title')}
  if(!d.open)d.showModal();else d.scrollTop=0;header();mission();
}
function closeModal(restore=true){
  modal='';$('#dialog').close();running=!!(restore&&resumeAfterModal&&!game.ended);resumeAfterModal=false;lastMoment=null;refresh()
}
function newShift(seed){
  if($('#dialog').open)closeModal(false);
  game=newGame(seed);running=false;speed=1;begun=false;bestBefore=Number(records[game.seed]||0);logs=[];
  clearSelection();ui.tab='network';ui.line=0;ui.flow=false;prevStamp='';sector=-1;musicAt=0;
  log('План № '+game.seed+' принят. Первый вагон ждёт отправления.');map.reset();save();refresh();window.scrollTo({top:0,behavior:'smooth'})
}
function download(){
  save();const file=new Blob([JSON.stringify({format:'tram-bureau',game,speed,logs,begun,bestBefore})],{type:'application/json'});
  const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='tram-bureau-'+game.seed+'-'+clock().replace(':','')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Файл смены подготовлен')
}
function importSave(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async()=>{
    try{const file=input.files[0];if(!file)return;if(file.size>4_000_000)throw Error();
      const data=JSON.parse(await file.text()),model=restoreGame(data.game);
      if(data.format!=='tram-bureau'||!model)throw Error();
      const sameReport = game.ended && model.ended && JSON.stringify(model) === JSON.stringify(game);
      const prior = sameReport ? bestBefore : undefined;
      closeModal(false);game=model;speed=[1,2,4].includes(data.speed)?data.speed:1;
      logs=Array.isArray(data.logs)?data.logs.filter(l=>typeof l?.message==='string'&&typeof l.time==='string').slice(-70):[];
      begun=!!data.begun||game.elapsed>0;bestBefore=restoreRecord(data.bestBefore, prior);
      clearSelection();ui.line=0;ui.tab='network';sector=Math.floor(game.elapsed/game.duration*16)+6;musicAt=game.elapsed;
      log('Смена восстановлена из файла.');map.reset();save();refresh();if(game.ended)openModal('result');else toast('Смена восстановлена на паузе');
    }catch{toast('Не удалось прочитать сохранение «Трамвайного бюро».')}
  };input.click()
}
function dialogAction(key){
  if(key==='close'){closeModal();return}
  if(key==='download'){download();return}if(key==='import'){importSave();return}
  if(key==='restart-same'||key==='restart-new'){openModal(key==='restart-same'?'confirm-same':'confirm-new');return}
  if(key==='same'||key==='new'){let seed=game.seed;if(key==='new'){do{seed=1000+Math.floor(Math.random()*899000)}while(seed===game.seed)}newShift(seed);return}
  if(key==='menu')openModal('menu')
}
function finish(){
  planning();log(game.won?'План перевозок выполнен. Смена закрыта.':'Движение закрыто. Путевой лист передан в бюро.');
  bestBefore=restoreRecord(bestBefore);
  sound('finish');save();refresh();openModal('result')
}
function eventHour(){
  const h=Math.min(22,Math.floor(6+16*game.elapsed/game.duration));
  if(h===sector)return;const was=sector;sector=h;if(was===-1)return;
  if([10,14,18].includes(h))log('Город перечислил субсидию на сеть · '+money(RULES.grant)+'.');
  if(h===12)log('Полдень. Ожидается наплыв у остановки «'+daytimeStop()+'».');
  if(h===17)log('Начинается вечерний пик. Горожане возвращаются домой.')
}
let repaint=0,refreshAt=0;
function frame(time){
  if(running&&!document.hidden){
    const dt=lastMoment===null?0:Math.min((time-lastMoment)/1000,.3);lastMoment=time;
    const firstDelivery=game.stats.delivered===0, orderBefore=districtOrder(game).done;
    if(dt>0)advance(game,dt*speed);
    if(firstDelivery&&game.stats.delivered>0){
      const message='Первая поездка завершена. Бюро получило плату за билет.';
      log(message);toast(message);sound('bell');
    }
    if(!orderBefore&&districtOrder(game).done){
      const message='Поручение района выполнено · «'+daytimeStop()+'».';
      log(message);toast(message);sound('bell');
    }
    eventHour();if(game.ended)finish();
    else {
      if(game.elapsed-musicAt>7){musicAt=game.elapsed;sound('tick')}
      if(time-repaint>29){map.paint();repaint=time}
      if(time-refreshAt>320){refresh();refreshAt=time}
      if(time-persistAt>4000){save();persistAt=time}
    }
  }else lastMoment=null;
  requestAnimationFrame(frame)
}
function clickControl(event){
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  if(el.closest('dialog'))dialogAction(el.dataset.action);else action(el.dataset.action)
}
document.addEventListener('click',clickControl);
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=ico(el.dataset.icon);
function soundUI(){const el=$('#sound');el.innerHTML=ico(soundOn?'sound':'mute');el.title=soundOn?'Выключить звук':'Включить звук';el.setAttribute('aria-label',el.title);el.setAttribute('aria-pressed',soundOn)}
function activateAudio(){if(!clickedStart){clickedStart=true;if(opts.sound===true){soundOn=soundSet(true);soundUI()}}}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#sound'))activateAudio()},{once:true});
$('#sound').onclick=()=>{clickedStart=true;soundOn=soundSet(!soundOn);opts.sound=soundOn;write(OPTIONS,opts);soundUI()};
$('#help').onclick=()=>openModal('help');$('#menu').onclick=()=>openModal('menu');$('#logs').onclick=()=>openModal('logs');$('#play').onclick=run;$('#speed').onclick=changeSpeed;
$('#flow-toggle').onclick=()=>{ui.flow=!ui.flow;if(ui.mode==='person'&&!ui.flow)clearSelection();refresh()};
for(const t of ['network','demand'])$('#tab-'+t).onclick=()=>{clearSelection();ui.tab=t;if(t==='demand')ui.flow=true;refresh()};
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();closeModal()});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal()}});
window.addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,textarea,select')||modal)return;
  if(e.code==='Space'&&!e.target.closest('button')){e.preventDefault();run()}
  if(e.code==='Escape'){clearSelection();refresh()}
  if(['Digit1','Digit2','Digit3'].includes(e.code)){speed=({Digit1:1,Digit2:2,Digit3:4})[e.code];save();refresh()}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lastMoment=null;save()}});
window.addEventListener('pagehide',save);
map=cityMap(()=>game,ui,onSite,onPerson);
if(!logs.length)log('Старый город и Рынок соединены. В кассе '+money(game.cash)+' на развитие сети.');else journal();
soundUI();refresh();save();if(game.ended)openModal('result');requestAnimationFrame(frame);
