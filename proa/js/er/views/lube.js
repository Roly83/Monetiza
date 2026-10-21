// Vista «Lubricating System»: aceite del motor principal (cárter, bombas de servicio/reserva, enfriador con
// válvula termostática, filtro automático) y depuradora de aceite.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { meter, readout, bi } from '../ui/widgets.js';
import { registerPurifierFace } from './purifier-view.js';

registerPurifierFace('melop');

registerFace('lo-filter', (ctx) => {
  const dp = meter({ unit: 'bar Δp', max: 2, labels: [[0, '0'], [0.5, '1'], [1, '2']], red: [0.5, 1], label: ['FILTER Δp'], es: 'Presión diferencial' });
  const fl = readout({ label: 'Back-flushes', es: 'Contralavados', dec: 0 });
  return {
    en: 'ME LO automatic back-flushing filter', es: 'Filtro automático de contralavado del aceite del MP',
    body: h('div', { class: 'fp-body' }, h('div', { class: 'panel-row' }, dp.el),
      h('div', { class: 'row' }, btn('BACK-FLUSH', 'Contralavado', () => ctx.act('loFilterFlush'), 'primary')), fl.el,
      h('p', { class: 'muted small' }, 'Se contralava solo a 0,5 bar. Una Δp alta reduce la presión de aceite al motor.')),
    update(p) { dp.set(p.lube.dp); fl.set(p.lube.flushes); },
  };
});

export default {
  id: 'lube', en: 'Lubricating System', es: 'Lubricación',
  render(ctx) {
    const flow = (p) => p.c.melp1.run || p.c.melp2.run;
    const L = (p) => p.lube;
    const m = mimic([
      { t: 'label', x: 500, y: 26, en: 'Main Engine Lubricating Oil System', es: 'Sistema de aceite lubricante del motor principal', size: 15 },
      // Aspiración del cárter
      { t: 'pipe', d: 'M260 440 H300 V330 H344', fluid: 'lo', on: (p) => p.c.melp1.run },
      { t: 'pipe', d: 'M300 440 V460 H344', fluid: 'lo', on: (p) => p.c.melp2.run },
      { t: 'pipe', d: 'M376 330 H420 V300 H480', fluid: 'lo', on: flow },
      { t: 'pipe', d: 'M376 460 H420 V330', fluid: 'lo', on: (p) => p.c.melp2.run },
      // Enfriador y bypass por la termostática
      { t: 'pipe', d: 'M540 300 H600', fluid: 'lo', on: (p) => flow(p) && p.c['tcv-melo'].pos > 0.02 },
      { t: 'pipe', d: 'M420 300 V230 H600 V300', fluid: 'lo', on: (p) => flow(p) && p.c['tcv-melo'].pos < 0.98 },
      { t: 'label', x: 510, y: 222, en: 'Cooler bypass', es: 'Bypass del enfriador', size: 9 },
      { t: 'pipe', d: 'M600 300 H660', fluid: 'lo', on: flow },
      { t: 'pipe', d: 'M730 300 H800', fluid: 'lo', on: flow },
      // Agua BT al enfriador
      { t: 'pipe', d: 'M490 420 V390', fluid: 'lt', on: (p) => (p.sig.ltFlow ?? 1) > 0.3 },
      { t: 'pipe', d: 'M530 390 V420', fluid: 'lt', on: (p) => (p.sig.ltFlow ?? 1) > 0.3 },
      { t: 'label', x: 510, y: 436, en: 'LT cooling water', es: 'Agua de refrigeración BT', size: 9 },
      // Retorno al cárter
      { t: 'pipe', d: 'M880 410 V545 H280 V480 H260', fluid: 'lo', on: flow },
      { t: 'label', x: 600, y: 537, en: 'Drain to sump tank', es: 'Retorno al cárter', size: 9 },
      // Depuradora
      { t: 'pipe', d: 'M100 380 V150 H170', fluid: 'lo', on: (p) => p.pur.melop.flow > 0 },
      { t: 'pipe', d: 'M240 150 H260 V380', fluid: 'lo', on: (p) => p.pur.melop.flow > 0 },
      // Equipos
      { t: 'tank', id: 'meSump', x: 60, y: 380, w: 200, h: 120, en: 'ME LO sump tank', es: 'Cárter del motor principal' },
      { t: 'pump', id: 'melp1', x: 360, y: 330, r: 18, en: 'LO pump No 1', es: 'Bomba de aceite nº 1' },
      { t: 'pump', id: 'melp2', x: 360, y: 460, r: 18, en: 'LO pump No 2', es: 'Bomba de aceite nº 2' },
      { t: 'hx', x: 480, y: 300, w: 60, h: 90, en: '', es: '' },
      { t: 'label', x: 510, y: 288, en: 'LO cooler', es: 'Enfriador', size: 10 },
      { t: 'valve', id: 'tcv-melo', x: 600, y: 270, vertical: true, en: 'TCV', es: 'termostática', lx: 0, ly: -16 },
      { t: 'box', x: 660, y: 275, w: 70, h: 50, en: 'Auto filter', es: 'Filtro auto.', face: 'lo-filter', size: 10, state: (p) => (L(p).dp > 1 ? 'alarm' : 'stop') },
      { t: 'box', x: 800, y: 240, w: 170, h: 170, en: 'Main Engine', es: 'Motor principal', ty: 24, nav: 'me', state: (p) => (p.sig.meRunning ? 'run' : 'stop') },
      { t: 'value', x: 830, y: 290, w: 110, get: (p) => L(p).press, unit: 'bar', dec: 2, warn: (p) => (p.c.melp1.cmd || p.c.melp2.cmd) && L(p).press < 2.2 },
      { t: 'value', x: 830, y: 330, w: 110, get: (p) => L(p).Tin, unit: '°C', warn: (p) => L(p).Tin > 55 },
      { t: 'label', x: 885, y: 380, en: 'Bearings, crossheads', es: 'Cojinetes y crucetas', size: 9 },
      { t: 'motor', id: 'melop', x: 170, y: 128, w: 70, h: 44, icon: '⏚', en: 'ME LO purifier', es: 'Depuradora de aceite' },
      { t: 'box', x: 830, y: 70, w: 140, h: 50, en: 'LO Transfer →', es: 'Trasiego de aceite', nav: 'lot', size: 12 },
      { t: 'box', x: 830, y: 140, w: 140, h: 50, en: 'LO purifier →', es: 'Depuradora de aceite', nav: 'melop', size: 12 },
      // Lecturas
      { t: 'value', x: 340, y: 100, w: 120, get: (p) => L(p).press, unit: 'bar', dec: 2, en: 'LO inlet pressure', es: 'Presión de entrada', warn: (p) => (p.c.melp1.cmd || p.c.melp2.cmd) && L(p).press < 2.2 },
      { t: 'value', x: 480, y: 100, w: 120, get: (p) => L(p).Tin, unit: '°C', en: 'LO inlet temp.', es: 'Temp. de entrada', warn: (p) => L(p).Tin > 55 },
      { t: 'value', x: 620, y: 100, w: 120, get: (p) => L(p).Ts, unit: '°C', en: 'LO outlet (sump) temp.', es: 'Temp. de salida (cárter)' },
      { t: 'value', x: 340, y: 160, w: 120, get: (p) => p.c['tcv-melo'].pos * 100, unit: '%', dec: 0, en: 'TCV to cooler', es: 'Termostática al enfriador' },
      { t: 'value', x: 480, y: 160, w: 120, get: (p) => L(p).dp, unit: 'bar', dec: 2, en: 'Filter Δp', es: 'Δp del filtro', face: 'lo-filter', warn: (p) => L(p).dp > 1 },
      { t: 'value', x: 620, y: 160, w: 120, get: (p) => p.c.meSump.water, unit: '% w', dec: 2, en: 'Water in oil', es: 'Agua en el aceite', warn: (p) => p.c.meSump.water > 0.2 },
      { t: 'value', x: 40, y: 585, w: 110, get: (p) => p.sig.ltTemp ?? 36, unit: '°C', en: 'LT water temp.', es: 'Temp. agua BT', nav: 'cooling' },
      { t: 'value', x: 160, y: 585, w: 110, get: (p) => (p.sig.meLoOk ? 'OK' : 'LOW'), en: 'ME LO status', es: 'Estado aceite MP', warn: (p) => !p.sig.meLoOk },
    ], ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Keep one pump running and the other on STANDBY (S). The TCV keeps the inlet at about 45 °C.', 'Deja una bomba en marcha y la otra en RESERVA (S). La termostática mantiene la entrada a unos 45 °C.'))), update: m.update };
  },
};
