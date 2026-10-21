// Fichas (faceplates) de los equipos: ventana flotante con el estado y los mandos de cada componente.
// Las vistas pueden registrar fichas propias con registerFace(id, builder).
import { h } from '../../core/ui.js';
import { bi } from './widgets.js';

const custom = {};
// builder(ctx) → { en, es, body: Element, update(p) }
export const registerFace = (id, builder) => { custom[id] = builder; };

const STATUS = {
  run: ['RUNNING', 'En marcha'], stop: ['STOPPED', 'Parada'], trip: ['TRIPPED', 'Disparada'], fault: ['FAULT', 'Avería'],
  standby: ['STANDBY', 'En reserva'], nopower: ['NO POWER', 'Sin tensión'],
};

export function statusLine() {
  const el = h('div', { class: 'fp-status' });
  return {
    el,
    set(key, extra = '') {
      const [en, es] = STATUS[key] ?? [key, ''];
      el.dataset.state = key;
      el.replaceChildren(h('strong', { lang: 'en' }, en), h('span', {}, ` · ${es}${extra}`));
    },
  };
}

export const btn = (en, es, onclick, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, onclick }, bi(en, es));

function motorFace(ctx, id) {
  const m = ctx.p().c[id];
  const st = statusLine();
  const info = h('p', { class: 'muted small' });
  const resetBtn = btn('Reset trip', 'Rearmar disparo', () => ctx.act('resetTrip', id));
  const sbBtn = btn('Standby', 'Reserva', () => ctx.act('standby', id));
  const autoBtn = 'auto' in m ? btn('Auto / Manual', 'Automático / manual', () => ctx.act('compAuto', id, !ctx.p().c[id].auto)) : null;
  const body = h('div', { class: 'fp-body' }, st.el,
    h('div', { class: 'row' }, btn('START', 'Arrancar', () => ctx.act('start', id), 'primary'), btn('STOP', 'Parar', () => ctx.act('stop', id)), sbBtn, autoBtn, resetBtn),
    info);
  return {
    en: m.en, es: m.es, body,
    update(p) {
      const c = p.c[id];
      const powered = p.sig[c.bus === 'ESB' ? 'esbLive' : 'msbLive'] && (!c.feeder || (p.feeders[c.feeder].on && !p.feeders[c.feeder].trip));
      st.set(c.trip ? 'trip' : c.fault ? 'fault' : c.run ? 'run' : !powered ? 'nopower' : c.standby ? 'standby' : 'stop');
      resetBtn.classList.toggle('hidden', !c.trip);
      sbBtn.classList.toggle('primary', c.standby);
      sbBtn.classList.toggle('hidden', c.kind !== 'pump');
      if (autoBtn) autoBtn.querySelector('small').textContent = c.auto ? 'Automático (presostato)' : 'Manual';
      info.textContent = `${c.bus} · ${c.kw} kW${c.load !== 1 && c.run ? ` (${Math.round(c.load * 100)} %)` : ''} · ${c.hours.toFixed(1)} h${'auto' in c ? ` · ${c.auto ? 'AUTO' : 'MANUAL'}` : ''}`;
    },
  };
}

function valveFace(ctx, id) {
  const v = ctx.p().c[id];
  const st = h('div', { class: 'fp-status' });
  const slider = v.kind === 'cvalve' ? h('input', { type: 'range', min: 0, max: 100, step: 1, oninput: (e) => ctx.act('setPos', id, Number(e.target.value) / 100) }) : null;
  const autoBtn = v.kind === 'cvalve' ? btn('Auto / Manual', 'Automático / manual', () => ctx.act('setAuto', id, !ctx.p().c[id].auto)) : null;
  const body = h('div', { class: 'fp-body' }, st,
    h('div', { class: 'row' }, btn('OPEN', 'Abrir', () => ctx.act('open', id), 'primary'), btn('CLOSE', 'Cerrar', () => ctx.act('close', id)), autoBtn),
    slider ? h('label', {}, bi('Position (manual)', 'Posición (manual)'), slider) : null);
  return {
    en: v.en, es: v.es, body,
    update(p) {
      const c = p.c[id];
      st.dataset.state = c.fault ? 'fault' : c.open ? 'run' : 'stop';
      st.textContent = c.kind === 'cvalve'
        ? `${Math.round(c.pos * 100)} % ${c.auto ? 'AUTO' : 'MANUAL'} · ${c.auto ? 'automática' : 'manual'}`
        : c.fault ? 'STUCK · Atascada' : c.open ? 'OPEN · Abierta' : 'CLOSED · Cerrada';
      if (slider && document.activeElement !== slider) slider.value = Math.round(c.pos * 100);
      if (slider) slider.disabled = c.auto;
    },
  };
}

function tankFace(ctx, id) {
  const t = ctx.p().c[id];
  const v = h('div', { class: 'fp-status' });
  return {
    en: t.en, es: t.es, body: h('div', { class: 'fp-body' }, v),
    update(p) {
      const c = p.c[id];
      v.textContent = c.kind === 'receiver'
        ? `${c.press.toFixed(1)} bar (max ${c.max})`
        : `${c.level.toFixed(c.cap < 10 ? 2 : 1)} m³ / ${c.cap} m³ · ${((100 * c.level) / c.cap).toFixed(0)} % · ${c.temp.toFixed(0)} °C`;
    },
  };
}

// Abre la ficha en el panel flotante. Devuelve el objeto de actualización.
export function buildFace(ctx, id) {
  if (custom[id]) return custom[id](ctx);
  const c = ctx.p().c[id];
  if (!c) return null;
  if ('cmd' in c) return motorFace(ctx, id);
  if (c.kind === 'valve' || c.kind === 'cvalve') return valveFace(ctx, id);
  return tankFace(ctx, id);
}
