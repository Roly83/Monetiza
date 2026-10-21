// Páginas Options, Assessment y Configuration (instructor).
import { h } from '../../core/ui.js';
import { store } from '../../core/store.js';
import { bi } from '../ui/widgets.js';
import { btn } from '../ui/faceplate.js';
import { SETUPS, FAULTS, setFault } from '../plant.js';
import { SCENARIOS, startScenario, session } from '../scenarios.js';

const settings = () => ({ speed: 1, sound: true, voice: true, ...(store.get().er ?? {}) });
const saveSettings = (patch) => store.update((st) => { st.er = { ...settings(), ...patch }; });
const check = (en, es, value, onchange) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: value, onchange: (e) => onchange(e.target.checked) }), bi(en, es));

export const options = {
  id: 'options', en: 'Options', es: 'Opciones', page: true,
  render(ctx) {
    const s = settings();
    return {
      el: h('div', { class: 'form' },
        h('h2', {}, bi('Start a new situation', 'Empezar una situación nueva')),
        h('div', { class: 'row' }, Object.entries(SETUPS).map(([k, v]) => btn(v.en, v.es, () => { if (confirm('¿Empezar de nuevo? Se pierde la situación actual.')) { ctx.newSim(k); ctx.nav('control'); } }))),
        h('h2', {}, bi('Sound and voice', 'Sonido y voz')),
        check('Alarm horn', 'Bocina de alarma', s.sound, (v) => saveSettings({ sound: v })),
        check('Read new alarms aloud in English', 'Leer en voz alta las alarmas nuevas en inglés', s.voice, (v) => saveSettings({ voice: v })),
        h('h2', {}, bi('Simulation speed', 'Velocidad de la simulación')),
        h('p', { class: 'muted small' }, 'Usa ×1 … ×10 en la barra superior. A ×10 los procesos lentos (temperaturas, tanques) avanzan más rápido.'),
        h('h2', {}, bi('Saved game', 'Partida guardada')),
        h('p', { class: 'muted small' }, 'La planta se guarda sola en este dispositivo cada 15 s y al cerrar.'),
      ),
    };
  },
};

export const assessment = {
  id: 'assessment', en: 'Assessment', es: 'Evaluación', page: true,
  render(ctx) {
    const box = h('div');
    const best = () => store.get().er?.scores ?? {};
    const draw = () => {
      const s = session.scenario;
      const p = ctx.p();
      box.replaceChildren(
        s ? h('div', { class: `card ${s.done ? 'done' : ''}` },
          h('strong', {}, bi(s.def.en, s.def.es)),
          h('p', { lang: 'en' }, s.def.brief.en), h('p', {}, s.def.brief.es),
          h('ol', { class: 'goals' }, s.def.goals.map((g, i) => h('li', { class: s.goals[i] !== null ? 'ok' : '' }, s.goals[i] !== null ? '✅ ' : '⬜ ', bi(g.en, g.es)))),
          s.done
            ? h('div', {}, h('p', { class: 'big' }, `${s.result.pts} / 100`), s.failed ? h('p', {}, bi(s.failed.en, s.failed.es)) : null,
              h('p', { class: 'muted small' }, `Objetivos ${s.result.done}/${s.result.total} · tiempo ${(s.result.elapsed / 60).toFixed(1)} min · penalización −${s.result.pen} (disparos, apagones, malas sincronizaciones)`),
              btn('Close exercise', 'Cerrar práctica', () => { session.scenario = null; draw(); }))
            : h('div', {}, h('p', { class: 'muted small' }, `Tiempo: ${((p.t - s.startT) / 60).toFixed(1)} / ${s.def.minutes} min · disparos ${p.stats.trips} · apagones ${p.stats.blackouts}`),
              btn('Abandon', 'Abandonar', () => { session.scenario = null; draw(); })))
          : null,
        h('h2', {}, bi('Exercises', 'Prácticas')),
        h('div', { class: 'list' }, SCENARIOS.map((sc) => h('div', { class: `card ${best()[sc.id] >= 80 ? 'done' : ''}` },
          h('div', {}, h('strong', {}, bi(sc.en, sc.es)), h('p', {}, sc.brief.es), h('p', { class: 'muted small' }, `${SETUPS[sc.setup].es} · ${sc.minutes} min${best()[sc.id] !== undefined ? ` · mejor nota ${best()[sc.id]}` : ''}`)),
          btn('Start', 'Empezar', () => { startScenario(ctx, session, sc.id); hook(); draw(); }, 'primary')))),
      );
    };
    const hook = () => {
      if (session.scenario) session.scenario.onFinish = (s) => {
        store.update((st) => { st.er = { ...settings(), scores: { ...best(), [s.def.id]: Math.max(best()[s.def.id] ?? 0, s.result.pts) } }; });
        draw();
      };
    };
    hook();
    draw();
    let tick = 0;
    return { el: box, update: () => { if (++tick % 10 === 0) draw(); } };
  },
};

export const config = {
  id: 'config', en: 'Configuration', es: 'Configuración (instructor)', page: true,
  render(ctx) {
    const p = ctx.p();
    const env = (key, en, es, min, max) => h('label', {}, bi(en, es),
      h('input', { type: 'number', min, max, value: p.env[key], onchange: (e) => { ctx.p().env[key] = Number(e.target.value); } }));
    const groups = {};
    for (const f of FAULTS) (groups[f.system] ??= []).push(f);
    return {
      el: h('div', { class: 'form' },
        h('p', { class: 'muted' }, 'Modo instructor: provoca averías y cambia las condiciones. El alumno ve las alarmas y tiene que diagnosticar y actuar.'),
        h('h2', {}, bi('Malfunctions', 'Averías')),
        ...Object.entries(groups).map(([sys, list]) => h('fieldset', {}, h('legend', {}, sys.toUpperCase()),
          h('div', { class: 'checks' }, list.map((f) => check(f.en, f.es, Boolean(ctx.p().faults[f.id]), (v) => setFault(ctx.p(), f.id, v)))))),
        h('h2', {}, bi('Environment', 'Entorno')),
        env('swTemp', 'Sea water temperature (°C)', 'Temperatura del agua de mar (°C)', 0, 35),
        env('ambient', 'Ambient air temperature (°C)', 'Temperatura del aire exterior (°C)', -10, 50),
        env('seaDistanceNm', 'Distance to nearest land (nm)', 'Distancia a tierra (millas)', 0, 300),
        h('h2', {}, bi('Clear all', 'Quitar todo')),
        btn('Clear all malfunctions', 'Quitar todas las averías', () => { for (const k of Object.keys(ctx.p().faults)) setFault(ctx.p(), k, false); ctx.nav('control'); }),
      ),
    };
  },
};
