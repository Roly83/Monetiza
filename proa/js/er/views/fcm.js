// Vista «Fuel Cond. Module»: módulo de acondicionamiento de combustible (booster) del motor principal:
// válvula de cambio HFO/DO, bombas de alimentación, caudalímetro, tanque de mezcla, bombas de circulación,
// calentador de vapor con controlador de viscosidad, filtro automático y viscosímetro.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { meter, knob, lamp, readout, bi } from '../ui/widgets.js';

const MODE = { visc: ['VISCOSITY', 'Viscosidad'], temp: ['TEMPERATURE', 'Temperatura'], manual: ['MANUAL', 'Manual'] };

registerFace('fcm-co', (ctx) => {
  const sel = knob({ positions: [{ value: 'HFO', label: 'HFO' }, { value: 'DO', label: 'DO' }], marks: ['HFO', 'DO'], label: ['FUEL CHANGEOVER', 'HFO · DO'], es: 'Cambio de combustible HFO · diésel', onSelect: (v) => ctx.act('fcmChangeover', v) });
  const frac = readout({ label: 'HFO in circuit', es: 'HFO en el circuito', unit: '%', dec: 0 });
  const T = readout({ label: 'Fuel temperature', es: 'Temperatura del combustible', unit: '°C', dec: 1 });
  const g = readout({ label: 'Temperature gradient', es: 'Gradiente de temperatura', unit: '°C/min', dec: 2 });
  return {
    en: 'FO 3-way changeover valve (HFO / DO)', es: 'Válvula de tres vías de cambio de combustible (HFO / diésel)',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, sel.el),
      h('div', { class: 'row' }, btn('HFO', 'Fuelóleo pesado', () => ctx.act('fcmChangeover', 'HFO')), btn('DO', 'Diésel', () => ctx.act('fcmChangeover', 'DO'))),
      h('div', { class: 'readouts' }, frac.el, T.el, g.el),
      h('p', { class: 'muted small' }, 'El tanque de mezcla tarda unos 10 min en renovarse. Antes de pasar a diésel baja la temperatura poco a poco (modo TEMPERATURA del controlador): máximo 2 °C/min para no gripar las bombas de inyección.')),
    update(p) {
      const f = p.fuel.fcm;
      sel.set(f.co); frac.set(f.frac * 100); T.set(f.T); g.set(f.grad, Math.abs(f.grad) > 2);
    },
  };
});

registerFace('fcm-visc', (ctx) => {
  const st = statusLine();
  const vm = meter({ unit: 'cSt', max: 30, labels: [[0, '0'], [1 / 3, '10'], [2 / 3, '20'], [1, '30']], red: [0.6, 1], label: ['VISCOSITY'], es: 'Viscosidad' });
  const tm = meter({ unit: '°C', max: 160, labels: [[0, '0'], [0.5, '80'], [1, '160']], red: [0.94, 1], label: ['TEMPERATURE'], es: 'Temperatura' });
  const vs = readout({ label: 'Viscosity set point', es: 'Consigna de viscosidad', unit: 'cSt', dec: 1 });
  const ts = readout({ label: 'Temperature set point', es: 'Consigna de temperatura', unit: '°C', dec: 0 });
  const sp = readout({ label: 'Active set point (ramp)', es: 'Consigna activa (rampa)', unit: '°C', dec: 1 });
  const pos = readout({ label: 'Steam valve', es: 'Válvula de vapor', unit: '%', dec: 0 });
  const g = readout({ label: 'Gradient', es: 'Gradiente', unit: '°C/min', dec: 2 });
  const modes = Object.keys(MODE).map((k) => btn(MODE[k][0], MODE[k][1], () => ctx.act('fcmMode', k)));
  const step = (fn) => () => fn(ctx.p().fuel.fcm);
  return {
    en: 'Viscosity controller (steam heater)', es: 'Controlador de viscosidad (calentador de vapor)',
    body: h('div', { class: 'fp-body' }, st.el,
      h('div', { class: 'panel-row' }, vm.el, tm.el),
      h('div', { class: 'row' }, ...modes),
      h('div', { class: 'row' },
        btn('VISC −0.5', 'Viscosidad −0,5', step((f) => ctx.act('fcmViscSet', f.viscSet - 0.5))), btn('VISC +0.5', 'Viscosidad +0,5', step((f) => ctx.act('fcmViscSet', f.viscSet + 0.5))),
        btn('TEMP −5', 'Temperatura −5', step((f) => ctx.act('fcmTempSet', f.tempSet - 5))), btn('TEMP +5', 'Temperatura +5', step((f) => ctx.act('fcmTempSet', f.tempSet + 5)))),
      h('div', { class: 'row' },
        btn('VALVE −10 %', 'Válvula −10 %', () => ctx.act('setPos', 'v-fcm-heat', ctx.p().c['v-fcm-heat'].pos - 0.1)),
        btn('VALVE +10 %', 'Válvula +10 %', () => ctx.act('setPos', 'v-fcm-heat', ctx.p().c['v-fcm-heat'].pos + 0.1))),
      h('div', { class: 'readouts' }, vs.el, ts.el, sp.el, pos.el, g.el),
      h('p', { class: 'muted small' }, 'VISCOSIDAD: regula el vapor para ~13 cSt (HFO 380 a ~135–140 °C). TEMPERATURA: consigna con rampa de 1,2 °C/min, para el cambio HFO ↔ diésel. MANUAL: válvula a mano.')),
    update(p) {
      const f = p.fuel.fcm, v = p.c['v-fcm-heat'];
      st.el.dataset.state = v.fault ? 'fault' : f.mode === 'manual' ? 'standby' : 'run';
      st.el.replaceChildren(h('strong', { lang: 'en' }, `${MODE[f.mode][0]} MODE${v.fault ? ' · VALVE STUCK' : ''}`), h('span', {}, ` · modo ${MODE[f.mode][1].toLowerCase()}${v.fault ? ' · válvula bloqueada' : ''}`));
      modes.forEach((b, i) => b.classList.toggle('primary', Object.keys(MODE)[i] === f.mode));
      vm.set(f.visc); tm.set(f.T);
      vs.set(f.viscSet); ts.set(f.tempSet); sp.set(f.spEff); pos.set(v.pos * 100); g.set(f.grad, Math.abs(f.grad) > 2);
    },
  };
});

registerFace('fcm-filter', (ctx) => {
  const dp = meter({ unit: 'bar Δp', max: 2, labels: [[0, '0'], [0.5, '1'], [1, '2']], red: [0.5, 1], label: ['FILTER Δp'], es: 'Presión diferencial' });
  const lBy = lamp({ color: 'amber', label: ['BYPASS', 'FILTER'], es: 'Filtro de bypass' });
  const fl = readout({ label: 'Back-flushes', es: 'Contralavados', dec: 0 });
  return {
    en: 'FO automatic back-flushing filter', es: 'Filtro automático de contralavado de combustible',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, dp.el, lBy.el),
      h('div', { class: 'row' }, btn('BACK-FLUSH', 'Contralavado', () => ctx.act('fcmFilterFlush'), 'primary'),
        btn('BYPASS FILTER IN', 'Pasar al filtro de bypass', () => ctx.act('fcmFilterBypass', true)), btn('AUTO FILTER IN', 'Volver al filtro automático', () => ctx.act('fcmFilterBypass', false))),
      fl.el,
      h('p', { class: 'muted small' }, 'El filtro se contralava solo a 0,5 bar. Si la Δp sigue subiendo (filtro obstruido), pasa al filtro manual de bypass para no perder la presión del motor.')),
    update(p) { const f = p.fuel.fcm; dp.set(f.dp); lBy.set(f.bypass); fl.set(f.flushes); },
  };
});

export default {
  id: 'fcm', en: 'Fuel Cond. Module', es: 'Módulo de acondicionamiento', indent: true,
  render(ctx) {
    const f = (p) => p.fuel.fcm;
    const sup = (p) => f(p).supplyP > 2;
    const circ = (p) => f(p).circP > 5;
    const m = mimic([
      { t: 'label', x: 500, y: 26, en: 'Fuel Oil Conditioning Module (booster unit)', es: 'Módulo de acondicionamiento de combustible (booster)', size: 15 },
      // Entradas
      { t: 'pipe', d: 'M40 110 H170 V150', fluid: 'hfo', on: (p) => sup(p) && f(p).co === 'HFO' },
      { t: 'pipe', d: 'M40 230 H170 V190', fluid: 'do', on: (p) => sup(p) && f(p).co === 'DO' },
      { t: 'label', x: 40, y: 98, en: 'From HFO service tank', es: 'Del servicio de HFO', size: 10, anchor: 'start' },
      { t: 'label', x: 40, y: 250, en: 'From DO service tank', es: 'Del servicio de diésel', size: 10, anchor: 'start' },
      // Alimentación
      { t: 'pipe', d: 'M200 170 H240 V110 H264', fluid: 'hfo', on: sup },
      { t: 'pipe', d: 'M240 170 V230 H264', fluid: 'hfo', on: sup },
      { t: 'pipe', d: 'M296 110 H330 V170 H470', fluid: 'hfo', on: sup },
      { t: 'pipe', d: 'M296 230 H330 V170', fluid: 'hfo', on: sup },
      // Circulación
      { t: 'pipe', d: 'M560 170 H580 V110 H604', fluid: 'hfo', on: circ },
      { t: 'pipe', d: 'M580 170 V230 H604', fluid: 'hfo', on: circ },
      { t: 'pipe', d: 'M636 110 H670 V170 H700', fluid: 'hfo', on: circ },
      { t: 'pipe', d: 'M636 230 H670 V170', fluid: 'hfo', on: circ },
      { t: 'pipe', d: 'M760 170 H800', fluid: 'hfo', on: circ },
      { t: 'pipe', d: 'M870 170 H900 V260', fluid: 'hfo', on: circ },
      // Retorno del motor al tanque de mezcla
      { t: 'pipe', d: 'M900 330 V380 H515 V230', fluid: 'hfo', on: circ },
      { t: 'label', x: 700, y: 398, en: 'Return from ME (spill)', es: 'Retorno del motor principal', size: 10 },
      // Vapor
      { t: 'pipe', d: 'M730 60 V130', fluid: 'steam', on: (p) => p.c['v-fcm-heat'].pos > 0.02 && circ(p) },
      { t: 'label', x: 718, y: 66, en: 'Steam', es: 'Vapor', size: 10, anchor: 'end' },
      // Equipos
      { t: 'box', x: 150, y: 150, w: 50, h: 40, en: '3-way', es: 'cambio', face: 'fcm-co', size: 10, state: (p) => (f(p).co === 'HFO' ? 'run' : 'warn') },
      { t: 'value', x: 120, y: 300, w: 130, get: (p) => `${f(p).co} → ${(f(p).frac * 100).toFixed(0)}% HFO`, en: 'Changeover / mix', es: 'Cambio / mezcla', face: 'fcm-co' },
      { t: 'pump', id: 'fsp1', x: 280, y: 110, en: 'Supply pump No 1', es: 'Alimentación nº 1', ly: -26 },
      { t: 'pump', id: 'fsp2', x: 280, y: 230, en: 'Supply pump No 2', es: 'Alimentación nº 2' },
      { t: 'value', x: 345, y: 200, w: 100, get: (p) => p.fuel.meLh, unit: 'L/h', dec: 0, en: 'Flowmeter', es: 'Caudalímetro' },
      { t: 'box', x: 470, y: 130, w: 90, h: 100, en: 'Mixing', es: 'Tanque de mezcla', ty: 30, face: 'fcm-co' },
      { t: 'bar', x: 480, y: 180, w: 70, h: 14, get: (p) => f(p).frac, en: 'HFO fraction', es: 'Fracción HFO' },
      { t: 'pump', id: 'fcp1', x: 620, y: 110, en: 'Circ. pump No 1', es: 'Circulación nº 1', ly: -26 },
      { t: 'pump', id: 'fcp2', x: 620, y: 230, en: 'Circ. pump No 2', es: 'Circulación nº 2' },
      { t: 'hx', x: 700, y: 130, w: 60, h: 80, en: 'Steam heater', es: 'Calentador', face: 'fcm-visc' },
      { t: 'valve', id: 'v-fcm-heat', x: 730, y: 80, face: 'fcm-visc', en: 'Control valve', es: 'Válvula de control', lx: 60, ly: 4 },
      { t: 'box', x: 800, y: 145, w: 70, h: 50, en: 'Auto filter', es: 'Filtro auto.', face: 'fcm-filter', size: 10, state: (p) => (f(p).dp > 1 ? 'alarm' : f(p).bypass ? 'warn' : 'stop') },
      { t: 'box', x: 870, y: 200, w: 60, h: 50, en: 'Visco', es: 'Viscosímetro', face: 'fcm-visc', size: 10, state: (p) => (circ(p) && (f(p).visc > 18 || f(p).visc < 1.5) ? 'alarm' : 'stop') },
      { t: 'box', x: 850, y: 260, w: 110, h: 70, en: 'Main Engine →', es: 'Motor principal', nav: 'me', state: (p) => (p.sig.meRunning ? 'run' : 'stop') },
      // Lecturas
      { t: 'value', x: 40, y: 470, w: 120, get: (p) => f(p).supplyP, unit: 'bar', en: 'Supply pressure', es: 'Presión alimentación', warn: (p) => f(p).supplyP < 2.5 && (p.c.fsp1.cmd || p.c.fsp2.cmd) },
      { t: 'value', x: 180, y: 470, w: 120, get: (p) => f(p).circP, unit: 'bar', en: 'Circulating pressure', es: 'Presión circulación' },
      { t: 'value', x: 320, y: 470, w: 120, get: (p) => p.sig.meFuelPress, unit: 'bar', en: 'ME inlet pressure', es: 'Presión entrada MP', warn: (p) => (p.c.fcp1.cmd || p.c.fcp2.cmd) && p.sig.meFuelPress < 7 },
      { t: 'value', x: 460, y: 470, w: 120, get: (p) => f(p).T, unit: '°C', en: 'Fuel temperature', es: 'Temperatura', face: 'fcm-visc', warn: (p) => f(p).T > 150 },
      { t: 'value', x: 600, y: 470, w: 120, get: (p) => f(p).visc, unit: 'cSt', en: 'Viscosity', es: 'Viscosidad', face: 'fcm-visc', warn: (p) => circ(p) && (f(p).visc > 18 || f(p).visc < 1.5) },
      { t: 'value', x: 740, y: 470, w: 120, get: (p) => f(p).grad, unit: '°C/min', dec: 2, en: 'Temp. gradient', es: 'Gradiente', face: 'fcm-visc', warn: (p) => Math.abs(f(p).grad) > 2 },
      { t: 'value', x: 40, y: 540, w: 120, get: (p) => f(p).dp, unit: 'bar', dec: 2, en: 'Filter Δp', es: 'Δp del filtro', face: 'fcm-filter', warn: (p) => f(p).dp > 1 },
      { t: 'value', x: 180, y: 540, w: 120, get: (p) => MODE[f(p).mode][0], en: 'Controller mode', es: 'Modo del controlador', face: 'fcm-visc' },
      { t: 'value', x: 320, y: 540, w: 120, get: (p) => p.c['v-fcm-heat'].pos * 100, unit: '%', dec: 0, en: 'Steam valve', es: 'Válvula de vapor', face: 'fcm-visc' },
      { t: 'value', x: 460, y: 540, w: 120, get: (p) => p.sig.meFuelType, en: 'Fuel at engine', es: 'Combustible en el MP', face: 'fcm-co' },
      { t: 'value', x: 600, y: 540, w: 120, get: (p) => (p.sig.meFuelOk ? 'READY' : 'NOT READY'), en: 'ME fuel system', es: 'Combustible del MP', warn: (p) => !p.sig.meFuelOk },
      { t: 'value', x: 740, y: 540, w: 120, get: (p) => p.sig.steamPress ?? 0, unit: 'bar', en: 'Steam pressure', es: 'Presión de vapor', nav: 'steam', warn: (p) => (p.sig.steamAvail ?? 1) < 0.5 },
    ], ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click the changeover valve, the heater, the filter or the viscosimeter for their panels.', 'Toca la válvula de cambio, el calentador, el filtro o el viscosímetro para ver sus paneles.'))), update: m.update };
  },
};
