import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, actions, run, readings, lamps, esbSource, TRIP_A } from '../js/sim/generator.js';

test('generador en AUTO: apagón → arranca, cierra y alimenta el ESB; al volver el MSB se para', () => {
  const s = createState();
  assert.equal(esbSource(s), 'msb');
  assert.ok(lamps(s).supplyFromMsb && lamps(s).breakerOff);
  actions.blackout(s);
  run(s, 1);
  assert.equal(esbSource(s), null);
  run(s, 10);
  assert.equal(s.engine, 'running');
  assert.ok(s.genBreaker && !s.tieBreaker);
  assert.equal(esbSource(s), 'eg');
  const r = readings(s);
  assert.ok(Math.abs(r.volts - 440) < 1);
  assert.equal(r.kw, 105);
  assert.ok(r.amps > 100 && r.amps < TRIP_A);
  actions.restoreMsb(s);
  run(s, 1);
  assert.ok(!s.genBreaker && s.tieBreaker);
  assert.equal(esbSource(s), 'msb');
  run(s, 12);
  assert.equal(s.engine, 'stopped');
});

test('MANUAL: hay que arrancar y cerrar el interruptor a mano, con bloqueos', () => {
  const s = createState();
  assert.match(actions.breakerOn(s), /AUTO/);
  actions.setMode(s, 'manual');
  assert.match(actions.breakerOn(s), /tensión/);
  actions.startEngine(s);
  run(s, 7);
  assert.match(actions.breakerOn(s), /Bloqueo/); // el MSB ya alimenta el ESB
  actions.blackout(s);
  run(s, 1);
  assert.equal(esbSource(s), null); // en manual nada se cierra solo
  assert.equal(actions.breakerOn(s), null);
  assert.equal(esbSource(s), 'eg');
  assert.match(actions.stopEngine(s), /Abre primero/);
});

test('alimentar el MSB desde el EG dispara por sobrecorriente si no se reduce la carga', () => {
  const s = createState();
  actions.setMode(s, 'manual');
  actions.setTieMode(s, 'emergency');
  actions.blackout(s);
  actions.startEngine(s);
  run(s, 7);
  actions.breakerOn(s);
  run(s, 0.5);
  assert.ok(s.tieBreaker, 'el acoplamiento se cierra para alimentar el MSB');
  assert.ok(readings(s).amps > TRIP_A);
  run(s, 4);
  assert.ok(s.trip && !s.genBreaker && lamps(s).overcurrent);
  assert.match(actions.breakerOn(s), /RESET/);
  actions.reset(s);
  actions.toggleLoad(s, 'auxiliaries'); // se desconectan consumidores no esenciales
  actions.breakerOn(s);
  run(s, 5);
  assert.ok(!s.trip && s.genBreaker && s.tieBreaker);
  assert.ok(readings(s).amps < TRIP_A);
  actions.restoreMsb(s);
  run(s, 0.2);
  assert.ok(!s.tieBreaker, 'al volver la tensión del MSB se abre el acoplamiento');
});

test('selectores de fase y aislamiento', () => {
  const s = createState();
  actions.setMeter(s, 'meterA', 3);
  assert.ok(s.history.has('meterA-L3'));
  actions.insulationFault(s, true);
  run(s, 0.2);
  assert.equal(readings(s).insulation, 80);
  assert.ok(s.history.has('low-insulation'));
});

test('ejercicios: cada uno se prepara y la solución esperada lo completa', async () => {
  const { EXERCISES } = await import('../js/sim/exercises.js');
  const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
  for (const ex of EXERCISES) ex.setup(createState());
  const solve = {
    auto: (s) => { actions.blackout(s); run(s, 10); },
    manual: (s) => { actions.startEngine(s); run(s, 7); actions.breakerOn(s); },
    backfeed: (s) => { actions.toggleLoad(s, 'auxiliaries'); actions.setTieMode(s, 'emergency'); run(s, 1); },
    trip: (s) => { run(s, 4); actions.toggleLoad(s, 'auxiliaries'); actions.toggleLoad(s, 'ltfw'); actions.reset(s); actions.breakerOn(s); run(s, 1); },
  };
  for (const [id, fn] of Object.entries(solve)) {
    const s = createState();
    byId[id].setup(s);
    assert.ok(!byId[id].check(s), `${id} no debe estar resuelto de entrada`);
    fn(s);
    assert.ok(byId[id].check(s), `${id} resuelto`);
  }
});
