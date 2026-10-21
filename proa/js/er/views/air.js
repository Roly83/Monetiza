// Vista «Compressed Air System»: compresores principales y de emergencia, botellas de aire de arranque con sus
// purgas, líneas de arranque al motor principal y a los generadores, aire de servicio y aire de control.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { meter, readout, bi, scale } from '../ui/widgets.js';

const op = (p, id) => Boolean(p.c[id]?.open) && !p.c[id]?.fault;
const loaded = (p, id) => Boolean(p.c[id]?.run && p.c[id]?.loaded);
const compState = (p, id) => {
  const c = p.c[id];
  const st = c.trip ? 'TRIP' : c.fault ? 'FAULT' : !c.run ? 'STOP' : c.loaded ? 'LOAD' : 'UNLOAD';
  return `${st} · ${c.auto ? 'AUTO' : 'MAN'}`;
};

// Ficha de cada botella: presión, agua condensada y purga.
for (const [id, drain] of [['mr1', 'v-mr1-drain'], ['mr2', 'v-mr2-drain'], ['emr', null]]) {
  registerFace(`air-${id}`, (ctx) => {
    const pr = meter({ unit: 'bar', max: 40, labels: scale(40, 10), red: [0, 15 / 40], label: ['RECEIVER', 'PRESSURE'], es: 'Presión de la botella' });
    const water = readout({ label: 'Condensate (water)', es: 'Agua condensada', unit: '%', dec: 0 });
    const dr = readout({ label: 'Drain valve', es: 'Válvula de purga', dec: 0 });
    const c = ctx.p().c[id];
    return {
      en: c.en, es: c.es,
      body: h('div', { class: 'fp-body' },
        h('div', { class: 'panel-row' }, pr.el),
        drain ? h('div', { class: 'readouts' }, water.el, dr.el) : null,
        drain ? h('div', { class: 'row' }, btn('OPEN DRAIN', 'Abrir purga', () => ctx.act('open', drain), 'primary'), btn('CLOSE DRAIN', 'Cerrar purga', () => ctx.act('close', drain))) : null,
        h('p', { class: 'muted small' }, 'Starting air receivers work at 25–30 bar. Drain the condensate regularly (each watch) and close the drain again: an open drain loses air. · Las botellas trabajan a 25–30 bar. Purga el agua condensada en cada guardia y vuelve a cerrar.')),
      update(p) {
        pr.set(p.c[id].press);
        if (drain) {
          water.set((p.airWater?.[id] ?? 0) * 100, (p.airWater?.[id] ?? 0) > 0.6);
          dr.set(p.c[drain].open ? 'OPEN · abierta' : 'CLOSED · cerrada', p.c[drain].open);
        }
      },
    };
  });
}

export default {
  id: 'air', en: 'Compressed Air System', es: 'Aire comprimido',
  render(ctx) {
    const m = mimic([
      // Descargas de los compresores
      { t: 'pipe', d: 'M150 95 H240 V120', fluid: 'air', on: (p) => loaded(p, 'mac1') },
      { t: 'pipe', d: 'M150 245 H240', fluid: 'air', on: (p) => loaded(p, 'mac2') },
      { t: 'pipe', d: 'M240 120 V300', fluid: 'air', on: (p) => loaded(p, 'mac1') || loaded(p, 'mac2') },
      { t: 'pipe', d: 'M240 120 H340', fluid: 'air', on: (p) => (loaded(p, 'mac1') || loaded(p, 'mac2')) && op(p, 'v-mac-mr1') },
      { t: 'pipe', d: 'M240 300 H340', fluid: 'air', on: (p) => (loaded(p, 'mac1') || loaded(p, 'mac2')) && op(p, 'v-mac-mr2') },
      { t: 'pipe', d: 'M150 475 H340', fluid: 'air', on: (p) => loaded(p, 'eac') && op(p, 'v-eac-emr') },
      // Purgas
      { t: 'pipe', d: 'M345 165 H310 V200', fluid: 'cond', on: (p) => op(p, 'v-mr1-drain') },
      { t: 'pipe', d: 'M345 355 H310 V390', fluid: 'cond', on: (p) => op(p, 'v-mr2-drain') },
      // Arranque del motor principal
      { t: 'pipe', d: 'M400 80 H720', fluid: 'air', on: (p) => op(p, 'v-mr1-me') || op(p, 'v-mr2-me') },
      { t: 'pipe', d: 'M400 270 H520 V80', fluid: 'air', on: (p) => op(p, 'v-mr2-me') },
      // Arranque de los generadores
      { t: 'pipe', d: 'M400 150 H620 V500 H720', fluid: 'air', on: (p) => op(p, 'v-mr1-dg') },
      { t: 'pipe', d: 'M400 500 H620', fluid: 'air', on: (p) => op(p, 'v-emr-dg') },
      // Aire de servicio y de control
      { t: 'pipe', d: 'M400 330 H720', fluid: 'air', on: (p) => op(p, 'v-service') },
      { t: 'pipe', d: 'M400 355 H560 V410 H720', fluid: 'air', on: (p) => op(p, 'v-control') },

      { t: 'motor', id: 'mac1', x: 60, y: 70, w: 90, h: 50, icon: '⊛', en: 'Main air compressor 1', es: 'Compresor principal 1' },
      { t: 'motor', id: 'mac2', x: 60, y: 220, w: 90, h: 50, icon: '⊛', en: 'Main air compressor 2', es: 'Compresor principal 2' },
      { t: 'motor', id: 'eac', x: 60, y: 450, w: 90, h: 50, icon: '⊛', en: 'Emergency air compressor (ESB)', es: 'Compresor de emergencia (ESB)' },
      { t: 'value', x: 45, y: 158, w: 120, get: (p) => compState(p, 'mac1'), face: 'mac1' },
      { t: 'value', x: 45, y: 308, w: 120, get: (p) => compState(p, 'mac2'), face: 'mac2' },
      { t: 'value', x: 45, y: 538, w: 120, get: (p) => compState(p, 'eac'), face: 'eac' },
      { t: 'valve', id: 'v-mac-mr1', x: 290, y: 120, s: 7 },
      { t: 'valve', id: 'v-mac-mr2', x: 290, y: 300, s: 7 },
      { t: 'valve', id: 'v-eac-emr', x: 250, y: 475, s: 7 },
      { t: 'receiver', id: 'mr1', x: 340, y: 50, w: 60, h: 125, face: 'air-mr1', en: 'Main air receiver 1', es: 'Botella principal 1' },
      { t: 'receiver', id: 'mr2', x: 340, y: 240, w: 60, h: 125, face: 'air-mr2', en: 'Main air receiver 2', es: 'Botella principal 2' },
      { t: 'receiver', id: 'emr', x: 340, y: 450, w: 60, h: 110, face: 'air-emr', en: 'Emergency air receiver', es: 'Botella de emergencia' },
      { t: 'valve', id: 'v-mr1-drain', x: 310, y: 200, vertical: true, s: 7, face: 'air-mr1', en: 'Drain', es: 'Purga', lx: -26, ly: 4 },
      { t: 'valve', id: 'v-mr2-drain', x: 310, y: 390, vertical: true, s: 7, face: 'air-mr2', en: 'Drain', es: 'Purga', lx: -26, ly: 4 },
      { t: 'valve', id: 'v-mr1-me', x: 460, y: 80, s: 7 },
      { t: 'valve', id: 'v-mr2-me', x: 520, y: 180, vertical: true, s: 7 },
      { t: 'valve', id: 'v-mr1-dg', x: 620, y: 220, vertical: true, s: 7 },
      { t: 'valve', id: 'v-emr-dg', x: 520, y: 500, s: 7 },
      { t: 'valve', id: 'v-service', x: 660, y: 330, s: 7 },
      { t: 'valve', id: 'v-control', x: 660, y: 410, s: 7 },
      { t: 'box', x: 720, y: 55, w: 200, h: 50, en: 'ME starting air', es: 'Aire de arranque del motor principal', nav: 'me', size: 11, ty: 20 },
      { t: 'value', x: 760, y: 115, w: 120, get: (p) => p.sig.meStartAir ?? 0, unit: 'bar', warn: (p) => (p.sig.meStartAir ?? 0) < 15 },
      { t: 'box', x: 720, y: 475, w: 200, h: 50, en: 'DG starting air', es: 'Aire de arranque de los generadores', nav: 'dg', size: 11, ty: 20 },
      { t: 'value', x: 760, y: 535, w: 120, get: (p) => p.sig.dgStartAir ?? 0, unit: 'bar', warn: (p) => (p.sig.dgStartAir ?? 0) < 10 },
      { t: 'box', x: 720, y: 310, w: 170, h: 40, en: 'Service air', es: 'Aire de servicio', size: 11, ty: 16 },
      { t: 'value', x: 900, y: 319, w: 80, get: (p) => p.sig.serviceAir ?? 0, unit: 'bar' },
      { t: 'box', x: 720, y: 390, w: 170, h: 40, en: 'Control air (dryer)', es: 'Aire de control (secador)', size: 11, ty: 16 },
      { t: 'value', x: 900, y: 399, w: 80, get: (p) => p.sig.controlAir ?? 0, unit: 'bar', warn: (p) => (p.sig.controlAir ?? 0) < 5 },
      { t: 'label', x: 460, y: 104, en: 'from 1', es: 'desde 1', size: 9 },
      { t: 'label', x: 548, y: 184, en: 'from 2', es: 'desde 2', size: 9, anchor: 'start' },
      { t: 'label', x: 640, y: 224, en: 'from 1', es: 'desde 1', size: 9, anchor: 'start' },
      { t: 'label', x: 520, y: 528, en: 'from emergency', es: 'desde emergencia', size: 9 },
    ], ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Compressors in AUTO load from 23–25 bar to 30 bar. Click a compressor to start/stop it or change AUTO/MANUAL, a receiver to drain it.', 'En AUTO los compresores cargan de 23–25 a 30 bar. Toca un compresor para arrancarlo o cambiar AUTO/MANUAL, y una botella para purgarla.'))),
      update: m.update,
    };
  },
};
