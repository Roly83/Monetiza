// Vista «Steam System»: caldera auxiliar con su panel de control del quemador, alimentación de agua,
// pozo caliente, economizador de gases de escape y consumidores de vapor.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { meter, knob, lamp, readout, bi, svg, svgText } from '../ui/widgets.js';
import { BURNER } from '../model/steam.js';

registerFace('blr-panel', (ctx) => {
  const st = statusLine();
  const mode = knob({ positions: [{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }], marks: ['AUTO', 'MAN'], label: ['CONTROL MODE'], es: 'Modo de control', onSelect: (v) => ctx.act('blrMode', v) });
  const fuel = knob({ positions: [{ value: 'DO', label: 'DO' }, { value: 'HFO', label: 'HFO' }], marks: ['DO', 'HFO'], label: ['BURNER FUEL'], es: 'Combustible del quemador', onSelect: (v) => ctx.act('blrFuel', v) });
  const pm = meter({ unit: 'bar', max: 12, labels: [[0, '0'], [0.5, '6'], [1, '12']], red: [0.75, 1], label: ['STEAM PRESS.'], es: 'Presión de vapor' });
  const lm = meter({ unit: '% level', max: 100, labels: [[0, '0'], [0.5, '50'], [1, '100']], red: [0, 0.15], label: ['WATER LEVEL'], es: 'Nivel de agua' });
  const L = [
    ['bfan', 'green', ['FD FAN'], 'Ventilador'], ['purge', 'white', ['PURGE'], 'Barrido'], ['ign', 'amber', ['IGNITION'], 'Encendido'],
    ['flame', 'green', ['FLAME'], 'Llama'], ['high', 'amber', ['HIGH', 'FIRE'], 'Llama alta'], ['lock', 'red', ['LOCKOUT'], 'Bloqueo'], ['llw', 'red', ['LOW-LOW', 'LEVEL'], 'Nivel muy bajo'],
  ].map(([k, color, label, es]) => [k, lamp({ color, label, es, blink: color === 'red' })]);
  const lamps = Object.fromEntries(L);
  const gen = readout({ label: 'Steam generation', es: 'Producción de vapor', unit: 'kg/h', dec: 0 });
  const cons = readout({ label: 'Steam consumption', es: 'Consumo de vapor', unit: 'kg/h', dec: 0 });
  const fl = readout({ label: 'Burner fuel', es: 'Combustible del quemador', unit: 'L/h', dec: 0 });
  const on = btn('BURNER ON/OFF', 'Quemador sí/no', () => ctx.act('blrBurner', !ctx.p().steam.on));
  return {
    en: 'Auxiliary boiler — burner control panel', es: 'Caldera auxiliar — panel de control del quemador',
    body: h('div', { class: 'fp-body' }, st.el,
      h('div', { class: 'panel-row' }, mode.el, fuel.el, ...L.map(([, l]) => l.el)),
      h('div', { class: 'panel-row' }, pm.el, lm.el),
      h('div', { class: 'row' }, on, btn('RESET', 'Rearmar', () => ctx.act('blrReset')), btn('START (MAN)', 'Arrancar (manual)', () => ctx.act('blrStart'), 'primary'), btn('STOP', 'Parar', () => ctx.act('blrStop'))),
      h('div', { class: 'row' }, btn('LOW FIRE', 'Llama baja', () => ctx.act('blrFire', 'low')), btn('HIGH FIRE', 'Llama alta', () => ctx.act('blrFire', 'high'))),
      h('div', { class: 'readouts' }, gen.el, cons.el, fl.el),
      h('p', { class: 'muted small' }, 'AUTO: enciende a 6,5 bar y apaga a 7,5 bar (llama alta por debajo de 6,8 bar). Secuencia: ventilador → barrido 30 s → encendido → detector de llama. Con la caldera fría usa diésel (DO): el HFO frío no se puede quemar.')),
    update(p) {
      const s = p.steam;
      const [en, es] = BURNER[s.burner];
      st.el.dataset.state = s.burner === 'lockout' ? 'trip' : s.flame ? 'run' : 'stop';
      st.el.replaceChildren(h('strong', { lang: 'en' }, `${en}${s.lockReason && s.burner === 'lockout' ? ` — ${s.lockReason.en}` : ''}${s.on ? '' : ' · BURNER OFF'}`),
        h('span', {}, ` · ${es}${s.lockReason && s.burner === 'lockout' ? ` — ${s.lockReason.es}` : ''}${s.on ? '' : ' · quemador desconectado'}`));
      mode.set(s.mode); fuel.set(s.fuel); pm.set(s.press); lm.set(s.level);
      lamps.bfan.set(p.c.bfan.run); lamps.purge.set(s.burner === 'purge' || s.burner === 'postpurge'); lamps.ign.set(s.burner === 'ignition');
      lamps.flame.set(s.flame); lamps.high.set(s.flame && s.burner === 'high'); lamps.lock.set(s.burner === 'lockout'); lamps.llw.set(s.level < 15);
      gen.set(s.gen); cons.set(s.cons); fl.set(s.fuelLh);
      on.classList.toggle('primary', s.on);
    },
  };
});

// Caldera con nivel de agua visible
function boiler(ctx) {
  return {
    t: 'custom',
    draw(g) {
      const x = 420, y = 110, w = 170, hh = 260;
      const shell = svg('rect', { x, y, width: w, height: hh, rx: 30, class: 'mm-body' });
      const water = svg('rect', { x: x + 4, y: y + hh, width: w - 8, height: 0, rx: 24, class: 'mm-fill fluid-fw' });
      const flame = svg('path', { d: `M${x + 60} ${y + hh - 30} Q${x + 85} ${y + hh - 110} ${x + 110} ${y + hh - 30} Z`, fill: '#ff8c1a', opacity: 0 });
      const p1 = svgText(x + w / 2, y + 40, '', 'mm-val');
      const p2 = svgText(x + w / 2, y + 58, '', 'mm-val');
      g.append(shell, water, flame, p1, p2, svgText(x + w / 2, y + 20, 'Auxiliary boiler', 'mm-label'));
      g.classList.add('mm-click');
      g.addEventListener('click', () => ctx.face('blr-panel'));
      return (p) => {
        const s = p.steam;
        const lh = (hh - 8) * (s.level / 100) * 0.7;
        water.setAttribute('y', y + hh - 4 - lh);
        water.setAttribute('height', lh);
        flame.setAttribute('opacity', s.flame ? (s.burner === 'high' ? 0.9 : 0.5) : 0);
        p1.textContent = `${s.press.toFixed(2)} bar`;
        p2.textContent = `${BURNER[s.burner][0]}`;
        g.dataset.state = s.burner === 'lockout' ? 'fault' : s.flame ? 'run' : 'stop';
      };
    },
  };
}

export default {
  id: 'steam', en: 'Steam System', es: 'Vapor',
  render(ctx) {
    const S = (p) => p.steam;
    const steamOn = (p) => S(p).press > 1 && p.c['v-stm-main'].open;
    const feeding = (p) => (p.c.bfp1.run || p.c.bfp2.run) && (p.c['v-blr-feed'].pos > 0.02 || p.c['v-blr-feedbyp'].open);
    const m = mimic([
      { t: 'label', x: 500, y: 26, en: 'Steam System — Auxiliary Boiler and Exhaust Gas Economizer', es: 'Sistema de vapor — caldera auxiliar y economizador', size: 15 },
      // Vapor
      { t: 'pipe', d: 'M505 110 V80 H930', fluid: 'steam', on: steamOn },
      ...[['Tank heat.', 'Tanques', 'fuel'], ['FO heater', 'Calent. FO', 'fcm'], ['Purifiers', 'Depuradoras', 'hfo1'], ['Accomm.', 'Habilitación', 'cooling']]
        .flatMap(([en, es, nav], i) => [
          { t: 'pipe', d: `M${700 + i * 75} 80 V120`, fluid: 'steam', on: steamOn },
          { t: 'box', x: 668 + i * 75, y: 120, w: 68, h: 54, en, es, nav, size: 10 },
        ]),
      { t: 'label', x: 815, y: 192, en: 'Steam consumers', es: 'Consumidores de vapor', size: 10 },
      // Descarga (dump) al condensador → pozo caliente
      { t: 'pipe', d: 'M640 80 V60 H120 V430', fluid: 'cond', on: (p) => S(p).dump > 10 },
      { t: 'label', x: 300, y: 76, en: 'Steam dump → condenser → hot well', es: 'Descarga de vapor → condensador → pozo caliente', size: 9 },
      { t: 'pipe', d: 'M930 210 V420 H150', fluid: 'cond', on: (p) => S(p).cons > 50 },
      { t: 'label', x: 780, y: 412, en: 'Condensate return', es: 'Retorno de condensado', size: 9 },
      // Alimentación
      { t: 'pipe', d: 'M150 510 V560 H234', fluid: 'cond', on: (p) => p.c.bfp2.run },
      { t: 'pipe', d: 'M150 510 V480 H234', fluid: 'cond', on: (p) => p.c.bfp1.run },
      { t: 'pipe', d: 'M266 480 H330 V470 H460 V370', fluid: 'fw', on: feeding },
      { t: 'pipe', d: 'M266 560 H330 V480', fluid: 'fw', on: (p) => p.c.bfp2.run },
      { t: 'pipe', d: 'M330 470 V530 H420 V470', fluid: 'fw', on: (p) => feeding(p) && p.c['v-blr-feedbyp'].open },
      { t: 'pipe', d: 'M40 400 H95 V430', fluid: 'fw', on: (p) => p.c['v-hw-makeup'].open && p.c.hotwell.level < 0.65 * p.c.hotwell.cap },
      { t: 'label', x: 108, y: 396, en: 'FW make-up', es: 'Reposición de agua', size: 9, anchor: 'start' },
      // Combustible del quemador
      { t: 'pipe', d: 'M250 300 H330', fluid: 'do', on: (p) => S(p).flame },
      { t: 'label', x: 250, y: 290, en: 'Fuel', es: 'Combustible', size: 9, anchor: 'start' },
      // Purga (extracción)
      { t: 'pipe', d: 'M560 370 V400', fluid: 'bilge', on: (p) => p.c['v-blr-blowdown'].open },
      // Economizador
      { t: 'pipe', d: 'M590 200 H640 V470 H700', fluid: 'fw', on: (p) => p.c.egcp.run },
      { t: 'pipe', d: 'M780 445 V420 H600 V160 H590', fluid: 'steam', on: (p) => S(p).ege > 10 },
      // Equipos
      boiler(ctx),
      { t: 'box', x: 330, y: 280, w: 80, h: 44, en: 'Burner', es: 'Quemador', face: 'blr-panel', size: 11, state: (p) => (S(p).burner === 'lockout' ? 'alarm' : S(p).flame ? 'run' : 'stop') },
      { t: 'motor', id: 'bfan', x: 330, y: 200, w: 70, h: 40, icon: '✣', en: 'FD fan', es: 'Ventilador' },
      { t: 'box', x: 200, y: 140, w: 110, h: 44, en: 'Control panel', es: 'Panel de control', face: 'blr-panel', cls: 'lcp', size: 11 },
      { t: 'valve', id: 'v-stm-main', x: 560, y: 80, en: 'Main stop', es: 'Válvula principal', ly: -14 },
      { t: 'tank', id: 'hotwell', x: 40, y: 430, w: 110, h: 100, en: 'Hot well', es: 'Pozo caliente' },
      { t: 'pump', id: 'bfp1', x: 250, y: 480, en: 'Feed pump No 1', es: 'Bomba alimentación nº 1', ly: -24 },
      { t: 'pump', id: 'bfp2', x: 250, y: 560, en: 'Feed pump No 2', es: 'Bomba alimentación nº 2' },
      { t: 'valve', id: 'v-blr-feed', x: 380, y: 470, en: 'Feed control', es: 'Control alimentación', ly: -14 },
      { t: 'valve', id: 'v-blr-feedbyp', x: 375, y: 530, en: 'Bypass', es: 'Bypass', ly: 22 },
      { t: 'valve', id: 'v-hw-makeup', x: 70, y: 400, en: '', es: '' },
      { t: 'valve', id: 'v-blr-blowdown', x: 560, y: 395, vertical: true, en: 'Blow-down', es: 'Extracción', lx: 46, ly: 0 },
      { t: 'pump', id: 'egcp', x: 660, y: 500, ly: 30, en: 'EGE circ. pump', es: 'Bomba del economizador' },
      { t: 'box', x: 700, y: 445, w: 160, h: 60, en: 'Exhaust gas economizer', es: 'Economizador de gases', nav: 'me', size: 10, state: (p) => (S(p).ege > 10 ? 'run' : 'stop') },
      // Lecturas
      { t: 'value', x: 880, y: 250, w: 100, get: (p) => S(p).press, unit: 'bar', dec: 2, en: 'Steam pressure', es: 'Presión de vapor', face: 'blr-panel', warn: (p) => S(p).press < 5 || S(p).press > 8.5 },
      { t: 'value', x: 880, y: 300, w: 100, get: (p) => S(p).level, unit: '%', dec: 0, en: 'Water level', es: 'Nivel de agua', face: 'blr-panel', warn: (p) => S(p).level < 30 || S(p).level > 80 },
      { t: 'value', x: 880, y: 350, w: 100, get: (p) => S(p).gen + S(p).ege, unit: 'kg/h', dec: 0, en: 'Steam generated', es: 'Vapor producido' },
      { t: 'value', x: 700, y: 250, w: 100, get: (p) => S(p).cons, unit: 'kg/h', dec: 0, en: 'Consumption', es: 'Consumo' },
      { t: 'value', x: 700, y: 300, w: 100, get: (p) => S(p).ege, unit: 'kg/h', dec: 0, en: 'Economizer', es: 'Economizador' },
      { t: 'value', x: 700, y: 350, w: 100, get: (p) => S(p).salinity, unit: 'ppm', dec: 0, en: 'Salinity', es: 'Salinidad', warn: (p) => S(p).salinity > 200 },
      { t: 'value', x: 880, y: 540, w: 100, get: (p) => S(p).dump, unit: 'kg/h', dec: 0, en: 'Dump to condenser', es: 'Descarga a condensador' },
    ], ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click the boiler or its control panel to operate the burner.', 'Toca la caldera o su panel de control para manejar el quemador.'))), update: m.update };
  },
};
