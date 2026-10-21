// Vista «Cooling and Fire System»: agua de mar, enfriadores centrales, circuito LT con su válvula de 3 vías,
// circuito HT (camisas del motor principal) con precalentador y FWG, y colector contraincendios.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { meter, readout, bi, scale } from '../ui/widgets.js';

const r = (p, id) => Boolean(p.c[id]?.run);
const op = (p, id) => Boolean(p.c[id]?.open) && !p.c[id]?.fault;
const swOn = (p) => (p.cool?.swQ ?? 0) > 0.05;
const ltOn = (p) => (p.cool?.ltQ ?? 0) > 0.05;
const htOn = (p) => (p.cool?.htQ ?? 0) > 0.05;
const fireOn = (p) => ['fp1', 'fgsp'].some((id) => r(p, id));

// Ficha del regulador de temperatura (válvula de 3 vías) LT o HT.
function ctlFace(which) {
  const id = which === 'lt' ? 'cv-lt' : 'cv-ht';
  const spKey = which === 'lt' ? 'ltSp' : 'htSp';
  const tKey = which === 'lt' ? 'ltT' : 'htT';
  return (ctx) => {
    const T = meter({ unit: '°C', max: which === 'lt' ? 60 : 120, labels: which === 'lt' ? scale(60, 20) : scale(120, 40), red: which === 'lt' ? [0.7, 1] : [0.77, 1], label: [which === 'lt' ? 'LT FW TEMP' : 'JACKET WATER OUTLET'], es: which === 'lt' ? 'Temperatura BT' : 'Salida agua de camisas' });
    const pos = meter({ unit: '%', max: 100, labels: scale(100, 50), label: ['VALVE POSITION', which === 'lt' ? 'TO COOLER' : 'TO HT COOLER'], es: 'Posición: paso al enfriador' });
    const sp = readout({ label: 'Set point', es: 'Consigna', unit: '°C', dec: 0 });
    const mode = readout({ label: 'Mode', es: 'Modo', dec: 0 });
    const slider = h('input', { type: 'range', min: 0, max: 100, step: 1, oninput: (e) => ctx.act('setPos', id, Number(e.target.value) / 100) });
    const autoB = btn('AUTO', 'Automático', () => ctx.act('setAuto', id, true), 'primary');
    const manB = btn('MANUAL', 'Manual', () => ctx.act('setAuto', id, false));
    const chg = (d) => ctx.act('coolSetpoint', which, ctx.p().cool[spKey] + d);
    return {
      en: which === 'lt' ? 'LT FW temperature controller (3-way valve)' : 'HT jacket water temperature controller (3-way valve)',
      es: which === 'lt' ? 'Regulador de temperatura BT (válvula de 3 vías)' : 'Regulador de temperatura del agua de camisas (válvula de 3 vías)',
      body: h('div', { class: 'fp-body' },
        h('div', { class: 'panel-row' }, T.el, pos.el),
        h('div', { class: 'readouts' }, sp.el, mode.el),
        h('div', { class: 'row' }, autoB, manB, btn('SP −1', 'Consigna −1', () => chg(-1)), btn('SP +1', 'Consigna +1', () => chg(1))),
        h('label', {}, bi('Valve position (MANUAL only)', 'Posición de la válvula (solo en MANUAL)'), slider),
        h('p', { class: 'muted small' }, which === 'lt'
          ? 'In AUTO the PI controller sends more LT water through the central coolers when the temperature rises (rest bypasses). · En AUTO el regulador PI manda más agua BT por los enfriadores centrales cuando sube la temperatura (el resto va por el bypass).'
          : 'In AUTO the PI controller sends jacket water through the HT cooler to keep the engine outlet at the set point. With the engine stopped the valve closes and the preheater keeps ~60 °C. · En AUTO el regulador PI manda agua de camisas al enfriador AT para mantener la consigna a la salida del motor. Con el motor parado la válvula cierra y el precalentador mantiene ~60 °C.')),
      update(p) {
        const v = p.c[id];
        T.set(p.cool[tKey]); pos.set(v.pos * 100);
        sp.set(p.cool[spKey]);
        mode.set(v.fault ? 'STUCK · agarrotada' : v.auto ? 'AUTO · automático' : 'MANUAL · manual', v.fault);
        autoB.classList.toggle('primary', v.auto); manB.classList.toggle('primary', !v.auto);
        slider.disabled = v.auto;
        if (document.activeElement !== slider) slider.value = Math.round(v.pos * 100);
      },
    };
  };
}
registerFace('cool-lt-ctl', ctlFace('lt'));
registerFace('cool-ht-ctl', ctlFace('ht'));

// Ficha del colector contraincendios.
registerFace('fire-main', (ctx) => {
  const er = meter({ unit: 'bar', max: 12, labels: scale(12, 4), red: [0, 5 / 12], label: ['FIRE MAIN', 'ENGINE ROOM'], es: 'Colector C.I. máquinas' });
  const dk = meter({ unit: 'bar', max: 12, labels: scale(12, 4), red: [0, 5 / 12], label: ['FIRE MAIN', 'DECK'], es: 'Colector C.I. cubierta' });
  const q = readout({ label: 'Hydrant / leak flow', es: 'Caudal por hidrantes / fugas', unit: 'm³/h', dec: 0 });
  const iso = readout({ label: 'ER / deck isolating valve', es: 'Válvula de aislamiento máquinas / cubierta', dec: 0 });
  const pb = (id, en, es) => [btn(`${en} START`, `${es}: arrancar`, () => ctx.act('start', id), 'primary'), btn(`${en} STOP`, `${es}: parar`, () => ctx.act('stop', id))];
  return {
    en: 'Fire main (remote fire pump control)', es: 'Colector contraincendios (mando a distancia de las bombas)',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, er.el, dk.el),
      h('div', { class: 'readouts' }, q.el, iso.el),
      h('div', { class: 'row' }, ...pb('fp1', 'MAIN FIRE PUMP', 'Bomba C.I. principal')),
      h('div', { class: 'row' }, ...pb('efp', 'EMERG. FIRE PUMP', 'Bomba C.I. de emergencia')),
      h('div', { class: 'row' }, btn('ISOLATE ER', 'Aislar máquinas (cerrar)', () => ctx.act('close', 'v-fire-iso')), btn('OPEN ISOLATING VALVE', 'Abrir aislamiento', () => ctx.act('open', 'v-fire-iso')))),
    update(p) {
      er.set(p.cool.fireEr); dk.set(p.cool.fireDeck); q.set(p.cool.fireQ);
      iso.set(p.c['v-fire-iso'].open ? 'OPEN · abierta' : 'CLOSED · cerrada');
    },
  };
});

export default {
  id: 'cooling', en: 'Cooling and Fire System', es: 'Refrigeración y contraincendios',
  render(ctx) {
    const m = mimic([
      // ---------- Agua de mar ----------
      { t: 'label', x: 20, y: 22, en: 'SEA WATER', es: 'Agua de mar', size: 12, anchor: 'start' },
      { t: 'pipe', d: 'M120 78 H180', fluid: 'sw', on: (p) => swOn(p) && op(p, 'v-sc-high') },
      { t: 'pipe', d: 'M120 278 H180', fluid: 'sw', on: (p) => swOn(p) && op(p, 'v-sc-low') },
      { t: 'pipe', d: 'M180 78 V278', fluid: 'sw', on: swOn },
      { t: 'pipe', d: 'M180 140 H224 M180 205 H224', fluid: 'sw', on: swOn },
      { t: 'pipe', d: 'M256 140 H300 V245 M256 205 H300', fluid: 'sw', on: swOn },
      { t: 'pipe', d: 'M300 245 H485 M365 245 V190', fluid: 'sw', on: swOn },
      { t: 'pipe', d: 'M485 245 V190', fluid: 'sw', on: (p) => swOn(p) && op(p, 'v-cc2-sw') },
      { t: 'pipe', d: 'M365 90 V60 H640 M485 90 V60', fluid: 'sw', on: swOn },
      { t: 'box', x: 20, y: 60, w: 100, h: 36, en: 'High sea chest', es: 'Toma de mar alta', size: 10 },
      { t: 'box', x: 20, y: 260, w: 100, h: 36, en: 'Low sea chest', es: 'Toma de mar baja', size: 10, state: (p) => (p.faults['sw-strainer'] && op(p, 'v-sc-low') ? 'warn' : 'ok') },
      { t: 'valve', id: 'v-sc-high', x: 150, y: 78, en: 'High', es: 'alta' },
      { t: 'valve', id: 'v-sc-low', x: 150, y: 278, en: 'Low', es: 'baja' },
      { t: 'pump', id: 'swp1', x: 240, y: 140, en: 'SW pump 1', es: 'Bomba mar 1' },
      { t: 'pump', id: 'swp2', x: 240, y: 205, en: 'SW pump 2', es: 'Bomba mar 2' },
      { t: 'value', x: 190, y: 32, w: 90, get: (p) => p.cool.swPress, unit: 'bar', en: 'SW pressure', es: 'Presión agua de mar', warn: (p) => p.alarms['cool-sw-press-low']?.active },
      { t: 'value', x: 20, y: 330, w: 90, get: (p) => p.env.swTemp, unit: '°C', en: 'Sea temp.', es: 'Temp. del mar' },
      { t: 'hx', x: 340, y: 90, w: 50, h: 100, en: 'Central cooler 1', es: 'Enfriador central 1' },
      { t: 'hx', x: 460, y: 90, w: 50, h: 100, en: 'Central cooler 2', es: 'Enfriador central 2' },
      { t: 'valve', id: 'v-cc1-sw', x: 365, y: 230, vertical: true, s: 6 },
      { t: 'valve', id: 'v-cc2-sw', x: 485, y: 230, vertical: true, s: 6 },
      { t: 'valve', id: 'v-sw-ovbd', x: 600, y: 60, en: 'Overboard', es: 'Al costado', ly: 22 },
      { t: 'value', x: 650, y: 49, w: 70, get: (p) => p.cool.swOut, unit: '°C', warn: () => false },

      // ---------- Circuito LT ----------
      { t: 'label', x: 740, y: 22, en: 'LT FRESH WATER', es: 'Agua dulce BT', size: 12, anchor: 'start' },
      { t: 'pipe', d: 'M395 90 V36 H700 V152', fluid: 'lt', on: (p) => ltOn(p) && p.c['cv-lt'].pos > 0.02 },
      { t: 'pipe', d: 'M515 90 V36', fluid: 'lt', on: (p) => ltOn(p) && op(p, 'v-cc2-lt') },
      { t: 'pipe', d: 'M395 190 V290 H1075 V77 M515 190 V290', fluid: 'lt', on: ltOn },
      { t: 'pipe', d: 'M700 290 V178', fluid: 'lt', on: (p) => ltOn(p) && p.c['cv-lt'].pos < 0.98 },
      { t: 'pipe', d: 'M712 165 H750 V130 H774 M750 165 V205 H774', fluid: 'lt', on: ltOn },
      { t: 'pipe', d: 'M806 130 H860 M806 205 H860 M860 77 V253', fluid: 'lt', on: ltOn },
      { t: 'pipe', d: 'M860 77 H880 M860 121 H880 M860 165 H880 M860 209 H880 M860 253 H880 M1050 77 H1075 M1050 121 H1075 M1050 165 H1075 M1050 209 H1075 M1050 253 H1075', fluid: 'lt', on: ltOn },
      { t: 'pipe', d: 'M625 170 V290', fluid: 'lt' },
      { t: 'pipe', d: 'M545 140 H585', fluid: 'fw', on: (p) => op(p, 'v-lt-makeup') },
      { t: 'label', x: 540, y: 128, en: 'FW', es: '', size: 9, anchor: 'end' },
      { t: 'valve', id: 'v-cc1-lt', x: 395, y: 268, vertical: true, s: 7 },
      { t: 'valve', id: 'v-cc2-lt', x: 515, y: 268, vertical: true, s: 7 },
      { t: 'valve', id: 'cv-lt', x: 700, y: 165, vertical: true, face: 'cool-lt-ctl', en: '3-way', es: 'TCV', lx: 32, ly: 24 },
      { t: 'tank', id: 'ltExp', x: 585, y: 110, w: 80, h: 60, en: 'LT exp. tank', es: 'Exp. BT', size: 9 },
      { t: 'valve', id: 'v-lt-makeup', x: 562, y: 140, s: 6 },
      { t: 'pump', id: 'ltp1', x: 790, y: 130, en: 'LT pump 1', es: 'Bomba BT 1' },
      { t: 'pump', id: 'ltp2', x: 790, y: 205, en: 'LT pump 2 (ESB)', es: 'Bomba BT 2 (ESB)' },
      { t: 'box', x: 880, y: 62, w: 170, h: 30, en: 'ME scavenge air cooler', es: 'Enfriador de aire de barrido MP', size: 10, ty: 13, nav: 'me' },
      { t: 'box', x: 880, y: 106, w: 170, h: 30, en: 'ME lube oil cooler', es: 'Enfriador de aceite MP', size: 10, ty: 13, nav: 'lube' },
      { t: 'box', x: 880, y: 150, w: 170, h: 30, en: 'Diesel generator coolers', es: 'Enfriadores de los generadores', size: 10, ty: 13, nav: 'dg' },
      { t: 'box', x: 880, y: 194, w: 170, h: 30, en: 'Aux. (AC, compressors)', es: 'Auxiliares (AC, compresores)', size: 10, ty: 13, nav: 'ac' },
      { t: 'box', x: 880, y: 238, w: 170, h: 30, en: 'HT (jacket) cooler', es: 'Enfriador de camisas (AT)', size: 10, ty: 13, face: 'cool-ht-ctl' },
      { t: 'value', x: 560, y: 330, w: 96, get: (p) => p.cool.ltT, unit: '°C', en: 'LT supply temp.', es: 'Temp. impulsión BT', warn: (p) => p.cool.ltT > 42, face: 'cool-lt-ctl' },
      { t: 'value', x: 670, y: 330, w: 96, get: (p) => p.cool.ltRet, unit: '°C', en: 'LT return temp.', es: 'Temp. retorno BT' },
      { t: 'value', x: 780, y: 330, w: 96, get: (p) => p.cool.ltPress, unit: 'bar', en: 'LT pressure', es: 'Presión BT', warn: (p) => p.alarms['cool-lt-press-low']?.active },
      { t: 'value', x: 890, y: 330, w: 96, get: (p) => `${Math.round(p.c['cv-lt'].pos * 100)} % ${p.c['cv-lt'].auto ? 'A' : 'M'}`, en: 'TCV to coolers', es: 'Válvula 3 vías', face: 'cool-lt-ctl' },
      { t: 'value', x: 890, y: 290, w: 96, get: (p) => p.cool.qLt / 1000, unit: 'MW', dec: 2, en: '', es: '' },

      // ---------- Circuito HT (camisas) ----------
      { t: 'label', x: 20, y: 372, en: 'HT (JACKET) WATER', es: 'Agua de camisas (AT)', size: 12, anchor: 'start' },
      { t: 'pipe', d: 'M860 400 V380 H480 V432', fluid: 'ht', on: htOn },
      { t: 'pipe', d: 'M330 380 V392', fluid: 'ht', on: (p) => htOn(p) && op(p, 'v-fwg-hwin') && op(p, 'v-fwg-hwout') },
      { t: 'pipe', d: 'M330 380 H480', fluid: 'ht', on: htOn },
      { t: 'pipe', d: 'M330 442 V600 H560', fluid: 'ht', on: (p) => htOn(p) && op(p, 'v-fwg-hwin') && op(p, 'v-fwg-hwout') },
      { t: 'pipe', d: 'M468 445 H440 V460 H420', fluid: 'ht', on: (p) => htOn(p) && p.c['cv-ht'].pos > 0.02 },
      { t: 'pipe', d: 'M360 480 H345 V540 H480', fluid: 'ht', on: (p) => htOn(p) && p.c['cv-ht'].pos > 0.02 },
      { t: 'pipe', d: 'M480 458 V540 H560 V470 H584 M560 540 V600', fluid: 'ht', on: htOn },
      { t: 'pipe', d: 'M560 540 H584', fluid: 'ht', on: htOn },
      { t: 'pipe', d: 'M616 470 H680 M616 540 H680 V455 H760', fluid: 'ht', on: htOn },
      { t: 'pipe', d: 'M680 540 V565', fluid: 'ht', on: (p) => htOn(p) && (p.cool.preheat || p.cool.elHeat) },
      { t: 'pipe', d: 'M610 585 H690', fluid: 'steam', on: (p) => p.cool.preheat },
      { t: 'pipe', d: 'M620 409 H560 V470', fluid: 'ht' },
      { t: 'pipe', d: 'M660 375 V388', fluid: 'fw', on: (p) => op(p, 'v-ht-makeup') },
      { t: 'pipe', d: 'M370 420 V392', fluid: 'lt', on: ltOn },
      { t: 'hx', x: 360, y: 420, w: 60, h: 80, en: 'HT cooler', es: 'Enfriador AT', face: 'cool-ht-ctl' },
      { t: 'label', x: 378, y: 403, en: 'LT', es: '', size: 9 },
      { t: 'valve', id: 'cv-ht', x: 480, y: 445, vertical: true, face: 'cool-ht-ctl', en: '3-way', es: 'TCV', lx: 30, ly: 4 },
      { t: 'box', x: 270, y: 392, w: 80, h: 50, en: 'FWG', es: 'Gen. agua dulce', nav: 'fwg', size: 11, state: (p) => ((p.fwg?.heat ?? 0) > 50 ? 'run' : 'stop') },
      { t: 'tank', id: 'htExp', x: 620, y: 388, w: 80, h: 42, en: 'HT exp. tank', es: 'Exp. AT', size: 9 },
      { t: 'valve', id: 'v-ht-makeup', x: 720, y: 362, s: 6 },
      { t: 'pipe', d: 'M660 362 H714', fluid: 'fw', on: (p) => op(p, 'v-ht-makeup') },
      { t: 'label', x: 732, y: 366, en: 'FW', es: '', size: 9, anchor: 'start' },
      { t: 'pump', id: 'htp1', x: 600, y: 470, en: 'HT pump 1', es: 'Bomba AT 1' },
      { t: 'pump', id: 'htp2', x: 600, y: 540, en: 'HT pump 2', es: 'Bomba AT 2' },
      { t: 'box', x: 690, y: 562, w: 110, h: 46, en: 'Preheater', es: 'Precalentador', size: 11, ty: 18, state: (p) => (p.cool.preheat || p.cool.elHeat ? 'run' : 'stop') },
      { t: 'valve', id: 'v-preheat', x: 640, y: 585, en: 'Steam', es: 'Vapor', ly: 20 },
      { t: 'motor', id: 'htph', x: 815, y: 562, w: 70, h: 40, icon: '⚡', en: 'Electric preheater', es: 'Precalentador eléctrico' },
      { t: 'box', x: 760, y: 400, w: 200, h: 120, en: 'Main Engine (jackets)', es: 'Motor principal (camisas)', ty: 18, nav: 'me', state: (p) => (p.sig.meRunning ? 'run' : 'stop') },
      { t: 'value', x: 770, y: 466, w: 85, get: (p) => p.cool.htT, unit: '°C', en: 'Outlet', es: 'Salida', warn: (p) => p.cool.htT > 92, face: 'cool-ht-ctl' },
      { t: 'value', x: 865, y: 466, w: 85, get: (p) => p.cool.htIn, unit: '°C', en: 'Inlet', es: 'Entrada' },
      { t: 'value', x: 770, y: 494, w: 85, get: (p) => p.cool.htPress, unit: 'bar', en: '', es: '', warn: (p) => p.alarms['cool-ht-press-low']?.active },
      { t: 'value', x: 865, y: 494, w: 85, get: (p) => p.cool.qJacket, unit: 'kW', dec: 0 },
      { t: 'value', x: 400, y: 552, w: 80, get: (p) => `${Math.round(p.c['cv-ht'].pos * 100)} % ${p.c['cv-ht'].auto ? 'A' : 'M'}`, face: 'cool-ht-ctl' },

      // ---------- Colector contraincendios ----------
      { t: 'label', x: 20, y: 612, en: 'FIRE MAIN', es: 'Colector contraincendios', size: 12, anchor: 'start' },
      { t: 'pipe', d: 'M180 278 V765 H80 V716 M180 765 H250 V716', fluid: 'sw', on: fireOn },
      { t: 'pipe', d: 'M80 684 V655 H560 M250 684 V655', fluid: 'sw', on: (p) => p.cool.fireEr > 0.5 },
      { t: 'pipe', d: 'M380 655 V690', fluid: 'sw', on: (p) => p.cool.fireEr > 0.5 && op(p, 'v-hyd-er') },
      { t: 'pipe', d: 'M560 655 H1000 M880 655 V690 M960 655 V690', fluid: 'sw', on: (p) => p.cool.fireDeck > 0.5 },
      { t: 'pipe', d: 'M760 684 V655', fluid: 'sw', on: (p) => r(p, 'efp') },
      { t: 'pipe', d: 'M760 716 V765 H700', fluid: 'sw', on: (p) => r(p, 'efp') },
      { t: 'pump', id: 'fp1', x: 80, y: 700, dir: 'up', en: 'Main fire pump', es: 'Bomba C.I. principal', size: 9 },
      { t: 'pump', id: 'fgsp', x: 250, y: 700, dir: 'up', en: 'Fire & GS pump', es: 'Bomba C.I. y S. G.', size: 9 },
      { t: 'pump', id: 'efp', x: 760, y: 700, dir: 'up', en: 'Emergency fire pump (ESB)', es: 'Bomba C.I. de emergencia', size: 9 },
      { t: 'valve', id: 'v-efp-suc', x: 720, y: 765, en: 'Em. sea chest', es: 'Toma de mar de emergencia', ly: 4, lx: -80 },
      { t: 'valve', id: 'v-hyd-er', x: 380, y: 690, vertical: true, en: 'ER hydrants', es: 'Hidrantes máquinas', ly: 22 },
      { t: 'valve', id: 'v-fire-iso', x: 560, y: 655, en: 'Isolating valve ER / deck', es: 'Aislamiento máquinas / cubierta', ly: -22 },
      { t: 'valve', id: 'v-hyd-deck1', x: 880, y: 690, vertical: true, en: 'Deck 1', es: 'Hidrante cub. 1', ly: 22 },
      { t: 'valve', id: 'v-hyd-deck2', x: 960, y: 690, vertical: true, en: 'Deck 2', es: 'Hidrante cub. 2', ly: 22 },
      { t: 'value', x: 445, y: 705, w: 90, get: (p) => p.cool.fireEr, unit: 'bar', en: 'ER fire main', es: 'C.I. máquinas', face: 'fire-main', warn: (p) => p.alarms['cool-fire-main-low']?.active },
      { t: 'value', x: 580, y: 705, w: 96, get: (p) => p.cool.fireDeck, unit: 'bar', en: 'Deck fire main', es: 'C.I. cubierta', face: 'fire-main', warn: (p) => p.alarms['cool-fire-main-low']?.active },
      { t: 'box', x: 960, y: 595, w: 125, h: 40, en: 'Fire pump control', es: 'Mando bombas C.I.', face: 'fire-main', size: 10 },
    ], ctx, { w: 1100, hgt: 790 });
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click pumps, valves and the 3-way control valves (TCV) to operate them. Values open the controller.', 'Toca bombas y válvulas para manejarlas. Las válvulas de 3 vías (TCV) y las lecturas abren el regulador.'))),
      update: m.update,
    };
  },
};
