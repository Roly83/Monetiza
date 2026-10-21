// Planta de tratamiento de aguas residuales (biológica): cámara de aireación con soplante,
// decantación, desinfección con cloro (bomba dosificadora) y bomba de descarga al mar.
import { addMotor, addValve, addTank, alarm, log, lag, isOpen, pct, M } from '../core.js';

export const CREW = 25; // personas a bordo
const Q_IN_PP = 0.23 / 86400; // m³/s por persona (aguas negras + grises)
const Q_STPP = 0.003; // m³/s bomba de descarga
const OVF = 0.85; // rebose entre cámaras (fracción)
const CL_RATE = 0.5 / 3600; // l/s de hipoclorito

export const FAULTS = [
  { id: 'stpb', en: 'Sewage plant air blower failure', es: 'Avería de la soplante de la planta de aguas residuales', system: 'sewage' },
  { id: 'stpp', en: 'Sewage discharge pump failure', es: 'Avería de la bomba de descarga de aguas residuales', system: 'sewage' },
  { id: 'stpcl', en: 'Chlorine dosing pump failure', es: 'Avería de la bomba dosificadora de cloro', system: 'sewage' },
];

export function init(p) {
  addTank(p, 'stpAer', { en: 'Aeration chamber (collecting)', es: 'Cámara de aireación (recogida)', cap: 4, level: 4 * OVF, fluid: 'sew' });
  addTank(p, 'stpSet', { en: 'Settling chamber', es: 'Cámara de decantación', cap: 1.5, level: 1.5 * OVF, fluid: 'sew' });
  addTank(p, 'stpCl', { en: 'Disinfection (chlorination) chamber', es: 'Cámara de desinfección (cloración)', cap: 1.2, level: 0.5, fluid: 'sew' });
  addMotor(p, 'stpb', { en: 'Sewage plant air blower', es: 'Soplante de la planta de aguas residuales', kind: 'fan', kw: 5.5, restart: true });
  addMotor(p, 'stpcl', { en: 'Chlorine dosing pump', es: 'Bomba dosificadora de cloro', kw: 0.2, restart: true });
  addMotor(p, 'stpp', { en: 'Sewage discharge pump', es: 'Bomba de descarga de aguas residuales', kw: 4 });
  addValve(p, 'v-stp-ob', { en: 'Sewage overboard valve', es: 'Válvula de descarga al mar de aguas residuales', open: true });
  p.sew = { o2: 2.5, bio: 1, res: 1, chlorine: 60, auto: true, viol: false, flow: 0, discharged: 0, inflow: CREW * Q_IN_PP };
}

const sea = (p) => p.env.seaDistanceNm ?? 30;
const speed = (p) => p.sig.shipSpeed ?? 12;
export const treated = (p) => p.sew.bio > 0.6 && p.sew.res > 0.3;
export const rawDischargeAllowed = (p) => sea(p) > 12 && speed(p) > 4;

export function step(p, dt) {
  const s = p.sew;
  for (const id of ['stpb', 'stpp', 'stpcl']) p.c[id].fault = Boolean(p.faults[id]);
  const aer = p.c.stpAer, set = p.c.stpSet, cl = p.c.stpCl;
  // Entrada de la habilitación y reboses por gravedad entre cámaras.
  aer.level = Math.min(aer.cap, aer.level + s.inflow * dt);
  const ovf = (a, b) => {
    const x = Math.max(0, a.level - a.cap * OVF);
    const q = Math.min(x, x * 0.05 * dt * 10, b.cap - b.level);
    a.level -= q; b.level += q;
  };
  ovf(aer, set);
  ovf(set, cl);
  // Biología: oxígeno disuelto con la soplante, actividad de las bacterias.
  s.o2 = lag(s.o2, p.c.stpb.run ? 2.5 : 0, 300, dt);
  s.bio = lag(s.bio, s.o2 > 1 ? 1 : 0.2, s.o2 > 1 ? 1800 : 3600, dt);
  // Cloración.
  const dosing = p.c.stpcl.run && s.chlorine > 0;
  if (dosing) s.chlorine = Math.max(0, s.chlorine - CL_RATE * dt);
  s.res = lag(s.res, dosing ? 1 : 0, 600, dt);
  // Bomba de descarga controlada por nivel (automático) o a mano.
  const m = p.c.stpp;
  if (s.auto) {
    if (pct(cl) > 80 && !m.cmd && !m.fault) m.cmd = true;
    else if (pct(cl) < 20 && m.cmd) m.cmd = false;
  }
  s.flow = 0;
  let out = 0;
  if (m.run && isOpen(p, 'v-stp-ob')) {
    out = Math.min(Q_STPP * dt, cl.level);
    cl.level -= out;
    s.flow = out / dt;
    s.discharged += out;
  }
  m.load = m.run && s.flow > 0 ? 1 : 0.4;
  // Descarga al mar: tratada en cualquier sitio; sin tratar solo a más de 12 millas y más de 4 nudos.
  const viol = out > 0 && !treated(p) && !rawDischargeAllowed(p);
  if (viol && !s.viol) {
    p.stats.marpol++;
    log(p, 'marpol:sewage', 'Untreated sewage discharged within 12 nm or below 4 kn (MARPOL Annex IV).', 'Aguas residuales sin tratar descargadas a menos de 12 millas o a menos de 4 nudos (MARPOL Anexo IV).');
  }
  s.viol = viol;
  alarm(p, 'stp-marpol', viol, 'Untreated sewage discharge not permitted (MARPOL Annex IV)', 'Descarga de aguas sin tratar no permitida (MARPOL Anexo IV)');
  alarm(p, 'stp-level', pct(aer) > 95, 'Sewage plant high level', 'Nivel alto en la planta de aguas residuales');
  alarm(p, 'stp-blower', p.c.stpb.fault || p.c.stpb.trip, 'Sewage plant blower failure', 'Avería de la soplante de la planta de aguas residuales');
  alarm(p, 'stp-aeration', s.o2 < 0.8, 'Sewage plant aeration failure (low dissolved oxygen)', 'Fallo de aireación de la planta (oxígeno disuelto bajo)');
  alarm(p, 'stp-chlorine', s.chlorine < 5, 'Sewage plant chlorine tank low', 'Nivel bajo de cloro en la planta de aguas residuales', 'warn');
  p.sig.stpTreated = treated(p);
}

export const actions = {
  stpPumpAuto(p, on) {
    p.sew.auto = Boolean(on);
    log(p, `stp-auto:${on ? 'on' : 'off'}`, `Sewage discharge pump in ${on ? 'AUTO (level switches)' : 'MANUAL'}.`, `Bomba de descarga de aguas residuales en ${on ? 'AUTOMÁTICO (interruptores de nivel)' : 'MANUAL'}.`);
    return null;
  },
  stpRefillChlorine(p) {
    if (p.sew.chlorine > 55) return M('Chlorine tank is already full.', 'El tanque de cloro ya está lleno.');
    p.sew.chlorine = 60;
    log(p, 'stp-chlorine-refill', 'Chlorine (hypochlorite) tank refilled.', 'Tanque de cloro (hipoclorito) rellenado.');
    return null;
  },
};

export const STARTUP = [
  { en: 'Sewage plant air blower running (aeration)', es: 'Soplante de la planta de aguas residuales en marcha (aireación)', check: (p) => p.c.stpb.run },
  { en: 'Chlorine dosing pump running', es: 'Bomba dosificadora de cloro en marcha', check: (p) => p.c.stpcl.run },
  { en: 'Sewage discharge pump in AUTO, overboard valve open', es: 'Bomba de descarga en AUTOMÁTICO y válvula al mar abierta', check: (p) => p.sew.auto && isOpen(p, 'v-stp-ob') && !p.c.stpp.fault },
  { en: 'Sewage treatment plant in operation (no alarms)', es: 'Planta de aguas residuales en servicio (sin alarmas)', check: (p) => p.c.stpb.run && p.sew.o2 > 1 && !['stp-level', 'stp-aeration', 'stp-blower'].some((id) => p.alarms[id]?.active) },
];

export const setup = {
  sea(p) { p.c.stpb.cmd = true; p.c.stpcl.cmd = true; },
  port(p) { p.c.stpb.cmd = true; p.c.stpcl.cmd = true; },
  dead(p) {
    // Buque muerto: todo parado desde hace horas; la biología sigue viva pero sin oxígeno.
    for (const id of ['stpb', 'stpcl', 'stpp']) p.c[id].cmd = false;
    p.sew.o2 = 0;
    p.sew.bio = 0.7;
    p.sew.res = 0.5;
    p.c.stpCl.level = 0.7;
  },
};
