// Motor principal: 2 tiempos lento de 6 cilindros (MCR 10 000 kW a 105 rpm), telégrafo de órdenes,
// puestos de control (puente / sala de control ECR / local), arranque con aire, inversión de marcha,
// protecciones (slowdown y shutdown con anulación) y cierre de la bocina (stern tube seal).
import { addMotor, addValve, addTank, alarm, log, lag, clamp, isOpen, pct, powered, M } from '../core.js';
import { drawAir } from './air.js';

export const MCR_KW = 10000;
export const MCR_RPM = 105;
export const CYL = 6;
// Órdenes del telégrafo con sus revoluciones (signo: avante +, atrás −).
export const ORDERS = [
  { k: 'FAS', rpm: -70, en: 'FULL ASTERN', es: 'Atrás toda' },
  { k: 'HAS', rpm: -55, en: 'HALF ASTERN', es: 'Atrás media' },
  { k: 'SAS', rpm: -40, en: 'SLOW ASTERN', es: 'Atrás poca' },
  { k: 'DSAS', rpm: -28, en: 'DEAD SLOW ASTERN', es: 'Atrás muy poca' },
  { k: 'STOP', rpm: 0, en: 'STOP', es: 'Parar' },
  { k: 'DSA', rpm: 28, en: 'DEAD SLOW AHEAD', es: 'Avante muy poca' },
  { k: 'SA', rpm: 40, en: 'SLOW AHEAD', es: 'Avante poca' },
  { k: 'HA', rpm: 55, en: 'HALF AHEAD', es: 'Avante media' },
  { k: 'FA', rpm: 75, en: 'FULL AHEAD', es: 'Avante toda' },
  { k: 'NFA', rpm: 90, en: 'NAV. FULL AHEAD', es: 'Avante toda de navegación' },
];
export const STOP_I = 4;
export const orderIndex = (x) => (typeof x === 'string' ? ORDERS.findIndex((o) => o.k === x) : x);
export const CONTROL = { bridge: ['BRIDGE', 'Puente'], ecr: ['ECR', 'Sala de control'], local: ['LOCAL', 'Local (costado del motor)'] };

const SLOWDOWN_RPM = 40;
const CUT_MAX_RPM = 92; // con un cilindro anulado
const OVERSPEED = 115;
const SPREAD = [-6, 4, 0, 7, -3, 2]; // dispersión normal de temperaturas de escape (°C)
const EXH_ALARM = 430, EXH_SLD = 450;

export const SLOWDOWNS = {
  jcw: ['High jacket cooling water temperature', 'Temperatura alta del agua de camisas'],
  jcwflow: ['Low jacket cooling water flow', 'Caudal bajo de agua de camisas'],
  exh: ['High exhaust gas temperature', 'Temperatura alta de gases de escape'],
  lo: ['Low main lube oil pressure', 'Presión baja de aceite de lubricación'],
  stbrg: ['High stern tube bearing temperature', 'Temperatura alta de la chumacera de la bocina'],
};
export const SHUTDOWNS = {
  lo: ['Main lube oil pressure low-low', 'Presión de aceite muy baja'],
  overspeed: ['Overspeed', 'Sobrevelocidad'],
  estop: ['Emergency stop', 'Parada de emergencia'],
};

export function init(p) {
  addMotor(p, 'aux1', { en: 'Auxiliary blower No 1', es: 'Soplante auxiliar nº 1', kind: 'fan', kw: 45 });
  addMotor(p, 'aux2', { en: 'Auxiliary blower No 2', es: 'Soplante auxiliar nº 2', kind: 'fan', kw: 45 });
  addValve(p, 'me-msv', { en: 'ME main starting valve', es: 'Válvula principal de arranque del motor principal', open: true });
  p.c['me-msv'].interlock = (pp, opening) => (!opening && ['starting', 'firing'].includes(pp.me.state) ? M('Engine is starting: wait.', 'El motor está arrancando: espera.') : null);
  p.me = {
    control: 'bridge', transferReq: null,
    tel: STOP_I, ans: STOP_I, loc: STOP_I,
    state: 'stopped', phaseT: 0, waitT: 0, attempts: 0, startFail: false, blockedT: 0,
    dir: 1, rpm: 0, setRpm: 0, fuelIdx: 0, load: 0, speed: 0,
    exh: Array(CYL).fill(60), scav: 0, tcRpm: 0,
    turningGear: false, blowerAuto: true,
    slowdown: null, shutdown: null, override: false, estop: false,
    cut: Array(CYL).fill(false), wrongT: 0, govT: 0, hunt: 0,
  };
  // Bocina: tanques de cabeza de los sellos de popa y proa, tanque de gravedad y tanque de retorno.
  addTank(p, 'stAft', { en: 'Aft seal header tank', es: 'Tanque de cabeza del sello de popa', cap: 0.08, level: 0.06, fluid: 'lo' });
  addTank(p, 'stFwd', { en: 'Fwd seal header tank', es: 'Tanque de cabeza del sello de proa', cap: 0.08, level: 0.06, fluid: 'lo' });
  addTank(p, 'stGrav', { en: 'Stern tube LO gravity tank', es: 'Tanque de gravedad de aceite de la bocina', cap: 1.2, level: 0.95, fluid: 'lo' });
  addTank(p, 'stDrain', { en: 'Stern tube LO drain tank', es: 'Tanque de retorno de aceite de la bocina', cap: 2, level: 1.2, fluid: 'lo' });
  addMotor(p, 'stFill', { en: 'Stern tube LO filling pump', es: 'Bomba de llenado de aceite de la bocina', kw: 2 });
  addValve(p, 'v-st-grav', { en: 'Filling valve to gravity tank', es: 'Válvula de llenado al tanque de gravedad', open: true });
  addValve(p, 'v-st-aft', { en: 'Filling valve to aft seal tank', es: 'Válvula de llenado al tanque del sello de popa' });
  addValve(p, 'v-st-fwd', { en: 'Filling valve to fwd seal tank', es: 'Válvula de llenado al tanque del sello de proa' });
  p.st = { brgT: 40 };
}

export const FAULTS = [
  { id: 'me-cyl3', en: 'ME cylinder 3 high exhaust temperature (leaking fuel valve)', es: 'Temperatura alta de escape del cilindro 3 (inyector goteando)', system: 'me' },
  { id: 'me-tc', en: 'ME turbocharger fouling', es: 'Turbosoplante del motor principal sucia', system: 'me' },
  { id: 'me-startvalve', en: 'ME automatic starting air valve stuck', es: 'Válvula automática de aire de arranque atascada', system: 'me' },
  { id: 'me-gov', en: 'ME governor failure (speed hunting)', es: 'Avería del regulador del motor principal (oscila)', system: 'me' },
  { id: 'aux1', en: 'Auxiliary blower No 1 failure', es: 'Avería de la soplante auxiliar nº 1', system: 'me' },
  { id: 'st-aft-leak', en: 'Stern tube aft seal leak', es: 'Fuga por el sello de popa de la bocina', system: 'sterntube' },
  { id: 'st-lo-leak', en: 'Stern tube LO gravity tank leak', es: 'Fuga en el tanque de gravedad de la bocina', system: 'sterntube' },
];

const blowersRunning = (p) => p.c.aux1.run || p.c.aux2.run;
const cmdIndex = (me) => (me.control === 'bridge' ? me.tel : me.control === 'ecr' ? me.ans : me.loc);
const cutCount = (me) => me.cut.filter(Boolean).length;

// Bloqueos de arranque. Devuelve la lista de condiciones que impiden arrancar (mensajes bilingües).
export function meInterlocks(p) {
  const me = p.me;
  const out = [];
  if (me.estop) out.push(M('Emergency stop pressed', 'Parada de emergencia pulsada'));
  if (me.shutdown) out.push(M('Shutdown active: reset it', 'Parada de seguridad activa: rearma'));
  if (me.startFail) out.push(M('Start failure: reset it', 'Fallo de arranque: rearma'));
  if (me.turningGear) out.push(M('Turning gear engaged', 'Virador engranado'));
  if ((p.sig.meLoPress ?? 2.8) <= 1.8) out.push(M('Main lube oil pressure low', 'Presión de aceite de lubricación baja'));
  if ((p.sig.meStartAir ?? 30) <= 15) out.push(M('Starting air pressure low', 'Presión de aire de arranque baja'));
  if (!isOpen(p, 'me-msv')) out.push(M('Main starting valve closed', 'Válvula principal de arranque cerrada'));
  if (!(p.sig.meFuelOk ?? true)) out.push(M('Fuel oil system not ready', 'Sistema de combustible no preparado'));
  if ((p.sig.controlAir ?? 7) <= 5) out.push(M('Control air pressure low', 'Presión de aire de control baja'));
  if (!blowersRunning(p)) out.push(M('Auxiliary blowers not running', 'Soplantes auxiliares paradas'));
  return out;
}

function startFailed(p, en, es) {
  const me = p.me;
  me.attempts += 1;
  me.state = 'stopping';
  me.waitT = 4;
  log(p, 'me-start-attempt-failed', `ME start attempt ${me.attempts} failed: ${en}.`, `Intento de arranque ${me.attempts} fallido: ${es}.`);
  if (me.attempts >= 3) {
    me.startFail = true;
    log(p, 'me-startfail', 'ME start failure (3 attempts).', 'Fallo de arranque del motor principal (3 intentos).');
  }
}

function stepEngine(p, dt) {
  const me = p.me;
  for (const id of ['aux1', 'aux2']) p.c[id].fault = Boolean(p.faults[id]);
  if (me.control === 'bridge') me.ans = me.tel; // el mando de la ECR sigue al puente
  const fuelOk = p.sig.meFuelOk ?? true;
  const lo = p.sig.meLoPress ?? 2.8;
  const ht = p.sig.htTemp ?? 80;
  const htFlow = p.sig.htFlow ?? 1;
  const ci = cmdIndex(me);
  const order = ORDERS[ci].rpm;
  const want = Math.sign(order);
  if (want === 0 && me.state === 'stopped') me.attempts = 0;

  // Límites de revoluciones: slowdown y cilindro anulado.
  let lim = MCR_RPM * 1.03;
  if (cutCount(me)) lim = Math.min(lim, CUT_MAX_RPM);
  if (me.slowdown && !me.override) lim = Math.min(lim, SLOWDOWN_RPM);
  me.setRpm = want * Math.min(Math.abs(order), lim);

  // Soplantes auxiliares en automático: con orden de marcha y carga baja.
  if (me.blowerAuto) {
    const demand = want !== 0 || me.state !== 'stopped';
    const on = demand && (me.state !== 'running' || me.load < 0.2 || (blowersRunning(p) && me.load < 0.3));
    for (const id of ['aux1', 'aux2']) if (!p.c[id].local) p.c[id].cmd = on && !p.c[id].trip;
  }

  // Máquina de estados del arranque / marcha / parada.
  const ilk = meInterlocks(p);
  me.waitT = Math.max(0, me.waitT - dt);
  switch (me.state) {
    case 'stopped':
      me.rpm = lag(me.rpm, 0, 2, dt);
      if (want !== 0 && Math.abs(me.rpm) < 1 && me.waitT <= 0) {
        if (ilk.length) me.blockedT += dt;
        else {
          me.blockedT = 0;
          me.state = 'starting';
          me.phaseT = 0;
          me.dir = want;
          drawAir(p, 'me', 1.5);
          log(p, 'me-start', `ME starting on air (${want > 0 ? 'ahead' : 'astern'}).`, `Arranque con aire del motor principal (${want > 0 ? 'avante' : 'atrás'}).`);
        }
      } else me.blockedT = 0;
      break;
    case 'starting': // aire de arranque
      me.phaseT += dt;
      if (want !== me.dir) { me.state = 'stopping'; break; }
      if (!p.faults['me-startvalve'] && isOpen(p, 'me-msv')) me.rpm = lag(me.rpm, 32 * me.dir, 1.2, dt);
      if (me.rpm * me.dir >= 25) { me.state = 'firing'; me.phaseT = 0; }
      else if (me.phaseT > 5) startFailed(p, 'no air turning speed', 'sin velocidad de arranque con aire');
      break;
    case 'firing': // entra combustible
      me.phaseT += dt;
      if (!fuelOk) {
        me.rpm = lag(me.rpm, 0, 2, dt);
        if (me.phaseT > 3) startFailed(p, 'no ignition (fuel)', 'no enciende (combustible)');
      } else {
        me.rpm = lag(me.rpm, me.setRpm || 25 * me.dir, 2, dt);
        if (me.phaseT > 2) {
          me.state = 'running';
          me.attempts = 0;
          log(p, 'me-running', 'ME running on fuel.', 'Motor principal en marcha con combustible.');
        }
      }
      break;
    case 'running': {
      if (want !== me.dir || !fuelOk || me.shutdown) { me.state = 'stopping'; break; }
      // Programa de carga: rápido hasta 70 rpm, lento por encima.
      const tgt = me.setRpm;
      const cur = me.rpm * me.dir;
      const up = cur >= 70 ? 0.12 : 1.5;
      const step = clamp(Math.abs(tgt) - cur, -3 * dt, up * dt);
      me.base = (me.base ?? cur) + step;
      if (Math.abs(me.base - cur) > 5) me.base = cur + step;
      me.hunt = p.faults['me-gov'] ? 6 * Math.sin((2 * Math.PI * p.t) / 15) : lag(me.hunt, 0, 2, dt);
      me.rpm = me.dir * lag(cur, me.base + me.hunt, 1, dt);
      break;
    }
    case 'stopping': {
      // Sin combustible: el motor se frena; para invertir se frena con aire por debajo de 40 rpm.
      const reverse = want !== 0 && want !== me.dir;
      const air = reverse && Math.abs(me.rpm) < 40 && isOpen(p, 'me-msv') && (p.sig.meStartAir ?? 30) > 10 && !me.shutdown;
      if (air) drawAir(p, 'me', 0.25 * dt);
      me.rpm = lag(me.rpm, 0, air ? 1.2 : 6, dt);
      if (Math.abs(me.rpm) < 0.5) { me.rpm = 0; me.state = 'stopped'; }
      else if (want === me.dir && fuelOk && !me.shutdown && !me.startFail && Math.abs(me.rpm) > 20) me.state = 'running';
      break;
    }
    default:
      me.state = 'stopped';
  }
  if (me.state !== 'running') me.base = Math.abs(me.rpm);

  const running = me.state === 'running' || me.state === 'firing';
  const r = Math.abs(me.rpm) / MCR_RPM;
  me.load = running ? r ** 3 : 0;
  const nCyl = CYL - cutCount(me);
  const effLoad = me.load * (CYL / nCyl);
  const fouled = Boolean(p.faults['me-tc']);

  // Escape por cilindro, turbosoplante, aire de barrido e índice de combustible.
  const coldT = Math.max(p.env.ambient, (p.sig.htTemp ?? 70) - 10);
  for (let i = 0; i < CYL; i++) {
    let t = coldT;
    if (running) {
      t = me.cut[i] ? 90 : 210 + 180 * effLoad + SPREAD[i] + (fouled ? 55 : 0);
      if (i === 2 && p.faults['me-cyl3'] && !me.cut[i]) t += 60 + 170 * effLoad;
    }
    me.exh[i] = lag(me.exh[i], t, running ? 15 : 120, dt);
  }
  const blow = blowersRunning(p) ? 0.12 : 0;
  me.scav = lag(me.scav, (running ? (0.05 + 2.4 * me.load ** 1.2) * (fouled ? 0.8 : 1) : 0) + blow, 6, dt);
  me.tcRpm = lag(me.tcRpm, running ? 14000 * me.load ** 0.55 * (fouled ? 0.9 : 1) : 0, 8, dt);
  me.fuelIdx = lag(me.fuelIdx, running ? (12 + 78 * r * r) * (fouled ? 1.05 : 1) * (CYL / nCyl) : 0, 2, dt);

  // Velocidad del buque (respuesta lenta de primer orden).
  me.speed = lag(me.speed, me.rpm >= 0 ? 0.15 * me.rpm : 0.1 * me.rpm, 200, dt);

  // ---------- Protecciones ----------
  const exhMax = Math.max(...me.exh);
  let sd = null;
  if (running) {
    if (ht > 92) sd = 'jcw';
    else if (htFlow < 0.3) sd = 'jcwflow';
    else if (exhMax > EXH_SLD) sd = 'exh';
    else if (lo < 1.5) sd = 'lo';
    else if (p.st.brgT > 70) sd = 'stbrg';
  }
  me.sdCond = sd;
  if (sd && !me.slowdown) {
    me.slowdown = sd;
    log(p, `me-slowdown-${sd}`, `ME SLOWDOWN: ${SLOWDOWNS[sd][0]}.`, `REDUCCIÓN DE CARGA (slowdown): ${SLOWDOWNS[sd][1]}.`);
  }
  let shd = null;
  if (Math.abs(me.rpm) > OVERSPEED) shd = 'overspeed';
  else if (me.estop && Math.abs(me.rpm) > 0) shd = 'estop';
  else if (me.state === 'running' && lo < 1.0 && !me.override) shd = 'lo';
  if (shd && !me.shutdown) {
    me.shutdown = shd;
    me.state = 'stopping';
    p.stats.trips += 1;
    log(p, `me-shutdown-${shd}`, `ME SHUTDOWN: ${SHUTDOWNS[shd][0]}.`, `PARADA DE SEGURIDAD: ${SHUTDOWNS[shd][1]}.`);
  }

  // ---------- Alarmas ----------
  alarm(p, 'me-slowdown', Boolean(me.slowdown), 'ME slowdown', 'Motor principal: reducción de carga (slowdown)', 'alarm');
  alarm(p, 'me-shutdown', Boolean(me.shutdown), 'ME shutdown', 'Motor principal: parada de seguridad (shutdown)', 'trip');
  for (let i = 0; i < CYL; i++) {
    alarm(p, `me-exh-${i + 1}`, me.exh[i] > EXH_ALARM, `ME exhaust gas temperature high cyl ${i + 1}`, `Temperatura alta de escape del cilindro ${i + 1}`);
  }
  const act = me.exh.filter((_, i) => !me.cut[i]);
  const mean = act.reduce((a, b) => a + b, 0) / Math.max(1, act.length);
  alarm(p, 'me-exh-dev', running && me.load > 0.15 && act.some((t) => Math.abs(t - mean) > 60), 'ME exhaust temperature deviation', 'Desviación de temperatura de escape entre cilindros', 'warn');
  alarm(p, 'me-jcw-high', running && ht > 90, 'ME jacket cooling water outlet temperature high', 'Temperatura alta de salida del agua de camisas');
  // Arranque en frío: el motor debe precalentarse (agua de camisas > 60 °C) antes de arrancar.
  if (me.state === 'starting' && me.phaseT < dt * 1.5 && ht < 50) log(p, 'me-cold-start', `ME started cold (JCW ${ht.toFixed(0)} °C).`, `Motor principal arrancado en frío (camisas a ${ht.toFixed(0)} °C).`);
  alarm(p, 'me-cold', running && ht < 50, 'ME running cold: jacket water below 50 °C (preheat before start)', 'Motor principal frío: agua de camisas por debajo de 50 °C (precalentar antes de arrancar)', 'warn');
  alarm(p, 'me-lo-low', running && lo < 1.8, 'ME main lube oil pressure low', 'Presión baja de aceite de lubricación del motor principal');
  const scavExp = 0.05 + 2.4 * me.load ** 1.2;
  alarm(p, 'me-scav-low', me.state === 'running' && me.load > 0.3 && me.scav < 0.88 * scavExp, 'ME scavenge air pressure low', 'Presión baja del aire de barrido', 'warn');
  alarm(p, 'me-startfail', me.startFail, 'ME start failure', 'Fallo de arranque del motor principal');
  alarm(p, 'me-startblock', me.blockedT > 3, 'ME start blocked (interlock)', 'Arranque del motor principal bloqueado (enclavamiento)', 'warn');
  const telAns = me.control === 'ecr' ? me.ans : me.control === 'local' ? me.loc : me.tel;
  alarm(p, 'me-tel', telAns !== me.tel, 'Engine telegraph: order not answered', 'Telégrafo: orden sin contestar', 'warn');
  const telRpm = ORDERS[me.tel].rpm;
  me.wrongT = running && telRpm !== 0 && Math.abs(me.rpm) > 5 && Math.sign(me.rpm) !== Math.sign(telRpm) ? me.wrongT + dt : 0;
  alarm(p, 'me-wrongway', me.wrongT > 3, 'ME wrong way (running against telegraph)', 'Motor en sentido contrario al telégrafo');
  me.govT = me.state === 'running' && Math.abs(me.hunt) > 3 ? me.govT + dt : Math.max(0, me.govT - dt);
  alarm(p, 'me-gov', me.govT > 6, 'ME governor abnormal (speed hunting)', 'Regulador del motor principal anormal (oscila)');
  alarm(p, 'me-nofuel', want !== 0 && !fuelOk && me.state !== 'stopped', 'ME stopped: no fuel', 'Motor principal parado: sin combustible');
  const blowNeed = me.blowerAuto && (want !== 0 || me.state !== 'stopped') && (me.state !== 'running' || me.load < 0.2);
  alarm(p, 'me-blower', blowNeed && !blowersRunning(p) && ['aux1', 'aux2'].every((id) => p.c[id].fault || p.c[id].trip || !powered(p, p.c[id])), 'Auxiliary blowers failure', 'Avería de las soplantes auxiliares');
  alarm(p, 'me-blower1', p.c.aux1.fault || p.c.aux1.trip, 'Auxiliary blower No 1 failure', 'Avería de la soplante auxiliar nº 1');
  alarm(p, 'me-blower2', p.c.aux2.fault || p.c.aux2.trip, 'Auxiliary blower No 2 failure', 'Avería de la soplante auxiliar nº 2');

  // ---------- Señales ----------
  p.sig.meRpm = me.rpm;
  p.sig.meLoad = me.load;
  p.sig.meRunning = running;
  p.sig.mePowerKw = me.load * MCR_KW;
  p.sig.meJcwHeatKw = me.load * MCR_KW * 0.16; // calor a las camisas (para refrigeración)
  p.sig.meScavPress = me.scav;
  p.sig.shipSpeed = me.speed;
  p.sig.meControl = CONTROL[me.control][0];
  p.sig.telegraph = ORDERS[me.tel].k;
}

// Motor listo para arrancar: todos los enclavamientos salvo las soplantes (en automático arrancan con la orden).
export const meReady = (p) => meInterlocks(p).length - (p.me.blowerAuto && !blowersRunning(p) ? 1 : 0) === 0;

// Hitos de la puesta en marcha (buque muerto → navegando) de motor principal, bocina y servo, en orden.
export const STARTUP = [
  { en: 'ME turning gear disengaged', es: 'Virador del motor principal desengranado', check: (p) => !p.me.turningGear },
  { en: 'Stern tube LO and seal tanks filled', es: 'Tanques de aceite y de sellos de la bocina llenos', check: (p) => pct(p.c.stGrav) >= 40 && pct(p.c.stAft) >= 30 && pct(p.c.stFwd) >= 30 },
  { en: 'ME preheated: jacket water above 60 °C', es: 'Motor principal precalentado: camisas por encima de 60 °C', check: (p) => (p.sig.htTemp ?? 80) >= 60 && (p.sig.htFlow ?? 1) >= 0.3 },
  { en: 'ME lube oil pressure OK', es: 'Presión de aceite del motor principal correcta', check: (p) => (p.sig.meLoPress ?? 2.8) > 1.8 },
  { en: 'Starting air above 15 bar and main starting valve open', es: 'Aire de arranque por encima de 15 bar y válvula principal de arranque abierta', check: (p) => (p.sig.meStartAir ?? 30) > 15 && isOpen(p, 'me-msv') },
  { en: 'Steering gear pumps running', es: 'Bombas del servomotor en marcha', check: (p) => Boolean(p.c.sgp1?.run && p.c.sgp2?.run) },
  { en: 'Main engine ready to start', es: 'Motor principal listo para arrancar', check: (p) => meReady(p) || p.me.state === 'running' },
  { en: 'Main engine running on fuel', es: 'Motor principal en marcha con combustible', check: (p) => p.me.state === 'running' },
  { en: 'ME control handed over to the bridge', es: 'Control del motor principal transferido al puente', check: (p) => p.me.control === 'bridge' && p.me.state === 'running' },
];

// ---------- Bocina (stern tube) ----------
function stepSternTube(p, dt) {
  const aft = p.c.stAft, fwd = p.c.stFwd, grav = p.c.stGrav, drain = p.c.stDrain;
  p.c.stFill.fault = Boolean(p.faults.stFill);
  // Bomba de llenado: del tanque de retorno a los tanques con válvula abierta (lo que rebosa vuelve).
  if (p.c.stFill.run) {
    const dest = [['v-st-grav', grav], ['v-st-aft', aft], ['v-st-fwd', fwd]].filter(([v, t]) => isOpen(p, v) && t.level < t.cap);
    const q = 0.0006 * dt;
    for (const [, t] of dest) {
      const a = Math.min(q / dest.length, drain.level, t.cap - t.level);
      drain.level -= a;
      t.level += a;
    }
    p.c.stFill.load = dest.length ? 1 : 0.6;
  }
  if (p.faults['st-aft-leak']) aft.level = Math.max(0, aft.level - 0.00005 * dt);
  if (p.faults['st-lo-leak']) grav.level = Math.max(0, grav.level - 0.0004 * dt);
  // Chumacera de popa: se calienta con las revoluciones y sin aceite.
  const r = Math.abs(p.sig.meRpm ?? 0) / MCR_RPM;
  const starved = pct(grav) < 20 ? 35 : 0;
  const sealDry = pct(aft) < 5 ? 8 : 0;
  p.st.brgT = lag(p.st.brgT, p.env.swTemp + 6 + 18 * r * r + (r > 0.05 ? starved + sealDry : 0), 240, dt);
  alarm(p, 'st-aft-low', pct(aft) < 30, 'Stern tube aft seal header tank low level', 'Nivel bajo del tanque del sello de popa');
  alarm(p, 'st-fwd-low', pct(fwd) < 30, 'Stern tube fwd seal header tank low level', 'Nivel bajo del tanque del sello de proa');
  alarm(p, 'st-grav-low', pct(grav) < 40, 'Stern tube LO gravity tank low level', 'Nivel bajo del tanque de gravedad de la bocina');
  alarm(p, 'st-brg-high', p.st.brgT > 60, 'Stern tube aft bearing temperature high', 'Temperatura alta de la chumacera de popa de la bocina');
  p.sig.sternLoOk = pct(grav) >= 20 && p.st.brgT < 65;
  p.sig.sternBrgT = p.st.brgT;
}

export function step(p, dt) {
  stepSternTube(p, dt);
  stepEngine(p, dt);
}

// ---------- Acciones ----------
const nameOf = (i) => `${ORDERS[i].en} / ${ORDERS[i].es}`;
function setLever(p, key, x, who) {
  const i = orderIndex(x);
  if (!(i >= 0 && i < ORDERS.length)) return M('Unknown order.', 'Orden desconocida.');
  if (p.me[key] !== i) log(p, `me-${key}-${ORDERS[i].k}`, `${who[0]}: ${ORDERS[i].en}.`, `${who[1]}: ${ORDERS[i].es}.`);
  p.me[key] = i;
  return null;
}

export const actions = {
  // Telégrafo del puente (en control desde el puente también mueve el motor).
  meTelegraph(p, x) { return setLever(p, 'tel', x, ['Bridge telegraph', 'Telégrafo del puente']); },
  // Palanca / contestación del telégrafo en la sala de control.
  meAnswer(p, x) {
    if (p.me.control !== 'ecr') return M('The ECR is not in control. Take control first (control transfer).', 'La sala de control no tiene el mando. Pide el control primero (transferencia).');
    return setLever(p, 'ans', x, ['ECR lever', 'Palanca de la sala de control']);
  },
  meLocalLever(p, x) {
    if (p.me.control !== 'local') return M('Local control is not selected at the engine side console.', 'No está seleccionado el control local en el puesto del motor.');
    return setLever(p, 'loc', x, ['Local control', 'Control local']);
  },
  // Transferencia de control. Puente ↔ ECR: se pide en un puesto y se acepta en el otro. Local: inmediato.
  meTransfer(p, to) {
    const me = p.me;
    if (!CONTROL[to]) return M('Unknown control position.', 'Puesto de control desconocido.');
    if (to === me.control) { me.transferReq = null; return null; }
    if (to === 'local' || me.control === 'local') {
      const ci = cmdIndex(me);
      me.control = to;
      me.transferReq = null;
      if (to === 'local') me.loc = ci; else if (to === 'ecr') me.ans = ci;
      else if (me.tel !== ci) { me.control = 'local'; return M('Match the bridge telegraph to the local lever first.', 'Iguala primero el telégrafo del puente con la palanca local.'); }
      log(p, `me-control-${to}`, `ME control transferred to ${CONTROL[to][0]}.`, `Control del motor principal transferido a ${CONTROL[to][1]}.`);
      return null;
    }
    me.transferReq = to;
    log(p, `me-transfer-req-${to}`, `ME control transfer to ${CONTROL[to][0]} requested.`, `Solicitada la transferencia del control a ${CONTROL[to][1]}.`);
    return null;
  },
  meTransferAccept(p) {
    const me = p.me;
    const to = me.transferReq;
    if (!to) return M('No control transfer requested.', 'No hay ninguna transferencia de control pendiente.');
    if (to === 'bridge' && me.tel !== me.ans) return M(`Set the bridge telegraph to ${nameOf(me.ans)} (same as the ECR lever) before accepting.`, `Pon el telégrafo del puente en ${ORDERS[me.ans].es} (igual que la palanca de la ECR) antes de aceptar.`);
    if (to === 'ecr') me.ans = me.tel;
    me.control = to;
    me.transferReq = null;
    log(p, `me-control-${to}`, `ME control transferred to ${CONTROL[to][0]}.`, `Control del motor principal transferido a ${CONTROL[to][1]}.`);
    return null;
  },
  meTurningGear(p, engage = !p.me.turningGear) {
    if (engage && (p.me.state !== 'stopped' || Math.abs(p.me.rpm) > 0.5)) return M('The engine is turning: stop it before engaging the turning gear.', 'El motor gira: páralo antes de engranar el virador.');
    if (p.me.turningGear !== engage) log(p, `me-tg-${engage ? 'in' : 'out'}`, `Turning gear ${engage ? 'engaged' : 'disengaged'}.`, `Virador ${engage ? 'engranado' : 'desengranado'}.`);
    p.me.turningGear = engage;
    return null;
  },
  meReset(p) {
    const me = p.me;
    const msgs = [];
    if (me.startFail) { me.startFail = false; me.attempts = 0; log(p, 'me-startfail-reset', 'ME start failure reset.', 'Fallo de arranque rearmado.'); }
    if (me.slowdown) {
      if (me.sdCond) msgs.push(M(`Slowdown cause still present: ${SLOWDOWNS[me.sdCond][0]}.`, `La causa del slowdown sigue presente: ${SLOWDOWNS[me.sdCond][1]}.`));
      else { me.slowdown = null; log(p, 'me-slowdown-reset', 'ME slowdown reset.', 'Slowdown rearmado.'); }
    }
    if (me.shutdown) {
      if (me.estop) msgs.push(M('Release the emergency stop first.', 'Desbloquea primero la parada de emergencia.'));
      else if (cmdIndex(me) !== STOP_I) msgs.push(M('Put the control lever to STOP before resetting the shutdown.', 'Pon la palanca de mando en STOP antes de rearmar la parada.'));
      else if (Math.abs(me.rpm) > 1) msgs.push(M('Wait until the engine has stopped.', 'Espera a que el motor se pare.'));
      else { me.shutdown = null; log(p, 'me-shutdown-reset', 'ME shutdown reset.', 'Parada de seguridad rearmada.'); }
    }
    return msgs[0] ?? null;
  },
  meOverride(p, on = !p.me.override) {
    p.me.override = on;
    log(p, `me-override-${on ? 'on' : 'off'}`, `ME safety override ${on ? 'ON (slowdown/shutdown cancelled)' : 'OFF'}.`, `Anulación de protecciones ${on ? 'ACTIVADA (slowdown/parada anulados)' : 'DESACTIVADA'}.`);
    return null;
  },
  meEstop(p, on = !p.me.estop) {
    p.me.estop = on;
    if (on) log(p, 'me-estop', 'ME EMERGENCY STOP.', 'PARADA DE EMERGENCIA del motor principal.');
    return null;
  },
  meBlowerAuto(p, on = !p.me.blowerAuto) {
    p.me.blowerAuto = on;
    log(p, `me-blower-${on ? 'auto' : 'man'}`, `Auxiliary blowers in ${on ? 'AUTO' : 'MANUAL'}.`, `Soplantes auxiliares en ${on ? 'AUTOMÁTICO' : 'MANUAL'}.`);
    return null;
  },
  // Anular (levantar el rodillo de) la bomba de combustible de un cilindro.
  meCylCut(p, n, on = !p.me.cut[n - 1]) {
    const me = p.me;
    if (on && cutCount(me) >= 1 && !me.cut[n - 1]) return M('Only one cylinder may be cut out.', 'Solo se puede anular un cilindro.');
    me.cut[n - 1] = on;
    log(p, `me-cut-${n}-${on ? 'out' : 'in'}`, `Fuel pump cylinder ${n} ${on ? 'cut out' : 'cut in'}.`, `Bomba de combustible del cilindro ${n} ${on ? 'anulada' : 'en servicio'}.`);
    return null;
  },
};

// ---------- Situaciones iniciales ----------
function runAt(p, i) {
  const me = p.me;
  const rpm = ORDERS[i].rpm;
  Object.assign(me, { tel: i, ans: i, loc: i, state: 'running', rpm, base: rpm, dir: 1, speed: 0.15 * rpm });
  const load = (rpm / MCR_RPM) ** 3;
  Object.assign(me, { load, scav: 0.05 + 2.4 * load ** 1.2, tcRpm: 14000 * load ** 0.55, fuelIdx: 12 + 78 * (rpm / MCR_RPM) ** 2 });
  me.exh = SPREAD.map((s) => 210 + 180 * load + s);
}

export const setup = {
  sea(p) {
    runAt(p, ORDERS.length - 1);
    p.me.control = 'bridge';
    p.st.brgT = p.env.swTemp + 6 + 18 * (90 / MCR_RPM) ** 2;
  },
  port(p) {
    Object.assign(p.me, { control: 'ecr', tel: STOP_I, ans: STOP_I, turningGear: false });
    p.me.exh.fill(70);
    p.st.brgT = p.env.swTemp + 6;
  },
  dead(p) {
    Object.assign(p.me, { control: 'ecr', tel: STOP_I, ans: STOP_I, turningGear: true });
    p.c['me-msv'].open = false;
    p.c['me-msv'].pos = 0;
    p.me.exh.fill(p.env.ambient);
    p.st.brgT = p.env.swTemp;
    p.c.stGrav.level = 0.35; // tanque de gravedad bajo: hay que rellenarlo con la bomba de llenado
  },
};
