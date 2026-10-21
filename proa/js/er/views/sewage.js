// Vista «Sewage Treatment Plant»: planta biológica con cámara de aireación (soplante), decantación,
// desinfección por cloro y bomba de descarga controlada por nivel.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { lamp, readout, bi } from '../ui/widgets.js';
import { treated, rawDischargeAllowed, CREW } from '../model/sewage.js';

registerFace('stp-panel', (ctx) => {
  const st = statusLine();
  const lB = lamp({ color: 'green', label: ['BLOWER'], es: 'Soplante' });
  const lCl = lamp({ color: 'green', label: ['DOSING'], es: 'Dosificación' });
  const lP = lamp({ color: 'green', label: ['DISCH. PUMP'], es: 'Bomba de descarga' });
  const lHi = lamp({ color: 'red', label: ['HIGH LEVEL'], es: 'Nivel alto', blink: true });
  const lAe = lamp({ color: 'red', label: ['AERATION', 'FAILURE'], es: 'Fallo de aireación', blink: true });
  const o2 = readout({ label: 'Dissolved oxygen', es: 'Oxígeno disuelto', unit: 'mg/l', dec: 1 });
  const bio = readout({ label: 'Biological activity', es: 'Actividad biológica', unit: '%', dec: 0 });
  const res = readout({ label: 'Residual chlorine', es: 'Cloro residual', unit: 'mg/l', dec: 2 });
  const cl = readout({ label: 'Chlorine tank', es: 'Tanque de cloro', unit: 'l', dec: 0 });
  const q = readout({ label: 'Effluent', es: 'Efluente', dec: 0 });
  const auto = btn('Discharge pump AUTO / MANUAL', 'Bomba de descarga AUTO / MANUAL', () => ctx.act('stpPumpAuto', !ctx.p().sew.auto));
  return {
    en: 'Sewage treatment plant control panel', es: 'Panel de control de la planta de aguas residuales',
    body: h('div', { class: 'fp-body' }, st.el,
      h('div', { class: 'panel-row' }, lB.el, lCl.el, lP.el, lHi.el, lAe.el),
      h('div', { class: 'row' }, btn('BLOWER START', 'Arrancar soplante', () => ctx.act('start', 'stpb'), 'primary'), btn('BLOWER STOP', 'Parar soplante', () => ctx.act('stop', 'stpb'))),
      h('div', { class: 'row' }, btn('DOSING START', 'Arrancar dosificación', () => ctx.act('start', 'stpcl')), btn('DOSING STOP', 'Parar dosificación', () => ctx.act('stop', 'stpcl')), btn('Refill chlorine', 'Rellenar cloro', () => ctx.act('stpRefillChlorine'))),
      h('div', { class: 'row' }, auto, btn('PUMP START', 'Arrancar bomba', () => ctx.act('start', 'stpp')), btn('PUMP STOP', 'Parar bomba', () => ctx.act('stop', 'stpp'))),
      h('div', { class: 'readouts' }, o2.el, bio.el, res.el, cl.el, q.el)),
    update(p) {
      const s = p.sew;
      const ok = p.c.stpb.run && !p.alarms['stp-aeration']?.active;
      st.el.dataset.state = ok ? 'run' : p.c.stpb.fault ? 'fault' : 'stop';
      st.el.replaceChildren(h('strong', { lang: 'en' }, ok ? 'IN OPERATION' : 'NOT IN OPERATION'), h('span', {}, ` · ${ok ? 'En servicio' : 'Fuera de servicio'}`));
      lB.set(p.c.stpb.run); lCl.set(p.c.stpcl.run); lP.set(p.c.stpp.run);
      lHi.set(p.alarms['stp-level']?.active); lAe.set(p.alarms['stp-aeration']?.active);
      o2.set(s.o2, s.o2 < 0.8); bio.set(s.bio * 100, s.bio < 0.6); res.set(s.res, s.res < 0.3); cl.set(s.chlorine, s.chlorine < 5);
      q.set(treated(p) ? 'TREATED · tratado' : 'UNTREATED · sin tratar', !treated(p));
      auto.classList.toggle('primary', s.auto);
      auto.querySelector('small').textContent = s.auto ? 'Bomba en AUTOMÁTICO (interruptores de nivel)' : 'Bomba en MANUAL';
    },
  };
});

export default {
  id: 'sewage', en: 'Sewage Treatment Plant', es: 'Planta de aguas residuales',
  render(ctx) {
    const flowing = (p) => p.c.stpp.run && p.sew.flow > 0;
    const m = mimic([
      { t: 'pipe', d: 'M60 120 H230 V180', fluid: 'sew', on: () => true },
      { t: 'box', x: 20, y: 70, w: 160, h: 40, en: 'From accommodation', es: 'Desde la habilitación', size: 11 },
      { t: 'tank', id: 'stpAer', x: 180, y: 180, w: 200, h: 220 },
      { t: 'pipe', d: 'M380 230 H430', fluid: 'sew', on: () => true },
      { t: 'tank', id: 'stpSet', x: 430, y: 230, w: 130, h: 170 },
      { t: 'pipe', d: 'M560 270 H610', fluid: 'sew', on: () => true },
      { t: 'tank', id: 'stpCl', x: 610, y: 270, w: 130, h: 130 },
      // Aire de la soplante a los difusores
      { t: 'pipe', d: 'M120 562 H300 V380', fluid: 'air', on: (p) => p.c.stpb.run },
      { t: 'motor', id: 'stpb', x: 50, y: 540, w: 70, h: 44, icon: '✣', en: 'Air blower', es: 'Soplante' },
      { t: 'label', x: 280, y: 368, en: '○ ○ ○ ○ ○', es: '', size: 14 },
      // Dosificación de cloro
      { t: 'box', x: 610, y: 100, w: 130, h: 80, en: 'Chlorine tank', es: 'Tanque de cloro', ty: 20, face: 'stp-panel', state: (p) => (p.sew.chlorine < 5 ? 'alarm' : 'ok') },
      { t: 'value', x: 625, y: 148, w: 100, get: (p) => p.sew.chlorine, unit: 'l', dec: 0, face: 'stp-panel' },
      { t: 'pipe', d: 'M675 180 V215 M675 245 V270', fluid: 'fw', on: (p) => p.c.stpcl.run },
      { t: 'pump', id: 'stpcl', x: 675, y: 230, r: 12, dir: 'down', lx: 75, ly: 4, en: 'Dosing pump', es: 'Bomba dosificadora' },
      // Descarga
      { t: 'pipe', d: 'M740 380 H790 V470 H805', fluid: 'sew', on: flowing },
      { t: 'pump', id: 'stpp', x: 820, y: 470, r: 15, en: 'Discharge pump', es: 'Bomba de descarga' },
      { t: 'pipe', d: 'M835 470 H900 V380', fluid: 'sew', on: flowing },
      { t: 'valve', id: 'v-stp-ob', x: 900, y: 420, vertical: true, en: 'Overboard', es: 'Al mar', lx: 0, ly: -50 },
      // Lecturas
      { t: 'value', x: 180, y: 490, w: 110, get: (p) => p.sew.o2, unit: 'mg/l', en: 'Dissolved O₂', es: 'O₂ disuelto', warn: (p) => p.sew.o2 < 0.8, face: 'stp-panel' },
      { t: 'value', x: 310, y: 490, w: 110, get: (p) => p.sew.bio * 100, unit: '%', dec: 0, en: 'Bio activity', es: 'Actividad biológica', warn: (p) => p.sew.bio < 0.6, face: 'stp-panel' },
      { t: 'value', x: 440, y: 490, w: 110, get: (p) => p.sew.res, unit: 'mg/l', dec: 2, en: 'Residual Cl', es: 'Cloro residual', warn: (p) => p.sew.res < 0.3, face: 'stp-panel' },
      { t: 'value', x: 570, y: 490, w: 140, get: (p) => (treated(p) ? 'TREATED' : 'UNTREATED'), en: 'Effluent', es: 'Efluente', warn: (p) => !treated(p), face: 'stp-panel' },
      { t: 'value', x: 750, y: 570, w: 190, get: (p) => (treated(p) ? 'OK (treated)' : rawDischargeAllowed(p) ? 'OK (>12 nm, >4 kn)' : 'NOT ALLOWED'), en: 'Overboard discharge (MARPOL IV)', es: 'Descarga al mar (MARPOL IV)', warn: (p) => !treated(p) && !rawDischargeAllowed(p) },
      { t: 'value', x: 20, y: 200, w: 130, get: (p) => p.sew.inflow * 86400, unit: 'm³/d', dec: 1, en: `Inflow (${CREW} persons)`, es: `Entrada (${CREW} personas)` },
      { t: 'value', x: 20, y: 260, w: 130, get: (p) => (p.sew.auto ? 'AUTO' : 'MANUAL'), en: 'Discharge pump', es: 'Bomba de descarga', face: 'stp-panel' },
      { t: 'box', x: 800, y: 120, w: 160, h: 60, en: 'STP control panel', es: 'Panel de control', face: 'stp-panel', cls: 'lcp', size: 12,
        state: (p) => (['stp-level', 'stp-aeration', 'stp-blower', 'stp-marpol'].some((id) => p.alarms[id]?.active) ? 'alarm' : 'ok') },
    ], ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Biological plant: the blower keeps the bacteria alive (dissolved oxygen > 1 mg/l); chlorine disinfects the effluent before discharge.', 'Planta biológica: la soplante mantiene vivas las bacterias (oxígeno disuelto > 1 mg/l); el cloro desinfecta el efluente antes de descargarlo.'))),
      update: m.update,
    };
  },
};
