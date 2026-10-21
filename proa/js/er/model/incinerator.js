// Incinerador: tanque de servicio de aceite residual (lodos) con calentador, ventilador de gases,
// quemador piloto de diésel, barrido (purge), encendido, quemador de aceite residual (solo por encima
// de 850 °C), puerta de carga de residuos sólidos con enclavamiento, paradas de seguridad y enfriamiento.
import { addMotor, addTank, alarm, log, lag, pct, M } from '../core.js';

const PURGE_S = 40;
const IGN_S = 8;
export const WO_MIN_T = 850; // °C mínimo para el quemador de aceite residual
const HIGH_WARN = 1050;
const HIGH_TRIP = 1150;
const SAFE_T = 150; // °C: por debajo se para el ventilador y se puede abrir la puerta
const Q_TP = 0.0008; // m³/s bomba de trasiego de lodos
const Q_WO = 0.00004; // m³/s consumo del quemador de aceite residual al 100 %
const Q_DO = 0.00001; // m³/s consumo del quemador piloto

export const STATES = {
  off: ['STOPPED', 'Parado'], purge: ['PRE-PURGE', 'Barrido previo'], ignition: ['IGNITION', 'Encendido'],
  firing: ['FIRING', 'En combustión'], cooling: ['COOLING DOWN', 'Enfriamiento'], lockout: ['LOCKOUT', 'Bloqueo de seguridad'],
};
const LOCK = {
  flame: ['Incinerator flame failure', 'Fallo de llama del incinerador'],
  fan: ['Incinerator flue gas fan failure', 'Fallo del ventilador de gases del incinerador'],
  hightemp: ['Incinerator high temperature shutdown', 'Parada del incinerador por alta temperatura'],
};

export const FAULTS = [
  { id: 'inc-flame', en: 'Incinerator ignition / flame failure', es: 'Fallo de encendido / llama del incinerador', system: 'incinerator' },
  { id: 'incFan', en: 'Incinerator flue gas fan failure', es: 'Avería del ventilador de gases del incinerador', system: 'incinerator' },
];

export function init(p) {
  addMotor(p, 'incFan', { en: 'Incinerator flue gas fan', es: 'Ventilador de gases del incinerador', kind: 'fan', kw: 11 });
  addMotor(p, 'incTp', { en: 'Sludge transfer pump (to incinerator)', es: 'Bomba de trasiego de lodos (al incinerador)', kw: 1.5 });
  addMotor(p, 'incHeat', { en: 'Waste oil tank heater', es: 'Calentador del tanque de aceite residual', kind: 'heater', kw: 6 });
  addTank(p, 'incWo', { en: 'Waste oil service tank', es: 'Tanque de servicio de aceite residual', cap: 0.8, level: 0.2, temp: 35, fluid: 'hfo' });
  if (!p.c.sludge) addTank(p, 'incSludge', { en: 'Sludge tank', es: 'Tanque de lodos', cap: 8, level: 4, temp: 35, fluid: 'hfo' });
  p.inc = { state: 'off', timer: 0, T: 35, flue: 35, wo: false, woRate: 0.7, doOn: false, woOn: false, door: false, solid: 0, lockout: null, burned: 0, woT: 0 };
}

export const sludgeTank = (p) => p.c.sludge ?? p.c.incSludge;
const ambient = (p) => p.env.ambient ?? 35;

function lockout(p, why) {
  const i = p.inc;
  i.state = 'lockout';
  i.lockout = why;
  i.wo = false;
  log(p, `inc-lockout:${why}`, `${LOCK[why][0]}: burner lockout.`, `${LOCK[why][1]}: bloqueo del quemador.`);
}

export function step(p, dt) {
  const i = p.inc, fan = p.c.incFan, wo = p.c.incWo;
  fan.fault = Boolean(p.faults.incFan);
  // Trasiego de lodos y calentamiento del tanque de servicio.
  const sl = sludgeTank(p);
  if (p.c.incTp.run) {
    if (pct(wo) > 95 || !sl || sl.level < 0.05) {
      p.c.incTp.cmd = false;
      log(p, 'inc-tp-stop', pct(wo) > 95 ? 'Sludge transfer pump stopped: waste oil tank full.' : 'Sludge transfer pump stopped: sludge tank empty.', pct(wo) > 95 ? 'Bomba de trasiego de lodos parada: tanque de aceite residual lleno.' : 'Bomba de trasiego de lodos parada: tanque de lodos vacío.');
    } else {
      const a = Math.min(Q_TP * dt, sl.level, wo.cap - wo.level);
      // Mezcla de temperaturas al entrar lodo frío.
      wo.temp = (wo.temp * wo.level + sl.temp * a) / Math.max(0.01, wo.level + a);
      sl.level -= a; wo.level += a;
    }
  }
  const heating = p.c.incHeat.run && wo.level > 0.08;
  wo.temp = lag(wo.temp, heating ? 90 : ambient(p), heating ? 200 : 2000, dt);
  if (p.c.incHeat.run) p.c.incHeat.load = heating && wo.temp < 92 ? 1 : 0.1;

  // Secuencia del quemador.
  i.timer += dt;
  const burning = ['ignition', 'firing'].includes(i.state);
  if (burning && !fan.run) lockout(p, 'fan');
  switch (i.state) {
    case 'purge':
      if (!fan.run && i.timer > 5) lockout(p, 'fan');
      else if (i.timer >= PURGE_S) { i.state = 'ignition'; i.timer = 0; }
      break;
    case 'ignition':
      if (i.timer >= IGN_S) {
        if (p.faults['inc-flame']) lockout(p, 'flame');
        else { i.state = 'firing'; i.timer = 0; i.doOn = true; log(p, 'inc-firing', 'Incinerator pilot (DO) burner ignited.', 'Quemador piloto (diésel) del incinerador encendido.'); }
      }
      break;
    case 'firing': {
      if (p.faults['inc-flame']) { lockout(p, 'flame'); break; }
      // Termostato del quemador de diésel: se apaga con el aceite residual ardiendo y la cámara caliente.
      if (i.woOn && i.T > 950) i.doOn = false;
      else if (i.T < 880 || !i.woOn) i.doOn = true;
      // Quemador de aceite residual.
      if (i.wo) {
        if (i.T < WO_MIN_T - 30 && i.woOn) { i.wo = false; log(p, 'inc-wo-lowtemp', 'Waste oil burner stopped: chamber temperature below 820 °C.', 'Quemador de aceite residual parado: cámara por debajo de 820 °C.'); }
        else if (wo.level < 0.02) { i.wo = false; log(p, 'inc-wo-empty', 'Waste oil burner stopped: service tank empty.', 'Quemador de aceite residual parado: tanque de servicio vacío.'); }
        else if (wo.temp < 60) { i.wo = false; log(p, 'inc-wo-flame', 'Waste oil flame failure: oil too cold (poor atomisation).', 'Fallo de llama del aceite residual: aceite demasiado frío (mala atomización).'); alarm(p, 'inc-wo-cold', true, 'Incinerator waste oil flame failure (oil too cold)', 'Fallo de llama del aceite residual (aceite frío)', 'warn'); }
      }
      i.woOn = i.wo && i.T >= WO_MIN_T - 30;
      break;
    }
    case 'cooling':
    case 'lockout':
      i.doOn = false; i.woOn = false; i.wo = false;
      if (i.T < SAFE_T && fan.cmd && i.state === 'cooling') {
        fan.cmd = false; i.state = 'off'; i.timer = 0;
        log(p, 'inc-cooled', 'Incinerator cooled down: fan stopped.', 'Incinerador enfriado: ventilador parado.');
      }
      break;
    default:
      i.doOn = false; i.woOn = false;
  }
  if (i.state !== 'firing') { i.doOn = false; i.woOn = false; }
  if (i.woOn) i.woT += dt;
  // Consumos.
  if (i.woOn) { const a = Math.min(wo.level, Q_WO * i.woRate * dt); wo.level -= a; i.burned += a; }
  if (i.doOn && p.c.doServ) p.c.doServ.level = Math.max(0, p.c.doServ.level - Q_DO * dt);
  // Residuos sólidos: arden por encima de 600 °C.
  let solidHeat = 0;
  if (i.solid > 0 && i.T > 600 && fan.run) { solidHeat = Math.min(200, i.solid * 3); i.solid = Math.max(0, i.solid - 0.03 * dt); }
  // Temperatura de la cámara de combustión.
  const target = ambient(p) + (i.doOn ? 900 : 0) + (i.woOn ? 1000 * i.woRate : 0) + solidHeat;
  const heatingUp = target > i.T;
  i.T = lag(i.T, target, heatingUp ? 150 : fan.run ? 300 : 900, dt);
  i.flue = lag(i.flue, fan.run ? ambient(p) + 0.35 * (i.T - ambient(p)) : i.T * 0.5, 30, dt);
  if (i.T > HIGH_TRIP && burning) lockout(p, 'hightemp');
  // Tras un bloqueo el ventilador sigue barriendo hasta que la cámara se enfría.
  if (i.state === 'lockout' && i.T > SAFE_T && !fan.cmd && !fan.fault) fan.cmd = true;
  if (i.state === 'lockout' && i.T <= SAFE_T && fan.cmd) fan.cmd = false;

  for (const k of Object.keys(LOCK)) alarm(p, `inc-${k}`, i.state === 'lockout' && i.lockout === k, LOCK[k][0], LOCK[k][1], k === 'hightemp' ? 'trip' : 'alarm');
  alarm(p, 'inc-high-t', i.T > HIGH_WARN, 'Incinerator combustion chamber high temperature', 'Temperatura alta en la cámara de combustión del incinerador', 'warn');
  if (p.alarms['inc-wo-cold']?.active && (wo.temp >= 60 || i.state !== 'firing')) alarm(p, 'inc-wo-cold', false);
  p.sig.incTemp = i.T;
  p.sig.incState = i.state;
}

export const actions = {
  incStart(p) {
    const i = p.inc;
    if (i.state === 'lockout') return M('Incinerator in lockout: reset it first.', 'Incinerador bloqueado: rearma primero.');
    if (i.state !== 'off') return M('Incinerator already in operation.', 'El incinerador ya está en servicio.');
    if (i.door) return M('Charging door open: close it to start (interlock).', 'Puerta de carga abierta: ciérrala para arrancar (enclavamiento).');
    if (!p.sig.msbLive) return M('No power on the main switchboard.', 'Sin tensión en el cuadro principal.');
    if (p.c.doServ && p.c.doServ.level < 0.05) return M('No diesel oil for the pilot burner.', 'Sin diésel para el quemador piloto.');
    const fan = p.c.incFan;
    if (fan.fault) return M('Flue gas fan faulty: cannot purge.', 'Ventilador de gases averiado: no se puede barrer.');
    fan.cmd = true;
    i.state = 'purge'; i.timer = 0; i.lockout = null;
    log(p, 'inc-start', 'Incinerator start: fan on, pre-purge.', 'Arranque del incinerador: ventilador en marcha, barrido previo.');
    return null;
  },
  incStop(p) {
    const i = p.inc;
    if (i.state === 'off' || i.state === 'cooling') return null;
    i.wo = false;
    i.state = i.state === 'lockout' ? 'lockout' : 'cooling';
    i.timer = 0;
    if (i.state === 'cooling') p.c.incFan.cmd = true;
    log(p, 'inc-stop', 'Incinerator stop: burners off, cooling down with fan.', 'Parada del incinerador: quemadores apagados, enfriamiento con el ventilador.');
    return null;
  },
  incReset(p) {
    const i = p.inc;
    if (i.state !== 'lockout') return null;
    i.state = i.T > SAFE_T ? 'cooling' : 'off';
    if (i.state === 'cooling') p.c.incFan.cmd = true;
    i.lockout = null;
    i.timer = 0;
    log(p, 'inc-reset', 'Incinerator lockout reset.', 'Bloqueo del incinerador rearmado.');
    return null;
  },
  incWasteOil(p, on = !p.inc.wo) {
    const i = p.inc;
    if (!on) {
      if (i.wo) log(p, 'inc-wo-off', 'Waste oil burner off.', 'Quemador de aceite residual apagado.');
      i.wo = false;
      return null;
    }
    if (i.state !== 'firing') return M('Start the incinerator first (pilot burner firing).', 'Arranca primero el incinerador (quemador piloto encendido).');
    if (i.T < WO_MIN_T) return M(`Chamber at ${i.T.toFixed(0)} °C: waste oil burner allowed only above ${WO_MIN_T} °C.`, `Cámara a ${i.T.toFixed(0)} °C: el quemador de aceite residual solo se permite por encima de ${WO_MIN_T} °C.`);
    if (p.c.incWo.level < 0.03) return M('Waste oil service tank empty.', 'Tanque de servicio de aceite residual vacío.');
    i.wo = true;
    log(p, 'inc-wo-on', 'Waste oil burner on.', 'Quemador de aceite residual encendido.');
    return null;
  },
  incWoRate(p, rate) {
    p.inc.woRate = Math.max(0.3, Math.min(1, Number(rate)));
    return null;
  },
  incDoor(p, open) {
    const i = p.inc;
    if (open) {
      if (!['off', 'lockout'].includes(i.state) || i.T > SAFE_T) return M(`Door interlock: chamber must be stopped and below ${SAFE_T} °C.`, `Enclavamiento de la puerta: la cámara debe estar parada y por debajo de ${SAFE_T} °C.`);
      i.door = true;
      log(p, 'inc-door-open', 'Incinerator charging door opened.', 'Puerta de carga del incinerador abierta.');
    } else {
      if (i.door) log(p, 'inc-door-close', 'Incinerator charging door closed.', 'Puerta de carga del incinerador cerrada.');
      i.door = false;
    }
    return null;
  },
  incLoad(p) {
    const i = p.inc;
    if (!i.door) return M('Open the charging door first.', 'Abre primero la puerta de carga.');
    if (i.solid >= 120) return M('Chamber full: maximum 120 kg per batch.', 'Cámara llena: máximo 120 kg por carga.');
    i.solid += 40;
    log(p, 'inc-load', 'Solid waste batch (40 kg) loaded.', 'Carga de residuos sólidos (40 kg) introducida.');
    return null;
  },
};

export const STARTUP = [
  { en: 'Incinerator stopped and safe (no lockout, door closed)', es: 'Incinerador parado y seguro (sin bloqueo, puerta cerrada)', check: (p) => ['off', 'firing'].includes(p.inc.state) && !p.inc.door },
];

export const setup = {
  sea() {},
  port() {},
  dead() {},
};
