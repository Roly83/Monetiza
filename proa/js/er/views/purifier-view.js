// Vista y ficha comunes de las depuradoras centrífugas (HFO nº 1 y nº 2, aceite del MP y de los generadores).
// La ficha reproduce el panel de control local (tipo EPC): marcha, calentador, sello de agua, alimentación,
// descarga de lodos y caudal.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { meter, lamp, readout, svg, svgText } from '../ui/widgets.js';
import { purState, PUR_STATE } from '../model/fuel.js';

const ALARMS = ['ht', 'lt', 'seal', 'ovf', 'disch', 'feed', 'fail', 'water'];
const anyAlarm = (p, id) => ALARMS.some((k) => p.alarms[`pur-${id}-${k}`]?.active);
const RPM = { hfo: 7200, lo: 7600 };

export function registerPurifierFace(id) {
  registerFace(id, (ctx) => {
    const p0 = ctx.p();
    const s0 = p0.pur[id];
    const st = statusLine();
    const rpm = meter({ unit: 'rpm', max: 8000, labels: [[0, '0'], [0.5, '4000'], [1, '8000']], label: ['BOWL SPEED'], es: 'Velocidad del tambor' });
    const tmp = meter({ unit: '°C', max: 120, labels: [[0, '0'], [0.5, '60'], [1, '120']], red: [(s0.setT + 8) / 120, 1], label: ['OIL TEMP.'], es: 'Temperatura del aceite' });
    const lRun = lamp({ color: 'green', label: ['RUN'], es: 'Marcha' });
    const lHeat = lamp({ color: 'amber', label: ['HEATER'], es: 'Calentador' });
    const lSeal = lamp({ color: 'white', label: ['WATER', 'SEAL'], es: 'Sello de agua' });
    const lFeed = lamp({ color: 'green', label: ['FEED'], es: 'Alimentación' });
    const lDis = lamp({ color: 'amber', label: ['DISCHARGE'], es: 'Descarga', blink: true });
    const lAl = lamp({ color: 'red', label: ['ALARM'], es: 'Alarma', blink: true });
    const flow = readout({ label: 'Throughput', es: 'Caudal', unit: 'L/h', dec: 0 });
    const set = readout({ label: 'Flow set point', es: 'Consigna de caudal', unit: 'L/h', dec: 0 });
    const next = readout({ label: 'Next discharge', es: 'Próxima descarga', unit: 'min', dec: 1 });
    const eff = readout({ label: 'Separation efficiency', es: 'Eficacia de separación', unit: '%', dec: 0 });
    const nd = readout({ label: 'Discharges', es: 'Descargas', dec: 0 });
    const auto = btn('AUTO DISCHARGE', 'Descarga automática', () => ctx.act('purAutoDisch', id, !ctx.p().pur[id].autoDisch));
    const heat = btn('HEATER ON/OFF', 'Calentador sí/no', () => ctx.act('purHeater', id, !ctx.p().pur[id].heater));
    const feed = btn('FEED ON/OFF', 'Alimentación sí/no', () => ctx.act('purFeed', id, !ctx.p().pur[id].feed));
    const m0 = p0.c[id];
    return {
      en: `${m0.en} — local control panel`, es: `${m0.es} — panel de control local`,
      body: h('div', { class: 'fp-body' }, st.el,
        h('div', { class: 'panel-row' }, lRun.el, lHeat.el, lSeal.el, lFeed.el, lDis.el, lAl.el),
        h('div', { class: 'panel-row' }, rpm.el, tmp.el),
        h('div', { class: 'row' }, btn('START', 'Arrancar', () => ctx.act('start', id), 'primary'), btn('STOP', 'Parar', () => ctx.act('stop', id)), heat),
        h('div', { class: 'row' }, btn('WATER SEAL', 'Sello de agua', () => ctx.act('purSeal', id)), feed, btn('DISCHARGE', 'Descargar lodos', () => ctx.act('purDischarge', id)), auto),
        h('div', { class: 'row' },
          btn('FLOW −', 'Menos caudal', () => ctx.act('purRate', id, ctx.p().pur[id].rate - (s0.maxRate > 2000 ? 250 : 100))),
          btn('FLOW +', 'Más caudal', () => ctx.act('purRate', id, ctx.p().pur[id].rate + (s0.maxRate > 2000 ? 250 : 100))),
          btn('ALARM RESET', 'Rearmar alarma', () => ctx.act('purReset', id))),
        h('div', { class: 'readouts' }, flow.el, set.el, next.el, eff.el, nd.el),
        h('p', { class: 'muted small' },
          `Secuencia: abre las válvulas de aspiración y salida → START → espera la velocidad nominal (≈2 min) → calentador hasta ${s0.setT} °C → WATER SEAL → FEED ON. ` +
          'Sin sello de agua el aceite se va al tanque de lodos.')),
      update(p) {
        const s = p.pur[id], m = p.c[id];
        const k = purState(p, id);
        st.el.dataset.state = m.fault ? 'fault' : m.run ? 'run' : 'stop';
        st.el.replaceChildren(h('strong', { lang: 'en' }, m.fault ? 'MOTOR FAULT' : PUR_STATE[k][0]), h('span', {}, ` · ${m.fault ? 'Avería del motor' : PUR_STATE[k][1]}`));
        rpm.set(s.speed * RPM[s.oil]); tmp.set(s.temp);
        lRun.set(m.run); lHeat.set(s.heater); lSeal.set(s.seal || s.sealT > 0); lFeed.set(s.flow > 0); lDis.set(Boolean(s.disch)); lAl.set(anyAlarm(p, id));
        flow.set(s.flow); set.set(s.rate); next.set(s.autoDisch ? s.next / 60 : '—'); eff.set(s.flow > 0 ? s.eff * 100 : '—', s.flow > 0 && s.eff < 0.6); nd.set(s.discharges);
        auto.classList.toggle('primary', s.autoDisch);
        heat.classList.toggle('primary', s.heater);
        feed.classList.toggle('primary', s.feed);
      },
    };
  });
}

// Dibujo del separador (tambor sobre el motor). Clic → panel local.
function bowl(id, x, y, ctx) {
  return {
    t: 'custom',
    draw(g) {
      const body = svg('path', { d: `M${x} ${y} L${x + 120} ${y} L${x + 100} ${y + 70} L${x + 80} ${y + 90} L${x + 40} ${y + 90} L${x + 20} ${y + 70} Z`, class: 'mm-body' });
      const shaft = svg('rect', { x: x + 54, y: y + 90, width: 12, height: 20, class: 'mm-body' });
      const mot = svg('rect', { x: x + 30, y: y + 110, width: 60, height: 40, rx: 4, class: 'mm-body' });
      const val = svgText(x + 60, y + 30, '', 'mm-val');
      const st = svgText(x + 60, y + 48, '', 'mm-val');
      g.append(body, shaft, mot, val, st, svgText(x + 60, y + 136, 'M', 'mm-icon'));
      g.classList.add('mm-click');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.addEventListener('click', () => ctx.face(id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.face(id); } });
      return (p) => {
        const s = p.pur[id], m = p.c[id];
        g.dataset.state = m.fault || anyAlarm(p, id) ? 'fault' : m.run ? 'run' : 'stop';
        val.textContent = `${Math.round(s.speed * RPM[s.oil])} rpm`;
        st.textContent = PUR_STATE[purState(p, id)][0];
      };
    },
  };
}

// opts: { id, src: [tankIds], valves: [ids de selección] , dst: tankId|null (null = vuelve al mismo tanque), fluid }
export function purifierMimic(ctx, { id, src, dst, fluid, selValves = [] }) {
  const s0 = ctx.p().pur[id];
  const feeding = (p) => p.pur[id].flow > 0;
  const els = [
    { t: 'label', x: 500, y: 28, en: ctx.p().c[id].en, es: ctx.p().c[id].es, size: 16 },
    // Vapor al calentador
    { t: 'pipe', d: 'M300 70 V250', fluid: 'steam', on: (p) => p.pur[id].heater && p.c[id].run },
    { t: 'label', x: 300, y: 60, en: 'Steam', es: 'Vapor', size: 10 },
    // Aspiración → calentador → separador
    { t: 'pipe', d: 'M200 380 H270 V330', fluid, on: (p) => p.c[id].run },
    { t: 'pipe', d: 'M330 300 H440 V260 H480', fluid, on: feeding },
    // Recirculación (válvula de 3 vías: alimentación cerrada)
    { t: 'pipe', d: 'M440 300 V430 H200', fluid, on: (p) => p.c[id].run && !feeding(p) },
    { t: 'label', x: 330, y: 448, en: 'Recirculation (feed off)', es: 'Recirculación (sin alimentación)', size: 9 },
    // Salida de aceite limpio
    { t: 'pipe', d: dst ? 'M620 240 H760 V200 H800' : 'M620 240 H700 V90 H130 V140', fluid, on: feeding },
    // Lodos y agua
    { t: 'pipe', d: 'M560 330 V520 H640', fluid: 'bilge', on: (p) => Boolean(p.pur[id].disch) || isSealBroken(p, id) },
    { t: 'pipe', d: 'M610 300 H680 V520', fluid: 'fw', on: (p) => p.pur[id].sealT > 0 || p.pur[id].disch === 'seal' },
    { t: 'label', x: 690, y: 420, en: 'Seal / operating water', es: 'Agua de sello y de maniobra', size: 9, anchor: 'start' },
    { t: 'tank', id: 'sludge', x: 640, y: 480, w: 120, h: 80 },
    { t: 'hx', x: 270, y: 250, w: 60, h: 80, en: 'Heater', es: 'Calentador', face: id },
    bowl(id, 480, 180, ctx),
    { t: 'valve', id: `${id}-suc`, x: 230, y: 380, en: 'Suction', es: 'Aspiración' },
    { t: 'valve', id: `${id}-out`, x: dst ? 720 : 660, y: dst ? 240 : 90, en: 'Outlet', es: 'Salida', ly: dst ? 22 : -22 },
    { t: 'value', x: 40, y: 520, w: 100, get: (p) => p.pur[id].temp, unit: '°C', en: 'Oil temp. (set ' + s0.setT + ')', es: 'Temp. del aceite', warn: (p) => p.pur[id].flow > 0 && Math.abs(p.pur[id].temp - s0.setT) > 8, face: id },
    { t: 'value', x: 160, y: 520, w: 100, get: (p) => p.pur[id].flow, unit: 'L/h', dec: 0, en: 'Throughput', es: 'Caudal', face: id },
    { t: 'value', x: 280, y: 520, w: 100, get: (p) => (p.pur[id].autoDisch ? p.pur[id].next / 60 : 'MANUAL'), unit: 'min', en: 'Next discharge', es: 'Próxima descarga', face: id },
    { t: 'value', x: 400, y: 520, w: 100, get: (p) => p.pur[id].discharges, dec: 0, en: 'Discharges', es: 'Descargas', face: id },
    { t: 'box', x: 820, y: 470, w: 150, h: 60, en: 'Local panel', es: 'Panel local', face: id, cls: 'lcp', size: 12, state: (p) => (anyAlarm(p, id) ? 'alarm' : p.c[id].run ? 'run' : 'stop') },
  ];
  if (src.length === 1) els.push({ t: 'tank', id: src[0], x: 70, y: 140, w: 130, h: 200 });
  else {
    src.forEach((tid, i) => {
      const y = 110 + i * 120;
      els.push({ t: 'tank', id: tid, x: 40, y, w: 110, h: 70 });
      els.push({ t: 'pipe', d: `M150 ${y + 50} H185 V380 H200`, fluid, on: (p) => p.c[selValves[i]].open && p.c[id].run });
      els.push({ t: 'valve', id: selValves[i], x: 172, y: y + 50, en: '', es: '' });
    });
    els.push({ t: 'label', x: 30, y: 470, en: 'Open the valves of ONE generator', es: 'Abre las válvulas de UN solo generador', size: 9, anchor: 'start' });
  }
  if (dst) els.push({ t: 'tank', id: dst, x: 800, y: 120, w: 140, h: 200 });
  return mimic(els, ctx);
}

const isSealBroken = (p, id) => Boolean(p.alarms[`pur-${id}-seal`]?.active || p.alarms[`pur-${id}-ovf`]?.active);

export function purifierView({ id, en, es, viewId, src, dst, fluid, selValves }) {
  registerPurifierFace(id);
  return {
    id: viewId, en, es, indent: true,
    render(ctx) {
      const m = purifierMimic(ctx, { id, src, dst, fluid, selValves });
      return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, 'Click the purifier or the local panel to operate it. · Toca la depuradora o su panel local para manejarla.')), update: m.update };
    },
  };
}
