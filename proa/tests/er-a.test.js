import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act, MODULES, serialize, restore } from '../js/er/plant.js';
import * as air from '../js/er/model/air.js';
import * as engine from '../js/er/model/engine.js';
import * as steering from '../js/er/model/steering.js';
import scenarios from '../js/er/scenarios/a.js';

const MINE = /^(me-|sg-|st-|stby-sgp)/;
const active = (p) => Object.values(p.alarms).filter((a) => a.active).map((a) => a.id);
const mine = (p) => active(p).filter((id) => MINE.test(id));
const sc = (id) => scenarios.find((s) => s.id === id);
const goalsOk = (p, s) => s.goals.map((g) => Boolean(g.check(p)));

test('ER grupo A: navegando es estable 30 min (motor a 90 rpm desde el puente, servo y bocina)', () => {
  const p = createSim('sea');
  run(p, 1800);
  assert.equal(p.me.state, 'running');
  assert.ok(Math.abs(p.sig.meRpm - 90) < 0.5, `rpm=${p.sig.meRpm}`);
  assert.ok(Math.abs(p.sig.shipSpeed - 13.5) < 0.2, `kn=${p.sig.shipSpeed}`);
  assert.ok(p.sig.mePowerKw > 6000 && p.sig.mePowerKw < 6600);
  assert.equal(p.sig.meControl, 'BRIDGE');
  assert.equal(p.sig.telegraph, 'NFA');
  assert.ok(p.c.sgp1.run && p.c.sgp2.standby);
  assert.ok(p.sig.sternLoOk);
  assert.deepEqual(mine(p), []);
});

test('ER grupo A: servo — tiempo SOLAS 35° Br → 30° Er con una bomba < 28 s; con dos, la mitad', () => {
  const p = createSim('sea');
  act(p, 'sgHelm', -35);
  run(p, 40);
  assert.equal(p.sig.rudderAngle, -35);
  act(p, 'sgHelm', 30);
  let t = 0;
  while (p.sig.rudderAngle < 29.9 && t < 60) { run(p, 0.1); t += 0.1; }
  assert.ok(t <= 28 && t > 20, `t=${t}`);
  act(p, 'start', 'sgp2');
  act(p, 'sgHelm', -35);
  run(p, 0.2);
  t = 0;
  while (p.sig.rudderAngle > -34.9 && t < 60) { run(p, 0.1); t += 0.1; }
  assert.ok(t < 16, `dos bombas t=${t}`);
});

test('ER grupo A: avería de la bomba 1 del servo → alarma y arranca la de reserva', () => {
  const p = createSim('sea');
  p.faults.sgp1 = true;
  run(p, 2);
  assert.ok(mine(p).includes('sg-p1-fail'));
  assert.ok(p.c.sgp2.run, 'la nº 2 en reserva arranca');
  act(p, 'sgHelm', 20);
  run(p, 15);
  assert.ok(Math.abs(p.sig.rudderAngle - 20) < 0.5);
});

test('ER grupo A: cilindro 3 con escape alto → alarma y slowdown a 40 rpm', () => {
  const p = createSim('sea');
  p.faults['me-cyl3'] = true;
  run(p, 120);
  assert.ok(p.history.has('alarm:me-exh-3'));
  assert.ok(p.me.slowdown === 'exh');
  assert.ok(Math.abs(p.sig.meRpm) <= 41, `rpm=${p.sig.meRpm}`);
  // Con la anulación (override) el slowdown no actúa.
  act(p, 'meOverride', true);
  run(p, 30);
  assert.ok(p.sig.meRpm > 60);
});

test('ER grupo A: parada por baja presión de aceite y sobrevelocidad; rearme con palanca en STOP', () => {
  const p = createSim('sea');
  const fakeLo = { step(pp) { if (pp.fakeLo != null) pp.sig.meLoPress = pp.fakeLo; } };
  MODULES.splice(MODULES.indexOf(engine), 0, fakeLo);
  try {
    p.fakeLo = 0.8;
    run(p, 2);
    assert.equal(p.me.shutdown, 'lo');
    assert.ok(active(p).includes('me-shutdown'));
    p.fakeLo = 2.8;
    run(p, 60);
    assert.equal(p.me.state, 'stopped');
    assert.ok(act(p, 'meReset'), 'no rearma con el telégrafo en avante');
    act(p, 'meTelegraph', 'STOP');
    assert.equal(act(p, 'meReset'), null);
    act(p, 'meTelegraph', 'SA');
    run(p, 40);
    assert.equal(p.me.state, 'running');
  } finally { MODULES.splice(MODULES.indexOf(fakeLo), 1); }
});

test('ER grupo A: puerto — enclavamientos de arranque, fallo de arranque sin aire y arranque/inversión', () => {
  const p = createSim('port');
  assert.equal(p.me.state, 'stopped');
  assert.equal(p.sig.meControl, 'ECR');
  act(p, 'meTurningGear', true);
  act(p, 'meTelegraph', 'DSA');
  run(p, 2);
  assert.ok(active(p).includes('me-tel'), 'orden sin contestar');
  act(p, 'meAnswer', 'DSA');
  run(p, 5);
  assert.equal(p.me.state, 'stopped');
  assert.ok(engine.meInterlocks(p).some((m) => /Turning gear/.test(m.en)));
  assert.ok(active(p).includes('me-startblock'));
  act(p, 'meTurningGear', false);
  p.faults['me-startvalve'] = true;
  run(p, 40);
  assert.ok(p.me.startFail, 'tres intentos fallidos');
  delete p.faults['me-startvalve'];
  act(p, 'meReset');
  run(p, 30);
  assert.equal(p.me.state, 'running');
  assert.ok(p.sig.meRpm > 25 && p.sig.meRpm < 31);
  // Inversión: atrás poca (frenado con aire y arranque atrás).
  act(p, 'meTelegraph', 'SAS');
  act(p, 'meAnswer', 'SAS');
  run(p, 60);
  assert.equal(p.me.state, 'running');
  assert.ok(p.sig.meRpm < -35, `rpm=${p.sig.meRpm}`);
  assert.ok(!active(p).includes('me-wrongway'));
});

test('ER grupo A: la partida guarda y recupera el estado del motor y el servo', () => {
  const p = createSim('sea');
  act(p, 'sgHelm', 10);
  run(p, 10);
  const q = restore(serialize(p));
  run(q, 10);
  assert.equal(q.me.state, 'running');
  assert.ok(Math.abs(q.sig.rudderAngle - 10) < 0.1);
});

test('ER grupo A: práctica «arranque desde la ECR y paso al puente» se resuelve con acciones', () => {
  const s = sc('a-me-start');
  const p = createSim(s.setup);
  s.prepare(p);
  assert.ok(!goalsOk(p, s).every(Boolean));
  act(p, 'meTurningGear', false);
  act(p, 'open', 'me-msv');
  act(p, 'meAnswer', 'DSA');
  run(p, 30);
  act(p, 'meTransfer', 'bridge');
  act(p, 'meTransferAccept');
  run(p, 5);
  assert.deepEqual(goalsOk(p, s), s.goals.map(() => true));
  assert.equal(s.fail?.(p) ?? null, null);
});

test('ER grupo A: práctica «fuga en el servo» se resuelve con acciones', () => {
  const s = sc('a-sg-leak');
  const p = createSim(s.setup);
  s.prepare(p);
  run(p, 60);
  act(p, 'start', 'sgp2');
  run(p, 2);
  act(p, 'stop', 'sgp1');
  act(p, 'close', 'sg-iso1');
  act(p, 'sgHelm', 15);
  run(p, 15);
  assert.deepEqual(goalsOk(p, s), s.goals.map(() => true));
  const lvl = p.c.sgTank1.level;
  run(p, 60);
  assert.equal(p.c.sgTank1.level, lvl, 'la fuga se para al aislar');
});

test('ER grupo A: práctica «slowdown por escape alto del cilindro 3» se resuelve con acciones', () => {
  const s = sc('a-me-slowdown');
  const p = createSim(s.setup);
  s.prepare(p);
  run(p, 90);
  assert.ok(p.me.slowdown);
  act(p, 'meCylCut', 3, true);
  run(p, 60);
  assert.equal(act(p, 'meReset'), null);
  run(p, 240);
  const ok = goalsOk(p, s);
  assert.deepEqual(ok, s.goals.map(() => true), `rpm=${p.sig.meRpm} exh=${p.me.exh}`);
});

test('ER grupo A: buque muerto → motor en marcha y control en el puente solo con acciones', () => {
  const p = createSim('dead');
  // Los demás sistemas (refrigeración, aceite, combustible…) se simulan con señales falsas.
  const saved = MODULES.splice(0, MODULES.length, air, engine, steering);
  const fake = { htTemp: 34, htFlow: 0, meLoPress: 0, meFuelOk: false, controlAir: 7, ltFlow: 1, ltTemp: 36, dgFuelOk: true };
  MODULES.unshift({ step(pp) { Object.assign(pp.sig, fake); } });
  try {
    assert.equal(p.me.control, 'ecr');
    assert.ok(p.me.turningGear && !p.c.sgp1.run && !p.c.sgp2.run);
    const done = () => engine.STARTUP.map((m) => Boolean(m.check(p)));
    assert.equal(done()[0], false);
    // Energía: generador de emergencia, compresor de emergencia, generador diésel.
    act(p, 'egStart'); run(p, 8);
    act(p, 'egMode', 'manual'); act(p, 'egBreakerOn'); run(p, 1);
    assert.ok(p.sig.esbLive);
    act(p, 'start', 'eac'); act(p, 'open', 'v-emr-dg');
    run(p, 420);
    act(p, 'dgReset', 1); act(p, 'dgStart', 1); run(p, 10);
    assert.equal(act(p, 'breakerClose', 1), null);
    run(p, 2);
    assert.ok(p.sig.msbLive);
    // Aire de arranque del motor principal.
    act(p, 'start', 'mac1'); act(p, 'start', 'mac2');
    // Bocina y servo.
    act(p, 'start', 'stFill');
    act(p, 'start', 'sgp2');
    act(p, 'start', 'sgp1');
    run(p, 450);
    act(p, 'stop', 'stFill');
    assert.ok(p.sig.msbLive, 'MSB con tensión');
    assert.ok(p.sig.meStartAir > 15, `aire ${p.sig.meStartAir}`);
    act(p, 'sgHelm', 10); run(p, 10);
    assert.ok(Math.abs(p.sig.rudderAngle - 10) < 0.1);
    act(p, 'sgHelm', 0);
    // Motor principal: virador, válvula de arranque y servicios (falsos) listos.
    act(p, 'meTurningGear', false);
    act(p, 'open', 'me-msv');
    act(p, 'meTelegraph', 'DSA');
    act(p, 'meAnswer', 'DSA');
    run(p, 5);
    assert.equal(p.me.state, 'stopped', 'sin aceite ni combustible no arranca');
    Object.assign(fake, { htTemp: 65, htFlow: 1, meLoPress: 2.8, meFuelOk: true });
    run(p, 30);
    assert.equal(p.me.state, 'running');
    act(p, 'meTransfer', 'bridge'); act(p, 'meTransferAccept');
    run(p, 5);
    assert.deepEqual(done(), engine.STARTUP.map(() => true));
    assert.deepEqual(mine(p).filter((id) => !/^(sg-tank|st-)/.test(id)), []);
  } finally {
    MODULES.splice(0, MODULES.length, ...saved);
  }
});
