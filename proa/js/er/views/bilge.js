// Vista «Bilge System»: pozos de sentina de la cámara de máquinas, caja de válvulas, bomba de sentinas,
// tanque de retención, separador de agua oleosa (OWS) con monitor de 15 ppm y válvula de tres vías,
// y aspiración directa de emergencia por la bomba de agua salada.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { lamp, readout, meter, bi } from '../ui/widgets.js';
import { WELLS, owsDischargeAllowed, oilTank, swPumpRunning } from '../model/hull.js';

const owsOverboard = (p) => p.c.ows.run && p.hull.ows.valve === 'overboard' && p.c['v-ows-ob'].open;

registerFace('ows-panel', (ctx) => {
  const st = statusLine();
  const ppm = meter({ unit: 'ppm', max: 30, labels: [[0, '0'], [0.5, '15'], [1, '30']], red: [0.5, 1] });
  const lRun = lamp({ color: 'green', label: ['RUNNING'], es: 'En marcha' });
  const lOb = lamp({ color: 'white', label: ['OVERBOARD'], es: 'Al mar' });
  const lRec = lamp({ color: 'amber', label: ['RECIRC.'], es: 'Recirculación' });
  const l15 = lamp({ color: 'red', label: ['15 PPM', 'ALARM'], es: 'Alarma 15 ppm', blink: true });
  const allowed = readout({ label: 'Discharge criteria (en route, ≥ 12 nm)', es: 'Condiciones de descarga (navegando, ≥ 12 millas)', dec: 0 });
  const dist = readout({ label: 'Distance to land', es: 'Distancia a tierra', unit: 'nm', dec: 0 });
  const spd = readout({ label: 'Ship speed', es: 'Velocidad', unit: 'kn', dec: 1 });
  const dis = readout({ label: 'Discharged overboard', es: 'Descargado al mar', unit: 'm³', dec: 2 });
  const oil = readout({ label: 'Oil to sludge tank', es: 'Aceite al tanque de lodos', unit: 'l', dec: 0 });
  const flow = readout({ label: 'Throughput', es: 'Caudal', unit: 'm³/h', dec: 1 });
  const mode = btn('3-way valve: AUTO / RECIRC', 'Válvula de tres vías: AUTO / RECIRCULACIÓN', () => ctx.act('owsMode', ctx.p().hull.ows.mode === 'auto' ? 'recirc' : 'auto'));
  return {
    en: 'Oily water separator & 15 ppm bilge alarm', es: 'Separador de agua oleosa y alarma de sentinas de 15 ppm',
    body: h('div', { class: 'fp-body' }, st.el,
      h('div', { class: 'panel-row' }, ppm.el, lRun.el, lOb.el, lRec.el, l15.el),
      h('div', { class: 'row' }, btn('START', 'Arrancar', () => ctx.act('start', 'ows'), 'primary'), btn('STOP', 'Parar', () => ctx.act('stop', 'ows')), mode),
      h('div', { class: 'readouts' }, flow.el, dis.el, oil.el, dist.el, spd.el, allowed.el),
      h('div', { class: 'row' }, btn('Oil Record Book entry', 'Anotar en el Libro Registro de Hidrocarburos', () => ctx.act('orbEntry'))),
      h('p', { class: 'muted small' }, bi('MARPOL Annex I: effluent overboard only below 15 ppm, ship en route. The 3-way valve recirculates automatically above 15 ppm.', 'MARPOL Anexo I: descarga al mar solo por debajo de 15 ppm y con el buque navegando. La válvula de tres vías recircula automáticamente por encima de 15 ppm.'))),
    update(p) {
      const o = p.hull.ows, c = p.c.ows;
      st.set(c.fault ? 'fault' : c.run ? 'run' : p.sig.msbLive ? 'stop' : 'nopower', ` · ${o.mode === 'auto' ? 'AUTO' : 'RECIRC'}`);
      ppm.set(o.ocm);
      lRun.set(c.run); lOb.set(c.run && o.valve === 'overboard'); lRec.set(c.run && o.valve === 'recirc'); l15.set(c.run && o.ocm >= 15);
      const ok = owsDischargeAllowed(p);
      allowed.set(ok ? 'PERMITTED · permitida' : 'NOT PERMITTED · no permitida', !ok);
      dist.set(p.env.seaDistanceNm ?? 30, (p.env.seaDistanceNm ?? 30) < 12); spd.set(p.sig.shipSpeed ?? 12);
      dis.set(o.discharged); oil.set(o.oilOut * 1000); flow.set(o.flow * 3600);
      mode.classList.toggle('primary', o.mode === 'auto');
    },
  };
});

const WX = [80, 220, 360, 500];
const WES = { bwFP: 'Proa Br', bwFS: 'Proa Er', bwAft: 'Popa', bwSG: 'Servo' };

export default {
  id: 'bilge', en: 'Bilge System', es: 'Sentinas',
  render(ctx) {
    const bilpOn = (p) => p.hull.bilpFlow > 0;
    const owsFlow = (p) => p.hull.ows.flow > 0;
    const els = [];
    // Pozos de sentina y su válvula en la caja de válvulas
    WELLS.forEach((w, i) => {
      const x = WX[i];
      els.push(
        { t: 'pipe', d: `M${x + 30} 480 V360`, fluid: 'bilge', on: (p) => bilpOn(p) && p.c[`v-${w.id}`].open },
        { t: 'tank', id: w.id, x, y: 480, w: 80, h: 80, en: w.short, es: WES[w.id] },
        { t: 'valve', id: `v-${w.id}`, x: x + 30, y: 410, vertical: true },
      );
    });
    els.push(
      { t: 'pipe', d: 'M110 360 H620 V316', fluid: 'bilge', on: bilpOn },
      { t: 'pipe', d: 'M620 284 V200 H660', fluid: 'bilge', on: bilpOn },
      { t: 'label', x: 300, y: 350, en: 'Bilge valve chest', es: 'Caja de válvulas de sentinas', size: 11 },
      { t: 'pump', id: 'bilp', x: 620, y: 300, r: 16, dir: 'up', lx: -62, ly: 4 },
      { t: 'tank', id: 'bilgeHold', x: 660, y: 140, w: 110, h: 130 },
      // Separador de agua oleosa
      { t: 'pipe', d: 'M715 270 V335 H820', fluid: 'bilge', on: owsFlow },
      { t: 'valve', id: 'v-ows-suc', x: 770, y: 335, en: 'OWS suction', es: 'Aspiración OWS', ly: 22 },
      { t: 'box', x: 820, y: 300, w: 130, h: 70, en: 'Oily Water Separator', es: 'Separador de agua oleosa', face: 'ows-panel', size: 11,
        state: (p) => (p.alarms['ows-marpol']?.active || p.c.ows.fault ? 'alarm' : p.c.ows.run ? (p.hull.ows.valve === 'overboard' ? 'run' : 'warn') : 'stop') },
      { t: 'pipe', d: 'M885 300 V225', fluid: 'lo', on: owsFlow },
      { t: 'tank', id: ctx.p().c.sludge ? 'sludge' : 'owsOil', x: 845, y: 150, w: 80, h: 75, en: '', es: '' },
      { t: 'label', x: 885, y: 140, en: 'Sludge tank (separated oil)', es: 'Tanque de lodos (aceite separado)', size: 10 },
      { t: 'pipe', d: 'M950 335 H975 V530', fluid: 'bilge', on: owsOverboard },
      { t: 'valve', id: 'v-ows-ob', x: 975, y: 550, vertical: true, en: 'Overboard', es: 'Al mar', lx: -22, ly: 34 },
      { t: 'pipe', d: 'M835 370 V530 H690 V270', fluid: 'bilge', on: (p) => p.c.ows.run && !owsOverboard(p) && owsFlow(p) },
      { t: 'label', x: 760, y: 548, en: 'recirculation (3-way valve)', es: 'recirculación (válvula de tres vías)', size: 9 },
      { t: 'value', x: 850, y: 410, w: 105, get: (p) => p.sig.owsPpm ?? 0, unit: 'ppm', en: '15 ppm monitor', es: 'Monitor de 15 ppm', warn: (p) => p.c.ows.run && p.hull.ows.ocm >= 15, face: 'ows-panel' },
      { t: 'value', x: 850, y: 465, w: 105, get: (p) => (!p.c.ows.run ? '—' : p.hull.ows.valve === 'overboard' ? 'OVERBOARD' : 'RECIRC'), en: '3-way valve', es: 'Válvula de 3 vías', face: 'ows-panel' },
      // Aspiración directa de emergencia
      { t: 'pipe', d: 'M420 480 V450 H460 V90', fluid: 'bilge', on: (p) => p.hull.ebsFlow > 0 },
      { t: 'valve', id: 'v-ebs', x: 460, y: 250, vertical: true, en: 'Emergency bilge suction', es: 'Achique de emergencia', lx: 70, ly: 4 },
      { t: 'box', x: 390, y: 40, w: 140, h: 50, en: 'Main SW pump', es: 'Bomba de agua de mar', nav: 'cooling', size: 11, state: (p) => (swPumpRunning(p) ? 'run' : 'stop') },
      { t: 'label', x: 540, y: 62, en: '→ overboard', es: 'directo al mar', size: 10, anchor: 'start' },
      // Lecturas
      { t: 'value', x: 30, y: 50, w: 130, get: (p) => p.sig.bilgeMaxPct ?? 0, unit: '%', dec: 0, en: 'Highest bilge well', es: 'Pozo más alto', warn: (p) => (p.sig.bilgeMaxPct ?? 0) >= 70 },
      { t: 'value', x: 30, y: 105, w: 130, get: (p) => p.hull.erWater, unit: 'm³', dec: 2, en: 'Water above floor plates', es: 'Agua sobre los cuerpos', warn: (p) => p.hull.erWater > 0.5 },
      { t: 'value', x: 30, y: 160, w: 130, get: (p) => p.hull.bilpFlow * 3600, unit: 'm³/h', dec: 1, en: 'Bilge pump flow', es: 'Caudal de sentinas' },
      { t: 'value', x: 30, y: 215, w: 130, get: (p) => (p.c.bilgeHold.level > 0 ? (100 * p.hull.holdOil) / p.c.bilgeHold.level : 0), unit: '%', dec: 1, en: 'Oil in holding tank', es: 'Aceite en el tanque de retención' },
      { t: 'value', x: 200, y: 50, w: 140, get: (p) => (owsDischargeAllowed(p) ? 'PERMITTED' : 'NOT PERMITTED'), en: 'OWS discharge', es: 'Descarga del separador', warn: (p) => !owsDischargeAllowed(p), face: 'ows-panel' },
      { t: 'value', x: 200, y: 105, w: 140, get: (p) => p.env.seaDistanceNm ?? 30, unit: 'nm', dec: 0, en: 'Distance to land', es: 'Distancia a tierra' },
      { t: 'value', x: 200, y: 160, w: 140, get: (p) => p.sig.shipSpeed ?? 12, unit: 'kn', dec: 1, en: 'Ship speed', es: 'Velocidad del buque' },
    );
    const m = mimic(els, ctx);
    return {
      el: h('div', {}, m.el,
        h('div', { class: 'row' }, btn('OWS panel', 'Panel del separador', () => ctx.face('ows-panel')), btn('Oil Record Book entry', 'Anotar en el Libro de Hidrocarburos', () => ctx.act('orbEntry'))),
        h('p', { class: 'muted small' }, bi('Pump the bilge wells to the holding tank (open the well valves, start the bilge pump). Then process the holding tank with the OWS: suction valve, overboard valve, start. Emergency bilge suction only in case of flooding.',
          'Achica los pozos al tanque de retención (abre las válvulas de los pozos y arranca la bomba). Después trata el tanque con el separador: aspiración, válvula al mar y arranque. La aspiración de emergencia, solo en caso de inundación.'))),
      update: m.update,
    };
  },
};
