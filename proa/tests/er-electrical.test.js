import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act, serialize, restore } from '../js/er/plant.js';
import { connected } from '../js/er/model/electrical.js';

const active = (p) => Object.values(p.alarms).filter((a) => a.active).map((a) => a.id);

test('ER eléctrica: navegando es estable (dos generadores, 60 Hz, ESB desde el MSB)', () => {
  const p = createSim('sea');
  run(p, 600);
  assert.ok(connected(p).length >= 1); // con poca carga el PMS puede parar uno
  assert.ok(Math.abs(p.elec.busF - 60) < 0.3, `f=${p.elec.busF}`);
  assert.ok(p.sig.esbLive && p.elec.eg.tie);
  assert.equal(p.elec.eg.state, 'stopped');
  const el = active(p).filter((id) => /^(dg|eg|msb|esb|pref|batt|charger)/.test(id));
  assert.deepEqual(el, []);
});

test('ER eléctrica: apagón → el generador de emergencia arranca y el PMS recupera la planta', () => {
  const p = createSim('sea');
  p.elec.pms = 'manual';
  act(p, 'breakerOpen', 1);
  act(p, 'breakerOpen', 2);
  run(p, 1);
  assert.equal(p.sig.msbLive, false);
  assert.ok(p.history.has('blackout'));
  run(p, 12);
  assert.ok(p.elec.eg.breaker && p.sig.esbLive, 'el generador de emergencia alimenta el ESB');
  act(p, 'setPms', 'auto');
  run(p, 30);
  assert.ok(connected(p).length >= 1);
  assert.ok(p.elec.eg.tie && !p.elec.eg.breaker, 'el ESB vuelve al MSB');
  run(p, 70);
  assert.equal(p.elec.eg.state, 'stopped', 'el generador de emergencia se para tras enfriarse');
});

test('ER eléctrica: sincronización manual — cierre fuera de fase dispara, en fase acopla', () => {
  const p = createSim('port');
  act(p, 'setPms', 'manual');
  assert.equal(act(p, 'dgStart', 2), null);
  run(p, 10);
  const g = p.elec.dg[1];
  // Gran diferencia de frecuencia: disparo
  for (let i = 0; i < 10; i++) act(p, 'governor', 2, 1);
  run(p, 3);
  assert.ok(act(p, 'breakerClose', 2));
  assert.equal(g.breaker, false);
  assert.equal(p.stats.badSync, 1);
  act(p, 'dgReset', 2);
  // Ajuste fino: ligeramente rápido y cierre con la aguja arriba
  g.f0 = p.elec.busF + 0.1;
  run(p, 3);
  for (let i = 0; i < 400 && Math.abs(g.theta) > 4; i++) run(p, 0.05);
  assert.equal(act(p, 'breakerClose', 2), null);
  assert.ok(g.breaker);
});

test('ER eléctrica: alimentar el MSB desde el generador de emergencia y disparo por sobrecorriente', () => {
  const p = createSim('sea');
  p.elec.pms = 'manual';
  for (const g of p.elec.dg) { g.breaker = false; }
  run(p, 12);
  assert.ok(p.elec.eg.breaker);
  act(p, 'egMode', 'manual');
  act(p, 'egTieMode', 'emergency');
  run(p, 1);
  assert.ok(p.elec.eg.tie && p.sig.msbLive, 'el EG alimenta el MSB');
  // Mucha carga en el MSB: sobrecorriente
  p.feeders['f-deck'].kw = 400;
  run(p, 5);
  assert.ok(p.elec.eg.trip && !p.elec.eg.breaker);
  p.feeders['f-deck'].kw = 0;
  assert.equal(act(p, 'egReset'), null);
  assert.equal(act(p, 'egBreakerOn'), null);
});

test('ER eléctrica: buque muerto — sin aire no arranca un DG; con el compresor de emergencia sí', () => {
  const p = createSim('dead');
  assert.ok(p.sig.esbLive, 'el G. E. arranca solo y da tensión al ESB');
  act(p, 'setPms', 'manual');
  assert.ok(act(p, 'dgStart', 1), 'sin aire de arranque');
  assert.equal(act(p, 'start', 'eac'), null);
  act(p, 'open', 'v-emr-dg');
  run(p, 420);
  assert.ok(p.c.emr.press > 20, `botella de emergencia ${p.c.emr.press}`);
  act(p, 'dgReset', 1);
  assert.equal(act(p, 'dgStart', 1), null);
  run(p, 10);
  assert.equal(act(p, 'breakerClose', 1), null);
  run(p, 2);
  assert.ok(p.sig.msbLive);
});

test('ER: la partida se guarda y se recupera', () => {
  const p = createSim('sea');
  run(p, 30);
  act(p, 'breakerOpen', 2);
  const q = restore(serialize(p));
  assert.equal(q.elec.dg[1].breaker, false);
  assert.ok(q.history instanceof Set);
  run(q, 5);
  assert.ok(q.sig.msbLive);
});
