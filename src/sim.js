import { makeSites, segmentPath } from './geo.js';

export const RULES = Object.freeze({
  duration: 300,
  target: 64,
  startCash: 125,
  stopCost: 15,
  tramCost: 40,
  trackCost: 0.055,
  capacity: 7,
  lineCount: 3,
  grant: 15,
});

const STEP = 1 / 30;
const WALK_SPEED = 8.4;
const TRAM_SPEED = 38;
const DWELL = 1.35;
const CATCHMENT = 145;
const layoutCache = new WeakMap();
const result = (ok, message) => ({ ok, message });
const siteExists = (g, id) => Number.isInteger(id) && g.sites[id]?.id === id;
const lineExists = (g, id) => Number.isInteger(id) && g.lines[id]?.id === id;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function random(g) {
  g.rng = (Math.imul(g.rng, 1664525) + 1013904223) >>> 0;
  return g.rng / 4294967296;
}

function choose(g, list) {
  return list[Math.floor(random(g) * list.length)];
}

function makePath(points) {
  const cuts = [0];
  for (let i = 1; i < points.length; i++) {
    const delta = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cuts.push(cuts[i - 1] + delta);
  }
  return { points, cuts, length: cuts.at(-1) };
}

function layout(g) {
  let cache = layoutCache.get(g);
  if (!cache) {
    const paths = g.sites.map(a => g.sites.map(b => {
      const points = a.id === b.id ? [a] : segmentPath(a, b);
      return makePath(points);
    }));
    cache = { paths, journeys: null };
    layoutCache.set(g, cache);
  }
  return cache;
}

function road(g, a, b) {
  return layout(g).paths[a][b];
}

function pose(path, along, side = 0) {
  if (path.points.length === 1) {
    const { x, y } = path.points[0];
    return { x, y, angle: 0 };
  }
  const d = clamp(along, 0, path.length);
  let i = 1;
  while (i < path.cuts.length - 1 && path.cuts[i] < d) i++;
  const a = path.points[i - 1];
  const b = path.points[i];
  const t = (d - path.cuts[i - 1]) / (path.cuts[i] - path.cuts[i - 1] || 1);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return {
    x: a.x + (b.x - a.x) * t - Math.sin(angle) * side,
    y: a.y + (b.y - a.y) * t + Math.cos(angle) * side,
    angle,
  };
}

function trackOwned(g, a, b) {
  return g.tracks.some(([u, v]) => (a === u && b === v) || (a === v && b === u));
}

function streetKey(a, b) {
  const u = a.x + '/' + a.y;
  const v = b.x + '/' + b.y;
  return u < v ? u + ':' + v : v + ':' + u;
}

function newTrackLength(path, built) {
  let length = 0;
  for (let i = 1; i < path.points.length; i++) {
    const key = streetKey(path.points[i - 1], path.points[i]);
    if (built.has(key)) continue;
    built.add(key);
    length += path.cuts[i] - path.cuts[i - 1];
  }
  return length;
}

function validRoute(g, index, ids) {
  return lineExists(g, index) && Array.isArray(ids) && ids.length >= 2 &&
    ids.length <= g.sites.length && new Set(ids).size === ids.length &&
    ids.every(id => g.stops.includes(id));
}

export function routeQuote(g, lineIndex, ids) {
  if (!validRoute(g, lineIndex, ids)) return Infinity;
  const constructed = new Set();
  for (const [from, to] of g.tracks) newTrackLength(road(g, from, to), constructed);
  let total = 0;
  for (let i = 1; i < ids.length; i++) {
    total += newTrackLength(road(g, ids[i - 1], ids[i]), constructed);
  }
  return Math.round(total * RULES.trackCost);
}

// One edge represents staying on the same tram to any later stop. A second
// edge includes a second headway, so changing trains has a real time cost.
function network(g) {
  const cache = layout(g);
  if (cache.journeys) return cache.journeys;
  const outgoing = g.sites.map(() => []);
  for (const line of g.lines) {
    if (!line.trams || line.stops.length < 2) continue;
    const ids = line.stops;
    const times = [0];
    for (let i = 1; i < ids.length; i++) {
      times.push(times[i - 1] + road(g, ids[i - 1], ids[i]).length / TRAM_SPEED + DWELL);
    }
    const wait = times.at(-1) / line.trams;
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        outgoing[ids[i]].push({
          line: line.id, from: ids[i], to: ids[j],
          time: wait + Math.abs(times[j] - times[i]),
        });
      }
    }
  }
  cache.journeys = g.sites.map(site => {
    const best = g.sites.map(() => ({ time: Infinity, legs: [] }));
    const visited = new Set();
    best[site.id].time = 0;
    for (;;) {
      let next = -1;
      let shortest = Infinity;
      for (let i = 0; i < best.length; i++) {
        if (!visited.has(i) && best[i].time < shortest) {
          shortest = best[i].time;
          next = i;
        }
      }
      if (next < 0) break;
      visited.add(next);
      for (const edge of outgoing[next]) {
        const time = shortest + edge.time + (next === site.id ? 0 : 1.5);
        if (time >= best[edge.to].time) continue;
        best[edge.to] = { time, legs: [...best[next].legs, edge] };
      }
    }
    return best;
  });
  return cache.journeys;
}

function itinerary(g, from, dest) {
  const journeys = network(g);
  let best = { time: Infinity, legs: [] };
  for (const start of g.stops) {
    const approach = road(g, from, start).length;
    if (approach > CATCHMENT) continue;
    for (const end of g.stops) {
      const exit = road(g, end, dest).length;
      if (exit > CATCHMENT || start === end) continue;
      const path = journeys[start][end];
      const total = path.time + (approach + exit) / WALK_SPEED;
      if (total < best.time) best = { time: total, legs: path.legs };
    }
  }
  return best;
}

function beginWalk(g, p, state, from, to) {
  p.state = state;
  p.at = from;
  p.to = to;
  p.along = 0;
  p.vehicle = -1;
  p.line = state === 'approach' ? p.legs[0].line : -1;
  const site = g.sites[from];
  p.x = site.x + Math.cos(p.id) * 5;
  p.y = site.y + Math.sin(p.id) * 5;
}

function waitAt(g, p, at) {
  p.state = 'wait';
  p.at = at;
  p.waitSince = g.elapsed;
  p.vehicle = -1;
  p.line = p.legs[0].line;
  // Stable offsets keep the queue visible and avoid people jittering per frame.
  p.x = g.sites[at].x + 10 + (p.id % 4) * 3;
  p.y = g.sites[at].y + 8 + (Math.floor(p.id / 4) % 3) * 3;
}

function decideJourney(g, p, from, countChoice = false) {
  const option = itinerary(g, from, p.dest);
  const walking = road(g, from, p.dest).length / WALK_SPEED;
  const pricePenalty = p.boardings ? 0 : g.fare * p.sensitivity;
  if (option.legs.length && walking > option.time + pricePenalty) {
    p.legs = option.legs.map(({ line, from, to }) => ({ line, from, to }));
    p.reason = p.legs.length > 1 ? 'Пересадка сокращает дорогу' : 'Трамвай экономит время';
    if (p.legs[0].from === from) waitAt(g, p, from);
    else beginWalk(g, p, 'approach', from, p.legs[0].from);
    return;
  }
  let key = 'unconnected';
  let reason = 'Рядом нет удобной линии';
  if (option.legs.length) {
    key = walking <= option.time ? 'slow' : 'expensive';
    reason = key === 'slow' ? 'Пешком быстрее, чем ждать' : 'Выигрыш во времени не окупает билет';
  }
  if (countChoice) g.stats.byReason[key]++;
  p.reason = reason;
  p.legs = [];
  beginWalk(g, p, p.boardings ? 'exit' : 'walk', from, p.dest);
}

function demand(g) {
  const f = g.elapsed / g.duration;
  const morning = f < 0.32;
  const evening = f > 0.66;
  const all = g.sites;
  const homes = all.filter(s => s.kind === 'home');
  const day = all.filter(s => s.kind === 'work' || s.kind === 'hub');
  const destinations = all.filter(s => s.kind === 'leisure' || s.kind === 'hub');
  const pick = list => choose(g, list.length ? list : all).id;
  // The old-town market has a reliable local trade even between rush hours.
  if (random(g) < (morning ? .10 : .14)) return random(g) < .52 ? [0, 1] : [1, 0];
  let from = pick(all);
  let to = pick(all);
  if (morning || evening) {
    if (random(g) < 0.78) {
      from = random(g) < 0.36 ? 0 : pick(homes);
      to = random(g) < 0.42 ? 2 : pick(day);
      if (evening) [from, to] = [to, from];
    }
  } else if (random(g) < 0.72) {
    from = random(g) < 0.40 ? 1 : pick(all);
    to = f >= 0.375 && f < 0.5625 && random(g) < 0.66 ? g.brief.site : pick(destinations);
  }
  if (from === to) from = pick(all.filter(s => s.id !== to));
  return [from, to];
}

function spawn(g, trip = demand(g), alreadyAtPlatform = false) {
  const [origin, dest] = trip;
  const p = {
    id: g.nextId++, origin, dest, state: 'walk', at: origin, to: dest,
    x: 0, y: 0, along: 0, line: -1, vehicle: -1, reason: '', legs: [],
    boardings: 0, lastLine: -1, paidFare: 0, waitSince: 0,
    sensitivity: 2 + random(g) ** 2 * 18,
    stride: 0.85 + random(g) * 0.30,
  };
  if (alreadyAtPlatform) p.sensitivity = 1;
  decideJourney(g, p, origin, true);
  g.people.push(p);
  g.stats.spawned++;
  return p;
}

function completed(g, p) {
  p.state = 'arrived';
  if (p.boardings) {
    g.stats.delivered++;
    g.stats.bySite[p.dest].tram++;
    g.stats.byLine[p.lastLine].delivered++;
    g.stats.revenue += p.paidFare;
    g.cash += p.paidFare;
  } else {
    g.stats.walked++;
    g.stats.bySite[p.dest].walk++;
  }
}

function nextStop(line, v) {
  const at = line.stops.indexOf(v.to);
  if (at === 0) v.direction = 1;
  if (at === line.stops.length - 1) v.direction = -1;
  return line.stops[at + v.direction];
}

function arrive(g, v) {
  const at = v.to;
  const line = g.lines[v.line];
  const replan = v.revision !== line.revision;
  v.revision = line.revision;
  const relocated = !line.stops.includes(at);
  // Dispatch back onto the revised line from its nearest platform. Riders
  // leave at the actual arrival site; the empty car never runs on unbuilt rail.
  if (relocated) {
    v.to = line.stops.reduce((nearest, id) =>
      road(g, at, id).length < road(g, at, nearest).length ? id : nearest);
  }
  const next = nextStop(line, v);
  const atIndex = line.stops.indexOf(at);
  for (const p of g.people) {
    if (p.state !== 'ride' || p.vehicle !== v.id) continue;
    const target = p.legs[0].to;
    if (target !== at) {
      const targetIndex = line.stops.indexOf(target);
      const stillOnWay = !relocated && targetIndex >= 0 &&
        Math.sign(targetIndex - atIndex) === v.direction;
      if (!replan || stillOnWay) continue;
    }
    v.load--;
    if (p.dest === at) {
      completed(g, p);
    } else if (replan) {
      decideJourney(g, p, at);
    } else {
      p.legs.shift();
      if (p.legs.length) waitAt(g, p, at);
      else beginWalk(g, p, 'exit', at, p.dest);
    }
  }
  v.from = v.to;
  v.to = next;
  v.along = 0;
  v.dwell = relocated ? DWELL * 3 : DWELL;
  v.x = g.sites[v.from].x;
  v.y = g.sites[v.from].y;
  v.angle = pose(road(g, v.from, next), 0).angle;
}

function board(g, v) {
  const ids = g.lines[v.line].stops;
  const fromIndex = ids.indexOf(v.from);
  if (fromIndex < 0) return;
  const departDir = Math.sign(ids.indexOf(v.to) - fromIndex);
  if (!departDir) return;
  const waiting = g.people.filter(p => p.state === 'wait' && p.at === v.from && p.line === v.line);
  waiting.sort((a, b) => a.waitSince - b.waitSince || a.id - b.id);
  for (const p of waiting) {
    if (v.load >= v.capacity) break;
    const targetIndex = ids.indexOf(p.legs[0].to);
    if (targetIndex < 0 || Math.sign(targetIndex - fromIndex) !== departDir) continue;
    if (p.boardings === 0) p.paidFare = g.fare;
    else if (p.lastLine !== v.line) g.stats.transfers++;
    p.state = 'ride';
    p.vehicle = v.id;
    p.x = v.x;
    p.y = v.y;
    p.boardings++;
    p.lastLine = v.line;
    v.load++;
    g.stats.byLine[v.line].boarded++;
  }
}

function moveTram(g, v) {
  if (v.dwell > 0) {
    v.dwell -= STEP;
    if (v.dwell <= 0) board(g, v);
    return;
  }
  const path = road(g, v.from, v.to);
  v.along += TRAM_SPEED * STEP;
  if (v.along >= path.length) arrive(g, v);
  else Object.assign(v, pose(path, v.along));
}

function placeTram(g, line) {
  const ids = line.stops;
  const cycle = [...ids, ...ids.slice(1, -1).reverse(), ids[0]];
  const starts = [0];
  for (let i = 1; i < cycle.length; i++) {
    starts.push(starts[i - 1] + road(g, cycle[i - 1], cycle[i]).length);
  }
  const existing = g.vehicles.filter(v => v.line === line.id);
  const length = starts.at(-1);
  let position = 0;
  if (existing.length) {
    // Add the service to the middle of the longest gap, leaving all live
    // vehicles and their passengers in place.
    const phases = existing.map(v => {
      const i = cycle.findIndex((id, i) => id === v.from && cycle[i + 1] === v.to);
      return i < 0 ? 0 : starts[i] + v.along;
    }).sort((a, b) => a - b);
    let longest = -1;
    for (let i = 0; i < phases.length; i++) {
      const next = i === phases.length - 1 ? phases[0] + length : phases[i + 1];
      if (next - phases[i] > longest) {
        longest = next - phases[i];
        position = (phases[i] + longest / 2) % length;
      }
    }
  }
  let i = 0;
  while (i < cycle.length - 2 && starts[i + 1] <= position) i++;
  const from = cycle[i];
  const to = cycle[i + 1];
  const along = position - starts[i];
  const v = {
    id: g.nextVehicle++, line: line.id, from, to, along,
    direction: Math.sign(ids.indexOf(to) - ids.indexOf(from)),
    revision: line.revision, dwell: along < 0.01 ? DWELL : 0,
    load: 0, capacity: RULES.capacity, ...pose(road(g, from, to), along),
  };
  g.vehicles.push(v);
  line.trams++;
}

export function buildStop(g, id) {
  if (g.ended) return result(false, 'Смена завершена');
  if (!siteExists(g, id)) return result(false, 'Выберите место на карте');
  if (g.stops.includes(id)) return result(false, 'Остановка уже построена');
  if (g.cash < RULES.stopCost) return result(false, 'Мало средств на остановку');
  g.cash -= RULES.stopCost;
  g.stops.push(id);
  return result(true, 'Остановка построена');
}

function updateWaiting(g) {
  layout(g).journeys = null;
  for (const p of g.people) {
    if (p.state === 'wait') {
      const since = p.waitSince;
      decideJourney(g, p, p.at);
      if (p.state === 'wait') p.waitSince = since;
    }
  }
}

export function setRoute(g, index, ids) {
  if (g.ended) return result(false, 'Смена завершена');
  if (!validRoute(g, index, ids)) return result(false, 'Нужны разные построенные остановки, минимум две');
  const cost = routeQuote(g, index, ids);
  if (cost > g.cash) return result(false, 'Мало средств на прокладку путей');
  const line = g.lines[index];
  if (line.stops.length === ids.length && line.stops.every((id, i) => id === ids[i])) {
    return result(true, 'Маршрут сохранён');
  }
  g.cash -= cost;
  for (let i = 1; i < ids.length; i++) {
    if (!trackOwned(g, ids[i - 1], ids[i])) g.tracks.push([ids[i - 1], ids[i]]);
  }
  line.stops = [...ids];
  line.revision++;
  // A tram already standing on an unchanged first segment can start the new
  // timetable immediately. Its first passengers should stay aboard at stop 2.
  for (const v of g.vehicles) {
    const from = ids.indexOf(v.from), to = ids.indexOf(v.to);
    if (v.line !== index || v.load || from < 0 || to < 0 || Math.abs(from - to) !== 1) continue;
    v.direction = Math.sign(to - from);
    v.revision = line.revision;
  }
  updateWaiting(g);
  return result(true, line.trams ? 'Маршрут обновлён' : 'Маршрут открыт. Купите вагон для линии');
}

export function buyTram(g, index) {
  if (g.ended) return result(false, 'Смена завершена');
  if (!lineExists(g, index) || g.lines[index].stops.length < 2) return result(false, 'Сначала проложите маршрут');
  if (g.cash < RULES.tramCost) return result(false, 'Мало средств на вагон');
  g.cash -= RULES.tramCost;
  placeTram(g, g.lines[index]);
  updateWaiting(g);
  return result(true, 'Вагон вышел на линию');
}

export function setFare(g, value) {
  if (g.ended) return result(false, 'Смена завершена');
  if (![1, 2, 3].includes(value)) return result(false, 'Билет может стоить 1, 2 или 3');
  g.fare = value;
  updateWaiting(g);
  return result(true, 'Тариф изменён');
}

function walk(g, p) {
  const path = road(g, p.at, p.to);
  p.along += WALK_SPEED * p.stride * STEP;
  if (p.along < path.length) {
    const pos = pose(path, p.along, 5 + (p.id % 3) * 1.2);
    p.x = pos.x;
    p.y = pos.y;
  } else if (p.state === 'approach') {
    // A route can change while someone is walking to the platform.
    decideJourney(g, p, p.to);
  } else {
    completed(g, p);
  }
}

function movePerson(g, p) {
  if (p.state === 'ride') {
    const v = g.vehicles[p.vehicle];
    p.x = v.x;
    p.y = v.y;
  } else if (p.state === 'wait') {
    const patience = Math.max(28, road(g, p.at, p.dest).length / WALK_SPEED * .92);
    if (g.elapsed - p.waitSince > patience) {
      g.stats.abandoned++;
      g.stats.byReason.crowded++;
      p.reason = 'Долго ждал и пошёл пешком';
      p.legs = [];
      beginWalk(g, p, p.boardings ? 'exit' : 'walk', p.at, p.dest);
    }
  } else if (p.state !== 'arrived') {
    walk(g, p);
  }
}

function snapshot(g) {
  g.history.push({
    elapsed: g.elapsed, delivered: g.stats.delivered, walked: g.stats.walked,
    revenue: g.stats.revenue, waiting: g.people.filter(p => p.state === 'wait').length,
  });
}

function step(g) {
  const before = g.elapsed;
  g.frame++;
  g.elapsed = g.frame / 30;
  if (g.elapsed >= g.nextSpawn) {
    const f = g.elapsed / g.duration;
    const rate = f < .27 || f > .70 ? 1.35 : 0.86;
    g.nextSpawn = g.elapsed + (.50 + random(g)) / rate;
    spawn(g);
  }
  for (const v of g.vehicles) moveTram(g, v);
  let waiting = 0;
  let arrived = false;
  for (const p of g.people) {
    movePerson(g, p);
    if (p.state === 'wait') waiting++;
    if (p.state === 'arrived') arrived = true;
  }
  if (arrived) g.people = g.people.filter(p => p.state !== 'arrived');
  g.stats.peakQueue = Math.max(g.stats.peakQueue, waiting);
  // Municipal support arrives at 10:00, 14:00 and 18:00.
  if (g.elapsed < g.duration && Math.floor(g.elapsed / 75) !== Math.floor(before / 75)) {
    g.cash += RULES.grant;
    g.stats.grants += RULES.grant;
  }
  if (Math.floor(g.elapsed / (g.duration / 32)) !== Math.floor(before / (g.duration / 32))) snapshot(g);
  if (g.elapsed >= g.duration) {
    g.ended = true;
    g.won = g.stats.delivered >= g.target;
  }
}

// Advances simulation time. Pausing and playback speed belong to the caller.
export function advance(g, seconds) {
  if (g.ended || !Number.isFinite(seconds) || seconds <= 0) return;
  g.remainder += Math.min(seconds, g.duration);
  while (g.remainder + 1e-9 >= STEP && !g.ended) {
    g.remainder -= STEP;
    step(g);
  }
  if (g.ended || g.remainder < 0) g.remainder = 0;
}

export function newGame(seed = 1874) {
  seed = (Number(seed) >>> 0) || 1874;
  const sites = makeSites(seed);
  const lines = Array.from({ length: RULES.lineCount }, (_, id) => ({
    id, stops: id ? [] : [0, 1], trams: 0, revision: 0,
  }));
  const g = {
    version: 1, seed, rng: (seed ^ 0x73db38e1) >>> 0,
    sites, lines, stops: [0, 1], tracks: [[0, 1]], people: [], vehicles: [],
    frame: 0, elapsed: 0, remainder: 0, nextSpawn: .4, nextId: 1, nextVehicle: 0,
    duration: RULES.duration, target: RULES.target, cash: RULES.startCash,
    fare: 2, ended: false, won: false, history: [],
    stats: {
      delivered: 0, walked: 0, transfers: 0, revenue: 0, spawned: 0,
      peakQueue: 0, abandoned: 0, grants: 0,
      bySite: sites.map(() => ({ tram: 0, walk: 0 })),
      byLine: lines.map(() => ({ boarded: 0, delivered: 0 })),
      byReason: { unconnected: 0, slow: 0, expensive: 0, crowded: 0 },
    },
  };
  const site = choose(g, [1, 5, 8, 9]);
  g.brief = { site, name: sites[site].name };
  placeTram(g, lines[0]);
  for (const trip of [[0, 1], [0, 1], [1, 0], [0, 2], [4, 2], [3, 1], [4, 7], [6, 0], [2, 1]]) {
    const p = spawn(g, trip, trip[0] <= 1 && trip[1] <= 1);
    if (p.state === 'walk') {
      const path = road(g, p.at, p.to);
      p.along = path.length * (.1 + random(g) * .43);
      Object.assign(p, pose(path, p.along, 6));
    }
  }
  snapshot(g);
  return g;
}

function validSave(g) {
  const num = Number.isFinite;
  const nat = n => Number.isSafeInteger(n) && n >= 0;
  const validSite = id => siteExists(g, id);
  if (!g || g.version !== 1 || !nat(g.seed) || !nat(g.rng) ||
      !nat(g.frame) || g.frame > RULES.duration * 30 || g.elapsed !== g.frame / 30 ||
      !num(g.remainder) || g.remainder < 0 || g.remainder >= STEP + 1e-8 ||
      g.duration !== RULES.duration || !nat(g.target) || g.target < 1 ||
      !nat(g.cash) || ![1, 2, 3].includes(g.fare) || !num(g.nextSpawn) ||
      !nat(g.nextId) || !nat(g.nextVehicle) || typeof g.ended !== 'boolean' ||
      typeof g.won !== 'boolean' || g.ended !== (g.elapsed >= g.duration)) return false;
  g.sites = makeSites(g.seed);
  if (!validSite(g.brief?.site) || !Array.isArray(g.stops) || !g.stops.every(validSite) ||
      new Set(g.stops).size !== g.stops.length || !Array.isArray(g.tracks) ||
      !g.tracks.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(validSite) && pair[0] !== pair[1])) return false;
  if (g.lines?.length !== RULES.lineCount || !g.lines.every((l, i) =>
    l?.id === i && Array.isArray(l.stops) && (l.stops.length === 0 || validRoute(g, i, l.stops)) &&
    nat(l.trams) && nat(l.revision))) return false;
  if (!Array.isArray(g.vehicles) || g.nextVehicle !== g.vehicles.length ||
      !g.vehicles.every((v, i) => v?.id === i && lineExists(g, v.line) &&
        g.lines[v.line].stops.length >= 2 && validSite(v.from) && validSite(v.to) && v.from !== v.to &&
        nat(v.load) && v.capacity === RULES.capacity && v.load <= v.capacity &&
        [v.x, v.y, v.along, v.angle, v.dwell].every(num) && [1, -1].includes(v.direction) && nat(v.revision))) return false;
  if (!g.lines.every(l => g.vehicles.filter(v => v.line === l.id).length === l.trams)) return false;
  if (!Array.isArray(g.people) || !g.people.every(p =>
    p && nat(p.id) && p.id < g.nextId && validSite(p.origin) && validSite(p.dest) && validSite(p.at) && validSite(p.to) &&
    ['walk', 'approach', 'wait', 'ride', 'exit'].includes(p.state) &&
    [p.x, p.y, p.along, p.waitSince, p.stride, p.sensitivity].every(num) && nat(p.boardings) &&
    (!p.boardings || lineExists(g, p.lastLine)) && nat(p.paidFare) &&
    Array.isArray(p.legs) && p.legs.every(l => lineExists(g, l.line) && validSite(l.from) && validSite(l.to)) &&
    (!['approach', 'ride', 'wait'].includes(p.state) || p.legs.length && lineExists(g, p.line)) &&
    (p.state !== 'ride' || g.vehicles[p.vehicle]?.line === p.line)
  )) return false;
  if (!g.vehicles.every(v => g.people.filter(p => p.state === 'ride' && p.vehicle === v.id).length === v.load)) return false;
  const s = g.stats;
  return s && [s.delivered, s.walked, s.transfers, s.revenue, s.spawned, s.peakQueue, s.abandoned, s.grants].every(nat) &&
    s.spawned === g.people.length + s.walked + s.delivered &&
    s.bySite?.length === g.sites.length && s.bySite.every(v => nat(v.tram) && nat(v.walk)) &&
    s.byLine?.length === g.lines.length && s.byLine.every(v => nat(v.boarded) && nat(v.delivered)) &&
    [s.byReason?.unconnected, s.byReason?.slow, s.byReason?.expensive, s.byReason?.crowded].every(nat) &&
    Array.isArray(g.history) && g.history.length > 0 && g.history.every(h => num(h.elapsed) &&
      [h.delivered, h.walked, h.revenue, h.waiting].every(nat));
}

export function restoreGame(data) {
  try {
    const g = JSON.parse(typeof data === 'string' ? data : JSON.stringify(data));
    if (!validSave(g)) return null;
    g.brief.name = g.sites[g.brief.site].name;
    return g;
  } catch {
    return null;
  }
}
