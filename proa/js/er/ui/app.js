// Aplicación del simulador de sala de máquinas: selección de sistemas, barra de estado, alarmas,
// fichas flotantes, bucle de simulación, voz y guardado automático.
import { h, toast } from '../../core/ui.js';
import { store } from '../../core/store.js';
import { speak, LANGS } from '../../audio/speech.js';
import { createSim, step, act as doAct, serialize, restore } from '../plant.js';
import { ackAlarms, unackedAlarms } from '../core.js';
import { buildFace } from './faceplate.js';
import { bi } from './widgets.js';
import { VIEWS } from '../views/index.js';
import { checkScenario, session } from '../scenarios.js';

const SAVE_KEY = 'proa:er';
const settings = () => ({ speed: 1, sound: true, voice: true, ...(store.get().er ?? {}) });
const saveSettings = (patch) => store.update((st) => { st.er = { ...settings(), ...patch }; });

let sim = load();
let paused = false;
let view = null;
let face = null; // { id, obj }
const ui = {};

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return restore(raw);
  } catch { /* partida dañada: se empieza de nuevo */ }
  return createSim('sea');
}
function save() {
  try { localStorage.setItem(SAVE_KEY, serialize(sim)); } catch { /* sin almacenamiento */ }
}

// ---------- Contexto que reciben las vistas ----------
export const ctx = {
  p: () => sim,
  act(name, ...args) {
    const msg = doAct(sim, name, ...args);
    if (msg) showMsg(msg);
    refresh();
    return msg;
  },
  face: (id) => openFace(id),
  nav: (id) => { location.hash = id; },
  say: (text) => { speak(text, LANGS.en).catch(() => {}); },
  toast: showMsg,
  newSim(setup) {
    sim = createSim(setup);
    session.scenario = null;
    closeFace();
    save();
    renderView();
  },
  replaceSim(p) { sim = p; closeFace(); renderView(); },
  pause(on) { paused = on; refresh(); },
};

function showMsg(msg) {
  if (typeof msg === 'string') return toast(msg, 'error');
  const t = h('div', { class: 'toast error', role: 'status' }, h('strong', { lang: 'en' }, msg.en), h('br'), msg.es);
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}

// ---------- Fichas flotantes ----------
function openFace(id) {
  closeFace();
  const obj = buildFace(ctx, id);
  if (!obj) return;
  ui.face.replaceChildren(
    h('header', { class: 'fp-head' },
      h('div', {}, h('strong', { lang: 'en' }, obj.en), h('br'), h('small', { class: 'muted' }, obj.es)),
      h('div', { class: 'row tight' },
        h('button', { type: 'button', class: 'icon-btn', title: 'Listen · Escuchar', onclick: () => ctx.say(obj.en) }, '🔊'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Close · Cerrar', onclick: closeFace }, '✕'))),
    obj.body,
  );
  ui.face.classList.remove('hidden');
  face = { id, obj };
  obj.update(sim);
}
function closeFace() {
  face = null;
  ui.face?.classList.add('hidden');
}

// ---------- Vistas ----------
function renderView() {
  const id = location.hash.slice(1) || 'control';
  const v = VIEWS.find((x) => x.id === id) ?? VIEWS[0];
  for (const a of ui.nav.querySelectorAll('a')) a.setAttribute('aria-current', a.dataset.id === v.id ? 'page' : 'false');
  ui.select.value = v.id;
  const r = v.render(ctx);
  view = { def: v, ...r };
  ui.main.replaceChildren(
    h('div', { class: 'view-head' }, h('h1', {}, bi(v.en, v.es)), v.help ? h('p', { class: 'muted small' }, v.help) : null),
    r.el,
  );
  view.update?.(sim);
  window.scrollTo(0, 0);
}

// ---------- Barra de estado y alarmas ----------
function statusBar() {
  const time = h('strong', { class: 'er-time' });
  const speedBtns = [1, 2, 5, 10].map((s) => h('button', { type: 'button', class: 'chip', onclick: () => { saveSettings({ speed: s }); paused = false; refresh(); } }, `×${s}`));
  const pauseBtn = h('button', { type: 'button', class: 'chip', onclick: () => { paused = !paused; refresh(); } });
  const msb = h('span', { class: 'chip info' });
  const alarmBtn = h('button', { type: 'button', class: 'chip alarm', onclick: () => ui.alarms.classList.toggle('hidden') });
  const ack = h('button', { type: 'button', class: 'chip', onclick: () => { ackAlarms(sim); refresh(); } }, bi('ACK', 'Reconocer'));
  const mute = h('button', { type: 'button', class: 'chip', onclick: () => saveSettings({ sound: !settings().sound }) });
  ui.status = { time, speedBtns, pauseBtn, msb, alarmBtn, mute };
  return h('div', { class: 'er-status' }, pauseBtn, ...speedBtns, time, msb, h('span', { class: 'grow' }), alarmBtn, ack, mute);
}

const hhmmss = (s) => [s / 3600, (s / 60) % 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':');

function refresh() {
  const s = ui.status;
  if (!s) return;
  const st = settings();
  s.time.textContent = hhmmss(sim.t);
  s.pauseBtn.textContent = paused ? '▶' : '⏸';
  s.pauseBtn.title = paused ? 'Run · Continuar' : 'Pause · Pausa';
  s.speedBtns.forEach((b, i) => b.classList.toggle('on', [1, 2, 5, 10][i] === st.speed && !paused));
  s.msb.textContent = sim.sig.msbLive ? `MSB ${sim.elec.busF.toFixed(1)} Hz · ${sim.elec.msbKw.toFixed(0)} kW` : 'MSB BLACKOUT';
  s.msb.classList.toggle('bad', !sim.sig.msbLive);
  const all = Object.values(sim.alarms);
  const un = unackedAlarms(sim).length;
  s.alarmBtn.textContent = `🔔 ${all.filter((a) => a.active).length}${un ? ` (${un} new)` : ''}`;
  s.alarmBtn.classList.toggle('flash', un > 0);
  s.mute.textContent = st.sound ? '🔊' : '🔇';
  renderAlarms();
}

let alarmSig = '';
function renderAlarms() {
  const list = Object.values(sim.alarms).sort((a, b) => b.t - a.t);
  const sig = list.map((a) => `${a.id}${a.active}${a.acked}`).join('|');
  if (sig === alarmSig) return;
  alarmSig = sig;
  ui.alarmList.replaceChildren(...(list.length ? list.map((a) => h('li', { class: `al ${a.sev} ${a.active ? 'active' : 'cleared'} ${a.acked ? 'acked' : 'new'}` },
    h('span', { class: 'muted small' }, hhmmss(a.t)),
    h('button', { type: 'button', class: 'link-btn', onclick: () => ctx.say(a.en) }, '🔊'),
    h('span', {}, h('strong', { lang: 'en' }, a.en), h('br'), h('small', {}, a.es)),
  )) : [h('li', { class: 'muted' }, bi('No alarms', 'Sin alarmas'))]));
}

// Bocina de alarma (pitidos) mientras haya alarmas sin reconocer.
let audio = null;
let hornT = 0;
function horn(now) {
  if (!settings().sound || !unackedAlarms(sim).length || paused) return;
  if (now - hornT < 1200) return;
  hornT = now;
  try {
    audio ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.4);
  } catch { /* sin audio */ }
}

// Avisos de voz en inglés para las alarmas nuevas.
let lastEvent = 0;
function announce() {
  const fresh = sim.events.filter((e) => e.id > lastEvent);
  if (fresh.length) lastEvent = fresh.at(-1).id;
  if (!settings().voice) return;
  const al = fresh.filter((e) => e.code.startsWith('alarm:') || e.code === 'blackout');
  if (al.length) ctx.say(al.at(-1).en);
}

// ---------- Bucle ----------
let prev = performance.now();
let uiT = 0;
let saveT = 0;
let scT = 0;
function loop(now) {
  const real = Math.min(0.25, (now - prev) / 1000);
  prev = now;
  if (!paused) {
    let simDt = real * settings().speed;
    while (simDt > 1e-6) { const d = Math.min(0.1, simDt); step(sim, d); simDt -= d; }
  }
  uiT += real;
  if (uiT > 0.1) {
    uiT = 0;
    view?.update?.(sim);
    face?.obj.update(sim);
    refresh();
    announce();
  }
  scT += real;
  if (scT > 0.5) { scT = 0; checkScenario(ctx, session); }
  saveT += real;
  if (saveT > 15) { saveT = 0; save(); }
  horn(now);
  requestAnimationFrame(loop);
}

// ---------- Arranque ----------
export function start() {
  const app = document.getElementById('er');
  ui.nav = h('nav', { class: 'er-nav', 'aria-label': 'System selection' },
    h('h2', {}, bi('System selection', 'Selección de sistema')),
    ...VIEWS.map((v) => h('a', { href: `#${v.id}`, 'data-id': v.id, class: `${v.indent ? 'sub' : ''} ${v.page ? 'page' : ''}` }, bi(v.en, v.es))));
  ui.select = h('select', { class: 'er-select', 'aria-label': 'System selection', onchange: (e) => { location.hash = e.target.value; } },
    VIEWS.map((v) => h('option', { value: v.id }, `${v.indent ? '  · ' : ''}${v.en} · ${v.es}`)));
  ui.main = h('main', { class: 'er-main', tabindex: '-1' });
  ui.face = h('aside', { class: 'faceplate hidden', 'aria-live': 'polite' });
  ui.alarmList = h('ol', { class: 'alarm-list' });
  ui.alarms = h('section', { class: 'alarm-panel hidden' },
    h('div', { class: 'row' }, h('strong', {}, bi('Alarm list', 'Lista de alarmas')), h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn', onclick: () => { ackAlarms(sim); refresh(); } }, bi('Acknowledge all', 'Reconocer todas')),
      h('button', { type: 'button', class: 'icon-btn', onclick: () => ui.alarms.classList.add('hidden') }, '✕')),
    ui.alarmList);
  app.append(statusBar(), ui.alarms, h('div', { class: 'er-layout' }, ui.nav, h('div', { class: 'er-content' }, ui.select, ui.main)), ui.face);
  window.addEventListener('hashchange', () => { closeFace(); renderView(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  lastEvent = sim.seq;
  renderView();
  refresh();
  requestAnimationFrame(loop);
}
