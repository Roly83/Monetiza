// Casco: sistema de lastre (tanques, bombas, tratamiento del agua de lastre, escora y asiento),
// sentinas de la cámara de máquinas, tanque de retención de sentinas y separador de agua oleosa (OWS).
import { addMotor, addValve, addTank, alarm, log, lag, clamp, isOpen, pct, M } from '../core.js';

// ---------- Datos del buque (simplificados) ----------
export const SHIP = { displ: 12000, gm: 1.2, mctc: 150, rho: 1.025, trimRef: 0.6 }; // t, m, t·m/cm, t/m³, m (popa)
// Tanques de lastre: x (m desde la maestra, + proa), y (m desde crujía, + estribor), capacidad (m³), nivel inicial (%)
export const BALLAST = [
  { id: 'blFP', en: 'Fore peak tank', es: 'Pique de proa', short: 'FPT', x: 50, y: 0, cap: 250, lvl: 40, below: true },
  { id: 'blDB1P', en: 'No 1 double bottom tank (P)', es: 'Doble fondo nº 1 (Br)', short: 'No 1 DB (P)', x: 5, y: -4, cap: 300, lvl: 80, below: true },
  { id: 'blDB1S', en: 'No 1 double bottom tank (S)', es: 'Doble fondo nº 1 (Er)', short: 'No 1 DB (S)', x: 5, y: 4, cap: 300, lvl: 80, below: true },
  { id: 'blDB2P', en: 'No 2 double bottom tank (P)', es: 'Doble fondo nº 2 (Br)', short: 'No 2 DB (P)', x: -16, y: -4, cap: 350, lvl: 90, below: true },
  { id: 'blDB2S', en: 'No 2 double bottom tank (S)', es: 'Doble fondo nº 2 (Er)', short: 'No 2 DB (S)', x: -16, y: 4, cap: 350, lvl: 90, below: true },
  { id: 'blDB3P', en: 'No 3 double bottom tank (P)', es: 'Doble fondo nº 3 (Br)', short: 'No 3 DB (P)', x: -36, y: -4, cap: 300, lvl: 70, below: true },
  { id: 'blDB3S', en: 'No 3 double bottom tank (S)', es: 'Doble fondo nº 3 (Er)', short: 'No 3 DB (S)', x: -36, y: 4, cap: 300, lvl: 70, below: true },
  { id: 'blWP', en: 'Topside wing tank (P)', es: 'Tanque alto de costado (Br)', short: 'Wing (P)', x: 24, y: -8, cap: 200, lvl: 50, below: false },
  { id: 'blWS', en: 'Topside wing tank (S)', es: 'Tanque alto de costado (Er)', short: 'Wing (S)', x: 24, y: 8, cap: 200, lvl: 50, below: false },
  { id: 'blAP', en: 'Aft peak tank', es: 'Pique de popa', short: 'APT', x: -55, y: 0, cap: 150, lvl: 60, below: true },
];
const Q_BP = 0.125; // m³/s por bomba de lastre (450 m³/h)
const Q_GRAV = 0.04; // m³/s llenado por gravedad
const BWTS_WARM = 30; // s de calentamiento de las lámparas UV

// Momento de referencia longitudinal (situación de diseño) para el asiento.
const M_REF = BALLAST.reduce((s, t) => s + (t.cap * t.lvl) / 100 * SHIP.rho * t.x, 0);

// ---------- Sentinas ----------
export const WELLS = [
  { id: 'bwFP', en: 'ER bilge well fwd (P)', es: 'Pozo de sentina C. M. proa (Br)', short: 'Fwd P', cap: 1.5, lvl: 25, inflow: 1.2e-5 },
  { id: 'bwFS', en: 'ER bilge well fwd (S)', es: 'Pozo de sentina C. M. proa (Er)', short: 'Fwd S', cap: 1.5, lvl: 20, inflow: 1.0e-5 },
  { id: 'bwAft', en: 'ER bilge well aft', es: 'Pozo de sentina C. M. popa', short: 'Aft', cap: 2, lvl: 30, inflow: 1.5e-5 },
  { id: 'bwSG', en: 'Steering gear room bilge well', es: 'Pozo de sentina del local del servo', short: 'Steering', cap: 0.6, lvl: 15, inflow: 0.3e-5 },
];
const BILGE_HIGH = 70; // % alarma de nivel alto en pozo
const Q_BILP = 0.004; // m³/s bomba de sentinas (14,4 m³/h)
const Q_EBS = 0.05; // m³/s aspiración directa de emergencia (bomba de agua salada)
const Q_LEAK = 0.003; // m³/s vía de agua en la cámara de máquinas
const Q_OWS = 0.0017; // m³/s separador (≈ 6 m³/h)
const OIL_IN = 0.02; // fracción de aceite en el agua de sentinas

export const FAULTS = [
  { id: 'er-leak', en: 'Sea water leak in engine room (aft bilge)', es: 'Vía de agua en la cámara de máquinas (sentina de popa)', system: 'bilge' },
  { id: 'bilp', en: 'Bilge pump failure', es: 'Avería de la bomba de sentinas', system: 'bilge' },
  { id: 'ows-fouled', en: 'OWS coalescer fouled (high oil content)', es: 'Coalescedor del separador sucio (alto contenido de aceite)', system: 'bilge' },
  { id: 'ows-ocm', en: '15 ppm monitor faulty (reads low)', es: 'Monitor de 15 ppm averiado (marca bajo)', system: 'bilge' },
  { id: 'bp1', en: 'Ballast pump No 1 failure', es: 'Avería de la bomba de lastre nº 1', system: 'ballast' },
  { id: 'bwts-uv', en: 'BWTS UV lamp failure', es: 'Fallo de lámparas UV del tratamiento de lastre', system: 'ballast' },
  { id: 'cargo-shift', en: 'Cargo shift: list to port', es: 'Corrimiento de carga: escora a babor', system: 'ballast' },
];

export function init(p) {
  // Lastre
  for (const t of BALLAST) {
    addTank(p, t.id, { en: t.en, es: t.es, cap: t.cap, level: (t.cap * t.lvl) / 100, temp: 20, fluid: 'sw' });
    addValve(p, `vs-${t.id}`, { en: `${t.short} suction valve`, es: `Válvula de aspiración ${t.es.toLowerCase()}` });
    addValve(p, `vf-${t.id}`, { en: `${t.short} filling valve`, es: `Válvula de llenado ${t.es.toLowerCase()}` });
  }
  addMotor(p, 'bp1', { en: 'Ballast pump No 1', es: 'Bomba de lastre nº 1', kw: 75 });
  addMotor(p, 'bp2', { en: 'Ballast pump No 2', es: 'Bomba de lastre nº 2', kw: 75 });
  addMotor(p, 'bwts', { en: 'Ballast water treatment system (filter + UV)', es: 'Tratamiento de agua de lastre (filtro + UV)', kind: 'uv', kw: 35 });
  addValve(p, 'v-bl-sea', { en: 'Ballast sea chest suction valve', es: 'Válvula de aspiración de la caja de mar de lastre' });
  addValve(p, 'v-bl-fill', { en: 'Ballast filling main valve', es: 'Válvula del colector de llenado de lastre' });
  addValve(p, 'v-bl-ob', { en: 'Ballast overboard valve', es: 'Válvula de descarga al mar de lastre' });
  addValve(p, 'v-bl-grav', { en: 'Gravity ballasting valve', es: 'Válvula de lastrado por gravedad' });
  p.hull = {
    heel: 0, trim: SHIP.trimRef, listMoment: 0, flow: 0, bwtsFlow: 0, bwtsWarm: 0, bwViol: false,
    bwRecord: { ballasted: 0, deballasted: 0, untreated: 0 }, noFlowT: 0, overflow: false,
    // Sentinas y separador
    erWater: 0, holdOil: 0, ebsViol: false, bilpFlow: 0, ebsFlow: 0,
    ows: { ppm: 0, ocm: 0, runT: 0, valve: 'recirc', mode: 'auto', discharged: 0, oilOut: 0, viol: false, flow: 0 },
  };
  for (const w of WELLS) {
    addTank(p, w.id, { en: w.en, es: w.es, cap: w.cap, level: (w.cap * w.lvl) / 100, fluid: 'bilge' });
    addValve(p, `v-${w.id}`, { en: `Bilge suction valve ${w.short}`, es: `Válvula de aspiración de sentina ${w.es.toLowerCase()}` });
  }
  addMotor(p, 'bilp', { en: 'Bilge pump', es: 'Bomba de sentinas', kw: 7.5 });
  addTank(p, 'bilgeHold', { en: 'Bilge holding tank', es: 'Tanque de retención de sentinas', cap: 25, level: 6, fluid: 'bilge' });
  p.hull.holdOil = 6 * OIL_IN;
  addValve(p, 'v-ebs', { en: 'Emergency bilge suction valve (to SW pump)', es: 'Válvula de achique de emergencia (a la bomba de agua salada)' });
  addMotor(p, 'ows', { en: 'Oily water separator (feed pump)', es: 'Separador de agua oleosa (bomba de alimentación)', kw: 2.2 });
  addValve(p, 'v-ows-suc', { en: 'OWS suction valve from bilge holding tank', es: 'Válvula de aspiración del separador desde el tanque de sentinas' });
  addValve(p, 'v-ows-ob', { en: 'OWS overboard valve', es: 'Válvula de descarga al mar del separador' });
  // Aceite separado: al tanque de lodos (si lo crea el sistema de combustible) o a un tanque propio.
  if (!p.c.sludge) addTank(p, 'owsOil', { en: 'OWS separated oil tank', es: 'Tanque de aceite separado del OWS', cap: 2, level: 0.3, fluid: 'lo' });
  // Interbloqueos: el separador necesita la aspiración abierta.
  p.c.ows.interlock = (pp) => (!isOpen(pp, 'v-ows-suc') ? M('Open the OWS suction valve from the bilge holding tank first.', 'Abre primero la válvula de aspiración del separador desde el tanque de sentinas.') : null);
}

const sea = (p) => p.env.seaDistanceNm ?? 30;
const speed = (p) => p.sig.shipSpeed ?? 12;
export const owsDischargeAllowed = (p) => sea(p) >= 12 && speed(p) > 1;
export const oilTank = (p) => p.c.sludge ?? p.c.owsOil;

// Bomba de agua salada del sistema de refrigeración en marcha (para la aspiración de emergencia).
export function swPumpRunning(p) {
  const ids = ['swp1', 'swp2', 'swp3'].filter((id) => p.c[id]);
  if (ids.length) return ids.some((id) => p.c[id].run);
  return (p.sig.swFlow ?? 0) > 0.3;
}

function ballastStep(p, dt) {
  const h = p.hull;
  p.c.bp1.fault = Boolean(p.faults.bp1);
  p.c.bwts.fault = Boolean(p.faults['bwts-uv']);
  // Lámparas UV: tiempo de calentamiento.
  h.bwtsWarm = p.c.bwts.run ? Math.min(BWTS_WARM, h.bwtsWarm + dt) : 0;
  const bwtsReady = p.c.bwts.run && h.bwtsWarm >= BWTS_WARM;

  const pumps = ['bp1', 'bp2'].filter((id) => p.c[id].run);
  const tanks = BALLAST.map((t) => p.c[t.id]);
  const fromSea = isOpen(p, 'v-bl-sea');
  const src = tanks.filter((t) => isOpen(p, `vs-${t.id}`) && t.level > 0.2);
  const fillMain = isOpen(p, 'v-bl-fill');
  const dst = fillMain ? tanks.filter((t) => isOpen(p, `vf-${t.id}`) && t.level < t.cap - 0.01) : [];
  const ob = isOpen(p, 'v-bl-ob');
  const nSrc = (fromSea ? 1 : 0) + src.length;
  const nDst = dst.length + (ob ? 1 : 0);
  const Q = nSrc && nDst ? pumps.length * Q_BP : 0;
  let seaToTanks = 0, tanksToOb = 0, moved = 0;
  if (Q > 0) {
    const share = (Q * dt) / nSrc;
    let seaPart = fromSea ? share : 0;
    const taken = src.map((t) => { const a = Math.min(share, t.level); t.level -= a; return [t, a]; });
    let tankPart = taken.reduce((s, [, a]) => s + a, 0);
    const total = seaPart + tankPart;
    const each = total / nDst;
    let delivered = 0;
    for (const t of dst) { const a = Math.min(each, t.cap - t.level); t.level += a; delivered += a; }
    const toOb = ob ? each : 0;
    // Lo que no cabe en los tanques vuelve a los tanques de aspiración (o no se aspira del mar).
    let back = total - delivered - toOb;
    for (const [t, a] of taken) { if (back <= 0) break; const r = Math.min(back, a); t.level += r; back -= r; tankPart -= r; }
    if (back > 0) seaPart -= back;
    const fT = total > 0 ? delivered / (delivered + toOb || 1) : 0;
    seaToTanks = seaPart * fT;
    tanksToOb = tankPart * (1 - fT);
    moved = delivered + toOb;
  }
  // Lastrado por gravedad: caja de mar → colector de llenado → tanques bajo la flotación (hasta ~85 %).
  if (fromSea && isOpen(p, 'v-bl-grav') && fillMain) {
    const g = BALLAST.filter((t) => t.below && isOpen(p, `vf-${t.id}`) && pct(p.c[t.id]) < 85).map((t) => p.c[t.id]);
    for (const t of g) { const a = Math.min((Q_GRAV * dt) / g.length, t.cap - t.level); t.level += a; seaToTanks += a; moved += a; }
  }
  h.flow = lag(h.flow, moved / dt, 2, dt); // m³/s
  const treatedFlow = seaToTanks + tanksToOb;
  h.bwtsFlow = treatedFlow / dt;
  h.bwRecord.ballasted += seaToTanks;
  h.bwRecord.deballasted += tanksToOb;
  // Agua de lastre sin tratar (Convenio BWM): penalización una vez por operación.
  const viol = treatedFlow > 1e-6 && !bwtsReady;
  if (viol) h.bwRecord.untreated += treatedFlow;
  if (viol && !h.bwViol) {
    p.stats.marpol++;
    log(p, 'marpol:bwts', 'Ballast water handled without treatment (BWTS not in operation): BWM Convention violation.', 'Lastre tomado/descargado sin tratar (BWTS fuera de servicio): infracción del Convenio BWM.');
  }
  h.bwViol = viol;
  alarm(p, 'bl-bwts', viol, 'Untreated ballast water: BWTS not ready', 'Agua de lastre sin tratar: BWTS no preparado');
  // Bomba en marcha sin caudal (válvulas cerradas o tanques vacíos).
  const noFlow = pumps.length > 0 && Q === 0;
  h.noFlowT = noFlow ? h.noFlowT + dt : 0;
  for (const id of ['bp1', 'bp2']) p.c[id].load = p.c[id].run ? (Q > 0 ? 1 : 0.35) : 1;
  alarm(p, 'bl-noflow', h.noFlowT > 20, 'Ballast pump running without flow: check valves', 'Bomba de lastre en marcha sin caudal: revisa las válvulas', 'warn');
  h.overflow = fillMain && pumps.length > 0 && tanks.some((t) => isOpen(p, `vf-${t.id}`) && pct(t) > 99.5);
  alarm(p, 'bl-overflow', h.overflow, 'Ballast tank full: overflowing through air pipe', 'Tanque de lastre lleno: rebosa por el tubo de aireación', 'warn');

  // Escora y asiento a partir de los momentos.
  if (p.faults['cargo-shift']) h.listMoment = Math.min(h.listMoment, -SHIP.displ * SHIP.gm * Math.tan((3 * Math.PI) / 180));
  let my = h.listMoment, mx = 0;
  for (const t of BALLAST) {
    const w = p.c[t.id].level * SHIP.rho;
    my += w * t.y;
    mx += w * t.x;
  }
  const heel = (Math.atan(my / (SHIP.displ * SHIP.gm)) * 180) / Math.PI;
  const trim = SHIP.trimRef - (mx - M_REF) / (SHIP.mctc * 100);
  h.heel = lag(h.heel, heel, 15, dt);
  h.trim = lag(h.trim, trim, 30, dt);
  p.sig.heel = h.heel;
  p.sig.trim = h.trim;
  alarm(p, 'hull-list', Math.abs(h.heel) > 2, 'Ship listing more than 2°', 'Escora del buque superior a 2°', 'warn');
}

function bilgeStep(p, dt) {
  const h = p.hull;
  p.c.bilp.fault = Boolean(p.faults.bilp);
  const hold = p.c.bilgeHold;
  // Entrada normal (prensaestopas, purgas…) y vía de agua.
  for (const w of WELLS) {
    const t = p.c[w.id];
    let q = w.inflow;
    if (w.id === 'bwAft' && p.faults['er-leak']) q += Q_LEAK;
    t.level += q * dt;
    if (t.level > t.cap) { h.erWater += t.level - t.cap; t.level = t.cap; }
  }
  // El agua sobre los cuerpos (floor plates) vuelve al pozo de popa en cuanto hay sitio.
  const aft = p.c.bwAft;
  if (h.erWater > 0 && aft.level < aft.cap) {
    const a = Math.min(h.erWater, aft.cap - aft.level, 0.02 * dt);
    h.erWater -= a; aft.level += a;
  }
  // Bomba de sentinas: pozos seleccionados en la caja de válvulas → tanque de retención.
  h.bilpFlow = 0;
  if (p.c.bilp.run) {
    const open = WELLS.map((w) => p.c[w.id]).filter((t) => isOpen(p, `v-${t.id}`) && t.level > 0.02);
    const room = hold.cap - hold.level;
    if (open.length && room > 0.01) {
      let moved = 0;
      for (const t of open) { const a = Math.min((Q_BILP * dt) / open.length, t.level - 0.01); t.level -= a; moved += a; }
      moved = Math.min(moved, room);
      hold.level += moved;
      h.holdOil += moved * OIL_IN;
      h.bilpFlow = moved / dt;
    }
    p.c.bilp.load = h.bilpFlow > 0 ? 1 : 0.4;
  }
  // Aspiración directa de emergencia con una bomba de agua salada: achica muy rápido al mar.
  h.ebsFlow = 0;
  if (isOpen(p, 'v-ebs') && swPumpRunning(p)) {
    let a = Math.min(h.erWater, Q_EBS * dt);
    h.erWater -= a;
    const b = Math.min(aft.level - 0.01, Q_EBS * dt - a);
    if (b > 0) { aft.level -= b; a += b; }
    h.ebsFlow = a / dt;
  }
  const emergency = p.faults['er-leak'] || h.erWater > 0.1 || WELLS.some((w) => pct(p.c[w.id]) > 90);
  const ebsViol = h.ebsFlow > 0.001 && !emergency;
  if (ebsViol && !h.ebsViol) {
    p.stats.marpol++;
    log(p, 'marpol:ebs', 'Oily bilge water pumped overboard through the emergency bilge suction without an emergency (MARPOL Annex I).', 'Agua oleosa achicada al mar por la aspiración de emergencia sin emergencia (MARPOL Anexo I).');
  }
  h.ebsViol = ebsViol;
  alarm(p, 'ebs-marpol', ebsViol, 'Emergency bilge suction used without emergency: oily discharge', 'Achique de emergencia sin emergencia: descarga oleosa', 'alarm');

  for (const w of WELLS) alarm(p, `bilge-${w.id}`, pct(p.c[w.id]) >= BILGE_HIGH, `Bilge well high level: ${w.en}`, `Nivel alto de sentina: ${w.es}`);
  alarm(p, 'er-flood', h.erWater > 0.5, 'Engine room flooding: water above floor plates', 'Inundación en la cámara de máquinas: agua sobre los cuerpos', 'alarm');
  alarm(p, 'bilge-hold-high', pct(hold) > 90, 'Bilge holding tank high level', 'Nivel alto en el tanque de retención de sentinas', 'warn');
  p.sig.bilgeMaxPct = Math.max(...WELLS.map((w) => pct(p.c[w.id])));
}

function owsStep(p, dt) {
  const h = p.hull, o = h.ows, hold = p.c.bilgeHold, m = p.c.ows;
  // Corte automático por nivel bajo en el tanque de retención.
  if (m.run && hold.level < 0.3) {
    m.cmd = false;
    log(p, 'ows-lowlevel', 'OWS stopped: bilge holding tank low level.', 'Separador parado: nivel bajo en el tanque de retención.');
  }
  const flowing = m.run && isOpen(p, 'v-ows-suc') && hold.level > 0.3;
  o.runT = m.run ? o.runT + dt : 0;
  const oilFrac = hold.level > 0 ? h.holdOil / hold.level : 0;
  // Contenido de aceite del efluente: arranque (llenado), aceite del tanque y coalescedor sucio.
  const target = !flowing ? o.ppm : 3 + 300 * oilFrac + (o.runT < 45 ? 25 : 0) + (p.faults['ows-fouled'] ? 40 : 0);
  o.ppm = lag(o.ppm, target, 15, dt);
  o.ocm = m.run ? (p.faults['ows-ocm'] ? Math.min(o.ppm, 3) : o.ppm) : 0;
  // Válvula de tres vías automática: al mar solo por debajo de 15 ppm.
  o.valve = flowing && o.mode === 'auto' && o.ocm < 15 ? 'overboard' : 'recirc';
  o.flow = 0;
  let overboard = 0;
  if (flowing) {
    const q = Math.min(Q_OWS * dt, hold.level - 0.3);
    o.flow = q / dt;
    // Aceite separado: al tanque de lodos.
    const oil = Math.min(h.holdOil, q * oilFrac * 0.98);
    const ot = oilTank(p);
    const room = ot ? ot.cap - ot.level : 0;
    const oilMoved = Math.min(oil, room);
    h.holdOil -= oilMoved;
    hold.level -= oilMoved;
    o.oilOut += oilMoved;
    if (ot) ot.level += oilMoved;
    if (o.valve === 'overboard' && isOpen(p, 'v-ows-ob')) {
      overboard = Math.max(0, q - oil);
      hold.level -= overboard;
      h.holdOil = Math.max(0, h.holdOil - overboard * (o.ppm / 1e6));
      o.discharged += overboard;
    }
  }
  const viol = overboard > 0 && (o.ppm >= 15 || !owsDischargeAllowed(p));
  if (viol && !o.viol) {
    p.stats.marpol++;
    log(p, 'marpol:ows', `Illegal oily water discharge (${o.ppm.toFixed(0)} ppm, ${sea(p).toFixed(0)} nm from land, ${speed(p).toFixed(1)} kn): MARPOL Annex I.`,
      `Descarga ilegal de agua oleosa (${o.ppm.toFixed(0)} ppm, ${sea(p).toFixed(0)} millas de tierra, ${speed(p).toFixed(1)} nudos): MARPOL Anexo I.`);
  }
  o.viol = viol;
  if (overboard > 0) p.history.add('ows-overboard');
  alarm(p, 'ows-marpol', viol, 'OWS overboard discharge not permitted (MARPOL)', 'Descarga al mar del separador no permitida (MARPOL)', 'alarm');
  alarm(p, 'ows-15ppm', m.run && o.ocm >= 15 && o.runT > 90, 'OWS 15 ppm alarm: effluent recirculated', 'Alarma de 15 ppm del separador: efluente recirculado', 'warn');
  const ot = oilTank(p);
  alarm(p, 'ows-oil-full', ot && pct(ot) > 95, 'Separated oil tank full', 'Tanque de aceite separado lleno', 'warn');
  p.sig.owsPpm = o.ocm;
}

export function step(p, dt) {
  ballastStep(p, dt);
  bilgeStep(p, dt);
  owsStep(p, dt);
}

const allBallastValves = () => BALLAST.flatMap((t) => [`vs-${t.id}`, `vf-${t.id}`]).concat(['v-bl-sea', 'v-bl-fill', 'v-bl-ob', 'v-bl-grav']);

export const actions = {
  // Cierra todo el sistema de lastre y para las bombas (fin de operación).
  ballastSecure(p) {
    for (const id of ['bp1', 'bp2']) p.c[id].cmd = false;
    for (const id of allBallastValves()) { p.c[id].open = false; p.c[id].pos = 0; }
    log(p, 'ballast-secure', 'Ballast system secured: pumps stopped, all valves closed.', 'Sistema de lastre asegurado: bombas paradas y válvulas cerradas.');
    return null;
  },
  // Modo de la válvula de tres vías del separador: 'auto' o 'recirc' (no hay posición manual al mar).
  owsMode(p, mode) {
    if (!['auto', 'recirc'].includes(mode)) return M('The 3-way valve cannot be forced overboard.', 'La válvula de tres vías no se puede forzar al mar.');
    p.hull.ows.mode = mode;
    log(p, `ows-mode:${mode}`, `OWS 3-way valve: ${mode === 'auto' ? 'AUTO (15 ppm monitor)' : 'RECIRCULATION'}.`, `Válvula de tres vías del separador: ${mode === 'auto' ? 'AUTOMÁTICA (monitor 15 ppm)' : 'RECIRCULACIÓN'}.`);
    return null;
  },
  // Anotación en el Libro Registro de Hidrocarburos (Oil Record Book), código D.
  orbEntry(p) {
    const o = p.hull.ows;
    if (o.discharged < 0.01) return M('Nothing to record: no water discharged through the OWS.', 'Nada que anotar: no se ha descargado agua por el separador.');
    log(p, 'orb-entry', `Oil Record Book (code D): ${o.discharged.toFixed(2)} m³ discharged through 15 ppm equipment, ${p.env.seaDistanceNm?.toFixed?.(0) ?? '—'} nm from land.`,
      `Libro Registro de Hidrocarburos (código D): ${o.discharged.toFixed(2)} m³ descargados con equipo de 15 ppm, a ${p.env.seaDistanceNm?.toFixed?.(0) ?? '—'} millas de tierra.`);
    return null;
  },
};

export const setup = {
  sea(p) { p.hull.ows.ppm = 0; },
  port(p) {
    // En puerto: tierra a menos de 12 millas (afecta a las descargas al mar).
    p.env.seaDistanceNm = 0;
  },
  dead(p) {
    // Buque muerto desde hace horas: sentinas algo más altas y una ligera escora a estribor.
    p.c.bwAft.level = 0.6 * p.c.bwAft.cap;
    p.c.bwFP.level = 0.45 * p.c.bwFP.cap;
    p.c.blWP.level = 0.4 * p.c.blWP.cap;
    p.c.blWS.level = 0.6 * p.c.blWS.cap;
  },
};

// Hitos de la puesta en marcha (de buque muerto a navegación) de estos sistemas.
export const STARTUP = [
  { en: 'ER bilge wells pumped below high level', es: 'Sentinas de la C. M. achicadas por debajo del nivel alto', check: (p) => (p.sig.bilgeMaxPct ?? 100) < 50 },
  { en: 'Ship upright (heel below 1°)', es: 'Buque adrizado (escora menor de 1°)', check: (p) => Math.abs(p.hull.heel) < 1 },
  { en: 'Ballast system secured (pumps stopped, sea and overboard valves closed)', es: 'Lastre asegurado (bombas paradas, válvulas de mar y al mar cerradas)', check: (p) => !p.c.bp1.run && !p.c.bp2.run && !p.c['v-bl-sea'].open && !p.c['v-bl-ob'].open },
  { en: 'Bilge pump stopped, emergency bilge suction closed', es: 'Bomba de sentinas parada y achique de emergencia cerrado', check: (p) => !p.c.bilp.run && !p.c['v-ebs'].open },
];
