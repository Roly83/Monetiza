// Lógica del cuadro del generador de emergencia (sin interfaz, testeable).
// Modelo simplificado pero coherente: cuadro principal (MSB), cuadro de emergencia (ESB),
// interruptor de acoplamiento (tie breaker), generador de emergencia (EG) y sus protecciones.

export const RATED_V = 440; // tensión nominal (V)
export const TRIP_A = 260; // corriente de disparo por sobrecorriente (A)
export const TRIP_DELAY = 3; // segundos por encima del límite antes de disparar
const CRANK_TIME = 2.5; // arranque del motor (s)
const RAMP_TIME = 3; // subida de tensión (s)
const AUTO_CLOSE_DELAY = 1; // espera para cerrar el interruptor en automático (s)
const COOLDOWN = 10; // enfriamiento antes de parar en automático (s)

// Consumidores del cuadro de emergencia (kW y kVAr con todo en marcha).
export const LOADS = {
  compressor: { en: 'Emergency air compressor', es: 'Compresor de aire de emergencia', kw: 45, kvar: 30 },
  auxiliaries: { en: 'Engine room auxiliaries', es: 'Auxiliares de la sala de máquinas', kw: 60, kvar: 35 },
  ltfw: { en: 'LT FW pump No 2', es: 'Bomba de agua dulce de baja temperatura nº 2', kw: 30, kvar: 20 },
};
// Consumidores esenciales del MSB cuando el generador de emergencia lo alimenta.
export const MSB_BACKFEED = { kw: 110, kvar: 70 };

export function createState() {
  return {
    t: 0,
    msbLive: true, // el cuadro principal tiene tensión (generadores principales)
    mode: 'auto', // selector "Control of EG breaker and tie breaker": auto (1) / manual (2)
    tieMode: 'normal', // selector "Control of tie breaker to MSB": normal (1) / emergency (2)
    meterA: 1, // selector del amperímetro: fase L1, L2, L3
    meterV: 1, // selector del voltímetro: fase L1, L2, L3
    engine: 'stopped', // stopped | cranking | running | cooldown
    engineTimer: 0,
    genVoltage: 0,
    genBreaker: false,
    tieBreaker: true,
    trip: false,
    overTimer: 0,
    autoCloseTimer: 0,
    insulationFault: false,
    loads: { compressor: true, auxiliaries: true, ltfw: false },
    events: [], // { id, t, code, en, es }
    seq: 0,
    history: new Set(), // marcas para los ejercicios
  };
}

function log(s, code, en, es) {
  s.events.push({ id: ++s.seq, t: s.t, code, en, es });
  s.history.add(code);
  if (s.events.length > 200) s.events.shift();
}

// ---------- Valores derivados ----------
export function esbSource(s) {
  if (s.tieBreaker && s.msbLive) return 'msb';
  if (s.genBreaker && s.genVoltage >= 400) return 'eg';
  return null;
}

export const esbLive = (s) => esbSource(s) !== null;

// Potencia que entrega el generador de emergencia (solo con su interruptor cerrado).
export function genPower(s) {
  if (esbSource(s) !== 'eg') return { kw: 0, kvar: 0 };
  let kw = 0;
  let kvar = 0;
  for (const [k, on] of Object.entries(s.loads)) {
    if (on) { kw += LOADS[k].kw; kvar += LOADS[k].kvar; }
  }
  if (s.tieBreaker && !s.msbLive) { kw += MSB_BACKFEED.kw; kvar += MSB_BACKFEED.kvar; }
  return { kw, kvar };
}

// Corriente de línea (A) a partir de la potencia aparente: I = S / (√3 · V).
export function genCurrent(s) {
  const { kw, kvar } = genPower(s);
  if (!kw && !kvar) return 0;
  return (Math.hypot(kw, kvar) * 1000) / (Math.sqrt(3) * Math.max(s.genVoltage, 1));
}

// Pequeñas diferencias entre fases, como en un sistema real.
const PHASE = { 1: 1, 2: 0.985, 3: 1.012 };

export function readings(s) {
  const amps = genCurrent(s) * PHASE[s.meterA];
  const volts = s.genVoltage * (s.genVoltage ? PHASE[s.meterV] : 0);
  const { kw, kvar } = genPower(s);
  // Aislamiento del cuadro de emergencia: muy alto si está bien, bajo con fallo a masa.
  const insulation = !esbLive(s) ? 2500 : s.insulationFault ? 80 : 2500;
  return { amps, volts, kw, kvar, insulation };
}

export function lamps(s) {
  return {
    supplyEsb: esbLive(s),
    supplyFromMsb: s.tieBreaker && s.msbLive,
    overcurrent: s.trip,
    breakerOff: !s.genBreaker,
    breakerOn: s.genBreaker,
  };
}

// ---------- Acciones del operador ----------
// Cada acción devuelve un mensaje (o null) para explicar por qué no se hizo algo.
export const actions = {
  setMode(s, mode) {
    if (s.mode === mode) return null;
    s.mode = mode;
    log(s, `mode-${mode}`, `Control switched to ${mode.toUpperCase()}.`, `Control en ${mode === 'auto' ? 'AUTOMÁTICO' : 'MANUAL'}.`);
    return null;
  },
  setTieMode(s, tieMode) {
    if (s.tieMode === tieMode) return null;
    s.tieMode = tieMode;
    log(s, `tie-${tieMode}`,
      tieMode === 'normal' ? 'Tie breaker control: normal operation.' : 'Tie breaker control: emergency supply of MSB.',
      tieMode === 'normal' ? 'Acoplamiento: operación normal.' : 'Acoplamiento: alimentación de emergencia del MSB.');
    if (tieMode === 'emergency' && s.mode === 'auto') {
      return 'La alimentación del MSB desde el generador de emergencia solo funciona en MANUAL.';
    }
    return null;
  },
  setMeter(s, which, phase) {
    s[which] = phase;
    s.history.add(`${which}-L${phase}`);
    return null;
  },
  breakerOn(s) {
    if (s.mode === 'auto') return 'El selector está en AUTO: el interruptor lo maneja el automatismo. Pasa a MANUAL (2).';
    if (s.genBreaker) return null;
    if (s.trip) return 'Hay un disparo por sobrecorriente activo. Pulsa RESET primero.';
    if (s.genVoltage < 420) return 'El generador no tiene tensión: arranca el motor y espera a los 440 V.';
    if (s.tieBreaker && s.msbLive) return 'Bloqueo: el ESB ya está alimentado desde el MSB. No se puede acoplar sin sincronizar.';
    s.genBreaker = true;
    log(s, 'breaker-closed', 'Emergency generator breaker closed.', 'Interruptor del generador de emergencia cerrado.');
    return null;
  },
  breakerOff(s) {
    if (s.mode === 'auto') return 'El selector está en AUTO: el interruptor lo maneja el automatismo. Pasa a MANUAL (2).';
    if (!s.genBreaker) return null;
    s.genBreaker = false;
    log(s, 'breaker-opened', 'Emergency generator breaker opened.', 'Interruptor del generador de emergencia abierto.');
    return null;
  },
  reset(s) {
    if (!s.trip) return 'No hay ningún disparo que rearmar.';
    s.trip = false;
    s.overTimer = 0;
    log(s, 'reset', 'Overcurrent trip reset.', 'Disparo por sobrecorriente rearmado.');
    return null;
  },
  startEngine(s) {
    if (s.mode === 'auto') return 'En AUTO el motor arranca solo si hay apagón. Pasa a MANUAL para arrancarlo a mano.';
    if (s.engine === 'running' || s.engine === 'cranking') return null;
    s.engine = 'cranking';
    s.engineTimer = 0;
    log(s, 'engine-start', 'Emergency generator starting.', 'Arrancando el generador de emergencia.');
    return null;
  },
  stopEngine(s) {
    if (s.mode === 'auto') return 'En AUTO el motor lo controla el automatismo. Pasa a MANUAL para pararlo.';
    if (s.engine === 'stopped') return null;
    if (s.genBreaker) return 'Abre primero el interruptor del generador (Generator breaker OFF).';
    s.engine = 'stopped';
    log(s, 'engine-stop', 'Emergency generator stopped.', 'Generador de emergencia parado.');
    return null;
  },
  toggleLoad(s, key) {
    s.loads[key] = !s.loads[key];
    log(s, `load-${key}-${s.loads[key] ? 'on' : 'off'}`, `${LOADS[key].en} ${s.loads[key] ? 'started' : 'stopped'}.`,
      `${LOADS[key].es}: ${s.loads[key] ? 'en marcha' : 'parado'}.`);
    return null;
  },
  // Escenarios del instructor
  blackout(s) {
    if (!s.msbLive) return null;
    s.msbLive = false;
    log(s, 'blackout', 'Blackout! Main switchboard has lost power.', '¡Apagón! El cuadro principal se ha quedado sin tensión.');
    return null;
  },
  restoreMsb(s) {
    if (s.msbLive) return null;
    s.msbLive = true;
    log(s, 'msb-restored', 'Main switchboard power restored.', 'Tensión restablecida en el cuadro principal.');
    return null;
  },
  insulationFault(s, on) {
    s.insulationFault = on;
    log(s, on ? 'insulation-fault' : 'insulation-ok', on ? 'Earth fault on the emergency switchboard.' : 'Earth fault cleared.',
      on ? 'Derivación a masa en el cuadro de emergencia.' : 'Derivación a masa reparada.');
    return null;
  },
};

// ---------- Simulación en el tiempo ----------
export function step(s, dt) {
  s.t += dt;

  // Motor del generador de emergencia
  if (s.engine === 'cranking') {
    s.engineTimer += dt;
    if (s.engineTimer >= CRANK_TIME) {
      s.engine = 'running';
      s.engineTimer = 0;
      log(s, 'engine-running', 'Emergency generator running.', 'Generador de emergencia en marcha.');
    }
  }
  if (s.engine === 'running' || s.engine === 'cooldown') {
    s.genVoltage = Math.min(RATED_V, s.genVoltage + (RATED_V / RAMP_TIME) * dt);
  } else {
    s.genVoltage = Math.max(0, s.genVoltage - (RATED_V / 2) * dt);
  }

  // Interruptor de acoplamiento (tie breaker)
  const wantTie = s.tieMode === 'emergency' && s.mode === 'manual'
    ? s.genBreaker && !s.msbLive // el EG alimenta el MSB
    : s.msbLive && !s.genBreaker; // normal: el MSB alimenta el ESB
  if (s.tieMode === 'emergency' && s.mode === 'manual' && s.msbLive && s.tieBreaker && s.genBreaker) {
    // Vuelve la tensión al MSB mientras el EG lo alimenta: se abre para no acoplar sin sincronizar.
    s.tieBreaker = false;
    log(s, 'tie-opened', 'Tie breaker opened: MSB power is back.', 'Acoplamiento abierto: el MSB vuelve a tener tensión.');
  } else if (wantTie !== s.tieBreaker) {
    s.tieBreaker = wantTie;
    log(s, wantTie ? 'tie-closed' : 'tie-opened', wantTie ? 'Tie breaker closed.' : 'Tie breaker opened.',
      wantTie ? 'Interruptor de acoplamiento cerrado.' : 'Interruptor de acoplamiento abierto.');
  }

  // Automatismo (selector en AUTO)
  if (s.mode === 'auto') {
    if (!s.msbLive) {
      if (s.engine === 'stopped' || s.engine === 'cooldown') {
        if (s.engine === 'stopped') {
          s.engine = 'cranking';
          s.engineTimer = 0;
          log(s, 'engine-start', 'Emergency generator starting automatically.', 'El generador de emergencia arranca automáticamente.');
        } else {
          s.engine = 'running';
        }
      }
      if (!s.genBreaker && !s.trip && s.genVoltage >= 420) {
        s.autoCloseTimer += dt;
        if (s.autoCloseTimer >= AUTO_CLOSE_DELAY) {
          s.genBreaker = true;
          s.autoCloseTimer = 0;
          log(s, 'breaker-closed', 'Emergency generator breaker closed automatically.', 'Interruptor del generador cerrado automáticamente.');
        }
      }
    } else {
      s.autoCloseTimer = 0;
      if (s.genBreaker) {
        s.genBreaker = false;
        log(s, 'breaker-opened', 'Emergency generator breaker opened: MSB power restored.', 'Interruptor del generador abierto: vuelve la tensión del MSB.');
      }
      if (s.engine === 'running') {
        s.engine = 'cooldown';
        s.engineTimer = 0;
        log(s, 'engine-cooldown', 'Emergency generator cooling down.', 'Generador de emergencia en enfriamiento.');
      } else if (s.engine === 'cooldown') {
        s.engineTimer += dt;
        if (s.engineTimer >= COOLDOWN) {
          s.engine = 'stopped';
          log(s, 'engine-stop', 'Emergency generator stopped.', 'Generador de emergencia parado.');
        }
      }
    }
  }

  // Protección por sobrecorriente
  if (s.genBreaker && genCurrent(s) > TRIP_A) {
    s.overTimer += dt;
    if (s.overTimer >= TRIP_DELAY) {
      s.trip = true;
      s.genBreaker = false;
      s.overTimer = 0;
      log(s, 'trip', 'Overcurrent trip! Generator breaker opened.', '¡Disparo por sobrecorriente! Interruptor del generador abierto.');
    }
  } else {
    s.overTimer = 0;
  }

  // Aviso de aislamiento bajo
  if (s.insulationFault && esbLive(s) && !s.history.has('low-insulation-seen')) {
    s.history.add('low-insulation-seen');
    log(s, 'low-insulation', 'Low insulation alarm on the emergency switchboard.', 'Alarma de aislamiento bajo en el cuadro de emergencia.');
  }
}

// Avanza la simulación varios segundos de golpe (para tests).
export function run(s, seconds, dt = 0.1) {
  for (let i = 0; i < seconds / dt; i++) step(s, dt);
}
