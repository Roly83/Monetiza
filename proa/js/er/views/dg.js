// Vista «Diesel Generators»: los tres generadores con su panel local (LCP), aire de arranque,
// combustible y refrigeración.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { registerFace, btn, statusLine } from '../ui/faceplate.js';
import { meter, knob, lamp, readout } from '../ui/widgets.js';

const ST = { stopped: ['STOPPED', 'Parado'], starting: ['STARTING', 'Arrancando'], running: ['RUNNING', 'En marcha'], stopping: ['STOPPING', 'Parando'] };

for (const n of [1, 2, 3]) {
  registerFace(`dg${n}-lcp`, (ctx) => {
    const st = statusLine();
    const ctl = knob({ positions: [{ value: 'remote', label: 'Remote' }, { value: 'local', label: 'Local' }], marks: ['REM', 'LOC'], label: ['CONTROL', 'REMOTE · LOCAL'], es: 'Remoto (PMS) · local', onSelect: (v) => ctx.act('dgControl', n, v) });
    const rpm = meter({ unit: 'Hz', max: 70, min: 0, labels: [[0, '0'], [0.5, '35'], [6 / 7, '60'], [1, '70']] });
    const lo = meter({ unit: 'LO bar', max: 6, red: [0, 0.3] });
    const ht = meter({ unit: 'HT °C', max: 120, labels: [[0, '0'], [0.5, '60'], [1, '120']], red: [0.78, 1] });
    const lRun = lamp({ color: 'green', label: ['RUNNING'], es: 'En marcha' });
    const lSd = lamp({ color: 'red', label: ['SHUTDOWN'], es: 'Parada de seguridad', blink: true });
    const kw = readout({ label: 'Load', es: 'Carga', unit: 'kW', dec: 0 });
    const hrs = readout({ label: 'Running hours', es: 'Horas de marcha', unit: 'h', dec: 1 });
    const air = readout({ label: 'Starting air', es: 'Aire de arranque', unit: 'bar' });
    return {
      en: `Diesel generator No ${n} local control panel`, es: `Panel local del generador diésel nº ${n}`,
      body: h('div', { class: 'fp-body' }, st.el,
        h('div', { class: 'panel-row' }, ctl.el, lRun.el, lSd.el),
        h('div', { class: 'panel-row meters3' }, rpm.el, lo.el, ht.el),
        h('div', { class: 'row' }, btn('START', 'Arrancar', () => ctx.act('dgStart', n, true), 'primary'), btn('STOP', 'Parar', () => ctx.act('dgStop', n, true)), btn('RESET', 'Rearmar', () => ctx.act('dgReset', n))),
        h('div', { class: 'readouts' }, kw.el, air.el, hrs.el),
        h('p', { class: 'muted small' }, 'En REMOTO lo maneja el PMS y el cuadro principal. En LOCAL solo responde a este panel.')),
      update(p) {
        const g = p.elec.dg[n - 1];
        st.el.dataset.state = g.state === 'running' ? 'run' : g.trip && g.trip !== 'start' ? 'trip' : 'stop';
        st.el.replaceChildren(h('strong', { lang: 'en' }, ST[g.state][0]), h('span', {}, ` · ${ST[g.state][1]}${g.trip ? ` · trip: ${g.trip}` : ''}`));
        ctl.set(g.control); rpm.set(g.f); lo.set(g.loPress); ht.set(g.htTemp);
        lRun.set(g.state === 'running'); lSd.set(Boolean(g.trip && g.trip !== 'start'));
        kw.set(g.kw); hrs.set(g.hours); air.set(p.sig.dgStartAir ?? 0, (p.sig.dgStartAir ?? 0) < 10);
      },
    };
  });
}

export default {
  id: 'dg', en: 'Diesel Generators', es: 'Generadores diésel',
  render(ctx) {
    const els = [];
    [1, 2, 3].forEach((n, i) => {
      const x = 90 + i * 300;
      const g = (p) => p.elec.dg[n - 1];
      els.push(
        { t: 'pipe', d: `M${x + 60} 120 V170`, fluid: 'air', on: (p) => g(p).state === 'starting' },
        { t: 'pipe', d: `M${x + 30} 470 V430`, fluid: 'do', on: (p) => g(p).state === 'running' },
        { t: 'pipe', d: `M${x + 150} 470 V430`, fluid: 'lt', on: (p) => g(p).state === 'running' && (p.sig.ltFlow ?? 1) > 0.3 },
        { t: 'box', x, y: 170, w: 200, h: 140, en: `Diesel Generator No ${n}`, es: `Generador diésel nº ${n}`, ty: 26, face: `dg${n}-lcp`,
          state: (p) => (g(p).trip && g(p).trip !== 'start' ? 'alarm' : g(p).state === 'running' ? 'run' : g(p).state === 'starting' ? 'warn' : 'stop') },
        { t: 'value', x: x + 10, y: 220, w: 85, get: (p) => g(p).f, unit: 'Hz', face: `dg${n}-lcp` },
        { t: 'value', x: x + 105, y: 220, w: 85, get: (p) => g(p).kw, unit: 'kW', dec: 0, face: `dg${n}-lcp` },
        { t: 'value', x: x + 10, y: 260, w: 85, get: (p) => g(p).htTemp, unit: '°C', dec: 0, warn: (p) => g(p).htTemp > 93, face: `dg${n}-lcp` },
        { t: 'value', x: x + 105, y: 260, w: 85, get: (p) => g(p).loPress, unit: 'bar', warn: (p) => g(p).state === 'running' && g(p).loPress < 2.5, face: `dg${n}-lcp` },
        { t: 'box', x: x + 130, y: 320, w: 70, h: 30, en: 'LCP', es: '', face: `dg${n}-lcp`, size: 12, cls: 'lcp' },
        { t: 'value', x: x + 10, y: 330, w: 110, get: (p) => (g(p).breaker ? 'ON LINE' : g(p).state === 'running' ? 'NOT ON LINE' : '—'), nav: 'msb' },
        { t: 'label', x: x + 60, y: 110, en: 'Starting air', es: 'Aire de arranque', size: 10 },
        { t: 'label', x: x + 30, y: 500, en: 'DO', es: 'Diésel', size: 10 },
        { t: 'label', x: x + 150, y: 500, en: 'LT FW', es: 'Agua BT', size: 10 },
      );
    });
    els.push(
      { t: 'pipe', d: 'M150 120 H750', fluid: 'air', on: (p) => p.elec.dg.some((g) => g.state === 'starting') },
      { t: 'value', x: 790, y: 108, get: (p) => p.sig.dgStartAir ?? 0, unit: 'bar', en: 'DG starting air', es: 'Aire de arranque DG', warn: (p) => (p.sig.dgStartAir ?? 0) < 10, nav: 'air' },
      { t: 'pipe', d: 'M120 470 H720', fluid: 'do', on: (p) => p.elec.dg.some((g) => g.state === 'running') },
      { t: 'pipe', d: 'M240 470 H840', fluid: 'lt', on: (p) => (p.sig.ltFlow ?? 1) > 0.3 },
      { t: 'value', x: 60, y: 560, w: 120, get: (p) => (p.sig.dgFuelOk ?? true ? 'OK' : 'NO FUEL'), en: 'DG fuel supply', es: 'Combustible DG', warn: (p) => !(p.sig.dgFuelOk ?? true), nav: 'fuel' },
      { t: 'value', x: 260, y: 560, w: 120, get: (p) => p.sig.ltTemp ?? 36, unit: '°C', en: 'LT FW temperature', es: 'Temperatura agua BT', nav: 'cooling' },
      { t: 'box', x: 460, y: 535, w: 200, h: 50, en: 'Main Switchboard →', es: 'Cuadro principal', nav: 'msb', state: (p) => (p.sig.msbLive ? 'run' : 'alarm') },
      { t: 'value', x: 700, y: 560, w: 120, get: (p) => (p.elec.pms === 'auto' ? 'AUTO' : 'MANUAL'), en: 'Power management', es: 'Gestión de potencia', nav: 'msb' },
    );
    const m = mimic(els, ctx);
    return { el: m.el, update: m.update };
  },
};
