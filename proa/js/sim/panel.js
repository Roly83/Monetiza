// Interfaz del simulador del cuadro del generador de emergencia (página aparte: simulador.html).
import { h, toast } from '../core/ui.js';
import { store } from '../core/store.js';
import { speak, LANGS } from '../audio/speech.js';
import { createState, actions, step, readings, lamps, esbSource, LOADS, TRIP_A } from './generator.js';
import { GUIDE, GUIDE_ORDER } from './guide.js';
import { EXERCISES } from './exercises.js';

let s = createState();
let infoMode = false;
let exercise = null; // { ex, held, done }
const refs = {};

// ---------- Tema (igual que en la app) ----------
const THEMES = { dark: '🌙', light: '☀️', auto: '🌗' };
function applyTheme() {
  const t = store.get().settings.theme || 'dark';
  document.documentElement.dataset.theme = t;
  document.getElementById('theme-btn').textContent = THEMES[t];
}
document.getElementById('theme-btn').addEventListener('click', () => {
  const order = ['dark', 'light', 'auto'];
  store.update((st) => { st.settings.theme = order[(order.indexOf(st.settings.theme) + 1) % order.length]; });
});
window.addEventListener('proa:store', applyTheme);
applyTheme();

const say = (text) => speak(text, LANGS.en).catch(() => {});
const progress = () => store.get().sim ?? { done: {} };

// ---------- Acciones con modo información ----------
// En modo información, tocar un elemento muestra su explicación en lugar de accionarlo.
function control(key, fn) {
  return (e) => {
    e?.preventDefault?.();
    if (infoMode) return showInfo(key);
    const msg = fn();
    if (msg) toast(msg, 'error');
    render();
  };
}

function showInfo(key) {
  const g = GUIDE[key];
  const dlg = refs.dialog;
  dlg.replaceChildren(
    h('form', { method: 'dialog', class: 'sim-info' },
      h('h2', {}, g.en),
      h('p', { class: 'muted' }, g.es),
      h('p', { lang: 'en' }, g.textEn),
      h('button', { type: 'button', class: 'btn', onclick: () => say(g.textEn) }, '🔊 ', bi('Listen in English', 'Escuchar en inglés')),
      h('p', {}, g.textEs),
      h('ul', { class: 'terms' }, g.terms.map(([en, es]) => h('li', {}, h('button', { type: 'button', class: 'link-btn', onclick: () => say(en) }, '🔊 ', h('strong', { lang: 'en' }, en)), ` — ${es}`))),
      h('button', { class: 'btn primary' }, bi('Close', 'Cerrar')),
    ),
  );
  dlg.showModal();
}

// Texto bilingüe para botones: inglés arriba, español debajo.
const bi = (en, es) => h('span', { class: 'bi' }, h('span', { lang: 'en' }, en), h('small', {}, es));
// Placa de rotulación del cuadro: líneas en inglés y traducción al español.
const plate = (lines, es) => h('div', { class: 'plate small' }, lines.map((l) => h('div', {}, l)), es ? h('div', { class: 'plate-es' }, es) : null);

// ---------- Instrumentos ----------
// Instrumento de cuadrante (90°) con el eje abajo a la derecha, como los del cuadro real.
const CX = 104, CY = 104, R = 82;
const polar = (f, r) => {
  const a = Math.PI + f * (Math.PI / 2);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

function meter({ key, unit, max, ticks, labels, toFrac = (v) => v / max, red }) {
  const svg = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const root = svg('svg', { viewBox: '0 0 120 120', class: 'meter-face', role: 'img', 'aria-label': unit });
  root.append(svg('rect', { x: 2, y: 2, width: 116, height: 116, rx: 3, class: 'meter-bezel' }));
  root.append(svg('rect', { x: 8, y: 8, width: 104, height: 104, class: 'meter-dial' }));
  if (red) {
    const [from, to] = Array.isArray(red) ? red : [red, 1];
    const [x1, y1] = polar(from, R);
    const [x2, y2] = polar(to, R);
    root.append(svg('path', { d: `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`, class: 'meter-red' }));
  }
  for (let i = 0; i <= ticks; i++) {
    const f = i / ticks;
    const [x1, y1] = polar(f, R);
    const [x2, y2] = polar(f, R - (i % 2 ? 4 : 7));
    root.append(svg('line', { x1, y1, x2, y2, class: 'meter-tick' }));
  }
  root.append(svg('path', { d: `M${polar(0, R).join(' ')} A${R} ${R} 0 0 1 ${polar(1, R).join(' ')}`, class: 'meter-arc' }));
  for (const [f, text] of labels) {
    const [x, y] = polar(f, R - 16);
    const t = svg('text', { x, y: y + 3, class: 'meter-num' });
    t.textContent = text;
    root.append(t);
  }
  const u = svg('text', { x: 30, y: 92, class: 'meter-unit' });
  u.textContent = unit;
  root.append(u);
  const needle = svg('line', { x1: CX, y1: CY, x2: CX - R + 4, y2: CY, class: 'meter-needle' });
  root.append(needle, svg('circle', { cx: CX, cy: CY, r: 5, class: 'meter-pivot' }));
  const shown = { v: 0 };
  refs[key] = (value, dt) => {
    shown.v += (value - shown.v) * Math.min(1, dt * 4); // aguja amortiguada
    const f = Math.max(-0.02, Math.min(1.02, toFrac(shown.v)));
    const [x, y] = polar(f, R - 4);
    needle.setAttribute('x2', x);
    needle.setAttribute('y2', y);
  };
  return h('button', { class: 'meter', type: 'button', 'aria-label': GUIDE[key].en, onclick: () => (infoMode ? showInfo(key) : null) }, root);
}

const scale = (max, step) => Array.from({ length: max / step + 1 }, (_, i) => [(i * step) / max, String(i * step)]);
// Escala de aislamiento no lineal: 0 a la izquierda, ∞ a la derecha.
const insFrac = (v) => v / (v + 200);

// Selector giratorio. positions: [{ value, label }]
function selector({ key, label, es, positions, get, set }) {
  const knob = h('span', { class: 'knob' }, h('span', { class: 'knob-bar' }));
  const marks = h('span', { class: 'knob-marks' }, positions.map((p, i) => h('span', { style: `--a:${angle(i, positions.length)}deg` }, String(i + 1))));
  const el = h('button', { type: 'button', class: 'selector', 'aria-label': GUIDE[key].en, onclick: control(key, () => {
    const i = positions.findIndex((p) => p.value === get());
    return set(positions[(i + 1) % positions.length].value);
  }) }, h('span', { class: 'knob-wrap' }, marks, knob));
  const tag = plate(label, es);
  refs[`sel-${key}`] = () => {
    const i = positions.findIndex((p) => p.value === get());
    knob.style.setProperty('--a', `${angle(i, positions.length)}deg`);
    el.setAttribute('aria-valuetext', positions[i].label);
  };
  return h('div', { class: 'sel-cell' }, el, tag);
}
const angle = (i, n) => (n === 2 ? [-45, 45][i] : [-45, 0, 45][i]);

function lamp(key, color, label, es) {
  const el = h('button', { type: 'button', class: `lamp ${color}`, 'aria-label': GUIDE[key].en, onclick: () => (infoMode ? showInfo(key) : null) });
  refs[`lamp-${key}`] = (on) => el.classList.toggle('on', on);
  return h('div', { class: 'lamp-cell' }, el, plate(label, es));
}

function pushButton(key, color, label, es, fn) {
  const el = h('button', { type: 'button', class: `push ${color}`, 'aria-label': GUIDE[key].en, onclick: control(key, fn) });
  refs[`push-${key}`] = (on) => el.classList.toggle('on', on);
  return h('div', { class: 'lamp-cell' }, el, plate(label, es));
}

// ---------- Esquema unifilar ----------
function mimic() {
  const ns = 'http://www.w3.org/2000/svg';
  const box = document.createElement('div');
  box.className = 'mimic';
  box.innerHTML = `<svg viewBox="0 0 340 120" role="img" aria-label="Esquema unifilar">
    <text x="20" y="18">MSB</text><line class="bus" data-k="msb" x1="10" y1="28" x2="110" y2="28"/>
    <line class="wire" data-k="tieL" x1="110" y1="28" x2="140" y2="28"/>
    <rect class="brk" data-k="tie" x="140" y="18" width="20" height="20"/>
    <text x="128" y="56" class="tiny">TIE</text>
    <line class="wire" data-k="tieR" x1="160" y1="28" x2="190" y2="28"/>
    <text x="230" y="18">ESB</text><line class="bus" data-k="esb" x1="190" y1="28" x2="330" y2="28"/>
    <line class="wire" data-k="egUp" x1="260" y1="28" x2="260" y2="58"/>
    <rect class="brk" data-k="eg" x="250" y="58" width="20" height="20"/>
    <text x="276" y="72" class="tiny">EG BRK</text>
    <line class="wire" data-k="egDown" x1="260" y1="78" x2="260" y2="92"/>
    <circle class="gen" data-k="gen" cx="260" cy="104" r="12"/><text x="253" y="108" class="tiny">G</text>
    <text x="10" y="70" class="tiny" data-k="msbtxt"></text>
    <text x="10" y="86" class="tiny" data-k="esbtxt"></text>
  </svg>`;
  const q = (k) => box.querySelector(`[data-k="${k}"]`);
  refs.mimic = () => {
    const msb = s.msbLive || (s.tieBreaker && esbSource(s) === 'eg');
    const esb = esbSource(s) !== null;
    const genLive = s.genVoltage > 300;
    q('msb').classList.toggle('live', msb);
    q('tieL').classList.toggle('live', msb);
    q('tie').classList.toggle('closed', s.tieBreaker);
    q('tieR').classList.toggle('live', esb);
    q('esb').classList.toggle('live', esb);
    q('egUp').classList.toggle('live', esb);
    q('eg').classList.toggle('closed', s.genBreaker);
    q('egDown').classList.toggle('live', genLive);
    q('gen').classList.toggle('live', genLive);
    q('msbtxt').textContent = `MSB: ${s.msbLive ? 'main generators on line' : msb ? 'fed by emergency generator' : 'BLACKOUT'}`;
    q('esbtxt').textContent = `ESB: ${esbSource(s) === 'msb' ? 'fed from MSB' : esbSource(s) === 'eg' ? 'fed by emergency generator' : 'NO POWER'}`;
  };
  return box;
}

// ---------- Construcción de la página ----------
const ENGINE_TXT = { stopped: ['STOPPED', 'Parado'], cranking: ['CRANKING', 'Arrancando'], running: ['RUNNING', 'En marcha'], cooldown: ['COOLING DOWN', 'Enfriamiento'] };

function buildPanel() {
  const loadRows = Object.entries(LOADS).map(([k, l]) => {
    const chk = h('input', { type: 'checkbox', onchange: (e) => {
      if (infoMode) { e.target.checked = !e.target.checked; return showInfo('loads'); }
      actions.toggleLoad(s, k);
      render();
    } });
    refs[`load-${k}`] = () => { chk.checked = s.loads[k]; };
    return h('label', { class: 'load' }, chk, h('span', {}, h('strong', { lang: 'en' }, l.en.toUpperCase()), h('small', {}, `${l.es} · ${l.kw} kW`)));
  });

  const engineStatus = h('strong', { class: 'engine-status' });
  refs.engine = () => {
    const [en, es] = ENGINE_TXT[s.engine];
    engineStatus.textContent = `${en} · ${es}`;
    engineStatus.dataset.state = s.engine;
  };

  const infoBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => {
    infoMode = !infoMode;
    infoBtn.setAttribute('aria-pressed', String(infoMode));
    infoBtn.classList.toggle('primary', infoMode);
    refs.board.classList.toggle('info-mode', infoMode);
    toast(infoMode ? 'Modo información: toca cualquier elemento para ver qué es.' : 'Modo información desactivado.');
  } }, 'ℹ️ ', bi('Info mode', 'Modo información'));
  const announce = h('input', { type: 'checkbox', checked: progress().announce !== false, onchange: (e) => store.update((st) => { st.sim = { ...progress(), announce: e.target.checked }; }) });

  refs.board = h('div', { class: 'eg-board' },
    h('div', { class: 'plate title' }, 'EMERGENCY GENERATOR', h('div', { class: 'plate-es' }, 'Generador de emergencia')),
    h('div', { class: 'meters' },
      h('div', { class: 'meter-col' }, meter({ key: 'ammeter', unit: 'A', max: 400, ticks: 16, labels: scale(400, 100), red: TRIP_A / 400 }),
        selector({ key: 'meterA', label: ['A-METER', '1-L1 2-L2 3-L3'], es: 'Selector amperímetro · fases', positions: [1, 2, 3].map((p) => ({ value: p, label: `L${p}` })), get: () => s.meterA, set: (v) => actions.setMeter(s, 'meterA', v) })),
      h('div', { class: 'meter-col' }, meter({ key: 'voltmeter', unit: 'V', max: 600, ticks: 12, labels: scale(600, 200) }),
        selector({ key: 'meterV', label: ['V-METER', '1-L1 2-L2 3-L3'], es: 'Selector voltímetro · fases', positions: [1, 2, 3].map((p) => ({ value: p, label: `L${p}` })), get: () => s.meterV, set: (v) => actions.setMeter(s, 'meterV', v) })),
      h('div', { class: 'meter-col' }, meter({ key: 'wattmeter', unit: 'kW', max: 300, ticks: 12, labels: scale(300, 100) })),
      h('div', { class: 'meter-col' }, meter({ key: 'varmeter', unit: 'kVar', max: 200, ticks: 8, labels: scale(200, 100) })),
      h('div', { class: 'meter-col' }, meter({ key: 'insulation', unit: 'kΩ', toFrac: insFrac, ticks: 10, labels: [[0, '0'], [insFrac(100), '100'], [insFrac(500), '500'], [1, '∞']], red: [0, insFrac(100)] })),
    ),
    h('div', { class: 'lamps' },
      lamp('supplyEsb', 'green', ['SUPPLY', 'FROM ESB'], 'Tensión en ESB'),
      lamp('supplyFromMsb', 'green', ['SUPPLY OF ESB', 'FROM MSB'], 'ESB alimentado desde MSB'),
      lamp('overcurrent', 'red', ['OVERCURRENT', 'TRIP'], 'Disparo por sobrecorriente'),
      pushButton('breakerOff', 'red', ['GENERATOR', 'BREAKER OFF'], 'Abrir interruptor generador', () => actions.breakerOff(s)),
      pushButton('breakerOn', 'white', ['GENERATOR', 'BREAKER ON'], 'Cerrar interruptor generador', () => actions.breakerOn(s)),
      pushButton('reset', 'black', ['RESET'], 'Rearme', () => actions.reset(s)),
    ),
    h('div', { class: 'selectors' },
      selector({ key: 'tieMode', label: ['CONTROL OF TIE BREAKER TO MSB', '1-NORMAL OPERATION', '2-EMERGENCY SUPPLY OF MSB'], es: 'Control del acoplamiento al MSB · 1 operación normal · 2 alimentación de emergencia del MSB', positions: [{ value: 'normal', label: 'Normal operation' }, { value: 'emergency', label: 'Emergency supply of MSB' }], get: () => s.tieMode, set: (v) => actions.setTieMode(s, v) }),
      selector({ key: 'mode', label: ['CONTROL OF EG BREAKER AND', 'TIE BREAKER TO MSB', '1-AUTO 2-MANUAL'], es: 'Control del interruptor del EG y del acoplamiento · 1 automático · 2 manual', positions: [{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }], get: () => s.mode, set: (v) => actions.setMode(s, v) }),
    ),
  );

  return h('section', { id: 'tab-panel' },
    h('div', { class: 'row' }, infoBtn, h('label', { class: 'check' }, announce, bi('Voice alerts in English', 'Avisos de voz en inglés'))),
    refs.exBanner = h('div', { class: 'banner hidden' }),
    refs.board,
    h('div', { class: 'sim-grid' },
      h('div', { class: 'card' }, h('strong', {}, '🧭 One-line diagram · Esquema unifilar'), mimic()),
      h('div', { class: 'card', onclick: (e) => { if (infoMode && e.target.closest('.card')) showInfo('engine'); } },
        h('strong', {}, '⚙️ Local engine control · Motor'), engineStatus,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: control('engine', () => actions.startEngine(s)) }, '▶ ', bi('START', 'Arrancar')),
          h('button', { type: 'button', class: 'btn', onclick: control('engine', () => actions.stopEngine(s)) }, '■ ', bi('STOP', 'Parar')),
        ),
        h('p', { class: 'muted small' }, 'Solo responde en MANUAL (selector «Control of EG breaker» en 2).'),
      ),
      h('div', { class: 'card' }, h('strong', {}, '🔌 Emergency consumers · Consumidores'), loadRows,
        h('p', { class: 'muted small' }, 'Si el generador alimenta el MSB, se suman 110 kW de consumidores esenciales.')),
      h('div', { class: 'card' }, h('strong', {}, '🎓 Instructor · Provocar situaciones'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => { actions.blackout(s); render(); } }, '⚡ ', bi('Blackout', 'Apagón')),
          h('button', { type: 'button', class: 'btn', onclick: () => { actions.restoreMsb(s); render(); } }, '💡 ', bi('Restore MSB power', 'Restablecer MSB')),
        ),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => { actions.insulationFault(s, !s.insulationFault); render(); } }, '⏚ ', bi('Earth fault / repair', 'Derivación a masa / reparar')),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => { resetSim(); } }, '↺ ', bi('Reset simulator', 'Reiniciar')),
        ),
      ),
    ),
    h('h2', {}, '📜 Event log · Registro de eventos'),
    refs.log = h('ol', { class: 'sim-log', reversed: true }),
  );
}

function resetSim(setup) {
  s = createState();
  setup?.(s);
  s.events.length = 0;
  lastEvent = s.seq;
  refs.log.replaceChildren();
  render();
}

// ---------- Ejercicios ----------
function buildExercises() {
  const list = h('div', { class: 'list' });
  refs.exList = () => {
    const done = progress().done;
    list.replaceChildren(...EXERCISES.map((ex, i) => h('div', { class: `card ${done[ex.id] ? 'done' : ''}` },
      h('div', {},
        h('strong', {}, `${i + 1}. ${ex.title}`, done[ex.id] ? ' ✅' : ''),
        h('p', {}, ex.goal),
      ),
      h('button', { type: 'button', class: 'btn primary', onclick: () => startExercise(ex) }, done[ex.id] ? bi('Repeat', 'Repetir') : bi('Start', 'Empezar')),
    )));
  };
  refs.exList();
  return h('section', { id: 'tab-ejercicios', class: 'hidden' },
    h('p', { class: 'lead' }, 'Situaciones reales de guardia. Cada ejercicio prepara el panel; tú haces la maniobra y al terminar escuchas el parte en inglés.'),
    list);
}

function startExercise(ex) {
  resetSim(ex.setup);
  exercise = { ex, held: 0, done: false };
  showTab('panel');
  renderBanner();
  window.scrollTo(0, 0);
}

function renderBanner() {
  const b = refs.exBanner;
  if (!exercise) return b.classList.add('hidden');
  const { ex, done } = exercise;
  b.classList.remove('hidden');
  b.replaceChildren(
    h('div', { class: 'ex-body' },
      h('strong', {}, `${done ? '✅ ' : '🎯 '}${ex.title}`),
      h('p', {}, ex.goal),
      done
        ? h('div', {},
          h('p', { lang: 'en' }, h('strong', {}, 'Report: '), ex.report.en),
          h('p', { class: 'muted' }, ex.report.es),
          h('button', { type: 'button', class: 'btn primary', onclick: () => say(ex.report.en) }, '🔊 ', bi('Listen to the report', 'Escuchar el parte')))
        : ex.quiz
          ? h('div', { class: 'row' }, h('span', {}, ex.quiz.q), ex.quiz.options.map(([en, es], i) => h('button', { type: 'button', class: 'btn', onclick: () => {
            if (i === ex.quiz.answer) complete();
            else toast('No es eso. Mira otra vez los instrumentos.', 'error');
          } }, bi(en, es))))
          : h('details', {}, h('summary', {}, 'Hints · Pistas'), h('ol', {}, ex.hints.map((t) => h('li', {}, t)))),
    ),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { exercise = null; renderBanner(); } }, bi('Exit', 'Salir')),
  );
}

function complete() {
  exercise.done = true;
  const id = exercise.ex.id;
  store.update((st) => { st.sim = { ...progress(), done: { ...progress().done, [id]: Date.now() } }; });
  refs.exList();
  renderBanner();
  say(exercise.ex.report.en);
}

function checkExercise(dt) {
  if (!exercise || exercise.done || !exercise.ex.check) return;
  if (exercise.ex.check(s)) {
    exercise.held += dt;
    if (exercise.held >= (exercise.ex.hold ?? 0)) complete();
  } else {
    exercise.held = 0;
  }
}

// ---------- Guía ----------
function buildGuide() {
  return h('section', { id: 'tab-guia', class: 'hidden' },
    h('p', { class: 'lead' }, 'Qué es cada elemento del cuadro, en inglés y en español. En el panel, activa «ℹ️ Modo información» y toca cualquier elemento.'),
    h('div', { class: 'grid' }, GUIDE_ORDER.map((k) => {
      const g = GUIDE[k];
      return h('div', { class: 'card' },
        h('strong', { lang: 'en' }, g.en), h('span', { class: 'muted small' }, g.es),
        h('p', { lang: 'en' }, g.textEn),
        h('p', {}, g.textEs),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => say(g.textEn) }, '🔊 ', bi('Listen', 'Escuchar')), h('button', { type: 'button', class: 'btn ghost', onclick: () => showInfo(k) }, bi('Vocabulary', 'Vocabulario'))),
      );
    })),
  );
}

// ---------- Pestañas ----------
const TABS = [['panel', '🎛️', 'Panel', 'Panel'], ['ejercicios', '🎯', 'Exercises', 'Ejercicios'], ['guia', '📖', 'Guide', 'Guía']];
function showTab(id) {
  for (const [t] of TABS) {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== id);
    refs[`tabbtn-${t}`].setAttribute('aria-current', t === id ? 'page' : 'false');
  }
}

// ---------- Bucle de simulación ----------
let lastEvent = 0;
const ANNOUNCE = new Set(['blackout', 'engine-running', 'breaker-closed', 'trip', 'msb-restored', 'low-insulation', 'engine-stop']);

function render(dt = 0) {
  const r = readings(s);
  refs.ammeter(r.amps, dt || 1);
  refs.voltmeter(r.volts, dt || 1);
  refs.wattmeter(r.kw, dt || 1);
  refs.varmeter(r.kvar, dt || 1);
  refs.insulation(r.insulation, dt || 1);
  const l = lamps(s);
  refs['lamp-supplyEsb'](l.supplyEsb);
  refs['lamp-supplyFromMsb'](l.supplyFromMsb);
  refs['lamp-overcurrent'](l.overcurrent);
  refs['push-breakerOff'](l.breakerOff);
  refs['push-breakerOn'](l.breakerOn);
  refs['push-reset'](false);
  for (const k of ['meterA', 'meterV', 'tieMode', 'mode']) refs[`sel-${k}`]();
  for (const k of Object.keys(LOADS)) refs[`load-${k}`]();
  refs.engine();
  refs.mimic();
  // Nuevos eventos al registro
  const fresh = s.events.filter((ev) => ev.id > lastEvent);
  if (fresh.length) lastEvent = fresh.at(-1).id;
  for (const ev of fresh) {
    refs.log.prepend(h('li', {},
      h('span', { class: 'muted small' }, `${ev.t.toFixed(1)} s`),
      h('button', { type: 'button', class: 'link-btn', title: 'Escuchar en inglés', onclick: () => say(ev.en) }, '🔊'),
      h('span', {}, h('strong', { lang: 'en' }, ev.en), h('br'), h('span', { class: 'muted' }, ev.es)),
    ));
    if (ANNOUNCE.has(ev.code) && progress().announce !== false) say(ev.en);
  }
  while (refs.log.children.length > 60) refs.log.lastChild.remove();
}

let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.25, (now - prev) / 1000);
  prev = now;
  for (let t = 0; t < dt; t += 0.05) step(s, Math.min(0.05, dt - t));
  checkExercise(dt);
  render(dt);
  requestAnimationFrame(loop);
}

// ---------- Arranque ----------
const main = document.getElementById('sim');
refs.dialog = h('dialog', { class: 'sim-dialog' });
document.getElementById('sim-tabs').append(...TABS.map(([id, icon, en, es]) => (refs[`tabbtn-${id}`] = h('a', { href: `#${id}`, onclick: (e) => { e.preventDefault(); showTab(id); } }, icon, bi(en, es)))));
main.append(buildPanel(), buildExercises(), buildGuide(), refs.dialog);
showTab(TABS.some(([t]) => t === location.hash.slice(1)) ? location.hash.slice(1) : 'panel');
render();
requestAnimationFrame(loop);
