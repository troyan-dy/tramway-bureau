// The same junctions are used by the illustrator, the route planner and the trams.
export const WIDTH = 1000;
export const HEIGHT = 680;
export const coast = [
  [-80, 623], [-12, 635], [56, 628], [111, 614], [152, 616], [191, 635],
  [230, 646], [281, 653], [329, 651], [361, 642], [395, 619], [417, 591],
  [438, 566], [466, 550], [507, 542], [536, 545], [565, 554], [600, 560],
  [636, 552], [664, 534], [690, 505], [716, 485], [752, 474], [792, 470],
  [828, 459], [858, 442], [880, 419], [896, 393], [912, 367], [938, 349],
  [963, 340], [992, 336], [1036, 323], [1080, 310]
];

export function coastY(x) {
  let i = 1;
  while (i < coast.length - 1 && x > coast[i][0]) i++;
  const [ax, ay] = coast[i - 1], [bx, by] = coast[i];
  return ay + (by - ay) * (x - ax) / (bx - ax);
}

export function randomSource(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = Math.imul(n ^ n >>> 15, n | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const key = (c, r) => c + '/' + r;
let cached;

function createCity(seed) {
  const vertices = new Map(), graph = new Map(), edges = [];
  // A crooked coastal street grid. The deformation stays local, preserving blocks.
  for (let r = -3; r <= 9; r++) {
    for (let c = -6; c <= 10; c++) {
      const rand = randomSource(seed ^ Math.imul(c + 13, 73856093) ^ Math.imul(r + 9, 19349663));
      const x = 30 + 127 * c + 46 * r + 8 * Math.sin(c + r * 0.65) + (rand() - .5) * 19;
      const y = 103 - 26 * c + 93 * r + 7 * Math.sin(c * .84 - r) + (rand() - .5) * 17;
      const id = key(c, r), p = { x, y, c, r, key: id };
      vertices.set(id, p);
      const island = c === 4 && r === 6, abutment = c === 4 && r === 5;
      if ((x > 25 && x < 980 && y > 28 && y < coastY(x) - 11) || island || abutment) graph.set(id, []);
    }
  }
  for (const [id, p] of vertices) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const q = vertices.get(key(p.c + dc, p.r + dr));
      if (!q) continue;
      const bridge = p.c === 4 && p.r === 5 && dr === 1;
      if ((p.c === 4 && p.r === 6 || q.c === 4 && q.r === 6) && !bridge) continue;
      edges.push({ p, q, bridge, major: dr === 0 ? [2, 4].includes(p.r) : [0, 3, 5].includes(p.c) });
      if (graph.has(id) && graph.has(q.key)) {
        graph.get(id).push(q);
        graph.get(q.key).push(p);
      }
    }
  }
  return { seed, vertices, graph, edges, paths: new Map(), at: (c, r) => vertices.get(key(c, r)) };
}

export function cityGeometry(seed) {
  if (cached?.seed !== seed) cached = createCity(seed);
  return cached;
}

const plans = [
  ['Старый город', 'home', 'church', 0, 2],
  ['Рынок', 'leisure', 'market', 2, 2],
  ['Вокзал', 'hub', 'station', 5, 2],
  ['Нагорная', 'home', 'villas', 1, 0],
  ['Слобода', 'home', 'tower', -1, 4],
  ['Городской сад', 'leisure', 'garden', 2, 4],
  ['Мануфактура', 'work', 'mill', 4, 3],
  ['Верфь', 'work', 'yard', 5, 4],
  ['Купальни', 'leisure', 'baths', 0, 5],
  ['Маяк', 'leisure', 'lighthouse', 4, 6]
];
export function makeSites(seed) {
  const city = cityGeometry(seed);
  const variation = randomSource(seed ^ 0x91ed);
  return plans.map(([name, kind, landmark, c, r], id) => {
    if (seed !== 1874) {
      if (id === 3 && variation() < .55) c += 1;
      if (id === 4 && variation() < .5) { c += 1; r -= 1; }
      if (id === 5 && variation() < .5) c += 1;
      if (id === 6 && variation() < .45) { c += 2; r -= 1; }
    }
    const p = city.at(c, r);
    return { id, name, kind, landmark, x: p.x, y: p.y, c, r, seed };
  });
}

function trace(city, a, b) {
  const first = key(a.c, a.r), last = key(b.c, b.r);
  const cost = new Map([[first, 0]]), prev = new Map(), queue = [city.vertices.get(first)];
  while (queue.length) {
    queue.sort((l, r) => cost.get(r.key) - cost.get(l.key));
    const p = queue.pop();
    if (p.key === last) break;
    for (const q of city.graph.get(p.key) || []) {
      const next = cost.get(p.key) + Math.hypot(q.x - p.x, q.y - p.y);
      if (next >= (cost.get(q.key) ?? Infinity)) continue;
      cost.set(q.key, next);
      prev.set(q.key, p.key);
      if (!queue.includes(q)) queue.push(q);
    }
  }
  if (!cost.has(last)) throw new Error('Unreachable tram stop: ' + last);
  const points = [];
  for (let id = last; id !== undefined; id = prev.get(id)) {
    const { x, y } = city.vertices.get(id);
    points.unshift({ x, y });
  }
  return points;
}

export function segmentPath(a, b) {
  const city = cityGeometry(a.seed);
  const reverse = a.id > b.id, low = reverse ? b : a, high = reverse ? a : b;
  const id = low.id + ':' + high.id;
  if (!city.paths.has(id)) city.paths.set(id, trace(city, low, high));
  const points = city.paths.get(id);
  return reverse ? points.slice().reverse() : points.slice();
}
