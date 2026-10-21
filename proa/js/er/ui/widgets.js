// Elementos de cuadro reutilizables: instrumentos, selectores, pilotos, pulsadores, interruptores
// giratorios y sincronoscopio. Cada uno devuelve { el, set(...) } para actualizarlo en el bucle.
import { h } from '../../core/ui.js';

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}
export function svgText(x, y, text, cls, anchor = 'middle') {
  const t = svg('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = text;
  return t;
}

// Texto bilingüe: inglés y, debajo, español.
export const bi = (en, es) => h('span', { class: 'bi' }, h('span', { lang: 'en' }, en), h('small', {}, es));
// Placa de rotulación del cuadro (inglés) con traducción.
export const plate = (lines, es) => h('div', { class: 'plate small' }, [].concat(lines).map((l) => h('div', {}, l)), es ? h('div', { class: 'plate-es' }, es) : null);

// ---------- Instrumento de cuadrante ----------
const CX = 104, CY = 104, R = 82;
const polar = (f, r) => {
  const a = Math.PI + f * (Math.PI / 2);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
export const scale = (max, stepV, min = 0) => Array.from({ length: Math.round((max - min) / stepV) + 1 }, (_, i) => [(i * stepV) / (max - min), String(min + i * stepV)]);

export function meter({ unit, max, min = 0, ticks = 10, labels, toFrac, red, label, es }) {
  const frac = toFrac ?? ((v) => (v - min) / (max - min));
  const root = svg('svg', { viewBox: '0 0 120 120', class: 'meter-face', role: 'img', 'aria-label': unit });
  root.append(svg('rect', { x: 2, y: 2, width: 116, height: 116, rx: 3, class: 'meter-bezel' }));
  root.append(svg('rect', { x: 8, y: 8, width: 104, height: 104, class: 'meter-dial' }));
  for (const zone of [].concat(red ? [red] : [])) {
    const [from, to] = Array.isArray(zone) ? zone : [zone, 1];
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
  for (const [f, text] of labels ?? scale(max, (max - min) / 4, min)) {
    const [x, y] = polar(f, R - 16);
    root.append(svgText(x, y + 3, text, 'meter-num'));
  }
  root.append(svgText(30, 92, unit, 'meter-unit', 'start'));
  const needle = svg('line', { x1: CX, y1: CY, x2: CX - R + 4, y2: CY, class: 'meter-needle' });
  root.append(needle, svg('circle', { cx: CX, cy: CY, r: 5, class: 'meter-pivot' }));
  let shown = min;
  let last = performance.now();
  const el = h('div', { class: 'meter-cell' }, h('div', { class: 'meter' }, root), label ? plate(label, es) : null);
  return {
    el,
    set(value) {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      shown += (value - shown) * Math.min(1, dt * 4);
      const f = Math.max(-0.02, Math.min(1.02, frac(shown)));
      const [x, y] = polar(f, R - 4);
      needle.setAttribute('x2', x);
      needle.setAttribute('y2', y);
    },
  };
}

// ---------- Selector giratorio ----------
// positions: [{ value, label }]; onSelect(value)
export function knob({ positions, label, es, onSelect, marks }) {
  const n = positions.length;
  const ang = (i) => (n === 2 ? [-45, 45][i] : n === 3 ? [-45, 0, 45][i] : -60 + (120 * i) / (n - 1));
  const k = h('span', { class: 'knob' }, h('span', { class: 'knob-bar' }));
  const markEls = h('span', { class: 'knob-marks' }, positions.map((p, i) => h('span', { style: `--a:${ang(i)}deg` }, marks?.[i] ?? String(i + 1))));
  let current = positions[0].value;
  const btn = h('button', { type: 'button', class: 'selector', 'aria-label': label?.join?.(' ') ?? label, onclick: () => {
    const i = positions.findIndex((p) => p.value === current);
    onSelect(positions[(i + 1) % n].value);
  } }, h('span', { class: 'knob-wrap' }, markEls, k));
  return {
    el: h('div', { class: 'sel-cell' }, btn, label ? plate(label, es) : null),
    set(value) {
      current = value;
      const i = Math.max(0, positions.findIndex((p) => p.value === value));
      k.style.setProperty('--a', `${ang(i)}deg`);
      btn.setAttribute('aria-valuetext', positions[i].label ?? String(value));
    },
  };
}

// ---------- Piloto luminoso y pulsador ----------
export function lamp({ color = 'green', label, es, blink = false }) {
  const l = h('span', { class: `lamp ${color}`, role: 'img', 'aria-label': [].concat(label ?? []).join(' ') });
  return {
    el: h('div', { class: 'lamp-cell' }, l, label ? plate(label, es) : null),
    set(on) { l.classList.toggle('on', Boolean(on)); l.classList.toggle('blink', Boolean(on) && blink); },
  };
}
export function push({ color = 'black', label, es, onPress }) {
  const b = h('button', { type: 'button', class: `push ${color}`, 'aria-label': [].concat(label ?? []).join(' '), onclick: onPress });
  return {
    el: h('div', { class: 'lamp-cell' }, b, label ? plate(label, es) : null),
    set(on) { b.classList.toggle('on', Boolean(on)); },
  };
}

// ---------- Interruptor automático de caja moldeada (mando giratorio) ----------
// Posiciones: ON, TRIPPED (en medio) y OFF/RESET. Desde TRIPPED hay que pasar a OFF para rearmar.
export function rotaryBreaker({ label, es, onToggle }) {
  const handle = h('span', { class: 'mccb-knob' }, h('span', { class: 'mccb-bar' }));
  const btn = h('button', { type: 'button', class: 'mccb', 'aria-label': [].concat(label).join(' '), onclick: () => onToggle() },
    h('span', { class: 'mccb-on' }, 'ON', h('br'), 'I'), h('span', { class: 'mccb-off' }, 'O', h('br'), 'OFF'), handle);
  return {
    el: h('div', { class: 'mccb-cell' }, btn, plate(label, es)),
    set(state) { // 'on' | 'off' | 'trip'
      btn.dataset.state = state;
      btn.setAttribute('aria-valuetext', state);
    },
  };
}

// ---------- Sincronoscopio ----------
export function synchroscope() {
  const root = svg('svg', { viewBox: '0 0 120 120', class: 'synchro', role: 'img', 'aria-label': 'Synchroscope' });
  root.append(svg('circle', { cx: 60, cy: 60, r: 56, class: 'meter-bezel' }), svg('circle', { cx: 60, cy: 60, r: 50, class: 'meter-dial' }));
  root.append(svg('path', { d: 'M60 10 A50 50 0 0 1 72 11.5 L60 60 Z', class: 'synchro-ok' }), svg('path', { d: 'M60 10 A50 50 0 0 0 48 11.5 L60 60 Z', class: 'synchro-ok' }));
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    root.append(svg('line', { x1: 60 + 44 * Math.sin(a), y1: 60 - 44 * Math.cos(a), x2: 60 + 50 * Math.sin(a), y2: 60 - 50 * Math.cos(a), class: 'meter-tick' }));
  }
  root.append(svgText(28, 64, 'SLOW', 'meter-num'), svgText(92, 64, 'FAST', 'meter-num'));
  const needle = svg('line', { x1: 60, y1: 60, x2: 60, y2: 16, class: 'meter-needle' });
  root.append(needle, svg('circle', { cx: 60, cy: 60, r: 5, class: 'meter-pivot' }));
  return {
    el: h('div', { class: 'meter-cell' }, h('div', { class: 'meter' }, root), plate(['SYNCHROSCOPE'], 'Sincronoscopio')),
    set(theta, active) {
      needle.style.transform = `rotate(${active ? theta : 0}deg)`;
      needle.style.opacity = active ? 1 : 0.25;
    },
  };
}

// ---------- Indicador digital ----------
export function readout({ label, es, unit = '', dec = 1 }) {
  const v = h('strong', {});
  const el = h('div', { class: 'readout' }, h('span', { class: 'readout-label' }, bi(label, es)), h('span', { class: 'readout-val' }, v, ` ${unit}`));
  return {
    el,
    set(value, warn = false) {
      v.textContent = typeof value === 'number' ? value.toFixed(dec) : value;
      el.classList.toggle('warn', Boolean(warn));
    },
  };
}
