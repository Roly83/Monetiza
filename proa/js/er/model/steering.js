// Servomotor (steering gear): dos unidades de bomba hidráulica (nº 1 desde el MSB, nº 2 desde el ESB),
// cada una con su tanque de aceite y su válvula de aislamiento; timón con velocidad SOLAS
// (35° a una banda → 30° a la otra en menos de 28 s con una bomba), control local NFU y rumbo del buque.
import { addMotor, addValve, addTank, alarm, log, clamp, isOpen, pct, standbyPair, M } from '../core.js';

export const RATE_ONE = 2.45; // °/s con una bomba
export const MAX_RUDDER = 35;
const LOW = 60, LOWLOW = 35; // % de nivel de los tanques: alarma y aislamiento automático

export function init(p) {
  addMotor(p, 'sgp1', { en: 'Steering gear pump No 1', es: 'Bomba del servomotor nº 1', kw: 30, restart: true });
  addMotor(p, 'sgp2', { en: 'Steering gear pump No 2', es: 'Bomba del servomotor nº 2', kw: 30, bus: 'ESB', feeder: 'f-sg2', restart: true });
  addTank(p, 'sgTank1', { en: 'Steering gear oil tank No 1', es: 'Tanque de aceite hidráulico nº 1', cap: 0.4, level: 0.34, fluid: 'lo' });
  addTank(p, 'sgTank2', { en: 'Steering gear oil tank No 2', es: 'Tanque de aceite hidráulico nº 2', cap: 0.4, level: 0.34, fluid: 'lo' });
  addValve(p, 'sg-iso1', { en: 'Hydraulic system No 1 isolating valve', es: 'Válvula de aislamiento del sistema hidráulico nº 1', open: true });
  addValve(p, 'sg-iso2', { en: 'Hydraulic system No 2 isolating valve', es: 'Válvula de aislamiento del sistema hidráulico nº 2', open: true });
  p.sg = { rudder: 0, helm: 0, mode: 'remote', nfu: 0, heading: 90, failT: 0, moving: false };
}

export const FAULTS = [
  { id: 'sgp1', en: 'Steering gear pump No 1 failure', es: 'Avería de la bomba del servomotor nº 1', system: 'steering' },
  { id: 'sg-leak', en: 'Steering gear hydraulic oil leak (system No 1)', es: 'Fuga de aceite hidráulico del servomotor (sistema nº 1)', system: 'steering' },
];

// Bombas que mueven el timón de verdad: en marcha, sistema abierto y con aceite.
export const effectivePumps = (p) => [1, 2].filter((n) => p.c[`sgp${n}`].run && isOpen(p, `sg-iso${n}`) && pct(p.c[`sgTank${n}`]) > 10);

export function step(p, dt) {
  const sg = p.sg;
  p.c.sgp1.fault = Boolean(p.faults.sgp1);
  // Fuga en el sistema nº 1: pierde más con la bomba en marcha (presión); se para al aislarlo.
  if (p.faults['sg-leak'] && isOpen(p, 'sg-iso1')) p.c.sgTank1.level = Math.max(0, p.c.sgTank1.level - (p.c.sgp1.run ? 0.0005 : 0.0001) * dt);
  // Aislamiento automático por nivel muy bajo (SOLAS: sistema con fuga aislado, el otro sigue gobernando).
  for (const n of [1, 2]) {
    const v = p.c[`sg-iso${n}`];
    if (v.open && pct(p.c[`sgTank${n}`]) < LOWLOW) {
      v.open = false;
      v.pos = 0;
      log(p, `sg-iso${n}-auto`, `Steering gear hydraulic system No ${n} automatically isolated (low-low oil level).`, `Sistema hidráulico nº ${n} del servo aislado automáticamente (nivel muy bajo).`);
    }
  }
  const eff = effectivePumps(p);
  standbyPair(p, ['sgp1', 'sgp2'], [1, 2].some((n) => p.c[`sgp${n}`].run) && !eff.length, 'Steering gear', 'Servomotor');

  // Orden al timón: desde el puente (seguimiento) o local NFU en el local del servo.
  const target = sg.mode === 'local' ? (sg.nfu ? sg.nfu * MAX_RUDDER : sg.rudder) : sg.helm;
  const rate = RATE_ONE * eff.length;
  const err = target - sg.rudder;
  const move = Math.sign(err) * Math.min(Math.abs(err), rate * dt);
  sg.rudder = clamp(sg.rudder + move, -MAX_RUDDER, MAX_RUDDER);
  sg.moving = Math.abs(move) > 1e-4;
  for (const n of [1, 2]) p.c[`sgp${n}`].load = sg.moving && eff.includes(n) ? 1 : 0.35;

  // Rumbo del buque: la caída depende del timón y de la velocidad.
  const spd = p.sig.shipSpeed ?? 0;
  sg.heading = (sg.heading + 0.0012 * sg.rudder * spd * dt + 360) % 360;

  // Alarmas
  // Fallo de seguimiento: el timón está lejos de la orden y no se mueve hacia ella (una orden de banda a banda
  // tarda hasta ~29 s con una bomba y no debe dar alarma mientras el timón va siguiendo).
  sg.failT = sg.mode === 'remote' && Math.abs(sg.helm - sg.rudder) > 5 && !sg.moving ? sg.failT + dt : 0;
  alarm(p, 'sg-follow', sg.failT > 12, 'Steering gear failure: rudder not following helm order', 'Fallo del servo: el timón no sigue a la orden');
  for (const n of [1, 2]) {
    const m = p.c[`sgp${n}`];
    alarm(p, `sg-p${n}-fail`, m.fault || m.trip || (m.cmd && !m.run && !m.restartDelay), `Steering gear pump No ${n} failure / power failure`, `Fallo de la bomba del servo nº ${n} / falta de tensión`);
    alarm(p, `sg-tank${n}-low`, pct(p.c[`sgTank${n}`]) < LOW, `Steering gear oil tank No ${n} low level`, `Nivel bajo del tanque de aceite del servo nº ${n}`);
    alarm(p, `sg-iso${n}`, !isOpen(p, `sg-iso${n}`), `Steering gear hydraulic system No ${n} isolated`, `Sistema hidráulico nº ${n} del servo aislado`, 'warn');
  }
  alarm(p, 'sg-nopump', !eff.length && Math.abs(spd) > 3, 'No steering gear pump available (ship under way)', 'Ninguna bomba del servo disponible (buque navegando)');
  alarm(p, 'sg-local', sg.mode === 'local', 'Steering gear in local control', 'Servomotor en control local', 'warn');

  p.sig.rudderAngle = sg.rudder;
  p.sig.helmOrder = sg.helm;
  p.sig.heading = sg.heading;
}

export const actions = {
  // Orden de timón desde el puente (grados, + estribor / − babor).
  sgHelm(p, deg) {
    const d = clamp(Math.round(Number(deg) || 0), -MAX_RUDDER, MAX_RUDDER);
    if (p.sg.helm !== d) log(p, `sg-helm-${d}`, `Helm order ${Math.abs(d)}° ${d < 0 ? 'port' : d > 0 ? 'starboard' : 'midships'}.`, `Orden de timón ${Math.abs(d)}° ${d < 0 ? 'a babor' : d > 0 ? 'a estribor' : 'a la vía'}.`);
    p.sg.helm = d;
    return null;
  },
  sgMode(p, mode) {
    if (!['remote', 'local'].includes(mode)) return M('Unknown mode.', 'Modo desconocido.');
    if (p.sg.mode !== mode) log(p, `sg-mode-${mode}`, `Steering gear in ${mode === 'local' ? 'LOCAL (NFU)' : 'REMOTE (bridge)'} control.`, `Servo en control ${mode === 'local' ? 'LOCAL (NFU)' : 'REMOTO (puente)'}.`);
    p.sg.mode = mode;
    p.sg.nfu = 0;
    return null;
  },
  // Mando local NFU (no seguimiento): -1 babor, 0 parar, +1 estribor.
  sgNfu(p, dir) {
    if (p.sg.mode !== 'local') return M('Select LOCAL control in the steering gear room first.', 'Selecciona primero control LOCAL en el local del servo.');
    p.sg.nfu = Math.sign(dir);
    return null;
  },
};

export const setup = {
  sea(p) { p.c.sgp1.cmd = true; p.c.sgp2.standby = true; },
  port() {},
  dead() {},
};
