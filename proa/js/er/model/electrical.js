// Planta eléctrica: 3 generadores diésel, cuadro principal (MSB) con gestión de potencia (PMS),
// sincronización y reparto de carga; generador de emergencia, cuadro de emergencia (ESB),
// baterías de 24 V, arranque hidráulico (HS), flaps de ventilación y tanque de diésel del generador.
import { addFeeder, addMotor, addTank, addValve, alarm, log, lag, clamp, isOpen, feederLive, M } from '../core.js';
import { drawAir } from './air.js';

export const F_NOM = 60; // Hz
export const V_NOM = 440; // V
export const DG_RATED = 900; // kW
export const EG_RATED = 250; // kW
const DROOP_HZ = 2.4; // caída de frecuencia de 0 a plena carga (4 %)
export const EG_TRIP_A = 450; // A
const SQ3 = Math.sqrt(3);

function newDg(n) {
  return {
    n, id: `dg${n}`, en: `Diesel generator No ${n}`, es: `Generador diésel nº ${n}`, rated: DG_RATED,
    state: 'stopped', timer: 0, f: 0, v: 0, f0: F_NOM + DROOP_HZ / 2, v0: V_NOM, breaker: false, kw: 0, kvar: 0,
    theta: 0, control: 'remote', htTemp: 45, loPress: 0, trip: null, hours: 0, revT: 0, ocT: 0, fuelT: 0, unload: false,
    cool: 0, starting: false, failT: 0,
  };
}

export function init(p) {
  p.elec = {
    pms: 'auto', // gestión de potencia: auto | manual
    dg: [newDg(1), newDg(2), newDg(3)],
    priority: [1, 2, 3], // orden de arranque en reserva
    syncSel: 2, // generador que muestra el sincronoscopio (1..3)
    busF: 0, busV: 0, msbKw: 0, msbKvar: 0,
    highLoadT: 0, lowLoadT: 0, prefT: 0, ufT: 0, blackoutT: 0,
    eg: {
      state: 'stopped', timer: 0, attempts: 0, f: 0, v: 0, rpm: 0, breaker: false, trip: false, overT: 0, autoCloseT: 0,
      mode: 'auto', tieMode: 'normal', tie: true, lcp: 'remote', estop: false, loPress: 0, coolT: 35, roomT: 33,
      fuelT: 0, cool: 0, meterA: 1, meterV: 1, kw: 0, kvar: 0, startFail: false, deadT: 0, hours: 0,
    },
    battery: { soc: 0.95, v: 26.4, cranking: false },
    charger: { on: true },
    hs: { press: 210 },
    flaps: { mode: 'auto', pos: 0, cmdOpen: false },
    insulationFault: false,
  };
  // Consumidores del cuadro de emergencia (ESB), como en el cuadro real.
  const esb = (id, en, es, kw) => addFeeder(p, id, { en, es, bus: 'ESB', kw });
  esb('f-light1', 'EMERGENCY LIGHTS 1', 'Alumbrado de emergencia 1', 6);
  esb('f-light2', 'EMERGENCY LIGHTS 2', 'Alumbrado de emergencia 2', 6);
  esb('f-smoke', 'SMOKE DETECTOR', 'Detección de humo', 1);
  esb('f-egfan', 'FAN FOR EMERG. GENERATOR ROOM', 'Ventilador del local del generador de emergencia', 0);
  esb('f-nav', 'NAVIGATION LIGHTS', 'Luces de navegación', 2);
  esb('f-gmdss', 'GMDSS / RADIO', 'GMDSS / radio', 3);
  esb('f-charger', 'BATTERY CHARGER', 'Cargador de baterías', 0);
  esb('f-eac', 'EMERGENCY AIR COMPRESSOR', 'Compresor de aire de emergencia', 0);
  esb('f-eraux', 'ENGINE ROOM AUXILIARIES', 'Auxiliares de la sala de máquinas', 20);
  esb('f-efp', 'EMERGENCY FIRE PUMP', 'Bomba contraincendios de emergencia', 0);
  esb('f-lt2', 'LT FW PUMP No 2', 'Bomba de agua dulce BT nº 2', 0);
  esb('f-sg2', 'STEERING GEAR PUMP No 2', 'Bomba del servo nº 2', 0);
  addMotor(p, 'egfan', { en: 'Emergency generator room fan', es: 'Ventilador del local del generador de emergencia', kind: 'fan', kw: 4, bus: 'ESB', feeder: 'f-egfan', restart: true });
  p.c.egfan.cmd = true;
  // Consumidores generales del cuadro principal (MSB). pref: se desconectan en el disparo preferente.
  addFeeder(p, 'f-hotel', { en: 'ACCOMMODATION / LIGHTING', es: 'Habililitación y alumbrado', kw: 90 });
  addFeeder(p, 'f-galley', { en: 'GALLEY', es: 'Cocina', kw: 60, pref: true });
  addFeeder(p, 'f-deck', { en: 'DECK MACHINERY', es: 'Maquinaria de cubierta', kw: 0, pref: true });
  addFeeder(p, 'f-workshop', { en: 'WORKSHOP', es: 'Taller', kw: 15, pref: true });
  addFeeder(p, 'f-ac', { en: 'AC PLANT', es: 'Aire acondicionado', kw: 0, pref: true });
  // Tanque de diésel del generador de emergencia y su válvula de cierre rápido.
  addTank(p, 'egDoTank', { en: 'Emergency generator DO tank', es: 'Tanque de diésel del generador de emergencia', cap: 2, level: 1.6, fluid: 'do' });
  addValve(p, 'egQcv', { en: 'EG DO tank quick-closing valve', es: 'Válvula de cierre rápido del tanque del G. E.', open: true });
  addMotor(p, 'egDoPump', { en: 'EG DO tank filling pump', es: 'Bomba de llenado del tanque del G. E.', kw: 2, bus: 'ESB' });
}

export const FAULTS = [
  { id: 'dg1-lo', en: 'DG 1 low lube oil pressure', es: 'Presión de aceite baja en el generador 1', system: 'dg' },
  { id: 'dg2-fuel', en: 'DG 2 fuel filter clogged', es: 'Filtro de combustible obstruido en el generador 2', system: 'dg' },
  { id: 'dg3-start', en: 'DG 3 start failure', es: 'Fallo de arranque del generador 3', system: 'dg' },
  { id: 'dg-gov', en: 'DG 1 governor drift (load sharing)', es: 'Deriva del regulador del generador 1 (reparto de carga)', system: 'dg' },
  { id: 'eg-start', en: 'Emergency generator electric starter failure', es: 'Fallo del motor de arranque eléctrico del G. E.', system: 'eg' },
  { id: 'eg-flaps', en: 'Emergency generator room flaps jammed closed', es: 'Flaps del local del G. E. atascados cerrados', system: 'eg' },
  { id: 'eg-charger', en: 'Battery charger failure', es: 'Avería del cargador de baterías', system: 'eg' },
  { id: 'eg-qcv', en: 'EG fuel quick-closing valve tripped', es: 'Disparo de la válvula de cierre rápido del G. E.', system: 'eg' },
  { id: 'esb-earth', en: 'Earth fault on the emergency switchboard', es: 'Derivación a masa en el cuadro de emergencia', system: 'eg' },
];

// ---------- Utilidades ----------
const dgs = (p) => p.elec.dg;
export const connected = (p) => dgs(p).filter((g) => g.breaker && g.state === 'running');
const msbFromDg = (p) => connected(p).length > 0;
export function esbSource(p) {
  const e = p.elec.eg;
  if (e.tie && msbFromDg(p)) return 'msb';
  if (e.breaker && e.v >= 400) return 'eg';
  return null;
}
const backfeed = (p) => p.elec.eg.tie && esbSource(p) === 'eg';
const fuelOkEg = (p) => isOpen(p, 'egQcv') && !p.faults['eg-qcv'] && p.c.egDoTank.level > 0.02;
export const egCurrent = (p) => (p.elec.eg.v > 50 ? (Math.hypot(p.elec.eg.kw, p.elec.eg.kvar) * 1000) / (SQ3 * p.elec.eg.v) : 0);
export const dgCurrent = (g) => (g.v > 50 ? (Math.hypot(g.kw, g.kvar) * 1000) / (SQ3 * g.v) : 0);

// ---------- Paso 1: motores diésel, interruptores y tensión en los cuadros ----------
export function pre(p, dt) {
  const el = p.elec;
  for (const g of dgs(p)) dgEngine(p, g, dt);
  egEngine(p, dt);
  tieLogic(p, dt);
  const wasLive = p.sig.msbLive;
  p.sig.msbLive = msbFromDg(p) || backfeed(p);
  p.sig.esbLive = esbSource(p) !== null;
  // Apagón: se pierde la tensión del cuadro principal.
  if (wasLive && !p.sig.msbLive) {
    p.stats.blackouts++;
    log(p, 'blackout', 'Blackout! Main switchboard has lost power.', '¡Apagón! El cuadro principal se ha quedado sin tensión.');
    p.sig.restartPending = { ...p.sig.restartPending, MSB: true };
  }
  if (p.sig.msbLive && !wasLive && wasLive !== undefined) log(p, 'msb-restored', 'Main switchboard power restored.', 'Tensión restablecida en el cuadro principal.');
  if (p.sig.msbLive && p.sig.restartPending?.MSB) {
    el.blackoutT += dt;
    if (el.blackoutT > 30) { p.sig.restartPending.MSB = false; el.blackoutT = 0; }
  }
  alarm(p, 'msb-dead', !p.sig.msbLive, 'Main switchboard dead bus (blackout)', 'Cuadro principal sin tensión (apagón)', 'trip');
  alarm(p, 'esb-dead', !p.sig.esbLive, 'Emergency switchboard no voltage', 'Cuadro de emergencia sin tensión', 'trip');
}

function dgEngine(p, g, dt) {
  const startFault = p.faults[`dg${g.n}-start`];
  if (g.state === 'starting') {
    g.timer += dt;
    if (g.timer >= 3) {
      if (startFault || !(p.sig.dgFuelOk ?? true)) {
        g.state = 'stopped';
        g.failT = p.t;
        g.trip = 'start';
        alarm(p, `${g.id}-startfail`, true, `${g.en} start failure`, `${g.es}: fallo de arranque`);
      } else {
        g.state = 'running';
        g.timer = 0;
        log(p, `${g.id}-running`, `${g.en} running.`, `${g.es}: en marcha.`);
      }
    }
  }
  const run = g.state === 'running';
  if (run) {
    g.hours += dt / 3600;
    g.f = g.breaker ? p.elec.busF : lag(g.f, g.f0, 1.2, dt);
    g.v = g.breaker ? p.elec.busV : lag(g.v, g.v0, 1, dt);
  } else {
    g.f = lag(g.f, 0, 2, dt);
    g.v = lag(g.v, 0, 1, dt);
    if (g.f < 1) g.f = 0;
    if (g.v < 5) g.v = 0;
    if (g.breaker) openDgBreaker(p, g, null);
  }
  // Refrigeración: el agua de camisas del generador se enfría con el circuito de baja temperatura (LT).
  const lt = p.sig.ltFlow ?? 1;
  const load = run ? Math.max(0, g.kw) / g.rated : 0;
  const target = run ? (lt > 0.3 ? 72 + 10 * load + Math.max(0, (p.sig.ltTemp ?? 36) - 36) : 135) : Math.max(p.env.ambient, 45);
  g.htTemp = lag(g.htTemp, target, run && lt <= 0.3 ? 220 : 90, dt);
  g.loPress = lag(g.loPress, run ? (p.faults[`dg${g.n}-lo`] ? 0.9 : 4.4) : 0, 1, dt);
  if (run && g.timer < 15) g.timer += dt;
  // Protecciones del motor
  if (run) {
    let reason = null;
    if (g.timer >= 10 && g.loPress < 1.5) reason = ['lo', 'low lube oil pressure', 'presión de aceite baja'];
    else if (g.htTemp > 98) reason = ['ht', 'high cooling water temperature', 'temperatura alta del agua de refrigeración'];
    const fuelBad = !(p.sig.dgFuelOk ?? true) || (p.faults[`dg${g.n}-fuel`] && g.kw > g.rated * 0.6);
    g.fuelT = fuelBad ? g.fuelT + dt : 0;
    if (g.fuelT > 8) reason = ['fuel', 'fuel failure', 'falta de combustible'];
    if (reason) shutdownDg(p, g, reason);
  }
  if (g.state === 'stopping') {
    g.state = 'stopped';
  }
  alarm(p, `${g.id}-ht`, g.htTemp > 93, `${g.en} high cooling water temperature`, `${g.es}: temperatura alta del agua de refrigeración`);
  alarm(p, `${g.id}-lo`, run && g.timer >= 10 && g.loPress < 2.5, `${g.en} low lube oil pressure`, `${g.es}: presión de aceite baja`);
}

function shutdownDg(p, g, [code, en, es]) {
  g.state = 'stopped';
  g.trip = code;
  if (g.breaker) openDgBreaker(p, g, null);
  p.stats.trips++;
  alarm(p, `${g.id}-shutdown`, true, `${g.en} shutdown: ${en}`, `${g.es}: parada por ${es}`, 'trip');
}

function openDgBreaker(p, g, why) {
  g.breaker = false;
  g.kw = 0;
  g.kvar = 0;
  if (why) {
    p.stats.trips++;
    alarm(p, `${g.id}-brtrip`, true, `${g.en} breaker trip: ${why[0]}`, `${g.es}: disparo del interruptor por ${why[1]}`, 'trip');
  } else {
    log(p, `${g.id}-breaker-open`, `${g.en} breaker opened.`, `${g.es}: interruptor abierto.`);
  }
}

// ---------- Generador de emergencia ----------
function egEngine(p, dt) {
  const e = p.elec.eg;
  const b = p.elec.battery;
  const fl = p.elec.flaps;
  // Arranque automático: el cuadro de emergencia se queda sin tensión.
  const esbDead = !(e.tie && msbFromDg(p)) && !(e.breaker && e.v >= 400);
  e.deadT = esbDead ? e.deadT + dt : 0;
  if (e.mode === 'auto' && e.lcp === 'remote' && !e.estop && e.state === 'stopped' && e.deadT > 2 && e.attempts < 3 && !e.startFail) {
    beginCrank(p, 'battery', 'auto');
  }
  if (e.state === 'cranking') {
    e.timer += dt;
    b.cranking = e.method === 'battery';
    if (e.timer >= (e.method === 'hs' ? 2 : 3)) {
      b.cranking = false;
      const ok = fuelOkEg(p) && !e.estop && (e.method === 'hs' || (!p.faults['eg-start'] && b.v >= 21));
      if (ok) {
        e.state = 'running';
        e.timer = 0;
        e.attempts = 0;
        log(p, 'eg-running', 'Emergency generator running.', 'Generador de emergencia en marcha.');
      } else {
        e.state = 'stopped';
        e.timer = 0;
        if (e.auto && e.attempts < 3) e.state = 'pause';
        else if (e.attempts >= 3 || !e.auto) {
          e.startFail = e.attempts >= 3;
          alarm(p, 'eg-startfail', true, 'Emergency generator start failure', 'Fallo de arranque del generador de emergencia');
        }
      }
    }
  } else if (e.state === 'pause') {
    e.timer += dt;
    if (e.timer > 4) { e.state = 'stopped'; e.timer = 0; if (e.attempts < 3) beginCrank(p, 'battery', 'auto'); }
  }
  const run = e.state === 'running' || e.state === 'cooldown';
  if (run) {
    e.hours += dt / 3600;
    e.rpm = lag(e.rpm, 1800, 1.5, dt);
    e.f = lag(e.f, F_NOM - 0.6 * (e.kw / EG_RATED), 1.2, dt);
    e.v = lag(e.v, V_NOM, 1, dt);
    e.loPress = lag(e.loPress, 4, 1, dt);
    e.timer += dt;
    // Combustible del tanque propio
    const use = (0.06 / 3600) * (0.3 + 0.7 * clamp(e.kw / EG_RATED, 0, 1.2)) * dt;
    p.c.egDoTank.level = Math.max(0, p.c.egDoTank.level - use);
    e.fuelT = fuelOkEg(p) ? 0 : e.fuelT + dt;
    if (e.fuelT > 5) stopEg(p, 'Emergency generator stopped: no fuel', 'Generador de emergencia parado: sin combustible', true);
  } else {
    e.rpm = lag(e.rpm, e.state === 'cranking' ? 150 : 0, 0.8, dt);
    e.f = lag(e.f, 0, 1.5, dt);
    e.v = lag(e.v, 0, 0.8, dt);
    e.loPress = lag(e.loPress, 0, 1, dt);
    if (e.v < 5) e.v = 0;
    if (e.f < 1) e.f = 0;
    if (e.breaker) { e.breaker = false; log(p, 'eg-breaker-opened', 'Emergency generator breaker opened.', 'Interruptor del generador de emergencia abierto.'); }
  }
  // Flaps de ventilación del local
  if (fl.mode === 'auto') fl.cmdOpen = run || e.state === 'cranking';
  const flTarget = p.faults['eg-flaps'] ? 0 : fl.cmdOpen ? 1 : 0;
  fl.pos = clamp(fl.pos + Math.sign(flTarget - fl.pos) * dt / 8, 0, 1);
  // Temperatura del local y del agua de refrigeración (radiador)
  const fanOn = p.c.egfan.run;
  const heat = run ? 6 + 10 * clamp(e.kw / EG_RATED, 0, 1.3) : 0;
  const roomTarget = p.env.ambient + (run ? heat * (1.6 - 1.1 * fl.pos) * (fanOn ? 0.8 : 1.2) : -2);
  e.roomT = lag(e.roomT, roomTarget, 60, dt);
  const coolTarget = run ? 78 + 12 * clamp(e.kw / EG_RATED, 0, 1.3) + Math.max(0, e.roomT - 45) * 1.6 : Math.max(e.roomT, 35);
  e.coolT = lag(e.coolT, coolTarget, 60, dt);
  if (run && e.coolT > 105) stopEg(p, 'Emergency generator shutdown: high cooling water temperature', 'Generador de emergencia parado: temperatura alta del agua', true);
  if (run && e.timer > 8 && e.loPress < 1.2) stopEg(p, 'Emergency generator shutdown: low lube oil pressure', 'Generador de emergencia parado: presión de aceite baja', true);
  alarm(p, 'eg-coolt', e.coolT > 95, 'Emergency generator high cooling water temperature', 'Generador de emergencia: temperatura alta del agua');
  alarm(p, 'eg-room', e.roomT > 50, 'Emergency generator room high temperature', 'Local del generador de emergencia: temperatura alta', 'warn');
  alarm(p, 'eg-flaps', run && fl.pos < 0.5, 'Emergency generator room flaps closed', 'Flaps del local del generador de emergencia cerrados', 'warn');
  alarm(p, 'eg-fuel-low', p.c.egDoTank.level < 0.4, 'Emergency generator DO tank low level', 'Nivel bajo en el tanque de diésel del generador de emergencia', 'warn');

  // Baterías y cargador
  const charging = p.elec.charger.on && feederLive(p, 'f-charger') && !p.faults['eg-charger'];
  const drain = p.sig.esbLive ? 0.00002 : 0.00012; // sin tensión, el alumbrado transitorio tira de la batería
  b.soc = clamp(b.soc + (charging ? 0.0004 : -drain) * dt - (b.cranking ? 0.004 * dt : 0), 0, 1);
  b.v = lag(b.v, 21.5 + 4.2 * b.soc + (charging ? 1.2 : 0) - (b.cranking ? 3 : 0), 0.5, dt);
  b.charging = charging;
  alarm(p, 'batt-low', b.v < 23.5, 'Emergency batteries low voltage', 'Tensión baja de las baterías de emergencia');
  alarm(p, 'charger-fail', !charging && p.sig.esbLive, 'Battery charger failure / off', 'Cargador de baterías averiado o apagado', 'warn');

  // Bomba de llenado del tanque del generador de emergencia (desde el servicio de diésel).
  if (p.c.egDoPump.run) {
    const src = p.c.doServ ?? p.c.doStor;
    const q = (1.5 / 3600) * dt;
    if (src && src.level > q) { src.level -= q; p.c.egDoTank.level = Math.min(p.c.egDoTank.cap, p.c.egDoTank.level + q); }
    if (p.c.egDoTank.level >= p.c.egDoTank.cap * 0.98) p.c.egDoPump.cmd = false;
  }
  p.c.egQcv.fault = false;
  if (p.faults['eg-qcv']) p.c.egQcv.open = false;
  p.elec.insulationFault = Boolean(p.faults['esb-earth']);
}

function beginCrank(p, method, who) {
  const e = p.elec.eg;
  e.state = 'cranking';
  e.timer = 0;
  e.method = method;
  e.auto = who === 'auto';
  if (method === 'battery') e.attempts++;
  log(p, 'eg-start', who === 'auto' ? 'Emergency generator starting automatically.' : 'Emergency generator starting.',
    who === 'auto' ? 'El generador de emergencia arranca automáticamente.' : 'Arrancando el generador de emergencia.');
}

function stopEg(p, en, es, isTrip = false) {
  const e = p.elec.eg;
  e.state = 'stopped';
  e.timer = 0;
  e.attempts = 0;
  if (isTrip) { p.stats.trips++; alarm(p, 'eg-shutdown', true, en, es, 'trip'); e.startFail = true; } else log(p, 'eg-stop', en, es);
}

// Interruptor de acoplamiento (tie breaker) y automatismo del interruptor del generador de emergencia.
function tieLogic(p, dt) {
  const e = p.elec.eg;
  const fromDg = msbFromDg(p);
  const emerg = e.tieMode === 'emergency' && e.mode === 'manual';
  if (emerg && fromDg && e.tie && e.breaker) {
    e.tie = false;
    log(p, 'tie-opened', 'Tie breaker opened: MSB power is back.', 'Acoplamiento abierto: el MSB vuelve a tener tensión.');
  }
  const want = emerg ? e.breaker && !fromDg : fromDg && !e.breaker;
  if (want !== e.tie) {
    e.tie = want;
    log(p, want ? 'tie-closed' : 'tie-opened', want ? 'Tie breaker closed.' : 'Tie breaker opened.', want ? 'Interruptor de acoplamiento cerrado.' : 'Interruptor de acoplamiento abierto.');
  }
  if (e.mode !== 'auto') { e.autoCloseT = 0; return; }
  const run = e.state === 'running';
  if (!fromDg) {
    if (run && !e.breaker && !e.trip && e.v >= 420) {
      e.autoCloseT += dt;
      if (e.autoCloseT >= 1) {
        e.breaker = true;
        e.autoCloseT = 0;
        log(p, 'eg-breaker-closed', 'Emergency generator breaker closed automatically.', 'Interruptor del generador cerrado automáticamente.');
      }
    }
    if (e.state === 'cooldown') e.state = 'running';
  } else {
    e.autoCloseT = 0;
    if (e.breaker) {
      e.breaker = false;
      log(p, 'eg-breaker-opened', 'Emergency generator breaker opened: MSB power restored.', 'Interruptor del generador abierto: vuelve la tensión del MSB.');
    }
    if (e.lcp === 'remote') {
      if (e.state === 'running') { e.state = 'cooldown'; e.cool = 0; log(p, 'eg-cooldown', 'Emergency generator cooling down.', 'Generador de emergencia en enfriamiento.'); }
      else if (e.state === 'cooldown') {
        e.cool += dt;
        if (e.cool >= 60) stopEg(p, 'Emergency generator stopped.', 'Generador de emergencia parado.');
      }
    }
  }
}

// ---------- Paso 2 (tras calcular los consumos): reparto de carga, PMS y protecciones ----------
export function post(p, dt) {
  const el = p.elec;
  const e = el.eg;
  const loads = p.sig.motorKw ?? { MSB: 0, ESB: 0 };
  const loadsQ = p.sig.motorKvar ?? { MSB: 0, ESB: 0 };
  const esbFromMsb = esbSource(p) === 'msb';
  const msbP = loads.MSB + (esbFromMsb ? loads.ESB : 0);
  const msbQ = loadsQ.MSB + (esbFromMsb ? loadsQ.ESB : 0);
  el.msbKw = p.sig.msbLive ? msbP : 0;
  el.msbKvar = p.sig.msbLive ? msbQ : 0;

  // Generador de emergencia: alimenta el ESB (y el MSB si está acoplado en emergencia).
  if (esbSource(p) === 'eg') {
    e.kw = loads.ESB + (backfeed(p) ? loads.MSB : 0);
    e.kvar = loadsQ.ESB + (backfeed(p) ? loadsQ.MSB : 0);
  } else { e.kw = 0; e.kvar = 0; }
  if (e.breaker && egCurrent(p) > EG_TRIP_A) {
    e.overT += dt;
    if (e.overT >= 3) {
      e.trip = true;
      e.breaker = false;
      e.overT = 0;
      p.stats.trips++;
      log(p, 'eg-trip', 'Overcurrent trip! Generator breaker opened.', '¡Disparo por sobrecorriente! Interruptor del generador abierto.');
    }
  } else e.overT = 0;
  alarm(p, 'eg-overcurrent', e.trip, 'Emergency generator overcurrent trip', 'Disparo por sobrecorriente del generador de emergencia', 'trip');
  alarm(p, 'esb-insulation', el.insulationFault && p.sig.esbLive, 'Low insulation on the emergency switchboard', 'Aislamiento bajo en el cuadro de emergencia');

  // Reparto de carga entre los generadores acoplados (regulación por estatismo).
  const on = connected(p);
  if (on.length) {
    const R = on.map((g) => g.rated / DROOP_HZ);
    const sumR = R.reduce((a, b) => a + b, 0);
    if (p.faults['dg-gov']) dgs(p)[0].f0 += 0.02 * dt;
    const f = (on.reduce((a, g, i) => a + g.f0 * R[i], 0) - msbP) / sumR;
    el.busF = lag(el.busF || f, Math.max(0, f), 0.6, dt);
    const vMean = on.reduce((a, g) => a + g.v0, 0) / on.length;
    el.busV = lag(el.busV || vMean, vMean - 0.01 * msbQ / on.length, 0.5, dt);
    on.forEach((g, i) => {
      g.kw = (g.f0 - el.busF) * R[i];
      g.kvar = msbQ * (R[i] / sumR) + (g.v0 - vMean) * 25;
    });
  } else if (backfeed(p)) {
    el.busF = e.f;
    el.busV = e.v;
  } else {
    el.busF = 0;
    el.busV = 0;
  }
  for (const g of dgs(p)) if (!g.breaker) { g.kw = 0; g.kvar = 0; }

  // Fase de cada generador respecto a las barras (sincronoscopio).
  for (const g of dgs(p)) {
    if (g.state === 'running' && !g.breaker && p.sig.msbLive) {
      g.theta = ((g.theta + 360 * (g.f - el.busF) * dt + 540) % 360) - 180;
    } else if (g.breaker) g.theta = 0;
  }

  if (el.pms === 'auto') pms(p, dt);
  protections(p, dt);

  p.sig.msbFreq = el.busF;
  p.sig.msbVolt = el.busV;
  p.sig.dgKw = dgs(p).map((g) => g.kw);
  p.sig.egKw = e.kw;
  p.sig.egRunning = e.state === 'running' || e.state === 'cooldown';
}

function protections(p, dt) {
  const el = p.elec;
  for (const g of connected(p)) {
    // Potencia inversa: el generador pasa a funcionar como motor.
    g.revT = g.kw < -0.08 * g.rated ? g.revT + dt : 0;
    if (g.revT > 3) { openDgBreaker(p, g, ['reverse power', 'potencia inversa']); g.revT = 0; continue; }
    g.ocT = g.kw > 1.2 * g.rated ? g.ocT + dt : 0;
    if (g.ocT > 6) { openDgBreaker(p, g, ['overcurrent', 'sobrecorriente']); g.ocT = 0; }
  }
  // Disparo preferente: desconecta consumidores no esenciales si algún generador pasa del 100 %.
  const over = connected(p).some((g) => g.kw > g.rated);
  el.prefT = over ? el.prefT + dt : 0;
  if (el.prefT > 5) {
    el.prefT = 0;
    let n = 0;
    for (const f of Object.values(p.feeders)) if (f.pref && f.on && !f.trip) { f.trip = true; n++; }
    if (n) {
      p.stats.trips++;
      alarm(p, 'pref-trip', true, 'Preferential trip: non-essential consumers disconnected', 'Disparo preferente: consumidores no esenciales desconectados', 'trip');
    }
  }
  // Frecuencia muy baja: disparo general.
  el.ufT = p.sig.msbLive && msbFromDg(p) && el.busF < 55 ? el.ufT + dt : 0;
  if (el.ufT > 4) {
    el.ufT = 0;
    for (const g of connected(p)) openDgBreaker(p, g, ['under frequency', 'baja frecuencia']);
  }
  alarm(p, 'msb-freq', p.sig.msbLive && msbFromDg(p) && Math.abs(el.busF - F_NOM) > 1.5, 'Main switchboard frequency abnormal', 'Frecuencia anormal en el cuadro principal');
  alarm(p, 'dg-overload', over, 'Generator overload', 'Sobrecarga de generador');
}

// Gestión automática de potencia (PMS): arranque en reserva, sincronización, reparto y parada.
function pms(p, dt) {
  const el = p.elec;
  const remote = (g) => g.control === 'remote' && !g.trip;
  const byPrio = el.priority.map((n) => dgs(p)[n - 1]);
  const on = connected(p);
  if (!on.length) {
    // Apagón: arranca el primer generador disponible y lo acopla a barras muertas.
    if (backfeed(p)) return;
    const active = byPrio.find((g) => remote(g) && (g.state === 'starting' || g.state === 'running'));
    if (!active) {
      const next = byPrio.find((g) => remote(g) && g.state === 'stopped' && p.t - (g.failT ?? -99) > 5);
      if (next) startDg(p, next, 'pms');
    } else if (active.state === 'running' && active.v > 420 && active.f > 58) {
      el.deadBusT = (el.deadBusT ?? 0) + dt;
      if (el.deadBusT > 2) { el.deadBusT = 0; closeDgBreaker(p, active, true); }
    }
    return;
  }
  // Generadores en marcha sin acoplar (arrancados por el PMS o por el maquinista): sincroniza y acopla.
  for (const g of dgs(p)) {
    if (g.state !== 'running' || g.breaker || !remote(g) || g.unload) continue;
    if (g.timer < 6 || g.v < 420) continue;
    g.f0 = lag(g.f0, el.busF + 0.12, 2, dt);
    if (Math.abs(g.theta) < 6 && Math.abs(g.f - el.busF) < 0.25) closeDgBreaker(p, g, true);
  }
  // Reparto de carga y frecuencia a 60 Hz.
  const share = on.filter((g) => !g.unload && remote(g));
  const totalRated = share.reduce((a, g) => a + g.rated, 0) || 1;
  const total = on.reduce((a, g) => a + g.kw, 0);
  for (const g of share) {
    const target = total * (g.rated / totalRated);
    g.f0 += dt * (0.25 * (F_NOM - el.busF) + 0.6 * (target - g.kw) / (g.rated / DROOP_HZ));
  }
  // Descarga y parada de un generador marcado para salir.
  for (const g of on) {
    if (!g.unload) continue;
    g.f0 -= 0.4 * dt;
    if (g.kw < 0.05 * g.rated) { openDgBreaker(p, g, null); g.cool = 0; }
  }
  for (const g of dgs(p)) {
    if (g.unload && !g.breaker && g.state === 'running') {
      g.cool += dt;
      if (g.cool > 30) { stopDg(p, g); g.unload = false; }
    }
  }
  // Arranque por carga alta (85 %) y parada por carga baja.
  const cap = on.reduce((a, g) => a + g.rated, 0);
  el.highLoadT = total > 0.85 * cap ? el.highLoadT + dt : 0;
  if (el.highLoadT > 10) {
    el.highLoadT = 0;
    const next = byPrio.find((g) => remote(g) && g.state === 'stopped');
    if (next) {
      startDg(p, next, 'pms');
      log(p, 'pms-loadstart', `High load: ${next.en} started by PMS.`, `Carga alta: el PMS arranca el ${next.es.toLowerCase()}.`);
    }
  }
  const smallest = Math.min(...on.map((g) => g.rated));
  el.lowLoadT = on.length > 1 && total < 0.4 * (cap - smallest) && !on.some((g) => g.unload) ? el.lowLoadT + dt : 0;
  if (el.lowLoadT > 120) {
    el.lowLoadT = 0;
    const last = [...byPrio].reverse().find((g) => g.breaker && remote(g));
    if (last) {
      last.unload = true;
      log(p, 'pms-loadstop', `Low load: PMS unloading ${last.en}.`, `Carga baja: el PMS descarga el ${last.es.toLowerCase()}.`);
    }
  }
}

function closeDgBreaker(p, g, auto = false) {
  const el = p.elec;
  if (p.sig.msbLive && msbFromDg(p)) {
    // Acoplamiento en paralelo: comprobación de sincronismo.
    const bad = Math.abs(g.theta) > 30 || Math.abs(g.f - el.busF) > 0.6 || Math.abs(g.v - el.busV) > 30;
    if (bad) {
      p.stats.badSync++;
      g.breaker = false;
      alarm(p, `${g.id}-sync`, true, `${g.en} breaker closed out of synchronism: tripped`, `${g.es}: cierre fuera de sincronismo, disparado`, 'trip');
      return M('Out of synchronism! The breaker tripped. Match frequency and close at 12 o\'clock.', '¡Fuera de sincronismo! El interruptor ha disparado. Iguala la frecuencia y cierra con la aguja arriba (las 12).');
    }
  }
  g.breaker = true;
  g.theta = 0;
  if (!el.busF) { el.busF = g.f; el.busV = g.v; }
  log(p, `${g.id}-breaker-closed`, `${g.en} breaker closed${auto ? ' by PMS' : ''}.`, `${g.es}: interruptor cerrado${auto ? ' por el PMS' : ''}.`);
  return null;
}

function startDg(p, g, who) {
  if (g.state !== 'stopped') return null;
  if (g.trip && g.trip !== 'start') return M(`${g.en} has a shutdown active. Reset it first.`, `${g.es} tiene una parada activa. Rearma primero.`);
  const air = drawAir(p, 'dg', 1.2);
  if (air < 7) {
    g.failT = p.t;
    alarm(p, `${g.id}-startfail`, true, `${g.en} start failure: low starting air`, `${g.es}: fallo de arranque por aire bajo`);
    return M('Not enough starting air (min. 7 bar). Charge the air receivers.', 'No hay aire de arranque suficiente (mín. 7 bar). Carga las botellas.');
  }
  g.trip = null;
  alarm(p, `${g.id}-startfail`, false);
  g.state = 'starting';
  g.timer = 0;
  g.f0 = F_NOM + DROOP_HZ / 2;
  log(p, `${g.id}-start`, `${g.en} starting${who === 'pms' ? ' (PMS)' : ''}.`, `${g.es}: arrancando${who === 'pms' ? ' (PMS)' : ''}.`);
  return null;
}

function stopDg(p, g) {
  g.state = 'stopped';
  log(p, `${g.id}-stop`, `${g.en} stopped.`, `${g.es}: parado.`);
}

// ---------- Acciones del operador ----------
const G = (p, n) => p.elec.dg[n - 1];
export const actions = {
  setPms(p, mode) {
    p.elec.pms = mode;
    log(p, `pms-${mode}`, `Power management: ${mode.toUpperCase()}.`, `Gestión de potencia: ${mode === 'auto' ? 'AUTOMÁTICA' : 'MANUAL'}.`);
    return null;
  },
  dgStart(p, n, local = false) {
    const g = G(p, n);
    if (!local && g.control === 'local') return M(`${g.en} is in LOCAL control. Start it from its local panel.`, `${g.es} está en control LOCAL. Arráncalo desde su panel local.`);
    return startDg(p, g, 'operator');
  },
  dgStop(p, n, local = false) {
    const g = G(p, n);
    if (!local && g.control === 'local') return M(`${g.en} is in LOCAL control.`, `${g.es} está en control LOCAL.`);
    if (g.breaker) return M('Open the generator breaker first (unload it).', 'Abre primero el interruptor del generador (descárgalo).');
    if (g.state === 'stopped') return null;
    stopDg(p, g);
    return null;
  },
  dgControl(p, n, mode) { G(p, n).control = mode; return null; },
  dgReset(p, n) {
    const g = G(p, n);
    g.trip = null;
    for (const k of ['shutdown', 'startfail', 'sync', 'brtrip']) alarm(p, `${g.id}-${k}`, false);
    log(p, `${g.id}-reset`, `${g.en} reset.`, `${g.es}: rearmado.`);
    return null;
  },
  breakerClose(p, n) {
    const g = G(p, n);
    if (g.breaker) return null;
    if (g.state !== 'running' || g.v < 400 || g.f < 55) return M('The generator is not ready: start it and wait for voltage and frequency.', 'El generador no está listo: arráncalo y espera tensión y frecuencia.');
    if (backfeed(p)) return M('The MSB is fed from the emergency generator. Open the emergency generator breaker first.', 'El MSB está alimentado desde el generador de emergencia. Abre primero el interruptor del generador de emergencia.');
    return closeDgBreaker(p, g);
  },
  breakerOpen(p, n) {
    const g = G(p, n);
    if (!g.breaker) return null;
    if (connected(p).length === 1 && g.kw > 50) {
      log(p, 'manual-blackout', `${g.en} breaker opened with load.`, `${g.es}: interruptor abierto con carga.`);
    }
    openDgBreaker(p, g, null);
    return null;
  },
  governor(p, n, dir) {
    const g = G(p, n);
    if (g.state !== 'running') return M('The generator is not running.', 'El generador no está en marcha.');
    g.f0 = clamp(g.f0 + dir * 0.1, 55, 66);
    return null;
  },
  avr(p, n, dir) {
    const g = G(p, n);
    g.v0 = clamp(g.v0 + dir * 2, 400, 480);
    return null;
  },
  syncSelect(p, n) { p.elec.syncSel = n; return null; },
  setPriority(p, order) { p.elec.priority = order; return null; },
  resetPrefTrip(p) {
    for (const f of Object.values(p.feeders)) if (f.pref && f.trip) f.trip = false;
    alarm(p, 'pref-trip', false);
    log(p, 'pref-reset', 'Preferential trip reset.', 'Disparo preferente rearmado.');
    return null;
  },
  feeder(p, id, on) {
    const f = p.feeders[id];
    if (on && f.trip) { f.trip = false; }
    f.on = on;
    log(p, `feeder:${id}:${on ? 'on' : 'off'}`, `${f.en} breaker ${on ? 'ON' : 'OFF'}.`, `Interruptor «${f.es}»: ${on ? 'conectado' : 'desconectado'}.`);
    return null;
  },
  // Generador de emergencia
  egMode(p, mode) {
    const e = p.elec.eg;
    if (e.mode === mode) return null;
    e.mode = mode;
    log(p, `eg-mode-${mode}`, `Emergency generator control switched to ${mode.toUpperCase()}.`, `Control del generador de emergencia en ${mode === 'auto' ? 'AUTOMÁTICO' : 'MANUAL'}.`);
    return null;
  },
  egTieMode(p, mode) {
    const e = p.elec.eg;
    if (e.tieMode === mode) return null;
    e.tieMode = mode;
    log(p, `eg-tie-${mode}`, mode === 'normal' ? 'Tie breaker control: normal operation.' : 'Tie breaker control: emergency supply of MSB.',
      mode === 'normal' ? 'Acoplamiento: operación normal.' : 'Acoplamiento: alimentación de emergencia del MSB.');
    if (mode === 'emergency' && e.mode === 'auto') return M('Emergency supply of the MSB only works in MANUAL.', 'La alimentación del MSB desde el generador de emergencia solo funciona en MANUAL.');
    return null;
  },
  egMeter(p, which, phase) { p.elec.eg[which] = phase; p.history.add(`eg-${which}-L${phase}`); return null; },
  egBreakerOn(p) {
    const e = p.elec.eg;
    if (e.mode === 'auto') return M('The selector is in AUTO: the breaker is automatic. Switch to MANUAL (2).', 'El selector está en AUTO: el interruptor es automático. Pasa a MANUAL (2).');
    if (e.breaker) return null;
    if (e.trip) return M('Overcurrent trip active. Press RESET first.', 'Hay un disparo por sobrecorriente activo. Pulsa RESET primero.');
    if (e.v < 420) return M('No generator voltage: start the engine and wait for 440 V.', 'El generador no tiene tensión: arranca el motor y espera a los 440 V.');
    if (e.tie && msbFromDg(p)) return M('Interlock: the ESB is already fed from the MSB.', 'Bloqueo: el ESB ya está alimentado desde el MSB.');
    e.breaker = true;
    log(p, 'eg-breaker-closed', 'Emergency generator breaker closed.', 'Interruptor del generador de emergencia cerrado.');
    return null;
  },
  egBreakerOff(p) {
    const e = p.elec.eg;
    if (e.mode === 'auto') return M('The selector is in AUTO: the breaker is automatic. Switch to MANUAL (2).', 'El selector está en AUTO: el interruptor es automático. Pasa a MANUAL (2).');
    if (!e.breaker) return null;
    e.breaker = false;
    log(p, 'eg-breaker-opened', 'Emergency generator breaker opened.', 'Interruptor del generador de emergencia abierto.');
    return null;
  },
  egReset(p) {
    const e = p.elec.eg;
    if (!e.trip) return M('There is no overcurrent trip to reset.', 'No hay ningún disparo que rearmar.');
    e.trip = false;
    e.overT = 0;
    log(p, 'eg-reset', 'Overcurrent trip reset.', 'Disparo por sobrecorriente rearmado.');
    return null;
  },
  // Panel local (LCP) del motor del generador de emergencia
  egLcp(p, mode) { p.elec.eg.lcp = mode; return null; },
  egStart(p) {
    const e = p.elec.eg;
    if (e.estop) return M('Emergency stop is pressed. Release it first.', 'La parada de emergencia está pulsada. Desbloquéala primero.');
    if (e.state === 'running' || e.state === 'cranking') return null;
    if (e.startFail) return M('Start failure / shutdown active. Press RESET on the local panel.', 'Fallo de arranque o parada activa. Pulsa RESET en el panel local.');
    beginCrank(p, 'battery', 'manual');
    return null;
  },
  egHsStart(p) {
    const e = p.elec.eg;
    const hs = p.elec.hs;
    if (e.state === 'running' || e.state === 'cranking') return null;
    if (e.lcp !== 'local') return M('Hydraulic start is local: set the local panel to LOCAL.', 'El arranque hidráulico es local: pon el panel local en LOCAL.');
    if (hs.press < 150) return M('Not enough hydraulic pressure (min. 150 bar). Use the hand pump.', 'No hay presión hidráulica suficiente (mín. 150 bar). Usa la bomba manual.');
    hs.press -= 45;
    e.startFail = false;
    beginCrank(p, 'hs', 'manual');
    return null;
  },
  egHsPump(p) { p.elec.hs.press = Math.min(230, p.elec.hs.press + 6); p.history.add('hs-pump'); return null; },
  egStop(p) {
    const e = p.elec.eg;
    if (e.breaker && e.mode === 'manual') return M('Open the generator breaker first.', 'Abre primero el interruptor del generador.');
    if (e.state === 'stopped') return null;
    if (e.breaker) e.breaker = false;
    stopEg(p, 'Emergency generator stopped.', 'Generador de emergencia parado.');
    return null;
  },
  egEstop(p, on) {
    const e = p.elec.eg;
    e.estop = on;
    if (on && e.state !== 'stopped') stopEg(p, 'Emergency generator emergency stop.', 'Parada de emergencia del generador de emergencia.', true);
    return null;
  },
  egLcpReset(p) {
    const e = p.elec.eg;
    e.startFail = false;
    e.attempts = 0;
    for (const k of ['eg-startfail', 'eg-shutdown']) alarm(p, k, false);
    log(p, 'eg-lcp-reset', 'Emergency generator alarms reset.', 'Alarmas del generador de emergencia rearmadas.');
    return null;
  },
  chargerOn(p, on) { p.elec.charger.on = on; log(p, `charger-${on ? 'on' : 'off'}`, `Battery charger ${on ? 'ON' : 'OFF'}.`, `Cargador de baterías ${on ? 'encendido' : 'apagado'}.`); return null; },
  flapsMode(p, mode) { p.elec.flaps.mode = mode; return null; },
  flaps(p, open) { p.elec.flaps.mode = 'manual'; p.elec.flaps.cmdOpen = open; return null; },
  qcvReset(p) {
    if (p.faults['eg-qcv']) return M('The quick-closing valve is still tripped (instructor fault).', 'La válvula de cierre rápido sigue disparada (avería del instructor).');
    p.c.egQcv.open = true;
    log(p, 'eg-qcv-reset', 'EG quick-closing valve reset (open).', 'Válvula de cierre rápido del G. E. rearmada (abierta).');
    return null;
  },
};

// ---------- Situaciones iniciales ----------
function runDg(g, breaker = true) {
  Object.assign(g, { state: 'running', timer: 15, f: F_NOM, v: V_NOM, breaker, htTemp: 78, loPress: 4.4, f0: F_NOM + DROOP_HZ / 2, theta: 0 });
}
export const setup = {
  sea(p) {
    runDg(p.elec.dg[0]);
    runDg(p.elec.dg[1]);
    Object.assign(p.elec, { busF: F_NOM, busV: V_NOM });
  },
  port(p) {
    runDg(p.elec.dg[0]);
    Object.assign(p.elec, { busF: F_NOM, busV: V_NOM });
  },
  dead(p) {
    p.elec.eg.tie = false;
    p.elec.battery.soc = 0.85;
    p.c.egfan.cmd = true;
  },
};
