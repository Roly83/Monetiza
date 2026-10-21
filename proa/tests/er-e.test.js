import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act, MODULES } from '../js/er/plant.js';
import * as electrical from '../js/er/model/electrical.js';
import * as safety from '../js/er/model/safety.js';
import * as hvac from '../js/er/model/hvac.js';
import { STARTUP as SAFETY_STARTUP } from '../js/er/model/safety.js';
import { STARTUP as HVAC_STARTUP } from '../js/er/model/hvac.js';
import groupE from '../js/er/scenarios/e.js';

const MINE = /^(fire|co2|qcv|wm-|er-temp|rf-|ac-|stby-rcomp)/;
const active = (p) => Object.values(p.alarms).filter((a) => a.active).map((a) => a.id).filter((id) => MINE.test(id));
const scen = (id) => groupE.find((s) => s.id === id);
const goalsOk = (p, s) => s.goals.map((g) => Boolean(g.check(p)));

test('ER grupo E: navegando es estable 30 min (ventilación, gambuzas y AC)', () => {
  const p = createSim('sea');
  for (let i = 0; i < 6; i++) {
    run(p, 300);
    assert.deepEqual(active(p), [], `t=${p.t}`);
  }
  assert.ok(p.sig.erVentOn);
  assert.equal(p.sig.fireCount, 0);
  assert.equal(p.sig.qcvTripped, false);
  assert.ok(Math.abs(p.sig.accomTemp - 22) < 1, `AC ${p.sig.accomTemp}`);
  assert.ok(p.sig.provTemps.meat < -17 && p.sig.provTemps.veg < 6.5);
  assert.ok(p.safety.erTemp < 48);
});

test('ER grupo E: incendio sin alimentación de la detección no da alarma de fuego', () => {
  const p = createSim('sea');
  act(p, 'feeder', 'f-smoke', false);
  p.faults['fire-workshop'] = true;
  run(p, 60);
  assert.ok(p.safety.zones.workshop.fire > 0.05);
  assert.ok(p.alarms['fire-det-power']?.active);
  assert.ok(!p.alarms['fire-workshop']?.active);
  act(p, 'feeder', 'f-smoke', true);
  run(p, 2);
  assert.ok(p.alarms['fire-workshop']?.active);
});

test('ER grupo E: agua nebulizada en AUTO apaga sola el incendio de un generador', () => {
  const p = createSim('sea');
  p.faults['fire-dg2'] = true;
  run(p, 200);
  assert.ok(p.history.has('alarm:fire-dg2'));
  assert.ok(p.history.has('wm-release:dg2'));
  assert.ok(p.history.has('fire-out:dg2'));
  assert.equal(p.sig.fireCount, 0);
});

test('ER grupo E: avería del condensador frigorífico → disparo por alta presión', () => {
  const p = createSim('sea');
  p.faults['rf-cond'] = true;
  run(p, 900);
  assert.ok(p.history.has('alarm:rf-hp'));
  assert.ok(p.c.rcomp1.trip);
});

test('ER grupo E: práctica de agua nebulizada en el local de depuradoras', () => {
  const s = scen('e-mist-purifier');
  const p = createSim(s.setup);
  s.prepare(p);
  run(p, 30);
  assert.ok(p.alarms['fire-purifier']?.active);
  assert.equal(act(p, 'mistRelease', 'purifier'), null);
  run(p, 60);
  act(p, 'mistReset');
  act(p, 'mistMode', 'auto');
  run(p, 1);
  assert.deepEqual(goalsOk(p, s), [true, true, true, true]);
  assert.equal(s.fail(p), null);
});

test('ER grupo E: práctica de CO2 en orden correcto apaga el fuego', () => {
  const s = scen('e-co2-er');
  const p = createSim(s.setup);
  s.prepare(p);
  run(p, 5);
  assert.ok(act(p, 'co2Main'), 'sin botellas piloto no descarga');
  act(p, 'co2Door', true);
  run(p, 2);
  assert.ok(!p.c.erf1.cmd && !p.c.erf2.cmd, 'ventiladores parados por el armario');
  assert.ok(act(p, 'start', 'erf1'), 'ventilación bloqueada');
  act(p, 'co2Headcount');
  act(p, 'close', 'erDampers');
  act(p, 'close', 'erSkylight');
  act(p, 'qcvRemoteTrip');
  act(p, 'co2Pilot');
  act(p, 'co2Main');
  run(p, 90);
  assert.equal(s.fail(p), null);
  assert.deepEqual(goalsOk(p, s), [true, true, true, true, true]);
  assert.ok(p.sig.co2Released);
  // Después: rearme (la ventilación se prueba aparte, sin depender de la recuperación de la planta).
  assert.equal(act(p, 'co2Reset'), null);
  assert.ok(act(p, 'qcvRemoteReset') === null);
});

// Solo seguridad y HVAC con señales fijas de los demás sistemas (aisla la prueba de los otros grupos).
function isolated(fn) {
  const saved = MODULES.splice(0, MODULES.length, safety, hvac);
  MODULES.unshift({ step(pp) { Object.assign(pp.sig, { ltFlow: 1, ltTemp: 36, fwTankPct: 60, fireMainPress: 7 }); } });
  try { fn(); } finally { MODULES.splice(0, MODULES.length, ...saved); }
}

test('ER grupo E: tras el CO2, rearme y ventilación limpian la atmósfera', () => isolated(() => {
  const p = createSim('sea');
  act(p, 'co2Door', true);
  act(p, 'co2Headcount');
  act(p, 'close', 'erDampers');
  act(p, 'co2Pilot');
  act(p, 'co2Main');
  run(p, 120);
  assert.ok(p.alarms['co2-er-atmos']?.active);
  assert.ok(p.sig.erO2 < 15, `O2 ${p.sig.erO2}`);
  assert.equal(act(p, 'co2Reset'), null);
  act(p, 'open', 'erDampers');
  assert.equal(act(p, 'start', 'erf1'), null);
  act(p, 'start', 'erf2');
  run(p, 300);
  assert.ok(!p.alarms['co2-er-atmos']?.active);
}));

test('ER grupo E: CO2 con las compuertas abiertas es ineficaz', () => {
  const s = scen('e-co2-er');
  const p = createSim(s.setup);
  s.prepare(p);
  act(p, 'co2Door', true);
  act(p, 'co2Headcount');
  act(p, 'qcvRemoteTrip');
  act(p, 'co2Pilot');
  act(p, 'co2Main');
  run(p, 90);
  assert.ok(s.fail(p));
  assert.ok(p.history.has('co2-ineffective'));
  assert.ok(p.sig.fireCount > 0);
});

test('ER grupo E: práctica de avería del compresor frigorífico', () => {
  const s = scen('e-refrig');
  const p = createSim(s.setup);
  s.prepare(p);
  run(p, 10);
  act(p, 'stop', 'rcomp1');
  assert.equal(act(p, 'start', 'rcomp2'), null);
  run(p, 900);
  assert.deepEqual(goalsOk(p, s), [true, true, true, true]);
});

test('ER grupo E: de buque muerto a servicio solo con acciones', () => isolated(() => {
  const p = createSim('dead');
  assert.ok(!p.c.erf1.cmd && !p.c.rcomp1.cmd && !p.c.acc.cmd && !p.c.wmp.cmd);
  assert.equal(p.sig.qcvTripped, false);
  assert.equal(p.sig.fireCount, 0);
  assert.ok(!SAFETY_STARTUP[0].check(p));
  // Planta eléctrica (la hace el grupo eléctrico): un generador acoplado y el ESB alimentado.
  electrical.setup.port(p);
  p.elec.eg.tie = true;
  run(p, 2);
  assert.ok(p.sig.msbLive && SAFETY_STARTUP[0].check(p), 'detección alimentada');
  // Sin ventilación la sala se calienta.
  run(p, 1500);
  assert.ok(p.alarms['er-temp-high']?.active, `ER ${p.safety.erTemp}`);
  assert.equal(act(p, 'start', 'erf1'), null);
  assert.equal(act(p, 'start', 'erf2'), null);
  act(p, 'mistMode', 'auto');
  assert.equal(act(p, 'start', 'rcomp1'), null);
  act(p, 'standby', 'rcomp2', true);
  assert.ok(act(p, 'start', 'acc'), 'el compresor del AC necesita el ventilador de la UTA');
  act(p, 'start', 'ahu');
  run(p, 2);
  assert.equal(act(p, 'start', 'acc'), null);
  run(p, 1800);
  for (const m of [...SAFETY_STARTUP, ...HVAC_STARTUP]) assert.ok(m.check(p), m.en);
  assert.ok(!p.alarms['er-temp-high']?.active);
  assert.ok(p.sig.accomTemp < 27);
}));
