// Vista «Emergency Generator»: local del generador de emergencia como en el simulador real
// (motor con HS y LCP, cargador de baterías, flaps, tanque de diésel y cuadro de emergencia).
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { meter, lamp, knob, readout, bi, svg, svgText } from '../ui/widgets.js';

const egRun = (p) => ['running', 'cooldown'].includes(p.elec.eg.state);
const EG_STATE = {
  stopped: ['STOPPED', 'Parado'], cranking: ['CRANKING', 'Virando (arranque)'], pause: ['START PAUSE', 'Pausa entre intentos'],
  running: ['RUNNING', 'En marcha'], cooldown: ['COOLING DOWN', 'Enfriamiento'],
};

registerFace('eg-lcp', (ctx) => {
  const st = statusLine();
  const mode = knob({ positions: [{ value: 'remote', label: 'Remote/Auto' }, { value: 'local', label: 'Local' }], marks: ['REM', 'LOC'], label: ['CONTROL', 'REMOTE · LOCAL'], es: 'Control remoto/automático · local', onSelect: (v) => ctx.act('egLcp', v) });
  const rpm = meter({ unit: 'rpm', max: 2000, labels: [[0, '0'], [0.5, '1000'], [1, '2000']], red: [0.95, 1] });
  const lo = meter({ unit: 'LO bar', max: 6, red: [0, 0.2] });
  const cw = meter({ unit: '°C', max: 120, labels: [[0, '0'], [0.5, '60'], [1, '120']], red: [0.83, 1] });
  const lRun = lamp({ color: 'green', label: ['RUNNING'], es: 'En marcha' });
  const lFail = lamp({ color: 'red', label: ['START', 'FAILURE'], es: 'Fallo de arranque', blink: true });
  const lShut = lamp({ color: 'red', label: ['SHUTDOWN'], es: 'Parada', blink: true });
  const lAuto = lamp({ color: 'white', label: ['AUTO', 'READY'], es: 'Listo en automático' });
  const estop = btn('EMERGENCY STOP', 'Parada de emergencia', () => ctx.act('egEstop', !ctx.p().elec.eg.estop), 'danger');
  const batt = readout({ label: 'Battery', es: 'Batería', unit: 'V' });
  const att = readout({ label: 'Start attempts', es: 'Intentos de arranque', dec: 0 });
  return {
    en: 'Emergency generator local control panel (LCP)', es: 'Panel de control local del generador de emergencia',
    body: h('div', { class: 'fp-body' }, st.el,
      h('div', { class: 'panel-row' }, mode.el, lRun.el, lAuto.el, lFail.el, lShut.el),
      h('div', { class: 'panel-row meters3' }, rpm.el, lo.el, cw.el),
      h('div', { class: 'row' }, btn('START', 'Arrancar', () => ctx.act('egStart'), 'primary'), btn('STOP', 'Parar', () => ctx.act('egStop')), btn('RESET', 'Rearmar', () => ctx.act('egLcpReset')), estop),
      h('div', { class: 'readouts' }, batt.el, att.el)),
    update(p) {
      const e = p.elec.eg;
      st.set(EG_STATE[e.state][0], '');
      st.el.replaceChildren(h('strong', { lang: 'en' }, EG_STATE[e.state][0]), h('span', {}, ` · ${EG_STATE[e.state][1]}`));
      st.el.dataset.state = egRun(p) ? 'run' : 'stop';
      mode.set(e.lcp);
      rpm.set(e.rpm); lo.set(e.loPress); cw.set(e.coolT);
      lRun.set(egRun(p)); lFail.set(e.startFail && e.state === 'stopped'); lShut.set(Boolean(p.alarms['eg-shutdown']?.active));
      lAuto.set(e.lcp === 'remote' && e.mode === 'auto' && !e.estop && !e.startFail);
      estop.classList.toggle('on', e.estop);
      estop.querySelector('small').textContent = e.estop ? 'PULSADA · pulsa para desbloquear' : 'Parada de emergencia';
      batt.set(p.elec.battery.v, p.elec.battery.v < 23.5);
      att.set(e.attempts);
    },
  };
});

registerFace('eg-hs', (ctx) => {
  const pr = meter({ unit: 'bar', max: 250, labels: [[0, '0'], [0.4, '100'], [0.8, '200']], red: [0, 0.6] });
  return {
    en: 'Hydraulic starting system (HS)', es: 'Sistema de arranque hidráulico (HS)',
    body: h('div', { class: 'fp-body' },
      h('p', { class: 'muted small' }, 'Arranque de reserva sin baterías: carga el acumulador con la bomba manual (mín. 150 bar) y, con el panel local en LOCAL, acciona la palanca de arranque.'),
      h('div', { class: 'panel-row' }, pr.el),
      h('div', { class: 'row' }, btn('HAND PUMP', 'Bomba manual (pulsa varias veces)', () => ctx.act('egHsPump')), btn('HS START LEVER', 'Palanca de arranque HS', () => ctx.act('egHsStart'), 'primary'))),
    update(p) { pr.set(p.elec.hs.press); },
  };
});

registerFace('eg-charger', (ctx) => {
  const v = meter({ unit: 'V DC', max: 30, min: 18, labels: [[0, '18'], [0.5, '24'], [1, '30']], red: [0, 0.4] });
  const chg = lamp({ color: 'green', label: ['CHARGING'], es: 'Cargando' });
  const dis = lamp({ color: 'red', label: ['DISCHARGING'], es: 'Descargando' });
  const soc = readout({ label: 'State of charge', es: 'Carga de la batería', unit: '%', dec: 0 });
  return {
    en: 'Battery charger (24 V DC)', es: 'Cargador de baterías (24 V CC)',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, v.el, chg.el, dis.el),
      h('div', { class: 'row' }, btn('CHARGER ON', 'Encender cargador', () => ctx.act('chargerOn', true), 'primary'), btn('CHARGER OFF', 'Apagar cargador', () => ctx.act('chargerOn', false))),
      soc.el,
      h('p', { class: 'muted small' }, 'El cargador se alimenta del cuadro de emergencia (interruptor BATTERY CHARGER). Las baterías arrancan el generador de emergencia y dan el alumbrado transitorio.')),
    update(p) {
      const b = p.elec.battery;
      v.set(b.v); chg.set(b.charging); dis.set(!b.charging); soc.set(b.soc * 100, b.soc < 0.5);
    },
  };
});

registerFace('eg-flaps', (ctx) => {
  const pos = readout({ label: 'Flap position', es: 'Posición de los flaps', unit: '%', dec: 0 });
  const mode = readout({ label: 'Mode', es: 'Modo', dec: 0 });
  const room = readout({ label: 'Room temperature', es: 'Temperatura del local', unit: '°C' });
  return {
    en: 'Flaps of emergency generator room', es: 'Flaps (rejillas) del local del generador de emergencia',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'readouts' }, pos.el, mode.el, room.el),
      h('div', { class: 'row' }, btn('AUTO', 'Automático', () => ctx.act('flapsMode', 'auto'), 'primary'), btn('OPEN', 'Abrir', () => ctx.act('flaps', true)), btn('CLOSE', 'Cerrar', () => ctx.act('flaps', false))),
      h('p', { class: 'muted small' }, 'En automático se abren al arrancar el generador. Cerrados, el local y el agua del radiador se calientan.')),
    update(p) {
      const f = p.elec.flaps;
      pos.set(f.pos * 100); mode.set(f.mode === 'auto' ? 'AUTO' : 'MANUAL'); room.set(p.elec.eg.roomT, p.elec.eg.roomT > 50);
    },
  };
});

registerFace('eg-tank', (ctx) => {
  const lvl = readout({ label: 'Level', es: 'Nivel', unit: 'm³', dec: 2 });
  const qcv = readout({ label: 'Quick-closing valve', es: 'Válvula de cierre rápido', dec: 0 });
  const pump = readout({ label: 'Filling pump', es: 'Bomba de llenado', dec: 0 });
  return {
    en: 'Emergency generator DO tank', es: 'Tanque de diésel del generador de emergencia',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'readouts' }, lvl.el, qcv.el, pump.el),
      h('div', { class: 'row' }, btn('RESET QCV (OPEN)', 'Rearmar válvula (abrir)', () => ctx.act('qcvReset'), 'primary'), btn('CLOSE QCV', 'Cerrar válvula', () => ctx.act('close', 'egQcv'))),
      h('div', { class: 'row' }, btn('FILL PUMP START', 'Arrancar bomba de llenado', () => ctx.act('start', 'egDoPump')), btn('FILL PUMP STOP', 'Parar bomba de llenado', () => ctx.act('stop', 'egDoPump')))),
    update(p) {
      const t = p.c.egDoTank;
      lvl.set(t.level, t.level < 0.4);
      qcv.set(p.c.egQcv.open ? 'OPEN · abierta' : 'CLOSED · cerrada', !p.c.egQcv.open);
      pump.set(p.c.egDoPump.run ? 'RUNNING · en marcha' : 'STOPPED · parada');
    },
  };
});

export default {
  id: 'eg', en: 'Emergency Generator', es: 'Generador de emergencia',
  render(ctx) {
    const st = (p) => (p.alarms['eg-shutdown']?.active || p.elec.eg.startFail ? 'alarm' : egRun(p) ? 'run' : 'stop');
    const m = mimic([
      { t: 'pipe', d: 'M620 455 V560 H760 V530', fluid: 'do', on: egRun },
      { t: 'pipe', d: 'M640 455 V500 H800 V530', fluid: 'do', on: egRun },
      // Motor del generador (dibujo propio)
      { t: 'custom', draw(g) {
        const body = svg('g', { class: 'eg-engine' },
          svg('rect', { x: 520, y: 300, width: 14, height: 160, rx: 3 }),
          svg('rect', { x: 536, y: 330, width: 10, height: 100 }),
          svg('rect', { x: 548, y: 345, width: 240, height: 100, rx: 10 }),
          svg('rect', { x: 560, y: 358, width: 150, height: 52, rx: 4, class: 'eg-inner' }),
          svg('rect', { x: 724, y: 362, width: 56, height: 66, rx: 4, class: 'eg-inner' }));
        g.append(body, svgText(650, 320, 'Emergency Generator', 'mm-label'), svgText(650, 334, 'Generador de emergencia', 'mm-es'));
        const rpm = svgText(630, 392, '', 'mm-val');
        g.append(rpm);
        g.classList.add('mm-click');
        g.addEventListener('click', () => ctx.face('eg-lcp'));
        return (p) => { g.dataset.state = st(p); rpm.textContent = `${p.elec.eg.rpm.toFixed(0)} rpm · ${p.elec.eg.kw.toFixed(0)} kW`; };
      } },
      { t: 'box', x: 800, y: 300, w: 50, h: 30, en: 'HS', es: '', cls: 'hs', face: 'eg-hs', size: 12, state: (p) => (p.elec.hs.press < 150 ? 'alarm' : 'ok') },
      { t: 'box', x: 760, y: 378, w: 50, h: 30, en: 'LCP', es: '', cls: 'lcp', face: 'eg-lcp', size: 12, state: st },
      { t: 'box', x: 680, y: 90, w: 160, h: 120, en: 'Battery Charger', es: 'Cargador de baterías', ty: 40, face: 'eg-charger', state: (p) => (p.elec.battery.charging ? 'ok' : 'alarm') },
      { t: 'value', x: 712, y: 160, get: (p) => p.elec.battery.v, unit: 'V', w: 96, face: 'eg-charger' },
      { t: 'box', x: 290, y: 420, w: 150, h: 110, en: 'Flaps of Em. Gen.', es: 'Flaps del local del G. E.', ty: 36, face: 'eg-flaps', state: (p) => (p.elec.flaps.pos > 0.5 ? 'ok' : egRun(p) ? 'alarm' : 'stop') },
      { t: 'value', x: 317, y: 488, get: (p) => p.elec.flaps.pos * 100, unit: '%', dec: 0, w: 96, face: 'eg-flaps' },
      { t: 'tank', id: 'egDoTank', x: 700, y: 530, w: 140, h: 70, face: 'eg-tank', en: 'Emergency Generator DO Tank', es: 'Tanque de diésel del G. E.' },
      { t: 'valve', id: 'egQcv', x: 857, y: 545, en: 'QCV', es: 'cierre rápido', face: 'eg-tank' },
      { t: 'box', x: 880, y: 200, w: 100, h: 380, en: 'Emergency', es: 'Cuadro de', ty: 170, nav: 'esb', state: (p) => (p.sig.esbLive ? 'run' : 'alarm') },
      { t: 'label', x: 930, y: 400, en: 'Switchboard', es: 'emergencia', size: 12 },
      { t: 'value', x: 885, y: 440, w: 90, get: (p) => (p.sig.esbLive ? 'LIVE' : 'DEAD'), warn: (p) => !p.sig.esbLive, nav: 'esb' },
      { t: 'value', x: 60, y: 120, get: (p) => p.elec.eg.coolT, unit: '°C', en: 'Cooling water', es: 'Agua de refrigeración', warn: (p) => p.elec.eg.coolT > 95, face: 'eg-lcp' },
      { t: 'value', x: 60, y: 180, get: (p) => p.elec.eg.roomT, unit: '°C', en: 'Room temperature', es: 'Temperatura del local', warn: (p) => p.elec.eg.roomT > 50, face: 'eg-flaps' },
      { t: 'value', x: 60, y: 240, get: (p) => p.elec.eg.loPress, unit: 'bar', en: 'Lube oil pressure', es: 'Presión de aceite', face: 'eg-lcp' },
      { t: 'value', x: 60, y: 300, get: (p) => p.elec.hs.press, unit: 'bar', dec: 0, en: 'HS accumulator', es: 'Acumulador HS', warn: (p) => p.elec.hs.press < 150, face: 'eg-hs' },
      { t: 'value', x: 60, y: 360, get: (p) => EG_STATE[p.elec.eg.state][0], en: 'Engine', es: 'Motor', w: 130, face: 'eg-lcp' },
      { t: 'value', x: 60, y: 60, get: (p) => (p.elec.eg.mode === 'auto' ? 'AUTO' : 'MANUAL'), en: 'ESB control', es: 'Control en el ESB', nav: 'esb' },
      { t: 'motor', id: 'egfan', x: 440, y: 120, w: 70, h: 44, icon: '✣', en: 'Room fan', es: 'Ventilador del local' },
    ], ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click any equipment to operate it.', 'Toca cualquier equipo para manejarlo.'))), update: m.update };
  },
};
