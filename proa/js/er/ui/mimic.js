// Dibuja los esquemas (mimics) de cada sistema a partir de una lista de elementos.
// Los elementos se actualizan en cada vuelta del bucle con el estado de la planta.
//
// Tipos de elemento (coordenadas en el viewBox, por defecto 1000 × 620):
//   pipe   { d, fluid, on(p) }                  tubería; fluye (animada) cuando on(p) es verdadero
//   pump   { id, x, y, r, dir }                 bomba del componente p.c[id]; clic → ficha
//   motor  { id, x, y, w, h, en, es, icon }     compresor, ventilador, depuradora…; clic → ficha
//   valve  { id, x, y, vertical }               válvula todo/nada; clic → abre/cierra
//   tank   { id, x, y, w, h }                   tanque con nivel (p.c[id].level / cap)
//   receiver { id, x, y, w, h }                 botella de aire (p.c[id].press)
//   value  { x, y, get(p), unit, dec, en, es, warn(p), w }   lectura digital
//   label  { x, y, en, es, size, anchor }       rótulo bilingüe
//   box    { x, y, w, h, en, es, face, nav, state(p), small } equipo genérico; clic → ficha o vista
//   hx     { x, y, w, h, en, es }               intercambiador de calor
//   bar    { x, y, w, h, get(p) 0..1, en, es }  barra de nivel/carga
//   custom { draw(g) → update(p) }              dibujo libre
import { svg, svgText } from './widgets.js';

const STATE = (m) => (!m ? 'off' : m.trip ? 'trip' : m.fault ? 'fault' : m.run ? 'run' : m.standby ? 'standby' : 'stop');

function bilabel(g, x, y, en, es, size = 13, anchor = 'middle') {
  const t = svg('text', { x, y, class: 'mm-label', 'text-anchor': anchor, 'font-size': size });
  t.textContent = en;
  g.append(t);
  if (es) {
    const s = svg('text', { x, y: y + size * 1.05, class: 'mm-es', 'text-anchor': anchor, 'font-size': size * 0.72 });
    s.textContent = es;
    g.append(s);
  }
}

export function mimic(elements, ctx, { w = 1000, hgt = 620 } = {}) {
  const root = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'mimic-svg', role: 'img' });
  const pipes = svg('g', { class: 'mm-pipes' });
  const top = svg('g');
  root.append(pipes, top);
  const updates = [];
  const click = (node, fn) => {
    node.classList.add('mm-click');
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.addEventListener('click', fn);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  };
  for (const el of elements) {
    const g = svg('g');
    switch (el.t) {
      case 'pipe': {
        const path = svg('path', { d: el.d, class: `pipe fluid-${el.fluid ?? 'fw'}` });
        pipes.append(path);
        if (el.on) updates.push((p) => path.classList.toggle('flow', Boolean(el.on(p))));
        continue;
      }
      case 'pump': {
        const r = el.r ?? 16;
        const rot = { right: 0, down: 90, left: 180, up: 270 }[el.dir ?? 'right'];
        g.append(svg('circle', { cx: el.x, cy: el.y, r, class: 'mm-body' }));
        g.append(svg('path', { d: `M${el.x - r * 0.55} ${el.y - r * 0.7} L${el.x + r * 0.85} ${el.y} L${el.x - r * 0.55} ${el.y + r * 0.7} Z`, class: 'mm-tri', transform: `rotate(${rot} ${el.x} ${el.y})` }));
        const sb = svgText(el.x + r + 2, el.y - r + 4, 'S', 'mm-sb', 'start');
        g.append(sb);
        const c = ctx.p().c[el.id];
        if (el.en !== false) bilabel(g, el.x + (el.lx ?? 0), el.y + (el.ly ?? r + 14), el.en ?? c?.en, el.es ?? c?.es, el.size ?? 10);
        updates.push((p) => { const m = p.c[el.id]; g.dataset.state = STATE(m); sb.style.display = m?.standby ? '' : 'none'; });
        click(g, () => ctx.face(el.id));
        break;
      }
      case 'motor': {
        g.append(svg('rect', { x: el.x, y: el.y, width: el.w ?? 70, height: el.h ?? 44, rx: 6, class: 'mm-body' }));
        if (el.icon) g.append(svgText(el.x + (el.w ?? 70) / 2, el.y + (el.h ?? 44) / 2 + 5, el.icon, 'mm-icon'));
        if (el.en) bilabel(g, el.x + (el.w ?? 70) / 2, el.y + (el.h ?? 44) + 14, el.en, el.es, 11);
        updates.push((p) => { g.dataset.state = STATE(p.c[el.id]); });
        click(g, () => ctx.face(el.face ?? el.id));
        break;
      }
      case 'valve': {
        const s = el.s ?? 9;
        const d = el.vertical
          ? `M${el.x - s} ${el.y - s} L${el.x + s} ${el.y - s} L${el.x - s} ${el.y + s} L${el.x + s} ${el.y + s} Z`
          : `M${el.x - s} ${el.y - s} L${el.x + s} ${el.y + s} L${el.x + s} ${el.y - s} L${el.x - s} ${el.y + s} Z`;
        g.append(svg('rect', { x: el.x - s - 4, y: el.y - s - 4, width: 2 * s + 8, height: 2 * s + 8, class: 'mm-hit' }));
        g.append(svg('path', { d, class: 'mm-valve' }));
        if (el.en) bilabel(g, el.x + (el.lx ?? 0), el.y + (el.ly ?? s + 13), el.en, el.es, 9);
        updates.push((p) => { const v = p.c[el.id]; g.dataset.state = v?.fault ? 'fault' : v?.open ? 'open' : 'closed'; });
        click(g, () => (el.face ? ctx.face(el.face) : ctx.act('toggle', el.id)));
        break;
      }
      case 'tank': {
        const { x, y } = el;
        const w = el.w ?? 90, hh = el.h ?? 110;
        g.append(svg('rect', { x, y, width: w, height: hh, class: 'mm-tank' }));
        const fill = svg('rect', { x: x + 2, y: y + hh - 2, width: w - 4, height: 0, class: `mm-fill fluid-${el.fluid ?? ctx.p().c[el.id]?.fluid ?? 'fw'}` });
        g.append(fill);
        const val = svgText(x + w / 2, y + hh / 2 + 4, '', 'mm-val');
        g.append(val);
        const c = ctx.p().c[el.id];
        bilabel(g, x + w / 2, y + hh + 14, el.en ?? c?.en, el.es ?? c?.es, el.size ?? 10);
        updates.push((p) => {
          const t = p.c[el.id];
          const f = t ? t.level / t.cap : 0;
          const fh = Math.max(0, (hh - 4) * f);
          fill.setAttribute('y', y + hh - 2 - fh);
          fill.setAttribute('height', fh);
          val.textContent = t ? `${(100 * f).toFixed(0)} % · ${t.level.toFixed(t.cap < 10 ? 2 : 0)} m³` : '';
        });
        click(g, () => ctx.face(el.face ?? el.id));
        break;
      }
      case 'receiver': {
        const w = el.w ?? 50, hh = el.h ?? 110;
        g.append(svg('rect', { x: el.x, y: el.y, width: w, height: hh, rx: w / 2, class: 'mm-tank' }));
        const val = svgText(el.x + w / 2, el.y + hh / 2 + 4, '', 'mm-val');
        g.append(val);
        const c = ctx.p().c[el.id];
        bilabel(g, el.x + w / 2, el.y + hh + 14, el.en ?? c?.en, el.es ?? c?.es, 10);
        updates.push((p) => { const r = p.c[el.id]; val.textContent = `${r.press.toFixed(1)} bar`; g.dataset.state = r.press < 15 ? 'alarm' : 'ok'; });
        click(g, () => ctx.face(el.face ?? el.id));
        break;
      }
      case 'value': {
        const w = el.w ?? 96;
        const rect = svg('rect', { x: el.x, y: el.y, width: w, height: 22, rx: 3, class: 'mm-valbox' });
        const v = svgText(el.x + w - 6, el.y + 16, '', 'mm-val', 'end');
        g.append(rect, v);
        if (el.en) bilabel(g, el.x + w / 2, el.y - 18, el.en, el.es, 9);
        updates.push((p) => {
          let x;
          try { x = el.get(p); } catch { x = null; }
          v.textContent = x === null || x === undefined || Number.isNaN(x) ? '—' : typeof x === 'number' ? `${x.toFixed(el.dec ?? 1)} ${el.unit ?? ''}` : x;
          g.dataset.state = el.warn?.(p) ? 'alarm' : 'ok';
        });
        if (el.face || el.nav) click(g, () => (el.face ? ctx.face(el.face) : ctx.nav(el.nav)));
        break;
      }
      case 'label':
        bilabel(g, el.x, el.y, el.en, el.es, el.size ?? 13, el.anchor ?? 'middle');
        break;
      case 'box': {
        g.append(svg('rect', { x: el.x, y: el.y, width: el.w, height: el.h, rx: 6, class: `mm-box ${el.cls ?? ''}` }));
        bilabel(g, el.x + el.w / 2, el.y + (el.ty ?? el.h / 2), el.en, el.es, el.size ?? 12);
        if (el.state) updates.push((p) => { g.dataset.state = el.state(p); });
        if (el.face || el.nav) click(g, () => (el.face ? ctx.face(el.face) : ctx.nav(el.nav)));
        break;
      }
      case 'hx': {
        const w = el.w ?? 60, hh = el.h ?? 90;
        g.append(svg('rect', { x: el.x, y: el.y, width: w, height: hh, rx: 4, class: 'mm-hx' }));
        for (let i = 1; i < 6; i++) g.append(svg('line', { x1: el.x + 6, y1: el.y + (hh * i) / 6, x2: el.x + w - 6, y2: el.y + (hh * i) / 6, class: 'mm-hxline' }));
        if (el.en) bilabel(g, el.x + w / 2, el.y + hh + 14, el.en, el.es, 10);
        if (el.face) click(g, () => ctx.face(el.face));
        break;
      }
      case 'bar': {
        g.append(svg('rect', { x: el.x, y: el.y, width: el.w, height: el.h, class: 'mm-tank' }));
        const fill = svg('rect', { x: el.x + 2, y: el.y + 2, width: 0, height: el.h - 4, class: 'mm-barfill' });
        g.append(fill);
        if (el.en) bilabel(g, el.x + el.w / 2, el.y + el.h + 13, el.en, el.es, 9);
        updates.push((p) => { const f = Math.max(0, Math.min(1, el.get(p))); fill.setAttribute('width', (el.w - 4) * f); g.dataset.state = f > (el.high ?? 2) ? 'alarm' : 'ok'; });
        break;
      }
      case 'custom':
        updates.push(el.draw(g, ctx));
        break;
      default:
        continue;
    }
    top.append(g);
  }
  // Zoom (útil en el móvil): ajustar al ancho, 150 %, 200 % y 300 %.
  const wrap = document.createElement('div');
  wrap.className = 'mimic-wrap';
  const box = document.createElement('div');
  box.className = 'mimic';
  box.append(root);
  const zooms = [1, 1.5, 2, 3];
  let zi = 0;
  const bar = document.createElement('div');
  bar.className = 'mimic-zoom';
  const mk = (txt, title, d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = txt;
    b.title = title;
    b.addEventListener('click', () => { zi = Math.max(0, Math.min(zooms.length - 1, d === 0 ? 0 : zi + d)); root.style.width = `${zooms[zi] * 100}%`; });
    return b;
  };
  bar.append(mk('−', 'Zoom out · Alejar', -1), mk('⤢', 'Fit · Ajustar', 0), mk('+', 'Zoom in · Acercar', 1));
  wrap.append(bar, box);
  return { el: wrap, update: (p) => { for (const u of updates) u?.(p); } };
}
