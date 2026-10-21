// Vista «Emergency Switchboard»: el cuadro de emergencia como en el simulador real, con la sección
// del generador de emergencia, interruptores de los consumidores, arrancadores y la sección de 24 V.
import { h } from '../../core/ui.js';
import { meter, knob, lamp, push, rotaryBreaker, plate, scale, bi } from '../ui/widgets.js';
import { egCurrent, EG_TRIP_A } from '../model/electrical.js';

const insFrac = (v) => v / (v + 200);
const PHASE = { 1: 1, 2: 0.985, 3: 1.012 };

// Sección del generador de emergencia (como la de la foto del cuadro real).
export function egSection(ctx) {
  const A = meter({ unit: 'A', max: 600, labels: scale(600, 200), red: [EG_TRIP_A / 600, 1] });
  const V = meter({ unit: 'V', max: 600, labels: scale(600, 200) });
  const kW = meter({ unit: 'kW', max: 300, labels: scale(300, 100) });
  const kVar = meter({ unit: 'kVar', max: 200, labels: scale(200, 100) });
  const kO = meter({ unit: 'kΩ', toFrac: insFrac, labels: [[0, '0'], [insFrac(100), '100'], [insFrac(500), '500'], [1, '∞']], red: [0, insFrac(100)] });
  const ph = [1, 2, 3].map((n) => ({ value: n, label: `L${n}` }));
  const selA = knob({ positions: ph, label: ['A-METER', '1-L1 2-L2 3-L3'], es: 'Selector amperímetro', onSelect: (v) => ctx.act('egMeter', 'meterA', v) });
  const selV = knob({ positions: ph, label: ['V-METER', '1-L1 2-L2 3-L3'], es: 'Selector voltímetro', onSelect: (v) => ctx.act('egMeter', 'meterV', v) });
  const lEsb = lamp({ color: 'green', label: ['SUPPLY', 'FROM ESB'], es: 'Tensión en ESB' });
  const lMsb = lamp({ color: 'green', label: ['SUPPLY OF ESB', 'FROM MSB'], es: 'ESB alimentado desde MSB' });
  const lOc = lamp({ color: 'red', label: ['OVERCURRENT', 'TRIP'], es: 'Disparo por sobrecorriente', blink: true });
  const bOff = push({ color: 'red', label: ['GENERATOR', 'BREAKER OFF'], es: 'Abrir interruptor generador', onPress: () => ctx.act('egBreakerOff') });
  const bOn = push({ color: 'white', label: ['GENERATOR', 'BREAKER ON'], es: 'Cerrar interruptor generador', onPress: () => ctx.act('egBreakerOn') });
  const reset = push({ color: 'black', label: ['RESET'], es: 'Rearme', onPress: () => ctx.act('egReset') });
  const tie = knob({ positions: [{ value: 'normal', label: 'Normal' }, { value: 'emergency', label: 'Emergency' }], label: ['CONTROL OF TIE BREAKER TO MSB', '1-NORMAL OPERATION', '2-EMERGENCY SUPPLY OF MSB'], es: 'Acoplamiento al MSB · 1 normal · 2 alimentación de emergencia del MSB', onSelect: (v) => ctx.act('egTieMode', v) });
  const mode = knob({ positions: [{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }], label: ['CONTROL OF EG BREAKER AND', 'TIE BREAKER TO MSB', '1-AUTO 2-MANUAL'], es: 'Control del interruptor del EG y del acoplamiento · 1 auto · 2 manual', onSelect: (v) => ctx.act('egMode', v) });
  const el = h('div', { class: 'eg-board' },
    h('div', { class: 'plate title' }, 'EMERGENCY GENERATOR', h('div', { class: 'plate-es' }, 'Generador de emergencia')),
    h('div', { class: 'meters' },
      h('div', { class: 'meter-col' }, A.el, selA.el), h('div', { class: 'meter-col' }, V.el, selV.el),
      h('div', { class: 'meter-col' }, kW.el), h('div', { class: 'meter-col' }, kVar.el), h('div', { class: 'meter-col' }, kO.el)),
    h('div', { class: 'lamps' }, lEsb.el, lMsb.el, lOc.el, bOff.el, bOn.el, reset.el),
    h('div', { class: 'selectors' }, tie.el, mode.el));
  return {
    el,
    update(p) {
      const e = p.elec.eg;
      A.set(egCurrent(p) * PHASE[e.meterA]);
      V.set(e.v * (e.v ? PHASE[e.meterV] : 0));
      kW.set(e.kw); kVar.set(e.kvar);
      kO.set(p.elec.insulationFault && p.sig.esbLive ? 80 : 2500);
      selA.set(e.meterA); selV.set(e.meterV); tie.set(e.tieMode); mode.set(e.mode);
      lEsb.set(p.sig.esbLive); lMsb.set(e.tie && p.sig.msbLive && !(e.breaker && e.tie)); lOc.set(e.trip);
      bOff.set(!e.breaker); bOn.set(e.breaker);
    },
  };
}

// Interruptor de un consumidor (feeder).
function feederBreaker(ctx, id) {
  const f = ctx.p().feeders[id];
  const b = rotaryBreaker({ label: [f.en], es: f.es, onToggle: () => {
    const x = ctx.p().feeders[id];
    // Disparado: el mando va a OFF (rearme). Después, a ON.
    if (x.trip) { x.trip = false; ctx.act('feeder', id, false); return; }
    ctx.act('feeder', id, !x.on);
  } });
  return { el: b.el, update: (p) => { const x = p.feeders[id]; b.set(x.trip ? 'trip' : x.on ? 'on' : 'off'); } };
}

// Arrancador de motor: interruptor, amperímetro, pilotos, rearme, local/remoto y marcha/paro.
export function starter(ctx, feederId, motorId, title, es) {
  const brk = feederBreaker(ctx, feederId);
  if (!ctx.p().c[motorId]) return { el: h('div', { class: 'starter' }, brk.el, plate([title], es)), update: brk.update };
  const A = meter({ unit: 'A', max: 150, labels: scale(150, 50) });
  const lPow = lamp({ color: 'white', label: ['POWER'], es: 'Tensión' });
  const lOl = lamp({ color: 'amber', label: ['OVERLOAD'], es: 'Sobrecarga' });
  const lRun = lamp({ color: 'green', label: ['RUNNING'], es: 'En marcha' });
  const rst = push({ color: 'blue', label: ['RESET'], es: 'Rearme', onPress: () => ctx.act('resetTrip', motorId) });
  const sel = knob({ positions: [{ value: false, label: 'Remote' }, { value: true, label: 'Local' }], marks: ['REM', 'LOC'], label: ['REMOTE · LOCAL'], es: 'Remoto · local', onSelect: (v) => ctx.act('setLocal', motorId, v) });
  const stop = push({ color: 'red', label: ['STOP'], es: 'Paro', onPress: () => ctx.act('stop', motorId, 'panel') });
  const startB = push({ color: 'green', label: ['START'], es: 'Marcha', onPress: () => ctx.act('start', motorId, 'panel') });
  const el = h('div', { class: 'starter' },
    h('div', { class: 'starter-top' }, brk.el, h('div', { class: 'small-meter' }, A.el), h('div', { class: 'starter-lamps' }, lPow.el, lOl.el, lRun.el)),
    h('div', { class: 'starter-lamps' }, rst.el, sel.el, stop.el, startB.el),
    plate([title], es));
  return {
    el,
    update(p) {
      brk.update(p);
      const m = p.c[motorId];
      const pw = p.feeders[feederId].on && !p.feeders[feederId].trip && (m.bus === 'ESB' ? p.sig.esbLive : p.sig.msbLive);
      A.set(m.run ? (m.kw * m.load * 1000) / (1.732 * 440 * 0.85) : 0);
      lPow.set(pw); lOl.set(m.trip); lRun.set(m.run); sel.set(Boolean(m.local));
    },
  };
}

export default {
  id: 'esb', en: 'Emergency Switchboard', es: 'Cuadro de emergencia', indent: true,
  render(ctx) {
    const parts = [];
    const add = (x) => { parts.push(x); return x.el; };
    const eg = add(egSection(ctx));
    const col1 = h('div', { class: 'sb-col' },
      add(feederBreaker(ctx, 'f-eac')), add(feederBreaker(ctx, 'f-eraux')),
      add(starter(ctx, 'f-lt2', 'ltp2', 'LT FW PUMP No 2', 'Bomba de agua dulce BT nº 2')),
      add(starter(ctx, 'f-efp', 'efp', 'EMERGENCY FIRE PUMP', 'Bomba contraincendios de emergencia')));
    // Sección de 24 V: baterías y cargador.
    const bv = meter({ unit: 'V DC', max: 30, min: 18, labels: [[0, '18'], [0.5, '24'], [1, '30']], red: [0, 0.4], label: ['BATTERY', 'VOLTAGE'], es: 'Tensión baterías' });
    const ca = meter({ unit: 'A DC', max: 60, labels: scale(60, 20), label: ['CHARGING', 'CURRENT'], es: 'Corriente de carga' });
    const lChg = lamp({ color: 'green', label: ['CHARGING'], es: 'Cargando' });
    const lDis = lamp({ color: 'red', label: ['DISCHARGING'], es: 'Descargando' });
    const off = push({ color: 'red', label: ['CHARGER', 'OFF'], es: 'Cargador apagado', onPress: () => ctx.act('chargerOn', false) });
    const on = push({ color: 'green', label: ['CHARGER', 'ON'], es: 'Cargador encendido', onPress: () => ctx.act('chargerOn', true) });
    const col24 = h('div', { class: 'sb-col dc' }, h('div', { class: 'panel-row' }, bv.el, ca.el), h('div', { class: 'panel-row' }, lChg.el, lDis.el), h('div', { class: 'panel-row' }, off.el, on.el), plate(['24 V DC SYSTEM'], 'Sistema de 24 V CC'));
    parts.push({ update(p) { const b = p.elec.battery; bv.set(b.v); ca.set(b.charging ? 4 + 30 * (1 - b.soc) : 0); lChg.set(b.charging); lDis.set(!b.charging); off.set(!p.elec.charger.on); on.set(p.elec.charger.on); } });
    const col2 = h('div', { class: 'sb-col' },
      add(starter(ctx, 'f-sg2', 'sgp2', 'STEERING GEAR PUMP No 2', 'Bomba del servo nº 2')),
      add(feederBreaker(ctx, 'f-nav')), add(feederBreaker(ctx, 'f-gmdss')), add(feederBreaker(ctx, 'f-charger')));
    const col3 = h('div', { class: 'sb-col' },
      add(feederBreaker(ctx, 'f-light1')), add(feederBreaker(ctx, 'f-light2')), add(feederBreaker(ctx, 'f-smoke')), add(feederBreaker(ctx, 'f-egfan')));
    return {
      el: h('div', {},
        h('p', { class: 'muted small' }, bi('Rotary breakers: ON · TRIPPED (middle) · OFF. A tripped breaker must go to OFF (reset) before ON.', 'Interruptores giratorios: ON · DISPARADO (en medio) · OFF. Un interruptor disparado se pasa a OFF (rearme) y después a ON.')),
        h('div', { class: 'switchboard' }, eg, col1, col24, col2, col3)),
      update: (p) => parts.forEach((x) => x.update(p)),
    };
  },
};
