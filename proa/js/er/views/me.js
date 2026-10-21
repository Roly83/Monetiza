// Vista «Main Engine»: esquema del motor principal (6 cilindros, escape, turbosoplante, enfriador,
// colector de barrido, soplantes auxiliares, aire de arranque, virador) y consola de la sala de control (ECR).
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { meter, lamp, push, readout, plate, bi, svg, svgText } from '../ui/widgets.js';
import { ORDERS, CONTROL, CYL, meInterlocks } from '../model/engine.js';
import { telegraph, rpmMeter, meLamps, protText } from './bridge.js';

const STATE = {
  stopped: ['STOPPED', 'Parado'], starting: ['STARTING ON AIR', 'Arrancando con aire'], firing: ['FUEL ADMITTED', 'Entra combustible'],
  running: ['RUNNING', 'En marcha'], stopping: ['STOPPING', 'Parando / frenando'],
};

// Consola de control del motor en la ECR (se usa en la vista y como ficha flotante).
function ecrPanel(ctx, compact = false) {
  const parts = [];
  const st = statusLine();
  const tg = telegraph(ctx, 'ans', 'meAnswer', 'ECR LEVER / TELEGRAPH ANSWER', 'Palanca de la ECR / contestación del telégrafo');
  parts.push(tg);
  const rpm = rpmMeter(['ME SPEED'], 'Revoluciones');
  const lo = meter({ unit: 'LO bar', max: 4, red: [0, 0.45], label: ['LUBE OIL', 'INLET'], es: 'Aceite entrada' });
  const sa = meter({ unit: 'bar', max: 40, labels: [[0, '0'], [0.5, '20'], [1, '40']], red: [0, 0.375], label: ['STARTING', 'AIR'], es: 'Aire de arranque' });
  const lamps = meLamps(ctx);
  parts.push(lamps);
  const L = lamps.L;
  const ovr = push({ color: 'white', label: ['SAFETY', 'OVERRIDE'], es: 'Anular protecciones', onPress: () => ctx.act('meOverride') });
  const rst = push({ color: 'blue', label: ['RESET'], es: 'Rearme', onPress: () => ctx.act('meReset') });
  const est = push({ color: 'red', label: ['EMERGENCY', 'STOP'], es: 'Parada de emergencia', onPress: () => ctx.act('meEstop') });
  const acc = push({ color: 'green', label: ['ACCEPT', 'TRANSFER'], es: 'Aceptar transferencia', onPress: () => ctx.act('meTransferAccept') });
  const order = readout({ label: 'Bridge order', es: 'Orden del puente', dec: 0 });
  const ilk = h('div', { class: 'a-ilk' });
  const prot = h('p', { class: 'a-prot' });
  const tgBtn = btn('Turning gear', 'Virador', () => ctx.act('meTurningGear'));
  const msvBtn = btn('Main starting valve', 'Válvula principal de arranque', () => ctx.act('toggle', 'me-msv'));
  const blwBtn = btn('Aux. blowers AUTO / MAN', 'Soplantes auxiliares auto / manual', () => ctx.act('meBlowerAuto'));
  const cut = Array.from({ length: CYL }, (_, i) => h('button', { type: 'button', class: 'btn a-cut', onclick: () => ctx.act('meCylCut', i + 1) }, bi(`Cyl ${i + 1}`, 'en servicio')));
  const el = h('div', { class: `a-ecr ${compact ? 'compact' : ''}` },
    st.el,
    h('div', { class: 'a-ecr-grid' },
      h('div', {}, tg.el),
      h('div', { class: 'a-ecr-main' },
        h('div', { class: 'panel-row' }, h('div', { class: 'a-meter' }, rpm.el), h('div', { class: 'a-meter' }, lo.el), h('div', { class: 'a-meter' }, sa.el)),
        h('div', { class: 'panel-row' }, L.bridge.el, L.ecr.el, L.local.el, L.req.el, acc.el),
        h('div', { class: 'panel-row' }, L.run.el, L.sld.el, L.shd.el, L.ovr.el, L.blk.el, L.sf.el, L.ww.el, L.tel.el),
        h('div', { class: 'panel-row' }, ovr.el, rst.el, est.el),
        order.el, prot, ilk)),
    h('div', { class: 'row' },
      btn('Request BRIDGE control', 'Pasar control al puente (petición)', () => ctx.act('meTransfer', 'bridge')),
      btn('Request ECR control', 'Pedir control a la ECR', () => ctx.act('meTransfer', 'ecr')),
      btn('LOCAL control', 'Control local (costado del motor)', () => ctx.act('meTransfer', 'local')),
      btn('Local stand: ECR', 'Puesto local: devolver a la ECR', () => ctx.act('meTransfer', 'ecr'))),
    h('div', { class: 'row' }, tgBtn, msvBtn, blwBtn),
    plate(['FUEL PUMP CUT-OUT'], 'Anulación de bombas de combustible'),
    h('div', { class: 'row a-cuts' }, cut));
  parts.push({ update(p) {
    const me = p.me;
    st.el.dataset.state = me.state === 'running' ? 'run' : me.shutdown || me.startFail ? 'trip' : 'stop';
    st.el.replaceChildren(h('strong', { lang: 'en' }, `${STATE[me.state][0]} · ${CONTROL[me.control][0]} CONTROL`), h('span', {}, ` · ${STATE[me.state][1]} · control ${CONTROL[me.control][1]}`));
    rpm.set(me.rpm, me.setRpm, `${me.rpm.toFixed(0)} rpm`); lo.set(p.sig.meLoPress ?? 2.8); sa.set(p.sig.meStartAir ?? 30);
    ovr.set(me.override); est.set(me.estop); acc.set(Boolean(me.transferReq));
    order.set(`${ORDERS[me.tel].en} · ${ORDERS[me.tel].es}`, me.tel !== (me.control === 'local' ? me.loc : me.ans));
    const [en, es] = protText(p);
    prot.replaceChildren(bi(en, es));
    prot.classList.toggle('bad', Boolean(me.slowdown || me.shutdown));
    const list = me.state === 'stopped' ? meInterlocks(p) : [];
    ilk.replaceChildren(list.length
      ? h('div', {}, h('strong', {}, bi('Start interlocks', 'Enclavamientos de arranque')), h('ul', {}, list.map((m) => h('li', {}, bi(m.en, m.es)))))
      : bi(me.state === 'stopped' ? 'Ready to start' : 'Engine turning', me.state === 'stopped' ? 'Listo para arrancar' : 'Motor girando'));
    ilk.classList.toggle('bad', list.length > 0);
    tgBtn.querySelector('small').textContent = me.turningGear ? 'Virador ENGRANADO — pulsa para desengranar' : 'Virador desengranado — pulsa para engranar';
    tgBtn.classList.toggle('danger', me.turningGear);
    msvBtn.querySelector('small').textContent = p.c['me-msv'].open ? 'Válvula de arranque ABIERTA' : 'Válvula de arranque CERRADA';
    msvBtn.classList.toggle('primary', p.c['me-msv'].open);
    blwBtn.querySelector('small').textContent = me.blowerAuto ? 'Soplantes en AUTOMÁTICO' : 'Soplantes en MANUAL';
    cut.forEach((b, i) => { b.classList.toggle('danger', me.cut[i]); b.querySelector('small').textContent = me.cut[i] ? 'ANULADO' : 'en servicio'; });
  } });
  return { el, update: (p) => parts.forEach((x) => x.update(p)) };
}

registerFace('me-ecr', (ctx) => {
  const panel = ecrPanel(ctx, true);
  return { en: 'ME control console (ECR)', es: 'Consola de control del motor principal (ECR)', body: h('div', { class: 'fp-body' }, panel.el), update: panel.update };
});

registerFace('me-local', (ctx) => {
  const tg = telegraph(ctx, 'loc', 'meLocalLever', 'LOCAL CONTROL LEVER', 'Palanca de control local');
  const sel = btn('Select LOCAL control', 'Seleccionar control local', () => ctx.act('meTransfer', 'local'), 'primary');
  const back = btn('Return control to ECR', 'Devolver el control a la ECR', () => ctx.act('meTransfer', 'ecr'));
  const info = h('p', { class: 'muted small' });
  return {
    en: 'ME local control stand (engine side)', es: 'Puesto de control local del motor principal',
    body: h('div', { class: 'fp-body' }, h('div', { class: 'row' }, sel, back), info, tg.el),
    update(p) {
      tg.update(p);
      info.textContent = `${CONTROL[p.me.control][0]} · ${CONTROL[p.me.control][1]} — ${ORDERS[p.me.tel].en} (${ORDERS[p.me.tel].es})`;
    },
  };
});

registerFace('me-tg', (ctx) => {
  const st = h('div', { class: 'fp-status' });
  return {
    en: 'ME turning gear', es: 'Virador del motor principal',
    body: h('div', { class: 'fp-body' }, st,
      h('div', { class: 'row' }, btn('ENGAGE', 'Engranar', () => ctx.act('meTurningGear', true)), btn('DISENGAGE', 'Desengranar', () => ctx.act('meTurningGear', false), 'primary')),
      h('p', { class: 'muted small' }, bi('Engaged = start blocked. Engage only with the engine stopped (maintenance, turning before start).', 'Engranado = arranque bloqueado. Engranar solo con el motor parado (mantenimiento, virar antes de arrancar).'))),
    update(p) { st.dataset.state = p.me.turningGear ? 'trip' : 'run'; st.textContent = p.me.turningGear ? 'ENGAGED · Engranado' : 'DISENGAGED · Desengranado'; },
  };
});

const coolC = (t) => (t > 430 ? 'hot' : t > 380 ? 'warm' : 'ok');

export default {
  id: 'me', en: 'Main Engine', es: 'Motor principal',
  render(ctx) {
    const running = (p) => p.me.state === 'running' || p.me.state === 'firing';
    const els = [
      // Tuberías
      { t: 'pipe', d: 'M500 150 V120 H760', fluid: 'co2', on: running }, // gases de escape a la turbosoplante
      { t: 'pipe', d: 'M880 155 H930 V40', fluid: 'co2', on: running }, // escape a la chimenea
      { t: 'pipe', d: 'M820 190 V250', fluid: 'air', on: running }, // aire de la turbosoplante al enfriador
      { t: 'pipe', d: 'M850 300 H900 V440 H700', fluid: 'air', on: (p) => running(p) || p.c.aux1.run || p.c.aux2.run },
      { t: 'pipe', d: 'M765 515 V490 H660 V466', fluid: 'air', on: (p) => p.c.aux1.run },
      { t: 'pipe', d: 'M875 515 V490 H680 V466', fluid: 'air', on: (p) => p.c.aux2.run },
      { t: 'pipe', d: 'M65 280 V330 H210', fluid: 'air', on: (p) => p.me.state === 'starting' },
      { t: 'pipe', d: 'M145 280 V330', fluid: 'air', on: (p) => p.me.state === 'starting' },
      { t: 'pipe', d: 'M230 330 H300', fluid: 'air', on: (p) => p.me.state === 'starting' },
      // Botellas de aire y válvula principal de arranque
      { t: 'receiver', id: 'mr1', x: 40, y: 150, w: 50, h: 120, en: 'Receiver 1', es: 'Botella 1' },
      { t: 'receiver', id: 'mr2', x: 120, y: 150, w: 50, h: 120, en: 'Receiver 2', es: 'Botella 2' },
      { t: 'valve', id: 'me-msv', x: 220, y: 330, en: 'Main starting valve', es: 'Válv. principal de arranque', ly: 22, lx: -20 },
      // Colector de escape, cilindros, bancada y colector de barrido (dibujo propio)
      { t: 'custom', draw(g) {
        const box = (x, y, w, hh, cls) => svg('rect', { x, y, width: w, height: hh, rx: 5, class: cls });
        g.append(box(300, 140, 400, 30, 'mm-box'), svgText(500, 160, 'EXHAUST RECEIVER · colector de escape', 'mm-val'));
        g.append(box(300, 420, 400, 46, 'mm-box'), svgText(500, 438, 'SCAVENGE AIR RECEIVER · colector de barrido', 'mm-val'));
        const scav = svgText(500, 456, '', 'mm-val');
        g.append(scav);
        const cyl = [];
        for (let i = 0; i < CYL; i++) {
          const x = 312 + i * 64;
          const c = svg('g', { class: 'a-cyl' });
          const body = box(x, 190, 56, 130, 'mm-body');
          const fill = svg('rect', { x: x + 6, y: 300, width: 44, height: 14, rx: 2, class: 'a-cyl-fill' });
          const t = svgText(x + 28, 186, '', 'mm-val');
          const n = svgText(x + 28, 222, `${i + 1}`, 'a-cyl-n');
          const st = svgText(x + 28, 252, '', 'mm-val');
          c.append(body, fill, n, st, t);
          c.classList.add('mm-click');
          c.addEventListener('click', () => ctx.face('me-ecr'));
          g.append(c);
          cyl.push({ c, fill, t, st });
        }
        g.append(box(300, 330, 400, 80, 'mm-box'));
        const eng = svgText(500, 360, '', 'mm-val');
        const eng2 = svgText(500, 380, '', 'mm-val');
        const eng3 = svgText(500, 398, '', 'mm-val');
        g.append(eng, eng2, eng3);
        g.addEventListener('click', (e) => { if (e.target.closest('.a-cyl')) return; ctx.face('me-ecr'); });
        g.classList.add('mm-click');
        return (p) => {
          const me = p.me;
          cyl.forEach((x, i) => {
            const T = me.exh[i];
            x.t.textContent = `${T.toFixed(0)} °C`;
            x.c.dataset.state = me.cut[i] ? 'cut' : coolC(T);
            const f = Math.max(0, Math.min(1, (T - 50) / 450));
            x.fill.setAttribute('y', 316 - 110 * f);
            x.fill.setAttribute('height', 110 * f);
            x.st.textContent = me.cut[i] ? 'CUT' : '';
          });
          scav.textContent = `${me.scav.toFixed(2)} bar`;
          eng.textContent = `${me.rpm.toFixed(1)} rpm · ${(me.load * 100).toFixed(0)} % MCR · ${(p.sig.mePowerKw ?? 0).toFixed(0)} kW`;
          eng2.textContent = `${STATE[me.state][0]} · ${STATE[me.state][1]}`;
          eng3.textContent = `Fuel index ${me.fuelIdx.toFixed(0)} % · cremallera`;
          g.dataset.state = me.shutdown ? 'alarm' : me.state === 'running' ? 'run' : 'stop';
        };
      } },
      { t: 'label', x: 500, y: 86, en: 'MAIN ENGINE · 6 cyl. 2-stroke · MCR 10 000 kW / 105 rpm', es: 'Motor principal · 6 cil. 2 tiempos', size: 13 },
      // Turbosoplante y enfriador de aire
      { t: 'box', x: 760, y: 100, w: 120, h: 90, en: 'Turbocharger', es: 'Turbosoplante', ty: 26, face: 'me-ecr', state: (p) => (p.faults['me-tc'] && running(p) ? 'warn' : running(p) ? 'run' : 'stop') },
      { t: 'value', x: 772, y: 150, w: 96, get: (p) => p.me.tcRpm, unit: 'rpm', dec: 0 },
      { t: 'hx', x: 790, y: 250, w: 60, h: 90, en: 'Air cooler', es: 'Enfriador de aire' },
      { t: 'motor', id: 'aux1', x: 730, y: 515, w: 70, h: 40, icon: '✣', en: 'Aux. blower 1', es: 'Soplante aux. 1' },
      { t: 'motor', id: 'aux2', x: 840, y: 515, w: 70, h: 40, icon: '✣', en: 'Aux. blower 2', es: 'Soplante aux. 2' },
      { t: 'value', x: 730, y: 594, w: 180, get: (p) => (p.me.blowerAuto ? 'AUTO' : 'MANUAL'), face: 'me-ecr' },
      // Virador y puesto local
      { t: 'box', x: 300, y: 500, w: 130, h: 50, en: 'Turning gear', es: 'Virador', face: 'me-tg', state: (p) => (p.me.turningGear ? 'alarm' : 'ok') },
      { t: 'box', x: 450, y: 500, w: 130, h: 50, en: 'Local stand', es: 'Puesto local', face: 'me-local', state: (p) => (p.me.control === 'local' ? 'warn' : 'ok') },
      { t: 'box', x: 600, y: 500, w: 110, h: 50, en: 'ECR console', es: 'Consola ECR', face: 'me-ecr', state: (p) => (p.me.shutdown ? 'alarm' : p.me.slowdown ? 'warn' : 'ok') },
      // Servicios (de otros sistemas)
      { t: 'value', x: 40, y: 400, w: 120, en: 'LO inlet', es: 'Aceite entrada', get: (p) => p.sig.meLoPress ?? 2.8, unit: 'bar', dec: 2, nav: 'lube', warn: (p) => (p.sig.meLoPress ?? 2.8) < 1.8 },
      { t: 'value', x: 170, y: 400, w: 120, en: 'JCW outlet', es: 'Salida camisas', get: (p) => p.sig.htTemp ?? 80, unit: '°C', dec: 1, nav: 'cooling', warn: (p) => (p.sig.htTemp ?? 80) > 90 || (p.sig.htTemp ?? 80) < 50 },
      { t: 'value', x: 40, y: 460, w: 120, en: 'Fuel system', es: 'Combustible', get: (p) => ((p.sig.meFuelOk ?? true) ? `OK ${p.sig.meFuelPress != null ? p.sig.meFuelPress.toFixed(1) + ' bar' : ''}` : 'NOT READY'), nav: 'fuel', warn: (p) => !(p.sig.meFuelOk ?? true) },
      { t: 'value', x: 170, y: 460, w: 120, en: 'Control air', es: 'Aire de control', get: (p) => p.sig.controlAir ?? 7, unit: 'bar', dec: 1, nav: 'air', warn: (p) => (p.sig.controlAir ?? 7) < 5 },
      { t: 'value', x: 40, y: 520, w: 120, en: 'Starting air', es: 'Aire de arranque', get: (p) => p.sig.meStartAir ?? 30, unit: 'bar', dec: 1, nav: 'air', warn: (p) => (p.sig.meStartAir ?? 30) < 15 },
      { t: 'value', x: 170, y: 520, w: 120, en: 'JCW flow', es: 'Caudal camisas', get: (p) => 100 * (p.sig.htFlow ?? 1), unit: '%', dec: 0, nav: 'cooling', warn: (p) => (p.sig.htFlow ?? 1) < 0.3 },
      { t: 'value', x: 40, y: 50, w: 140, en: 'Control position', es: 'Puesto de control', get: (p) => CONTROL[p.me.control][0], face: 'me-ecr' },
      { t: 'value', x: 200, y: 50, w: 190, en: 'Telegraph', es: 'Telégrafo', get: (p) => ORDERS[p.me.tel].en, face: 'me-ecr', warn: (p) => Boolean(p.alarms['me-tel']?.active) },
      { t: 'value', x: 410, y: 50, w: 110, en: 'Ship speed', es: 'Velocidad', get: (p) => p.sig.shipSpeed ?? 0, unit: 'kn', dec: 1, nav: 'bridge' },
      { t: 'value', x: 540, y: 50, w: 110, en: 'Stern tube brg', es: 'Chumacera bocina', get: (p) => p.st.brgT, unit: '°C', dec: 1, nav: 'sterntube', warn: (p) => p.st.brgT > 60 },
    ];
    const m = mimic(els, ctx);
    const panel = ecrPanel(ctx);
    return {
      el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Click any equipment to operate it. ECR console below.', 'Toca cualquier equipo para manejarlo. Consola de la ECR debajo.')),
        h('h2', {}, bi('ECR main engine control console', 'Consola de control del motor principal (ECR)')), panel.el),
      update: (p) => { m.update(p); panel.update(p); },
    };
  },
};
