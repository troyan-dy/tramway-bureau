import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, advance, buildStop, setRoute, buyTram, setFare, routeQuote, restoreGame, RULES } from '../src/sim.js';

function extend(game) {
  assert.ok(buildStop(game, 2).ok);
  assert.ok(setRoute(game, 0, [0, 1, 2]).ok);
}

function conserved(g) {
  const arrived = g.stats.walked + g.stats.delivered;
  assert.equal(g.stats.spawned, arrived + g.people.length);
  assert.equal(g.stats.delivered, g.stats.bySite.reduce((n, s) => n + s.tram, 0));
  assert.equal(g.stats.delivered, g.stats.byLine.reduce((n, l) => n + l.delivered, 0));
  for (const v of g.vehicles) {
    assert.equal(v.load, g.people.filter(p => p.state === 'ride' && p.vehicle === v.id).length);
    assert.ok(v.load <= v.capacity);
  }
}

test('contracts charge for new construction once, including reverse travel', () => {
  const g = newGame();
  const initial = g.cash;
  assert.equal(setRoute(g, 0, [0, 2]).ok, false);
  assert.equal(buildStop(g, 0).ok, false);
  assert.equal(buyTram(g, 1).ok, false);
  assert.equal(g.cash, initial);
  assert.ok(buildStop(g, 2).ok);
  const quote = routeQuote(g, 0, [0, 1, 2]);
  assert.ok(quote > 0);
  assert.ok(setRoute(g, 0, [0, 1, 2]).ok);
  assert.equal(g.cash, initial - RULES.stopCost - quote);
  assert.equal(routeQuote(g, 1, [2, 1, 0]), 0);
  assert.ok(setRoute(g, 1, [2, 1, 0]).ok);
  assert.equal(g.tracks.length, 2);
  assert.ok(buyTram(g, 1).ok);
  assert.ok(g.lines[1].trams === 1);
});

test('a transfer completes a single journey on one fare, with totals conserved', () => {
  const g = newGame();
  extend(g);
  assert.ok(buyTram(g, 0).ok);
  advance(g, 90);
  assert.ok(buildStop(g, 4).ok);
  assert.ok(setRoute(g, 1, [4, 0]).ok);
  assert.ok(buyTram(g, 1).ok);
  advance(g, 110);
  assert.ok(buyTram(g, 0).ok);
  assert.ok(buyTram(g, 1).ok);
  advance(g, 100);
  conserved(g);
  assert.ok(g.stats.transfers > 0);
  assert.equal(g.stats.revenue, g.stats.delivered * 2);
  assert.ok(g.ended && g.won);
  assert.equal(g.stats.grants, 3 * RULES.grant);
  assert.deepEqual(g, restoreGame(g));
});

test('replacing an occupied line puts its passengers back onto valid journeys', () => {
  const g = newGame();
  advance(g, 2);
  assert.ok(g.vehicles[0].load > 0);
  for (const id of [6, 7]) assert.ok(buildStop(g, id).ok);
  assert.ok(setRoute(g, 0, [6, 7]).ok);
  advance(g, 20);
  assert.ok([6, 7].includes(g.vehicles[0].from));
  assert.ok([6, 7].includes(g.vehicles[0].to));
  conserved(g);
  assert.ok(restoreGame(g));
});

test('saving in motion preserves passenger decisions, service and demand RNG', () => {
  const a = newGame(8);
  extend(a);
  assert.ok(buyTram(a, 0).ok);
  advance(a, 35.016);
  const b = restoreGame(JSON.stringify(a));
  assert.deepEqual(a, b);
  for (let i = 0; i < 24; i++) {
    advance(a, 1.25);
    advance(b, 1.25);
  }
  assert.deepEqual(a, b);
  conserved(b);
  const broken = JSON.parse(JSON.stringify(a));
  broken.vehicles[0].line = 10;
  assert.equal(restoreGame(broken), null);
  assert.equal(restoreGame('{'), null);
});

test('fare, added service and replay produce distinguishable shift outcomes', () => {
  const idle = newGame();
  advance(idle, idle.duration);
  assert.ok(idle.ended && !idle.won);
  assert.equal(buildStop(idle, 2).ok, false);
  const play = fare => {
    const g = newGame();
    assert.ok(setFare(g, fare).ok);
    extend(g);
    assert.ok(buyTram(g, 0).ok);
    advance(g, g.duration);
    return g.stats;
  };
  const cheap = play(1), expensive = play(3);
  assert.ok(cheap.delivered > expensive.delivered);
  assert.ok(cheap.revenue < expensive.revenue);
  assert.ok(cheap.delivered > idle.stats.delivered * 2);
  assert.deepEqual(cheap, play(1));
});
