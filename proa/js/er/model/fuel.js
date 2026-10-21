// Sistema de combustible: tanques de almacén, sedimentación y servicio (HFO y diésel), bombas de trasiego,
// depuradoras de HFO nº 1 y nº 2, módulo de acondicionamiento de combustible (booster / FCM) del motor principal,
// consumo del motor principal y de los generadores.
// También exporta el «motor» genérico de depuradora (addPurifier / purifierStep) que usa lube.js.
import { addMotor, addValve, addTank, isOpen, alarm, log, lag, clamp, transfer, pct, standbyPair, M } from '../core.js';

const RHO_HFO = 0.98; // t/m³
const RHO_DO = 0.85;
const SFOC_ME = 175; // g/kWh
const SFOC_DG = 210;
const T_STEAM = 175; // °C del vapor de calefacción (~8 bar)

// ---------- Viscosidad (fórmula de Walther, mezcla lineal en log-log) ----------
const Z = (nu) => Math.log10(Math.log10(nu + 0.7));
const FROM_Z = (z) => 10 ** (10 ** z) - 0.7;
const HFO = { A: 9.036, B: 3.437 }; // IFO 380: 380 cSt a 50 °C, 13 cSt a ~137 °C
const DO = { A: 8.811, B: 3.6 }; // MGO (DMA): 4 cSt a 40 °C
const zOf = (k, T) => k.A - k.B * Math.log10(T + 273);
export function viscosity(T, hfoFrac) {
  const z = hfoFrac * zOf(HFO, T) + (1 - hfoFrac) * zOf(DO, T);
  return FROM_Z(z);
}
// Temperatura necesaria para una viscosidad dada con la mezcla actual.
export function tempForVisc(nu, hfoFrac) {
  const zt = Z(nu);
  const A = hfoFrac * HFO.A + (1 - hfoFrac) * DO.A;
  const B = hfoFrac * HFO.B + (1 - hfoFrac) * DO.B;
  return 10 ** ((A - zt) / B) - 273;
}

// Acceso con QCV: las válvulas de cierre rápido (sistema de C.I.) cortan la salida de los tanques.
const qcv = (p) => Boolean(p.sig.qcvTripped);

// ======================================================================================
// Depuradora centrífuga genérica (HFO o aceite). Secuencia real: arranque del motor → aceleración
// (≈2 min) → calentador → sello de agua → alimentación → separación con descargas de lodos periódicas.
// ======================================================================================
const RUNUP = 120; // s hasta la velocidad nominal
const RUNDOWN = 240;
const SLUDGE_FRAC = 0.003; // fracción de lodos en el aceite alimentado
const BOWL_CAP = 0.012; // m³ de lodos que admite el tambor

export function addPurifier(p, id, { en, es, oil, setT, rate, maxRate, kw = 15, srcEn, srcEs, dstEn, dstEs }) {
  addMotor(p, id, { en, es, kind: 'purifier', kw });
  addValve(p, `${id}-suc`, { en: `${en}: suction valve from ${srcEn}`, es: `${es}: válvula de aspiración de ${srcEs}` });
  addValve(p, `${id}-out`, { en: `${en}: clean oil outlet valve to ${dstEn}`, es: `${es}: válvula de salida de aceite limpio a ${dstEs}` });
  p.pur ??= {};
  p.pur[id] = {
    id, oil, setT, rate, maxRate, speed: 0, temp: 35, heater: false, feed: false, seal: false, sealT: 0,
    disch: null, dischT: 0, autoDisch: true, interval: 3600, next: 3600, bowl: 0, flow: 0, eff: 0, discharges: 0, dischFail: false,
  };
}

export const purState = (p, id) => {
  const s = p.pur[id], m = p.c[id];
  if (!m.run) return s.speed > 0.02 ? 'rundown' : 'stopped';
  if (s.speed < 0.95) return 'runup';
  if (s.disch) return 'discharge';
  if (s.sealT > 0) return 'sealing';
  if (s.feed && s.flow > 0) return 'separating';
  return s.seal ? 'sealed' : 'ready';
};
export const PUR_STATE = {
  stopped: ['STOPPED', 'Parada'], rundown: ['RUNNING DOWN', 'Parando (inercia)'], runup: ['RUNNING UP', 'Acelerando'],
  ready: ['AT SPEED · NO SEAL', 'A velocidad · sin sello'], sealing: ['WATER SEAL FILLING', 'Llenando sello de agua'],
  sealed: ['STANDBY · RECIRCULATING', 'Preparada · recirculando'], separating: ['SEPARATING', 'Separando'],
  discharge: ['SLUDGE DISCHARGE', 'Descarga de lodos'],
};

function startDischarge(p, s, why) {
  if (s.disch) return;
  s.disch = 'pre';
  s.dischT = 8;
  log(p, `pur-disch:${s.id}`, `${p.c[s.id].en}: sludge discharge (${why}).`, `${p.c[s.id].es}: descarga de lodos (${why === 'manual' ? 'manual' : 'temporizador'}).`);
}

// cfg: { src(p) → tanque|null, dst(p) → tanque|null, srcTemp(p), sludge (tanque), steamAvail }
// Devuelve el volumen limpio movido (m³) en este paso y la eficacia de separación.
export function purifierStep(p, id, cfg, dt) {
  const s = p.pur[id];
  const m = p.c[id];
  const en = m.en, es = m.es;
  m.fault = Boolean(p.faults[id]);
  // Velocidad del tambor
  s.speed = m.run ? Math.min(1, s.speed + dt / RUNUP) : Math.max(0, s.speed - dt / RUNDOWN);
  m.load = m.run && s.speed < 0.97 ? 1 : 0.55;
  if (!m.run) { s.feed = false; s.heater = false; s.disch = null; s.sealT = 0; }
  if (s.speed < 0.8) s.seal = false;
  // Sello de agua
  if (s.sealT > 0) {
    s.sealT -= dt;
    if (s.sealT <= 0) { s.sealT = 0; s.seal = s.speed > 0.9; }
  }
  if (p.faults[`${id}-seal`] && s.feed && s.seal && !s.disch) {
    s.seal = false;
    log(p, `pur-seal-lost:${id}`, `${en}: water seal lost.`, `${es}: se ha perdido el sello de agua.`);
  }
  // Calentador (vapor) — funciona solo con circulación (bomba de alimentación acoplada al motor)
  const steam = p.sig.steamAvail ?? 1;
  const srcT = cfg.srcTemp(p);
  const heating = s.heater && m.run && s.speed > 0.3 && steam > 0.1;
  const thermostatSet = p.faults[`${id}-heater`] ? s.setT + 22 : s.setT;
  const heatTarget = heating ? srcT + (thermostatSet - srcT) * Math.min(1, steam * 1.2) : (m.run ? srcT : srcT);
  s.temp = lag(s.temp, Math.max(srcT, heatTarget), heating ? 70 : 200, dt);
  cfg.steamUse((heating ? (s.oil === 'hfo' ? 60 : 40) : 0) * (s.temp < s.setT - 2 ? 1.5 : 1));
  // Descarga de lodos (secuencia)
  if (s.disch) {
    s.dischT -= dt;
    if (s.dischT <= 0) {
      if (s.disch === 'pre') {
        s.disch = 'open';
        s.dischT = 2;
      } else if (s.disch === 'open') {
        if (p.faults[`${id}-disch`]) {
          s.dischFail = true;
          s.disch = null;
          log(p, `pur-dischfail:${id}`, `${en}: discharge failure (bowl did not open).`, `${es}: fallo de descarga (el tambor no abrió).`);
        } else {
          transfer({ level: s.bowl + 0.006 }, cfg.sludge, s.bowl + 0.006);
          s.bowl = 0;
          s.dischFail = false;
          s.discharges++;
          s.seal = false;
          s.disch = 'seal';
          s.dischT = 10;
        }
      } else {
        s.seal = s.speed > 0.9;
        s.disch = null;
        s.next = s.interval;
      }
    }
  }
  // Alimentación
  const src = cfg.src(p), dst = cfg.dst(p);
  const suction = isOpen(p, `${id}-suc`) && src && src.level > 0.03 * src.cap && !(cfg.qcv && qcv(p));
  // HFO frío: demasiado viscoso para la bomba de alimentación
  const tooThick = s.oil === 'hfo' && srcT < 45;
  const feeding = s.feed && s.speed > 0.9 && suction && !tooThick && !s.disch && s.sealT <= 0;
  let clean = 0;
  s.flow = 0;
  s.eff = 0;
  let sealBroken = false, overflow = false;
  if (feeding) {
    const q = (s.rate / 1000 / 3600) * dt; // m³ en este paso
    s.flow = s.rate;
    if (!s.seal) {
      sealBroken = true;
      transfer(src, cfg.sludge, q); // el aceite sale por la salida de agua → tanque de lodos
    } else if (!isOpen(p, `${id}-out`) || !dst) {
      overflow = true;
      transfer(src, cfg.sludge, q * 0.5);
    } else {
      // Eficacia: temperatura correcta y caudal moderado
      let eff = 0.97 * (1 - 0.35 * (s.rate / s.maxRate) ** 2);
      if (s.temp < s.setT - 5) eff *= clamp(1 - (s.setT - 5 - s.temp) / 30, 0.15, 1);
      if (s.bowl > BOWL_CAP) eff *= 0.4;
      s.eff = eff;
      s.bowl += q * SLUDGE_FRAC;
      const w = src.water ?? 0;
      const moved = src === dst ? Math.min(q, src.level) : transfer(src, null, q);
      if (moved > 0) {
        if (src === dst) {
          dst.water = (w * (dst.level - moved) + w * (1 - eff) * moved) / dst.level;
        } else {
          const room = Math.min(moved, dst.cap - dst.level);
          const wd = dst.water ?? 0;
          dst.water = (wd * dst.level + w * (1 - eff) * room) / Math.max(1e-6, dst.level + room);
          dst.level += room;
          if (moved > room) src.level += moved - room; // destino lleno: vuelve por el rebose
          if (cfg.heatDst) cfg.heatDst(dst, s.temp, room);
        }
        clean = moved;
      }
    }
  }
  // Descarga automática por temporizador
  if (s.autoDisch && feeding) {
    s.next -= dt;
    if (s.next <= 0) startDischarge(p, s, 'timer');
  }
  const a = `pur-${id}`;
  alarm(p, `${a}-ht`, m.run && s.temp > s.setT + 8, `${en}: oil temperature high`, `${es}: temperatura alta del aceite`);
  alarm(p, `${a}-lt`, feeding && s.temp < s.setT - 10, `${en}: oil temperature low`, `${es}: temperatura baja del aceite`);
  alarm(p, `${a}-seal`, sealBroken, `${en}: water seal broken — oil to sludge`, `${es}: sello de agua roto — aceite al tanque de lodos`);
  alarm(p, `${a}-ovf`, overflow, `${en}: overflow / high back pressure (outlet closed)`, `${es}: rebose / contrapresión alta (salida cerrada)`);
  alarm(p, `${a}-disch`, s.dischFail, `${en}: sludge discharge failure`, `${es}: fallo de la descarga de lodos`);
  alarm(p, `${a}-feed`, s.feed && s.speed > 0.9 && !s.disch && s.sealT <= 0 && (!suction || tooThick), `${en}: low feed pressure / no flow`, `${es}: presión de alimentación baja / sin caudal`);
  alarm(p, `${a}-fail`, m.fault && m.cmd, `${en}: motor failure`, `${es}: avería del motor`);
  alarm(p, `${a}-water`, feeding && s.eff > 0 && s.eff < 0.5, `${en}: water in oil (poor separation)`, `${es}: agua en el aceite (separación deficiente)`, 'warn');
  return { clean, eff: s.eff };
}

// Acciones del panel de la depuradora (comunes a todas)
const purName = (p, id) => [p.c[id].en, p.c[id].es];
export const purifierActions = {
  purHeater(p, id, on) {
    const s = p.pur[id];
    if (on && !p.c[id].cmd) return M('Start the purifier first: the heater needs oil circulation.', 'Arranca primero la depuradora: el calentador necesita circulación de aceite.');
    s.heater = on;
    const [en, es] = purName(p, id);
    log(p, `pur-heater:${id}:${on ? 'on' : 'off'}`, `${en}: heater ${on ? 'ON' : 'OFF'}.`, `${es}: calentador ${on ? 'conectado' : 'desconectado'}.`);
    return null;
  },
  purSeal(p, id) {
    const s = p.pur[id];
    if (s.speed < 0.95) return M('Wait until the bowl is at full speed.', 'Espera a que el tambor alcance la velocidad nominal.');
    if (s.disch) return M('Discharge in progress.', 'Descarga en curso.');
    s.sealT = 10;
    log(p, `pur-seal:${id}`, `${p.c[id].en}: sealing water on.`, `${p.c[id].es}: agua de sello abierta.`);
    return null;
  },
  purFeed(p, id, on) {
    const s = p.pur[id];
    if (on && s.speed < 0.9) return M('The bowl is not at speed.', 'El tambor no está a velocidad.');
    s.feed = on;
    const [en, es] = purName(p, id);
    log(p, `pur-feed:${id}:${on ? 'on' : 'off'}`, `${en}: feed ${on ? 'ON (to bowl)' : 'OFF (recirculation)'}.`, `${es}: alimentación ${on ? 'abierta (al tambor)' : 'cerrada (recirculación)'}.`);
    return null;
  },
  purDischarge(p, id) {
    const s = p.pur[id];
    if (s.speed < 0.9) return M('The bowl is not at speed.', 'El tambor no está a velocidad.');
    startDischarge(p, s, 'manual');
    return null;
  },
  purAutoDisch(p, id, on) { p.pur[id].autoDisch = on; return null; },
  purRate(p, id, lh) { const s = p.pur[id]; s.rate = clamp(Math.round(lh), 200, s.maxRate); return null; },
  purReset(p, id) { const s = p.pur[id]; s.dischFail = false; return null; },
};

// Deja una depuradora separando (para las situaciones iniciales).
export function purifierRunning(p, id, phase = 0.7) {
  const s = p.pur[id];
  p.c[id].cmd = true;
  p.c[id].run = true;
  p.c[`${id}-suc`].open = true; p.c[`${id}-suc`].pos = 1;
  p.c[`${id}-out`].open = true; p.c[`${id}-out`].pos = 1;
  Object.assign(s, { speed: 1, heater: true, seal: true, feed: true, temp: s.setT, next: s.interval * phase });
}

// ======================================================================================
// Sistema de combustible
// ======================================================================================
export function init(p) {
  const tank = (id, en, es, cap, level, temp, fluid, water = 0) => { addTank(p, id, { en, es, cap, level, temp, fluid }).water = water; };
  tank('hfoStor1', 'HFO storage tank No 1 (P)', 'Tanque almacén de HFO nº 1 (Br)', 800, 520, 40, 'hfo', 0.8);
  tank('hfoStor2', 'HFO storage tank No 2 (S)', 'Tanque almacén de HFO nº 2 (Er)', 800, 480, 40, 'hfo', 0.8);
  tank('hfoSett', 'HFO settling tank', 'Tanque de sedimentación de HFO', 60, 45, 70, 'hfo', 0.4);
  tank('hfoServ', 'HFO service tank', 'Tanque de servicio diario de HFO', 50, 46, 85, 'hfo', 0.03);
  tank('doStor', 'DO storage tank', 'Tanque almacén de diésel', 150, 105, 35, 'do', 0.05);
  tank('doServ', 'DO service tank', 'Tanque de servicio diario de diésel', 30, 24, 35, 'do', 0.02);
  tank('sludge', 'Sludge tank', 'Tanque de lodos', 20, 3, 40, 'bilge');

  const v = (id, en, es, open = true) => addValve(p, id, { en, es, open });
  v('v-hfost1', 'HFO storage tank No 1 outlet valve', 'Válvula de salida del almacén de HFO nº 1', false);
  v('v-hfost2', 'HFO storage tank No 2 outlet valve', 'Válvula de salida del almacén de HFO nº 2', false);
  v('v-hfotp-sett', 'HFO transfer to settling tank valve', 'Válvula trasiego de HFO → sedimentación', false);
  v('v-dost', 'DO storage tank outlet valve', 'Válvula de salida del almacén de diésel', false);
  v('v-dotp-serv', 'DO transfer to service tank valve', 'Válvula trasiego de diésel → servicio', false);
  v('v-sett-heat', 'Settling tank steam heating valve', 'Válvula de vapor del calentamiento del tanque de sedimentación');
  v('v-serv-heat', 'Service tank steam heating valve', 'Válvula de vapor del calentamiento del tanque de servicio');
  v('v-sett-drain', 'Settling tank water drain valve', 'Purga de agua del tanque de sedimentación', false);
  v('v-fcm-hfo', 'HFO service tank outlet valve (QCV) to FCM', 'Válvula de salida del servicio de HFO (cierre rápido) al FCM');
  v('v-fcm-do', 'DO service tank outlet valve (QCV) to FCM', 'Válvula de salida del servicio de diésel (cierre rápido) al FCM');
  v('v-do-dg', 'DO supply valve to diesel generators', 'Válvula de suministro de diésel a los generadores');
  addValve(p, 'v-fcm-heat', { en: 'Fuel oil heater steam control valve', es: 'Válvula de control de vapor del calentador de combustible', kind: 'cvalve' });
  p.c['v-fcm-heat'].auto = true;

  addMotor(p, 'hfotp', { en: 'HFO transfer pump', es: 'Bomba de trasiego de HFO', kw: 15 });
  addMotor(p, 'dotp', { en: 'DO transfer pump', es: 'Bomba de trasiego de diésel', kw: 7.5 });
  addMotor(p, 'fsp1', { en: 'FO supply pump No 1', es: 'Bomba de alimentación de combustible nº 1', kw: 5.5 });
  addMotor(p, 'fsp2', { en: 'FO supply pump No 2', es: 'Bomba de alimentación de combustible nº 2', kw: 5.5 });
  addMotor(p, 'fcp1', { en: 'FO circulating pump No 1', es: 'Bomba de circulación de combustible nº 1', kw: 11 });
  addMotor(p, 'fcp2', { en: 'FO circulating pump No 2', es: 'Bomba de circulación de combustible nº 2', kw: 11 });

  const pur = { oil: 'hfo', setT: 98, rate: 2000, maxRate: 4000, kw: 18, srcEn: 'settling tank', srcEs: 'sedimentación', dstEn: 'service tank', dstEs: 'servicio' };
  addPurifier(p, 'hfop1', { en: 'HFO purifier No 1', es: 'Depuradora de HFO nº 1', ...pur });
  addPurifier(p, 'hfop2', { en: 'HFO purifier No 2', es: 'Depuradora de HFO nº 2', ...pur });

  const qcvLock = (pp) => (pp.sig.qcvTripped ? M('Quick-closing valves tripped: reset them (fire/CO2 station) before starting fuel pumps.', 'Válvulas de cierre rápido disparadas: rearmalas (puesto de C.I./CO2) antes de arrancar las bombas de combustible.') : null);
  for (const id of QCV_STOP) p.c[id].interlock = qcvLock;
  p.fuel = {
    fcm: {
      co: 'HFO', // posición de la válvula de tres vías de cambio HFO/DO
      frac: 1, // fracción de HFO en el circuito (tanque de mezcla)
      T: 135, Tprev: 135, grad: 0, visc: 13,
      mode: 'visc', viscSet: 13, tempSet: 135, spEff: 135, I: 0.6,
      supplyP: 0, circP: 0, dp: 0.3, bypass: false, flushes: 0,
      flowLh: 0, total: 0,
    },
    meLh: 0, dgLh: 0, steamKgH: 0,
  };
}

export const FAULTS = [
  { id: 'hfop1', en: 'HFO purifier No 1 motor failure', es: 'Avería del motor de la depuradora de HFO nº 1', system: 'fuel' },
  { id: 'hfop2', en: 'HFO purifier No 2 motor failure', es: 'Avería del motor de la depuradora de HFO nº 2', system: 'fuel' },
  { id: 'hfop1-seal', en: 'HFO purifier No 1: loss of water seal', es: 'Depuradora de HFO nº 1: pérdida del sello de agua', system: 'fuel' },
  { id: 'hfop1-disch', en: 'HFO purifier No 1: discharge failure', es: 'Depuradora de HFO nº 1: fallo de descarga', system: 'fuel' },
  { id: 'hfop2-heater', en: 'HFO purifier No 2: heater thermostat failure', es: 'Depuradora de HFO nº 2: fallo del termostato del calentador', system: 'fuel' },
  { id: 'fsp1', en: 'FO supply pump No 1 failure', es: 'Avería de la bomba de alimentación nº 1', system: 'fuel' },
  { id: 'fcp1', en: 'FO circulating pump No 1 failure', es: 'Avería de la bomba de circulación nº 1', system: 'fuel' },
  { id: 'fcm-filter', en: 'FCM auto filter clogging (back-flush failure)', es: 'Filtro automático del FCM obstruido (fallo del contralavado)', system: 'fuel' },
  { id: 'fcm-visc', en: 'Viscosity controller failure (steam valve stuck)', es: 'Fallo del controlador de viscosidad (válvula de vapor bloqueada)', system: 'fuel' },
  { id: 'fo-serv-water', en: 'Water contamination in HFO settling tank', es: 'Agua en el tanque de sedimentación de HFO', system: 'fuel' },
];

const lh2m3s = (lh) => lh / 1000 / 3600;

// Parte térmica del FCM (también se usa para dejar la situación inicial estabilizada).
function fcmThermal(p, dt) {
  const f = p.fuel.fcm;
  const steam = p.sig.steamAvail ?? 1;
  const circ = f.supplyP > 2 || f.circP > 2;
  const consM3h = (f.flowLh || 0) / 1000;
  const kf = circ ? (2 + consM3h) / 3600 / 0.3 : 0; // renovación del tanque de mezcla (1/s)
  const target = f.co === 'HFO' ? 1 : 0;
  f.frac = clamp(f.frac + (target - f.frac) * kf * dt, 0, 1);
  const supTank = f.co === 'HFO' ? p.c.hfoServ : p.c.doServ;
  // El tanque de mezcla amortigua el cambio de temperatura del combustible que entra
  f.Tmix = lag(f.Tmix ?? supTank.temp, supTank.temp, 600, dt);
  const Tsup = f.Tmix;
  // Controlador de viscosidad / temperatura → válvula de vapor
  const v = p.c['v-fcm-heat'];
  if (p.faults['fcm-visc']) v.fault = true; else v.fault = false;
  // VISC: el PID sigue la temperatura necesaria para la viscosidad (seguimiento limitado a 4 °C/min).
  // TEMP: consigna de temperatura con rampa de 1,2 °C/min (función de cambio de combustible).
  if (f.mode === 'visc') { const tgt = clamp(tempForVisc(f.viscSet, f.frac), 20, 150); f.spEff += clamp(tgt - f.spEff, -4 / 60 * dt, 4 / 60 * dt); }
  else if (f.mode === 'temp') f.spEff += clamp(f.tempSet - f.spEff, -1.2 / 60 * dt, 1.2 / 60 * dt);
  else f.spEff = f.T;
  if (v.auto && f.mode !== 'manual' && !v.fault) {
    const e = f.spEff - f.T;
    if (circ) f.I = clamp(f.I + 0.0012 * e * dt, 0, 1);
    v.pos = clamp(0.08 * e + f.I, 0, 1);
    v.open = v.pos > 0.02;
  } else if (!v.fault) f.I = v.pos;
  const kh = circ ? 0.0075 * v.pos * steam : 0;
  const dT = kh * (T_STEAM - f.T) - (f.T - 35) / 3000 - kf * (f.T - Tsup);
  f.T += dT * dt;
  f.visc = viscosity(f.T, f.frac);
  return kh;
}

const QCV_STOP = ['hfotp', 'dotp', 'fsp1', 'fsp2', 'fcp1', 'fcp2', 'hfop1', 'hfop2'];

export function step(p, dt) {
  const c = p.c, f = p.fuel.fcm;
  for (const id of ['fsp1', 'fsp2', 'fcp1', 'fcp2', 'hfotp', 'dotp']) c[id].fault = Boolean(p.faults[id]);
  // Disparo de las válvulas de cierre rápido: paro de emergencia de las bombas de combustible y depuradoras
  if (qcv(p)) {
    if (!p.fuel.qcvStopped) log(p, 'fo-qcv-stop', 'Fuel oil pumps and purifiers stopped by the quick-closing valve trip.', 'Bombas de combustible y depuradoras paradas por el disparo de las válvulas de cierre rápido.');
    p.fuel.qcvStopped = true;
    for (const id of QCV_STOP) { c[id].cmd = false; c[id].standby = false; }
    for (const id of ['hfop1', 'hfop2']) p.pur[id].feed = false;
  } else p.fuel.qcvStopped = false;
  const steam = p.sig.steamAvail ?? 1;
  let steamKgH = 0;

  // Calentamiento de los tanques (serpentines de vapor con termostato)
  const heatTank = (t, valve, set, tau) => {
    const on = isOpen(p, valve) && steam > 0.1;
    t.temp = lag(t.temp, on ? 35 + (set - 35) * Math.min(1, steam * 1.2) : 35, on && t.temp < set ? tau : 3 * tau, dt);
    if (on && t.temp < set - 1) steamKgH += 180 * steam; else if (on) steamKgH += 50 * steam;
  };
  heatTank(c.hfoSett, 'v-sett-heat', 70, 1500);
  heatTank(c.hfoServ, 'v-serv-heat', 85, 1500);

  // Agua en la sedimentación: purga y avería de contaminación
  if (p.faults['fo-serv-water']) c.hfoSett.water = Math.min(5, c.hfoSett.water + 0.002 * dt);
  if (isOpen(p, 'v-sett-drain')) {
    c.hfoSett.water = Math.max(0.05, c.hfoSett.water - 0.01 * dt);
    transfer(c.hfoSett, c.sludge, 0.0003 * dt);
  }

  // Bombas de trasiego
  const trasiego = (pumpId, sucs, dstValve, dst, m3h, noflowId, en, es) => {
    const m = c[pumpId];
    const open = sucs.filter(([valve, t]) => isOpen(p, valve) && t.level > 0.01 * t.cap);
    const ok = m.run && open.length && isOpen(p, dstValve) && !qcv(p);
    if (ok) {
      for (const [, t] of open) {
        const q = (m3h / 3600 / open.length) * dt;
        const w = t.water ?? 0;
        const moved = transfer(t, dst, q);
        if (moved > 0) dst.water = ((dst.water ?? 0) * (dst.level - moved) + w * moved) / dst.level;
        if (moved > 0) dst.temp = (dst.temp * (dst.level - moved) + t.temp * moved) / dst.level;
      }
    }
    m.load = ok ? 1 : 0.4;
    alarm(p, noflowId, m.run && !ok, en, es, 'warn');
  };
  trasiego('hfotp', [['v-hfost1', c.hfoStor1], ['v-hfost2', c.hfoStor2]], 'v-hfotp-sett', c.hfoSett, 30, 'fo-hfotp-noflow',
    'HFO transfer pump running without flow (check valves)', 'Bomba de trasiego de HFO en marcha sin caudal (revisa las válvulas)');
  trasiego('dotp', [['v-dost', c.doStor]], 'v-dotp-serv', c.doServ, 10, 'fo-dotp-noflow',
    'DO transfer pump running without flow (check valves)', 'Bomba de trasiego de diésel en marcha sin caudal (revisa las válvulas)');

  // Depuradoras de HFO: sedimentación → servicio
  const heatDst = (dst, T, vol) => { dst.temp = (dst.temp * (dst.level - vol) + T * vol) / dst.level; };
  for (const id of ['hfop1', 'hfop2']) {
    purifierStep(p, id, {
      src: () => c.hfoSett, dst: () => c.hfoServ, srcTemp: () => c.hfoSett.temp, sludge: c.sludge, qcv: true, heatDst,
      steamUse: (kg) => { steamKgH += kg * steam; },
    }, dt);
  }
  // Rebose del tanque de servicio a la sedimentación (normal en servicio)
  const ovf = c.hfoServ.level - 0.97 * c.hfoServ.cap;
  if (ovf > 0) {
    const w = c.hfoServ.water;
    const moved = transfer(c.hfoServ, c.hfoSett, ovf);
    c.hfoSett.water = (c.hfoSett.water * (c.hfoSett.level - moved) + w * moved) / c.hfoSett.level;
  }

  // ---------- Módulo de acondicionamiento de combustible (FCM / booster) ----------
  const supTank = f.co === 'HFO' ? c.hfoServ : c.doServ;
  const supValve = f.co === 'HFO' ? 'v-fcm-hfo' : 'v-fcm-do';
  const supplyAvail = isOpen(p, supValve) && supTank.level > 0.02 * supTank.cap && !qcv(p);
  const fspRun = c.fsp1.run || c.fsp2.run;
  const fcpRun = c.fcp1.run || c.fcp2.run;
  f.supplyP = lag(f.supplyP, fspRun && supplyAvail ? 4.0 : 0, 2, dt);
  const circTarget = fcpRun ? (f.supplyP > 2 ? 10.2 : f.supplyP * 0.6) : f.supplyP * 0.9;
  f.circP = lag(f.circP, circTarget, 2, dt);
  // Filtro automático: contralavado automático a 0,6 bar; con avería se obstruye
  const flowing = f.circP > 2;
  if (f.bypass) f.dp = lag(f.dp, flowing ? 0.25 : 0, 5, dt);
  else if (p.faults['fcm-filter']) f.dp = Math.min(4, f.dp + (flowing ? 0.003 : 0) * dt);
  else {
    f.dp = flowing ? f.dp + 0.0002 * dt : lag(f.dp, 0, 5, dt);
    if (f.dp > 0.5) { f.dp = 0.3; f.flushes++; }
    if (flowing && f.dp < 0.3) f.dp = lag(f.dp, 0.3, 5, dt);
  }
  const meP = Math.max(0, f.circP - Math.max(0, f.dp - 0.3) * 1.6);
  const kh = fcmThermal(p, dt);
  steamKgH += kh > 0 ? 400 * c['v-fcm-heat'].pos * steam : 0;
  f.grad = lag(f.grad, ((f.T - f.Tprev) / dt) * 60, 20, dt);
  f.Tprev = f.T;

  // Consumo del motor principal
  const meFuelOk = meP > 6 && supplyAvail && fcpRun;
  const meKw = Math.max(0, p.sig.mePowerKw ?? 0);
  const rho = f.frac * RHO_HFO + (1 - f.frac) * RHO_DO;
  f.flowLh = meFuelOk ? (meKw * SFOC_ME) / 1000 / rho : 0; // L/h
  if (f.flowLh > 0) {
    transfer(supTank, null, lh2m3s(f.flowLh) * dt);
    f.total += lh2m3s(f.flowLh) * dt;
  }
  // Consumo de los generadores diésel (servicio de diésel)
  const dgFuelOk = c.doServ.level > 0.01 * c.doServ.cap && isOpen(p, 'v-do-dg') && !qcv(p);
  const dgKw = (p.sig.dgKw ?? []).reduce((a, b) => a + Math.max(0, b), 0);
  p.fuel.dgLh = dgFuelOk ? (dgKw * SFOC_DG) / 1000 / RHO_DO : 0;
  transfer(c.doServ, null, lh2m3s(p.fuel.dgLh) * dt);
  p.fuel.meLh = f.flowLh;
  p.fuel.steamKgH = steamKgH;

  // Bombas en reserva
  f.fspT = fspRun ? (f.fspT ?? 0) + dt : 0; // tiempo en marcha (la presión tarda en subir)
  f.fcpT = fcpRun ? (f.fcpT ?? 0) + dt : 0;
  standbyPair(p, ['fsp1', 'fsp2'], f.fspT > 10 && supplyAvail && f.supplyP < 2.5, 'FO supply pumps', 'Bombas de alimentación de combustible');
  standbyPair(p, ['fcp1', 'fcp2'], f.fcpT > 10 && f.circP < 7 && f.supplyP > 3, 'FO circulating pumps', 'Bombas de circulación de combustible');

  // Señales
  const s = p.sig;
  s.hfoServicePct = pct(c.hfoServ);
  s.doServicePct = pct(c.doServ);
  s.meFuelPress = meP;
  s.meFuelTemp = f.T;
  s.meFuelVisc = f.visc;
  s.meFuelOk = meFuelOk;
  s.meFuelType = f.frac >= 0.5 ? 'HFO' : 'DO';
  s.dgFuelOk = dgFuelOk;

  // Alarmas
  // Presiones bajas con retardo de arranque de 10 s (como las bombas de reserva); sin bombas en marcha, sin retardo.
  const fcmOn = c.fcp1.cmd || c.fcp2.cmd || c.fsp1.cmd || c.fsp2.cmd || Boolean(p.sig.meRunning);
  alarm(p, 'fo-hfoserv-low', pct(c.hfoServ) < 40, 'HFO service tank low level', 'Nivel bajo en el tanque de servicio de HFO');
  alarm(p, 'fo-doserv-low', pct(c.doServ) < 30, 'DO service tank low level', 'Nivel bajo en el tanque de servicio de diésel');
  alarm(p, 'fo-doserv-high', pct(c.doServ) > 97, 'DO service tank high level', 'Nivel alto en el tanque de servicio de diésel', 'warn');
  alarm(p, 'fo-sett-low', pct(c.hfoSett) < 25, 'HFO settling tank low level', 'Nivel bajo en el tanque de sedimentación de HFO');
  alarm(p, 'fo-sett-high', pct(c.hfoSett) > 96, 'HFO settling tank high level', 'Nivel alto en el tanque de sedimentación de HFO', 'warn');
  alarm(p, 'fo-sludge-high', pct(c.sludge) > 85, 'Sludge tank high level', 'Nivel alto en el tanque de lodos', 'warn');
  alarm(p, 'fo-serv-water', c.hfoServ.water > 0.5, 'Water in HFO service tank', 'Agua en el tanque de servicio de HFO', 'warn');
  alarm(p, 'fcm-supply-low', fcmOn && f.supplyP < 2.5 && (!fspRun || f.fspT > 10), 'FO supply pressure low (FCM)', 'Presión baja de alimentación de combustible (FCM)');
  alarm(p, 'fcm-press-low', fcmOn && meP < 7 && (!fcpRun || f.fcpT > 10), 'ME fuel oil inlet pressure low', 'Presión baja de combustible a la entrada del MP');
  alarm(p, 'fcm-filter-dp', f.dp > 1.0, 'FO auto filter high differential pressure', 'Presión diferencial alta en el filtro automático de combustible');
  alarm(p, 'fcm-visc-high', flowing && f.visc > 18, 'ME fuel oil viscosity high', 'Viscosidad alta del combustible al MP');
  alarm(p, 'fcm-visc-low', flowing && f.visc < 1.5, 'ME fuel oil viscosity low', 'Viscosidad baja del combustible al MP');
  alarm(p, 'fcm-temp-high', f.T > 150, 'ME fuel oil temperature high', 'Temperatura alta del combustible al MP');
  alarm(p, 'fcm-grad', flowing && Math.abs(f.grad) > 2, 'Fuel temperature change above 2 °C/min (fuel pump thermal shock)', 'Cambio de temperatura del combustible mayor de 2 °C/min (choque térmico en las bombas)', 'warn');
  alarm(p, 'fo-dg-nofuel', !dgFuelOk && (p.sig.dgKw ?? []).some((k) => k > 0), 'Diesel generators: no fuel supply', 'Generadores diésel: sin suministro de combustible', 'alarm');
  alarm(p, 'fo-qcv', qcv(p), 'Fuel quick-closing valves tripped', 'Válvulas de cierre rápido de combustible disparadas', 'alarm');
}

export const actions = {
  ...purifierActions,
  fcmChangeover(p, type) {
    const f = p.fuel.fcm;
    if (f.co === type) return null;
    f.co = type;
    log(p, `fcm-co:${type}`, `FCM changeover valve to ${type}.`, `Válvula de cambio del FCM a ${type === 'HFO' ? 'HFO' : 'diésel (DO)'}.`);
    return null;
  },
  fcmMode(p, mode) {
    const f = p.fuel.fcm;
    if (mode === 'temp' && f.mode !== 'temp') f.tempSet = Math.round(f.T);
    if (mode !== f.mode) f.spEff = f.T; // cambio sin salto
    if (mode === 'manual') p.c['v-fcm-heat'].auto = false; else p.c['v-fcm-heat'].auto = true;
    f.mode = mode;
    log(p, `fcm-mode:${mode}`, `Viscosity controller: ${mode.toUpperCase()} mode.`, `Controlador de viscosidad: modo ${{ visc: 'VISCOSIDAD', temp: 'TEMPERATURA', manual: 'MANUAL' }[mode]}.`);
    return null;
  },
  fcmTempSet(p, T) { p.fuel.fcm.tempSet = clamp(Math.round(T), 30, 150); return null; },
  fcmViscSet(p, v) { p.fuel.fcm.viscSet = clamp(v, 8, 20); return null; },
  fcmFilterFlush(p) {
    const f = p.fuel.fcm;
    if (f.bypass) return M('The manual (bypass) filter is in use.', 'Está en uso el filtro manual (bypass).');
    if (p.faults['fcm-filter']) return M('Back-flush failed: the auto filter is clogged. Change over to the bypass filter.', 'El contralavado ha fallado: el filtro automático está obstruido. Pasa al filtro de bypass.');
    f.dp = 0.3; f.flushes++;
    log(p, 'fcm-flush', 'FO auto filter back-flushed.', 'Contralavado del filtro automático de combustible.');
    return null;
  },
  fcmFilterBypass(p, on) {
    p.fuel.fcm.bypass = on;
    log(p, `fcm-bypass:${on ? 'on' : 'off'}`, on ? 'FO filter changed over to the bypass (manual) filter.' : 'FO auto filter back in service.',
      on ? 'Filtro de combustible cambiado al filtro manual (bypass).' : 'Filtro automático de combustible de nuevo en servicio.');
    return null;
  },
};

function fcmRunning(p) {
  const c = p.c, f = p.fuel.fcm;
  c.fsp1.cmd = c.fsp1.run = true; c.fsp2.standby = true;
  c.fcp1.cmd = c.fcp1.run = true; c.fcp2.standby = true;
  f.supplyP = 4; f.circP = 10.2; f.dp = 0.3;
  // Estabiliza la parte térmica (vapor disponible).
  f.spEff = f.T;
  for (let i = 0; i < 4000; i++) fcmThermal(p, 1);
  f.Tprev = f.T; f.grad = 0;
  f.Tmix = p.c.hfoServ.temp;
}

export const setup = {
  sea(p) {
    const c = p.c;
    purifierRunning(p, 'hfop1');
    purifierRunning(p, 'hfop2', 0.85);
    c['v-do-dg'].open = true;
    fcmRunning(p);
  },
  port(p) {
    purifierRunning(p, 'hfop1');
    fcmRunning(p);
  },
  dead(p) {
    const c = p.c, f = p.fuel.fcm;
    // Todo frío y parado. El FCM quedó con diésel antes de parar la planta.
    c.hfoSett.temp = 35; c.hfoServ.temp = 38; c.hfoSett.level = 40; c.hfoServ.level = 36;
    for (const id of ['v-sett-heat', 'v-serv-heat']) { c[id].open = false; c[id].pos = 0; }
    f.co = 'DO'; f.frac = 0; f.Tmix = 35; f.T = 35; f.Tprev = 35; f.I = 0; f.spEff = 35; f.mode = 'visc';
    c['v-fcm-heat'].pos = 0; c['v-fcm-heat'].open = false;
    for (const id of ['hfop1', 'hfop2']) p.pur[id].temp = 35;
    f.visc = viscosity(35, 0);
  },
};

// Hitos de la puesta en marcha desde buque muerto (para la lista combinada).
export const STARTUP = [
  { en: 'DO service tank supplying the diesel generators', es: 'Servicio de diésel alimentando a los generadores', check: (p) => Boolean(p.sig.dgFuelOk) && p.c.doServ.level > 0.3 * p.c.doServ.cap },
  { en: 'HFO settling and service tanks heated (above 60 °C)', es: 'Tanques de sedimentación y servicio de HFO calientes (más de 60 °C)', check: (p) => p.c.hfoSett.temp > 60 && p.c.hfoServ.temp > 60 },
  { en: 'FCM circulating (fuel pressure above 7 bar)', es: 'FCM en circulación (presión de combustible mayor de 7 bar)', check: (p) => (p.sig.meFuelPress ?? 0) > 7 },
  { en: 'HFO purifier in operation', es: 'Depuradora de HFO separando', check: (p) => ['hfop1', 'hfop2'].some((id) => purState(p, id) === 'separating') },
  { en: 'ME fuel on HFO with viscosity OK (10–15 cSt)', es: 'Combustible del MP en HFO con viscosidad correcta (10–15 cSt)', check: (p) => p.sig.meFuelType === 'HFO' && p.sig.meFuelVisc > 10 && p.sig.meFuelVisc < 15 },
];
