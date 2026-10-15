import { h, toast, busy, fmtTime, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { hasAI, hypnosisScript } from '../core/ai.js';
import { UNITS, unitById } from '../data/curriculum.js';
import { generateScript, estimateSeconds } from './hypnosis-script.js';
import { BinauralEngine, PRESETS } from '../audio/binaural.js';
import { speak, stopSpeaking, wait, LANGS, support } from '../audio/speech.js';
import { VOICES, voiceById, isVoiceDownloaded } from '../audio/neural-tts.js';
import { files } from '../core/idb.js';

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
              files.del(s.id);
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
  const cleanups = [];
  const metaText = () => {
    const x = store.get().sessions.find((y) => y.id === id) ?? session;
    return `${fmtTime(x.audioSeconds ?? x.seconds)} por vuelta · ${PRESETS[x.preset]?.label} · escuchada ${x.plays} ${x.plays === 1 ? 'vez' : 'veces'}`;
  };
  const meta = h('p', { class: 'muted' }, metaText());

  mount(view,
    h('a', { href: '#/hipnosis', class: 'back' }, '← Biblioteca'),
    h('h1', {}, session.title),
    meta,
    audioSection(session, cleanups, () => { meta.textContent = metaText(); }),
    liveSection(session, cleanups),
    h('p', { class: 'muted small' }, '🎧 Usa auriculares: el efecto binaural necesita un tono distinto en cada oído.'),
  );
  return () => cleanups.forEach((f) => f());
}

const REPEAT_OPTIONS = [['1', 'Una vez'], ['2', '2 veces seguidas'], ['3', '3 veces seguidas'], ['loop', 'En bucle hasta que la pare']];

// Modo archivo de audio: suena con la pantalla apagada y se controla desde la pantalla de bloqueo.
function audioSection(session, cleanups, onChange = () => {}) {
  const box = h('section', { class: 'player' }, h('h2', {}, '🌙 Escuchar con la pantalla apagada'));
  const s = store.get().settings;

  const showAudio = (blob) => {
    const url = URL.createObjectURL(blob);
    cleanups.push(() => { audio.pause(); URL.revokeObjectURL(url); });
    const audio = h('audio', { controls: true, src: url, preload: 'metadata', class: 'audio' });
    const repeatSel = h('select', {}, REPEAT_OPTIONS.map(([v, t]) => h('option', { value: v }, t)));
    const info = h('p', { class: 'now-playing', 'aria-live': 'polite' }, 'Pulsa ▶, bloquea el móvil y relájate.');
    let remaining = 1;
    const applyRepeat = () => {
      audio.loop = repeatSel.value === 'loop';
      remaining = audio.loop ? Infinity : Number(repeatSel.value);
    };
    repeatSel.addEventListener('change', applyRepeat);
    applyRepeat();
    audio.addEventListener('play', () => {
      setMediaSession(session, audio);
      info.textContent = '▶ Reproduciendo. Puedes apagar la pantalla.';
    });
    audio.addEventListener('ended', () => {
      store.update((st) => { const x = st.sessions.find((y) => y.id === session.id); if (x) x.plays++; });
      onChange();
      remaining--;
      if (remaining > 0) { audio.currentTime = 0; audio.play(); }
      else { info.textContent = '✅ Sesión completada. Puedes repetirla cuando quieras.'; applyRepeat(); }
    });
    box.append(
      h('div', { class: 'orb', 'aria-hidden': 'true' }),
      info, audio,
      h('label', {}, 'Repetición', repeatSel),
      h('div', { class: 'row' },
        h('a', { class: 'btn ghost', href: url, download: `${session.title.replace(/[^\wáéíóúñ ]+/gi, '').trim()}.mp3` }, '⬇ Descargar MP3'),
        h('button', { class: 'btn ghost', onclick: async () => {
          await files.del(session.id);
          location.reload();
        } }, '↻ Volver a generar'),
      ),
      h('p', { class: 'muted small' }, 'El audio está guardado en este dispositivo y funciona sin conexión. También puedes descargarlo y escucharlo en cualquier reproductor.'),
    );
  };

  const prepare = () => {
    const esSel = h('select', {}, VOICES.es.map((v) => h('option', { value: v.id, selected: v.id === s.neuralEs }, v.label)));
    const enSel = h('select', {}, VOICES.en.map((v) => h('option', { value: v.id, selected: v.id === s.neuralEn }, v.label)));
    const sizeNote = h('p', { class: 'muted small' });
    const updateNote = async () => {
      const pending = [];
      for (const sel of [esSel, enSel]) if (!(await isVoiceDownloaded(sel.value))) pending.push(voiceById(sel.value));
      sizeNote.textContent = pending.length
        ? `La primera vez se descargan las voces (${pending.reduce((t, v) => t + v.mb, 0)} MB en total). Mejor con wifi; después quedan guardadas.`
        : 'Voces ya descargadas en este dispositivo.';
    };
    esSel.addEventListener('change', updateNote);
    enSel.addEventListener('change', updateNote);
    updateNote();
    const bar = h('progress', { class: 'hidden', max: 1, value: 0 });
    const msg = h('p', { class: 'now-playing', 'aria-live': 'polite' });
    const go = h('button', { class: 'btn primary big' }, '🎙️ Preparar audio');
    go.addEventListener('click', async () => {
      go.disabled = true;
      esSel.disabled = enSel.disabled = true;
      bar.classList.remove('hidden');
      store.update((st) => { st.settings.neuralEs = esSel.value; st.settings.neuralEn = enSel.value; });
      try {
        const { renderSession } = await import('./hypnosis-render.js');
        const { blob, seconds } = await renderSession(session, { es: esSel.value, en: enSel.value }, (phase, f, detail) => {
          bar.value = f;
          msg.textContent = detail;
        });
        await files.put(session.id, blob);
        store.update((st) => { const x = st.sessions.find((y) => y.id === session.id); if (x) x.audioSeconds = seconds; });
        form.remove();
        showAudio(blob);
        onChange();
        toast('Audio listo y guardado en el dispositivo.');
      } catch (e) {
        msg.textContent = `No se pudo preparar el audio: ${e.message}`;
        go.disabled = false;
        esSel.disabled = enSel.disabled = false;
      }
    });
    const form = h('div', { class: 'prepare' },
      h('p', {}, 'Genera la sesión como archivo de audio con voces naturales. Así sigue sonando con la pantalla apagada, en segundo plano y desde los controles de la pantalla de bloqueo.'),
      h('label', {}, 'Voz en español', esSel),
      h('label', {}, 'Voz en inglés', enSel),
      sizeNote, go, bar, msg,
    );
    box.append(form);
  };

  files.get(session.id).then((blob) => (blob ? showAudio(blob) : prepare()));
  return box;
}

function setMediaSession(session, audio) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: session.title,
    artist: 'Proa · Inglés Marítimo',
    album: 'Autohipnosis',
    artwork: [{ src: new URL('icon.svg', location.href).href, sizes: '512x512', type: 'image/svg+xml' }],
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('stop', () => { audio.pause(); audio.currentTime = 0; });
  navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime += 15; });
}

// Modo en vivo: voz del navegador al momento (necesita la pantalla encendida).
function liveSection(session, cleanups) {
  const status = h('p', { class: 'now-playing', 'aria-live': 'polite' }, 'Pulsa "Comenzar" con los auriculares puestos.');
  const progress = h('progress', { max: session.segments.length, value: 0 });
  const repeatSel = h('select', {}, REPEAT_OPTIONS.map(([v, t]) => h('option', { value: v }, t)));
  const volume = h('input', { type: 'range', min: 0, max: 0.8, step: 0.05, value: 0.35 });
  volume.addEventListener('input', () => engine.setVolume(Number(volume.value)));
  const start = h('button', { class: 'btn primary' }, '▶ Comenzar');
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
  cleanups.push(() => player?.stop());

  return h('details', { class: 'live' },
    h('summary', {}, '☀️ Modo en vivo (con la pantalla encendida, voz del navegador)'),
    h('div', { class: 'player' },
      support.tts ? null : h('div', { class: 'warning' }, 'Tu navegador no tiene síntesis de voz: solo sonará el fondo binaural.'),
      status, progress,
      h('div', { class: 'row' }, start, stop),
      h('label', {}, 'Repetición', repeatSel),
      h('label', {}, 'Volumen del fondo', volume),
      h('label', { class: 'check' }, showText, 'Mostrar el texto mientras escucho'),
      textBox,
    ),
  );
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
