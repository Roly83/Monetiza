// Sistema de aceite lubricante: aceite del motor principal (cárter, bombas, enfriador, filtro automático),
// trasiego de aceite (almacén, sedimentación, cárteres de los generadores, tanque de bocina) y
// depuradoras de aceite del MP y de los generadores (misma lógica que las de HFO, en fuel.js).
import { addMotor, addValve, addTank, isOpen, alarm, log, lag, clamp, transfer, pct, standbyPair, M } from '../core.js';
import { addPurifier, purifierStep, purifierRunning, purState } from './fuel.js';

const C_SUMP = 34000; // kJ/K del aceite del cárter (~20 m³)
const MCP_OIL = 114; // kW/K caudal de aceite × calor específico (bomba de ~250 m³/h)
const UA_COOLER = 60; // kW/K del enfriador con la válvula toda al enfriador
const DGS = [1, 2, 3];

export function init(p) {
  const tank = (id, en, es, cap, level, temp = 40, water = 0.05) => { addTank(p, id, { en, es, cap, level, temp, fluid: 'lo' }).water = water; };
  tank('meSump', 'ME LO sump tank', 'Cárter (tanque de aceite) del motor principal', 30, 21, 45, 0.05);
  tank('loStor', 'LO storage tank', 'Tanque almacén de aceite', 40, 26, 35);
  tank('loSett', 'LO settling tank', 'Tanque de sedimentación de aceite', 20, 8, 35, 0.3);
  for (const n of DGS) tank(`dg${n}Sump`, `DG No ${n} LO sump`, `Cárter del generador nº ${n}`, 1.5, 1.15, 60, 0.05);

  addMotor(p, 'melp1', { en: 'ME LO pump No 1', es: 'Bomba de aceite del MP nº 1', kw: 90 });
  addMotor(p, 'melp2', { en: 'ME LO pump No 2', es: 'Bomba de aceite del MP nº 2', kw: 90 });
  addMotor(p, 'lotp', { en: 'LO transfer pump', es: 'Bomba de trasiego de aceite', kw: 4 });
  addValve(p, 'tcv-melo', { en: 'ME LO temperature control valve (cooler)', es: 'Válvula termostática del aceite del MP (enfriador)', kind: 'cvalve', open: true });
  p.c['tcv-melo'].auto = true;
  p.c['tcv-melo'].pos = 0.4;
  const v = (id, en, es, open = false) => addValve(p, id, { en, es, open });
  v('v-lot-stor', 'LO storage tank outlet valve', 'Válvula de salida del almacén de aceite');
  v('v-lot-sett', 'LO settling tank outlet valve', 'Válvula de salida de la sedimentación de aceite');
  v('v-lot-me', 'LO transfer to ME sump valve', 'Válvula trasiego → cárter del MP');
  for (const n of DGS) v(`v-lot-dg${n}`, `LO transfer to DG No ${n} sump valve`, `Válvula trasiego → cárter del generador nº ${n}`);
  v('v-lot-stern', 'LO transfer to stern tube tank valve', 'Válvula trasiego → tanque de bocina');
  v('v-lot-tosett', 'LO transfer to settling tank valve', 'Válvula trasiego → sedimentación de aceite');
  for (const n of DGS) v(`v-dglop-dg${n}`, `DG LO purifier: DG No ${n} suction/return valves`, `Depuradora de aceite DG: válvulas de aspiración/retorno del generador nº ${n}`);
  addPurifier(p, 'melop', { en: 'ME LO purifier', es: 'Depuradora de aceite del MP', oil: 'lo', setT: 90, rate: 3000, maxRate: 5000, kw: 15,
    srcEn: 'ME sump', srcEs: 'cárter del MP', dstEn: 'ME sump', dstEs: 'cárter del MP' });
  addPurifier(p, 'dglop', { en: 'DG LO purifier', es: 'Depuradora de aceite de los generadores', oil: 'lo', setT: 90, rate: 600, maxRate: 1200, kw: 7.5,
    srcEn: 'selected DG sump', srcEs: 'cárter del generador elegido', dstEn: 'selected DG sump', dstEs: 'cárter del generador elegido' });
  p.lube = { Ts: 47, Tin: 45, press: 0, dp: 0.3, I: 0.4, steamKgH: 0, flushes: 0 };
}

export const FAULTS = [
  { id: 'melp1', en: 'ME LO pump No 1 failure', es: 'Avería de la bomba de aceite del MP nº 1', system: 'lube' },
  { id: 'melp2', en: 'ME LO pump No 2 failure', es: 'Avería de la bomba de aceite del MP nº 2', system: 'lube' },
  { id: 'lo-filter', en: 'ME LO auto filter clogging', es: 'Obstrucción del filtro automático de aceite del MP', system: 'lube' },
  { id: 'lo-cooler', en: 'ME LO cooler fouled', es: 'Enfriador de aceite del MP sucio', system: 'lube' },
  { id: 'lo-water', en: 'Water ingress into ME LO (cooler leak)', es: 'Entrada de agua en el aceite del MP (fuga del enfriador)', system: 'lube' },
  { id: 'melop', en: 'ME LO purifier motor failure', es: 'Avería del motor de la depuradora de aceite del MP', system: 'lube' },
  { id: 'dglop-disch', en: 'DG LO purifier discharge failure', es: 'Fallo de descarga de la depuradora de aceite DG', system: 'lube' },
];

const dgSel = (p) => DGS.filter((n) => isOpen(p, `v-dglop-dg${n}`)).map((n) => p.c[`dg${n}Sump`]);

export function step(p, dt) {
  const c = p.c, L = p.lube;
  for (const id of ['melp1', 'melp2', 'lotp']) c[id].fault = Boolean(p.faults[id]);
  const steam = p.sig.steamAvail ?? 1;
  let steamKgH = 0;
  const meRunning = Boolean(p.sig.meRunning);
  const meKw = Math.max(0, p.sig.mePowerKw ?? 0);

  // ---------- Depuradoras de aceite ----------
  const heatBack = () => {};
  const r1 = purifierStep(p, 'melop', {
    src: () => c.meSump, dst: () => c.meSump, srcTemp: () => L.Ts, sludge: c.sludge ?? { level: 0, cap: 1e9 }, heatDst: heatBack,
    steamUse: (kg) => { steamKgH += kg * steam; },
  }, dt);
  const sel = dgSel(p);
  const dgT = sel.length ? sel.reduce((a, t) => a + t.temp, 0) / sel.length : 40;
  purifierStep(p, 'dglop', {
    src: () => sel[0] ?? null, dst: () => sel[0] ?? null, srcTemp: () => dgT, sludge: c.sludge ?? { level: 0, cap: 1e9 }, heatDst: heatBack,
    steamUse: (kg) => { steamKgH += kg * steam; },
  }, dt);
  // Calor que aporta la depuradora al cárter (el aceite vuelve caliente)
  const s1 = p.pur.melop;
  const qPur = s1.flow > 0 ? ((s1.flow / 3600) * 0.9 * 1.9 * Math.max(0, s1.temp - L.Ts)) : 0; // kW
  void r1;

  // ---------- Aceite del motor principal ----------
  const pumps = (c.melp1.run ? 1 : 0) + (c.melp2.run ? 1 : 0);
  // Filtro automático
  if (p.faults['lo-filter']) L.dp = Math.min(3, L.dp + (pumps ? 0.002 : 0) * dt);
  else {
    L.dp = pumps ? L.dp + 0.00015 * dt : lag(L.dp, 0, 5, dt);
    if (L.dp > 0.5) { L.dp = 0.3; L.flushes++; }
    if (pumps && L.dp < 0.3) L.dp = lag(L.dp, 0.3, 5, dt);
  }
  // Temperaturas: balance de calor del cárter con el enfriador (refrigerado por agua BT)
  const tcv = c['tcv-melo'];
  const ltT = p.sig.ltTemp ?? 36;
  const ltF = clamp(p.sig.ltFlow ?? 1, 0, 1);
  const ua = UA_COOLER * (p.faults['lo-cooler'] ? 0.3 : 1) * ltF;
  const qCool = pumps ? tcv.pos * ua * Math.max(0, L.Ts - ltT) : 0;
  const qEng = meRunning ? 150 + 0.025 * meKw : 0;
  const qPump = pumps * 60; // la energía de la bomba acaba en calor
  const qLoss = 2 * (L.Ts - 35);
  L.Ts += ((qEng + qPump + qPur - qCool - qLoss) / C_SUMP) * dt;
  L.Tin = pumps ? L.Ts - qCool / MCP_OIL : L.Ts;
  // Regulador PI de la válvula termostática (45 °C a la entrada del motor)
  if (tcv.auto && pumps) {
    const e = L.Tin - 45;
    L.I = clamp(L.I + 0.002 * e * dt, 0, 1);
    tcv.pos = clamp(0.08 * e + L.I, 0, 1);
    tcv.open = tcv.pos > 0.02;
  } else if (!tcv.auto) L.I = tcv.pos;
  // Presión
  const level = pct(c.meSump);
  const suct = level > 15;
  const pTarget = pumps && suct ? 2.8 + 0.015 * (45 - L.Tin) + (pumps === 2 ? 0.5 : 0) - Math.max(0, L.dp - 0.3) * 0.7 : 0;
  L.press = lag(L.press, Math.max(0, pTarget), 2, dt);
  L.runT = pumps ? (L.runT ?? 0) + dt : 0; // la presión tarda unos segundos en subir tras el arranque
  standbyPair(p, ['melp1', 'melp2'], L.runT > 10 && L.press < 2.2, 'ME LO pumps', 'Bombas de aceite del MP');

  // Agua en el aceite (fuga del enfriador) y consumo de aceite del motor
  if (p.faults['lo-water'] && pumps) c.meSump.water = Math.min(5, c.meSump.water + 0.0004 * dt);
  if (meRunning) transfer(c.meSump, null, (meKw * 0.15e-6 / 0.9 / 3600) * dt);
  for (const [i, kw] of (p.sig.dgKw ?? []).entries()) {
    const t = c[`dg${i + 1}Sump`];
    if (t && kw > 0) transfer(t, null, (kw * 0.8e-6 / 0.9 / 3600) * dt);
    if (t) t.temp = lag(t.temp, kw > 0 ? 75 : 40, 900, dt);
  }

  // ---------- Trasiego de aceite ----------
  const m = c.lotp;
  const sucs = [['v-lot-stor', c.loStor], ['v-lot-sett', c.loSett]].filter(([vv, t]) => isOpen(p, vv) && t.level > 0.02 * t.cap).map(([, t]) => t);
  const dsts = [['v-lot-me', c.meSump], ...DGS.map((n) => [`v-lot-dg${n}`, c[`dg${n}Sump`]]), ['v-lot-stern', c.stGrav], ['v-lot-tosett', c.loSett]]
    .filter(([vv, t]) => t && isOpen(p, vv) && t.level < t.cap * 0.999).map(([, t]) => t);
  const lotOk = m.run && sucs.length && dsts.length;
  if (lotOk) {
    const q = (5 / 3600) * dt;
    for (const src of sucs) for (const d of dsts) if (src !== d) {
      const w = src.water ?? 0;
      const mv = transfer(src, d, q / sucs.length / dsts.length);
      if (mv > 0) d.water = ((d.water ?? 0) * (d.level - mv) + w * mv) / d.level;
    }
  }
  m.load = lotOk ? 1 : 0.4;
  L.steamKgH = steamKgH;

  // ---------- Señales ----------
  p.sig.meLoPress = L.press;
  p.sig.meLoTemp = L.Tin;
  p.sig.meLoOk = L.press >= 2.0 && suct;

  // ---------- Alarmas ----------
  const needLo = c.melp1.cmd || c.melp2.cmd || meRunning;
  alarm(p, 'lo-press-low', needLo && L.press < 2.2, 'ME LO inlet pressure low', 'Presión baja de aceite a la entrada del MP');
  alarm(p, 'lo-temp-high', L.Tin > 55, 'ME LO inlet temperature high', 'Temperatura alta del aceite a la entrada del MP');
  alarm(p, 'lo-sump-low', level < 40, 'ME LO sump tank low level', 'Nivel bajo en el cárter del MP');
  alarm(p, 'lo-filter-dp', L.dp > 1.0, 'ME LO auto filter high differential pressure', 'Presión diferencial alta en el filtro automático de aceite del MP');
  alarm(p, 'lo-water', c.meSump.water > 0.2, 'Water in ME lubricating oil', 'Agua en el aceite del MP', 'warn');
  for (const n of DGS) alarm(p, `lo-dg${n}-low`, pct(c[`dg${n}Sump`]) < 50, `DG No ${n} LO sump low level`, `Nivel bajo en el cárter del generador nº ${n}`, 'warn');
  alarm(p, 'lo-lotp-noflow', m.run && !lotOk, 'LO transfer pump running without flow (check valves)', 'Bomba de trasiego de aceite en marcha sin caudal (revisa las válvulas)', 'warn');
  alarm(p, 'lo-dglop-sel', c.dglop.run && sel.length !== 1 && p.pur.dglop.feed, 'DG LO purifier: open the valves of ONE generator', 'Depuradora de aceite DG: abre las válvulas de UN solo generador', 'warn');
}

export const actions = {
  loFilterFlush(p) {
    if (p.faults['lo-filter']) return M('Back-flush failed: the filter element is clogged.', 'El contralavado ha fallado: el elemento filtrante está obstruido.');
    p.lube.dp = 0.3; p.lube.flushes++;
    log(p, 'lo-flush', 'ME LO auto filter back-flushed.', 'Contralavado del filtro automático de aceite del MP.');
    return null;
  },
  dglopSelect(p, n) {
    for (const k of DGS) { const vv = p.c[`v-dglop-dg${k}`]; vv.open = k === n; vv.pos = k === n ? 1 : 0; }
    log(p, `dglop-sel:${n}`, `DG LO purifier lined up to DG No ${n}.`, `Depuradora de aceite DG alineada al generador nº ${n}.`);
    return null;
  },
};

function meLoRunning(p) {
  const c = p.c;
  c.melp1.cmd = c.melp1.run = true;
  c.melp2.standby = true;
  p.lube.press = 2.8;
}

export const setup = {
  sea(p) {
    meLoRunning(p);
    purifierRunning(p, 'melop', 0.75);
    p.c['v-dglop-dg1'].open = true; p.c['v-dglop-dg1'].pos = 1;
    purifierRunning(p, 'dglop', 0.8);
  },
  port(p) {
    meLoRunning(p); // en marcha para precalentar el motor
    purifierRunning(p, 'melop', 0.75);
    p.c['v-dglop-dg1'].open = true; p.c['v-dglop-dg1'].pos = 1;
    purifierRunning(p, 'dglop', 0.8);
  },
  dead(p) {
    const L = p.lube;
    Object.assign(L, { Ts: 35, Tin: 35, press: 0, dp: 0, I: 0.2 });
    p.c.meSump.temp = 35;
    for (const id of ['melop', 'dglop']) p.pur[id].temp = 35;
  },
};

export const STARTUP = [
  { en: 'ME LO pump running, pressure OK', es: 'Bomba de aceite del MP en marcha, presión correcta', check: (p) => (p.sig.meLoPress ?? 0) > 2.4 && (p.c.melp1.run || p.c.melp2.run) },
  { en: 'ME LO standby pump selected', es: 'Bomba de aceite del MP en reserva', check: (p) => p.c.melp1.standby || p.c.melp2.standby },
  { en: 'ME LO purifier in operation', es: 'Depuradora de aceite del MP separando', check: (p) => purState(p, 'melop') === 'separating' },
];
