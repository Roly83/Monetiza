// Prácticas evaluadas (Assessment): cada una prepara la planta, fija objetivos que se comprueban
// en vivo y puntúa al terminar (objetivos, tiempo y penalizaciones por errores).
import { log } from './core.js';
import { connected } from './model/electrical.js';
import groupA from './scenarios/a.js';
import groupB from './scenarios/b.js';
import groupC from './scenarios/c.js';
import groupD from './scenarios/d.js';
import groupE from './scenarios/e.js';

export const session = { scenario: null }; // práctica evaluada en curso

const egOnLoad = (p) => p.elec.eg.breaker && p.sig.esbLive;
const dgsOnline = (p) => connected(p).length;

export const SCENARIOS = [
  {
    id: 'blackout', setup: 'sea', minutes: 6,
    en: 'Blackout recovery', es: 'Recuperación tras un apagón',
    brief: { en: 'Both generators trip and the ship has a blackout. Restore power and essential services.', es: 'Disparan los dos generadores y el buque se queda sin tensión. Restablece la energía y los servicios esenciales.' },
    prepare(p) { p.elec.pms = 'manual'; for (const g of p.elec.dg) if (g.breaker) { g.breaker = false; g.kw = 0; } },
    goals: [
      { en: 'Emergency generator supplies the ESB', es: 'El generador de emergencia alimenta el ESB', check: egOnLoad },
      { en: 'One diesel generator on line', es: 'Un generador diésel acoplado', check: (p) => dgsOnline(p) >= 1 },
      { en: 'Two diesel generators in parallel', es: 'Dos generadores diésel en paralelo', check: (p) => dgsOnline(p) >= 2 },
      { en: 'ESB back on the main switchboard', es: 'ESB alimentado de nuevo desde el cuadro principal', check: (p) => p.elec.eg.tie && dgsOnline(p) >= 1 },
    ],
  },
  {
    id: 'sync', setup: 'port', minutes: 5,
    en: 'Manual synchronization', es: 'Sincronización manual',
    brief: { en: 'With the PMS in MANUAL, start generator No 2 and put it in parallel with No 1. Share the load equally.', es: 'Con el PMS en MANUAL, arranca el generador nº 2 y ponlo en paralelo con el nº 1. Reparte la carga por igual.' },
    prepare(p) { p.elec.pms = 'manual'; },
    goals: [
      { en: 'Generator No 2 running', es: 'Generador nº 2 en marcha', check: (p) => p.elec.dg[1].state === 'running' },
      { en: 'Generator No 2 breaker closed in synchronism', es: 'Interruptor del nº 2 cerrado en sincronismo', check: (p) => p.elec.dg[1].breaker },
      { en: 'Load shared (difference below 10 %)', es: 'Carga repartida (diferencia menor del 10 %)', check: (p) => p.elec.dg[0].breaker && p.elec.dg[1].breaker && Math.abs(p.elec.dg[0].kw - p.elec.dg[1].kw) < 0.1 * Math.max(60, p.elec.msbKw / 2) },
      { en: 'Frequency 60 Hz ± 0.3', es: 'Frecuencia 60 Hz ± 0,3', check: (p) => p.elec.dg[1].breaker && Math.abs(p.elec.busF - 60) < 0.3 },
    ],
  },
  {
    id: 'deadship', setup: 'dead', minutes: 20,
    en: 'Dead ship start-up', es: 'Arranque desde buque muerto',
    brief: { en: 'The ship is dead: no generators, low starting air. Use the emergency generator and the emergency air compressor to start a diesel generator.', es: 'El buque está muerto: sin generadores y con poco aire de arranque. Usa el generador de emergencia y el compresor de emergencia para arrancar un generador diésel.' },
    prepare() {},
    goals: [
      { en: 'Emergency switchboard energized', es: 'Cuadro de emergencia con tensión', check: (p) => p.sig.esbLive },
      { en: 'Emergency air compressor running', es: 'Compresor de aire de emergencia en marcha', check: (p) => p.c.eac.run },
      { en: 'Emergency air receiver above 20 bar', es: 'Botella de emergencia por encima de 20 bar', check: (p) => p.c.emr.press > 20 },
      { en: 'A diesel generator on line', es: 'Un generador diésel acoplado', check: (p) => dgsOnline(p) >= 1 },
      { en: 'A main air compressor running', es: 'Un compresor principal en marcha', check: (p) => p.c.mac1.run || p.c.mac2.run },
    ],
  },
  {
    id: 'eg-manual', setup: 'sea', minutes: 6,
    en: 'Emergency generator: manual test on load', es: 'Generador de emergencia: prueba manual en carga',
    brief: { en: 'Weekly test: in MANUAL, start the emergency generator from its local panel, check the three phases and stop it again without losing the ESB.', es: 'Prueba semanal: en MANUAL, arranca el generador de emergencia desde su panel local, comprueba las tres fases y vuelve a pararlo sin dejar el ESB sin tensión.' },
    prepare() {},
    goals: [
      { en: 'ESB control in MANUAL', es: 'Control del ESB en MANUAL', check: (p) => p.elec.eg.mode === 'manual' },
      { en: 'Emergency generator running', es: 'Generador de emergencia en marcha', check: (p) => p.elec.eg.state === 'running' },
      { en: 'Phases L2 and L3 checked on both meters', es: 'Fases L2 y L3 comprobadas en los dos instrumentos', check: (p) => ['eg-meterA-L2', 'eg-meterA-L3', 'eg-meterV-L2', 'eg-meterV-L3'].every((k) => p.history.has(k)) },
      { en: 'Generator stopped and control back to AUTO', es: 'Generador parado y control de nuevo en AUTO', check: (p) => p.elec.eg.state === 'stopped' && p.elec.eg.mode === 'auto' && p.history.has('eg-running') },
    ],
    fail: (p) => (!p.sig.esbLive ? { en: 'The ESB lost power.', es: 'El ESB se ha quedado sin tensión.' } : null),
  },
  {
    id: 'eg-backfeed', setup: 'sea', minutes: 8,
    en: 'Emergency generator feeding the MSB', es: 'Alimentar el cuadro principal desde el generador de emergencia',
    brief: { en: 'After a blackout no diesel generator can start. Feed essential consumers of the MSB from the emergency generator without overloading it.', es: 'Tras un apagón ningún generador diésel puede arrancar. Alimenta consumidores esenciales del MSB desde el generador de emergencia sin sobrecargarlo.' },
    prepare(p) {
      p.elec.pms = 'manual';
      for (const g of p.elec.dg) { g.breaker = false; g.kw = 0; g.state = 'stopped'; }
      p.faults['dg3-start'] = true;
      for (const g of p.elec.dg) g.trip = 'start';
    },
    goals: [
      { en: 'Emergency generator on load', es: 'Generador de emergencia en carga', check: egOnLoad },
      { en: 'ESB control in MANUAL and tie in EMERGENCY SUPPLY', es: 'Control del ESB en MANUAL y acoplamiento en ALIMENTACIÓN DE EMERGENCIA', check: (p) => p.elec.eg.mode === 'manual' && p.elec.eg.tieMode === 'emergency' },
      { en: 'MSB energized from the emergency generator for 30 s', es: 'MSB con tensión desde el generador de emergencia durante 30 s', check: (p) => p.sig.msbLive && p.elec.eg.tie && p.elec.eg.breaker, hold: 30 },
    ],
  },
  ...groupA, ...groupB, ...groupC, ...groupD, ...groupE,
];

// Comprueba la práctica en curso (lo llama el bucle de la interfaz cada medio segundo).
export function checkScenario(ctx, session) {
  const s = session.scenario;
  if (!s || s.done) return;
  const p = ctx.p();
  const sc = s.def;
  sc.goals.forEach((g, i) => {
    if (s.goals[i]) return;
    if (g.check(p)) {
      s.hold[i] = (s.hold[i] ?? 0) + (p.t - (s.lastT ?? p.t));
      if (s.hold[i] >= (g.hold ?? 0)) {
        s.goals[i] = p.t - s.startT;
        log(p, `goal:${sc.id}:${i}`, `Objective completed: ${g.en}.`, `Objetivo cumplido: ${g.es}.`);
        ctx.say(`Objective completed. ${g.en}.`);
      }
    } else s.hold[i] = 0;
  });
  s.lastT = p.t;
  const failed = sc.fail?.(p);
  const timeUp = p.t - s.startT > sc.minutes * 60 * 1.5;
  if (s.goals.every(Boolean) || failed || timeUp) finish(ctx, session, failed ?? (timeUp && !s.goals.every(Boolean) ? { en: 'Time is up.', es: 'Se acabó el tiempo.' } : null));
}

export function score(p, s) {
  const done = s.goals.filter(Boolean).length;
  const total = s.def.goals.length;
  let pts = Math.round((70 * done) / total);
  const elapsed = (s.endT ?? p.t) - s.startT;
  if (done === total) pts += Math.max(0, Math.round(30 * (1 - Math.max(0, elapsed - s.def.minutes * 30) / (s.def.minutes * 60))));
  const pen = p.stats.badSync * 10 + p.stats.blackouts * 10 + p.stats.trips * 5 + p.stats.marpol * 25;
  return { pts: Math.max(0, Math.min(100, pts - pen)), done, total, elapsed, pen };
}

function finish(ctx, session, failed) {
  const s = session.scenario;
  const p = ctx.p();
  s.done = true;
  s.endT = p.t;
  s.failed = failed;
  s.result = score(p, s);
  ctx.say(failed ? `Exercise ended. ${failed.en}` : `Exercise completed. Score ${s.result.pts} points.`);
  s.onFinish?.(s);
}

export function startScenario(ctx, session, id) {
  const def = SCENARIOS.find((x) => x.id === id);
  ctx.newSim(def.setup);
  const p = ctx.p();
  def.prepare(p);
  for (const k of Object.keys(p.stats)) p.stats[k] = 0;
  session.scenario = { def, startT: p.t, goals: def.goals.map(() => null), hold: [], done: false };
  log(p, `scenario:${id}`, `Exercise started: ${def.en}.`, `Práctica iniciada: ${def.es}.`);
}
