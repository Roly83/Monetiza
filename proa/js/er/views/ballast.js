// Vista «Ballast System»: planta del buque con los tanques de lastre, colectores de aspiración y de
// llenado, bombas, caja de mar, tratamiento del agua de lastre (BWTS) y escora/asiento del buque.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { lamp, readout, bi, svg, svgText } from '../ui/widgets.js';
import { BALLAST } from '../model/hull.js';

// Posición de cada tanque en la planta (bow a la derecha, babor arriba).
const PLAN = {
  blAP: { x: 75, y: 127, w: 60, h: 76 },
  blDB3P: { x: 190, y: 72, w: 110, h: 50 }, blDB3S: { x: 190, y: 210, w: 110, h: 50 },
  blDB2P: { x: 335, y: 72, w: 120, h: 50 }, blDB2S: { x: 335, y: 210, w: 120, h: 50 },
  blDB1P: { x: 490, y: 72, w: 115, h: 50 }, blDB1S: { x: 490, y: 210, w: 115, h: 50 },
  blWP: { x: 640, y: 72, w: 105, h: 50 }, blWS: { x: 640, y: 210, w: 105, h: 50 },
  blFP: { x: 855, y: 127, w: 62, h: 76 },
};
const Y_SUC = 152, Y_FILL = 178;
const bwtsReady = (p) => p.c.bwts.run && p.hull.bwtsWarm >= 30;
const pumping = (p) => p.hull.flow > 0.01;

registerFace('bwts-panel', (ctx) => {
  const st = statusLine();
  const lRun = lamp({ color: 'green', label: ['UV ON'], es: 'UV encendido' });
  const lReady = lamp({ color: 'white', label: ['READY'], es: 'Preparado' });
  const lAl = lamp({ color: 'red', label: ['ALARM'], es: 'Alarma', blink: true });
  const flow = readout({ label: 'Treated flow', es: 'Caudal tratado', unit: 'm³/h', dec: 0 });
  const warm = readout({ label: 'Lamp warm-up', es: 'Calentamiento de lámparas', unit: 's', dec: 0 });
  const rb = readout({ label: 'Ballasted (record)', es: 'Lastrado (registro)', unit: 'm³', dec: 0 });
  const db = readout({ label: 'Deballasted (record)', es: 'Deslastrado (registro)', unit: 'm³', dec: 0 });
  const un = readout({ label: 'Untreated', es: 'Sin tratar', unit: 'm³', dec: 0 });
  return {
    en: 'Ballast water treatment system (filter + UV)', es: 'Sistema de tratamiento de agua de lastre (filtro + UV)',
    body: h('div', { class: 'fp-body' }, st.el,
      h('div', { class: 'panel-row' }, lRun.el, lReady.el, lAl.el),
      h('div', { class: 'row' }, btn('START', 'Arrancar', () => ctx.act('start', 'bwts'), 'primary'), btn('STOP', 'Parar', () => ctx.act('stop', 'bwts'))),
      h('div', { class: 'readouts' }, flow.el, warm.el, rb.el, db.el, un.el),
      h('p', { class: 'muted small' }, bi('Start the BWTS and wait for READY before ballasting or deballasting (BWM Convention, D-2). Internal transfers do not need treatment.', 'Arranca el BWTS y espera a PREPARADO antes de lastrar o deslastrar (Convenio BWM, D-2). Los trasiegos internos no necesitan tratamiento.'))),
    update(p) {
      const c = p.c.bwts;
      st.set(c.fault ? 'fault' : c.run ? 'run' : p.sig.msbLive ? 'stop' : 'nopower', c.run && !bwtsReady(p) ? ' · warming up / calentando' : '');
      lRun.set(c.run); lReady.set(bwtsReady(p)); lAl.set(c.fault || p.alarms['bl-bwts']?.active);
      flow.set(p.hull.bwtsFlow * 3600); warm.set(p.hull.bwtsWarm);
      rb.set(p.hull.bwRecord.ballasted); db.set(p.hull.bwRecord.deballasted); un.set(p.hull.bwRecord.untreated, p.hull.bwRecord.untreated > 0);
    },
  };
});

// Dibujo del casco en planta.
function hullPlan(g) {
  g.append(svg('path', { d: 'M40 45 H760 Q930 45 975 165 Q930 285 760 285 H40 Q28 165 40 45 Z', class: 'mm-tank', style: 'fill: none; stroke-width: 3' }));
  g.append(svg('line', { x1: 40, y1: 165, x2: 975, y2: 165, style: 'stroke: var(--mm-es); stroke-dasharray: 6 6; stroke-width: 1' }));
  g.append(svgText(520, 40, 'PORT · Babor', 'mm-es'), svgText(520, 300, 'STARBOARD · Estribor', 'mm-es'), svgText(985, 170, 'BOW ▸', 'mm-es', 'end'));
  return null;
}

// Sección transversal (escora) y perfil (asiento), exagerados para que se vean.
function stabilityDraw(g) {
  const cx = 880, cy = 400;
  g.append(svg('rect', { x: 795, y: 340, width: 175, height: 250, rx: 8, class: 'mm-box' }));
  g.append(svgText(cx, 358, 'List · Escora', 'mm-label'));
  const sea1 = svg('rect', { x: 805, y: cy + 12, width: 155, height: 30, style: 'fill: var(--f-sw); opacity: .25' });
  const sect = svg('g', {}, svg('path', { d: `M${cx - 45} ${cy - 25} V${cy + 15} Q${cx - 45} ${cy + 30} ${cx - 30} ${cy + 30} H${cx + 30} Q${cx + 45} ${cy + 30} ${cx + 45} ${cy + 15} V${cy - 25} Z`, class: 'mm-body' }),
    svg('line', { x1: cx, y1: cy - 40, x2: cx, y2: cy + 30, style: 'stroke: var(--mm-line); stroke-width: 1.5' }));
  const heelT = svgText(cx, cy + 62, '', 'mm-val');
  g.append(sea1, sect, heelT);
  const py = 520;
  g.append(svgText(cx, 478, 'Trim · Asiento', 'mm-label'));
  const sea2 = svg('rect', { x: 805, y: py + 6, width: 155, height: 28, style: 'fill: var(--f-sw); opacity: .25' });
  const prof = svg('path', { d: `M${cx - 70} ${py - 14} H${cx + 50} L${cx + 72} ${py - 18} L${cx + 58} ${py + 16} H${cx - 66} Z`, class: 'mm-body' });
  const trimT = svgText(cx, py + 52, '', 'mm-val');
  g.append(sea2, prof, trimT);
  return (p) => {
    const heel = p.hull.heel, trim = p.hull.trim;
    sect.setAttribute('transform', `rotate(${(heel * 3).toFixed(2)} ${cx} ${cy + 12})`);
    heelT.textContent = `${Math.abs(heel).toFixed(1)}° ${Math.abs(heel) < 0.05 ? 'upright' : heel < 0 ? 'to PORT' : 'to STBD'}`;
    prof.setAttribute('transform', `rotate(${(-trim * 4).toFixed(2)} ${cx} ${py + 6})`);
    trimT.textContent = `${Math.abs(trim).toFixed(2)} m ${Math.abs(trim) < 0.01 ? 'even keel' : trim > 0 ? 'by STERN' : 'by HEAD'}`;
    g.dataset.state = Math.abs(heel) > 2 ? 'alarm' : 'ok';
  };
}

export default {
  id: 'ballast', en: 'Ballast System', es: 'Lastre',
  render(ctx) {
    const els = [{ t: 'custom', draw: hullPlan }];
    const sucOn = (p) => pumping(p);
    const fillOn = (p) => pumping(p) && p.c['v-bl-fill'].open;
    // Colectores
    els.push(
      { t: 'pipe', d: `M150 ${Y_SUC} H835`, fluid: 'sw', on: sucOn },
      { t: 'pipe', d: `M150 ${Y_FILL} H835`, fluid: 'sw', on: fillOn },
    );
    for (const t of BALLAST) {
      const r = PLAN[t.id];
      const cx = r.x + r.w / 2;
      const top = r.y < 165 && r.y + r.h < 165; // fila de babor
      const centre = !top && r.y < 165; // tanques en crujía (piques)
      if (centre) {
        const ex = t.id === 'blFP' ? r.x : r.x + r.w;
        const vx = t.id === 'blFP' ? 835 : 150;
        els.push(
          { t: 'pipe', d: `M${ex} ${Y_SUC} H${vx}`, fluid: 'sw', on: (p) => pumping(p) && p.c[`vs-${t.id}`].open },
          { t: 'pipe', d: `M${ex} ${Y_FILL} H${vx}`, fluid: 'sw', on: (p) => fillOn(p) && p.c[`vf-${t.id}`].open },
          { t: 'valve', id: `vs-${t.id}`, x: vx, y: Y_SUC, s: 7 },
          { t: 'valve', id: `vf-${t.id}`, x: vx, y: Y_FILL, s: 7 },
        );
      } else {
        const edge = top ? r.y + r.h : r.y;
        const vy = top ? 137 : 194;
        els.push(
          { t: 'pipe', d: `M${cx - 16} ${edge} V${Y_SUC}`, fluid: 'sw', on: (p) => pumping(p) && p.c[`vs-${t.id}`].open },
          { t: 'pipe', d: `M${cx + 16} ${edge} V${Y_FILL}`, fluid: 'sw', on: (p) => fillOn(p) && p.c[`vf-${t.id}`].open },
          { t: 'valve', id: `vs-${t.id}`, x: cx - 16, y: vy, s: 7, vertical: true },
          { t: 'valve', id: `vf-${t.id}`, x: cx + 16, y: vy, s: 7, vertical: true },
        );
      }
      els.push({ t: 'tank', id: t.id, ...r, en: '', es: '' });
      const ly = centre ? r.y - 8 : top ? r.y - 7 : r.y + r.h + 13;
      els.push({ t: 'label', x: cx, y: ly, en: t.short, es: '', size: 11 });
    }
    els.push(
      { t: 'label', x: 790, y: Y_SUC - 6, en: 'Suction main', es: '', size: 9 },
      { t: 'label', x: 790, y: Y_FILL + 16, en: 'Filling main', es: '', size: 9 },
      { t: 'label', x: 40, y: 16, en: 'Each tank: left valve = suction, right valve = filling', es: 'Cada tanque: válvula izquierda = aspiración, derecha = llenado', size: 11, anchor: 'start' },
    );
    // Cámara de bombas de lastre
    const seaIn = (p) => pumping(p) && p.c['v-bl-sea'].open;
    els.push(
      // Subida del colector de aspiración y del de llenado
      { t: 'pipe', d: `M318 ${Y_SUC} V435 H405`, fluid: 'sw', on: sucOn },
      { t: 'pipe', d: 'M110 555 H130 V435 H318', fluid: 'sw', on: seaIn },
      { t: 'pipe', d: 'M405 435 V410 H425 M405 435 V490 H425', fluid: 'sw', on: sucOn },
      { t: 'pipe', d: 'M455 410 H485 V490 H455 M485 450 H540', fluid: 'sw', on: pumping },
      { t: 'pipe', d: 'M660 450 H700', fluid: 'sw', on: pumping },
      { t: 'pipe', d: `M700 450 V360 H622 V${Y_FILL}`, fluid: 'sw', on: fillOn },
      { t: 'pipe', d: 'M700 450 H780', fluid: 'sw', on: (p) => pumping(p) && p.c['v-bl-ob'].open },
      { t: 'pipe', d: 'M130 555 V590 H600 V470', fluid: 'sw', on: (p) => p.c['v-bl-grav'].open && p.c['v-bl-sea'].open && p.c['v-bl-fill'].open && p.hull.flow > 0.005 && !p.c.bp1.run && !p.c.bp2.run },
      { t: 'box', x: 25, y: 530, w: 85, h: 50, en: 'Sea chest', es: 'Caja de mar', size: 11 },
      { t: 'valve', id: 'v-bl-sea', x: 130, y: 500, vertical: true, en: 'Sea suction', es: 'Aspiración de mar', lx: 50, ly: 4 },
      { t: 'pump', id: 'bp1', x: 440, y: 410, r: 15, ly: -22 },
      { t: 'pump', id: 'bp2', x: 440, y: 490, r: 15 },
      { t: 'box', x: 540, y: 425, w: 120, h: 50, en: 'BWTS', es: 'Filtro + UV', face: 'bwts-panel', size: 13,
        state: (p) => (p.c.bwts.fault || p.alarms['bl-bwts']?.active ? 'alarm' : bwtsReady(p) ? 'run' : p.c.bwts.run ? 'warn' : 'stop') },
      { t: 'valve', id: 'v-bl-fill', x: 700, y: 395, vertical: true, en: 'To filling main', es: 'Al colector de llenado', lx: -60, ly: 4 },
      { t: 'valve', id: 'v-bl-ob', x: 745, y: 450, en: 'Overboard', es: 'Al mar' },
      { t: 'label', x: 785, y: 455, en: '⇨', es: '', size: 16, anchor: 'start' },
      { t: 'valve', id: 'v-bl-grav', x: 360, y: 590, en: 'Gravity ballasting', es: 'Lastrado por gravedad' },
      { t: 'value', x: 180, y: 365, w: 110, get: (p) => p.hull.flow * 3600, unit: 'm³/h', dec: 0, en: 'Ballast flow', es: 'Caudal de lastre' },
      { t: 'value', x: 180, y: 430, w: 110, get: (p) => BALLAST.reduce((s, t) => s + p.c[t.id].level, 0) * 1.025, unit: 't', dec: 0, en: 'Total ballast', es: 'Lastre total' },
      { t: 'value', x: 540, y: 520, w: 120, get: (p) => (p.c.bwts.fault ? 'FAULT' : bwtsReady(p) ? 'READY' : p.c.bwts.run ? 'WARMING UP' : 'OFF'), en: 'BWTS status', es: 'Estado del BWTS', warn: (p) => p.alarms['bl-bwts']?.active || p.c.bwts.fault, face: 'bwts-panel' },
      { t: 'custom', draw: stabilityDraw },
    );
    const m = mimic(els, ctx, { w: 1000, hgt: 620 });
    const secure = btn('Secure ballast system', 'Asegurar el lastre (parar bombas y cerrar válvulas)', () => ctx.act('ballastSecure'));
    return {
      el: h('div', {}, m.el,
        h('div', { class: 'row' }, secure, btn('BWTS panel', 'Panel del BWTS', () => ctx.face('bwts-panel'))),
        h('p', { class: 'muted small' }, bi('Ballasting: BWTS ready → sea suction + filling main + tank filling valves → start a pump. Deballasting: tank suction valves + overboard. Internal transfer (list/trim): suction valve of one tank, filling valve of another.',
          'Lastrar: BWTS preparado → aspiración de mar + colector de llenado + válvulas de llenado → arrancar bomba. Deslastrar: válvulas de aspiración + descarga al mar. Trasiego interno (escora/asiento): aspiración de un tanque y llenado de otro.'))),
      update: m.update,
    };
  },
};
