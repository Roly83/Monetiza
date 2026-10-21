// Vista «Steering Gear»: local del servomotor con las dos unidades de bomba (nº 1 MSB, nº 2 ESB),
// tanques de aceite hidráulico, válvulas de aislamiento, cilindros (rams), timón y control local NFU.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { lamp, readout, bi, svg, svgText } from '../ui/widgets.js';
import { effectivePumps } from '../model/steering.js';

const deg = (d) => `${Math.abs(d).toFixed(1)}° ${d < -0.05 ? 'P' : d > 0.05 ? 'S' : ''}`;

registerFace('sg-local', (ctx) => {
  const st = h('div', { class: 'fp-status' });
  const lp = lamp({ color: 'green', label: ['NFU', 'PORT'], es: 'Babor' });
  const ls = lamp({ color: 'green', label: ['NFU', 'STBD'], es: 'Estribor' });
  const rud = readout({ label: 'Rudder angle', es: 'Ángulo de timón', dec: 1 });
  return {
    en: 'Steering gear local control (NFU)', es: 'Control local del servo (no seguimiento, NFU)',
    body: h('div', { class: 'fp-body' }, st,
      h('div', { class: 'row' }, btn('REMOTE (bridge)', 'Remoto (puente)', () => ctx.act('sgMode', 'remote'), 'primary'), btn('LOCAL (NFU)', 'Local (NFU)', () => ctx.act('sgMode', 'local'))),
      h('div', { class: 'panel-row' }, lp.el, ls.el),
      h('div', { class: 'row' }, btn('◀ PORT', 'A babor', () => ctx.act('sgNfu', -1)), btn('■ STOP', 'Parar', () => ctx.act('sgNfu', 0)), btn('STBD ▶', 'A estribor', () => ctx.act('sgNfu', 1))),
      rud.el,
      h('p', { class: 'muted small' }, bi('Non-follow-up: the rudder moves while PORT or STBD is selected; select STOP at the wanted angle. Keep in contact with the bridge.', 'No seguimiento: el timón se mueve mientras está seleccionado BABOR o ESTRIBOR; selecciona PARAR en el ángulo deseado. Mantén contacto con el puente.'))),
    update(p) {
      const sg = p.sg;
      st.dataset.state = sg.mode === 'local' ? 'standby' : 'run';
      st.textContent = sg.mode === 'local' ? 'LOCAL CONTROL (NFU) · Control local' : 'REMOTE CONTROL (bridge) · Control remoto (puente)';
      lp.set(sg.mode === 'local' && sg.nfu < 0); ls.set(sg.mode === 'local' && sg.nfu > 0);
      rud.set(deg(sg.rudder));
    },
  };
});

export default {
  id: 'steering', en: 'Steering Gear', es: 'Servomotor',
  render(ctx) {
    const sys = (n) => (p) => p.c[`sgp${n}`].run && p.c[`sg-iso${n}`].open;
    const els = [
      { t: 'label', x: 500, y: 34, en: 'Steering gear — electro-hydraulic, 4 rams, 2 independent systems', es: 'Servomotor electrohidráulico de 4 cilindros y 2 sistemas independientes', size: 14 },
      // Sistema 1 (arriba) y 2 (abajo)
      { t: 'pipe', d: 'M190 200 H260', fluid: 'lo', on: sys(1) },
      { t: 'pipe', d: 'M300 200 H420 V250', fluid: 'lo', on: sys(1) },
      { t: 'pipe', d: 'M300 200 H580 V250', fluid: 'lo', on: sys(1) },
      { t: 'pipe', d: 'M190 460 H260', fluid: 'lo', on: sys(2) },
      { t: 'pipe', d: 'M300 460 H420 V410', fluid: 'lo', on: sys(2) },
      { t: 'pipe', d: 'M300 460 H580 V410', fluid: 'lo', on: sys(2) },
      { t: 'pipe', d: 'M110 200 H143', fluid: 'lo', on: sys(1) },
      { t: 'pipe', d: 'M110 460 H143', fluid: 'lo', on: sys(2) },
      { t: 'tank', id: 'sgTank1', x: 20, y: 165, w: 90, h: 70, en: 'Oil tank No 1', es: 'Tanque de aceite nº 1' },
      { t: 'tank', id: 'sgTank2', x: 20, y: 425, w: 90, h: 70, en: 'Oil tank No 2', es: 'Tanque de aceite nº 2' },
      { t: 'pump', id: 'sgp1', x: 165, y: 200, r: 22, en: 'Pump No 1 (MSB)', es: 'Bomba nº 1 (MSB)', ly: 38 },
      { t: 'pump', id: 'sgp2', x: 165, y: 460, r: 22, en: 'Pump No 2 (ESB)', es: 'Bomba nº 2 (ESB)', ly: 38 },
      { t: 'valve', id: 'sg-iso1', x: 280, y: 200, en: 'Isolating valve 1', es: 'Aislamiento 1', ly: -22 },
      { t: 'valve', id: 'sg-iso2', x: 280, y: 460, en: 'Isolating valve 2', es: 'Aislamiento 2' },
      // Cilindros (rams), caña y timón (dibujo propio)
      { t: 'custom', draw(g) {
        const ram = (x, y) => svg('rect', { x, y, width: 80, height: 40, rx: 6, class: 'mm-body' });
        g.append(ram(380, 250), ram(540, 250), ram(380, 370), ram(540, 370));
        const tiller = svg('g', {});
        tiller.append(svg('rect', { x: 400, y: 324, width: 200, height: 12, rx: 6, class: 'a-tiller' }), svg('circle', { cx: 500, cy: 330, r: 22, class: 'mm-body' }));
        g.append(tiller);
        const rud = svg('g', {});
        rud.append(svg('path', { d: 'M770 330 L960 318 L960 342 Z', class: 'a-rudder' }));
        g.append(svg('circle', { cx: 770, cy: 330, r: 10, class: 'mm-body' }), rud);
        g.append(svgText(865, 250, 'PORT ▲ · babor', 'mm-val'), svgText(865, 420, 'STBD ▼ · estribor', 'mm-val'));
        const val = svgText(500, 300, '', 'mm-val');
        g.append(val);
        return (p) => {
          const a = p.sg.rudder;
          tiller.setAttribute('transform', `rotate(${a} 500 330)`);
          rud.setAttribute('transform', `rotate(${a} 770 330)`);
          val.textContent = `${deg(a)} · helm ${deg(p.sg.helm)}`;
        };
      } },
      { t: 'value', x: 700, y: 110, w: 120, en: 'Rudder angle', es: 'Ángulo de timón', get: (p) => deg(p.sg.rudder), warn: (p) => Boolean(p.alarms['sg-follow']?.active) },
      { t: 'value', x: 840, y: 110, w: 120, en: 'Helm order', es: 'Orden de timón', get: (p) => deg(p.sg.helm), nav: 'bridge' },
      { t: 'value', x: 700, y: 500, w: 120, en: 'Pumps effective', es: 'Bombas útiles', get: (p) => String(effectivePumps(p).length), warn: (p) => !effectivePumps(p).length },
      { t: 'value', x: 840, y: 500, w: 120, en: 'Rudder speed', es: 'Velocidad', get: (p) => 2.45 * effectivePumps(p).length, unit: '°/s', dec: 2 },
      { t: 'box', x: 700, y: 550, w: 260, h: 50, en: 'Local control panel (NFU)', es: 'Panel de control local (NFU)', face: 'sg-local', state: (p) => (p.sg.mode === 'local' ? 'warn' : 'ok') },
    ];
    const m = mimic(els, ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('SOLAS: one pump moves the rudder from 35° on one side to 30° on the other in less than 28 s. Click pumps, valves and tanks to operate them.', 'SOLAS: con una bomba, de 35° a una banda a 30° a la otra en menos de 28 s. Toca bombas, válvulas y tanques para manejarlos.'))),
      update: m.update,
    };
  },
};
