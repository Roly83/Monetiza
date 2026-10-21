// Vista «Incinerator»: tanque de lodos, bomba de trasiego, tanque de servicio de aceite residual con
// calentador, cámara de combustión con quemador piloto (diésel) y de aceite residual, ventilador de
// gases, puerta de carga y panel de control con la secuencia de arranque.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { meter, lamp, readout, bi, svg, svgText } from '../ui/widgets.js';
import { STATES, WO_MIN_T, sludgeTank } from '../model/incinerator.js';

registerFace('inc-panel', (ctx) => {
  const st = h('div', { class: 'fp-status' });
  const temp = meter({ unit: '°C', max: 1200, labels: [[0, '0'], [0.5, '600'], [1, '1200']], red: [1150 / 1200, 1] });
  const lFan = lamp({ color: 'green', label: ['FAN'], es: 'Ventilador' });
  const lDo = lamp({ color: 'amber', label: ['DO BURNER'], es: 'Quemador diésel' });
  const lWo = lamp({ color: 'amber', label: ['WO BURNER'], es: 'Quemador aceite residual' });
  const lFl = lamp({ color: 'red', label: ['FLAME', 'FAILURE'], es: 'Fallo de llama', blink: true });
  const lHt = lamp({ color: 'red', label: ['HIGH', 'TEMP.'], es: 'Alta temperatura', blink: true });
  const lDoor = lamp({ color: 'white', label: ['DOOR', 'OPEN'], es: 'Puerta abierta' });
  const flue = readout({ label: 'Flue gas outlet', es: 'Salida de gases', unit: '°C', dec: 0 });
  const woT = readout({ label: 'Waste oil temperature', es: 'Temperatura del aceite residual', unit: '°C', dec: 0 });
  const rate = readout({ label: 'Waste oil feed rate', es: 'Dosificación de aceite residual', unit: '%', dec: 0 });
  const solid = readout({ label: 'Solid waste in chamber', es: 'Residuos sólidos en la cámara', unit: 'kg', dec: 0 });
  const woBtn = btn('WASTE OIL BURNER ON/OFF', 'Quemador de aceite residual', () => ctx.act('incWasteOil'));
  return {
    en: 'Incinerator control panel', es: 'Panel de control del incinerador',
    body: h('div', { class: 'fp-body' }, st,
      h('div', { class: 'panel-row' }, temp.el, lFan.el, lDo.el, lWo.el, lFl.el, lHt.el, lDoor.el),
      h('div', { class: 'row' }, btn('START', 'Arrancar (barrido + encendido)', () => ctx.act('incStart'), 'primary'), btn('STOP', 'Parar (enfriamiento)', () => ctx.act('incStop')), btn('RESET', 'Rearmar', () => ctx.act('incReset'))),
      h('div', { class: 'row' }, woBtn, btn('Feed −', 'Menos aceite', () => ctx.act('incWoRate', ctx.p().inc.woRate - 0.1)), btn('Feed +', 'Más aceite', () => ctx.act('incWoRate', ctx.p().inc.woRate + 0.1))),
      h('div', { class: 'row' }, btn('Open door', 'Abrir puerta', () => ctx.act('incDoor', true)), btn('Load batch (40 kg)', 'Cargar residuos (40 kg)', () => ctx.act('incLoad')), btn('Close door', 'Cerrar puerta', () => ctx.act('incDoor', false))),
      h('div', { class: 'readouts' }, flue.el, woT.el, rate.el, solid.el),
      h('p', { class: 'muted small' }, bi(`Sequence: pre-purge → ignition of the DO pilot burner → heat up. Waste oil burner only above ${WO_MIN_T} °C and with the oil heated (> 60 °C). Door interlocked while hot.`, `Secuencia: barrido → encendido del piloto de diésel → calentamiento. Quemador de aceite residual solo por encima de ${WO_MIN_T} °C y con el aceite caliente (> 60 °C). Puerta enclavada en caliente.`))),
    update(p) {
      const i = p.inc;
      const [en, es] = STATES[i.state];
      st.dataset.state = i.state === 'lockout' ? 'trip' : ['firing', 'purge', 'ignition'].includes(i.state) ? 'run' : 'stop';
      st.replaceChildren(h('strong', { lang: 'en' }, en), h('span', {}, ` · ${es}${i.state === 'purge' ? ` ${Math.max(0, 40 - i.timer).toFixed(0)} s` : ''}`));
      temp.set(i.T);
      lFan.set(p.c.incFan.run); lDo.set(i.doOn); lWo.set(i.woOn); lFl.set(i.lockout === 'flame'); lHt.set(i.lockout === 'hightemp' || i.T > 1050); lDoor.set(i.door);
      flue.set(i.flue); woT.set(p.c.incWo.temp, p.c.incWo.temp < 60); rate.set(i.woRate * 100); solid.set(i.solid);
      woBtn.classList.toggle('primary', i.wo);
    },
  };
});

// Cámara de combustión con llama y temperatura.
function chamber(ctx) {
  return (g) => {
    const x = 470, y = 170, w = 200, hh = 250;
    const body = svg('rect', { x, y, width: w, height: hh, rx: 14, class: 'mm-body' });
    const inner = svg('rect', { x: x + 18, y: y + 40, width: w - 36, height: hh - 70, rx: 8, style: 'fill: #3a2a26' });
    const flame = svg('path', { d: `M${x + 70} ${y + 200} q-30 -60 10 -110 q5 40 25 30 q10 -40 -5 -70 q60 50 30 150 Z`, style: 'fill: #ff9a1f; opacity: 0' });
    const wo = svg('path', { d: `M${x + 110} ${y + 200} q-20 -50 15 -90 q20 50 10 90 Z`, style: 'fill: #ff4d1f; opacity: 0' });
    const t = svgText(x + w / 2, y + 28, '', 'mm-val');
    const door = svg('rect', { x: x + w - 6, y: y + 120, width: 14, height: 70, rx: 2, class: 'mm-body' });
    g.append(body, inner, flame, wo, t, door, svgText(x + w / 2, y - 18, 'Combustion chamber', 'mm-label'), svgText(x + w / 2, y - 6, 'Cámara de combustión', 'mm-es'));
    g.append(svgText(x + w + 26, y + 160, 'Door', 'mm-es', 'start'));
    g.classList.add('mm-click');
    g.addEventListener('click', () => ctx.face('inc-panel'));
    return (p) => {
      const i = p.inc;
      t.textContent = `${i.T.toFixed(0)} °C`;
      const glow = Math.max(0, Math.min(1, (i.T - 300) / 700));
      inner.style.fill = `rgb(${58 + 170 * glow}, ${42 + 60 * glow}, ${38})`;
      flame.style.opacity = i.doOn ? 0.9 : 0;
      wo.style.opacity = i.woOn ? 0.95 : 0;
      door.setAttribute('x', i.door ? x + w + 6 : x + w - 6);
      g.dataset.state = i.state === 'lockout' ? 'alarm' : i.state === 'off' ? 'stop' : 'run';
    };
  };
}

export default {
  id: 'incinerator', en: 'Incinerator', es: 'Incinerador',
  render(ctx) {
    const sl = sludgeTank(ctx.p());
    const firing = (p) => p.inc.state === 'firing';
    const m = mimic([
      { t: 'tank', id: sl.id, x: 40, y: 330, w: 110, h: 120, en: 'Sludge tank', es: 'Tanque de lodos' },
      { t: 'pipe', d: 'M150 430 H195 M225 430 H260 V250 H280', fluid: 'hfo', on: (p) => p.c.incTp.run },
      { t: 'pump', id: 'incTp', x: 210, y: 430, r: 14, ly: -24, en: 'Sludge transfer pump', es: 'Bomba de trasiego de lodos' },
      { t: 'tank', id: 'incWo', x: 280, y: 200, w: 110, h: 130 },
      { t: 'motor', id: 'incHeat', x: 300, y: 380, w: 70, h: 36, icon: '♨', en: 'Tank heater', es: 'Calentador' },
      { t: 'value', x: 290, y: 160, w: 90, get: (p) => p.c.incWo.temp, unit: '°C', dec: 0, en: 'Waste oil temp.', es: 'Temp. aceite residual', warn: (p) => p.c.incWo.temp < 60 },
      { t: 'pipe', d: 'M390 300 H475', fluid: 'hfo', on: (p) => p.inc.woOn },
      { t: 'label', x: 432, y: 292, en: 'WO', es: '', size: 10 },
      { t: 'pipe', d: 'M390 360 H475', fluid: 'do', on: (p) => p.inc.doOn },
      { t: 'label', x: 432, y: 385, en: 'DO pilot', es: 'Piloto diésel', size: 10 },
      { t: 'custom', draw: chamber(ctx) },
      // Gases y ventilador
      { t: 'pipe', d: 'M570 170 V110 H760', fluid: 'air', on: (p) => p.c.incFan.run },
      { t: 'motor', id: 'incFan', x: 760, y: 88, w: 70, h: 44, icon: '✣', en: 'Flue gas fan', es: 'Ventilador de gases' },
      { t: 'pipe', d: 'M830 110 H900 V65', fluid: 'air', on: (p) => p.c.incFan.run },
      { t: 'label', x: 890, y: 62, en: 'To funnel', es: 'A la chimenea', size: 10, anchor: 'end' },
      { t: 'value', x: 770, y: 200, w: 110, get: (p) => p.inc.flue, unit: '°C', dec: 0, en: 'Flue gas outlet', es: 'Salida de gases', face: 'inc-panel' },
      { t: 'value', x: 770, y: 260, w: 140, get: (p) => STATES[p.inc.state][0], en: 'Sequence', es: 'Secuencia', warn: (p) => p.inc.state === 'lockout', face: 'inc-panel' },
      { t: 'value', x: 770, y: 320, w: 140, get: (p) => (p.inc.woOn ? `ON ${(p.inc.woRate * 100).toFixed(0)} %` : p.inc.T >= WO_MIN_T && firing(p) ? 'READY' : 'OFF'), en: 'Waste oil burner', es: 'Quemador de aceite residual', face: 'inc-panel' },
      { t: 'value', x: 770, y: 380, w: 140, get: (p) => p.inc.burned * 1000, unit: 'l', dec: 0, en: 'Sludge burned', es: 'Lodos quemados' },
      { t: 'box', x: 770, y: 450, w: 160, h: 60, en: 'Control panel', es: 'Panel de control', face: 'inc-panel', cls: 'lcp', size: 12,
        state: (p) => (p.inc.state === 'lockout' ? 'alarm' : firing(p) ? 'run' : 'ok') },
      { t: 'value', x: 40, y: 520, w: 150, get: (p) => (p.c.doServ ? p.c.doServ.level : NaN), unit: 'm³', en: 'DO service tank', es: 'Tanque de servicio de diésel', nav: 'fuel' },
    ], ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Tap the combustion chamber or the control panel to operate the incinerator.', 'Toca la cámara de combustión o el panel de control para manejar el incinerador.'))),
      update: m.update,
    };
  },
};
