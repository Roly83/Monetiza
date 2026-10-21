// Sistema de aire comprimido: compresores principales y de emergencia, botellas de aire de arranque,
// aire de servicio y aire de control.
import { addMotor, addValve, isOpen, alarm, clamp, lag } from '../core.js';

const START_P = { mac1: 25, mac2: 23 }; // arranque en carga de cada compresor (bar)
const STOP_P = 30; // fin de carga (bar)
const RATE = 0.06; // bar/s que aporta un compresor principal a una botella
const EM_RATE = 0.05;

function addReceiver(p, id, en, es, press) {
  p.c[id] = { id, kind: 'receiver', en, es, press, max: 30 };
}

export function init(p) {
  addMotor(p, 'mac1', { en: 'Main air compressor No 1', es: 'Compresor de aire principal nº 1', kind: 'compressor', kw: 45 });
  addMotor(p, 'mac2', { en: 'Main air compressor No 2', es: 'Compresor de aire principal nº 2', kind: 'compressor', kw: 45 });
  addMotor(p, 'eac', { en: 'Emergency air compressor', es: 'Compresor de aire de emergencia', kind: 'compressor', kw: 15, bus: 'ESB', feeder: 'f-eac' });
  for (const id of ['mac1', 'mac2', 'eac']) p.c[id].auto = true; // presostato en automático
  addReceiver(p, 'mr1', 'Main air receiver No 1', 'Botella de aire principal nº 1', 30);
  addReceiver(p, 'mr2', 'Main air receiver No 2', 'Botella de aire principal nº 2', 30);
  addReceiver(p, 'emr', 'Emergency air receiver', 'Botella de aire de emergencia', 30);
  const v = (id, en, es, open = true) => addValve(p, id, { en, es, open });
  v('v-mac-mr1', 'Compressors to receiver 1 valve', 'Válvula compresores → botella 1');
  v('v-mac-mr2', 'Compressors to receiver 2 valve', 'Válvula compresores → botella 2');
  v('v-eac-emr', 'Emergency compressor to emergency receiver valve', 'Válvula compresor de emergencia → botella de emergencia');
  v('v-mr1-me', 'Receiver 1 to main engine starting air valve', 'Válvula botella 1 → aire de arranque del motor principal');
  v('v-mr2-me', 'Receiver 2 to main engine starting air valve', 'Válvula botella 2 → aire de arranque del motor principal');
  v('v-mr1-dg', 'Receiver 1 to diesel generators starting air valve', 'Válvula botella 1 → arranque de los generadores');
  v('v-emr-dg', 'Emergency receiver to diesel generators valve', 'Válvula botella de emergencia → arranque de los generadores', false);
  v('v-service', 'Service air reducing valve', 'Válvula reductora de aire de servicio');
  v('v-control', 'Control air valve (dryer)', 'Válvula de aire de control (secador)');
  v('v-mr1-drain', 'Receiver 1 drain valve', 'Purga de la botella 1', false);
  v('v-mr2-drain', 'Receiver 2 drain valve', 'Purga de la botella 2', false);
  p.airWater = { mr1: 0, mr2: 0 }; // agua condensada en las botellas (0..1)
}

export const FAULTS = [
  { id: 'mac1', en: 'Main air compressor No 1 failure', es: 'Avería del compresor principal nº 1', system: 'air' },
  { id: 'mac2', en: 'Main air compressor No 2 failure', es: 'Avería del compresor principal nº 2', system: 'air' },
  { id: 'eac', en: 'Emergency air compressor failure', es: 'Avería del compresor de emergencia', system: 'air' },
  { id: 'air-leak', en: 'Air leak on receiver No 1', es: 'Fuga de aire en la botella nº 1', system: 'air' },
];

// Consume aire de arranque de la mejor botella abierta hacia ese consumidor. Devuelve la presión antes del consumo.
export function drawAir(p, line, bar) {
  const src = sources(p, line).sort((a, b) => b.press - a.press)[0];
  if (!src) return 0;
  const before = src.press;
  src.press = Math.max(0, src.press - bar);
  return before;
}

function sources(p, line) {
  const list = line === 'me'
    ? [['mr1', 'v-mr1-me'], ['mr2', 'v-mr2-me']]
    : line === 'dg' ? [['mr1', 'v-mr1-dg'], ['emr', 'v-emr-dg']]
      : [['mr1', 'v-service'], ['mr2', 'v-service']];
  return list.filter(([, v]) => isOpen(p, v)).map(([r]) => p.c[r]);
}
const linePress = (p, line) => Math.max(0, ...sources(p, line).map((r) => r.press));

export function step(p, dt) {
  for (const id of ['mac1', 'mac2', 'eac']) p.c[id].fault = Boolean(p.faults[id]);
  const mr1 = p.c.mr1, mr2 = p.c.mr2, emr = p.c.emr;

  // Compresores principales con presostato: cargan por debajo de su presión de arranque hasta 30 bar.
  const targets = [['v-mac-mr1', mr1], ['v-mac-mr2', mr2]].filter(([v]) => isOpen(p, v)).map(([, r]) => r);
  const lowest = targets.length ? Math.min(...targets.map((r) => r.press)) : 99;
  for (const id of ['mac1', 'mac2']) {
    const m = p.c[id];
    if (!m.run) { m.loaded = false; m.load = 1; continue; }
    if (!m.auto) m.loaded = lowest < STOP_P;
    else if (lowest < START_P[id]) m.loaded = true;
    else if (lowest >= STOP_P) m.loaded = false;
    m.load = m.loaded ? 1 : 0.3;
    if (m.loaded && targets.length) for (const r of targets) r.press += (RATE / targets.length) * dt;
  }
  // Compresor de emergencia (desde el cuadro de emergencia): llena la botella de emergencia.
  const e = p.c.eac;
  if (e.run) {
    const room = isOpen(p, 'v-eac-emr');
    if (!e.auto) e.loaded = room && emr.press < STOP_P;
    else if (emr.press < 25) e.loaded = room;
    else if (emr.press >= STOP_P) e.loaded = false;
    e.load = e.loaded ? 1 : 0.3;
    if (e.loaded) emr.press += EM_RATE * dt;
  } else { e.loaded = false; }

  // Consumos continuos: aire de servicio y de control.
  if (isOpen(p, 'v-service')) {
    const s = sources(p, 'service').sort((a, b) => b.press - a.press)[0];
    if (s) s.press -= 0.004 * dt;
  }
  if (isOpen(p, 'v-control')) { const s = mr1.press > mr2.press ? mr1 : mr2; s.press -= 0.002 * dt; }
  if (p.faults['air-leak']) mr1.press -= 0.05 * dt;

  // Purgas y condensado: el agua se acumula con los compresores cargando y se quita purgando.
  for (const [r, drain] of [['mr1', 'v-mr1-drain'], ['mr2', 'v-mr2-drain']]) {
    const loading = ['mac1', 'mac2'].some((id) => p.c[id].loaded);
    p.airWater[r] = clamp(p.airWater[r] + (loading ? 0.0004 * dt : 0) - (p.c[drain].open ? 0.05 * dt : 0), 0, 1);
    if (p.c[drain].open) p.c[r].press -= 0.15 * dt;
    alarm(p, `air-water-${r}`, p.airWater[r] > 0.6, `High water level in ${p.c[r].en.toLowerCase()}: drain it`, `Mucho condensado en la ${p.c[r].es.toLowerCase()}: púrgala`, 'warn');
  }

  for (const r of [mr1, mr2, emr]) {
    if (r.press > 33) r.press = 32; // válvula de seguridad
    r.press = clamp(r.press, 0, 33);
  }

  p.sig.meStartAir = linePress(p, 'me');
  p.sig.dgStartAir = linePress(p, 'dg');
  p.sig.serviceAir = isOpen(p, 'v-service') ? Math.min(7, linePress(p, 'service')) : 0;
  p.sig.controlAir = lag(p.sig.controlAir ?? 7, isOpen(p, 'v-control') ? Math.min(7, Math.max(mr1.press, mr2.press)) : 0, 2, dt);

  alarm(p, 'air-mr1-low', mr1.press < 15, 'Main air receiver No 1 low pressure', 'Presión baja en la botella de aire nº 1');
  alarm(p, 'air-mr2-low', mr2.press < 15, 'Main air receiver No 2 low pressure', 'Presión baja en la botella de aire nº 2');
  alarm(p, 'air-control-low', p.sig.controlAir < 5, 'Control air low pressure', 'Presión baja del aire de control');
  alarm(p, 'air-mac-fault', p.c.mac1.fault || p.c.mac2.fault, 'Main air compressor failure', 'Avería de un compresor de aire principal');
}

export const actions = {
  compAuto(p, id, auto) {
    p.c[id].auto = auto;
    return null;
  },
};

export const setup = {
  sea(p) { p.c.mac1.cmd = true; p.c.mac2.standby = false; p.c.mac2.cmd = true; },
  port(p) { p.c.mac1.cmd = true; p.c.mac2.cmd = true; },
  dead(p) {
    p.c.mr1.press = 4;
    p.c.mr2.press = 3;
    p.c.emr.press = 6;
    p.c.eac.cmd = false;
  },
};
