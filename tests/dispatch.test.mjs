import test from 'node:test';
import assert from 'node:assert/strict';
import {nextShiftAdvice, districtOrder, shiftRecords} from '../src/dispatch.js';
import {newGame, buildStop, setRoute, buyTram, setFare, advance} from '../src/sim.js';

test('importing and reopening a completed shift preserves both the record and its predecessor', () => {
  const final = {ended:true, stats:{delivered:101}};
  assert.deepEqual(shiftRecords(final, undefined, 64), {previous:64, record:101});
  assert.deepEqual(shiftRecords(final, 120, 64), {previous:120, record:120});
  assert.deepEqual(shiftRecords(final, 80, 88), {previous:88, record:101});
  assert.deepEqual(shiftRecords(final, 101, 64, 80), {previous:80, record:101});
  assert.deepEqual(shiftRecords(final, 101, 0, 0), {previous:0, record:101});
  assert.deepEqual(shiftRecords(final, 0, 'invalid', 0), {previous:0, record:101});
  const partial = {ended:false, stats:{delivered:101}};
  assert.deepEqual(shiftRecords(partial, 24, 64), {previous:64, record:24});
});

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
