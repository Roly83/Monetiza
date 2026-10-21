// Vista «AC Plant»: aire acondicionado de la habilitación con UTA (ventilador y batería de expansión
// directa), compresor con control de capacidad y condensador refrigerado por agua BT.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { lamp, readout, bi } from '../ui/widgets.js';

registerFace('ac-panel', (ctx) => {
  const t = readout({ label: 'Accommodation', es: 'Habilitación', unit: '°C' });
  const sp = readout({ label: 'Set point', es: 'Consigna', unit: '°C', dec: 0 });
  const sup = readout({ label: 'Supply air', es: 'Aire de impulsión', unit: '°C' });
  const cap = readout({ label: 'Compressor capacity', es: 'Capacidad del compresor', unit: '%', dec: 0 });
  const lF = lamp({ color: 'green', label: ['AHU FAN'], es: 'Ventilador UTA' });
  const lC = lamp({ color: 'green', label: ['COMPRESSOR'], es: 'Compresor' });
  const lT = lamp({ color: 'red', label: ['TRIP'], es: 'Disparo', blink: true });
  return {
    en: 'AC plant control panel', es: 'Panel del aire acondicionado',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, lF.el, lC.el, lT.el),
      h('div', { class: 'readouts' }, t.el, sp.el, sup.el, cap.el),
      h('div', { class: 'row' }, btn('SET −1 °C', 'Consigna −1', () => ctx.act('acSetpoint', ctx.p().hvac.ac.sp - 1)), btn('SET +1 °C', 'Consigna +1', () => ctx.act('acSetpoint', ctx.p().hvac.ac.sp + 1))),
      h('div', { class: 'row' }, btn('AHU FAN', 'Ventilador UTA', () => ctx.face('ahu')), btn('COMPRESSOR', 'Compresor', () => ctx.face('acc'))),
      h('p', { class: 'muted small' }, bi('Start the AHU fan before the compressor. The AC compressor is fed through the AC PLANT breaker, which opens on preferential trip.', 'Arranca el ventilador de la UTA antes que el compresor. El compresor se alimenta por el interruptor AC PLANT, que abre con el disparo preferente.'))),
    update(p) {
      const ac = p.hvac.ac;
      t.set(ac.temp, ac.temp > 28); sp.set(ac.sp); sup.set(ac.supply); cap.set(p.c.acc.run ? ac.cap * 100 : 0);
      lF.set(p.c.ahu.run); lC.set(p.c.acc.run); lT.set(p.c.acc.trip || p.c.acc.fault || p.c.ahu.fault);
    },
  };
});

export default {
  id: 'ac', en: 'AC Plant', es: 'Aire acondicionado',
  render(ctx) {
    const acOn = (p) => p.c.acc.run;
    const air = (p) => p.c.ahu.run;
    const els = [
      // UTA
      { t: 'box', x: 330, y: 70, w: 380, h: 170, en: 'Air handling unit (AHU)', es: 'Unidad de tratamiento de aire (UTA)', ty: 20, face: 'ac-panel' },
      { t: 'pipe', d: 'M60 160 H360', fluid: 'air', on: air },
      { t: 'label', x: 60, y: 145, en: 'Fresh / return air', es: 'Aire exterior / retorno', size: 10, anchor: 'start' },
      { t: 'hx', x: 390, y: 110, w: 70, h: 100, en: 'DX cooling coil', es: 'Batería de frío' },
      { t: 'motor', id: 'ahu', x: 560, y: 136, w: 80, h: 48, icon: '✣', en: 'AHU fan', es: 'Ventilador' },
      { t: 'pipe', d: 'M640 160 H800', fluid: 'air', on: air },
      { t: 'value', x: 718, y: 190, w: 76, get: (p) => p.hvac.ac.supply, unit: '°C', en: 'Supply air', es: 'Impulsión' },
      // Habilitación
      { t: 'box', x: 800, y: 70, w: 180, h: 240, en: 'Accommodation', es: 'Habilitación', ty: 24, face: 'ac-panel', state: (p) => (p.hvac.ac.temp > 28 ? 'alarm' : air(p) && acOn(p) ? 'run' : 'stop') },
      { t: 'value', x: 840, y: 145, w: 100, get: (p) => p.hvac.ac.temp, unit: '°C', en: 'Temperature', es: 'Temperatura', warn: (p) => p.hvac.ac.temp > 28, face: 'ac-panel' },
      { t: 'value', x: 840, y: 205, w: 100, get: (p) => p.hvac.ac.sp, unit: '°C', dec: 0, en: 'Set point', es: 'Consigna', face: 'ac-panel' },
      { t: 'value', x: 840, y: 265, w: 100, get: (p) => p.env.ambient, unit: '°C', dec: 0, en: 'Outside air', es: 'Aire exterior' },
      // Circuito frigorífico
      { t: 'pipe', d: 'M425 210 V380 H520', fluid: 'cond', on: acOn },
      { t: 'motor', id: 'acc', x: 520, y: 355, w: 100, h: 54, icon: '⚙', en: 'AC compressor', es: 'Compresor AC' },
      { t: 'pipe', d: 'M620 380 H720', fluid: 'ref', on: acOn },
      { t: 'hx', x: 720, y: 330, w: 70, h: 100, en: 'Condenser', es: 'Condensador' },
      { t: 'pipe', d: 'M755 430 V500 H440 V210', fluid: 'ref', on: acOn },
      { t: 'label', x: 600, y: 525, en: 'Liquid line / expansion valve', es: 'Línea de líquido / válvula de expansión', size: 9 },
      { t: 'pipe', d: 'M900 380 H790', fluid: 'lt', on: (p) => p.c['ac-cw'].open && (p.sig.ltFlow ?? 1) > 0.3 },
      { t: 'valve', id: 'ac-cw', x: 860, y: 380, en: 'LT cooling', es: 'Agua BT' },
      { t: 'label', x: 930, y: 420, en: 'LT FW', es: 'Agua BT', size: 9 },
      { t: 'value', x: 520, y: 465, w: 100, get: (p) => p.hvac.ac.hp, unit: 'bar', en: 'Discharge (HP)', es: 'Descarga (alta)', warn: (p) => p.hvac.ac.hp > 16 },
      { t: 'value', x: 60, y: 380, w: 120, get: (p) => (p.c.acc.run ? p.hvac.ac.cap * 100 : 0), unit: '%', dec: 0, en: 'Capacity', es: 'Capacidad', face: 'ac-panel' },
      { t: 'value', x: 60, y: 450, w: 120, get: (p) => (p.feeders['f-ac'].trip ? 'TRIPPED' : p.feeders['f-ac'].on ? 'ON' : 'OFF'), en: 'AC PLANT breaker', es: 'Interruptor del AC', warn: (p) => !p.feeders['f-ac'].on || p.feeders['f-ac'].trip, nav: 'msb' },
      { t: 'box', x: 60, y: 520, w: 160, h: 60, en: 'AC control panel', es: 'Panel del AC', face: 'ac-panel', state: (p) => (p.c.acc.trip || p.c.acc.fault || p.c.ahu.fault ? 'alarm' : acOn(p) ? 'run' : 'stop') },
    ];
    const m = mimic(els, ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click the AHU fan or the compressor to start/stop them; the panel shows temperatures and the set point.', 'Toca el ventilador de la UTA o el compresor para arrancarlos o pararlos; el panel muestra temperaturas y consigna.'))), update: m.update };
  },
};
