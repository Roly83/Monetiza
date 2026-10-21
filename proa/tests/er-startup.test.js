// Arranque completo del buque: de buque muerto (createSim('dead')) a navegar con el motor principal avante
// en control desde el puente, usando SOLO acciones del operador (act) y tiempo (run), siguiendo PROCEDURE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, run, act, STARTUP, PHASES } from '../js/er/plant.js';
import { PROCEDURE } from '../js/er/procedure.js';

// Vistas del simulador (ids de js/er/views/*.js) donde el alumno hace cada paso.
const VIEW_IDS = ['control', 'bridge', 'dg', 'msb', 'eg', 'esb', 'me', 'sterntube', 'air', 'cooling', 'fuel', 'fcm', 'hfo1', 'hfo2', 'lube', 'lot',
  'melop', 'dglop', 'steam', 'fwg', 'ballast', 'sanitary', 'bilge', 'steering', 'sewage', 'co2', 'mist', 'refrig', 'ac', 'incinerator'];
const DT = 0.2; // paso de integración (s): suficiente para todos los modelos y la prueba va rápida
// Disparos (sev 'trip') aceptables: los del propio buque muerto al empezar (cuadros sin tensión).
const DEAD_SHIP_TRIPS = new Set(['msb-dead', 'esb-dead']);
const activeAlarms = (p) => Object.values(p.alarms).filter((a) => a.active);

test('Procedimiento de arranque: estructura (fases, vistas, textos bilingües)', () => {
  assert.ok(PROCEDURE.length >= 40 && PROCEDURE.length <= 70, `${PROCEDURE.length} pasos`);
  let last = 1;
  for (const s of PROCEDURE) {
    assert.ok(Number.isInteger(s.phase) && s.phase >= 1 && s.phase <= PHASES.length, `fase ${s.phase}`);
    assert.ok(s.phase >= last, `las fases van en orden: ${s.en}`);
    last = s.phase;
    assert.ok(s.en && s.es && s.en !== s.es, `texto bilingüe: ${s.en}`);
    assert.ok(VIEW_IDS.includes(s.view), `vista desconocida '${s.view}' en: ${s.en}`);
    assert.ok(s.do || s.check, `el paso hace o comprueba algo: ${s.en}`);
  }
  for (let ph = 1; ph <= PHASES.length; ph++) assert.ok(PROCEDURE.some((s) => s.phase === ph), `fase ${ph} con pasos`);
});

test('Arranque completo: de buque muerto a navegar solo con acciones del operador', () => {
  const p = createSim('dead');
  const trips = new Set();
  const failed = [];
  // run con vigilancia de disparos en cada paso de integración
  const runW = (q, seconds) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      run(q, DT, DT);
      for (const a of activeAlarms(q)) if (a.sev === 'trip') trips.add(a.id);
    }
  };
  // act que exige que la acción se acepte (null)
  const actW = (q, name, ...args) => {
    const r = act(q, name, ...args);
    if (r) failed.push(`${name}(${args.join(', ')}): ${r.en}`);
    return r;
  };
  for (const [i, s] of PROCEDURE.entries()) {
    s.do?.(p, actW, runW);
    assert.deepEqual(failed, [], `paso ${i + 1} (${s.en}): acción rechazada`);
    if (s.check) assert.ok(s.check(p), `paso ${i + 1} sin cumplir a los ${(p.t / 60).toFixed(1)} min: ${s.en}`);
  }
  const tStartup = p.t;
  // Tiempo realista: de buque muerto a navegar con HFO, entre 1 y 3 horas simuladas.
  assert.ok(tStartup > 3600 && tStartup < 3 * 3600, `duración ${(tStartup / 60).toFixed(0)} min`);
  // Navegando 30 min más: la planta queda estable.
  runW(p, 1800);

  // Todos los hitos de la lista de arranque (plant.js) cumplidos.
  const missing = STARTUP.filter((s) => !s.check(p)).map((s) => `F${s.phase} ${s.en}`);
  assert.deepEqual(missing, [], 'hitos sin cumplir');
  // Motor principal avante, en control desde el puente.
  assert.equal(p.me.state, 'running');
  assert.equal(p.me.control, 'bridge');
  assert.equal(p.sig.meControl, 'BRIDGE');
  assert.ok(p.sig.meRpm >= 50, `rpm ${p.sig.meRpm}`);
  assert.ok(p.sig.shipSpeed > 10, `velocidad ${p.sig.shipSpeed}`);
  assert.ok(!p.me.slowdown && !p.me.shutdown);
  // Sin alarmas activas al final (ninguna es aceptable navegando).
  assert.deepEqual(activeAlarms(p).map((a) => a.id), []);
  // Ningún disparo salvo los cuadros sin tensión del buque muerto inicial; sin apagones, malas
  // sincronizaciones, disparos de protecciones ni infracciones MARPOL.
  assert.deepEqual([...trips].filter((id) => !DEAD_SHIP_TRIPS.has(id)), []);
  assert.deepEqual(p.stats, { badSync: 0, blackouts: 0, marpol: 0, trips: 0 });
  assert.ok(!p.history.has('me-cold-start'), 'el motor no arranca en frío');
  assert.ok(!p.history.has('alarm:fcm-grad'), 'cambio a HFO sin choque térmico');
});
