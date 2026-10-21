import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act, MODULES, serialize, restore } from '../js/er/plant.js';
import * as electrical from '../js/er/model/electrical.js';
import * as engine from '../js/er/model/engine.js';
import { STARTUP as COOL_STARTUP } from '../js/er/model/cooling.js';
import { STARTUP as WATER_STARTUP } from '../js/er/model/water.js';
import groupB from '../js/er/scenarios/b.js';

const MINE = /^(cool-|fwg-|san-|stby-(swp|ltp|htp))/;
const mine = (p) => Object.values(p.alarms).filter((a) => a.active && MINE.test(a.id)).map((a) => a.id);

// Sustituye el motor principal por uno simulado (en marcha a una potencia dada) para las pruebas.
function fakeMe(kw) {
  const i = MODULES.indexOf(engine);
  const orig = MODULES[i];
  MODULES[i] = { step(p, dt) { orig.step(p, dt); p.sig.meRunning = kw > 0; p.sig.mePowerKw = kw; } };
  return () => { MODULES[i] = orig; };
}

test('ER-B: navegando es estable 30 min (LT 36 °C, HT 85 °C, FWG produciendo, hidróforo ciclando) sin alarmas', () => {
  const restoreMe = fakeMe(7000);
  try {
    const p = createSim('sea');
    let minP = 9, maxP = 0;
    for (let i = 0; i < 1800; i++) {
      run(p, 1);
      minP = Math.min(minP, p.san.press); maxP = Math.max(maxP, p.san.press);
    }
    assert.deepEqual(mine(p), []);
    assert.ok(Math.abs(p.sig.ltTemp - 36) < 1, `LT ${p.sig.ltTemp}`);
    assert.ok(Math.abs(p.sig.htTemp - 85) < 1.5, `HT ${p.sig.htTemp}`);
    assert.equal(p.sig.swFlow, 1);
    assert.ok(p.sig.fwgProduction > 15 && p.fwg.toTank, `FWG ${p.sig.fwgProduction}`);
    assert.ok(minP > 2.6 && maxP <= 5.2, `hidróforo ${minP}–${maxP}`);
    assert.ok(p.c.calorifier.temp > 50);
    assert.ok(p.sig.fwTankPct > 60);
  } finally { restoreMe(); }
});

test('ER-B: en puerto el agua de camisas se mantiene precalentada (~60 °C) y el FWG parado', () => {
  const p = createSim('port');
  run(p, 1800);
  assert.ok(p.sig.htTemp > 56 && p.sig.htTemp < 66, `HT ${p.sig.htTemp}`);
  assert.equal(p.sig.fwgProduction, 0);
  assert.deepEqual(mine(p), []);
});

test('ER-B: avería de la bomba de mar → arranca la de reserva; fallo de bombas BT → alarma de presión', () => {
  const p = createSim('sea');
  p.faults.swp1 = true;
  run(p, 5);
  assert.ok(p.c.swp2.run, 'la bomba de reserva arranca');
  assert.ok(p.history.has('standby-start:swp2'));
  run(p, 10);
  assert.ok(p.cool.swPress > 1.2);
  p.faults.ltp1 = true;
  p.c.ltp2.standby = false;
  run(p, 10);
  assert.ok(p.alarms['cool-lt-press-low']?.active);
  assert.equal(p.sig.ltFlow < 0.1, true);
});

test('ER-B: sin caudal HT con el motor en marcha sube la temperatura de camisas y salta la alarma', () => {
  const restoreMe = fakeMe(8000);
  try {
    const p = createSim('sea');
    p.c.htp2.standby = false;
    p.faults.htp1 = true;
    run(p, 120);
    assert.ok(p.alarms['cool-ht-temp-high']?.active, `HT ${p.sig.htTemp}`);
  } finally { restoreMe(); }
});

test('ER-B: colector C.I. a ~10 bar con la bomba principal; rotura en máquinas → presión baja', () => {
  const p = createSim('sea');
  assert.equal(act(p, 'start', 'fp1'), null);
  run(p, 10);
  assert.ok(p.sig.fireMainPress > 9 && p.sig.fireMainPress < 11, `${p.sig.fireMainPress}`);
  act(p, 'open', 'v-hyd-er');
  run(p, 5);
  assert.ok(p.sig.fireMainPress > 7);
  p.faults['fire-leak'] = true;
  run(p, 10);
  assert.ok(p.alarms['cool-fire-main-low']?.active);
});

test('ER-B: FWG — avería de salinidad descarga el destilado; pérdida de vacío da alarma', () => {
  const restoreMe = fakeMe(7000);
  try {
    const p = createSim('sea');
    p.faults['fwg-salinity'] = true;
    run(p, 300);
    assert.ok(p.fwg.ppm > 10 && !p.fwg.toTank);
    assert.ok(p.alarms['fwg-sal-high']?.active);
    act(p, 'open', 'v-fwg-air');
    run(p, 300);
    assert.ok(p.alarms['fwg-vac-low']?.active);
    assert.ok(p.fwg.prod < 2);
  } finally { restoreMe(); }
});

test('ER-B: hidróforo anegado (sin aire) → recarga con aire de servicio', () => {
  const p = createSim('sea');
  p.faults['hyd-air'] = true;
  run(p, 1500);
  assert.ok(p.san.air < 4);
  delete p.faults['hyd-air'];
  assert.equal(act(p, 'hydAirCharge'), null);
  run(p, 600);
  assert.ok(p.san.press > 2.6);
});

test('ER-B: guardar y recuperar conserva el estado de refrigeración y agua', () => {
  const p = createSim('sea');
  run(p, 30);
  const q = restore(serialize(p));
  assert.equal(q.cool.ltT, p.cool.ltT);
  assert.equal(q.fwg.vac, p.fwg.vac);
  run(q, 30);
  assert.deepEqual(mine(q), []);
});

// ---------- Prácticas ----------
const sc = (id) => groupB.find((s) => s.id === id);
function solve(id, actions, seconds, meKw = 7000) {
  const restoreMe = fakeMe(meKw);
  try {
    const s = sc(id);
    const p = createSim(s.setup);
    s.prepare(p);
    run(p, 20);
    const done = s.goals.map(() => false);
    const held = s.goals.map(() => 0);
    const check = () => s.goals.forEach((g, i) => {
      if (done[i]) return;
      held[i] = g.check(p) ? held[i] + 1 : 0;
      if (held[i] >= (g.hold ?? 0)) done[i] = true;
    });
    for (const a of actions) {
      if (typeof a === 'number') { for (let t = 0; t < a; t++) { run(p, 1); check(); } continue; }
      assert.equal(act(p, ...a), null, `acción ${a.join(' ')}`);
      check();
    }
    for (let t = 0; t < seconds; t++) { run(p, 1); check(); }
    assert.deepEqual(done, s.goals.map(() => true), `objetivos ${id}`);
    assert.equal(s.fail?.(p) ?? null, null);
  } finally { restoreMe(); }
}

test('ER-B práctica: cambio de toma de mar', () => {
  solve('b-sea-chest', [10, ['open', 'v-sc-high'], ['close', 'v-sc-low'], 10, ['stop', 'swp1'], ['standby', 'swp1', true]], 90);
});

test('ER-B práctica: arrancar el generador de agua dulce', () => {
  solve('b-fwg-start', [['open', 'v-fwg-suc'], ['open', 'v-fwg-ovbd'], ['start', 'fwgEj'], 120, ['open', 'v-fwg-feed'],
    ['open', 'v-fwg-hwout'], ['open', 'v-fwg-hwin'], ['open', 'v-fwg-fillP'], ['start', 'fwgDp']], 420);
});

test('ER-B práctica: bomba C.I. de emergencia', () => {
  solve('b-efp', [5, ['close', 'v-fire-iso'], ['open', 'v-efp-suc'], ['start', 'efp']], 40);
});

// ---------- Puesta en marcha desde buque muerto ----------
test('ER-B: desde buque muerto se ponen en servicio refrigeración, C.I., agua sanitaria y FWG solo con acciones', () => {
  const p = createSim('dead');
  assert.equal(p.cool.swPress, 0);
  assert.ok(!COOL_STARTUP[0].check(p));
  // Simula la planta eléctrica: un generador acoplado (lo hace el grupo eléctrico) y el ESB alimentado.
  electrical.setup.port(p);
  p.elec.eg.tie = true;
  run(p, 2);
  assert.ok(p.sig.msbLive);
  // Sin caudal de camisas el precalentador eléctrico no se puede conectar.
  assert.ok(act(p, 'start', 'htph'));
  for (const a of [['open', 'v-sc-low'], ['start', 'swp1'], ['start', 'ltp1'], ['start', 'htp1']]) assert.equal(act(p, ...a), null, a.join(' '));
  run(p, 20);
  for (const a of [['standby', 'swp2', true], ['standby', 'ltp2', true], ['standby', 'htp2', true], ['start', 'htph']]) assert.equal(act(p, ...a), null, a.join(' '));
  // Colector C.I. y agua sanitaria: aire de servicio para cargar el hidróforo.
  assert.equal(act(p, 'start', 'fp1'), null);
  p.c.mr1.press = 28; // aire de las botellas (lo cargan los compresores del grupo de aire)
  for (const a of [['open', 'v-fwP-out'], ['open', 'v-hyd-out'], ['hydAirCharge'], ['compAuto', 'hyd1', true], ['compAuto', 'hyd2', true], ['compAuto', 'calHeater', true]]) assert.equal(act(p, ...a), null, a.join(' '));
  run(p, 600);
  assert.ok(p.cool.htT > 38, `precalentando ${p.cool.htT}`);
  run(p, 3000);
  const fails = COOL_STARTUP.filter((s) => !s.check(p)).map((s) => s.en);
  assert.deepEqual(fails, []);
  assert.ok(WATER_STARTUP[0].check(p) && WATER_STARTUP[1].check(p), `hidróforo ${p.san.press} calorífero ${p.c.calorifier.temp}`);
  assert.equal(act(p, 'stop', 'fp1'), null);
  // Motor principal en marcha (simulado): FWG.
  const restoreMe = fakeMe(7000);
  try {
    for (const a of [['open', 'v-fwg-suc'], ['open', 'v-fwg-ovbd'], ['start', 'fwgEj']]) assert.equal(act(p, ...a), null);
    run(p, 150);
    for (const a of [['open', 'v-fwg-feed'], ['open', 'v-fwg-hwout'], ['open', 'v-fwg-hwin'], ['open', 'v-fwg-fillP'], ['start', 'fwgDp']]) assert.equal(act(p, ...a), null);
    run(p, 600);
    assert.deepEqual(WATER_STARTUP.filter((s) => !s.check(p)).map((s) => s.en), []);
    assert.deepEqual(mine(p), []);
  } finally { restoreMe(); }
});
