// Agua dulce: generador de agua dulce de vacío (FWG) calentado con el agua de camisas del motor principal,
// y sistema de agua sanitaria (tanques de agua dulce, hidróforo con dos bombas y calentador / calorífero).
import { addMotor, addValve, addTank, isOpen, alarm, log, clamp, lag, pct, M } from '../core.js';

const FWG_UA = 16.5; // kW/K entre el agua de camisas y el evaporador
const FWG_MAX_KW = 720; // ≈ 25 t/día
const LATENT = 2400; // kJ/kg
const SAL_LIMIT = 10; // ppm: por encima el salinómetro descarga (dump)
const HYD_VT = 2; // volumen del tanque hidróforo (m³)
const HYD_AIR = 6; // carga de aire nominal (bar abs · m³)
const HYD_Q = 0.0019; // caudal de cada bomba a presión cero (m³/s ≈ 7 m³/h)
const DAY_T = 15; // consumo diario de la tripulación (t/día)
const CAL_KW = 30; // resistencia del calorífero
const CAL_STEAM_KW = 25;

// Temperatura de saturación del agua (°C) a la presión absoluta P (bar), ecuación de Antoine.
export const tSat = (bar) => 3816.44 / (23.1964 - Math.log(Math.max(0.01, bar) * 1e5)) - 227.02;

export function init(p) {
  addMotor(p, 'fwgEj', { en: 'FWG ejector pump', es: 'Bomba del eyector del generador de agua dulce', kw: 22, kind: 'pump' });
  addMotor(p, 'fwgDp', { en: 'FWG distillate pump', es: 'Bomba de destilado del generador de agua dulce', kw: 2.2, kind: 'pump' });
  addMotor(p, 'hyd1', { en: 'Hydrophore pump No 1', es: 'Bomba del hidróforo nº 1', kw: 7.5, kind: 'pump' });
  addMotor(p, 'hyd2', { en: 'Hydrophore pump No 2', es: 'Bomba del hidróforo nº 2', kw: 7.5, kind: 'pump' });
  addMotor(p, 'calHeater', { en: 'Calorifier electric heater', es: 'Resistencia eléctrica del calorífero', kw: CAL_KW, kind: 'heater' });
  // auto = presostato / termostato: el propio modelo arranca y para.
  for (const id of ['hyd1', 'hyd2', 'calHeater']) p.c[id].auto = true;

  const v = (id, en, es, open = false) => addValve(p, id, { en, es, open });
  v('v-fwg-ovbd', 'FWG ejector overboard valve', 'Válvula al costado del eyector del FWG');
  v('v-fwg-suc', 'FWG ejector pump sea suction valve', 'Aspiración de mar de la bomba del eyector');
  v('v-fwg-feed', 'FWG feed water valve', 'Válvula de agua de alimentación del FWG');
  v('v-fwg-hwin', 'FWG hot water inlet valve', 'Válvula de entrada de agua caliente (camisas) al FWG');
  v('v-fwg-hwout', 'FWG hot water outlet valve', 'Válvula de salida de agua caliente del FWG');
  v('v-fwg-air', 'FWG vacuum breaker (air valve)', 'Válvula rompevacío (aire) del FWG');
  v('v-fwg-fillP', 'Distillate to FW tank (P) valve', 'Válvula de destilado al tanque de agua dulce (Br)');
  v('v-fwg-fillS', 'Distillate to FW tank (S) valve', 'Válvula de destilado al tanque de agua dulce (Er)');
  v('v-fwP-out', 'FW tank (P) outlet valve', 'Válvula de salida del tanque de agua dulce (Br)');
  v('v-fwS-out', 'FW tank (S) outlet valve', 'Válvula de salida del tanque de agua dulce (Er)');
  v('v-hyd-out', 'Hydrophore tank outlet valve (to accommodation)', 'Válvula de salida del hidróforo (a la habilitación)');
  v('v-cal-steam', 'Calorifier steam valve', 'Válvula de vapor del calorífero');

  addTank(p, 'fwTankP', { en: 'FW tank (P)', es: 'Tanque de agua dulce (Br)', cap: 120, level: 80, temp: 28, fluid: 'fw' });
  addTank(p, 'fwTankS', { en: 'FW tank (S)', es: 'Tanque de agua dulce (Er)', cap: 120, level: 80, temp: 28, fluid: 'fw' });
  addTank(p, 'hydTank', { en: 'Hydrophore tank', es: 'Tanque hidróforo', cap: HYD_VT, level: 0.75, temp: 28, fluid: 'fw' });
  addTank(p, 'calorifier', { en: 'Calorifier (hot water)', es: 'Calorífero (agua caliente)', cap: 1, level: 1, temp: 60, fluid: 'fw' });

  p.fwg = { vac: 0, heat: 0, prod: 0, ppm: 0, toTank: false, cond: 0, producing: false, mode: 'auto', delivered: 0 };
  p.san = { air: HYD_AIR, press: 4, lead: 'hyd1', demand: 0, calOn: false, used: 0 };
}

export const FAULTS = [
  { id: 'fwgEj', en: 'FWG ejector pump failure', es: 'Avería de la bomba del eyector del FWG', system: 'fwg' },
  { id: 'fwgDp', en: 'FWG distillate pump failure', es: 'Avería de la bomba de destilado del FWG', system: 'fwg' },
  { id: 'fwg-vac-leak', en: 'FWG vacuum leak (shell / door joint)', es: 'Pérdida de vacío en el FWG (junta de la carcasa)', system: 'fwg' },
  { id: 'fwg-salinity', en: 'FWG condenser tube leak (high salinity)', es: 'Fuga en los tubos del condensador del FWG (salinidad alta)', system: 'fwg' },
  { id: 'hyd1', en: 'Hydrophore pump No 1 failure', es: 'Avería de la bomba del hidróforo nº 1', system: 'sanitary' },
  { id: 'hyd2', en: 'Hydrophore pump No 2 failure', es: 'Avería de la bomba del hidróforo nº 2', system: 'sanitary' },
  { id: 'hyd-air', en: 'Hydrophore tank air cushion lost (waterlogged)', es: 'Hidróforo sin colchón de aire (anegado)', system: 'sanitary' },
  { id: 'calHeater', en: 'Calorifier heater failure', es: 'Avería de la resistencia del calorífero', system: 'sanitary' },
];

function fwgStep(p, dt) {
  const f = p.fwg;
  for (const id of ['fwgEj', 'fwgDp']) p.c[id].fault = Boolean(p.faults[id]);
  // Vacío: el eyector (bomba de mar) extrae el aire y los incondensables de la carcasa.
  const ej = p.c.fwgEj.run && isOpen(p, 'v-fwg-ovbd') && isOpen(p, 'v-fwg-suc');
  p.c.fwgEj.load = ej ? 1 : 0.5;
  let target = 0;
  if (ej) target = isOpen(p, 'v-fwg-air') ? -0.3 : p.faults['fwg-vac-leak'] ? -0.68 : -0.93;
  f.vac = lag(f.vac, target, target < f.vac ? 45 : 25, dt);
  const ts = tSat(1.013 + f.vac);
  f.tSat = ts;

  // Calor: agua de camisas del motor principal en marcha (>70 °C) a través del evaporador.
  const htT = p.sig.htTemp ?? 20;
  const hot = isOpen(p, 'v-fwg-hwin') && isOpen(p, 'v-fwg-hwout') && (p.sig.htFlow ?? 0) > 0.3 && Boolean(p.sig.meRunning ?? false);
  const feed = isOpen(p, 'v-fwg-feed') && ej;
  f.hot = hot;
  const flood = f.cond > 0.8 ? clamp((1 - f.cond) / 0.2, 0, 1) : 1; // condensador inundado si no se extrae el destilado
  const heatT = hot && feed ? clamp(FWG_UA * (htT - ts), 0, FWG_MAX_KW) * flood : 0;
  f.heat = lag(f.heat, heatT, 60, dt);
  f.prod = clamp(((f.heat / LATENT) * 86.4), 0, 25); // t/día de destilado
  const producing = f.prod > 1;
  if (producing && !f.producing) f.ppm = Math.max(f.ppm, 25); // al empezar a destilar sale con sal (arrastres)
  f.producing = producing;
  const ppmT = p.faults['fwg-salinity'] ? 45 : 1.5;
  f.ppm = producing ? lag(f.ppm, ppmT, 90, dt) : lag(f.ppm, 0, 600, dt);

  // Bomba de destilado y salinómetro: < 10 ppm → electroválvula a tanques; si no → descarga (dump).
  const dp = p.c.fwgDp.run;
  f.cond = clamp(f.cond + ((f.prod / 25) * dt) / 180 - (dp ? dt / 40 : 0), 0, 1);
  if (f.mode === 'dump') f.toTank = false;
  else if (f.ppm > SAL_LIMIT) f.toTank = false;
  else if (f.ppm < SAL_LIMIT * 0.8) f.toTank = true;
  const m3 = dp ? (f.prod / 86400) * dt : 0;
  f.delivered = 0;
  if (m3 > 0 && f.toTank) {
    const fills = [['fwTankP', 'v-fwg-fillP'], ['fwTankS', 'v-fwg-fillS']].filter(([, vv]) => isOpen(p, vv)).map(([t]) => p.c[t]);
    for (const t of fills) {
      const add = Math.min(m3 / fills.length, t.cap - t.level);
      t.level += add;
      f.delivered += add / dt * 86400;
    }
  }

  p.sig.fwgProduction = f.prod;
  p.sig.fwgHeatKw = f.heat;
  const inService = p.c.fwgEj.cmd && (isOpen(p, 'v-fwg-hwin') || f.prod > 1);
  alarm(p, 'fwg-vac-low', inService && f.vac > -0.8, 'Fresh water generator vacuum low', 'Vacío bajo en el generador de agua dulce');
  alarm(p, 'fwg-sal-high', producing && f.ppm > SAL_LIMIT, 'FWG distillate high salinity (dumping)', 'Salinidad alta del destilado del FWG (descargando)', 'warn');
  alarm(p, 'fwg-cond-high', f.cond > 0.7, 'FWG condenser high level (distillate pump)', 'Nivel alto en el condensador del FWG (bomba de destilado)');
  alarm(p, 'fwg-ht-low', isOpen(p, 'v-fwg-hwin') && Boolean(p.sig.meRunning) && htT < 70, 'FWG heating water temperature low', 'Temperatura baja del agua de calefacción del FWG', 'warn');
  alarm(p, 'fwg-coast', producing && (p.env.seaDistanceNm ?? 30) < 20, 'FWG running within 20 nm of the coast', 'FWG en marcha a menos de 20 millas de la costa', 'warn');
}

function sanitaryStep(p, dt) {
  const s = p.san;
  for (const id of ['hyd1', 'hyd2', 'calHeater']) p.c[id].fault = Boolean(p.faults[id]);
  if (p.faults['hyd-air']) s.air = Math.max(2.2, s.air - 0.002 * dt);
  const ht = p.c.hydTank;
  const srcs = [['fwTankP', 'v-fwP-out'], ['fwTankS', 'v-fwS-out']].filter(([t, v]) => isOpen(p, v) && p.c[t].level > 0.3).map(([t]) => p.c[t]);

  // Presostato: la bomba principal (lead) arranca a 3 bar y para a 5 bar; la otra arranca si baja de 2,6 bar.
  const lag2 = s.lead === 'hyd1' ? 'hyd2' : 'hyd1';
  for (const [id, on] of [[s.lead, 3.0], [lag2, 2.6]]) {
    const m = p.c[id];
    if (!m.auto) continue;
    if (s.press < on) m.cmd = true;
    else if (s.press >= 5.0) m.cmd = false;
  }
  let qIn = 0;
  for (const id of ['hyd1', 'hyd2']) if (p.c[id].run && srcs.length) qIn += HYD_Q * Math.sqrt(Math.max(0, 1 - s.press / 7));
  // Consumo de la tripulación (≈ 15 t/día con variación a lo largo del día).
  const day = 1 + 0.4 * Math.sin((2 * Math.PI * p.t) / 86400);
  const qOut = isOpen(p, 'v-hyd-out') && ht.level > 0.02 ? ((DAY_T / 86400) * day) * Math.min(1, Math.sqrt(Math.max(0, s.press) / 3)) : 0;
  s.demand = qOut;
  for (const t of srcs) t.level = Math.max(0, t.level - (qIn * dt) / srcs.length);
  ht.level = clamp(ht.level + (qIn - qOut) * dt, 0, HYD_VT - 0.05);
  s.used += qOut * dt;
  // Colchón de aire (isotermo): P·V = cte.
  const pAbs = s.air / (HYD_VT - ht.level);
  s.press = Math.max(0, Math.min(9, pAbs - 1.013));
  if (s.press > 6.5) { ht.level -= 0.002 * dt; } // válvula de seguridad

  // Calorífero: termostato 57–63 °C con resistencia eléctrica, y vapor si se abre su válvula.
  const cal = p.c.calorifier;
  const heater = p.c.calHeater;
  if (heater.auto) {
    if (cal.temp < 57) heater.cmd = true;
    else if (cal.temp > 63) heater.cmd = false;
  }
  const steam = isOpen(p, 'v-cal-steam') ? CAL_STEAM_KW * (p.sig.steamAvail ?? 1) * (cal.temp < 70 ? 1 : 0) : 0;
  const qHot = 0.35 * qOut; // agua caliente consumida (m³/s)
  const cold = p.env.swTemp ?? 28;
  const kw = (heater.run ? CAL_KW : 0) + steam - qHot * 1000 * 4.186 * (cal.temp - cold) - 0.15 * (cal.temp - 30);
  cal.temp = clamp(cal.temp + (kw / (cal.cap * 4186)) * dt, 0, 95);

  const total = p.c.fwTankP.cap + p.c.fwTankS.cap;
  p.sig.fwTankPct = (100 * (p.c.fwTankP.level + p.c.fwTankS.level)) / total;
  const armed = ['hyd1', 'hyd2'].some((id) => p.c[id].cmd || (p.c[id].auto && p.sig.msbLive));
  alarm(p, 'san-fwp-low', pct(p.c.fwTankP) < 15, 'FW tank (P) low level', 'Nivel bajo del tanque de agua dulce (Br)');
  alarm(p, 'san-fws-low', pct(p.c.fwTankS) < 15, 'FW tank (S) low level', 'Nivel bajo del tanque de agua dulce (Er)');
  alarm(p, 'san-hyd-low', armed && isOpen(p, 'v-hyd-out') && s.press < 2.0, 'Hydrophore tank low pressure', 'Presión baja en el hidróforo');
  alarm(p, 'san-cal-low', heater.auto && p.sig.msbLive && cal.temp < 45, 'Calorifier low hot water temperature', 'Temperatura baja del agua caliente del calorífero', 'warn');
}

export function step(p, dt) {
  fwgStep(p, dt);
  sanitaryStep(p, dt);
}

export const actions = {
  // Salinómetro: AUTO (electroválvula según ppm) o descarga forzada (DUMP).
  fwgSalMode(p, mode) {
    p.fwg.mode = mode === 'dump' ? 'dump' : 'auto';
    log(p, `fwg-sal:${p.fwg.mode}`, `FWG salinometer ${p.fwg.mode === 'dump' ? 'forced DUMP' : 'AUTO'}.`, `Salinómetro del FWG en ${p.fwg.mode === 'dump' ? 'descarga forzada' : 'AUTO'}.`);
    return null;
  },
  // Bomba principal del hidróforo.
  hydLead(p, id) {
    if (!['hyd1', 'hyd2'].includes(id)) return M('Unknown pump.', 'Bomba desconocida.');
    p.san.lead = id;
    log(p, `hyd-lead:${id}`, `${p.c[id].en} selected as lead pump.`, `${p.c[id].es}: seleccionada como principal.`);
    return null;
  },
  // Recarga del colchón de aire del hidróforo con aire de servicio (se drena un poco de agua a la vez).
  hydAirCharge(p) {
    if ((p.sig.serviceAir ?? 0) < 3) return M('No service air available (open the service air valve).', 'No hay aire de servicio (abre la válvula de aire de servicio).');
    p.san.air = HYD_AIR;
    p.c.hydTank.level = Math.min(p.c.hydTank.level, 0.6);
    log(p, 'hyd-air-charge', 'Hydrophore tank air cushion recharged.', 'Colchón de aire del hidróforo recargado.');
    return null;
  },
};

function fwgOn(p, on) {
  for (const id of ['v-fwg-ovbd', 'v-fwg-suc', 'v-fwg-feed', 'v-fwg-hwin', 'v-fwg-hwout', 'v-fwg-fillP']) Object.assign(p.c[id], { open: on, pos: on ? 1 : 0 });
  p.c.fwgEj.cmd = on;
  p.c.fwgDp.cmd = on;
  Object.assign(p.fwg, on ? { vac: -0.93, heat: 650, ppm: 2, toTank: true, producing: true } : { vac: 0, heat: 0, ppm: 0, toTank: false });
}
function sanitaryOn(p, on) {
  for (const id of ['v-fwP-out', 'v-fwS-out', 'v-hyd-out']) Object.assign(p.c[id], { open: on, pos: on ? 1 : 0 });
  for (const id of ['hyd1', 'hyd2', 'calHeater']) Object.assign(p.c[id], { auto: on, cmd: false });
}
export const setup = {
  sea(p) { fwgOn(p, true); sanitaryOn(p, true); },
  port(p) { fwgOn(p, false); sanitaryOn(p, true); },
  dead(p) {
    fwgOn(p, false);
    sanitaryOn(p, false);
    // Hidróforo despresurizado y agua caliente fría.
    // Hidróforo vacío y venteado: hay que recargar el colchón de aire con aire de servicio.
    p.c.hydTank.level = 0.05;
    p.san.air = 1.013 * HYD_VT;
    p.san.press = 0;
    p.c.calorifier.temp = p.env.ambient ?? 35;
  },
};

// Hitos de la puesta en marcha desde buque muerto (agua sanitaria y FWG), en orden.
export const STARTUP = [
  { en: 'Hydrophore in service (pump in AUTO, above 3 bar)', es: 'Hidróforo en servicio (bomba en AUTO, más de 3 bar)', check: (p) => ['hyd1', 'hyd2'].some((id) => p.c[id].auto) && p.san.press > 3 && isOpen(p, 'v-hyd-out') },
  { en: 'Calorifier heating (hot water above 50 °C)', es: 'Calorífero calentando (agua caliente por encima de 50 °C)', check: (p) => p.c.calorifier.temp > 50 },
  { en: 'FWG vacuum established (below -0.85 bar)', es: 'Vacío establecido en el FWG (menos de -0,85 bar)', check: (p) => p.fwg.vac < -0.85 },
  { en: 'FWG producing to the FW tanks (salinity below 10 ppm)', es: 'FWG produciendo hacia los tanques (salinidad menor de 10 ppm)', check: (p) => p.fwg.prod > 10 && p.fwg.toTank && p.c.fwgDp.run },
];
