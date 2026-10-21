// Vista «Stern Tube Seal»: eje de cola, bocina con chumaceras, sellos de popa y proa con sus tanques
// de cabeza, tanque de gravedad, tanque de retorno y bomba de llenado.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { bi, svg, svgText } from '../ui/widgets.js';

export default {
  id: 'sterntube', en: 'Stern Tube Seal', es: 'Bocina (cierre del eje)',
  render(ctx) {
    const pump = (p) => p.c.stFill.run;
    const els = [
      { t: 'label', x: 500, y: 22, en: 'Stern tube — oil lubricated bearings, aft and forward seals', es: 'Bocina con chumaceras lubricadas por aceite y sellos de popa y proa', size: 14 },
      // Tuberías de alimentación por gravedad
      { t: 'pipe', d: 'M190 200 V300', fluid: 'lo', on: (p) => p.c.stAft.level > 0.004 },
      { t: 'pipe', d: 'M720 200 V300', fluid: 'lo', on: (p) => p.c.stFwd.level > 0.004 },
      { t: 'pipe', d: 'M470 200 V320', fluid: 'lo', on: (p) => p.c.stGrav.level > 0.05 },
      // Bomba de llenado: tanque de retorno → tanques
      { t: 'pipe', d: 'M860 520 H900 V60', fluid: 'lo', on: pump },
      { t: 'pipe', d: 'M900 120 H530', fluid: 'lo', on: (p) => pump(p) && p.c['v-st-grav'].open },
      { t: 'pipe', d: 'M900 60 H230 V100', fluid: 'lo', on: (p) => pump(p) && p.c['v-st-aft'].open },
      { t: 'pipe', d: 'M900 75 H770 V100', fluid: 'lo', on: (p) => pump(p) && p.c['v-st-fwd'].open },
      { t: 'pipe', d: 'M470 380 V520 H690', fluid: 'lo', on: (p) => Math.abs(p.sig.meRpm ?? 0) > 1 },
      { t: 'tank', id: 'stAft', x: 140, y: 100, w: 100, h: 70, en: 'Aft seal tank', es: 'Tanque sello de popa' },
      { t: 'tank', id: 'stFwd', x: 670, y: 100, w: 100, h: 70, en: 'Fwd seal tank', es: 'Tanque sello de proa' },
      { t: 'tank', id: 'stGrav', x: 410, y: 80, w: 120, h: 90, en: 'LO gravity tank', es: 'Tanque de gravedad' },
      { t: 'tank', id: 'stDrain', x: 690, y: 480, w: 120, h: 80, en: 'LO drain tank', es: 'Tanque de retorno' },
      { t: 'pump', id: 'stFill', x: 840, y: 520, r: 18, en: 'Filling pump', es: 'Bomba de llenado', ly: 34 },
      { t: 'valve', id: 'v-st-grav', x: 600, y: 120, en: 'To gravity', es: 'Al de gravedad', ly: 22 },
      { t: 'valve', id: 'v-st-aft', x: 300, y: 60, en: 'To aft seal', es: 'Al sello de popa', ly: -18 },
      { t: 'valve', id: 'v-st-fwd', x: 820, y: 75, en: 'To fwd seal', es: 'Al de proa', ly: 22 },
      // Eje, bocina, hélice y sellos (dibujo propio)
      { t: 'custom', draw(g) {
        g.append(svg('rect', { x: 150, y: 300, width: 620, height: 80, rx: 8, class: 'mm-box' }));
        const shaft = svg('rect', { x: 40, y: 330, width: 900, height: 20, rx: 4, class: 'a-shaft' });
        g.append(shaft);
        g.append(svg('path', { d: 'M40 270 L80 330 L80 350 L40 410 L20 400 L55 340 L20 280 Z', class: 'a-rudder' }));
        g.append(svg('rect', { x: 140, y: 296, width: 24, height: 88, rx: 3, class: 'a-seal' }), svg('rect', { x: 756, y: 296, width: 24, height: 88, rx: 3, class: 'a-seal' }));
        g.append(svg('rect', { x: 200, y: 318, width: 140, height: 44, rx: 4, class: 'a-brg' }), svg('rect', { x: 580, y: 318, width: 120, height: 44, rx: 4, class: 'a-brg' }));
        g.append(svgText(270, 400, 'Aft bearing · chumacera de popa', 'mm-val'), svgText(640, 400, 'Fwd bearing · de proa', 'mm-val'));
        g.append(svgText(150, 290, 'Aft seal', 'mm-val'), svgText(770, 290, 'Fwd seal', 'mm-val'), svgText(40, 430, 'Propeller · hélice', 'mm-val', 'start'));
        const t = svgText(270, 344, '', 'mm-val');
        const r = svgText(880, 320, '', 'mm-val');
        g.append(t, r);
        return (p) => {
          t.textContent = `${p.st.brgT.toFixed(1)} °C`;
          r.textContent = `${(p.sig.meRpm ?? 0).toFixed(0)} rpm`;
          shaft.classList.toggle('turning', Math.abs(p.sig.meRpm ?? 0) > 1);
          g.dataset.state = p.st.brgT > 60 ? 'alarm' : 'ok';
        };
      } },
      { t: 'value', x: 40, y: 470, w: 140, en: 'Aft bearing temp.', es: 'Temp. chumacera popa', get: (p) => p.st.brgT, unit: '°C', dec: 1, warn: (p) => p.st.brgT > 60 },
      { t: 'value', x: 200, y: 470, w: 140, en: 'Shaft speed', es: 'Revoluciones del eje', get: (p) => p.sig.meRpm ?? 0, unit: 'rpm', dec: 0, nav: 'me' },
      { t: 'value', x: 360, y: 470, w: 140, en: 'Stern tube LO', es: 'Aceite de bocina', get: (p) => (p.sig.sternLoOk ? 'NORMAL' : 'ABNORMAL'), warn: (p) => !p.sig.sternLoOk },
    ];
    const m = mimic(els, ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Keep the header tanks above 30 % with the filling pump. An aft seal leak pollutes the sea; low gravity tank level overheats the aft bearing (ME slowdown above 70 °C).', 'Mantén los tanques de cabeza por encima del 30 % con la bomba de llenado. Una fuga por el sello de popa contamina el mar; con poco aceite en el tanque de gravedad se calienta la chumacera de popa (slowdown del motor por encima de 70 °C).'))),
      update: m.update,
    };
  },
};
