// Pruebas del grupo D: lastre, sentinas/separador, aguas residuales e incinerador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act } from '../js/er/plant.js';
import { SCENARIOS } from '../js/er/scenarios.js';
import { STARTUP as HULL_SU, WELLS, BALLAST } from '../js/er/model/hull.js';
import { STARTUP as SEW_SU } from '../js/er/model/sewage.js';
import { STARTUP as INC_SU } from '../js/er/model/incinerator.js';

const MINE = /^(bl-|hull-|bilge|er-flood|ebs-|ows-|stp-|inc-)/;
const mine = (p) => Object.values(p.alarms).filter((a) => a.active && MINE.test(a.id)).map((a) => a.id);
const sc = (id) => SCENARIOS.find((s) => s.id === id);
function prepared(id) {
  const s = sc(id);
  const p = createSim(s.setup);
  s.prepare(p);
  return { s, p };
}
// Ejecuta en tramos comprobando los objetivos como lo hace la interfaz (con «hold»).
function runGoals(p, s, seconds, state = { done: [], hold: [] }) {
  for (let t = 0; t < seconds; t += 0.5) {
    run(p, 0.5);
    s.goals.forEach((g, i) => {
      if (state.done[i]) return;
      if (g.check(p)) { state.hold[i] = (state.hold[i] ?? 0) + 0.5; if (state.hold[i] >= (g.hold ?? 0)) { state.done[i] = true; p.history.add(`goal:${s.id}:${i}`); } } else state.hold[i] = 0;
    });
  }
  return state;
}

test('D: navegando, 30 min estables sin alarmas de lastre, sentinas, aguas residuales ni incinerador', () => {
  const p = createSim('sea');
  run(p, 1800);
  assert.deepEqual(mine(p), []);
  assert.ok(Math.abs(p.sig.heel) < 0.2, `escora ${p.sig.heel}`);
  assert.ok(p.sig.bilgeMaxPct < 50);
  assert.ok(p.c.stpb.run && p.sew.o2 > 2);
  assert.equal(p.inc.state, 'off');
  assert.equal(p.stats.marpol, 0);
});

test('D: vía de agua en la C. M. → alarma de sentina; la bomba de sentinas la contiene', () => {
  const p = createSim('sea');
  p.faults['er-leak'] = true;
  run(p, 400);
  assert.ok(p.alarms['bilge-bwAft']?.active, 'alarma de nivel alto en la sentina de popa');
  assert.equal(act(p, 'open', 'v-bwAft'), null);
  assert.equal(act(p, 'start', 'bilp'), null);
  run(p, 600);
  assert.ok(!p.alarms['bilge-bwAft']?.active, 'la bomba baja el nivel');
  assert.equal(p.stats.marpol, 0);
});

test('D: aspiración de emergencia sin emergencia es infracción MARPOL; con inundación no', () => {
  let p = createSim('sea');
  act(p, 'open', 'v-ebs');
  run(p, 5);
  assert.equal(p.stats.marpol, 1);
  p = createSim('sea');
  p.faults['er-leak'] = true;
  run(p, 900);
  assert.ok(p.hull.erWater > 0.5 && p.alarms['er-flood']?.active);
  act(p, 'open', 'v-ebs');
  run(p, 120);
  assert.ok(p.hull.erWater < 0.01);
  assert.equal(p.stats.marpol, 0);
});

test('D: lastrar sin BWTS penaliza; con BWTS preparado no', () => {
  let p = createSim('sea');
  for (const id of ['v-bl-sea', 'v-bl-fill', 'vf-blFP']) act(p, 'open', id);
  act(p, 'start', 'bp1');
  run(p, 10);
  assert.equal(p.stats.marpol, 1);
  assert.ok(p.alarms['bl-bwts']?.active);
  p = createSim('sea');
  act(p, 'start', 'bwts');
  run(p, 35);
  for (const id of ['v-bl-sea', 'v-bl-fill', 'vf-blFP']) act(p, 'open', id);
  act(p, 'start', 'bp1');
  const before = p.c.blFP.level;
  run(p, 60);
  assert.ok(p.c.blFP.level > before + 5);
  assert.equal(p.stats.marpol, 0);
  assert.ok(p.hull.trim < 0.6, 'llenar el pique de proa reduce el asiento apopante');
});

test('D: separador — recircula al arrancar, descarga < 15 ppm y no en puerto', () => {
  const p = createSim('sea');
  act(p, 'open', 'v-ows-suc');
  act(p, 'open', 'v-ows-ob');
  assert.equal(act(p, 'start', 'ows'), null);
  run(p, 10);
  assert.equal(p.hull.ows.valve, 'recirc');
  run(p, 120);
  assert.equal(p.hull.ows.valve, 'overboard');
  assert.ok(p.sig.owsPpm < 15);
  p.faults['ows-fouled'] = true;
  run(p, 60);
  assert.equal(p.hull.ows.valve, 'recirc');
  assert.equal(p.stats.marpol, 0);
  // En puerto (a menos de 12 millas): la descarga es infracción.
  const q = createSim('port');
  act(q, 'open', 'v-ows-suc'); act(q, 'open', 'v-ows-ob'); act(q, 'start', 'ows');
  run(q, 150);
  assert.ok(q.stats.marpol >= 1);
});

test('D: aguas residuales — fallo de soplante → alarma de aireación; sin tratar cerca de costa → MARPOL', () => {
  const p = createSim('port');
  p.faults.stpb = true;
  run(p, 5);
  assert.ok(p.alarms['stp-blower']?.active);
  run(p, 600);
  assert.ok(p.alarms['stp-aeration']?.active);
  p.sew.bio = 0.3; p.sew.res = 0;
  act(p, 'stop', 'stpcl');
  act(p, 'stpPumpAuto', false);
  act(p, 'start', 'stpp');
  run(p, 5);
  assert.equal(p.stats.marpol, 1);
});

test('D: incinerador — enclavamientos, fallo de llama y parada por alta temperatura', () => {
  const p = createSim('sea');
  assert.ok(act(p, 'incWasteOil', true), 'no se puede encender el aceite residual parado');
  act(p, 'incDoor', true);
  act(p, 'incLoad');
  assert.ok(act(p, 'incStart'), 'puerta abierta: no arranca');
  act(p, 'incDoor', false);
  p.faults['inc-flame'] = true;
  assert.equal(act(p, 'incStart'), null);
  run(p, 60);
  assert.equal(p.inc.state, 'lockout');
  assert.ok(p.alarms['inc-flame']?.active);
  delete p.faults['inc-flame'];
  act(p, 'incReset');
  assert.equal(act(p, 'incStart'), null);
  run(p, 60);
  assert.equal(p.inc.state, 'firing');
  assert.ok(act(p, 'incDoor', true), 'puerta enclavada en combustión');
});

test('D: práctica «escora de 3°» resoluble con acciones', () => {
  const { s, p } = prepared('ballast-list');
  run(p, 30);
  assert.ok(p.hull.heel < -2.5);
  // Trasiego del costado de babor al de estribor.
  for (const id of ['vs-blWP', 'v-bl-fill', 'vf-blWS']) assert.equal(act(p, 'open', id), null);
  act(p, 'start', 'bp1');
  const st = runGoals(p, s, 600);
  // Se para al quedar adrizado (cuando la escora prevista pasa de cero).
  let t = 0;
  while (p.hull.heel < -0.1 && t < 600) { runGoals(p, s, 5, st); t += 5; }
  act(p, 'ballastSecure');
  runGoals(p, s, 120, st);
  assert.deepEqual(st.done.filter(Boolean).length, s.goals.length, JSON.stringify(st));
  assert.equal(s.fail(p), null);
});

test('D: práctica «sentinas por el separador» resoluble con acciones', () => {
  const { s, p } = prepared('ows-marpol');
  for (const w of WELLS) act(p, 'open', `v-${w.id}`);
  act(p, 'start', 'bilp');
  const st = runGoals(p, s, 900);
  act(p, 'stop', 'bilp');
  for (const w of WELLS) act(p, 'close', `v-${w.id}`);
  act(p, 'open', 'v-ows-suc'); act(p, 'open', 'v-ows-ob');
  assert.equal(act(p, 'start', 'ows'), null);
  runGoals(p, s, 600, st);
  assert.equal(act(p, 'orbEntry'), null);
  act(p, 'stop', 'ows'); act(p, 'close', 'v-ows-ob'); act(p, 'close', 'v-ows-suc');
  runGoals(p, s, 5, st);
  assert.equal(st.done.filter(Boolean).length, s.goals.length, JSON.stringify(st));
  assert.equal(p.stats.marpol, 0);
});

test('D: práctica «quemar lodos» resoluble con acciones', () => {
  const { s, p } = prepared('inc-sludge');
  act(p, 'start', 'incTp');
  act(p, 'start', 'incHeat');
  const st = runGoals(p, s, 400);
  assert.ok(st.done[0], `tanque ${p.c.incWo.level} ${p.c.incWo.temp}`);
  assert.equal(act(p, 'incStart'), null);
  runGoals(p, s, 600, st);
  assert.ok(p.inc.T > 850, `T=${p.inc.T}`);
  assert.equal(act(p, 'incWasteOil', true), null);
  runGoals(p, s, 200, st);
  assert.equal(st.done.filter(Boolean).length, s.goals.length, JSON.stringify(st));
  assert.equal(s.fail(p), null);
  act(p, 'incStop');
  run(p, 2400);
  assert.equal(p.inc.state, 'off');
  assert.ok(!p.c.incFan.run);
});

test('D: puesta en marcha desde buque muerto solo con acciones', (tc) => {
  const p = createSim('dead');
  const all = [...HULL_SU, ...SEW_SU, ...INC_SU];
  assert.ok(!all.every((m) => m.check(p)), 'en buque muerto no está todo listo');
  // Energía (procedimiento del grupo eléctrico): generador de emergencia, aire de emergencia y un generador diésel.
  act(p, 'egStart'); run(p, 8);
  act(p, 'egMode', 'manual'); act(p, 'egBreakerOn'); run(p, 1);
  act(p, 'start', 'eac'); act(p, 'open', 'v-emr-dg'); run(p, 420);
  act(p, 'dgReset', 1); act(p, 'dgStart', 1); run(p, 10);
  act(p, 'breakerClose', 1); run(p, 2);
  // Refrigeración del generador (grupo de refrigeración).
  act(p, 'open', 'v-sc-low'); act(p, 'start', 'swp1'); act(p, 'start', 'ltp1'); act(p, 'start', 'htp1');
  run(p, 5);
  if (!p.sig.msbLive) { tc.skip('sin planta eléctrica (depende de otros grupos)'); return; }
  // Aguas residuales
  act(p, 'start', 'stpb'); act(p, 'start', 'stpcl'); act(p, 'stpPumpAuto', true); act(p, 'open', 'v-stp-ob');
  // Sentinas
  for (const w of WELLS) act(p, 'open', `v-${w.id}`);
  act(p, 'start', 'bilp');
  // Adrizar: trasiego de estribor a babor
  for (const id of ['vs-blWS', 'v-bl-fill', 'vf-blWP']) act(p, 'open', id);
  act(p, 'start', 'bp1');
  let t = 0;
  while (p.hull.heel > 0.3 && t < 900) { run(p, 5); t += 5; }
  act(p, 'ballastSecure');
  run(p, 600);
  act(p, 'stop', 'bilp');
  for (const w of WELLS) act(p, 'close', `v-${w.id}`);
  run(p, 60);
  if (!p.sig.msbLive) { tc.skip('apagón por otros sistemas'); return; }
  for (const m of all) assert.ok(m.check(p), m.en);
  assert.equal(p.stats.marpol, 0);
  assert.ok(BALLAST.every((b) => !p.c[`vs-${b.id}`].open));
});
