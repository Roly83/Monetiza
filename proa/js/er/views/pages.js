// Páginas Options, Assessment y Configuration (instructor).
import { h } from '../../core/ui.js';
import { store } from '../../core/store.js';
import { bi } from '../ui/widgets.js';
import { btn } from '../ui/faceplate.js';
import { SETUPS, FAULTS, setFault, STARTUP, PHASES } from '../plant.js';
import { SCENARIOS, startScenario, session } from '../scenarios.js';
import { PROCEDURE } from '../procedure.js';

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

// Lista de arranque del buque (de buque muerto a navegar): procedimiento paso a paso, con cada paso
// marcado en vivo cuando la planta lo cumple, y los hitos de todos los sistemas.
export const startup = {
  id: 'startup', en: 'Start-up checklist', es: 'Arranque del buque', page: true,
  render(ctx) {
    const steps = PROCEDURE.map((s, i) => {
      const mark = h('span', { class: 'step-mark' }, '⬜');
      const li = h('li', { class: 'step' }, mark,
        h('div', {}, h('strong', { lang: 'en' }, s.en), h('br'), h('small', {}, s.es)),
        h('div', { class: 'row tight' },
          h('button', { type: 'button', class: 'icon-btn', title: 'Listen · Escuchar', onclick: () => ctx.say(s.en) }, '🔊'),
          s.view ? h('button', { type: 'button', class: 'btn', onclick: () => ctx.nav(s.view) }, bi('Go', 'Ir')) : null));
      return { s, i, li, mark };
    });
    const bar = h('progress', { max: PROCEDURE.length, value: 0 });
    const count = h('strong');
    const miles = h('span', { class: 'muted small' });
    const el = h('div', {},
      h('p', { class: 'muted' }, bi('From dead ship to sea going, step by step. Each step is ticked when the plant reaches it; the next step is highlighted. Use ×5 or ×10 speed for slow processes (warming up, raising steam, fuel changeover).',
        'De buque muerto a navegar, paso a paso. Cada paso se marca cuando la planta lo cumple y el siguiente se resalta. Usa ×5 o ×10 en los procesos lentos (calentamientos, subir vapor, cambio de combustible).')),
      h('div', { class: 'row' },
        btn('New dead ship', 'Empezar en buque muerto', () => { if (confirm('¿Empezar en buque muerto? Se pierde la situación actual.')) { ctx.newSim('dead'); ctx.nav('startup'); } }, 'primary'),
        btn('Start as assessment', 'Hacerlo como práctica evaluada', () => { if (confirm('¿Empezar la práctica evaluada en buque muerto?')) { startScenario(ctx, session, 'full-startup'); ctx.nav('startup'); } })),
      h('div', { class: 'row' }, count, bar, miles),
      ...PHASES.map((ph, n) => {
        const list = steps.filter((x) => x.s.phase === n + 1);
        return list.length ? h('section', { class: 'card' }, h('strong', {}, `${n + 1}. `, bi(ph.en, ph.es)), h('ol', { class: 'steps', start: list[0].i + 1 }, list.map((x) => x.li))) : null;
      }));
    let tick = 0;
    return {
      el,
      update(p) {
        if (tick++ % 3) return;
        let done = 0;
        let next = null;
        for (const x of steps) {
          const key = `proc:${x.i}`;
          let ok = p.history.has(key);
          if (!ok && x.s.check) {
            try { ok = Boolean(x.s.check(p)); } catch { ok = false; }
            if (ok) p.history.add(key);
          }
          if (ok) done++;
          else if (next === null) next = x;
          x.li.classList.toggle('ok', ok);
          x.mark.textContent = ok ? '✅' : x.s.check ? '⬜' : '▫️';
        }
        for (const x of steps) x.li.classList.toggle('next', x === next);
        bar.value = done;
        count.textContent = `${done} / ${PROCEDURE.length}`;
        let m = 0;
        for (const s of STARTUP) { try { if (s.check(p)) m++; } catch { /* sistema ausente */ } }
        miles.textContent = `· hitos de los sistemas ${m} / ${STARTUP.length}`;
      },
    };
  },
};
