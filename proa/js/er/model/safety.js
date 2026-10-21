// Seguridad contra incendios de la sala de máquinas: zonas de incendio, detección (alimentada desde el ESB),
// agua nebulizada de aplicación local (water mist), CO2 de inundación total, ventilación de la sala de
// máquinas con sus compuertas cortafuegos y válvulas de cierre rápido (QCV) de combustible.
import { addMotor, addValve, addTank, alarm, log, lag, clamp, feederLive, isOpen, M } from '../core.js';

// Zonas de incendio de la sala de máquinas. mist: tiene sección de agua nebulizada.
export const ZONES = [
  { id: 'dg1', en: 'DG No 1', es: 'Generador nº 1', mist: true },
  { id: 'dg2', en: 'DG No 2', es: 'Generador nº 2', mist: true },
  { id: 'dg3', en: 'DG No 3', es: 'Generador nº 3', mist: true },
  { id: 'purifier', en: 'Purifier room', es: 'Local de depuradoras', mist: true },
  { id: 'boiler', en: 'Boiler front', es: 'Frente de la caldera', mist: true },
  { id: 'incin', en: 'Incinerator', es: 'Incinerador', mist: true },
  { id: 'metop', en: 'Main engine top', es: 'Parte alta del motor principal', mist: true },
  { id: 'workshop', en: 'Workshop', es: 'Taller', mist: false },
];
const zoneById = (id) => ZONES.find((z) => z.id === id);

const ER_BASE = 40; // temperatura de referencia de cada zona sin fuego (°C)
const MIST_USE = 0.002; // m³/s de agua dulce por sección abierta
const CO2_FULL = 100; // % de la batería de botellas
const CO2_TIME = 60; // s de descarga
const CO2_DESIGN = 0.4; // fracción de CO2 en la sala con la descarga completa y la sala cerrada

export function init(p) {
  p.safety = {
    zones: Object.fromEntries(ZONES.map((z) => [z.id, { fire: 0, temp: ER_BASE, smoke: 0, out: false, smokeDet: false, heatDet: false, flameDet: false, autoDone: false, hose: 0 }])),
    detPower: true,
    mist: { mode: 'auto', press: 0 },
    extinguishers: 6,
    co2: { door: false, headcount: false, pilot: false, main: false, bank: CO2_FULL, discharging: false, conc: 0, done: false, ineffectiveLogged: false },
    qcvTripped: false,
    erTemp: 42,
  };
  addMotor(p, 'erf1', { en: 'ER supply fan', es: 'Ventilador de impulsión de la sala de máquinas', kind: 'fan', kw: 30, restart: true });
  addMotor(p, 'erf2', { en: 'ER exhaust fan', es: 'Ventilador de extracción de la sala de máquinas', kind: 'fan', kw: 22, restart: true });
  addMotor(p, 'wmp', { en: 'Water mist pump unit', es: 'Grupo de bombeo de agua nebulizada', kind: 'pump', kw: 30 });
  addTank(p, 'wmTank', { en: 'Water mist FW tank', es: 'Tanque de agua dulce del agua nebulizada', cap: 4, level: 3.6, fluid: 'fw', temp: 30 });
  addValve(p, 'wm-fill', { en: 'Water mist tank filling valve', es: 'Válvula de llenado del tanque de agua nebulizada' });
  for (const z of ZONES.filter((x) => x.mist)) addValve(p, `wm-${z.id}`, { en: `Water mist section valve: ${z.en}`, es: `Válvula de sección de agua nebulizada: ${z.es}` });
  addValve(p, 'erDampers', { en: 'ER ventilation fire dampers', es: 'Compuertas cortafuegos de ventilación de la sala de máquinas', open: true });
  addValve(p, 'erSkylight', { en: 'ER skylight / casing openings', es: 'Lumbrera y aberturas del guardacalor', open: false });
  const fanLock = (p2) => (p2.safety.co2.door || p2.safety.co2.main
    ? M('ER ventilation is interlocked: CO2 release cabinet open or CO2 released. Reset the CO2 system first.', 'Ventilación bloqueada: armario de disparo de CO2 abierto o CO2 descargado. Rearma antes el sistema de CO2.')
    : null);
  p.c.erf1.interlock = fanLock;
  p.c.erf2.interlock = fanLock;
}

export const FAULTS = [
  ...ZONES.map((z) => ({ id: `fire-${z.id}`, en: `Fire: ${z.en}`, es: `Incendio: ${z.es}`, system: 'safety' })),
  { id: 'wmp', en: 'Water mist pump unit failure', es: 'Avería del grupo de bombeo de agua nebulizada', system: 'safety' },
  { id: 'erf-nostop', en: 'ER fans do not stop automatically (CO2 cabinet)', es: 'Los ventiladores no se paran solos al abrir el armario de CO2', system: 'safety' },
  { id: 'fire-det', en: 'Fire detection panel power supply failure', es: 'Fallo de alimentación de la central de detección de incendios', system: 'safety' },
];

const fans = (p) => [p.c.erf1, p.c.erf2];
// Sala de máquinas cerrada: ventiladores parados, compuertas y lumbrera cerradas.
export const erSealed = (p) => !fans(p).some((m) => m.run) && !p.c.erDampers.open && !p.c.erSkylight.open;
const o2 = (p) => 21 * (1 - p.safety.co2.conc);

function startFire(p, z) {
  p.safety.zones[z.id].fire = 0.05;
  log(p, `fire-start:${z.id}`, `Fire started: ${z.en}.`, `Se ha declarado un incendio: ${z.es}.`);
}
function extinguish(p, id, how) {
  const z = p.safety.zones[id];
  z.fire = 0;
  z.out = true;
  z.hose = 0;
  const d = zoneById(id);
  log(p, `fire-out:${id}`, `Fire extinguished (${how[0]}): ${d.en}.`, `Incendio extinguido (${how[1]}): ${d.es}.`);
}

export function step(p, dt) {
  const s = p.safety;
  const c = s.co2;
  p.c.wmp.fault = Boolean(p.faults.wmp);
  s.detPower = feederLive(p, 'f-smoke') && !p.faults['fire-det'];

  // ---------- CO2: puerta del armario, sirena, paro de ventiladores y descarga ----------
  if (c.door && !p.faults['erf-nostop']) for (const m of fans(p)) if (m.cmd) { m.cmd = false; log(p, `co2-fanstop:${m.id}`, `${m.en} stopped by CO2 release cabinet.`, `${m.es}: parado por el armario de disparo de CO2.`); }
  if (c.discharging) {
    const d = Math.min(c.bank, (CO2_FULL / CO2_TIME) * dt);
    c.bank -= d;
    c.conc += (CO2_DESIGN * d) / CO2_FULL;
    if (c.bank <= 0.01) {
      c.bank = 0;
      c.discharging = false;
      log(p, 'co2-discharged', 'CO2 bank fully discharged into the engine room.', 'Batería de CO2 descargada por completo en la sala de máquinas.');
    }
  }
  // Fugas: con la sala abierta el CO2 se va enseguida; cerrada se mantiene horas.
  const vent = fans(p).filter((m) => m.run).length;
  const leakTau = erSealed(p) ? 4 * 3600 : vent && p.c.erDampers.open ? 25 : 15;
  c.conc = Math.max(0, c.conc - (c.conc / leakTau) * dt);
  const O2 = o2(p);

  // ---------- Zonas de incendio ----------
  const mistOk = p.c.wmp.run && p.c.wmTank.level > 0.05;
  let sumFire = 0;
  for (const z of ZONES) {
    const st = s.zones[z.id];
    const fault = Boolean(p.faults[`fire-${z.id}`]);
    if (!fault) st.out = false;
    else if (!st.out && st.fire === 0) startFire(p, z);
    if (st.fire > 0) {
      // Crecimiento logístico limitado por el oxígeno; la ventilación lo aviva.
      const oxy = clamp((O2 - 15) / 6, 0, 1);
      let dI = 0.015 * (vent ? 1.3 : 1) * oxy * st.fire * (1 - st.fire);
      if (O2 < 15) dI -= 0.05 * (15 - O2) / 3;
      const misted = z.mist && mistOk && isOpen(p, `wm-${z.id}`);
      if (misted) dI -= 0.045;
      if (st.hose > 0) {
        st.hose -= dt;
        if ((p.sig.fireMainPress ?? 7) > 4 && st.fire < 0.6) dI -= 0.02;
      }
      st.fire = clamp(st.fire + dI * dt, 0, 1);
      if (st.fire < 0.01) extinguish(p, z.id, misted ? ['water mist', 'agua nebulizada'] : O2 < 15 ? ['CO2 flooding', 'inundación de CO2'] : ['fire hose', 'manguera']);
    }
    const misted = z.mist && mistOk && isOpen(p, `wm-${z.id}`);
    st.temp = lag(st.temp, (misted ? ER_BASE - 8 : ER_BASE) + 420 * st.fire, misted ? 15 : 40, dt);
    st.smoke = lag(st.smoke, st.fire > 0 ? 0.2 + st.fire : 0, st.fire > 0 ? 10 : 90, dt);
    sumFire += st.fire;

    // Detección: humo, calor y llama, solo con la central alimentada.
    st.smokeDet = s.detPower && st.smoke > 0.12;
    st.heatDet = s.detPower && st.temp > 70;
    st.flameDet = s.detPower && st.fire > 0.25;
    const det = st.smokeDet || st.heatDet || st.flameDet;
    alarm(p, `fire-${z.id}`, det, `FIRE ALARM: ${z.en}`, `ALARMA DE INCENDIO: ${z.es}`, 'alarm');

    // Disparo automático del agua nebulizada: coincidencia de llama y calor en la misma zona.
    if (z.mist && s.mist.mode === 'auto' && st.flameDet && st.heatDet && !st.autoDone) {
      st.autoDone = true;
      mistOpen(p, z.id, 'auto');
    }
    if (!st.flameDet && !st.heatDet) st.autoDone = false;
  }

  // ---------- Agua nebulizada: presión y consumo ----------
  const sections = ZONES.filter((z) => z.mist && isOpen(p, `wm-${z.id}`)).length;
  if (p.c.wmp.run && sections) p.c.wmTank.level = Math.max(0, p.c.wmTank.level - MIST_USE * sections * dt);
  if (isOpen(p, 'wm-fill') && (p.sig.fwTankPct ?? 60) > 5) p.c.wmTank.level = Math.min(p.c.wmTank.cap, p.c.wmTank.level + 0.004 * dt);
  s.mist.press = lag(s.mist.press, p.c.wmp.run && p.c.wmTank.level > 0.05 ? (sections ? 90 : 105) : 0, 2, dt);

  // ---------- Temperatura de la sala de máquinas y ventilación ----------
  const heat = (p.sig.msbLive ? 14 : 2) + (p.sig.meRunning ? 10 : 0) + 30 * sumFire;
  const f = !p.c.erDampers.open ? 1.4 : vent === 2 ? 0.3 : vent === 1 ? 0.6 : 1.4;
  s.erTemp = lag(s.erTemp, p.env.ambient + heat * f, 600, dt);

  // ---------- Señales ----------
  const burning = ZONES.filter((z) => s.zones[z.id].fire > 0.02).map((z) => z.id);
  p.sig.fireCount = burning.length;
  p.sig.fireZones = burning;
  p.sig.erVentOn = vent > 0 && p.c.erDampers.open;
  p.sig.co2Released = c.main;
  p.sig.qcvTripped = s.qcvTripped;
  p.sig.erTemp = s.erTemp;
  p.sig.erO2 = O2;

  // CO2 descargado y fuego sin apagar: liberación ineficaz.
  if (c.main && !c.discharging && burning.length && !c.ineffectiveLogged) {
    c.ineffectiveLogged = true;
    log(p, 'co2-ineffective', 'CO2 release INEFFECTIVE: the engine room was not sealed (fans/dampers/skylight).', 'Descarga de CO2 INEFICAZ: la sala de máquinas no estaba cerrada (ventiladores, compuertas o lumbrera).');
  }

  // ---------- Alarmas ----------
  alarm(p, 'fire-det-power', !s.detPower, 'Fire detection system power failure', 'Fallo de alimentación del sistema de detección de incendios', 'alarm');
  alarm(p, 'co2-prealarm', c.door, 'CO2 release cabinet open: pre-alarm siren, evacuate engine room', 'Armario de CO2 abierto: sirena de prealarma, evacuar la sala de máquinas', 'alarm');
  alarm(p, 'co2-er-atmos', c.conc > 0.05, 'CO2 in engine room: DO NOT ENTER', 'CO2 en la sala de máquinas: NO ENTRAR', 'alarm');
  alarm(p, 'qcv-tripped', s.qcvTripped, 'Fuel oil quick-closing valves tripped', 'Válvulas de cierre rápido de combustible disparadas', 'alarm');
  alarm(p, 'wm-released', p.c.wmp.run && sections > 0, 'Water mist system released', 'Sistema de agua nebulizada disparado', 'warn');
  alarm(p, 'wm-pump-fault', p.c.wmp.fault, 'Water mist pump unit failure', 'Avería del grupo de bombeo de agua nebulizada', 'alarm');
  alarm(p, 'wm-tank-low', p.c.wmTank.level < 0.25 * p.c.wmTank.cap, 'Water mist FW tank low level', 'Nivel bajo en el tanque de agua nebulizada', 'warn');
  alarm(p, 'er-temp-high', s.erTemp > 52, 'Engine room high temperature: check ventilation', 'Temperatura alta en la sala de máquinas: comprueba la ventilación', 'warn');
}

// Apertura de una sección de agua nebulizada (pulsador local, remoto o automático).
function mistOpen(p, id, how) {
  const z = zoneById(id);
  const v = p.c[`wm-${id}`];
  v.open = true;
  v.pos = 1;
  p.c.wmp.cmd = true;
  log(p, `wm-release:${id}`, `Water mist released (${how}): ${z.en}.`, `Agua nebulizada disparada (${how === 'auto' ? 'automático' : 'manual'}): ${z.es}.`);
}

export const actions = {
  // Agua nebulizada
  mistMode(p, mode) {
    p.safety.mist.mode = mode;
    log(p, `wm-mode:${mode}`, `Water mist system in ${mode.toUpperCase()}.`, `Agua nebulizada en ${mode === 'auto' ? 'AUTOMÁTICO' : 'MANUAL'}.`);
    return null;
  },
  mistRelease(p, id) {
    const z = zoneById(id);
    if (!z?.mist) return M('This zone has no water mist section.', 'Esta zona no tiene sección de agua nebulizada.');
    mistOpen(p, id, 'manual');
    if (!p.sig.msbLive) return M('Section valve open, but the pump unit has no power (MSB dead).', 'Válvula de sección abierta, pero el grupo de bombeo no tiene tensión (MSB sin tensión).');
    if (p.c.wmp.fault) return M('Section valve open, but the water mist pump unit is faulty.', 'Válvula de sección abierta, pero el grupo de bombeo está averiado.');
    return null;
  },
  mistReset(p) {
    for (const z of ZONES.filter((x) => x.mist)) { const v = p.c[`wm-${z.id}`]; v.open = false; v.pos = 0; }
    p.c.wmp.cmd = false;
    log(p, 'wm-reset', 'Water mist system reset: section valves closed, pump stopped.', 'Agua nebulizada rearmada: válvulas de sección cerradas y bomba parada.');
    return null;
  },
  // Lucha directa contra el fuego
  fireExt(p, id) {
    const z = p.safety.zones[id];
    if (z.fire <= 0) return M('There is no fire in that zone.', 'No hay fuego en esa zona.');
    if (p.safety.co2.conc > 0.05) return M('Do not enter: CO2 in the engine room.', 'No entres: hay CO2 en la sala de máquinas.');
    if (p.safety.extinguishers <= 0) return M('No portable extinguishers left.', 'No quedan extintores portátiles.');
    p.safety.extinguishers--;
    if (z.fire > 0.2) {
      log(p, `fire-ext-fail:${id}`, 'Portable extinguisher used: fire too big.', 'Extintor portátil usado: el fuego es demasiado grande.');
      return M('The fire is too big for a portable extinguisher. Use fixed systems.', 'El fuego es demasiado grande para un extintor portátil. Usa los sistemas fijos.');
    }
    z.fire = Math.max(0, z.fire - 0.15);
    if (z.fire < 0.01) extinguish(p, id, ['portable extinguisher', 'extintor portátil']);
    return null;
  },
  fireHose(p, id) {
    const z = p.safety.zones[id];
    if (z.fire <= 0) return M('There is no fire in that zone.', 'No hay fuego en esa zona.');
    if (p.safety.co2.conc > 0.05) return M('Do not enter: CO2 in the engine room.', 'No entres: hay CO2 en la sala de máquinas.');
    if ((p.sig.fireMainPress ?? 7) < 4) return M('No pressure in the fire main. Start a fire pump.', 'No hay presión en el colector contraincendios. Arranca una bomba C.I.');
    z.hose = 30;
    log(p, `fire-hose:${id}`, 'Fire hose applied for 30 s.', 'Manguera aplicada durante 30 s.');
    return z.fire > 0.6 ? M('The fire is too big to be fought with hoses.', 'El fuego es demasiado grande para combatirlo con mangueras.') : null;
  },
  // Ventilación y cierre rápido
  erVentStop(p) {
    for (const m of fans(p)) m.cmd = false;
    log(p, 'er-vent-stop', 'ER ventilation fans emergency stop.', 'Parada de emergencia de los ventiladores de la sala de máquinas.');
    return null;
  },
  qcvRemoteTrip(p) {
    if (!p.safety.qcvTripped) log(p, 'qcv-trip', 'Fuel oil quick-closing valves tripped from the fire control station.', 'Válvulas de cierre rápido de combustible disparadas desde el puesto de control de incendios.');
    p.safety.qcvTripped = true;
    return null;
  },
  qcvRemoteReset(p) {
    if (p.sig.fireCount) return M('Do not reset the quick-closing valves while the fire is still burning.', 'No rearmes las válvulas de cierre rápido con el fuego activo.');
    if (p.safety.qcvTripped) log(p, 'qcv-reset', 'Fuel oil quick-closing valves reset (open).', 'Válvulas de cierre rápido de combustible rearmadas (abiertas).');
    p.safety.qcvTripped = false;
    return null;
  },
  // Procedimiento de disparo de CO2
  co2Door(p, open) {
    const c = p.safety.co2;
    if (!open && (c.pilot || c.main) && !c.done) return M('Reset the CO2 release first.', 'Rearma primero el disparo de CO2.');
    c.door = open;
    log(p, open ? 'co2-door-open' : 'co2-door-close', open ? 'CO2 release cabinet opened: pre-alarm siren, ER fans stopped.' : 'CO2 release cabinet closed.', open ? 'Armario de disparo de CO2 abierto: sirena de prealarma y paro de ventiladores.' : 'Armario de disparo de CO2 cerrado.');
    return null;
  },
  co2Headcount(p) {
    const c = p.safety.co2;
    if (!c.door) return M('Open the CO2 release cabinet first (pre-alarm siren).', 'Abre primero el armario de disparo de CO2 (sirena de prealarma).');
    c.headcount = true;
    log(p, 'co2-headcount', 'Engine room evacuated: headcount confirmed.', 'Sala de máquinas evacuada: recuento de personal confirmado.');
    return null;
  },
  co2Pilot(p) {
    const c = p.safety.co2;
    if (!c.door) return M('The pilot cylinder valves are inside the release cabinet: open the cabinet.', 'Las válvulas de las botellas piloto están dentro del armario: ábrelo.');
    if (c.bank <= 0) return M('CO2 bank is empty.', 'La batería de CO2 está vacía.');
    if (!c.pilot) log(p, 'co2-pilot', 'CO2 pilot cylinder valves opened.', 'Válvulas de las botellas piloto de CO2 abiertas.');
    c.pilot = true;
    return null;
  },
  co2Main(p) {
    const c = p.safety.co2;
    if (!c.pilot) return M('Open the pilot cylinder valves first.', 'Abre primero las válvulas de las botellas piloto.');
    if (c.main) return null;
    c.main = true;
    c.discharging = true;
    c.ineffectiveLogged = false;
    if (!c.headcount) log(p, 'co2-err-headcount', 'ERROR: CO2 released without confirming the headcount!', 'ERROR: CO2 descargado sin confirmar el recuento de personal.');
    if (!p.safety.qcvTripped) log(p, 'co2-err-qcv', 'ERROR: CO2 released with the fuel quick-closing valves open.', 'ERROR: CO2 descargado con las válvulas de cierre rápido abiertas.');
    if (erSealed(p)) log(p, 'co2-release-sealed', 'CO2 main valve opened: discharge into a sealed engine room.', 'Válvula principal de CO2 abierta: descarga en la sala de máquinas cerrada.');
    else log(p, 'co2-release-unsealed', 'ERROR: CO2 discharged with ventilation running or openings not closed.', 'ERROR: CO2 descargado con ventilación en marcha o aberturas sin cerrar.');
    return null;
  },
  co2Reset(p) {
    const c = p.safety.co2;
    if (c.discharging) return M('CO2 is still discharging.', 'El CO2 todavía se está descargando.');
    c.pilot = false;
    c.main = false;
    c.door = false;
    c.headcount = false;
    c.done = false;
    log(p, 'co2-reset', 'CO2 release reset: valves closed, cabinet closed. Ventilate the engine room before entering.', 'Disparo de CO2 rearmado: válvulas y armario cerrados. Ventila la sala antes de entrar.');
    return null;
  },
  co2Recharge(p) {
    const c = p.safety.co2;
    if (c.main) return M('Reset the CO2 release first.', 'Rearma primero el disparo de CO2.');
    c.bank = CO2_FULL;
    log(p, 'co2-recharge', 'CO2 bank recharged (cylinders replaced).', 'Batería de CO2 recargada (botellas sustituidas).');
    return null;
  },
};

function ready(p) {
  p.c.erf1.cmd = true;
  p.c.erf2.cmd = true;
  p.safety.mist.mode = 'auto';
  p.safety.erTemp = p.env.ambient + 7;
}
export const setup = {
  sea: ready,
  port: ready,
  dead(p) {
    p.safety.mist.mode = 'manual';
    p.safety.erTemp = p.env.ambient + 2;
  },
};

// Hitos de la puesta en servicio (buque muerto → navegando).
export const STARTUP = [
  { en: 'Fire detection system powered', es: 'Sistema de detección de incendios alimentado', check: (p) => p.safety.detPower },
  { en: 'ER fire dampers open and ventilation fans running', es: 'Compuertas abiertas y ventiladores de la sala de máquinas en marcha', check: (p) => p.c.erDampers.open && p.c.erf1.run && p.c.erf2.run },
  { en: 'Water mist system in AUTO standby (power available, tank > 50 %)', es: 'Agua nebulizada en AUTOMÁTICO y lista (tensión y tanque > 50 %)', check: (p) => p.safety.mist.mode === 'auto' && p.sig.msbLive && !p.c.wmp.fault && p.c.wmTank.level > 0.5 * p.c.wmTank.cap },
  { en: 'Fuel quick-closing valves reset (open)', es: 'Válvulas de cierre rápido rearmadas (abiertas)', check: (p) => !p.safety.qcvTripped },
];
