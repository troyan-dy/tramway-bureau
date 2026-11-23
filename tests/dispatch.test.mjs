import test from 'node:test';
import assert from 'node:assert/strict';
import {nextShiftAdvice, districtOrder} from '../src/dispatch.js';
import {newGame, buildStop, setRoute, buyTram, setFare, advance} from '../src/sim.js';

test('an expensive two-car station line gets a relevant suggestion after a near miss', () => {
  const g = newGame(1874);
  buildStop(g, 2);
  setRoute(g, 0, [0, 1, 2]);
  setFare(g, 3);
  buyTram(g, 0);
  advance(g, g.duration);
  assert.equal(g.stats.delivered, 63);
  assert.equal(g.target, 64);
  assert.equal(g.stats.revenue, 189);
  assert.match(nextShiftAdvice(g), /тариф 2 ₽/);
});

test('a branch to the baths can fulfil the optional district order', () => {
  const g = newGame(1874);
  buildStop(g, 2);
  setRoute(g, 0, [0,1,2]);
  advance(g, 95);
  buildStop(g, g.brief.site);
  setRoute(g, 1, [1, g.brief.site]);
  buyTram(g, 1);
  advance(g, g.duration);
  assert.deepEqual(districtOrder(g), {name:'Купальни', delivered:17, target:8, done:true});
});
