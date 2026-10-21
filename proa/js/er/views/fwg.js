// Vista «Freshwater Generator»: generador de agua dulce de vacío (evaporador calentado con agua de camisas,
// condensador refrigerado con agua de mar, eyector de aire/salmuera, bomba de destilado y salinómetro).
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { meter, lamp, readout, bi, scale } from '../ui/widgets.js';

const op = (p, id) => Boolean(p.c[id]?.open) && !p.c[id]?.fault;
const ej = (p) => p.c.fwgEj.run && op(p, 'v-fwg-suc');
const hot = (p) => p.fwg.hot;
const dist = (p) => p.c.fwgDp.run && p.fwg.prod > 0.5;

registerFace('fwg-panel', (ctx) => {
  const vac = meter({ unit: 'bar', min: -1, max: 0, labels: [[0, '-1'], [0.5, '-0.5'], [1, '0']], red: [0.2, 1], label: ['SHELL VACUUM'], es: 'Vacío en la carcasa' });
  const sal = meter({ unit: 'ppm', max: 40, labels: scale(40, 10), red: [0.25, 1], label: ['SALINOMETER'], es: 'Salinómetro' });
  const prod = meter({ unit: 't/day', max: 30, labels: scale(30, 10), label: ['PRODUCTION'], es: 'Producción' });
  const lHigh = lamp({ color: 'red', label: ['HIGH', 'SALINITY'], es: 'Salinidad alta', blink: true });
  const lTank = lamp({ color: 'green', label: ['TO FW', 'TANK'], es: 'A tanques' });
  const lDump = lamp({ color: 'amber', label: ['DUMP'], es: 'Descarga' });
  const tsat = readout({ label: 'Boiling temperature', es: 'Temperatura de ebullición', unit: '°C', dec: 1 });
  const heat = readout({ label: 'Heat from jacket water', es: 'Calor del agua de camisas', unit: 'kW', dec: 0 });
  const ht = readout({ label: 'Jacket water in', es: 'Entrada agua de camisas', unit: '°C', dec: 1 });
  const mode = readout({ label: 'Salinometer mode', es: 'Modo del salinómetro', dec: 0 });
  return {
    en: 'Freshwater generator control panel', es: 'Panel del generador de agua dulce',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row meters3' }, vac.el, sal.el, prod.el),
      h('div', { class: 'panel-row' }, lHigh.el, lTank.el, lDump.el),
      h('div', { class: 'readouts' }, tsat.el, heat.el, ht.el, mode.el),
      h('div', { class: 'row' }, btn('EJECTOR PUMP START', 'Arrancar bomba del eyector', () => ctx.act('start', 'fwgEj'), 'primary'), btn('EJECTOR PUMP STOP', 'Parar bomba del eyector', () => ctx.act('stop', 'fwgEj'))),
      h('div', { class: 'row' }, btn('DISTILLATE PUMP START', 'Arrancar bomba de destilado', () => ctx.act('start', 'fwgDp'), 'primary'), btn('DISTILLATE PUMP STOP', 'Parar bomba de destilado', () => ctx.act('stop', 'fwgDp'))),
      h('div', { class: 'row' }, btn('SALINOMETER AUTO', 'Salinómetro en AUTO', () => ctx.act('fwgSalMode', 'auto')), btn('FORCED DUMP', 'Descarga forzada', () => ctx.act('fwgSalMode', 'dump'))),
      h('p', { class: 'muted small' }, 'Start-up: sea suction and overboard open → ejector pump → air valve closed, wait for vacuum (≈ -0.9 bar) → feed water → hot water outlet and inlet valves → distillate pump. Below 10 ppm the solenoid valve sends the distillate to the FW tanks. Do not run it within 20 nm of the coast. · Arranque: aspiración y costado abiertos → bomba del eyector → rompevacío cerrado y esperar el vacío → agua de alimentación → válvulas de agua caliente → bomba de destilado.')),
    update(p) {
      const f = p.fwg;
      vac.set(f.vac); sal.set(f.ppm); prod.set(f.prod);
      lHigh.set(f.producing && f.ppm > 10); lTank.set(f.toTank && dist(p)); lDump.set(!f.toTank && dist(p));
      tsat.set(f.tSat ?? 100); heat.set(f.heat); ht.set(p.sig.htTemp ?? 0, f.hot && (p.sig.htTemp ?? 0) < 70);
      mode.set(f.mode === 'dump' ? 'FORCED DUMP · descarga' : 'AUTO');
    },
  };
});

export default {
  id: 'fwg', en: 'Freshwater Generator', es: 'Generador de agua dulce',
  render(ctx) {
    const m = mimic([
      // Agua de mar: bomba del eyector → condensador → eyector → costado; alimentación al evaporador.
      { t: 'pipe', d: 'M980 570 H776', fluid: 'sw', on: ej },
      { t: 'pipe', d: 'M744 570 H700 V40 H560 V110', fluid: 'sw', on: ej },
      { t: 'pipe', d: 'M460 110 V60 H200', fluid: 'sw', on: ej },
      { t: 'pipe', d: 'M100 60 H40 V200', fluid: 'sw', on: (p) => ej(p) && op(p, 'v-fwg-ovbd') },
      { t: 'pipe', d: 'M700 360 H630', fluid: 'sw', on: (p) => ej(p) && op(p, 'v-fwg-feed') },
      { t: 'pipe', d: 'M390 250 H150 V80', fluid: 'air', on: (p) => ej(p) && p.fwg.vac < -0.1 },
      { t: 'pipe', d: 'M590 70 V40', fluid: 'air', on: (p) => op(p, 'v-fwg-air') },
      // Agua de camisas
      { t: 'pipe', d: 'M30 360 H420', fluid: 'ht', on: hot },
      { t: 'pipe', d: 'M420 390 H300 V420 H30', fluid: 'ht', on: hot },
      // Destilado
      { t: 'pipe', d: 'M510 470 V504', fluid: 'fw', on: dist },
      { t: 'pipe', d: 'M510 536 V570 H340', fluid: 'fw', on: dist },
      { t: 'pipe', d: 'M230 570 H210', fluid: 'fw', on: dist },
      { t: 'pipe', d: 'M130 565 H90 V530 H20', fluid: 'fw', on: (p) => dist(p) && p.fwg.toTank && op(p, 'v-fwg-fillP') },
      { t: 'pipe', d: 'M90 565 V600 H20', fluid: 'fw', on: (p) => dist(p) && p.fwg.toTank && op(p, 'v-fwg-fillS') },
      { t: 'pipe', d: 'M170 590 V625 H230', fluid: 'bilge', on: (p) => dist(p) && !p.fwg.toTank },

      // Carcasa del generador
      { t: 'box', x: 390, y: 70, w: 240, h: 400, en: 'Fresh Water Generator', es: 'Generador de agua dulce (vacío)', ty: 20, face: 'fwg-panel',
        state: (p) => (p.alarms['fwg-vac-low']?.active || p.alarms['fwg-sal-high']?.active ? 'alarm' : p.fwg.prod > 1 ? 'run' : 'stop') },
      { t: 'hx', x: 420, y: 110, w: 180, h: 60, en: 'Condenser', es: 'Condensador', face: 'fwg-panel' },
      { t: 'label', x: 510, y: 215, en: 'Demister', es: 'Separador de gotas', size: 10 },
      { t: 'value', x: 450, y: 275, w: 120, get: (p) => p.fwg.vac, unit: 'bar', dec: 2, en: 'Shell vacuum', es: 'Vacío', warn: (p) => p.alarms['fwg-vac-low']?.active, face: 'fwg-panel' },
      { t: 'hx', x: 420, y: 330, w: 180, h: 70, en: 'Evaporator', es: 'Evaporador', face: 'fwg-panel' },
      { t: 'valve', id: 'v-fwg-air', x: 590, y: 52, vertical: true, s: 7, en: 'Air / vacuum breaker', es: 'Rompevacío', lx: 70, ly: 4 },
      { t: 'box', x: 100, y: 40, w: 100, h: 40, en: 'Ejector', es: 'Eyector', size: 11, ty: 16, state: (p) => (ej(p) ? 'run' : 'stop') },
      { t: 'valve', id: 'v-fwg-ovbd', x: 40, y: 170, vertical: true, en: 'Overboard', es: 'Al costado', lx: 0, ly: 46 },
      { t: 'pump', id: 'fwgEj', x: 760, y: 570, dir: 'left', en: 'Ejector pump', es: 'Bomba del eyector' },
      { t: 'valve', id: 'v-fwg-suc', x: 900, y: 570, en: 'Sea suction', es: 'Aspiración de mar' },
      { t: 'valve', id: 'v-fwg-feed', x: 665, y: 360, en: 'Feed water', es: 'Alimentación' },
      { t: 'valve', id: 'v-fwg-hwin', x: 250, y: 360, en: 'Hot water inlet', es: 'Entrada agua caliente', ly: -26 },
      { t: 'valve', id: 'v-fwg-hwout', x: 250, y: 420, en: 'Hot water outlet', es: 'Salida agua caliente' },
      { t: 'label', x: 30, y: 345, en: 'From ME jacket (HT)', es: 'Desde camisas del MP', size: 10, anchor: 'start' },
      { t: 'label', x: 30, y: 452, en: 'Return to HT system', es: 'Retorno al circuito AT', size: 10, anchor: 'start' },
      { t: 'pump', id: 'fwgDp', x: 510, y: 520, dir: 'down', en: 'Distillate pump', es: 'Bomba de destilado', lx: 70, ly: 4 },
      { t: 'box', x: 230, y: 550, w: 110, h: 40, en: 'Salinometer', es: 'Salinómetro', size: 11, ty: 16, face: 'fwg-panel', state: (p) => (p.fwg.producing && p.fwg.ppm > 10 ? 'alarm' : p.fwg.producing ? 'run' : 'stop') },
      { t: 'value', x: 240, y: 600, w: 90, get: (p) => p.fwg.ppm, unit: 'ppm', warn: (p) => p.fwg.producing && p.fwg.ppm > 10, face: 'fwg-panel' },
      { t: 'box', x: 130, y: 550, w: 80, h: 40, en: 'Solenoid', es: 'Electroválvula', size: 10, ty: 16, face: 'fwg-panel', state: (p) => (!dist(p) ? 'stop' : p.fwg.toTank ? 'run' : 'warn') },
      { t: 'valve', id: 'v-fwg-fillP', x: 50, y: 530, s: 7, en: 'To FW tank P', es: 'A tanque Br', ly: -12 },
      { t: 'valve', id: 'v-fwg-fillS', x: 50, y: 600, s: 7, en: 'To FW tank S', es: 'A tanque Er' },
      { t: 'label', x: 236, y: 640, en: 'Dump', es: 'Descarga', size: 9, anchor: 'start' },
      { t: 'value', x: 780, y: 300, w: 110, get: (p) => p.fwg.tSat ?? 100, unit: '°C', en: 'Boiling temperature', es: 'Temp. de ebullición' },
      { t: 'value', x: 780, y: 360, w: 110, get: (p) => p.fwg.prod, unit: 't/d', en: 'Production', es: 'Producción' },
      { t: 'value', x: 780, y: 420, w: 110, get: (p) => p.fwg.heat, unit: 'kW', dec: 0, en: 'Heat from HT', es: 'Calor del agua AT' },
      { t: 'value', x: 780, y: 480, w: 110, get: (p) => p.sig.fwTankPct ?? 0, unit: '%', dec: 0, en: 'FW tanks', es: 'Tanques agua dulce', nav: 'sanitary' },
      { t: 'value', x: 30, y: 290, w: 100, get: (p) => p.sig.htTemp ?? 0, unit: '°C', en: 'Jacket water', es: 'Agua de camisas', warn: (p) => p.fwg.hot && (p.sig.htTemp ?? 0) < 70, nav: 'cooling' },
      { t: 'value', x: 150, y: 290, w: 100, get: (p) => (p.sig.meRunning ? 'ME RUN' : 'ME STOP'), en: 'Main engine', es: 'Motor principal', nav: 'me' },
      { t: 'value', x: 780, y: 240, w: 110, get: (p) => p.env.seaDistanceNm ?? 30, unit: 'nm', dec: 0, en: 'Distance to coast', es: 'Distancia a costa', warn: (p) => (p.env.seaDistanceNm ?? 30) < 20 },
    ], ctx, { w: 1000, hgt: 660 });
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click the generator shell or the salinometer for the control panel.', 'Toca la carcasa o el salinómetro para abrir el panel de control.'))),
      update: m.update,
    };
  },
};
