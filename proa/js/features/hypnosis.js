import { h, toast, busy, fmtTime, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { hasAI, hypnosisScript } from '../core/ai.js';
import { UNITS, unitById } from '../data/curriculum.js';
import { generateScript, estimateSeconds } from './hypnosis-script.js';
import { BinauralEngine, PRESETS } from '../audio/binaural.js';
import { speak, stopSpeaking, wait, LANGS, support } from '../audio/speech.js';

const engine = new BinauralEngine();
let player = null; // { stop() }

const AVISO = `La autohipnosis y los sonidos binaurales son técnicas de relajación para apoyar la memorización;
la evidencia científica sobre los pulsos binaurales es limitada. No uses las sesiones mientras conduces, haces
guardia, manejas maquinaria o en cualquier situación que requiera atención. Consulta a un médico antes si
tienes epilepsia, problemas cardíacos o algún trastorno psicológico. Usa auriculares y un volumen moderado.`;

export function renderHypnosis(view, [sub, preUnit]) {
  if (!store.get().settings.hypnosisAccepted) return renderDisclaimer(view, [sub, preUnit]);
  if (sub === 'nueva') return renderCreate(view, preUnit);
  if (sub === 'sesion') return renderPlayer(view, preUnit);
  return renderLibrary(view);
}

function renderDisclaimer(view, args) {
  mount(view, 
    h('h1', {}, '🌊 Autohipnosis para aprender inglés'),
    h('div', { class: 'warning' }, h('strong', {}, 'Antes de empezar'), h('p', {}, AVISO)),
    h('button', { class: 'btn primary', onclick: () => {
      store.update((s) => { s.settings.hypnosisAccepted = true; });
      view.replaceChildren();
      renderHypnosis(view, args);
    } }, 'Lo he leído y acepto'),
  );
}

function renderLibrary(view) {
  const sessions = store.get().sessions;
  mount(view, 
    h('h1', {}, '🌊 Estudio de autohipnosis'),
    h('p', { class: 'lead' }, 'Sesiones guiadas que combinan relajación profunda, sonido binaural y repetición de frases en inglés. Repite cada sesión tantas veces como quieras: la repetición en estado relajado es la clave.'),
    h('a', { class: 'btn primary', href: '#/hipnosis/nueva' }, '+ Crear nueva sesión'),
    h('h2', {}, 'Tus sesiones'),
    sessions.length
      ? h('ul', { class: 'list' }, [...sessions].reverse().map((s) => h('li', { class: 'card' },
          h('div', {},
            h('strong', {}, s.title),
            h('p', { class: 'muted' }, `${fmtTime(s.seconds)} · ${PRESETS[s.preset]?.label.split(' (')[0] ?? s.preset} · escuchada ${s.plays} ${s.plays === 1 ? 'vez' : 'veces'}${s.ai ? ' · personalizada con IA' : ''}`),
          ),
          h('div', { class: 'row' },
            h('a', { class: 'btn primary', href: `#/hipnosis/sesion/${s.id}` }, '▶ Escuchar'),
            h('button', { class: 'btn ghost', onclick: () => {
              if (!confirm(`¿Borrar "${s.title}"?`)) return;
              store.update((st) => { st.sessions = st.sessions.filter((x) => x.id !== s.id); });
              view.replaceChildren(); renderLibrary(view);
            } }, 'Borrar'),
          ),
        )))
      : h('p', { class: 'muted' }, 'Todavía no tienes sesiones. Crea la primera a partir de una unidad del curso.'),
  );
}

function renderCreate(view, preUnit) {
  const unitBoxes = UNITS.map((u) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', value: u.id, checked: u.id === preUnit || (!preUnit && store.get().studied[u.id]) }),
    u.title));
  const minutes = h('input', { type: 'range', min: 8, max: 40, step: 2, value: 16 });
  const minutesLabel = h('span', {}, '16 min');
  minutes.addEventListener('input', () => { minutesLabel.textContent = `${minutes.value} min`; });
  const preset = h('select', {}, Object.entries(PRESETS).map(([k, p]) => h('option', { value: k, selected: k === 'alfa-theta' }, p.label)));
  const ocean = h('input', { type: 'checkbox', checked: true });
  const useAI = h('input', { type: 'checkbox', checked: hasAI(), disabled: !hasAI() });
  const goal = h('input', { type: 'text', placeholder: 'Ej.: hablar por radio con seguridad en una emergencia' });
  const create = h('button', { class: 'btn primary' }, 'Generar sesión');

  create.addEventListener('click', () => busy(create, async () => {
    const units = unitBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => unitById(i.value));
    if (!units.length) throw new Error('Elige al menos una unidad.');
    const phrases = units.flatMap((u) => u.phrases.map((p) => ({ ...p, ancla: u.ancla })));
    const title = `Sesión · ${units.map((u) => u.title).join(' + ')}`;
    let script;
    if (useAI.checked && hasAI()) {
      const ai = await hypnosisScript({ goal: goal.value, phrases, minutes: Number(minutes.value) });
      script = { title: ai.title || title, segments: ai.segments };
    } else {
      script = generateScript({ phrases, minutes: Number(minutes.value), title });
    }
    const session = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      title: script.title,
      createdAt: Date.now(),
      preset: preset.value,
      ocean: ocean.checked,
      segments: script.segments,
      seconds: estimateSeconds(script),
      plays: 0,
      ai: useAI.checked && hasAI(),
    };
    store.update((s) => { s.sessions.push(session); });
    toast('Sesión creada y guardada en tu biblioteca.');
    location.hash = `#/hipnosis/sesion/${session.id}`;
  }));

  mount(view, 
    h('a', { href: '#/hipnosis', class: 'back' }, '← Biblioteca'),
    h('h1', {}, 'Nueva sesión de autohipnosis'),
    h('div', { class: 'form' },
      h('fieldset', {}, h('legend', {}, 'Contenido (unidades)'), h('div', { class: 'checks' }, unitBoxes)),
      h('label', {}, 'Duración aproximada ', minutesLabel, minutes),
      h('label', {}, 'Frecuencia binaural', preset),
      h('label', { class: 'check' }, ocean, 'Fondo de oleaje (ruido rosa)'),
      h('label', { class: 'check' }, useAI, hasAI() ? 'Personalizar el guion con IA' : 'Personalizar con IA (configura tu clave en Ajustes)'),
      h('label', {}, 'Objetivo personal (opcional)', goal),
      create,
    ),
  );
}

function renderPlayer(view, id) {
  const session = store.get().sessions.find((s) => s.id === id);
  if (!session) { location.hash = '#/hipnosis'; return; }

  const status = h('p', { class: 'now-playing', 'aria-live': 'polite' }, 'Pulsa "Comenzar" con los auriculares puestos.');
  const progress = h('progress', { max: session.segments.length, value: 0 });
  const repeatSel = h('select', {},
    [['1', 'Una vez'], ['2', '2 veces seguidas'], ['3', '3 veces seguidas'], ['loop', 'En bucle hasta que la pare']]
      .map(([v, t]) => h('option', { value: v }, t)));
  const volume = h('input', { type: 'range', min: 0, max: 0.8, step: 0.05, value: 0.35 });
  volume.addEventListener('input', () => engine.setVolume(Number(volume.value)));
  const start = h('button', { class: 'btn primary big' }, '▶ Comenzar');
  const stop = h('button', { class: 'btn', disabled: true }, '⏹ Detener');
  const showText = h('input', { type: 'checkbox' });
  const textBox = h('div', { class: 'script-text hidden' });

  start.addEventListener('click', async () => {
    start.disabled = true;
    stop.disabled = false;
    try {
      await play(session, { repeat: repeatSel.value, volume: Number(volume.value), status, progress, textBox });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      start.disabled = false;
      stop.disabled = true;
      start.textContent = '↻ Repetir sesión';
    }
  });
  stop.addEventListener('click', () => player?.stop());
  showText.addEventListener('change', () => textBox.classList.toggle('hidden', !showText.checked));

  mount(view, 
    h('a', { href: '#/hipnosis', class: 'back' }, '← Biblioteca'),
    h('h1', {}, session.title),
    h('p', { class: 'muted' }, `${fmtTime(session.seconds)} por vuelta · ${PRESETS[session.preset]?.label} · escuchada ${session.plays} veces`),
    support.tts ? null : h('div', { class: 'warning' }, 'Tu navegador no tiene síntesis de voz: solo sonará el fondo binaural.'),
    h('div', { class: 'player' },
      h('div', { class: 'orb', 'aria-hidden': 'true' }),
      status, progress,
      h('div', { class: 'row' }, start, stop),
      h('label', {}, 'Repetición', repeatSel),
      h('label', {}, 'Volumen del fondo', volume),
      h('label', { class: 'check' }, showText, 'Mostrar el texto mientras escucho'),
      textBox,
    ),
    h('p', { class: 'muted small' }, '🎧 Usa auriculares: el efecto binaural necesita un tono distinto en cada oído.'),
  );
  return () => player?.stop();
}

async function play(session, { repeat, volume, status, progress, textBox }) {
  let stopped = false;
  player = { stop: () => { stopped = true; stopSpeaking(); engine.stop(3); status.textContent = 'Sesión detenida.'; } };
  await engine.start({ preset: session.preset, volume, ocean: session.ocean });
  status.textContent = 'Relájate… el sonido entra poco a poco.';
  await wait(6000);
  const total = repeat === 'loop' ? Infinity : Number(repeat);
  for (let round = 0; round < total && !stopped; round++) {
    for (let i = 0; i < session.segments.length && !stopped; i++) {
      const seg = session.segments[i];
      // En repeticiones seguidas se omite la salida intermedia para no despertar entre vueltas.
      if (seg.kind === 'salida' && round < total - 1) continue;
      if (round > 0 && (seg.kind === 'induccion')) continue;
      progress.value = i + 1;
      status.textContent = `${round + 1}${total === Infinity ? '' : `/${total}`} · ${labelFor(seg.kind)}`;
      textBox.textContent = seg.text;
      const isEn = seg.lang === 'en';
      await speak(seg.text, isEn ? LANGS.en : LANGS.es, { rate: isEn ? 0.75 : 0.85, pitch: isEn ? 1 : 0.95 });
      await wait(seg.pause_ms ?? 2000);
    }
    if (!stopped) store.update((s) => { const x = s.sessions.find((y) => y.id === session.id); if (x) x.plays++; });
  }
  if (!stopped) {
    engine.stop(6);
    status.textContent = '✅ Sesión completada. Puedes repetirla cuando quieras.';
  }
}

const labelFor = (k) => ({
  induccion: 'Inducción', profundizacion: 'Profundización', aprendizaje: 'Aprendizaje',
  sugestion: 'Sugestiones', salida: 'Despertar',
}[k] ?? k);
