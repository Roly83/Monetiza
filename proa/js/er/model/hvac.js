// Planta frigorífica de gambuzas (cámaras de provisiones) y aire acondicionado de la habilitación.
// Cámaras con termostato y válvula solenoide, compresores con condensador refrigerado por agua BT,
// desescarche por resistencias y UTA (unidad de tratamiento de aire) con compresor de expansión directa.
import { addMotor, addValve, alarm, log, lag, clamp, isOpen, standbyPair, M } from '../core.js';

// Cámaras: consigna, diferencial, alarma alta (y baja), desescarche.
export const ROOMS = [
  { id: 'meat', en: 'Meat room', es: 'Cámara de carne', sp: -20, diff: 1.5, high: -12, low: -30, defrost: true },
  { id: 'fish', en: 'Fish room', es: 'Cámara de pescado', sp: -20, diff: 1.5, high: -12, low: -30, defrost: true },
  { id: 'veg', en: 'Vegetable room', es: 'Cámara de verduras', sp: 4, diff: 1, high: 8, low: 0, defrost: false },
  { id: 'dairy', en: 'Dairy room', es: 'Cámara de lácteos', sp: 2, diff: 1, high: 6, low: -1, defrost: false },
];
const TAU_LEAK = 21600; // s: entrada de calor por el aislamiento
const COOL = 0.008; // °C/s de un evaporador limpio con refrigerante
const DEFROST_EVERY = 6 * 3600; // s
const DEFROST_TIME = 20 * 60; // s
const HP_TRIP = 19; // bar
const AC_SP = 22;

export function init(p) {
  p.hvac = {
    rooms: Object.fromEntries(ROOMS.map((r, i) => [r.id, { temp: r.sp + 0.4 * i, sp: r.sp, frost: 0.1, defrostT: 0, nextDefrost: DEFROST_EVERY * (0.5 + 0.25 * i), cooling: false }])),
    rf: { hp: 11, lp: 1.2 },
    ac: { temp: AC_SP, sp: AC_SP, cap: 0.35, hp: 12, supply: 16 },
  };
  addMotor(p, 'rcomp1', { en: 'Provision refrigeration compressor No 1', es: 'Compresor frigorífico de gambuzas nº 1', kind: 'compressor', kw: 15, restart: true });
  addMotor(p, 'rcomp2', { en: 'Provision refrigeration compressor No 2', es: 'Compresor frigorífico de gambuzas nº 2', kind: 'compressor', kw: 15, restart: true });
  addMotor(p, 'acc', { en: 'AC compressor', es: 'Compresor del aire acondicionado', kind: 'compressor', kw: 45, restart: true, feeder: 'f-ac' });
  addMotor(p, 'ahu', { en: 'AHU supply fan', es: 'Ventilador de la unidad de tratamiento de aire (UTA)', kind: 'fan', kw: 11, restart: true });
  addValve(p, 'rf-cw', { en: 'Refrigeration condenser cooling water valve', es: 'Válvula de agua de refrigeración del condensador frigorífico', open: true });
  addValve(p, 'ac-cw', { en: 'AC condenser cooling water valve', es: 'Válvula de agua de refrigeración del condensador del AC', open: true });
  for (const r of ROOMS) addValve(p, `rs-${r.id}`, { en: `${r.en} solenoid valve`, es: `Válvula solenoide de la ${r.es.toLowerCase()}` });
  p.c.acc.interlock = (q) => (!q.c.ahu.run ? M('Start the AHU fan first (no air flow over the cooling coil).', 'Arranca primero el ventilador de la UTA (sin caudal de aire por la batería).') : null);
}

export const FAULTS = [
  { id: 'rcomp1', en: 'Refrigeration compressor No 1 failure', es: 'Avería del compresor frigorífico nº 1', system: 'hvac' },
  { id: 'rcomp2', en: 'Refrigeration compressor No 2 failure', es: 'Avería del compresor frigorífico nº 2', system: 'hvac' },
  { id: 'rf-cond', en: 'Refrigeration condenser: no cooling water', es: 'Condensador frigorífico sin agua de refrigeración', system: 'hvac' },
  { id: 'rf-defrost', en: 'Defrost timer failure (evaporators icing up)', es: 'Fallo del temporizador de desescarche (evaporadores con hielo)', system: 'hvac' },
  { id: 'acc', en: 'AC compressor failure', es: 'Avería del compresor del aire acondicionado', system: 'hvac' },
  { id: 'ahu', en: 'AHU fan failure', es: 'Avería del ventilador de la UTA', system: 'hvac' },
];

// Presión de condensación: depende del agua de refrigeración (BT) y de la carga.
function condenser(p, valve, fault, load, hp, dt) {
  const flow = isOpen(p, valve) && !fault ? (p.sig.ltFlow ?? 1) : 0;
  const cwT = p.sig.ltTemp ?? 36;
  const target = load > 0 ? 8 + 0.1 * cwT + 3 * load + (1 - clamp(flow, 0, 1)) * 18 : 6 + 0.05 * cwT;
  return lag(hp, target, 20, dt);
}

export function step(p, dt) {
  const hv = p.hvac;
  for (const id of ['rcomp1', 'rcomp2', 'acc', 'ahu']) p.c[id].fault = Boolean(p.faults[id]);

  // ---------- Planta frigorífica ----------
  standbyPair(p, ['rcomp1', 'rcomp2'], false, 'Provision refrigeration compressors', 'Compresores frigoríficos de gambuzas');
  const comps = ['rcomp1', 'rcomp2'].map((id) => p.c[id]).filter((m) => m.run);
  const amb = p.env.ambient - 5; // pasillo de gambuzas
  let calling = 0;
  for (const r of ROOMS) {
    const st = hv.rooms[r.id];
    const v = p.c[`rs-${r.id}`];
    // Desescarche por temporizador (cámaras de congelados).
    if (r.defrost && !p.faults['rf-defrost']) {
      if (st.defrostT > 0) {
        st.defrostT -= dt;
        st.frost = Math.max(0, st.frost - dt / 600);
        if (st.defrostT <= 0) { st.defrostT = 0; st.nextDefrost = DEFROST_EVERY; }
      } else if ((st.nextDefrost -= dt) <= 0) startDefrost(p, r);
    }
    // Termostato: abre la solenoide por encima de consigna + diferencial, cierra en la consigna.
    if (st.defrostT > 0) v.open = false;
    else if (st.temp > st.sp + r.diff) v.open = true;
    else if (st.temp < st.sp) v.open = false;
    v.pos = v.open ? 1 : 0;
    if (v.open) calling++;
    const cap = comps.length ? Math.min(1.3, 0.85 + 0.45 * (comps.length - 1)) : 0;
    const hpDerate = clamp(1 - (hv.rf.hp - 14) / 8, 0, 1);
    st.cooling = v.open && cap > 0;
    const cool = st.cooling ? COOL * cap * hpDerate * (1 - 0.7 * st.frost) : 0;
    if (st.cooling) st.frost = Math.min(1, st.frost + dt / (10 * 3600));
    const heater = st.defrostT > 0 ? 0.001 : 0;
    st.temp += ((amb - st.temp) / TAU_LEAK - cool + heater) * dt;
    alarm(p, `rf-high-${r.id}`, st.temp > r.high, `${r.en} high temperature`, `Temperatura alta en la ${r.es.toLowerCase()}`, 'alarm');
    alarm(p, `rf-low-${r.id}`, st.temp < r.low, `${r.en} low temperature`, `Temperatura baja en la ${r.es.toLowerCase()}`, 'warn');
  }
  // Compresores: con todas las solenoides cerradas aspiran en vacío (pump-down) y descargan.
  for (const m of [p.c.rcomp1, p.c.rcomp2]) m.load = m.run ? (calling ? 1 : 0.1) : 1;
  const rfLoad = comps.length && calling ? calling / ROOMS.length : 0;
  hv.rf.hp = condenser(p, 'rf-cw', p.faults['rf-cond'], rfLoad, hv.rf.hp, dt);
  hv.rf.lp = lag(hv.rf.lp, comps.length ? (calling ? (['meat', 'fish'].some((id) => p.c[`rs-${id}`].open) ? 1.2 : 3.2) : 0.4) : 4, 10, dt);
  if (hv.rf.hp > HP_TRIP) {
    for (const m of comps) { m.trip = true; p.stats.trips++; log(p, `rf-hp-trip:${m.id}`, `${m.en} tripped on high condensing pressure.`, `${m.es}: disparo por alta presión de condensación.`); }
  }
  alarm(p, 'rf-hp', hv.rf.hp > 16, 'Refrigeration plant high condensing pressure', 'Alta presión de condensación en la planta frigorífica', 'alarm');
  alarm(p, 'rf-comp-trip', p.c.rcomp1.trip || p.c.rcomp2.trip, 'Refrigeration compressor tripped', 'Compresor frigorífico disparado', 'trip');
  alarm(p, 'rf-comp-fault', p.c.rcomp1.fault || p.c.rcomp2.fault, 'Refrigeration compressor failure', 'Avería de un compresor frigorífico', 'alarm');

  // ---------- Aire acondicionado ----------
  const ac = hv.ac;
  const acc = p.c.acc, ahu = p.c.ahu;
  if (acc.run && !ahu.run) { acc.cmd = false; log(p, 'ac-lp-stop', 'AC compressor stopped: low suction pressure (AHU fan stopped).', 'Compresor del AC parado: baja presión de aspiración (ventilador de la UTA parado).'); }
  // Control de capacidad (descargadores) proporcional a la temperatura de retorno.
  const capT = acc.run ? clamp(0.3 + 0.35 * (ac.temp - ac.sp), 0, 1) : 0;
  ac.cap = lag(ac.cap, capT, 30, dt);
  acc.load = acc.run ? Math.max(0.15, ac.cap) : 1;
  ac.hp = condenser(p, 'ac-cw', false, acc.run ? ac.cap : 0, ac.hp, dt);
  if (acc.run && ac.hp > HP_TRIP) { acc.trip = true; p.stats.trips++; log(p, 'ac-hp-trip', 'AC compressor tripped on high condensing pressure.', 'Compresor del AC: disparo por alta presión de condensación.'); }
  const hpDerate = clamp(1 - (ac.hp - 14) / 8, 0, 1);
  ac.supply = ahu.run ? ac.temp - 15 * (acc.run ? ac.cap * hpDerate : 0) : ac.temp;
  const out = p.env.ambient + 3; // carga interna (personas, alumbrado, sol)
  ac.temp += ((out - ac.temp) / 1800 + (ahu.run ? (ac.supply - ac.temp) / 600 : 0)) * dt;
  alarm(p, 'ac-temp-high', ac.temp > 28, 'Accommodation high temperature (AC plant)', 'Temperatura alta en la habilitación (aire acondicionado)', 'warn');
  alarm(p, 'ac-hp', ac.hp > 16, 'AC plant high condensing pressure', 'Alta presión de condensación en el aire acondicionado', 'alarm');
  alarm(p, 'ac-trip', acc.trip || acc.fault || ahu.fault, 'AC plant trip / failure', 'Disparo o avería del aire acondicionado', 'alarm');

  p.sig.accomTemp = ac.temp;
  p.sig.provTemps = Object.fromEntries(ROOMS.map((r) => [r.id, hv.rooms[r.id].temp]));
}

function startDefrost(p, r) {
  const st = p.hvac.rooms[r.id];
  st.defrostT = DEFROST_TIME;
  log(p, `rf-defrost:${r.id}`, `${r.en}: defrost started (20 min).`, `${r.es}: desescarche iniciado (20 min).`);
}

export const actions = {
  rfSetpoint(p, id, sp) {
    const r = ROOMS.find((x) => x.id === id);
    p.hvac.rooms[id].sp = clamp(sp, r.sp - 6, r.sp + 6);
    return null;
  },
  rfDefrost(p, id) {
    const r = ROOMS.find((x) => x.id === id);
    if (!r.defrost) return M('This room has no defrost heaters (air defrost).', 'Esta cámara no tiene resistencias de desescarche (desescarche por aire).');
    if (p.hvac.rooms[id].defrostT > 0) return null;
    startDefrost(p, r);
    return null;
  },
  acSetpoint(p, sp) { p.hvac.ac.sp = clamp(sp, 18, 27); return null; },
};

function running(p) {
  p.c.rcomp1.cmd = true;
  p.c.rcomp2.standby = true;
  p.c.ahu.cmd = true;
  p.c.acc.cmd = true;
}
export const setup = {
  sea: running,
  port: running,
  dead(p) {
    // Buque muerto desde hace unas horas: cámaras algo calientes y habilitación a temperatura ambiente.
    for (const r of ROOMS) p.hvac.rooms[r.id].temp = r.sp + (r.defrost ? 5 : 2);
    p.hvac.ac.temp = p.env.ambient;
  },
};

export const STARTUP = [
  { en: 'Refrigeration condenser cooling water open (LT available)', es: 'Agua de refrigeración del condensador frigorífico abierta (BT disponible)', check: (p) => isOpen(p, 'rf-cw') && (p.sig.ltFlow ?? 1) > 0.3 },
  { en: 'Provision refrigeration compressor running, the other in standby', es: 'Compresor frigorífico en marcha y el otro en reserva', check: (p) => (p.c.rcomp1.run && p.c.rcomp2.standby) || (p.c.rcomp2.run && p.c.rcomp1.standby) },
  { en: 'AC plant running (AHU fan and compressor)', es: 'Aire acondicionado en marcha (ventilador de la UTA y compresor)', check: (p) => p.c.ahu.run && p.c.acc.run },
];
