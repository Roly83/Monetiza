import { h, toast, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { listVoices, speak, LANGS } from '../audio/speech.js';

export function renderSettings(view) {
  const s = store.get().settings;
  const key = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off' });
  const model = h('select', {},
    [['claude-opus-5-5', 'Claude Opus 5.5 (máxima calidad)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (más económico)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (más rápido y barato)']]
      .map(([v, t]) => h('option', { value: v, selected: s.model === v }, t)));
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
      h('h2', {}, 'Inteligencia artificial'),
      h('p', { class: 'muted' }, 'El traductor libre, el intérprete, el examen conversacional y los guiones personalizados usan Claude. Crea una clave en console.anthropic.com (pago por uso, céntimos por sesión). La clave se guarda solo en este dispositivo.'),
      h('label', {}, 'Clave de API', key),
      h('label', {}, 'Modelo', model),
      h('h2', {}, 'Voz'),
      h('label', {}, 'Voz en inglés', voiceEn),
      h('label', {}, 'Voz en español', voiceEs),
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
