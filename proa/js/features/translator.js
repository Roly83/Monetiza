import { h, busy, mount } from '../core/ui.js';
import { hasAI, translate } from '../core/ai.js';
import { allPhrases } from '../data/curriculum.js';
import { bestMatches } from '../core/text.js';
import { speak, listen, LANGS, support, stopSpeaking } from '../audio/speech.js';

export function renderTranslator(view) {
  let dir = 'es-en';
  const input = h('textarea', { rows: 4, placeholder: 'Escribe o dicta el texto…' });
  const out = h('div', { class: 'result', 'aria-live': 'polite' });
  const dirBtn = h('button', { class: 'btn' });
  const label = () => { dirBtn.textContent = dir === 'es-en' ? 'Español → Inglés ⇄' : 'Inglés → Español ⇄'; };
  label();
  dirBtn.addEventListener('click', () => { dir = dir === 'es-en' ? 'en-es' : 'es-en'; label(); });

  const mic = h('button', { class: 'btn', disabled: !support.stt }, '🎙️ Dictar');
  mic.addEventListener('click', () => busy(mic, async () => {
    const from = dir.startsWith('es') ? LANGS.es : LANGS.en;
    input.value = await listen(from, { interim: (t) => { input.value = t; } }).result;
  }));

  const go = h('button', { class: 'btn primary' }, 'Traducir');
  go.addEventListener('click', () => busy(go, async () => {
    const text = input.value.trim();
    if (!text) return;
    const [from, to] = dir === 'es-en' ? ['español', 'inglés'] : ['inglés', 'español'];
    const toLang = dir === 'es-en' ? LANGS.en : LANGS.es;
    if (hasAI()) {
      const r = await translate(text, from, to);
      out.replaceChildren(); mount(out, 
        h('div', { class: 'big', lang: dir.slice(3) }, r.translation),
        h('button', { class: 'btn', onclick: () => speak(r.translation, toLang) }, '🔊 Escuchar'),
        r.smcp_phrase ? h('p', {}, h('strong', {}, 'Frase SMCP estándar: '), r.smcp_phrase) : null,
        r.notes.length ? h('ul', { class: 'notes' }, r.notes.map((n) => h('li', {}, n))) : null,
      );
    } else {
      // Sin IA: busca en el glosario del curso.
      const [field, other] = dir === 'es-en' ? ['es', 'en'] : ['en', 'es'];
      const matches = bestMatches(text, allPhrases(), field);
      out.replaceChildren(); mount(out, 
        h('p', { class: 'muted' }, 'Modo sin conexión: resultados del glosario marítimo. Configura tu clave en Ajustes para traducir cualquier texto.'),
        matches.length
          ? h('ul', { class: 'notes' }, matches.map(({ p }) => h('li', {}, h('strong', {}, p[other]), ` — ${p[field]} `,
              h('button', { class: 'icon-btn', 'aria-label': 'Escuchar', onclick: () => speak(p[other], other === 'en' ? LANGS.en : LANGS.es) }, '🔊'))))
          : h('p', {}, 'No hay coincidencias en el glosario.'),
      );
    }
  }));

  mount(view, 
    h('h1', {}, '🔤 Traductor marítimo'),
    h('p', { class: 'lead' }, 'Traduce con criterio náutico y te propone la frase estándar SMCP cuando existe.'),
    h('div', { class: 'form' }, h('div', { class: 'row' }, dirBtn, mic), input, go, out),
  );
  return () => stopSpeaking();
}
