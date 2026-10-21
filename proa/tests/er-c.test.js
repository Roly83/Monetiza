// Pruebas del grupo C: combustible, aceite lubricante y vapor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act, setFault } from '../js/er/plant.js';
const runPlant = run;
import { isAlarm } from '../js/er/core.js';
import * as electrical from '../js/er/model/electrical.js';
import { purState, STARTUP as FUEL_SU } from '../js/er/model/fuel.js';
import { STARTUP as LUBE_SU } from '../js/er/model/lube.js';
import { STARTUP as STEAM_SU } from '../js/er/model/steam.js';
import groupC from '../js/er/scenarios/c.js';

const MINE = /^(fo-|fcm-|pur-|lo-|stm-|stby-(fsp1|fcp1|melp1|bfp1))/;
const myAlarms = (p) => Object.values(p.alarms).filter((a) => a.active && MINE.test(a.id)).map((a) => a.id);

// Ejecuta minuto a minuto comprobando los objetivos como lo hace la interfaz (con «hold»).
function solve(sc, script, maxMin) {
  const p = createSim(sc.setup);
  sc.prepare(p);
  const done = sc.goals.map(() => false);
  const hold = sc.goals.map(() => 0);
  for (let t = 0; t < maxMin * 60; t += 1) {
    script(p, t);
    run(p, 1);
    sc.goals.forEach((g, i) => {
      if (done[i]) return;
      if (g.check(p)) { hold[i] += 1; if (hold[i] >= (g.hold ?? 0)) done[i] = true; } else hold[i] = 0;
    });
    const f = sc.fail?.(p);
    assert.equal(f, null, `${sc.id}: ${f?.en}`);
    if (done.every(Boolean)) return { p, t };
  }
  assert.fail(`${sc.id}: objetivos sin cumplir ${sc.goals.filter((_, i) => !done[i]).map((g) => g.en).join(' | ')}`);
}
const ok = (r) => assert.equal(r, null, r?.en);

test('C · navegando: 30 min estables sin alarmas de combustible, aceite y vapor', () => {
  const p = createSim('sea');
  for (let m = 0; m < 30; m++) {
    run(p, 60);
    assert.deepEqual(myAlarms(p), [], `min ${m + 1}`);
  }
  assert.ok(p.sig.meFuelOk && p.sig.dgFuelOk && p.sig.meLoOk);
  assert.equal(p.sig.meFuelType, 'HFO');
  assert.ok(p.sig.meFuelVisc > 11 && p.sig.meFuelVisc < 15, `visc ${p.sig.meFuelVisc}`);
  assert.ok(p.sig.meFuelPress > 8, `fuel press ${p.sig.meFuelPress}`);
  assert.ok(Math.abs(p.sig.meLoTemp - 45) < 3 && p.sig.meLoPress > 2.4);
  assert.ok(p.sig.steamPress > 6 && p.sig.steamPress < 8 && p.sig.steamAvail === 1);
  assert.equal(purState(p, 'hfop1'), 'separating');
  assert.ok(!p.history.has('alarm:fcm-grad'));
});

test('C · puerto y buque muerto coherentes', () => {
  const port = createSim('port');
  run(port, 600);
  assert.deepEqual(myAlarms(port), []);
  assert.ok(port.sig.meFuelPress > 8 && port.sig.meLoPress > 2.4 && port.steam.press > 6);
  const dead = createSim('dead');
  run(dead, 120);
  assert.equal(dead.sig.steamPress, 0);
  assert.equal(dead.sig.meFuelOk, false);
  assert.equal(dead.sig.dgFuelOk, true, 'los generadores deben tener diésel en buque muerto');
  assert.ok(dead.sig.doServicePct > 50);
  assert.ok(dead.sig.meFuelVisc > 2 && dead.sig.meFuelType === 'DO');
});

test('C · averías: filtro del FCM, sello de la depuradora, bomba de alimentación y QCV', () => {
  const p = createSim('sea');
  setFault(p, 'fcm-filter', true);
  run(p, 600);
  assert.ok(isAlarm(p, 'fcm-filter-dp'));
  assert.ok(act(p, 'fcmFilterFlush'), 'el contralavado debe fallar con el filtro obstruido');
  ok(act(p, 'fcmFilterBypass', true));
  run(p, 60);
  assert.ok(!isAlarm(p, 'fcm-filter-dp') && p.sig.meFuelPress > 8);

  setFault(p, 'hfop1-seal', true);
  run(p, 5);
  assert.ok(isAlarm(p, 'pur-hfop1-seal'));
  const sl = p.c.sludge.level;
  run(p, 60);
  assert.ok(p.c.sludge.level > sl, 'el aceite va al tanque de lodos');

  setFault(p, 'bfp1', true);
  run(p, 5);
  assert.ok(p.c.bfp2.run, 'arranca la bomba de reserva');

  p.sig.qcvTripped = true; // simula el disparo de las válvulas de cierre rápido
  for (let i = 0; i < 100; i++) { p.sig.qcvTripped = true; run(p, 0.1); }
  assert.equal(p.sig.dgFuelOk, false);
  assert.equal(p.sig.meFuelOk, false);
  for (const id of ['fsp1', 'fsp2', 'fcp1', 'fcp2', 'hfop1', 'hfop2', 'hfotp']) assert.ok(!p.c[id].run, `${id} parada por las QCV`);
  assert.ok(act(p, 'start', 'fsp1'), 'no arranca con las QCV disparadas');
});

test('C · depuradora: descarga automática de lodos y fallo de descarga', () => {
  const p = createSim('sea');
  p.pur.hfop1.next = 5;
  const n = p.pur.hfop1.discharges;
  run(p, 40);
  assert.equal(p.pur.hfop1.discharges, n + 1);
  assert.equal(purState(p, 'hfop1'), 'separating');
  setFault(p, 'hfop1-disch', true);
  ok(act(p, 'purDischarge', 'hfop1'));
  run(p, 15);
  assert.ok(isAlarm(p, 'pur-hfop1-disch'));
});

test('C · práctica: arrancar la depuradora de HFO nº 2', () => {
  const sc = groupC.find((s) => s.id === 'hfo-pur2-start');
  const r = solve(sc, (p, t) => {
    if (t === 0) { ok(act(p, 'open', 'hfop2-suc')); ok(act(p, 'open', 'hfop2-out')); ok(act(p, 'start', 'hfop2')); ok(act(p, 'purHeater', 'hfop2', true)); }
    if (t === 125) ok(act(p, 'purSeal', 'hfop2'));
    if (t === 140) ok(act(p, 'purFeed', 'hfop2', true));
  }, 8);
  assert.ok(r.t < 300);
});

test('C · práctica: cambio de HFO a diésel', () => {
  const sc = groupC.find((s) => s.id === 'fo-changeover');
  solve(sc, (p, t) => {
    if (t === 0) ok(act(p, 'fcmMode', 'temp'));
    if (t === 1) ok(act(p, 'fcmTempSet', 80));
    if (t === 600) ok(act(p, 'fcmChangeover', 'DO'));
  }, 60);
  // Y sin cuidado (modo viscosidad) salta el aviso de gradiente o de viscosidad
  const p = createSim('sea');
  act(p, 'fcmChangeover', 'DO');
  run(p, 1500);
  assert.ok(p.history.has('alarm:fcm-grad') || p.history.has('alarm:fcm-visc-low'));
});

test('C · práctica: disparo de la caldera por nivel muy bajo', () => {
  const sc = groupC.find((s) => s.id === 'blr-llw');
  solve(sc, (p, t) => {
    if (t === 0) { assert.ok(act(p, 'blrReset'), 'no rearma con nivel bajo'); ok(act(p, 'start', 'bfp2')); }
    if (p.steam.burner === 'lockout' && p.steam.level > 35) ok(act(p, 'blrReset'));
  }, 15);
});

test('C · buque muerto → servicios en marcha solo con acciones del operador', () => {
  const p0 = createSim('dead');
  // Simula un generador acoplado y refrigerado (lo hacen los grupos de planta eléctrica y refrigeración).
  const run = (p, secs) => {
    for (let i = 0; i < secs; i++) {
      if (!p.sig.msbLive || p.elec.dg[0].trip) { p.elec.dg[0].trip = null; electrical.setup.port(p); }
      p.elec.dg[0].htTemp = 80;
      runPlant(p, 1);
    }
  };
  const p = p0;
  run(p, 5);
  assert.ok(p.sig.msbLive);
  const all = [...FUEL_SU, ...LUBE_SU, ...STEAM_SU];
  assert.ok(FUEL_SU[0].check(p), 'el servicio de diésel alimenta los generadores desde el principio');
  // Refrigeración (otro grupo): si existe, se pone en marcha para que el enfriador de aceite trabaje
  for (const [a, id] of [['open', 'v-sc-low'], ['start', 'swp1'], ['start', 'ltp1']]) if (p.c[id]) act(p, a, id);
  // Caldera con diésel
  ok(act(p, 'start', 'bfp1'));
  ok(act(p, 'blrFuel', 'DO'));
  ok(act(p, 'blrBurner', true));
  // Aceite del MP
  ok(act(p, 'start', 'melp1'));
  ok(act(p, 'standby', 'melp2', true));
  // FCM circulando con diésel
  for (const id of ['fsp1', 'fcp1']) ok(act(p, 'start', id));
  for (const id of ['fsp2', 'fcp2']) ok(act(p, 'standby', id, true));
  run(p, 60);
  assert.ok(p.sig.meFuelPress > 7 && p.sig.meFuelOk, 'el MP puede arrancar con diésel');
  run(p, 20 * 60);
  assert.ok(p.steam.press > 6, `vapor ${p.steam.press}`);
  ok(act(p, 'standby', 'bfp2', true));
  // Calefacción de tanques
  ok(act(p, 'open', 'v-sett-heat'));
  ok(act(p, 'open', 'v-serv-heat'));
  run(p, 30 * 60);
  // Depuradoras
  for (const id of ['hfop1', 'melop']) {
    ok(act(p, 'open', `${id}-suc`)); ok(act(p, 'open', `${id}-out`)); ok(act(p, 'start', id)); ok(act(p, 'purHeater', id, true));
  }
  run(p, 150);
  for (const id of ['hfop1', 'melop']) ok(act(p, 'purSeal', id));
  run(p, 15);
  for (const id of ['hfop1', 'melop']) ok(act(p, 'purFeed', id, true));
  run(p, 60);
  // Cambio del FCM a HFO con rampa de temperatura
  ok(act(p, 'fcmMode', 'temp'));
  ok(act(p, 'fcmTempSet', 135));
  ok(act(p, 'fcmChangeover', 'HFO'));
  run(p, 90 * 60); // rampa de 1,2 °C/min hasta 135 °C
  ok(act(p, 'fcmMode', 'visc'));
  run(p, 10 * 60);
  for (const s of all) assert.ok(s.check(p), `hito sin cumplir: ${s.en}`);
  assert.ok(!p.history.has('alarm:fcm-grad'));
  assert.deepEqual(myAlarms(p).filter((id) => !id.startsWith('stby-')), []);
});
