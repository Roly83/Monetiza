// Sistema de refrigeración central y contraincendios:
// - Agua de mar (SW): tomas de mar alta/baja, bombas de agua de mar con reserva, enfriadores centrales (placas) → costado.
// - Agua dulce de baja temperatura (LT): bombas LT (la nº 2 en el cuadro de emergencia), válvula de 3 vías que regula ~36 °C.
// - Agua dulce de alta temperatura (HT, camisas del motor principal): bombas HT, válvula de 3 vías ~85 °C,
//   precalentador de vapor (~60 °C con el motor parado) y consumo de calor del generador de agua dulce.
// - Colector contraincendios: bomba principal, bomba de C.I. y servicios generales, bomba de emergencia (ESB),
//   válvula de aislamiento cámara de máquinas / cubierta e hidrantes.
import { addMotor, addValve, addTank, isOpen, alarm, log, clamp, lag, standbyPair, pct, M } from '../core.js';

// Constantes del modelo (kW/K, kJ/K)
const UA_CC = 900; // enfriador central limpio, por unidad
const SW_CP = 900; // caudal de agua de mar de diseño × cp (kW/K) por bomba
const LT_CP = 470; // caudal LT de diseño × cp
const C_LT = 20000; // capacidad térmica del circuito LT
const C_HT = 10000; // capacidad térmica del circuito HT (camisas)
const EPS_HT = 120; // enfriador HT (HT → LT)
const PREHEAT_KW = 150; // precalentador de vapor del agua de camisas
const AUX_LT_KW = 120; // otros consumidores LT (compresores, AC, etc.)

const ELEC_PREHEAT_KW = 90; // precalentador eléctrico (cuando no hay vapor: buque muerto)
const PUMPS = ['swp1', 'swp2', 'ltp1', 'ltp2', 'htp1', 'htp2', 'fp1', 'fgsp', 'efp'];
// Bombas contraincendios: presión a caudal cero (bar) y caudal máximo (m³/h)
const FIRE = { fp1: { p0: 10.5, q: 160, sec: 'er' }, fgsp: { p0: 10, q: 140, sec: 'er' }, efp: { p0: 9.5, q: 72, sec: 'deck' } };
const K_HYD = 5; // hidrante: m³/h por √bar
const K_RECIRC = 1.5; // recirculación mínima de cada bomba
const K_LEAK = 60; // rotura del colector en la cámara de máquinas

export function init(p) {
  const pump = (id, en, es, kw, extra = {}) => addMotor(p, id, { en, es, kw, kind: 'pump', ...extra });
  pump('swp1', 'Main sea water pump No 1', 'Bomba de agua de mar nº 1', 55, { restart: true });
  pump('swp2', 'Main sea water pump No 2', 'Bomba de agua de mar nº 2', 55, { restart: true });
  pump('ltp1', 'LT fresh water pump No 1', 'Bomba de agua dulce BT nº 1', 37, { restart: true });
  pump('ltp2', 'LT fresh water pump No 2', 'Bomba de agua dulce BT nº 2', 37, { bus: 'ESB', feeder: 'f-lt2', restart: true });
  pump('htp1', 'HT (jacket) fresh water pump No 1', 'Bomba de agua de camisas (AT) nº 1', 30, { restart: true });
  pump('htp2', 'HT (jacket) fresh water pump No 2', 'Bomba de agua de camisas (AT) nº 2', 30, { restart: true });
  pump('fp1', 'Main fire pump', 'Bomba contraincendios principal', 75);
  pump('fgsp', 'Fire & general service pump', 'Bomba de C.I. y servicios generales', 75);
  pump('efp', 'Emergency fire pump', 'Bomba contraincendios de emergencia', 30, { bus: 'ESB', feeder: 'f-efp' });
  addMotor(p, 'htph', { en: 'Jacket water electric preheater', es: 'Precalentador eléctrico del agua de camisas', kw: ELEC_PREHEAT_KW, kind: 'heater' });
  p.c.htph.interlock = (pp) => (Math.min(1, pp.cool.htQ) < 0.3 ? M('No jacket water flow: start an HT FW pump first (flow switch interlock).', 'Sin caudal de agua de camisas: arranca antes una bomba AT (enclavamiento por flujostato).') : null);

  const v = (id, en, es, open = true, kind = 'valve') => addValve(p, id, { en, es, open, kind });
  v('v-sc-high', 'High sea chest suction valve', 'Válvula de la toma de mar alta', false);
  v('v-sc-low', 'Low sea chest suction valve', 'Válvula de la toma de mar baja');
  v('v-cc1-sw', 'Central cooler No 1 SW inlet valve', 'Entrada de agua de mar al enfriador central nº 1');
  v('v-cc2-sw', 'Central cooler No 2 SW inlet valve', 'Entrada de agua de mar al enfriador central nº 2', false);
  v('v-cc1-lt', 'Central cooler No 1 LT inlet valve', 'Entrada de agua BT al enfriador central nº 1');
  v('v-cc2-lt', 'Central cooler No 2 LT inlet valve', 'Entrada de agua BT al enfriador central nº 2', false);
  v('v-sw-ovbd', 'SW overboard valve', 'Válvula de descarga al costado');
  v('cv-lt', 'LT temperature control valve (3-way)', 'Válvula de 3 vías de temperatura BT', true, 'cvalve');
  v('cv-ht', 'HT temperature control valve (3-way)', 'Válvula de 3 vías de temperatura AT', true, 'cvalve');
  v('v-preheat', 'Jacket water preheater steam valve', 'Válvula de vapor del precalentador de camisas');
  v('v-lt-makeup', 'LT expansion tank make-up valve', 'Válvula de reposición del tanque de expansión BT', false);
  v('v-ht-makeup', 'HT expansion tank make-up valve', 'Válvula de reposición del tanque de expansión AT', false);
  v('v-fire-iso', 'Fire main isolating valve (ER / deck)', 'Válvula de aislamiento del colector C.I. (máquinas / cubierta)');
  v('v-efp-suc', 'Emergency fire pump sea suction valve', 'Válvula de aspiración de mar de la bomba C.I. de emergencia');
  v('v-hyd-er', 'Engine room hydrants', 'Hidrantes de la cámara de máquinas', false);
  v('v-hyd-deck1', 'Deck hydrant No 1 (fwd)', 'Hidrante de cubierta nº 1 (proa)', false);
  v('v-hyd-deck2', 'Deck hydrant No 2 (accommodation)', 'Hidrante de cubierta nº 2 (habilitación)', false);
  for (const id of ['cv-lt', 'cv-ht']) p.c[id].auto = true;
  p.c['cv-lt'].pos = 0.4;
  p.c['cv-ht'].pos = 0.3;

  addTank(p, 'ltExp', { en: 'LT expansion tank', es: 'Tanque de expansión BT', cap: 1.5, level: 1.05, temp: 36, fluid: 'lt' });
  addTank(p, 'htExp', { en: 'HT expansion tank', es: 'Tanque de expansión AT', cap: 1, level: 0.7, temp: 60, fluid: 'ht' });

  p.cool = {
    ltT: 36, htT: 80, ltRet: 38, htIn: 78, swOut: 30, ltSp: 36, htSp: 85,
    iLt: 0.4, iHt: 0.3, preheat: false, elHeat: false, fireLowT: 0, swPress: 0, ltPress: 0, htPress: 0, swQ: 0, ltQ: 0, htQ: 0,
    qLt: 0, qCool: 0, qJacket: 0, qHtCool: 0, fireEr: 0, fireDeck: 0, fireQ: 0,
  };
}

export const FAULTS = [
  { id: 'swp1', en: 'Main SW pump No 1 failure', es: 'Avería de la bomba de agua de mar nº 1', system: 'cooling' },
  { id: 'swp2', en: 'Main SW pump No 2 failure', es: 'Avería de la bomba de agua de mar nº 2', system: 'cooling' },
  { id: 'ltp1', en: 'LT FW pump No 1 failure', es: 'Avería de la bomba BT nº 1', system: 'cooling' },
  { id: 'htp1', en: 'HT FW pump No 1 failure', es: 'Avería de la bomba AT nº 1', system: 'cooling' },
  { id: 'sw-strainer', en: 'Low sea chest strainer clogged', es: 'Filtro de la toma de mar baja obstruido', system: 'cooling' },
  { id: 'cc-fouled', en: 'Central cooler No 1 fouled (SW side)', es: 'Enfriador central nº 1 sucio (lado agua de mar)', system: 'cooling' },
  { id: 'cv-lt-stuck', en: 'LT 3-way control valve stuck', es: 'Válvula de 3 vías BT agarrotada', system: 'cooling' },
  { id: 'ht-leak', en: 'HT jacket water leak', es: 'Fuga de agua de camisas (AT)', system: 'cooling' },
  { id: 'fp1', en: 'Main fire pump failure', es: 'Avería de la bomba contraincendios principal', system: 'fire' },
  { id: 'efp', en: 'Emergency fire pump failure', es: 'Avería de la bomba C.I. de emergencia', system: 'fire' },
  { id: 'fire-leak', en: 'Fire main burst in the engine room', es: 'Rotura del colector C.I. en la cámara de máquinas', system: 'fire' },
];

const nRun = (p, ids) => ids.filter((id) => p.c[id].run).length;
const armed = (p, ids) => ids.some((id) => p.c[id].cmd || p.c[id].standby);

// Presión de equilibrio de un tramo del colector C.I.: caudal de las bombas = caudal por hidrantes/fugas.
function fireNode(pumps, k) {
  if (!pumps.length) return { press: 0, q: 0 };
  const supply = (P) => pumps.reduce((a, f) => a + f.q * Math.sqrt(Math.max(0, 1 - P / f.p0)), 0);
  let lo = 0, hi = Math.max(...pumps.map((f) => f.p0));
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (supply(mid) > k * Math.sqrt(mid)) lo = mid; else hi = mid;
  }
  return { press: lo, q: k * Math.sqrt(lo) };
}

export function step(p, dt) {
  const c = p.cool;
  for (const id of PUMPS) p.c[id].fault = Boolean(p.faults[id]);
  p.c['cv-lt'].fault = Boolean(p.faults['cv-lt-stuck']);
  const swT = p.env.swTemp ?? 28;
  const erT = p.env.ambient ?? 35;

  // ---------- Agua de mar ----------
  const lowSc = isOpen(p, 'v-sc-low') ? (p.faults['sw-strainer'] ? 0.35 : 1) : 0;
  const highSc = isOpen(p, 'v-sc-high') ? 1 : 0;
  const suction = Math.max(lowSc, highSc);
  const ccSw = [isOpen(p, 'v-cc1-sw'), isOpen(p, 'v-cc2-sw')];
  const swPath = isOpen(p, 'v-sw-ovbd') && ccSw.some(Boolean);
  const nSw = nRun(p, ['swp1', 'swp2']);
  const swQ = nSw ? (nSw === 1 ? 1 : 1.25) * suction * (swPath ? 1 : 0) : 0;
  c.swQ = lag(c.swQ, swQ, 3, dt);
  c.swPress = lag(c.swPress, nSw ? suction * (swPath ? 1.8 + 0.5 * (nSw - 1) : 3.1) : 0, 2, dt);
  for (const id of ['swp1', 'swp2']) p.c[id].load = swPath ? 1 : 0.6;
  // Tiempo en marcha de cada circuito: la presión tarda unos segundos en subir tras arrancar (retardo del presostato).
  c.swRunT = nSw ? (c.swRunT ?? 0) + dt : 0;
  standbyPair(p, ['swp1', 'swp2'], c.swPress < 1.0 && nSw > 0 && c.swRunT > 5, 'Main SW pumps', 'Bombas de agua de mar');

  // ---------- Tanques de expansión y reposición ----------
  const lte = p.c.ltExp, hte = p.c.htExp;
  if (p.faults['ht-leak']) hte.level = Math.max(0, hte.level - 0.0006 * dt);
  for (const [tank, valve] of [[lte, 'v-lt-makeup'], [hte, 'v-ht-makeup']]) {
    if (!isOpen(p, valve) || tank.level >= tank.cap) continue;
    const fw = [p.c.fwTankP, p.c.fwTankS].filter((t) => t && t.level > 0.5).sort((a, b) => b.level - a.level)[0];
    const add = Math.min(0.003 * dt, tank.cap - tank.level);
    if (fw) { tank.level += add; fw.level -= add; } else if (!p.c.fwTankP) tank.level += add;
  }
  const ltAir = pct(lte) < 5 ? 0.3 : 1; // sin agua en el tanque entra aire: la bomba pierde caudal
  const htAir = pct(hte) < 5 ? 0.3 : 1;

  // ---------- Circuito LT ----------
  const nLt = nRun(p, ['ltp1', 'ltp2']);
  c.ltQ = lag(c.ltQ, nLt ? (nLt === 1 ? 1 : 1.15) * ltAir : 0, 3, dt);
  c.ltPress = lag(c.ltPress, 0.4 + (nLt ? (2.4 + 0.5 * (nLt - 1)) * ltAir : 0), 2, dt);
  c.ltRunT = nLt ? (c.ltRunT ?? 0) + dt : 0;
  standbyPair(p, ['ltp1', 'ltp2'], c.ltPress < 1.5 && nLt > 0 && c.ltRunT > 5, 'LT FW pumps', 'Bombas de agua dulce BT');

  // ---------- Circuito HT ----------
  const nHt = nRun(p, ['htp1', 'htp2']);
  c.htQ = lag(c.htQ, nHt ? (nHt === 1 ? 1 : 1.1) * htAir : 0, 3, dt);
  c.htPress = lag(c.htPress, 0.6 + (nHt ? (2.8 + 0.4 * (nHt - 1)) * htAir : 0), 2, dt);
  c.htRunT = nHt ? (c.htRunT ?? 0) + dt : 0;
  standbyPair(p, ['htp1', 'htp2'], c.htPress < 1.5 && nHt > 0 && c.htRunT > 5, 'HT FW pumps', 'Bombas de agua de camisas');

  // ---------- Cargas térmicas ----------
  const mePow = Math.max(0, Math.abs(p.sig.mePowerKw ?? 0));
  const dgKw = (p.sig.dgKw ?? []).reduce((a, k) => a + Math.max(0, k), 0);
  const qMeAir = 0.18 * mePow; // enfriador de aire de barrido
  const qMeLo = 0.05 * mePow; // enfriador de aceite
  const qDg = 0.3 * dgKw; // camisas + aire + aceite de los generadores
  c.qJacket = 0.15 * mePow; // camisas del motor principal (al circuito HT)
  const ltF = Math.min(1, c.ltQ), htF = Math.min(1, c.htQ);

  // Enfriador HT (agua de camisas → LT) con válvula de 3 vías.
  const xh = p.c['cv-ht'].pos;
  c.qHtCool = xh * EPS_HT * Math.max(0, c.htT - c.ltT) * htF * ltF;
  // Precalentador de vapor con termostato (enciende < 58 °C, apaga > 62 °C).
  const steam = p.sig.steamAvail ?? 1;
  if (!isOpen(p, 'v-preheat') || steam < 0.3 || htF < 0.3) c.preheat = false;
  else if (c.htT < 58) c.preheat = true;
  else if (c.htT > 62) c.preheat = false;
  // Precalentador eléctrico: mismo termostato; sin caudal se desconecta la resistencia (flujostato).
  const ph = p.c.htph;
  if (!ph.run || htF < 0.3) c.elHeat = false;
  else if (c.htT < 58) c.elHeat = true;
  else if (c.htT > 62) c.elHeat = false;
  ph.load = c.elHeat ? 1 : 0.02;
  const qPre = (c.preheat ? PREHEAT_KW * steam : 0) + (c.elHeat ? ELEC_PREHEAT_KW : 0);
  const qFwg = (p.sig.fwgHeatKw ?? 0) * htF;
  c.htT += ((c.qJacket + qPre - qFwg - c.qHtCool - 1.5 * (c.htT - erT)) / C_HT) * dt;
  c.htT = clamp(c.htT, 0, 115);
  c.htIn = c.htT - c.qJacket / (95 * Math.max(htF, 0.05)); // entrada a camisas
  c.qPre = qPre;

  // Enfriadores centrales (en paralelo) con su ensuciamiento.
  const inSvc = [ccSw[0] && isOpen(p, 'v-cc1-lt'), ccSw[1] && isOpen(p, 'v-cc2-lt')];
  const nCc = inSvc.filter(Boolean).length;
  let eps = 0;
  inSvc.forEach((on, i) => {
    if (!on) return;
    const ua = UA_CC * (i === 0 && p.faults['cc-fouled'] ? 0.25 : 1);
    const swShare = (c.swQ * SW_CP) / Math.max(1, ccSw.filter(Boolean).length);
    eps += swShare > 0 ? 1 / (1 / ua + 1 / swShare) : 0;
  });
  c.qLt = qMeAir + qMeLo + qDg + (p.sig.msbLive ? AUX_LT_KW : 0) + c.qHtCool;
  c.ltRet = c.ltT + c.qLt / (LT_CP * Math.max(ltF, 0.05));
  const x = p.c['cv-lt'].pos;
  c.qCool = nCc ? x * eps * Math.max(0, c.ltRet - swT) * ltF : 0;
  c.ltT += ((c.qLt - c.qCool - 2 * (c.ltT - erT)) / C_LT) * dt;
  c.ltT = clamp(c.ltT, 0, 99);
  c.swOut = swT + (c.swQ > 0.05 ? c.qCool / (SW_CP * c.swQ) : 0);

  // ---------- Reguladores PI de las válvulas de 3 vías ----------
  const pi = (id, key, temp, sp, kp, ki) => {
    const v = p.c[id];
    const e = temp - sp;
    if (v.fault) return;
    if (v.auto) {
      c[key] = clamp(c[key] + ki * e * dt, 0, 1);
      v.pos = clamp(c[key] + kp * e, 0, 1);
      v.open = v.pos > 0.02;
    } else c[key] = clamp(v.pos - kp * e, 0, 1); // seguimiento sin salto al volver a AUTO
  };
  pi('cv-lt', 'iLt', c.ltT, c.ltSp, 0.2, 0.004);
  pi('cv-ht', 'iHt', c.htT, c.htSp, 0.12, 0.003);

  // ---------- Colector contraincendios ----------
  const fireSuction = { fp1: suction > 0.5 ? 1 : suction, fgsp: suction > 0.5 ? 1 : suction, efp: isOpen(p, 'v-efp-suc') ? 1 : 0 };
  const running = Object.keys(FIRE).filter((id) => p.c[id].run && fireSuction[id] > 0)
    .map((id) => ({ id, ...FIRE[id], q: FIRE[id].q * fireSuction[id] }));
  const kEr = (isOpen(p, 'v-hyd-er') ? 2 * K_HYD : 0) + (p.faults['fire-leak'] ? K_LEAK : 0);
  const kDeck = (isOpen(p, 'v-hyd-deck1') ? K_HYD : 0) + (isOpen(p, 'v-hyd-deck2') ? K_HYD : 0);
  const rec = (list) => list.length * K_RECIRC;
  let er, deck;
  if (isOpen(p, 'v-fire-iso')) {
    er = deck = fireNode(running, kEr + kDeck + rec(running) + 0.01);
  } else {
    const a = running.filter((f) => f.sec === 'er'), b = running.filter((f) => f.sec === 'deck');
    er = fireNode(a, kEr + rec(a) + 0.01);
    deck = fireNode(b, kDeck + rec(b) + 0.01);
  }
  c.fireEr = lag(c.fireEr, er.press, 1.5, dt);
  c.fireDeck = lag(c.fireDeck, deck.press, 1.5, dt);
  c.fireQ = er === deck ? er.q : er.q + deck.q;

  // ---------- Señales ----------
  p.sig.swFlow = clamp(c.swQ, 0, 1);
  p.sig.ltFlow = clamp(c.ltQ, 0, 1);
  p.sig.htFlow = clamp(c.htQ, 0, 1);
  p.sig.ltTemp = c.ltT;
  p.sig.htTemp = c.htT;
  p.sig.fireMainPress = Math.max(c.fireEr, c.fireDeck);
  p.sig.fireMainPressEr = c.fireEr;
  p.sig.fireMainPressDeck = c.fireDeck;

  // ---------- Alarmas ----------
  const meRun = Boolean(p.sig.meRunning ?? false);
  // Presión baja: con retardo de 5 s tras el arranque de la bomba (si no hay ninguna en marcha, sin retardo).
  const settled = (n, t) => n === 0 || t > 5;
  alarm(p, 'cool-sw-press-low', armed(p, ['swp1', 'swp2']) && c.swPress < 1.0 && settled(nSw, c.swRunT), 'Main SW pumps low discharge pressure', 'Presión baja de descarga de agua de mar');
  alarm(p, 'cool-lt-press-low', armed(p, ['ltp1', 'ltp2']) && c.ltPress < 1.5 && settled(nLt, c.ltRunT), 'LT FW low pressure', 'Presión baja del agua dulce BT');
  alarm(p, 'cool-ht-press-low', armed(p, ['htp1', 'htp2']) && c.htPress < 1.5 && settled(nHt, c.htRunT), 'HT (jacket) FW low pressure', 'Presión baja del agua de camisas (AT)');
  alarm(p, 'cool-lt-temp-high', c.ltT > 42, 'LT FW high temperature', 'Temperatura alta del agua dulce BT');
  alarm(p, 'cool-ht-temp-high', c.htT > 92, 'ME jacket water high temperature', 'Temperatura alta del agua de camisas del motor principal');
  alarm(p, 'cool-ht-temp-low', meRun && c.htT < 70, 'ME jacket water low temperature', 'Temperatura baja del agua de camisas del motor principal', 'warn');
  alarm(p, 'cool-ltexp-low', pct(lte) < 30, 'LT expansion tank low level', 'Nivel bajo del tanque de expansión BT');
  alarm(p, 'cool-htexp-low', pct(hte) < 30, 'HT expansion tank low level', 'Nivel bajo del tanque de expansión AT');
  alarm(p, 'cool-preheat-off', !meRun && armed(p, ['htp1', 'htp2']) && c.htT < 45, 'Jacket water preheating failure (ME not warm)', 'Fallo del precalentamiento de camisas (motor frío)', 'warn');
  // Presión baja en el tramo de cualquier bomba C.I. con orden de marcha (con 5 s de retardo para el arranque).
  const lowFire = Object.keys(FIRE).some((id) => p.c[id].cmd && (FIRE[id].sec === 'er' ? c.fireEr : c.fireDeck) < 5);
  c.fireLowT = lowFire ? c.fireLowT + dt : 0;
  alarm(p, 'cool-fire-main-low', c.fireLowT > 5, 'Fire main low pressure', 'Presión baja en el colector contraincendios');
}

export const actions = {
  // Cambia la consigna de temperatura de los reguladores LT/HT.
  coolSetpoint(p, which, value) {
    const key = which === 'ht' ? 'htSp' : 'ltSp';
    const [lo, hi] = which === 'ht' ? [75, 90] : [30, 40];
    if (value < lo || value > hi) return M(`Set point must be between ${lo} and ${hi} °C.`, `La consigna debe estar entre ${lo} y ${hi} °C.`);
    p.cool[key] = value;
    log(p, `cool-sp:${which}`, `${which.toUpperCase()} temperature set point ${value} °C.`, `Consigna de temperatura ${which === 'ht' ? 'AT' : 'BT'}: ${value} °C.`);
    return null;
  },
};

function base(p) {
  for (const id of [...PUMPS, 'htph']) Object.assign(p.c[id], { cmd: false, standby: false });
}
export const setup = {
  sea(p) {
    base(p);
    p.c.swp1.cmd = true; p.c.swp2.standby = true;
    p.c.ltp1.cmd = true; p.c.ltp2.standby = true;
    p.c.htp1.cmd = true; p.c.htp2.standby = true;
    Object.assign(p.cool, { ltT: 36, htT: 84, iHt: 0.3, swQ: 1, ltQ: 1, htQ: 1, swPress: 1.8, ltPress: 2.8, htPress: 3.4 });
  },
  port(p) {
    base(p);
    p.c.swp1.cmd = true; p.c.swp2.standby = true;
    p.c.ltp1.cmd = true; p.c.ltp2.standby = true;
    p.c.htp1.cmd = true; p.c.htp2.standby = true;
    // En puerto (poco calado) se aspira de la toma de mar alta.
    p.c['v-sc-high'].open = true; p.c['v-sc-high'].pos = 1;
    p.c['v-sc-low'].open = false; p.c['v-sc-low'].pos = 0;
    Object.assign(p.cool, { ltT: 34, htT: 60, iLt: 0.1, iHt: 0, swQ: 1, ltQ: 1, htQ: 1, swPress: 1.8, ltPress: 2.8, htPress: 3.4, preheat: true });
  },
  dead(p) {
    base(p);
    // Buque muerto: todo parado y frío, tomas de mar cerradas, circuitos a temperatura de la cámara.
    for (const id of ['v-sc-low', 'v-sc-high']) Object.assign(p.c[id], { open: false, pos: 0 });
    const t = p.env.ambient ?? 35;
    Object.assign(p.cool, { ltT: t, htT: t, iLt: 0, iHt: 0, swQ: 0, ltQ: 0, htQ: 0, swPress: 0, ltPress: 0.4, htPress: 0.6, preheat: false, elHeat: false });
  },
};

// Hitos de la puesta en marcha desde buque muerto (refrigeración y C.I.), en orden.
const anyRun = (p, ids) => ids.some((id) => p.c[id].run);
export const STARTUP = [
  { en: 'Sea chest suction valve open (high or low)', es: 'Válvula de toma de mar abierta (alta o baja)', check: (p) => isOpen(p, 'v-sc-low') || isOpen(p, 'v-sc-high') },
  { en: 'Main SW pump running, SW pressure normal', es: 'Bomba de agua de mar en marcha, presión normal', check: (p) => anyRun(p, ['swp1', 'swp2']) && p.cool.swPress > 1.2 },
  { en: 'LT FW pump running', es: 'Bomba de agua dulce BT en marcha', check: (p) => anyRun(p, ['ltp1', 'ltp2']) && p.cool.ltPress > 1.5 },
  { en: 'HT (jacket) FW pump running', es: 'Bomba de agua de camisas en marcha', check: (p) => anyRun(p, ['htp1', 'htp2']) && p.cool.htPress > 1.5 },
  { en: 'ME jacket water preheated above 60 °C', es: 'Agua de camisas precalentada por encima de 60 °C', check: (p) => p.cool.htT > 60 },
  { en: 'Standby pumps selected (SW, LT, HT)', es: 'Bombas de reserva seleccionadas (mar, BT, AT)', check: (p) => [['swp1', 'swp2'], ['ltp1', 'ltp2'], ['htp1', 'htp2']].every((pair) => pair.some((id) => p.c[id].standby)) },
  { en: 'Fire main pressurized (above 7 bar)', es: 'Colector contraincendios presurizado (más de 7 bar)', check: (p) => (p.sig.fireMainPress ?? 0) > 7 },
];
