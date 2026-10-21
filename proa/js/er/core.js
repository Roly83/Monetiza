// Núcleo del simulador de sala de máquinas: estado de la planta, componentes, alarmas y registro.
// Todo es lógica pura (sin DOM) para poder probarlo con node --test.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Aproximación de primer orden: el valor se acerca al objetivo con constante de tiempo tau (s).
export const lag = (v, target, tau, dt) => v + (target - v) * Math.min(1, dt / Math.max(tau, 1e-6));

export function createPlant() {
  return {
    t: 0, // segundos simulados
    seq: 0,
    c: {}, // componentes (bombas, válvulas, tanques…) por id
    sig: {}, // señales compartidas entre sistemas (ver README.md)
    alarms: {}, // id -> { id, en, es, sev, active, acked, t }
    events: [], // { id, t, code, en, es }
    history: new Set(), // marcas para las prácticas evaluadas
    faults: {}, // averías activas que provoca el instructor
    env: { swTemp: 28, ambient: 35, seaDistanceNm: 30 }, // agua de mar, aire exterior, distancia a costa
    stats: { badSync: 0, blackouts: 0, marpol: 0, trips: 0 }, // para la evaluación
  };
}

// ---------- Registro de eventos ----------
export function log(p, code, en, es) {
  p.events.push({ id: ++p.seq, t: p.t, code, en, es });
  p.history.add(code);
  if (p.events.length > 300) p.events.shift();
}

// ---------- Alarmas ----------
// sev: 'warn' (aviso), 'alarm' (alarma), 'trip' (disparo / parada)
export function alarm(p, id, active, en, es, sev = 'alarm') {
  const a = p.alarms[id];
  if (active) {
    if (!a || !a.active) {
      p.alarms[id] = { id, en, es, sev, active: true, acked: false, t: p.t };
      log(p, `alarm:${id}`, en, es);
    }
  } else if (a?.active) {
    a.active = false;
    if (a.acked) delete p.alarms[id];
  }
}

export function ackAlarms(p) {
  for (const [id, a] of Object.entries(p.alarms)) {
    if (a.active) a.acked = true;
    else delete p.alarms[id];
  }
}

export const unackedAlarms = (p) => Object.values(p.alarms).filter((a) => !a.acked);
export const isAlarm = (p, id) => Boolean(p.alarms[id]?.active);

// ---------- Componentes ----------
// Motores eléctricos (bombas, ventiladores, compresores, depuradoras…).
// cmd: orden de marcha · run: en marcha de verdad · standby: arranca solo si falla la de servicio
// restart: vuelve a arrancar sola cuando vuelve la tensión (arranque secuencial)
export function addMotor(p, id, { en, es, bus = 'MSB', kw = 10, kind = 'pump', restart = false, feeder = null }) {
  p.c[id] = {
    id, kind, en, es, bus, kw, kvar: kw * 0.6, restart, feeder,
    cmd: false, run: false, standby: false, fault: false, trip: false, local: false, hours: 0, restartDelay: 0, load: 1,
  };
  return p.c[id];
}

export function addValve(p, id, { en, es, open = false, kind = 'valve' }) {
  p.c[id] = { id, kind, en, es, open, pos: open ? 1 : 0, auto: false, fault: false };
  return p.c[id];
}

// Tanques: level y cap en m³, temp en °C.
export function addTank(p, id, { en, es, cap, level = 0, temp = 30, fluid = 'fw' }) {
  p.c[id] = { id, kind: 'tank', en, es, cap, level, temp, fluid };
  return p.c[id];
}

export const running = (p, id) => Boolean(p.c[id]?.run);
export const isOpen = (p, id) => Boolean(p.c[id]?.open) && !p.c[id]?.fault;
export const pct = (tank) => (tank.cap ? (100 * tank.level) / tank.cap : 0);

// Cambia el nivel de un tanque (m³) sin pasarse de los límites. Devuelve lo que se ha movido de verdad.
export function moveLevel(tank, delta) {
  const before = tank.level;
  tank.level = clamp(tank.level + delta, 0, tank.cap);
  return tank.level - before;
}
// Trasiego entre tanques limitado por lo que hay en origen y el hueco en destino.
export function transfer(from, to, amount) {
  const a = Math.min(amount, from.level, to ? to.cap - to.level : Infinity);
  if (a <= 0) return 0;
  from.level -= a;
  if (to) to.level += a;
  return a;
}

export const busLive = (p, bus) => (bus === 'ESB' ? Boolean(p.sig.esbLive) : Boolean(p.sig.msbLive));

// Interruptores de salida de los cuadros (feeders). kw: consumo fijo propio (alumbrado, equipos…).
// pref: consumidor no esencial que se desconecta con el disparo preferente (preferential trip).
export function addFeeder(p, id, { en, es, bus = 'MSB', kw = 0, pref = false, on = true }) {
  p.feeders ??= {};
  p.feeders[id] = { id, en, es, bus, kw, pref, on, trip: false };
  return p.feeders[id];
}
export const feederOn = (p, id) => Boolean(p.feeders?.[id]?.on && !p.feeders[id].trip);
export const feederLive = (p, id) => feederOn(p, id) && busLive(p, p.feeders[id].bus);
export const powered = (p, m) => busLive(p, m.bus) && (!m.feeder || feederOn(p, m.feeder));

// Actualiza todos los motores: tensión del cuadro, averías, arranque secuencial tras un apagón.
export function motorsStep(p, dt) {
  let msbKw = 0, msbKvar = 0, esbKw = 0, esbKvar = 0;
  let seqSlot = 0;
  for (const m of Object.values(p.c)) {
    if (!('cmd' in m)) continue;
    if (!powered(p, m)) {
      if (m.run) m.run = false;
      if (!m.restart && !m.standby) m.cmd = false;
      m.restartDelay = 0;
      continue;
    }
    const want = m.cmd && !m.fault && !m.trip;
    if (want && !m.run) {
      // Tras un apagón los motores con rearranque automático arrancan escalonados (2 s entre uno y otro).
      if (m.restart && m.restartDelay === 0 && p.sig.restartPending?.[m.bus]) m.restartDelay = 0.1 + 2 * seqSlot++;
      if (m.restartDelay > 0) {
        m.restartDelay -= dt;
        if (m.restartDelay > 0) continue;
      }
      m.restartDelay = 0;
      m.run = true;
    } else if (!want && m.run) {
      m.run = false;
    }
    if (m.fault && m.run) m.run = false;
    if (m.run) {
      m.hours += dt / 3600;
      const kw = m.kw * m.load;
      if (m.bus === 'ESB') { esbKw += kw; esbKvar += m.kvar * m.load; } else { msbKw += kw; msbKvar += m.kvar * m.load; }
    }
  }
  for (const f of Object.values(p.feeders ?? {})) {
    if (f.kw && f.on && !f.trip && busLive(p, f.bus)) {
      if (f.bus === 'ESB') { esbKw += f.kw; esbKvar += f.kw * 0.3; } else { msbKw += f.kw; msbKvar += f.kw * 0.3; }
    }
  }
  p.sig.motorKw = { MSB: msbKw, ESB: esbKw };
  p.sig.motorKvar = { MSB: msbKvar, ESB: esbKvar };
}

// Bombas de servicio/reserva: si ninguna está en marcha (o la presión es baja) arranca la que
// esté en reserva (standby) y da un aviso. en/es: nombre del grupo para el aviso.
export function standbyPair(p, ids, low, en, es) {
  const pumps = ids.map((id) => p.c[id]);
  const need = !pumps.some((m) => m.run) || low;
  const id = `stby-${ids[0]}`;
  if (need) {
    const s = pumps.find((m) => m.standby && !m.cmd && !m.fault && !m.trip && powered(p, m));
    if (s) {
      s.cmd = true;
      s.standby = false;
      log(p, `standby-start:${s.id}`, `${s.en} started by standby.`, `${s.es}: arranque por reserva.`);
      alarm(p, id, true, `${en}: standby pump started`, `${es}: arrancó la bomba de reserva`, 'warn');
    }
  } else {
    alarm(p, id, false);
  }
}

// ---------- Acciones genéricas ----------
// Devuelven un mensaje bilingüe { en, es } si la acción no se puede hacer (o null si se ha hecho).
export const M = (en, es) => ({ en, es });
export const genericActions = {
  start(p, id, where = 'remote') {
    const m = p.c[id];
    if (!m) return M('Unknown equipment.', 'Equipo desconocido.');
    if (m.local && where !== 'panel') return M(`${m.en} is in LOCAL control: start it at the switchboard starter.`, `${m.es} está en control LOCAL: arráncala desde su arrancador en el cuadro.`);
    if (m.trip) return M(`${m.en} is tripped. Reset it first.`, `${m.es}: está disparado. Rearma (reset) primero.`);
    if (m.fault) return M(`${m.en} is faulty and will not start.`, `${m.es}: averiado, no arranca.`);
    if (!powered(p, m)) return M(`${m.en}: no power (${m.bus}${m.feeder ? ' / breaker' : ''}).`, `${m.es}: sin tensión (${m.bus}${m.feeder ? ' o su interruptor' : ''}).`);
    if (m.interlock) { const msg = m.interlock(p); if (msg) return msg; }
    if (!m.cmd) log(p, `start:${id}`, `${m.en} started.`, `${m.es}: en marcha.`);
    m.cmd = true;
    return null;
  },
  stop(p, id, where = 'remote') {
    const m = p.c[id];
    if (m.local && where !== 'panel') return M(`${m.en} is in LOCAL control: stop it at the switchboard starter.`, `${m.es} está en control LOCAL: párala desde su arrancador en el cuadro.`);
    if (m.cmd) log(p, `stop:${id}`, `${m.en} stopped.`, `${m.es}: parada.`);
    m.cmd = false;
    m.standby = false;
    return null;
  },
  standby(p, id, on = !p.c[id].standby) {
    const m = p.c[id];
    m.standby = on;
    log(p, `standby:${id}:${on ? 'on' : 'off'}`, `${m.en} ${on ? 'in standby' : 'standby off'}.`, `${m.es}: ${on ? 'en reserva' : 'sin reserva'}.`);
    return null;
  },
  setLocal(p, id, local) {
    p.c[id].local = local;
    return null;
  },
  resetTrip(p, id) {
    const m = p.c[id];
    if (!m.trip) return null;
    m.trip = false;
    log(p, `reset:${id}`, `${m.en} trip reset.`, `${m.es}: disparo rearmado.`);
    return null;
  },
  open(p, id) {
    const v = p.c[id];
    if (v.fault) return M(`${v.en} is stuck.`, `${v.es}: atascada.`);
    if (v.interlock) { const msg = v.interlock(p, true); if (msg) return msg; }
    if (!v.open) log(p, `open:${id}`, `${v.en} opened.`, `${v.es}: abierta.`);
    v.open = true;
    v.pos = 1;
    return null;
  },
  close(p, id) {
    const v = p.c[id];
    if (v.fault) return M(`${v.en} is stuck.`, `${v.es}: atascada.`);
    if (v.interlock) { const msg = v.interlock(p, false); if (msg) return msg; }
    if (v.open) log(p, `close:${id}`, `${v.en} closed.`, `${v.es}: cerrada.`);
    v.open = false;
    v.pos = 0;
    return null;
  },
  toggle(p, id) {
    const c = p.c[id];
    if ('cmd' in c) return c.cmd ? genericActions.stop(p, id) : genericActions.start(p, id);
    return c.open ? genericActions.close(p, id) : genericActions.open(p, id);
  },
  setPos(p, id, pos) {
    const v = p.c[id];
    v.pos = clamp(pos, 0, 1);
    v.open = v.pos > 0.02;
    return null;
  },
  setAuto(p, id, auto) {
    p.c[id].auto = auto;
    return null;
  },
};
