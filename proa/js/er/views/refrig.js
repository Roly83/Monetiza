// Vista «Refrigerating Plant»: gambuzas con termostato y solenoide, compresores con condensador
// refrigerado por agua BT y desescarche de las cámaras de congelados.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { lamp, readout, bi } from '../ui/widgets.js';
import { ROOMS } from '../model/hvac.js';

for (const r of ROOMS) {
  registerFace(`rf-room-${r.id}`, (ctx) => {
    const t = readout({ label: 'Room temperature', es: 'Temperatura de la cámara', unit: '°C' });
    const sp = readout({ label: 'Set point', es: 'Consigna', unit: '°C' });
    const frost = readout({ label: 'Evaporator ice', es: 'Hielo en el evaporador', unit: '%', dec: 0 });
    const sol = lamp({ color: 'green', label: ['SOLENOID OPEN'], es: 'Solenoide abierta' });
    const dfr = lamp({ color: 'amber', label: ['DEFROST'], es: 'Desescarche' });
    const hi = lamp({ color: 'red', label: ['HIGH TEMP.'], es: 'Temperatura alta', blink: true });
    return {
      en: `${r.en} thermostat`, es: `Termostato de la ${r.es.toLowerCase()}`,
      body: h('div', { class: 'fp-body' },
        h('div', { class: 'panel-row' }, sol.el, dfr.el, hi.el),
        h('div', { class: 'readouts' }, t.el, sp.el, frost.el),
        h('div', { class: 'row' },
          btn('SET −1 °C', 'Consigna −1', () => ctx.act('rfSetpoint', r.id, ctx.p().hvac.rooms[r.id].sp - 1)),
          btn('SET +1 °C', 'Consigna +1', () => ctx.act('rfSetpoint', r.id, ctx.p().hvac.rooms[r.id].sp + 1)),
          r.defrost ? btn('MANUAL DEFROST', 'Desescarche manual', () => ctx.act('rfDefrost', r.id)) : null),
        h('p', { class: 'muted small' }, bi(`High temperature alarm above ${r.high} °C.`, `Alarma de temperatura alta por encima de ${r.high} °C.`))),
      update(p) {
        const st = p.hvac.rooms[r.id];
        t.set(st.temp, st.temp > r.high); sp.set(st.sp); frost.set(st.frost * 100, st.frost > 0.6);
        sol.set(p.c[`rs-${r.id}`].open); dfr.set(st.defrostT > 0); hi.set(st.temp > r.high);
      },
    };
  });
}

export default {
  id: 'refrig', en: 'Refrigerating Plant', es: 'Planta frigorífica',
  render(ctx) {
    const comp = (p) => p.c.rcomp1.run || p.c.rcomp2.run;
    const els = [
      // Compresores y condensador
      { t: 'motor', id: 'rcomp1', x: 60, y: 90, w: 90, h: 50, icon: '⚙', en: 'Compressor No 1', es: 'Compresor nº 1' },
      { t: 'motor', id: 'rcomp2', x: 60, y: 210, w: 90, h: 50, icon: '⚙', en: 'Compressor No 2', es: 'Compresor nº 2' },
      { t: 'pipe', d: 'M150 115 H200 V235 M150 235 H200 M200 175 H250', fluid: 'ref', on: comp },
      { t: 'hx', x: 250, y: 130, w: 70, h: 100, en: 'Condenser', es: 'Condensador' },
      { t: 'pipe', d: 'M285 360 V230', fluid: 'lt', on: (p) => p.c['rf-cw'].open && (p.sig.ltFlow ?? 1) > 0.3 },
      { t: 'valve', id: 'rf-cw', x: 285, y: 320, vertical: true, en: 'LT cooling', es: 'Agua BT', lx: 50, ly: 4 },
      { t: 'label', x: 285, y: 385, en: 'LT FW system', es: 'Agua dulce BT', size: 9 },
      { t: 'value', x: 60, y: 330, w: 100, get: (p) => p.hvac.rf.hp, unit: 'bar', en: 'Discharge (HP)', es: 'Descarga (alta)', warn: (p) => p.hvac.rf.hp > 16 },
      { t: 'value', x: 60, y: 400, w: 100, get: (p) => p.hvac.rf.lp, unit: 'bar', en: 'Suction (LP)', es: 'Aspiración (baja)' },
      // Línea de líquido a las cámaras y aspiración de vuelta
      { t: 'pipe', d: 'M320 180 H380 V520 H940', fluid: 'ref', on: comp },
      { t: 'pipe', d: 'M940 80 H105 V90', fluid: 'cond', on: comp },
      { t: 'label', x: 600, y: 72, en: 'Suction line', es: 'Línea de aspiración', size: 9 },
      { t: 'label', x: 600, y: 545, en: 'Liquid line', es: 'Línea de líquido', size: 9 },
      { t: 'value', x: 60, y: 480, w: 120, get: (p) => p.sig.ltTemp ?? 36, unit: '°C', en: 'LT FW temperature', es: 'Temperatura agua BT', nav: 'cooling' },
    ];
    ROOMS.forEach((r, i) => {
      const x = 430 + (i % 2) * 270, y = 110 + Math.floor(i / 2) * 200;
      const st = (p) => p.hvac.rooms[r.id];
      els.push(
        { t: 'pipe', d: `M${x + 40} 520 V${y + 150}`, fluid: 'ref', on: (p) => p.c[`rs-${r.id}`].open && comp(p) },
        { t: 'pipe', d: `M${x + 200} ${y + 20} V80`, fluid: 'cond', on: (p) => p.c[`rs-${r.id}`].open && comp(p) },
        { t: 'box', x, y, w: 230, h: 150, en: r.en, es: r.es, ty: 24, face: `rf-room-${r.id}`,
          state: (p) => (st(p).temp > r.high ? 'alarm' : st(p).defrostT > 0 ? 'warn' : p.c[`rs-${r.id}`].open && comp(p) ? 'run' : 'stop') },
        { t: 'value', x: x + 15, y: y + 70, w: 95, get: (p) => st(p).temp, unit: '°C', en: 'Temp.', es: 'Temperatura', warn: (p) => st(p).temp > r.high, face: `rf-room-${r.id}` },
        { t: 'value', x: x + 120, y: y + 70, w: 95, get: (p) => st(p).sp, unit: '°C', dec: 0, en: 'Set point', es: 'Consigna', face: `rf-room-${r.id}` },
        { t: 'value', x: x + 120, y: y + 108, w: 95, get: (p) => (st(p).defrostT > 0 ? 'DEFROST' : p.c[`rs-${r.id}`].open ? 'COOLING' : 'OFF'), face: `rf-room-${r.id}` },
        { t: 'valve', id: `rs-${r.id}`, x: x + 40, y: y + 175, vertical: true, face: `rf-room-${r.id}`, en: 'Solenoid', es: 'Solenoide', lx: 46, ly: 4 },
      );
    });
    const m = mimic(els, ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click a room for its thermostat, a compressor to start/stop it or put it in standby.', 'Toca una cámara para ver su termostato, o un compresor para arrancarlo, pararlo o dejarlo en reserva.'))), update: m.update };
  },
};
