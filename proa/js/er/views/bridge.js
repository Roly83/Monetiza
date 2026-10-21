// Vista «Bridge»: consola del puente con el telégrafo de órdenes, indicadores del motor principal,
// puestos de control, protecciones (slowdown/shutdown y anulación), rueda/orden de timón,
// indicador de ángulo de timón, bombas del servo, velocidad y rumbo.
import { h } from '../../core/ui.js';
import { btn } from '../ui/faceplate.js';
import { lamp, push, readout, plate, bi, svg, svgText } from '../ui/widgets.js';
import { ORDERS, CONTROL, SLOWDOWNS, SHUTDOWNS } from '../model/engine.js';
import { effectivePumps } from '../model/steering.js';

// Palanca de telégrafo: lista vertical de órdenes. key: 'tel' | 'ans' | 'loc' (palanca propia);
// marca con «◂» la orden del puente cuando la palanca es la de contestación.
export function telegraph(ctx, key, action, title, es) {
  const rows = ORDERS.map((o, i) => h('button', { type: 'button', class: `tg-row ${o.rpm < 0 ? 'astern' : o.rpm > 0 ? 'ahead' : 'stop'}`, onclick: () => ctx.act(action, i) },
    h('span', { class: 'tg-mark', 'aria-hidden': 'true' }), bi(o.en, o.es), h('span', { class: 'tg-rpm' }, o.rpm ? `${o.rpm > 0 ? '+' : ''}${o.rpm}` : '0')));
  const el = h('div', { class: 'tg' }, plate([title], es), h('div', { class: 'tg-rows' }, [...rows].reverse()));
  return {
    el,
    update(p) {
      const me = p.me;
      rows.forEach((r, i) => {
        r.classList.toggle('on', me[key] === i);
        r.classList.toggle('order', key !== 'tel' && me.tel === i && me[key] !== i);
        r.setAttribute('aria-pressed', String(me[key] === i));
      });
    },
  };
}

// Instrumento de cero central (semicírculo): rpm con signo, ángulo de timón… marker: segunda aguja (orden).
export function dial({ min, max, labels, unit, label, es, left, right, marker = false, red }) {
  const cx = 100, cy = 92, R = 76;
  const pt = (v, r) => { const a = Math.PI * (1 - (v - min) / (max - min)); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const root = svg('svg', { viewBox: '0 0 200 120', class: 'a-dial', role: 'img', 'aria-label': unit });
  root.append(svg('rect', { x: 2, y: 2, width: 196, height: 116, rx: 6, class: 'meter-bezel' }), svg('rect', { x: 8, y: 8, width: 184, height: 104, rx: 4, class: 'meter-dial' }));
  if (left) root.append(svg('path', { d: `M${pt(min, R).join(' ')} A${R} ${R} 0 0 1 ${pt((min + max) / 2, R).join(' ')}`, class: `a-arc ${left}` }));
  if (right) root.append(svg('path', { d: `M${pt((min + max) / 2, R).join(' ')} A${R} ${R} 0 0 1 ${pt(max, R).join(' ')}`, class: `a-arc ${right}` }));
  if (red) root.append(svg('path', { d: `M${pt(red, R).join(' ')} A${R} ${R} 0 0 1 ${pt(max, R).join(' ')}`, class: 'meter-red' }));
  for (const [v, t] of labels) {
    const [x1, y1] = pt(v, R - 2); const [x2, y2] = pt(v, R - 10);
    root.append(svg('line', { x1, y1, x2, y2, class: 'meter-tick' }));
    const [x, y] = pt(v, R - 20);
    root.append(svgText(x, y + 4, t, 'meter-num'));
  }
  root.append(svgText(cx, cy - 22, unit, 'meter-unit'));
  const val = svgText(cx, 110, '', 'a-dial-val');
  const mk = marker ? svg('line', { x1: cx, y1: cy, x2: cx, y2: cy - R, class: 'a-dial-marker' }) : null;
  const needle = svg('line', { x1: cx, y1: cy, x2: cx, y2: cy - R + 6, class: 'meter-needle' });
  if (mk) root.append(mk);
  root.append(needle, svg('circle', { cx, cy, r: 6, class: 'meter-pivot' }), val);
  const el = h('div', { class: 'meter-cell a-dial-cell' }, h('div', { class: 'meter' }, root), label ? plate(label, es) : null);
  return {
    el,
    set(v, m, text) {
      const c = Math.max(min, Math.min(max, v));
      const [x, y] = pt(c, R - 6);
      needle.setAttribute('x2', x); needle.setAttribute('y2', y);
      if (mk && m !== undefined) { const [a, b] = pt(Math.max(min, Math.min(max, m)), R); mk.setAttribute('x2', a); mk.setAttribute('y2', b); }
      val.textContent = text ?? '';
    },
  };
}

export const rpmMeter = (label, es) => dial({ unit: 'rpm', min: -110, max: 110, labels: [[-110, '110'], [-55, '55'], [0, '0'], [55, '55'], [110, '110']], left: 'astern', right: 'ahead', label, es, marker: true });

// Pilotos de control del motor principal: puesto de control, protecciones y estado.
export function meLamps(ctx) {
  const L = {
    bridge: lamp({ color: 'green', label: ['BRIDGE', 'CONTROL'], es: 'Control puente' }),
    ecr: lamp({ color: 'green', label: ['ECR', 'CONTROL'], es: 'Control ECR' }),
    local: lamp({ color: 'green', label: ['LOCAL', 'CONTROL'], es: 'Control local' }),
    req: lamp({ color: 'amber', label: ['TRANSFER', 'REQUEST'], es: 'Petición de transferencia', blink: true }),
    run: lamp({ color: 'green', label: ['ENGINE', 'RUNNING'], es: 'Motor en marcha' }),
    sld: lamp({ color: 'amber', label: ['SLOW', 'DOWN'], es: 'Reducción de carga', blink: true }),
    shd: lamp({ color: 'red', label: ['SHUT', 'DOWN'], es: 'Parada de seguridad', blink: true }),
    ovr: lamp({ color: 'white', label: ['OVERRIDE', 'ACTIVE'], es: 'Anulación activa' }),
    blk: lamp({ color: 'amber', label: ['START', 'BLOCKED'], es: 'Arranque bloqueado' }),
    sf: lamp({ color: 'red', label: ['START', 'FAILURE'], es: 'Fallo de arranque', blink: true }),
    ww: lamp({ color: 'red', label: ['WRONG', 'WAY'], es: 'Sentido erróneo', blink: true }),
    tel: lamp({ color: 'amber', label: ['TELEGRAPH', 'ALARM'], es: 'Orden sin contestar', blink: true }),
  };
  return {
    L,
    update(p) {
      const me = p.me;
      for (const k of ['bridge', 'ecr', 'local']) L[k].set(me.control === k);
      L.req.set(Boolean(me.transferReq));
      L.run.set(me.state === 'running');
      L.sld.set(Boolean(me.slowdown));
      L.shd.set(Boolean(me.shutdown));
      L.ovr.set(me.override);
      L.blk.set(me.blockedT > 0);
      L.sf.set(me.startFail);
      L.ww.set(Boolean(p.alarms['me-wrongway']?.active));
      L.tel.set(Boolean(p.alarms['me-tel']?.active));
    },
  };
}

// Texto del estado de las protecciones del motor (bilingüe).
export function protText(p) {
  const me = p.me;
  const en = [], es = [];
  if (me.shutdown) { en.push(`SHUTDOWN: ${SHUTDOWNS[me.shutdown][0]}`); es.push(`Parada: ${SHUTDOWNS[me.shutdown][1]}`); }
  if (me.slowdown) { en.push(`SLOWDOWN: ${SLOWDOWNS[me.slowdown][0]}${me.override ? ' (cancelled)' : ''}`); es.push(`Slowdown: ${SLOWDOWNS[me.slowdown][1]}${me.override ? ' (anulado)' : ''}`); }
  if (!en.length) { en.push('Safety system normal'); es.push('Sistema de seguridad normal'); }
  return [en.join(' · '), es.join(' · ')];
}

// Indicador de ángulo de timón (con la orden de timón como marca).
function rudderIndicator() {
  return dial({ unit: 'rudder °', min: -35, max: 35, labels: [[-35, '35'], [-20, '20'], [-10, '10'], [0, '0'], [10, '10'], [20, '20'], [35, '35']], left: 'port', right: 'stbd', marker: true, label: ['RUDDER ANGLE · PORT / STBD'], es: 'Ángulo de timón · babor / estribor (marca: orden)' });
}

const HELM = [-35, -20, -10, -5, 0, 5, 10, 20, 35];
const deg = (d) => (d === 0 ? 'MID' : `${Math.abs(d)}°${d < 0 ? 'P' : 'S'}`);

export default {
  id: 'bridge', en: 'Bridge', es: 'Puente',
  render(ctx) {
    const parts = [];
    const tg = telegraph(ctx, 'tel', 'meTelegraph', 'ENGINE TELEGRAPH', 'Telégrafo de órdenes');
    parts.push(tg);
    const rpm = rpmMeter(['ME SPEED'], 'Revoluciones del motor');
    const lamps = meLamps(ctx);
    const L = lamps.L;
    parts.push(lamps);
    const ovr = push({ color: 'white', label: ['SAFETY', 'OVERRIDE'], es: 'Anular protecciones', onPress: () => ctx.act('meOverride') });
    const rst = push({ color: 'blue', label: ['RESET'], es: 'Rearme', onPress: () => ctx.act('meReset') });
    const est = push({ color: 'red', label: ['EMERGENCY', 'STOP'], es: 'Parada de emergencia', onPress: () => ctx.act('meEstop') });
    const acc = push({ color: 'green', label: ['ACCEPT', 'TRANSFER'], es: 'Aceptar transferencia', onPress: () => ctx.act('meTransferAccept') });
    const prot = h('p', { class: 'a-prot' });
    const spd = readout({ label: 'Ship speed', es: 'Velocidad del buque', unit: 'kn', dec: 1 });
    const ctl = readout({ label: 'Control position', es: 'Puesto de control', dec: 0 });
    const ord = readout({ label: 'Telegraph order', es: 'Orden del telégrafo', dec: 0 });
    const pwr = readout({ label: 'ME power', es: 'Potencia del motor', unit: 'kW', dec: 0 });
    const meBox = h('section', { class: 'a-panel' },
      h('div', { class: 'plate title' }, 'MAIN ENGINE', h('div', { class: 'plate-es' }, 'Motor principal')),
      h('div', { class: 'panel-row' }, h('div', { class: 'a-meter' }, rpm.el), L.bridge.el, L.ecr.el, L.local.el, L.req.el, acc.el),
      h('div', { class: 'panel-row' }, L.run.el, L.sld.el, L.shd.el, L.ovr.el, L.blk.el, L.sf.el, L.ww.el, L.tel.el),
      h('div', { class: 'panel-row' }, ovr.el, rst.el, est.el),
      prot,
      h('div', { class: 'row' }, btn('Request ECR control', 'Pasar el control a la ECR (petición)', () => ctx.act('meTransfer', 'ecr'))),
      h('div', { class: 'readouts' }, spd.el, pwr.el, ctl.el, ord.el));
    parts.push({ update(p) {
      rpm.set(p.me.rpm, p.me.setRpm, `${p.me.rpm.toFixed(0)} rpm`);
      ovr.set(p.me.override);
      est.set(p.me.estop);
      acc.set(Boolean(p.me.transferReq));
      const [en, es] = protText(p);
      prot.replaceChildren(bi(en, es));
      prot.classList.toggle('bad', Boolean(p.me.slowdown || p.me.shutdown));
      spd.set(p.sig.shipSpeed ?? 0);
      pwr.set(p.sig.mePowerKw ?? 0);
      ctl.set(`${CONTROL[p.me.control][0]} · ${CONTROL[p.me.control][1]}${p.me.transferReq ? ` → ${CONTROL[p.me.transferReq][0]}?` : ''}`);
      ord.set(`${ORDERS[p.me.tel].en} · ${ORDERS[p.me.tel].es}`);
    } });

    // Gobierno
    const rud = rudderIndicator();
    const helmBtns = HELM.map((d) => h('button', { type: 'button', class: `btn helm ${d < 0 ? 'port' : d > 0 ? 'stbd' : ''}`, onclick: () => ctx.act('sgHelm', d) }, deg(d)));
    const slider = h('input', { type: 'range', min: -35, max: 35, step: 1, value: 0, 'aria-label': 'Helm order / Orden de timón', onchange: (e) => ctx.act('sgHelm', Number(e.target.value)) });
    const helmVal = readout({ label: 'Helm order', es: 'Orden de timón', dec: 0 });
    const rudVal = readout({ label: 'Rudder angle', es: 'Ángulo de timón', dec: 1 });
    const hdg = readout({ label: 'Heading', es: 'Rumbo', unit: '°', dec: 0 });
    const sgMode = readout({ label: 'Steering mode', es: 'Modo del servo', dec: 0 });
    const pumps = [1, 2].map((n) => {
      const run = lamp({ color: 'green', label: [`PUMP No ${n}`, 'RUNNING'], es: `Bomba nº ${n} en marcha` });
      const fail = lamp({ color: 'red', label: [`PUMP No ${n}`, 'FAILURE'], es: `Fallo bomba nº ${n}`, blink: true });
      const start = push({ color: 'green', label: ['START'], es: 'Arrancar', onPress: () => ctx.act('start', `sgp${n}`) });
      const stop = push({ color: 'red', label: ['STOP'], es: 'Parar', onPress: () => ctx.act('stop', `sgp${n}`) });
      return { el: h('div', { class: 'a-pump' }, plate([`STEERING GEAR No ${n}`], `Servo nº ${n} (${n === 1 ? 'MSB' : 'ESB'})`), h('div', { class: 'panel-row' }, run.el, fail.el, start.el, stop.el)),
        update(p) { const m = p.c[`sgp${n}`]; run.set(m.run); fail.set(m.fault || m.trip || Boolean(p.alarms[`sg-p${n}-fail`]?.active) || !p.c[`sg-iso${n}`].open); } };
    });
    pumps.forEach((x) => parts.push(x));
    const sgBox = h('section', { class: 'a-panel' },
      h('div', { class: 'plate title' }, 'STEERING', h('div', { class: 'plate-es' }, 'Gobierno')),
      h('div', { class: 'panel-row' }, h('div', { class: 'a-meter' }, rud.el)),
      h('div', { class: 'helm-row' }, helmBtns),
      h('label', { class: 'helm-slider' }, bi('Wheel / helm order', 'Rueda / orden de timón'), slider),
      pumps[0].el, pumps[1].el,
      h('div', { class: 'readouts' }, helmVal.el, rudVal.el, hdg.el, sgMode.el),
      h('div', { class: 'row' }, btn('Steering gear room', 'Local del servo', () => ctx.nav('steering')), btn('Engine room (ME)', 'Motor principal', () => ctx.nav('me'))));
    parts.push({ update(p) {
      rud.set(p.sg.rudder, p.sg.helm, deg(Math.round(p.sg.rudder)));
      helmBtns.forEach((b, i) => b.classList.toggle('primary', HELM[i] === p.sg.helm));
      if (document.activeElement !== slider) slider.value = p.sg.helm;
      helmVal.set(deg(p.sg.helm));
      rudVal.set(`${Math.abs(p.sg.rudder).toFixed(1)}° ${p.sg.rudder < -0.05 ? 'P' : p.sg.rudder > 0.05 ? 'S' : ''}`, Boolean(p.alarms['sg-follow']?.active));
      hdg.set(p.sg.heading);
      const eff = effectivePumps(p).length;
      sgMode.set(p.sg.mode === 'local' ? 'LOCAL (NFU) · local' : `REMOTE · ${eff} pump${eff === 1 ? '' : 's'} / bomba${eff === 1 ? '' : 's'}`, p.sg.mode === 'local' || !eff);
    } });

    return {
      el: h('div', { class: 'a-bridge' }, h('div', { class: 'a-tgcol' }, tg.el), meBox, sgBox),
      update: (p) => parts.forEach((x) => x.update(p)),
    };
  },
};
