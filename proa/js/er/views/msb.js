// Vista «Main Switchboard»: paneles de los tres generadores, panel de sincronización,
// gestión de potencia (PMS) e interruptores de los consumidores generales.
import { h } from '../../core/ui.js';
import { meter, knob, lamp, push, synchroscope, plate, scale, bi, rotaryBreaker } from '../ui/widgets.js';
import { dgCurrent, DG_RATED } from '../model/electrical.js';

function genPanel(ctx, n) {
  const A = meter({ unit: 'A', max: 2000, labels: scale(2000, 500), red: [0.85, 1] });
  const kW = meter({ unit: 'kW', max: 1200, labels: scale(1200, 400), red: [DG_RATED / 1200, 1] });
  const Hz = meter({ unit: 'Hz', min: 55, max: 65, labels: [[0, '55'], [0.5, '60'], [1, '65']] });
  const V = meter({ unit: 'V', max: 600, labels: scale(600, 200) });
  const lRun = lamp({ color: 'white', label: ['ENGINE', 'RUNNING'], es: 'Motor en marcha' });
  const lTrip = lamp({ color: 'red', label: ['BREAKER', 'TRIP'], es: 'Disparo interruptor', blink: true });
  const off = push({ color: 'red', label: ['BREAKER', 'OFF'], es: 'Abrir interruptor', onPress: () => ctx.act('breakerOpen', n) });
  const on = push({ color: 'green', label: ['BREAKER', 'ON'], es: 'Cerrar interruptor', onPress: () => ctx.act('breakerClose', n) });
  const gl = push({ color: 'black', label: ['GOVERNOR', 'LOWER'], es: 'Regulador: bajar', onPress: () => ctx.act('governor', n, -1) });
  const gr = push({ color: 'black', label: ['GOVERNOR', 'RAISE'], es: 'Regulador: subir', onPress: () => ctx.act('governor', n, 1) });
  const vl = push({ color: 'black', label: ['AVR', 'LOWER'], es: 'Tensión: bajar', onPress: () => ctx.act('avr', n, -1) });
  const vr = push({ color: 'black', label: ['AVR', 'RAISE'], es: 'Tensión: subir', onPress: () => ctx.act('avr', n, 1) });
  const stp = push({ color: 'red', label: ['ENGINE', 'STOP'], es: 'Parar motor', onPress: () => ctx.act('dgStop', n) });
  const str = push({ color: 'green', label: ['ENGINE', 'START'], es: 'Arrancar motor', onPress: () => ctx.act('dgStart', n) });
  const el = h('div', { class: 'eg-board gen-panel' },
    h('div', { class: 'plate title' }, `GENERATOR No ${n}`, h('div', { class: 'plate-es' }, `Generador nº ${n}`)),
    h('div', { class: 'meters m4' }, A.el, kW.el, Hz.el, V.el),
    h('div', { class: 'lamps l4' }, lRun.el, lTrip.el, off.el, on.el),
    h('div', { class: 'lamps l4' }, gl.el, gr.el, vl.el, vr.el),
    h('div', { class: 'lamps l4' }, stp.el, str.el));
  return {
    el,
    update(p) {
      const g = p.elec.dg[n - 1];
      A.set(dgCurrent(g)); kW.set(g.kw); Hz.set(g.f || 55); V.set(g.v);
      lRun.set(g.state === 'running'); lTrip.set(Boolean(p.alarms[`dg${n}-brtrip`]?.active || p.alarms[`dg${n}-sync`]?.active));
      off.set(!g.breaker); on.set(g.breaker);
    },
  };
}

function syncPanel(ctx) {
  const sc = synchroscope();
  const busHz = meter({ unit: 'Hz', min: 55, max: 65, labels: [[0, '55'], [0.5, '60'], [1, '65']], label: ['BUS', 'FREQUENCY'], es: 'Frecuencia barras' });
  const genHz = meter({ unit: 'Hz', min: 55, max: 65, labels: [[0, '55'], [0.5, '60'], [1, '65']], label: ['INCOMING', 'FREQUENCY'], es: 'Frecuencia entrante' });
  const busV = meter({ unit: 'V', max: 600, labels: scale(600, 200), label: ['BUS', 'VOLTAGE'], es: 'Tensión barras' });
  const genV = meter({ unit: 'V', max: 600, labels: scale(600, 200), label: ['INCOMING', 'VOLTAGE'], es: 'Tensión entrante' });
  const sel = knob({ positions: [1, 2, 3].map((n) => ({ value: n, label: `G${n}` })), marks: ['G1', 'G2', 'G3'], label: ['SYNCHRONIZING', 'SELECTOR'], es: 'Selector de sincronización', onSelect: (v) => ctx.act('syncSelect', v) });
  const lamps = [lamp({ color: 'white', label: ['SYNC', 'LAMP L1'], es: 'Lámpara' }), lamp({ color: 'white', label: ['SYNC', 'LAMP L2'], es: 'Lámpara' }), lamp({ color: 'white', label: ['SYNC', 'LAMP L3'], es: 'Lámpara' })];
  const el = h('div', { class: 'eg-board sync-panel' },
    h('div', { class: 'plate title' }, 'SYNCHRONIZING PANEL', h('div', { class: 'plate-es' }, 'Panel de sincronización')),
    h('div', { class: 'meters m5' }, busHz.el, genHz.el, sc.el, busV.el, genV.el),
    h('div', { class: 'lamps l4' }, sel.el, ...lamps.map((l) => l.el)),
    h('p', { class: 'sb-help' }, bi('Bring the incoming generator slightly FAST (needle turning slowly clockwise) with GOVERNOR RAISE/LOWER, match the voltage, and press BREAKER ON when the needle is at 12 o\'clock (lamps dark).',
      'Pon el generador entrante algo RÁPIDO (aguja girando despacio a la derecha) con el regulador, iguala la tensión y cierra el interruptor con la aguja arriba, a las 12 (lámparas apagadas).')));
  return {
    el,
    update(p) {
      const g = p.elec.dg[p.elec.syncSel - 1];
      const active = g.state === 'running' && !g.breaker && p.sig.msbLive;
      sc.set(g.theta, active);
      busHz.set(p.sig.msbLive ? p.elec.busF : 55); busV.set(p.elec.busV);
      genHz.set(g.f || 55); genV.set(g.v); sel.set(p.elec.syncSel);
      // Método de lámparas apagadas: brillan más cuanto mayor es el desfase.
      const glow = active ? Math.abs(Math.sin((g.theta * Math.PI) / 360)) : 0;
      lamps.forEach((l, i) => { l.set(glow > 0.2); l.el.querySelector('.lamp').style.opacity = active ? 0.35 + 0.65 * glow : ''; void i; });
    },
  };
}

function pmsPanel(ctx) {
  const mode = knob({ positions: [{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }], marks: ['AUTO', 'MAN'], label: ['POWER MANAGEMENT', 'AUTO · MANUAL'], es: 'Gestión de potencia', onSelect: (v) => ctx.act('setPms', v) });
  const load = meter({ unit: '%', max: 120, labels: [[0, '0'], [0.5, '60'], [1, '120']], red: [0.85 / 1.2, 1], label: ['PLANT', 'LOAD'], es: 'Carga de la planta' });
  const lPref = lamp({ color: 'red', label: ['PREFERENTIAL', 'TRIP'], es: 'Disparo preferente', blink: true });
  const rst = push({ color: 'blue', label: ['PREF. TRIP', 'RESET'], es: 'Rearmar disparo preferente', onPress: () => ctx.act('resetPrefTrip') });
  const order = h('select', { onchange: (e) => ctx.act('setPriority', e.target.value.split('').map(Number)) },
    ['123', '213', '312', '132', '231', '321'].map((o) => h('option', { value: o }, `Standby order ${o.split('').join(' → ')}`)));
  const el = h('div', { class: 'eg-board pms-panel' },
    h('div', { class: 'plate title' }, 'POWER MANAGEMENT SYSTEM', h('div', { class: 'plate-es' }, 'Gestión de potencia (PMS)')),
    h('div', { class: 'lamps l4' }, mode.el, load.el, lPref.el, rst.el),
    h('label', { class: 'sb-help' }, bi('Standby start order', 'Orden de arranque en reserva'), order),
    h('p', { class: 'sb-help' }, bi('AUTO: starts a standby generator on blackout or above 85 % load, synchronizes, shares load and stops one at low load.', 'AUTO: arranca un generador de reserva con apagón o por encima del 85 % de carga, sincroniza, reparte la carga y para uno con carga baja.')));
  return {
    el,
    update(p) {
      const on = p.elec.dg.filter((g) => g.breaker);
      const cap = on.reduce((a, g) => a + g.rated, 0);
      mode.set(p.elec.pms);
      load.set(cap ? (100 * p.elec.msbKw) / cap : 0);
      lPref.set(Boolean(p.alarms['pref-trip']?.active) || Object.values(p.feeders).some((f) => f.pref && f.trip));
      if (document.activeElement !== order) order.value = p.elec.priority.join('');
    },
  };
}

function feeders(ctx) {
  const ids = Object.values(ctx.p().feeders).filter((f) => f.bus === 'MSB').map((f) => f.id);
  const list = ids.map((id) => {
    const f = ctx.p().feeders[id];
    const b = rotaryBreaker({ label: [f.en], es: `${f.es}${f.pref ? ' · no esencial' : ''}`, onToggle: () => {
      const x = ctx.p().feeders[id];
      if (x.trip) { x.trip = false; ctx.act('feeder', id, false); return; }
      ctx.act('feeder', id, !x.on);
    } });
    return { el: b.el, update: (p) => { const x = p.feeders[id]; b.set(x.trip ? 'trip' : x.on ? 'on' : 'off'); } };
  });
  return { el: h('div', { class: 'sb-col wide' }, ...list.map((x) => x.el)), update: (p) => list.forEach((x) => x.update(p)) };
}

export default {
  id: 'msb', en: 'Main Switchboard', es: 'Cuadro principal', indent: true,
  render(ctx) {
    const parts = [genPanel(ctx, 1), syncPanel(ctx), genPanel(ctx, 2), genPanel(ctx, 3), pmsPanel(ctx), feeders(ctx)];
    return {
      el: h('div', { class: 'switchboard msb' }, ...parts.map((x) => x.el)),
      update: (p) => parts.forEach((x) => x.update(p)),
    };
  },
};
