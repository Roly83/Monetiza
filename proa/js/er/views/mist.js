// Vista «Water Mist System»: agua nebulizada de aplicación local (FW), grupo de bombeo, válvulas de
// sección por zona, pulsadores de disparo y modo AUTO (coincidencia de detectores de llama y calor).
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { lamp, push, knob, readout, bi } from '../ui/widgets.js';
import { ZONES } from '../model/safety.js';

const MZ = ZONES.filter((z) => z.mist);
// Rótulos cortos para el esquema.
const SHORT = { dg1: ['DG 1', 'Generador 1'], dg2: ['DG 2', 'Generador 2'], dg3: ['DG 3', 'Generador 3'], purifier: ['Purifiers', 'Depuradoras'], boiler: ['Boiler', 'Caldera'], incin: ['Incinerator', 'Incinerador'], metop: ['ME top', 'MP (alto)'] };

registerFace('wm-panel', (ctx) => {
  const mode = knob({ positions: [{ value: 'manual', label: 'Manual' }, { value: 'auto', label: 'Auto' }], marks: ['MAN', 'AUTO'], label: ['RELEASE MODE'], es: 'Modo de disparo', onSelect: (v) => ctx.act('mistMode', v) });
  const lRun = lamp({ color: 'green', label: ['PUMP RUNNING'], es: 'Bomba en marcha' });
  const lFault = lamp({ color: 'red', label: ['PUMP FAULT'], es: 'Avería de la bomba', blink: true });
  const lReady = lamp({ color: 'white', label: ['AUTO READY'], es: 'Listo en automático' });
  const press = readout({ label: 'Pump pressure', es: 'Presión de la bomba', unit: 'bar', dec: 0 });
  const tank = readout({ label: 'FW tank', es: 'Tanque de agua dulce', unit: '%', dec: 0 });
  const rows = MZ.map((z) => {
    const rel = lamp({ color: 'amber' });
    const fire = lamp({ color: 'red' });
    const pb = push({ color: 'red', onPress: () => ctx.act('mistRelease', z.id) });
    const el = h('div', { style: 'display:grid;grid-template-columns:minmax(120px,1fr) 48px 48px 52px;gap:8px;align-items:center;border-bottom:1px solid var(--line);padding:3px 0' },
      bi(z.en, z.es), fire.el, rel.el, pb.el);
    return { z, rel, fire, el };
  });
  return {
    en: 'Water mist control panel', es: 'Panel de control del agua nebulizada',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, mode.el, lReady.el, lRun.el, lFault.el),
      h('div', { class: 'readouts' }, press.el, tank.el),
      h('div', { style: 'display:grid;grid-template-columns:minmax(120px,1fr) 48px 48px 52px;gap:8px;font-size:0.7rem;font-weight:700' },
        bi('Section', 'Sección'), h('span', {}, 'FIRE'), h('span', {}, 'REL.'), bi('RELEASE', 'Disparo')),
      ...rows.map((r) => r.el),
      h('div', { class: 'row' }, btn('RESET SYSTEM', 'Rearmar sistema', () => ctx.act('mistReset')), btn('PUMP STOP', 'Parar bomba', () => ctx.act('stop', 'wmp')), btn('TANK FILL ON/OFF', 'Llenado del tanque', () => ctx.act('toggle', 'wm-fill'))),
      h('p', { class: 'muted small' }, bi('AUTO: a section is released when flame AND heat detectors of the same zone are activated. Red push button: manual release of the section.', 'AUTO: la sección se dispara cuando actúan a la vez los detectores de llama y de calor de la zona. Pulsador rojo: disparo manual de la sección.'))),
    update(p) {
      const s = p.safety;
      mode.set(s.mist.mode);
      lRun.set(p.c.wmp.run); lFault.set(p.c.wmp.fault);
      lReady.set(s.mist.mode === 'auto' && p.sig.msbLive && !p.c.wmp.fault && s.detPower);
      press.set(s.mist.press, p.c.wmp.run && s.mist.press < 60);
      tank.set((100 * p.c.wmTank.level) / p.c.wmTank.cap, p.c.wmTank.level < 1);
      for (const r of rows) { r.rel.set(p.c[`wm-${r.z.id}`].open); r.fire.set(Boolean(p.alarms[`fire-${r.z.id}`]?.active)); }
    },
  };
});

export default {
  id: 'mist', en: 'Water Mist System', es: 'Agua nebulizada',
  render(ctx) {
    const pumping = (p) => p.c.wmp.run && p.c.wmTank.level > 0.05;
    const els = [
      { t: 'pipe', d: 'M40 70 H130 V110', fluid: 'fw', on: (p) => p.c['wm-fill'].open },
      { t: 'valve', id: 'wm-fill', x: 90, y: 70, en: 'Filling', es: 'Llenado' },
      { t: 'label', x: 40, y: 56, en: 'From FW system', es: 'Del agua dulce', size: 9, anchor: 'start' },
      { t: 'tank', id: 'wmTank', x: 80, y: 110, w: 110, h: 140, en: 'Water mist FW tank', es: 'Tanque de agua nebulizada' },
      { t: 'pipe', d: 'M135 250 V300 H230', fluid: 'fw', on: pumping },
      { t: 'pump', id: 'wmp', x: 250, y: 300, r: 20, en: 'HP pump unit', es: 'Grupo de alta presión' },
      { t: 'pipe', d: 'M270 300 H330 V200 H960', fluid: 'fw', on: pumping },
      { t: 'value', x: 220, y: 400, w: 100, get: (p) => p.safety.mist.press, unit: 'bar', dec: 0, en: 'Pump pressure', es: 'Presión', face: 'wm-panel', warn: (p) => p.c.wmp.run && p.safety.mist.press < 60 },
      { t: 'value', x: 220, y: 460, w: 100, get: (p) => p.safety.mist.mode.toUpperCase(), en: 'Release mode', es: 'Modo de disparo', face: 'wm-panel', warn: (p) => p.safety.mist.mode !== 'auto' },
      { t: 'box', x: 40, y: 480, w: 200, h: 70, en: 'Water mist panel', es: 'Panel del agua nebulizada', face: 'wm-panel', state: (p) => (p.c.wmp.fault ? 'alarm' : p.c.wmp.run ? 'warn' : p.safety.mist.mode === 'auto' ? 'run' : 'stop') },
    ];
    MZ.forEach((z, i) => {
      const x = 400 + i * 85;
      const misting = (p) => pumping(p) && p.c[`wm-${z.id}`].open;
      els.push(
        { t: 'pipe', d: `M${x} 200 V420`, fluid: 'fw', on: misting },
        { t: 'valve', id: `wm-${z.id}`, x, y: 280, vertical: true },
        { t: 'box', x: x - 40, y: 420, w: 80, h: 110, en: SHORT[z.id][0], es: SHORT[z.id][1], ty: 20, size: 10, face: 'wm-panel',
          state: (p) => (misting(p) ? 'run' : p.alarms[`fire-${z.id}`]?.active ? 'alarm' : 'stop') },
        { t: 'custom', draw(g) {
          // Toberas: puntos que se ven cuando la sección descarga.
          const dots = [];
          for (let k = 0; k < 5; k++) {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('cx', x - 24 + k * 12); c.setAttribute('cy', 462 + (k % 2) * 8); c.setAttribute('r', 3);
            c.setAttribute('class', 'fluid-fw');
            g.append(c);
            dots.push(c);
          }
          return (p) => { for (const d of dots) d.style.opacity = misting(p) ? 1 : 0.15; };
        } },
        { t: 'value', x: x - 36, y: 485, w: 72, get: (p) => (p.alarms[`fire-${z.id}`]?.active ? 'FIRE' : misting(p) ? 'MIST' : '—'), warn: (p) => Boolean(p.alarms[`fire-${z.id}`]?.active) },
      );
    });
    els.push({ t: 'label', x: 660, y: 185, en: 'Section valves (local application)', es: 'Válvulas de sección (aplicación local)', size: 11 });
    const m = mimic(els, ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click a section valve to open/close it, or use the panel for release, reset and mode.', 'Toca una válvula de sección para abrirla o cerrarla, o usa el panel para disparar, rearmar y cambiar de modo.'))), update: m.update };
  },
};
