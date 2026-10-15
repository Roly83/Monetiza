import { h, toast, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { listVoices, speak, LANGS } from '../audio/speech.js';
import { ENGINES, voicesFor, selectedVoices, pendingDownloadMb, prepareEngine, synth, playPcm } from '../audio/voice.js';

export function renderSettings(view) {
  const s = store.get().settings;
  const key = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off' });
  const model = h('select', {},
    [['claude-opus-5-5', 'Claude Opus 5.5 (máxima calidad)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (más económico)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (más rápido y barato)']]
      .map(([v, t]) => h('option', { value: v, selected: s.model === v }, t)));
  const theme = h('select', { onchange: (e) => store.update((st) => { st.settings.theme = e.target.value; }) },
    [['dark', '🌙 Oscuro'], ['light', '☀️ Claro'], ['auto', '🌗 Automático (según el sistema)']].map(([v, t]) => h('option', { value: v, selected: (s.theme || 'dark') === v }, t)));
  const rate = h('input', { type: 'range', min: 0.6, max: 1.2, step: 0.05, value: s.rateEn });
  const voiceSel = (prefix, current) => h('select', {}, h('option', { value: '' }, 'Automática'),
    listVoices(prefix).map((v) => h('option', { value: v.name, selected: v.name === current }, `${v.name} (${v.lang})`)));
  const voiceEn = voiceSel('en', s.voiceEn);
  const voiceEs = voiceSel('es', s.voiceEs);

  const save = () => {
    store.update((st) => {
      Object.assign(st.settings, {
        apiKey: key.value.trim(), model: model.value, rateEn: Number(rate.value), voiceEn: voiceEn.value, voiceEs: voiceEs.value,
      });
    });
    toast('Ajustes guardados.');
  };

  mount(view, 
    h('h1', {}, '⚙️ Ajustes'),
    h('div', { class: 'form' },
      h('h2', {}, 'Apariencia'),
      h('label', {}, 'Tema', theme),
      h('h2', {}, 'Inteligencia artificial'),
      h('p', { class: 'muted' }, 'El traductor libre, el intérprete, el examen conversacional y los guiones personalizados usan Claude. Crea una clave en console.anthropic.com (pago por uso, céntimos por sesión). La clave se guarda solo en este dispositivo.'),
      h('label', {}, 'Clave de API', key),
      h('label', {}, 'Modelo', model),
      h('h2', {}, 'Voz'),
      naturalVoiceSection(),
      h('details', {},
        h('summary', {}, 'Voces del navegador (respaldo)'),
        h('div', { class: 'form flat' },
          h('label', {}, 'Voz en inglés', voiceEn),
          h('label', {}, 'Voz en español', voiceEs),
        ),
      ),
      h('label', {}, 'Velocidad del inglés', rate),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { save(); speak('Vessel Neptune, this is Valencia Traffic. Over.', LANGS.en); } }, '🔊 Probar inglés'),
        h('button', { class: 'btn', onclick: () => { save(); speak('Buque Neptune, aquí Valencia Tráfico. Cambio.', LANGS.es); } }, '🔊 Probar español'),
      ),
      h('button', { class: 'btn primary', onclick: save }, 'Guardar'),
      h('h2', {}, 'Datos'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' })), download: 'proa-progreso.json' });
          a.click();
        } }, '⬇ Exportar progreso'),
        h('button', { class: 'btn ghost', onclick: () => { if (confirm('¿Borrar todo el progreso y las sesiones?')) { store.reset(); location.hash = '#/inicio'; } } }, 'Borrar todo'),
      ),
    ),
  );
}

// Motor de voz natural: elección, prueba y descarga.
function naturalVoiceSection() {
  const s = store.get().settings;
  const engine = h('select', {}, Object.entries(ENGINES).map(([k, label]) => h('option', { value: k, selected: k === s.voiceEngine }, label)));
  const en = h('select');
  const es = h('select');
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const bar = h('progress', { class: 'hidden', max: 1, value: 0 });
  const download = h('button', { class: 'btn primary' });
  const voicesBox = h('div', { class: 'form flat' });

  const persist = () => store.update((st) => {
    st.settings.voiceEngine = engine.value;
    if (engine.value === 'kokoro') { st.settings.kokoroEn = en.value; st.settings.kokoroEs = es.value; }
    if (engine.value === 'piper') { st.settings.neuralEn = en.value; st.settings.neuralEs = es.value; }
  });

  const refresh = async () => {
    const isBrowser = engine.value === 'browser';
    voicesBox.classList.toggle('hidden', isBrowser);
    if (isBrowser) { status.textContent = 'Se usará la voz del sistema. Suena más artificial pero no necesita descargas.'; return; }
    const mb = await pendingDownloadMb(engine.value, { en: en.value, es: es.value });
    const ready = !mb;
    if (ready && !store.get().settings.naturalReady?.[engine.value]) {
      store.update((st) => { st.settings.naturalReady = { ...st.settings.naturalReady, [engine.value]: true }; });
    }
    download.classList.toggle('hidden', ready);
    download.textContent = `⬇ Descargar voz (${mb} MB)`;
    status.textContent = ready
      ? '✅ Voz natural completa: se usará en toda la app, también sin conexión.'
      : engine.value === 'kokoro'
        ? `Las frases del curso, la hipnosis y el examen guiado ya suenan con voz natural. Para leer también textos nuevos (traductor, intérprete, examen con IA) descarga el modelo: ${mb} MB, una sola vez (mejor con wifi).`
        : `Hasta descargarla se usa la voz del navegador. Descarga única de ${mb} MB (mejor con wifi).`;
  };

  const fill = () => {
    const list = voicesFor(engine.value);
    const cur = selectedVoices(engine.value);
    en.replaceChildren(...list.en.map((v) => h('option', { value: v.id, selected: v.id === cur.en }, v.label)));
    es.replaceChildren(...list.es.map((v) => h('option', { value: v.id, selected: v.id === cur.es }, v.label)));
  };

  engine.addEventListener('change', () => { persist(); fill(); refresh(); });
  en.addEventListener('change', () => { persist(); refresh(); });
  es.addEventListener('change', () => { persist(); refresh(); });

  download.addEventListener('click', async () => {
    download.disabled = true;
    bar.classList.remove('hidden');
    try {
      await prepareEngine(engine.value, { en: en.value, es: es.value }, (l, t) => {
        bar.value = t ? l / t : 0;
        status.textContent = `Descargando… ${Math.round(l / 1e6)} MB${t ? ` de ${Math.round(t / 1e6)}` : ''}`;
      });
      store.update((st) => { st.settings.naturalReady = { ...st.settings.naturalReady, [engine.value]: true }; });
      toast('Voz natural lista.');
    } catch (e) {
      toast(`No se pudo descargar la voz: ${e.message}`, 'error');
    } finally {
      download.disabled = false;
      bar.classList.add('hidden');
      refresh();
    }
  });

  const tryVoice = (lang, text) => h('button', { class: 'btn', onclick: async (e) => {
    const btn = e.currentTarget;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generando…';
    try {
      const audio = await synth(text, lang, { engine: engine.value, voices: { en: en.value, es: es.value } });
      btn.textContent = '🔊 Sonando…';
      await playPcm(audio);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      refresh();
    }
  } }, lang === 'en' ? '▶ Probar inglés' : '▶ Probar español');

  fill();
  refresh();
  voicesBox.append(
    h('label', {}, 'Voz en inglés', en),
    h('label', {}, 'Voz en español', es),
    h('div', { class: 'row' },
      tryVoice('en', 'Vessel Neptune, this is Valencia Traffic. Reduce speed and stand by on channel one-six. Over.'),
      tryVoice('es', 'Buque Neptune, aquí Valencia Tráfico. Reduzca la velocidad y permanezca a la escucha. Cambio.'),
    ),
  );
  return h('div', { class: 'form flat' },
    h('label', {}, 'Motor de voz', engine),
    voicesBox, status, bar, download,
    h('p', { class: 'muted small' }, 'La voz natural funciona dentro del móvil (sin servidor ni coste). Si un texto tarda en generarse, unos segundos de espera son normales.'),
  );
}
