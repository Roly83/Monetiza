// Vista «Sanitary Water System»: tanques de agua dulce, bombas e hidróforo, calorífero (agua caliente) y consumo
// de la habilitación.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { meter, readout, bi, scale } from '../ui/widgets.js';

const op = (p, id) => Boolean(p.c[id]?.open) && !p.c[id]?.fault;
const pumping = (p) => (p.c.hyd1.run || p.c.hyd2.run) && (op(p, 'v-fwP-out') || op(p, 'v-fwS-out'));
const supply = (p) => op(p, 'v-hyd-out') && p.san.press > 0.5;

registerFace('hyd-panel', (ctx) => {
  const pr = meter({ unit: 'bar', max: 8, labels: scale(8, 2), red: [0, 0.25], label: ['HYDROPHORE', 'PRESSURE'], es: 'Presión del hidróforo' });
  const lead = readout({ label: 'Lead pump', es: 'Bomba principal', dec: 0 });
  const air = readout({ label: 'Air cushion', es: 'Colchón de aire', unit: '%', dec: 0 });
  const lvl = readout({ label: 'Water level', es: 'Nivel de agua', unit: '%', dec: 0 });
  const use = readout({ label: 'Consumption', es: 'Consumo', unit: 't/day', dec: 1 });
  const modeBtn = (id) => btn(`${id === 'hyd1' ? 'PUMP 1' : 'PUMP 2'} AUTO / MAN`, `Bomba ${id === 'hyd1' ? '1' : '2'}: automático / manual`, () => ctx.act('compAuto', id, !ctx.p().c[id].auto));
  const b1 = modeBtn('hyd1'), b2 = modeBtn('hyd2');
  return {
    en: 'Hydrophore control', es: 'Control del hidróforo',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, pr.el),
      h('div', { class: 'readouts' }, lead.el, air.el, lvl.el, use.el),
      h('div', { class: 'row' }, btn('LEAD: PUMP 1', 'Principal: bomba 1', () => ctx.act('hydLead', 'hyd1')), btn('LEAD: PUMP 2', 'Principal: bomba 2', () => ctx.act('hydLead', 'hyd2'))),
      h('div', { class: 'row' }, b1, b2),
      h('div', { class: 'row' }, btn('CHARGE AIR CUSHION', 'Cargar colchón de aire (aire de servicio)', () => ctx.act('hydAirCharge'), 'primary')),
      h('p', { class: 'muted small' }, 'Pressure switch: lead pump starts at 3 bar and stops at 5 bar; the other pump starts below 2.6 bar. If the tank becomes waterlogged (no air cushion) the pumps cycle very fast: recharge the air. · Presostato: la principal arranca a 3 bar y para a 5 bar; la otra arranca por debajo de 2,6 bar.')),
    update(p) {
      const s = p.san;
      pr.set(s.press);
      lead.set(s.lead === 'hyd1' ? 'No 1' : 'No 2');
      air.set(Math.min(100, (100 * s.air) / 6), s.air < 4);
      lvl.set((100 * p.c.hydTank.level) / p.c.hydTank.cap);
      use.set(s.demand * 86400);
      for (const [b, id] of [[b1, 'hyd1'], [b2, 'hyd2']]) b.querySelector('small').textContent = p.c[id].auto ? 'AUTO (presostato)' : 'MANUAL';
    },
  };
});

export default {
  id: 'sanitary', en: 'Sanitary Water System', es: 'Agua sanitaria',
  render(ctx) {
    const m = mimic([
      { t: 'pipe', d: 'M105 20 V60', fluid: 'fw', on: (p) => p.fwg.toTank && p.c.fwgDp.run && op(p, 'v-fwg-fillP') },
      { t: 'pipe', d: 'M105 330 V310 H20', fluid: 'fw', on: (p) => p.fwg.toTank && p.c.fwgDp.run && op(p, 'v-fwg-fillS') },
      { t: 'pipe', d: 'M170 180 H270', fluid: 'fw', on: (p) => pumping(p) && op(p, 'v-fwP-out') },
      { t: 'pipe', d: 'M170 450 H270', fluid: 'fw', on: (p) => pumping(p) && op(p, 'v-fwS-out') },
      { t: 'pipe', d: 'M270 180 V450 M270 250 H314 M270 340 H314', fluid: 'fw', on: pumping },
      { t: 'pipe', d: 'M346 250 H400 M346 340 H400 M400 250 V340 M400 300 H440', fluid: 'fw', on: pumping },
      { t: 'pipe', d: 'M485 200 V130 H560', fluid: 'air', on: () => false },
      { t: 'pipe', d: 'M530 300 H640 V410 H700', fluid: 'fw', on: supply },
      { t: 'pipe', d: 'M640 300 V200 H850', fluid: 'fw', on: supply },
      { t: 'pipe', d: 'M800 400 H850', fluid: 'ht', on: supply },
      { t: 'pipe', d: 'M610 500 H700', fluid: 'steam', on: (p) => op(p, 'v-cal-steam') && (p.sig.steamAvail ?? 1) > 0.3 },
      { t: 'label', x: 105, y: 14, en: 'From FWG', es: 'Desde el generador', size: 9 },
      { t: 'label', x: 20, y: 300, en: 'From FWG', es: 'Desde el generador', size: 9, anchor: 'start' },
      { t: 'tank', id: 'fwTankP', x: 40, y: 60, w: 130, h: 180 },
      { t: 'tank', id: 'fwTankS', x: 40, y: 330, w: 130, h: 180 },
      { t: 'valve', id: 'v-fwP-out', x: 220, y: 180, en: 'Outlet P', es: 'Salida Br' },
      { t: 'valve', id: 'v-fwS-out', x: 220, y: 450, en: 'Outlet S', es: 'Salida Er' },
      { t: 'pump', id: 'hyd1', x: 330, y: 250, en: 'Hydrophore pump 1', es: 'Bomba hidróforo 1' },
      { t: 'pump', id: 'hyd2', x: 330, y: 340, en: 'Hydrophore pump 2', es: 'Bomba hidróforo 2' },
      { t: 'tank', id: 'hydTank', x: 440, y: 200, w: 90, h: 170, face: 'hyd-panel' },
      { t: 'value', x: 437, y: 425, w: 96, get: (p) => p.san.press, unit: 'bar', en: 'Pressure', es: 'Presión', warn: (p) => p.alarms['san-hyd-low']?.active, face: 'hyd-panel' },
      { t: 'label', x: 565, y: 125, en: 'Service air', es: 'Aire de servicio', size: 9, anchor: 'start' },
      { t: 'box', x: 470, y: 100, w: 30, h: 22, en: '', es: '', face: 'hyd-panel' },
      { t: 'value', x: 410, y: 40, w: 130, get: (p) => `${p.san.lead === 'hyd1' ? 'No 1' : 'No 2'} · ${p.c[p.san.lead].auto ? 'AUTO' : 'MAN'}`, en: 'Lead pump', es: 'Bomba principal', face: 'hyd-panel' },
      { t: 'valve', id: 'v-hyd-out', x: 585, y: 300, en: 'Outlet', es: 'Salida' },
      { t: 'tank', id: 'calorifier', x: 700, y: 360, w: 100, h: 120, en: 'Calorifier', es: 'Calorífero (agua caliente)' },
      { t: 'value', x: 702, y: 280, w: 96, get: (p) => p.c.calorifier.temp, unit: '°C', en: 'Hot water temp.', es: 'Temp. agua caliente', warn: (p) => p.alarms['san-cal-low']?.active },
      { t: 'motor', id: 'calHeater', x: 715, y: 520, w: 70, h: 40, icon: '⚡', en: 'Electric heater', es: 'Resistencia eléctrica' },
      { t: 'valve', id: 'v-cal-steam', x: 650, y: 500, en: 'Steam', es: 'Vapor' },
      { t: 'box', x: 850, y: 170, w: 130, h: 60, en: 'Cold water', es: 'Agua fría habilitación', nav: 'ac', size: 11, state: (p) => (supply(p) ? 'run' : 'stop') },
      { t: 'box', x: 850, y: 370, w: 130, h: 60, en: 'Hot water', es: 'Agua caliente habilitación', size: 11, state: (p) => (supply(p) && p.c.calorifier.temp > 45 ? 'run' : 'stop') },
      { t: 'value', x: 865, y: 270, w: 100, get: (p) => p.san.demand * 86400, unit: 't/d', en: 'Consumption', es: 'Consumo' },
      { t: 'value', x: 865, y: 480, w: 100, get: (p) => p.sig.fwTankPct ?? 0, unit: '%', dec: 0, en: 'FW tanks total', es: 'Total tanques', warn: (p) => (p.sig.fwTankPct ?? 50) < 15 },
      { t: 'value', x: 865, y: 540, w: 100, get: (p) => p.sig.fwgProduction ?? 0, unit: 't/d', en: 'FWG production', es: 'Producción FWG', nav: 'fwg' },
    ], ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click the hydrophore tank for the pressure switch panel; pumps open their own faceplate (AUTO / MANUAL).', 'Toca el hidróforo para el panel del presostato; las bombas abren su ficha (AUTO / MANUAL).'))),
      update: m.update,
    };
  },
};
