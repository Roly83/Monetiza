// Montaje de la planta: módulos de cada sistema, orden de cálculo, acciones y situaciones iniciales.
import { createPlant, motorsStep, genericActions, ackAlarms, M } from './core.js';
import * as electrical from './model/electrical.js';
import * as air from './model/air.js';
import * as cooling from './model/cooling.js';
import * as fuel from './model/fuel.js';
import * as lube from './model/lube.js';
import * as steam from './model/steam.js';
import * as engine from './model/engine.js';
import * as steering from './model/steering.js';
import * as water from './model/water.js';
import * as hull from './model/hull.js';
import * as sewage from './model/sewage.js';
import * as incinerator from './model/incinerator.js';
import * as safety from './model/safety.js';
import * as hvac from './model/hvac.js';

// Orden de cálculo de los sistemas (la planta eléctrica va aparte: antes y después de los consumos).
export const MODULES = [air, cooling, fuel, lube, steam, engine, steering, water, hull, sewage, incinerator, safety, hvac];
const ALL = [electrical, ...MODULES];

export const SETUPS = {
  sea: { en: 'At sea (sea going)', es: 'Navegando' },
  port: { en: 'In port', es: 'En puerto' },
  dead: { en: 'Dead ship', es: 'Buque muerto (dead ship)' },
};

export function createSim(setup = 'sea') {
  const p = createPlant();
  for (const m of ALL) m.init?.(p);
  for (const m of ALL) m.setup?.[setup]?.(p);
  p.setup = setup;
  // Deja que la planta se estabilice antes de empezar.
  for (let i = 0; i < 200; i++) step(p, 0.1);
  p.t = 0;
  p.events.length = 0;
  p.history.clear();
  ackAlarms(p);
  for (const k of Object.keys(p.stats)) p.stats[k] = 0;
  return p;
}

export function step(p, dt) {
  p.t += dt;
  electrical.pre(p, dt);
  motorsStep(p, dt);
  for (const m of MODULES) m.step?.(p, dt);
  electrical.post(p, dt);
}

export function run(p, seconds, dt = 0.1) {
  for (let i = 0; i < Math.round(seconds / dt); i++) step(p, dt);
}

export const ACTIONS = Object.assign({}, genericActions, ...ALL.map((m) => m.actions ?? {}));
export const FAULTS = ALL.flatMap((m) => m.FAULTS ?? []);

// Ejecuta una acción del operador. Devuelve null o un mensaje { en, es } si no se puede.
export function act(p, name, ...args) {
  const fn = ACTIONS[name];
  if (!fn) return M(`Unknown action ${name}`, `Acción desconocida ${name}`);
  return fn(p, ...args) ?? null;
}

export function setFault(p, id, on) {
  if (on) p.faults[id] = true;
  else delete p.faults[id];
}

// ---------- Guardar y recuperar la partida ----------
export function serialize(p) {
  return JSON.stringify(p, (k, v) => (v instanceof Set ? [...v] : typeof v === 'function' ? undefined : v));
}
function deepAssign(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepAssign(target[k], v);
    else if (Array.isArray(v) && Array.isArray(target[k]) && v.length === target[k].length && v.every((x) => x && typeof x === 'object')) v.forEach((x, i) => deepAssign(target[k][i], x));
    else target[k] = v;
  }
}
export function restore(json) {
  const saved = typeof json === 'string' ? JSON.parse(json) : json;
  const p = createPlant();
  for (const m of ALL) m.init?.(p);
  const history = saved.history ?? [];
  delete saved.history;
  deepAssign(p, saved);
  p.history = new Set(history);
  return p;
}
