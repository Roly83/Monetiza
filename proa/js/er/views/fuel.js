// Vista «Fuel System»: almacén, trasiego, sedimentación, depuradoras, servicio de HFO y diésel, lodos,
// suministro a los generadores y al módulo de acondicionamiento (FCM).
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { bi } from '../ui/widgets.js';
import { purState } from '../model/fuel.js';
import { registerPurifierFace } from './purifier-view.js';

registerPurifierFace('hfop1');
registerPurifierFace('hfop2');

const sep = (id) => (p) => purState(p, id) === 'separating';
const open = (id) => (p) => p.c[id].open;

export default {
  id: 'fuel', en: 'Fuel System', es: 'Combustible',
  render(ctx) {
    const hfotpFlow = (p) => p.c.hfotp.run && (p.c['v-hfost1'].open || p.c['v-hfost2'].open) && p.c['v-hfotp-sett'].open && !p.sig.qcvTripped;
    const dotpFlow = (p) => p.c.dotp.run && p.c['v-dost'].open && p.c['v-dotp-serv'].open && !p.sig.qcvTripped;
    const m = mimic([
      { t: 'label', x: 40, y: 30, en: 'HFO', es: 'Fuelóleo pesado', size: 14, anchor: 'start' },
      { t: 'label', x: 40, y: 340, en: 'DO / MGO', es: 'Diésel', size: 14, anchor: 'start' },
      // Trasiego de HFO
      { t: 'pipe', d: 'M95 170 V230 H314', fluid: 'hfo', on: (p) => hfotpFlow(p) && p.c['v-hfost1'].open },
      { t: 'pipe', d: 'M225 170 V230', fluid: 'hfo', on: (p) => hfotpFlow(p) && p.c['v-hfost2'].open },
      { t: 'pipe', d: 'M346 230 H440 V210', fluid: 'hfo', on: hfotpFlow },
      // Sedimentación → depuradoras → servicio
      { t: 'pipe', d: 'M530 180 H555 V102 H570', fluid: 'hfo', on: sep('hfop1') },
      { t: 'pipe', d: 'M555 180 V192 H570', fluid: 'hfo', on: sep('hfop2') },
      { t: 'pipe', d: 'M640 102 H690 V120 H720', fluid: 'hfo', on: sep('hfop1') },
      { t: 'pipe', d: 'M640 192 H690 V120', fluid: 'hfo', on: sep('hfop2') },
      // Rebose del servicio a la sedimentación
      { t: 'pipe', d: 'M760 60 V44 H490 V60', fluid: 'hfo', on: (p) => p.c.hfoServ.level >= 0.969 * p.c.hfoServ.cap && (sep('hfop1')(p) || sep('hfop2')(p)) },
      { t: 'label', x: 625, y: 38, en: 'Overflow', es: 'Rebose', size: 9 },
      // Servicio de HFO → FCM
      { t: 'pipe', d: 'M830 120 H880', fluid: 'hfo', on: (p) => p.fuel.fcm.co === 'HFO' && p.fuel.fcm.supplyP > 2 },
      // Vapor de calefacción
      { t: 'pipe', d: 'M420 275 H800', fluid: 'steam', on: (p) => (p.sig.steamAvail ?? 1) > 0.1 },
      { t: 'pipe', d: 'M475 275 V212', fluid: 'steam', on: (p) => open('v-sett-heat')(p) && (p.sig.steamAvail ?? 1) > 0.1 },
      { t: 'pipe', d: 'M775 275 V212', fluid: 'steam', on: (p) => open('v-serv-heat')(p) && (p.sig.steamAvail ?? 1) > 0.1 },
      { t: 'label', x: 806, y: 279, en: 'Steam', es: 'Vapor', size: 10, anchor: 'start' },
      // Purga de la sedimentación y lodos de las depuradoras
      { t: 'pipe', d: 'M510 212 V245 H700 V445 H720', fluid: 'bilge', on: open('v-sett-drain') },
      { t: 'pipe', d: 'M605 214 V250 H700', fluid: 'bilge', on: (p) => Boolean(p.pur.hfop1.disch || p.pur.hfop2.disch) },
      // Diésel
      { t: 'pipe', d: 'M100 490 V545 H234', fluid: 'do', on: dotpFlow },
      { t: 'pipe', d: 'M266 545 H385 V492', fluid: 'do', on: dotpFlow },
      { t: 'pipe', d: 'M440 450 H520', fluid: 'do', on: (p) => p.sig.dgFuelOk && (p.sig.dgKw ?? []).some((k) => k > 0) },
      { t: 'pipe', d: 'M440 390 H600 V300 H930 V150', fluid: 'do', on: (p) => p.fuel.fcm.co === 'DO' && p.fuel.fcm.supplyP > 2 },
      { t: 'pipe', d: 'M440 420 H560 V560 H600', fluid: 'do', on: (p) => p.steam?.flame && p.steam.fuel === 'DO' },
      // Equipos
      { t: 'tank', id: 'hfoStor1', x: 40, y: 60, w: 110, h: 110, en: 'HFO storage No 1', es: 'Almacén HFO nº 1' },
      { t: 'tank', id: 'hfoStor2', x: 170, y: 60, w: 110, h: 110, en: 'HFO storage No 2', es: 'Almacén HFO nº 2' },
      { t: 'valve', id: 'v-hfost1', x: 160, y: 230, en: '', es: '' },
      { t: 'valve', id: 'v-hfost2', x: 225, y: 213, vertical: true, en: '', es: '' },
      { t: 'pump', id: 'hfotp', x: 330, y: 230, ly: 30 },
      { t: 'valve', id: 'v-hfotp-sett', x: 395, y: 230, en: '', es: '' },
      { t: 'tank', id: 'hfoSett', x: 420, y: 60, w: 110, h: 150, en: 'HFO settling tank', es: 'Sedimentación HFO' },
      { t: 'motor', id: 'hfop1', x: 570, y: 80, w: 70, h: 44, icon: '⏚', en: 'HFO purifier No 1', es: 'Depuradora HFO nº 1' },
      { t: 'motor', id: 'hfop2', x: 570, y: 170, w: 70, h: 44, icon: '⏚', en: 'HFO purifier No 2', es: 'Depuradora HFO nº 2' },
      { t: 'tank', id: 'hfoServ', x: 720, y: 60, w: 110, h: 150, en: 'HFO service tank', es: 'Servicio diario HFO' },
      { t: 'valve', id: 'v-sett-heat', x: 475, y: 260, vertical: true, en: '', es: '' },
      { t: 'valve', id: 'v-serv-heat', x: 775, y: 260, vertical: true, en: '', es: '' },
      { t: 'valve', id: 'v-sett-drain', x: 690, y: 245, en: 'Water drain', es: 'Purga de agua', ly: 16 },
      { t: 'valve', id: 'v-fcm-hfo', x: 856, y: 120, en: 'QCV', es: 'c. rápido', ly: -26 },
      { t: 'box', x: 880, y: 90, w: 100, h: 60, en: 'FCM →', es: 'Acondicionamiento', nav: 'fcm', state: (p) => (p.sig.meFuelOk ? 'run' : 'stop') },
      { t: 'tank', id: 'doStor', x: 40, y: 360, w: 120, h: 130, en: 'DO storage tank', es: 'Almacén de diésel' },
      { t: 'valve', id: 'v-dost', x: 165, y: 545, en: '', es: '' },
      { t: 'pump', id: 'dotp', x: 250, y: 545, ly: 30 },
      { t: 'valve', id: 'v-dotp-serv', x: 320, y: 545, en: '', es: '' },
      { t: 'tank', id: 'doServ', x: 330, y: 360, w: 110, h: 130, en: 'DO service tank', es: 'Servicio diario de diésel' },
      { t: 'valve', id: 'v-do-dg', x: 485, y: 450, en: 'To DGs', es: 'A los DG', ly: -14 },
      { t: 'box', x: 520, y: 425, w: 110, h: 50, en: 'Diesel gens →', es: 'Generadores', nav: 'dg', size: 11, state: (p) => (p.sig.dgFuelOk ? 'run' : 'alarm') },
      { t: 'valve', id: 'v-fcm-do', x: 600, y: 345, vertical: true, en: 'QCV', es: 'cierre rápido', lx: 30, ly: 0 },
      { t: 'box', x: 600, y: 540, w: 100, h: 44, en: 'Boiler burner', es: 'Quemador caldera', nav: 'steam', size: 10, state: (p) => (p.steam?.flame ? 'run' : 'stop') },
      { t: 'tank', id: 'sludge', x: 720, y: 400, w: 120, h: 90 },
      // Lecturas
      { t: 'value', x: 870, y: 200, w: 110, get: (p) => p.c.hfoSett.temp, unit: '°C', en: 'Settling temp.', es: 'Temp. sedimentación', warn: (p) => p.c.hfoSett.temp < 50 },
      { t: 'value', x: 870, y: 250, w: 110, get: (p) => p.c.hfoServ.temp, unit: '°C', en: 'Service temp.', es: 'Temp. servicio', warn: (p) => p.c.hfoServ.temp < 60 },
      { t: 'value', x: 870, y: 360, w: 110, get: (p) => p.fuel.meLh, unit: 'L/h', dec: 0, en: 'ME consumption', es: 'Consumo MP', nav: 'fcm' },
      { t: 'value', x: 870, y: 410, w: 110, get: (p) => p.fuel.dgLh, unit: 'L/h', dec: 0, en: 'DG consumption', es: 'Consumo DG' },
      { t: 'value', x: 870, y: 460, w: 110, get: (p) => p.c.hfoServ.water, unit: '% w', dec: 2, en: 'Water in service', es: 'Agua en servicio', warn: (p) => p.c.hfoServ.water > 0.5 },
      { t: 'value', x: 870, y: 540, w: 110, get: (p) => (p.sig.qcvTripped ? 'TRIPPED' : 'NORMAL'), en: 'Quick-closing valves', es: 'Válvulas cierre rápido', warn: (p) => p.sig.qcvTripped },
      { t: 'value', x: 180, y: 300, w: 110, get: (p) => p.c.hfoSett.water, unit: '% w', dec: 2, en: 'Water in settling', es: 'Agua en sedimentación', warn: (p) => p.c.hfoSett.water > 1 },
    ], ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click pumps, valves, tanks and purifiers to operate them.', 'Toca bombas, válvulas, tanques y depuradoras para manejarlos.'))), update: m.update };
  },
};
