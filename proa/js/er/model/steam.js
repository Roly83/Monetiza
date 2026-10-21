// Sistema de vapor: caldera auxiliar de mecheros (secuencia del quemador, control de presión todo/nada con
// llama baja/alta), bombas de alimentación, pozo caliente (cascade tank), control de nivel con disparo por
// nivel muy bajo, economizador de gases de escape del motor principal y consumidores de vapor.
import { addMotor, addValve, addTank, isOpen, alarm, log, lag, clamp, transfer, pct, standbyPair, M } from '../core.js';

const CAP_KG_BAR = 80; // kg de vapor por bar de presión (capacidad de almacenamiento de la caldera)
const KG_PER_PCT = 20; // kg de agua por 1 % del nivel visible
const FIRE = { low: 1000, high: 3000 }; // kg/h de vapor
const FEED_MAX = 5000; // kg/h con la válvula de alimentación abierta del todo
const P_ON = 6.5, P_HIGH = 6.8, P_LOWFIRE = 7.1, P_OFF = 7.5;
const PURGE = 30, IGNITION = 5, POSTPURGE = 15;

export const BURNER = {
  off: ['STANDBY', 'En espera'], purge: ['PRE-PURGE', 'Barrido previo'], ignition: ['IGNITION', 'Encendido'],
  low: ['LOW FIRE', 'Llama baja'], high: ['HIGH FIRE', 'Llama alta'], postpurge: ['POST-PURGE', 'Barrido posterior'], lockout: ['LOCKOUT', 'Bloqueo (disparo)'],
};

export function init(p) {
  addMotor(p, 'bfp1', { en: 'Boiler feed water pump No 1', es: 'Bomba de alimentación de la caldera nº 1', kw: 7.5 });
  addMotor(p, 'bfp2', { en: 'Boiler feed water pump No 2', es: 'Bomba de alimentación de la caldera nº 2', kw: 7.5 });
  addMotor(p, 'bfan', { en: 'Boiler forced draught fan', es: 'Ventilador de tiro forzado de la caldera', kind: 'fan', kw: 18 });
  addMotor(p, 'egcp', { en: 'Exhaust gas economizer circulating pump', es: 'Bomba de circulación del economizador', kw: 11 });
  addTank(p, 'hotwell', { en: 'Hot well / cascade tank', es: 'Pozo caliente (tanque de cascada)', cap: 5, level: 3.4, temp: 80, fluid: 'cond' });
  addValve(p, 'v-blr-feed', { en: 'Boiler feed water control valve', es: 'Válvula de control de agua de alimentación', kind: 'cvalve', open: true });
  p.c['v-blr-feed'].auto = true;
  p.c['v-blr-feed'].pos = 0.2;
  const v = (id, en, es, open = true) => addValve(p, id, { en, es, open });
  v('v-blr-feedbyp', 'Feed water bypass (hand) valve', 'Válvula de bypass (manual) de alimentación', false);
  v('v-stm-main', 'Main steam stop valve', 'Válvula principal de salida de vapor');
  v('v-hw-makeup', 'Hot well make-up valve (float)', 'Válvula de reposición del pozo caliente (flotador)');
  v('v-blr-blowdown', 'Boiler blow-down valve', 'Válvula de extracción (purga) de la caldera', false);
  p.steam = {
    press: 7, level: 50, burner: 'off', timer: 0, flame: false, mode: 'auto', on: true, fuel: 'DO', manualFire: 'low',
    lockReason: null, gen: 0, ege: 0, cons: 0, dump: 0, I: 0.2, salinity: 20, fuelLh: 0,
  };
}

export const FAULTS = [
  { id: 'bfp1', en: 'Boiler feed pump No 1 failure', es: 'Avería de la bomba de alimentación nº 1', system: 'steam' },
  { id: 'bfp2', en: 'Boiler feed pump No 2 failure', es: 'Avería de la bomba de alimentación nº 2', system: 'steam' },
  { id: 'bfan', en: 'Boiler FD fan failure', es: 'Avería del ventilador de la caldera', system: 'steam' },
  { id: 'blr-flame', en: 'Burner flame failure (igniter / flame scanner)', es: 'Fallo de llama del quemador (encendedor / detector de llama)', system: 'steam' },
  { id: 'blr-fwcv', en: 'Feed water control valve stuck closed', es: 'Válvula de control de alimentación atascada cerrada', system: 'steam' },
  { id: 'egcp', en: 'Economizer circulating pump failure', es: 'Avería de la bomba de circulación del economizador', system: 'steam' },
];

function lockout(p, reason, en, es) {
  const s = p.steam;
  if (s.burner === 'lockout') return;
  s.burner = 'lockout';
  s.flame = false;
  s.lockReason = { en, es, code: reason };
  s.timer = POSTPURGE;
  log(p, `blr-trip:${reason}`, `Boiler burner trip: ${en}.`, `Disparo del quemador de la caldera: ${es}.`);
}

// Combustible del quemador: diésel del servicio (el HFO frío no se puede quemar).
function burnerFuel(p) {
  const s = p.steam;
  if (p.sig.qcvTripped) return null;
  if (s.fuel === 'HFO') {
    const t = p.c.hfoServ;
    return t && t.level > 0.02 * t.cap && t.temp >= 70 ? t : null;
  }
  const t = p.c.doServ;
  return t && t.level > 0.01 * t.cap ? t : null;
}

export function step(p, dt) {
  const c = p.c, s = p.steam;
  for (const id of ['bfp1', 'bfp2', 'bfan', 'egcp']) c[id].fault = Boolean(p.faults[id]);
  const fan = c.bfan;
  const fuelTank = burnerFuel(p);

  // ---------- Secuencia del quemador ----------
  s.timer = Math.max(0, s.timer - dt);
  switch (s.burner) {
    case 'off':
      if (s.on && s.mode === 'auto' && s.press < P_ON && s.level > 30) {
        fan.cmd = true;
        s.burner = 'purge'; s.timer = PURGE;
      }
      break;
    case 'purge':
      if (!fan.run && s.timer < PURGE - 3) lockout(p, 'fan', 'FD fan not running', 'ventilador parado');
      else if (s.timer <= 0) { s.burner = 'ignition'; s.timer = IGNITION; }
      break;
    case 'ignition':
      if (s.timer <= 0) {
        if (p.faults['blr-flame']) lockout(p, 'flame', 'flame failure on ignition', 'fallo de llama en el encendido');
        else if (!fuelTank) lockout(p, 'fuel', s.fuel === 'HFO' ? 'no fuel / HFO too cold to burn' : 'no fuel', s.fuel === 'HFO' ? 'sin combustible / HFO demasiado frío' : 'sin combustible');
        else { s.flame = true; s.burner = 'low'; s.timer = 10; log(p, 'blr-flame-on', 'Boiler burner: flame established.', 'Quemador de la caldera: llama establecida.'); }
      }
      break;
    case 'low':
    case 'high': {
      if (s.mode === 'auto') {
        if (s.burner === 'low' && s.timer <= 0 && s.press < P_HIGH) s.burner = 'high';
        else if (s.burner === 'high' && s.press >= P_LOWFIRE) s.burner = 'low';
        if (s.press >= P_OFF || !s.on) { s.burner = 'postpurge'; s.flame = false; s.timer = POSTPURGE; }
      } else {
        if (s.timer <= 0) s.burner = s.manualFire;
        if (!s.on) { s.burner = 'postpurge'; s.flame = false; s.timer = POSTPURGE; }
      }
      if (s.flame) {
        if (p.faults['blr-flame']) lockout(p, 'flame', 'flame failure', 'fallo de llama');
        else if (!fan.run) lockout(p, 'fan', 'FD fan stopped', 'ventilador parado');
        else if (!fuelTank) lockout(p, 'fuel', 'no fuel', 'sin combustible');
      }
      break;
    }
    case 'postpurge':
      if (s.timer <= 0) { s.burner = 'off'; fan.cmd = false; }
      break;
    case 'lockout':
      if (s.timer <= 0 && fan.cmd) fan.cmd = false;
      break;
    default:
      s.burner = 'off';
  }
  // Disparos de seguridad
  if (s.flame || s.burner === 'purge' || s.burner === 'ignition') {
    if (s.level < 15) lockout(p, 'llw', 'low-low water level', 'nivel de agua muy bajo');
    else if (s.press > 9) lockout(p, 'hp', 'steam pressure high', 'presión de vapor alta');
  }
  if (s.burner === 'lockout') s.flame = false;

  // ---------- Producción de vapor ----------
  const firing = s.flame && (s.burner === 'low' || s.burner === 'high');
  const coldFactor = s.press < 1 ? 0.35 : 1; // calentando el agua desde frío
  s.gen = firing ? FIRE[s.burner] : 0;
  s.fuelLh = firing ? (s.gen / 14) / (s.fuel === 'HFO' ? 0.98 : 0.85) : 0; // L/h
  if (firing && fuelTank) transfer(fuelTank, null, (s.fuelLh / 1000 / 3600) * dt);
  fan.load = firing ? (s.burner === 'high' ? 1 : 0.6) : 0.5;
  // Economizador de gases de escape (solo con el MP en marcha y circulación)
  const meOn = Boolean(p.sig.meRunning);
  const meKw = Math.max(0, p.sig.mePowerKw ?? 0);
  s.ege = meOn && c.egcp.run ? 0.12 * meKw : 0;

  // ---------- Consumo ----------
  const mainOpen = isOpen(p, 'v-stm-main');
  const base = 250 + (meOn ? 0 : 120); // calefacción de tanques/habilitación + precalentador de agua HT en puerto
  // Otros sistemas pueden declarar su consumo en p.sig.steamUse = { id: kg/h } (calorífero, generador de agua dulce…)
  const others = Object.values(p.sig.steamUse ?? {}).reduce((x, y) => x + (Number(y) || 0), 0);
  const demand = base + (p.fuel?.steamKgH ?? 0) + (p.lube?.steamKgH ?? 0) + others;
  s.cons = mainOpen ? demand * clamp(s.press / 4, 0, 1) : 0;
  // Válvula de descarga (dump) al condensador y válvula de seguridad
  s.dump = clamp((s.press - 7.7) / 0.4, 0, 1) * 3500;
  const safety = s.press > 10 ? 20000 : 0;
  const blow = isOpen(p, 'v-blr-blowdown') ? 1500 : 0;
  const evap = (s.gen + s.ege) * coldFactor;
  s.press = clamp(s.press + ((evap - s.cons - s.dump - safety) / 3600 / CAP_KG_BAR) * dt, 0, 11);
  if (s.press < 0.05 && !firing) s.press = 0;

  // ---------- Agua de alimentación ----------
  const fv = c['v-blr-feed'];
  fv.fault = Boolean(p.faults['blr-fwcv']);
  if (fv.fault) { fv.pos = 0; fv.open = false; }
  else if (fv.auto) {
    const e = 50 - s.level;
    s.I = clamp(s.I + 0.0015 * e * dt, 0, 1);
    fv.pos = clamp(0.08 * e + s.I, 0, 1);
    fv.open = fv.pos > 0.02;
  }
  const pumpsOn = (c.bfp1.run ? 1 : 0) + (c.bfp2.run ? 1 : 0);
  const hw = c.hotwell;
  const hwOk = hw.level > 0.05 * hw.cap;
  const opening = Math.min(1, fv.pos + (isOpen(p, 'v-blr-feedbyp') ? 0.6 : 0));
  const feed = pumpsOn && hwOk ? FEED_MAX * opening * (pumpsOn === 2 ? 1.15 : 1) : 0; // kg/h
  for (const id of ['bfp1', 'bfp2']) c[id].load = c[id].run ? 0.5 + 0.5 * opening : 1;
  const steamOut = s.gen + s.ege; // el agua evaporada sale del colector
  s.level = clamp(s.level + ((feed - steamOut * coldFactor - blow) / 3600 / KG_PER_PCT) * dt, 0, 100);
  if (s.press < 1 && evap > 0) s.level = Math.min(100, s.level + 0.0015 * dt); // dilatación al calentar
  // Pozo caliente: retorno de condensado (95 %) + descarga, reposición por flotador
  transfer(hw, null, (feed / 1000 / 3600) * dt);
  hw.level = Math.min(hw.cap, hw.level + (((s.cons * 0.95 + s.dump) / 1000) / 3600) * dt);
  if (isOpen(p, 'v-hw-makeup') && pct(hw) < 65) hw.level = Math.min(hw.cap, hw.level + (1.5 / 3600) * dt);
  hw.temp = lag(hw.temp, s.cons + s.dump > 100 ? 80 : 40, 1800, dt);
  standbyPair(p, ['bfp1', 'bfp2'], s.level < 35 && pumpsOn > 0, 'Boiler feed pumps', 'Bombas de alimentación de la caldera');
  // Salinidad: sube con la reposición, baja con la extracción
  s.salinity = clamp(s.salinity + (blow ? -0.5 : 0.0005) * dt, 0, 400);

  // ---------- Señales ----------
  p.sig.steamPress = s.press;
  p.sig.steamAvail = mainOpen ? clamp((s.press - 2) / 4, 0, 1) : 0;

  // ---------- Alarmas ----------
  alarm(p, 'stm-lockout', s.burner === 'lockout', `Boiler burner lockout${s.lockReason ? `: ${s.lockReason.en}` : ''}`, `Bloqueo del quemador de la caldera${s.lockReason ? `: ${s.lockReason.es}` : ''}`, 'trip');
  alarm(p, 'stm-level-low', s.level < 30, 'Boiler water level low', 'Nivel de agua bajo en la caldera');
  alarm(p, 'stm-level-ll', s.level < 15, 'Boiler water level LOW-LOW (burner trip)', 'Nivel de agua MUY BAJO en la caldera (disparo del quemador)', 'trip');
  alarm(p, 'stm-level-high', s.level > 80, 'Boiler water level high', 'Nivel de agua alto en la caldera');
  alarm(p, 'stm-press-low', s.on && s.press < 5, 'Steam pressure low', 'Presión de vapor baja');
  alarm(p, 'stm-press-high', s.press > 8.5, 'Steam pressure high', 'Presión de vapor alta');
  alarm(p, 'stm-hw-low', pct(hw) < 20, 'Hot well (cascade tank) low level', 'Nivel bajo en el pozo caliente');
  alarm(p, 'stm-ege-nocirc', meOn && meKw > 500 && !c.egcp.run, 'Exhaust gas economizer: no circulation (soot fire risk)', 'Economizador: sin circulación (riesgo de incendio de hollín)');
  alarm(p, 'stm-salinity', s.salinity > 200, 'Boiler water salinity high: blow down', 'Salinidad alta del agua de la caldera: haz una extracción', 'warn');
}

export const actions = {
  blrBurner(p, on) {
    const s = p.steam;
    s.on = on;
    log(p, `blr-burner:${on ? 'on' : 'off'}`, `Boiler burner switched ${on ? 'ON' : 'OFF'}.`, `Quemador de la caldera ${on ? 'conectado' : 'desconectado'}.`);
    return null;
  },
  blrMode(p, mode) {
    p.steam.mode = mode;
    log(p, `blr-mode:${mode}`, `Boiler control: ${mode.toUpperCase()}.`, `Control de la caldera: ${mode === 'auto' ? 'AUTOMÁTICO' : 'MANUAL'}.`);
    return null;
  },
  // Arranque manual del quemador (en MANUAL)
  blrStart(p) {
    const s = p.steam;
    if (s.burner === 'lockout') return M('Burner in lockout: reset it first.', 'Quemador bloqueado: rearma primero.');
    if (s.burner !== 'off') return null;
    if (s.level < 30) return M('Boiler water level too low to fire.', 'Nivel de agua demasiado bajo para encender.');
    if (!p.c.bfan.run && !p.sig.msbLive) return M('No power for the FD fan.', 'Sin tensión para el ventilador.');
    s.on = true;
    p.c.bfan.cmd = true;
    s.burner = 'purge'; s.timer = PURGE;
    log(p, 'blr-start', 'Boiler burner start sequence (pre-purge).', 'Secuencia de arranque del quemador (barrido previo).');
    return null;
  },
  blrStop(p) {
    const s = p.steam;
    if (['purge', 'ignition', 'low', 'high'].includes(s.burner)) { s.burner = 'postpurge'; s.flame = false; s.timer = POSTPURGE; }
    log(p, 'blr-stop', 'Boiler burner stopped.', 'Quemador de la caldera parado.');
    return null;
  },
  blrFire(p, rate) { p.steam.manualFire = rate; return null; },
  blrFuel(p, fuel) {
    const s = p.steam;
    if (s.flame) return M('Change the burner fuel with the burner stopped.', 'Cambia el combustible del quemador con el quemador parado.');
    s.fuel = fuel;
    log(p, `blr-fuel:${fuel}`, `Boiler burner fuel: ${fuel}.`, `Combustible del quemador: ${fuel === 'DO' ? 'diésel' : 'HFO'}.`);
    return null;
  },
  blrReset(p) {
    const s = p.steam;
    if (s.burner !== 'lockout') return null;
    if (s.level < 30) return M('Cannot reset: water level still low. Restore the boiler level first.', 'No se puede rearmar: el nivel sigue bajo. Recupera primero el nivel de la caldera.');
    if (s.press > 9) return M('Cannot reset: steam pressure high.', 'No se puede rearmar: presión de vapor alta.');
    s.burner = 'off'; s.lockReason = null; s.timer = 0;
    p.c.bfan.cmd = false;
    log(p, 'blr-reset', 'Boiler burner lockout reset.', 'Bloqueo del quemador de la caldera rearmado.');
    return null;
  },
};

export const setup = {
  sea(p) {
    const c = p.c;
    c.bfp1.cmd = c.bfp1.run = true; c.bfp2.standby = true;
    c.egcp.cmd = c.egcp.run = true;
    Object.assign(p.steam, { press: 7.1, level: 50, I: 0.2 });
  },
  port(p) {
    const c = p.c;
    c.bfp1.cmd = c.bfp1.run = true; c.bfp2.standby = true;
    Object.assign(p.steam, { press: 7.0, level: 50, I: 0.25 });
  },
  dead(p) {
    // Caldera fría, sin presión. Quemador desconectado.
    Object.assign(p.steam, { press: 0, level: 45, on: false, burner: 'off', I: 0 });
    p.c.hotwell.temp = 35;
    p.c['v-blr-feed'].pos = 0;
  },
};

export const STARTUP = [
  { en: 'Boiler feed pump running', es: 'Bomba de alimentación de la caldera en marcha', check: (p) => p.c.bfp1.run || p.c.bfp2.run },
  { en: 'Boiler firing', es: 'Caldera encendida', check: (p) => p.steam.flame || p.steam.press > 6 },
  { en: 'Steam pressure above 6 bar', es: 'Presión de vapor por encima de 6 bar', check: (p) => p.steam.press > 6 },
  { en: 'Boiler in AUTOMATIC with feed pump on standby', es: 'Caldera en AUTOMÁTICO con bomba de alimentación en reserva', check: (p) => p.steam.mode === 'auto' && p.steam.on && (p.c.bfp1.standby || p.c.bfp2.standby) },
];
