// Vista «CO2 System»: batería de CO2 de inundación total, armario de disparo, ventilación de la sala de
// máquinas con compuertas cortafuegos, válvulas de cierre rápido y central de detección de incendios.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn } from '../ui/faceplate.js';
import { lamp, push, readout, bi, svg, svgText } from '../ui/widgets.js';
import { ZONES, erSealed } from '../model/safety.js';

const fireAlarm = (p, id) => Boolean(p.alarms[`fire-${id}`]?.active);

// Paso del procedimiento: piloto + texto bilingüe + mando.
function stepRow(n, en, es, color, ...ctrls) {
  const l = lamp({ color });
  const el = h('div', { class: 'row', style: 'align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:4px 0' },
    h('strong', { style: 'min-width:1.4em' }, `${n}.`), l.el, h('span', { style: 'flex:1;min-width:160px' }, bi(en, es)), ...ctrls);
  return { el, set: l.set };
}

registerFace('co2-cabinet', (ctx) => {
  const s1 = stepRow(1, 'Open release cabinet door (pre-alarm siren, fans stop)', 'Abrir el armario de disparo (sirena de prealarma, paro de ventiladores)', 'amber',
    btn('OPEN / CLOSE', 'Abrir / cerrar', () => ctx.act('co2Door', !ctx.p().safety.co2.door)));
  const s2 = stepRow(2, 'Evacuate engine room, confirm headcount', 'Evacuar la sala de máquinas y confirmar el recuento', 'green',
    btn('HEADCOUNT OK', 'Recuento correcto', () => ctx.act('co2Headcount')));
  const s3 = stepRow(3, 'ER ventilation fans stopped', 'Ventiladores de la sala de máquinas parados', 'green',
    btn('FANS EMERG. STOP', 'Parada de emergencia', () => ctx.act('erVentStop'), 'danger'));
  const s4 = stepRow(4, 'Fire dampers and skylight closed', 'Compuertas cortafuegos y lumbrera cerradas', 'green',
    btn('CLOSE DAMPERS', 'Cerrar compuertas', () => ctx.act('close', 'erDampers')), btn('CLOSE SKYLIGHT', 'Cerrar lumbrera', () => ctx.act('close', 'erSkylight')));
  const s5 = stepRow(5, 'Fuel quick-closing valves tripped', 'Válvulas de cierre rápido disparadas', 'green',
    btn('TRIP QCV', 'Disparar cierre rápido', () => ctx.act('qcvRemoteTrip'), 'danger'));
  const s6 = stepRow(6, 'Open pilot cylinder valves', 'Abrir las válvulas de las botellas piloto', 'amber',
    btn('PILOT VALVES', 'Botellas piloto', () => ctx.act('co2Pilot')));
  const s7 = stepRow(7, 'Open main valve: CO2 to engine room', 'Abrir la válvula principal: CO2 a la sala de máquinas', 'red',
    btn('MAIN VALVE', 'Válvula principal', () => ctx.act('co2Main'), 'danger'));
  const bank = readout({ label: 'CO2 bank', es: 'Batería de CO2', unit: '%', dec: 0 });
  const conc = readout({ label: 'ER CO2', es: 'CO2 en la sala', unit: '%', dec: 1 });
  const ox = readout({ label: 'ER oxygen', es: 'Oxígeno en la sala', unit: '%', dec: 1 });
  return {
    en: 'CO2 release cabinet (engine room total flooding)', es: 'Armario de disparo de CO2 (inundación total de la sala de máquinas)',
    body: h('div', { class: 'fp-body' },
      h('p', { class: 'muted small' }, bi('Follow the steps in order. Never release CO2 before the headcount and before the engine room is sealed.', 'Sigue los pasos en orden. No descargues el CO2 sin recuento ni con la sala de máquinas abierta.')),
      s1.el, s2.el, s3.el, s4.el, s5.el, s6.el, s7.el,
      h('div', { class: 'readouts' }, bank.el, conc.el, ox.el),
      h('div', { class: 'row' }, btn('RESET RELEASE', 'Rearmar disparo', () => ctx.act('co2Reset')), btn('RECHARGE BANK', 'Recargar batería', () => ctx.act('co2Recharge')))),
    update(p) {
      const c = p.safety.co2;
      s1.set(c.door); s2.set(c.headcount);
      s3.set(!p.c.erf1.run && !p.c.erf2.run); s4.set(!p.c.erDampers.open && !p.c.erSkylight.open);
      s5.set(p.safety.qcvTripped); s6.set(c.pilot); s7.set(c.main);
      bank.set(c.bank, c.bank < 90); conc.set(c.conc * 100, c.conc > 0.05); ox.set(p.sig.erO2 ?? 21, (p.sig.erO2 ?? 21) < 19);
    },
  };
});

registerFace('fire-panel', (ctx) => {
  const pw = lamp({ color: 'green', label: ['POWER'], es: 'Alimentación' });
  const pf = lamp({ color: 'red', label: ['POWER FAIL'], es: 'Fallo de alimentación', blink: true });
  const ext = readout({ label: 'Portable extinguishers', es: 'Extintores portátiles', dec: 0 });
  const rows = ZONES.map((z) => {
    const ls = ['red', 'amber', 'amber', 'amber'].map((color) => lamp({ color }));
    const el = h('div', { style: 'display:grid;grid-template-columns:minmax(120px,1fr) repeat(4,46px);gap:6px;align-items:center;border-bottom:1px solid var(--line);padding:3px 0' },
      h('div', {}, bi(z.en, z.es), h('div', { class: 'row tight' }, btn('Extinguisher', 'Extintor', () => ctx.act('fireExt', z.id)), btn('Hose', 'Manguera', () => ctx.act('fireHose', z.id)))),
      ...ls.map((l) => l.el));
    return { z, ls, el };
  });
  return {
    en: 'Fire detection panel', es: 'Central de detección de incendios',
    body: h('div', { class: 'fp-body' },
      h('div', { class: 'panel-row' }, pw.el, pf.el),
      h('div', { style: 'display:grid;grid-template-columns:minmax(120px,1fr) repeat(4,46px);gap:6px;font-size:0.7rem;font-weight:700' },
        h('span', {}, bi('Zone · fight the fire', 'Zona · combatir el fuego')), h('span', {}, 'FIRE'), h('span', {}, 'SMK'), h('span', {}, 'HEAT'), h('span', {}, 'FLM')),
      ...rows.map((r) => r.el), ext.el,
      h('p', { class: 'muted small' }, bi('Detectors: SMK smoke, HEAT heat, FLM flame. Powered from the ESB (SMOKE DETECTOR breaker).', 'Detectores: SMK humo, HEAT calor, FLM llama. Alimentada desde el ESB (interruptor SMOKE DETECTOR).'))),
    update(p) {
      pw.set(p.safety.detPower); pf.set(!p.safety.detPower);
      for (const r of rows) {
        const st = p.safety.zones[r.z.id];
        r.ls[0].set(fireAlarm(p, r.z.id)); r.ls[1].set(st.smokeDet); r.ls[2].set(st.heatDet); r.ls[3].set(st.flameDet);
      }
      ext.set(p.safety.extinguishers, p.safety.extinguishers < 2);
    },
  };
});

registerFace('er-vent', (ctx) => {
  const t = readout({ label: 'ER temperature', es: 'Temperatura de la sala', unit: '°C' });
  const fan = (id, en, es) => {
    const l = lamp({ color: 'green', label: [en], es });
    return { l, el: h('div', { class: 'row', style: 'align-items:center' }, l.el, btn('START', 'Arrancar', () => ctx.act('start', id), 'primary'), btn('STOP', 'Parar', () => ctx.act('stop', id))) };
  };
  const f1 = fan('erf1', 'SUPPLY FAN', 'Ventilador de impulsión');
  const f2 = fan('erf2', 'EXHAUST FAN', 'Ventilador de extracción');
  const dmp = lamp({ color: 'white', label: ['DAMPERS OPEN'], es: 'Compuertas abiertas' });
  const sky = lamp({ color: 'white', label: ['SKYLIGHT OPEN'], es: 'Lumbrera abierta' });
  return {
    en: 'Engine room ventilation', es: 'Ventilación de la sala de máquinas',
    body: h('div', { class: 'fp-body' }, f1.el, f2.el,
      h('div', { class: 'row', style: 'align-items:center' }, dmp.el, btn('OPEN', 'Abrir', () => ctx.act('open', 'erDampers')), btn('CLOSE', 'Cerrar', () => ctx.act('close', 'erDampers'))),
      h('div', { class: 'row', style: 'align-items:center' }, sky.el, btn('OPEN', 'Abrir', () => ctx.act('open', 'erSkylight')), btn('CLOSE', 'Cerrar', () => ctx.act('close', 'erSkylight'))),
      btn('VENTILATION EMERGENCY STOP', 'Parada de emergencia de la ventilación', () => ctx.act('erVentStop'), 'danger'),
      t.el,
      h('p', { class: 'muted small' }, bi('The engines and generators heat the engine room: keep both fans running with the dampers open.', 'Los motores y generadores calientan la sala: mantén los dos ventiladores en marcha con las compuertas abiertas.'))),
    update(p) {
      f1.l.set(p.c.erf1.run); f2.l.set(p.c.erf2.run); dmp.set(p.c.erDampers.open); sky.set(p.c.erSkylight.open);
      t.set(p.safety.erTemp, p.safety.erTemp > 52);
    },
  };
});

registerFace('qcv-panel', (ctx) => {
  const tr = lamp({ color: 'red', label: ['QCV TRIPPED'], es: 'Cierre rápido disparado', blink: true });
  const op = lamp({ color: 'green', label: ['QCV OPEN'], es: 'Válvulas abiertas' });
  const bt = push({ color: 'red', label: ['TRIP'], es: 'Disparar', onPress: () => ctx.act('qcvRemoteTrip') });
  const rs = push({ color: 'black', label: ['RESET'], es: 'Rearmar', onPress: () => ctx.act('qcvRemoteReset') });
  return {
    en: 'Quick-closing valves remote trip panel', es: 'Panel remoto de válvulas de cierre rápido',
    body: h('div', { class: 'fp-body' }, h('div', { class: 'panel-row' }, op.el, tr.el, bt.el, rs.el),
      h('p', { class: 'muted small' }, bi('Closes the outlet valves of the fuel oil tanks in the engine room: engines and generators stop for lack of fuel. The emergency generator has its own tank outside the engine room.', 'Cierra las válvulas de salida de los tanques de combustible de la sala de máquinas: motores y generadores se paran por falta de combustible. El generador de emergencia tiene su propio tanque fuera de la sala.'))),
    update(p) { tr.set(p.safety.qcvTripped); op.set(!p.safety.qcvTripped); },
  };
});

export default {
  id: 'co2', en: 'CO2 System', es: 'Sistema de CO2',
  render(ctx) {
    const discharging = (p) => p.safety.co2.discharging;
    const els = [
      // Cuarto de CO2
      { t: 'box', x: 20, y: 40, w: 300, h: 470, en: 'CO2 room', es: 'Local de CO2', ty: 20, size: 12 },
      { t: 'custom', draw(g) {
        const cyl = [];
        for (let i = 0; i < 10; i++) {
          const x = 40 + (i % 5) * 52, y = 80 + Math.floor(i / 5) * 120;
          const body = svg('rect', { x, y, width: 34, height: 100, rx: 14, class: 'mm-tank' });
          const fill = svg('rect', { x: x + 3, y: y + 3, width: 28, height: 94, rx: 11, class: 'mm-fill fluid-co2' });
          g.append(body, fill);
          cyl.push({ fill, y });
        }
        const txt = svgText(170, 330, '', 'mm-val');
        g.append(txt, svgText(170, 316, 'CO2 bank · Batería', 'mm-label'));
        g.classList.add('mm-click');
        g.addEventListener('click', () => ctx.face('co2-cabinet'));
        return (p) => {
          const f = p.safety.co2.bank / 100;
          for (const c of cyl) { c.fill.setAttribute('height', 94 * f); c.fill.setAttribute('y', c.y + 3 + 94 * (1 - f)); }
          txt.textContent = `${p.safety.co2.bank.toFixed(0)} %`;
        };
      } },
      { t: 'pipe', d: 'M60 70 H300 V360', fluid: 'co2', on: discharging },
      { t: 'box', x: 40, y: 380, w: 120, h: 50, en: 'Pilot cylinders', es: 'Botellas piloto', face: 'co2-cabinet', size: 10, state: (p) => (p.safety.co2.pilot ? 'warn' : 'stop') },
      { t: 'box', x: 40, y: 445, w: 260, h: 50, en: 'Release cabinet', es: 'Armario de disparo', face: 'co2-cabinet', size: 12, state: (p) => (p.safety.co2.main ? 'alarm' : p.safety.co2.door ? 'warn' : 'stop') },
      { t: 'box', x: 175, y: 380, w: 125, h: 50, en: 'Main valve', es: 'Válvula principal', face: 'co2-cabinet', size: 10, state: (p) => (p.safety.co2.main ? 'alarm' : 'stop') },
      // Línea de distribución a la sala de máquinas
      { t: 'pipe', d: 'M300 360 H340 V90 H960', fluid: 'co2', on: discharging },
      // Sala de máquinas
      { t: 'box', x: 340, y: 60, w: 640, h: 420, en: 'Engine room', es: 'Sala de máquinas', ty: 470 - 60 - 12, size: 12, state: (p) => (p.sig.fireCount ? 'alarm' : p.safety.co2.conc > 0.05 ? 'warn' : 'stop') },
      { t: 'pipe', d: 'M340 90 H960', fluid: 'co2', on: discharging },
      { t: 'label', x: 650, y: 82, en: 'CO2 nozzles', es: 'Toberas de CO2', size: 9 },
    ];
    ZONES.forEach((z, i) => {
      const x = 360 + (i % 4) * 152, y = 120 + Math.floor(i / 4) * 110;
      els.push({ t: 'box', x, y, w: 140, h: 90, en: z.en, es: z.es, ty: 26, size: 11, face: 'fire-panel',
        state: (p) => (p.safety.zones[z.id].fire > 0.02 && fireAlarm(p, z.id) ? 'alarm' : fireAlarm(p, z.id) ? 'warn' : 'stop') });
      els.push({ t: 'value', x: x + 22, y: y + 54, w: 96, get: (p) => (fireAlarm(p, z.id) ? 'FIRE' : p.safety.zones[z.id].fire > 0.02 && !p.safety.detPower ? '?' : 'normal'), warn: (p) => fireAlarm(p, z.id), face: 'fire-panel' });
    });
    els.push(
      // Ventilación
      { t: 'motor', id: 'erf1', x: 400, y: 360, w: 70, h: 44, icon: '✣', en: 'Supply fan', es: 'Impulsión', face: 'er-vent' },
      { t: 'motor', id: 'erf2', x: 520, y: 360, w: 70, h: 44, icon: '✣', en: 'Exhaust fan', es: 'Extracción', face: 'er-vent' },
      { t: 'valve', id: 'erDampers', x: 640, y: 382, en: 'Fire dampers', es: 'Compuertas', face: 'er-vent' },
      { t: 'valve', id: 'erSkylight', x: 730, y: 382, en: 'Skylight', es: 'Lumbrera', face: 'er-vent' },
      { t: 'value', x: 800, y: 372, w: 90, get: (p) => p.safety.erTemp, unit: '°C', en: 'ER temp.', es: 'Temp. sala', warn: (p) => p.safety.erTemp > 52, face: 'er-vent' },
      { t: 'value', x: 345, y: 545, w: 125, get: (p) => p.sig.erO2 ?? 21, unit: '% O2', en: 'ER oxygen', es: 'Oxígeno en la sala', warn: (p) => (p.sig.erO2 ?? 21) < 19 },
      { t: 'value', x: 485, y: 545, w: 125, get: (p) => p.safety.co2.conc * 100, unit: '% CO2', en: 'ER CO2', es: 'CO2 en la sala', warn: (p) => p.safety.co2.conc > 0.05 },
      { t: 'value', x: 620, y: 545, w: 120, get: (p) => (erSealed(p) ? 'SEALED' : 'OPEN'), en: 'ER openings', es: 'Aberturas de la sala', warn: (p) => p.safety.co2.door && !erSealed(p), face: 'er-vent' },
      { t: 'box', x: 760, y: 520, w: 100, h: 60, en: 'QCV panel', es: 'Cierre rápido', face: 'qcv-panel', size: 11, state: (p) => (p.safety.qcvTripped ? 'alarm' : 'run') },
      { t: 'box', x: 870, y: 520, w: 110, h: 60, en: 'Fire panel', es: 'Central detección', face: 'fire-panel', size: 11, state: (p) => (!p.safety.detPower || p.sig.fireCount ? 'alarm' : 'run') },
      { t: 'value', x: 40, y: 560, w: 260, get: (p) => (p.safety.co2.discharging ? 'DISCHARGING' : p.safety.co2.main ? 'RELEASED' : p.safety.co2.door ? 'PRE-ALARM' : 'READY'), en: 'CO2 system', es: 'Sistema de CO2', warn: (p) => p.safety.co2.door || p.safety.co2.main, face: 'co2-cabinet' },
    );
    const m = mimic(els, ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Open the release cabinet to follow the CO2 release procedure step by step. Click a zone for the fire detection panel.', 'Abre el armario de disparo para seguir el procedimiento de CO2 paso a paso. Toca una zona para ver la central de detección.'))), update: m.update };
  },
};
