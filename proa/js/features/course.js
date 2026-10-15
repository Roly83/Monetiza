import { h, toast, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { UNITS, unitById, allPhrases } from '../data/curriculum.js';
import { review, dueCards } from '../core/srs.js';
import { similarity } from '../core/text.js';
import { speak, listen, LANGS, support, stopSpeaking } from '../audio/speech.js';

export function renderCourse(view, [unitId, mode]) {
  if (unitId === 'repaso') return renderReview(view);
  if (unitId) return renderUnit(view, unitById(unitId), mode);

  const s = store.get();
  mount(view, 
    h('h1', {}, 'Curso de inglés marítimo'),
    h('p', { class: 'lead' }, 'Basado en las Standard Marine Communication Phrases (SMCP) de la OMI. Cada unidad tiene un lugar del barco asignado: al recordar el lugar, recordarás las frases.'),
    h('a', { class: 'btn primary', href: '#/curso/repaso' }, '🔁 Repaso espaciado de hoy'),
    h('div', { class: 'grid' },
      UNITS.map((u, i) => h('a', { class: `card link ${s.studied[u.id] ? 'done' : ''}`, href: `#/curso/${u.id}` },
        h('span', { class: 'muted' }, `Unidad ${i + 1} · ${u.ancla}`),
        h('strong', {}, u.title),
        h('p', {}, u.intro),
        s.studied[u.id] ? h('span', { class: 'pill ok' }, '✓ Estudiada') : null,
      )),
    ),
  );
}

function renderUnit(view, unit, mode) {
  if (!unit) { location.hash = '#/curso'; return; }
  const s = store.get();
  const markStudied = () => store.update((st) => {
    st.studied[unit.id] = { seen: (st.studied[unit.id]?.seen ?? 0) + 1, completedAt: Date.now() };
  });

  mount(view, 
    h('a', { href: '#/curso', class: 'back' }, '← Unidades'),
    h('h1', {}, unit.title),
    h('div', { class: 'palace' },
      h('strong', {}, `🏛️ Palacio de la memoria: ${unit.ancla}`),
      h('p', {}, `Antes de empezar, cierra los ojos e imagina ${unit.ancla.toLowerCase()} con todo detalle: colores, sonidos, olor a mar. Coloca allí cada frase como si estuviera escrita en un objeto distinto. Cuando necesites recordarlas, vuelve mentalmente a ese lugar.`),
    ),
    h('p', {}, unit.intro),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => playAll(unit) }, '▶ Escuchar todas'),
      h('a', { class: 'btn', href: `#/hipnosis/nueva/${unit.id}` }, '🌊 Crear sesión de hipnosis'),
      h('button', { class: 'btn primary', onclick: () => { markStudied(); toast('Unidad marcada como estudiada. Ya aparecerá en el repaso y en el examen.'); } }, s.studied[unit.id] ? '✓ Estudiada' : 'Marcar como estudiada'),
    ),
    h('ul', { class: 'phrases' }, unit.phrases.map((p, i) => phraseRow(unit, p, i))),
  );
  return () => stopSpeaking();
}

function phraseRow(unit, p, i) {
  const id = `${unit.id}:${i}`;
  const best = store.get().shadowing[id];
  const result = h('div', { class: 'shadow-result' }, best ? `Mejor shadowing: ${best}%` : '');
  return h('li', { class: 'phrase' },
    h('div', {},
      h('div', { class: 'en', lang: 'en' }, p.en),
      h('div', { class: 'es' }, p.es),
      p.nota ? h('div', { class: 'nota' }, `💡 ${p.nota}`) : null,
      result,
    ),
    h('div', { class: 'actions' },
      h('button', { class: 'icon-btn', title: 'Escuchar', 'aria-label': 'Escuchar', onclick: () => speak(p.en, LANGS.en) }, '🔊'),
      h('button', { class: 'icon-btn', title: 'Escuchar despacio', 'aria-label': 'Escuchar despacio', onclick: () => speak(p.en, LANGS.en, { rate: 0.6 }) }, '🐢'),
      h('button', { class: 'icon-btn', title: 'Shadowing: escucha y repite', 'aria-label': 'Shadowing', disabled: !support.stt, onclick: (e) => shadow(p, id, result, e.currentTarget) }, '🗣️'),
    ),
  );
}

async function shadow(p, id, result, btn) {
  btn.disabled = true;
  try {
    result.textContent = '🔊 Escucha…';
    await speak(p.en, LANGS.en);
    result.textContent = '🎙️ Ahora repite tú…';
    const heard = await listen(LANGS.en).result;
    const score = Math.round(similarity(heard, p.en) * 100);
    store.update((st) => { st.shadowing[id] = Math.max(st.shadowing[id] ?? 0, score); });
    result.textContent = heard ? `Entendí: "${heard}" · ${score}% ${score >= 80 ? '🎯' : score >= 50 ? '👍' : '🔁 inténtalo otra vez'}` : 'No te he oído. Prueba de nuevo.';
  } catch (e) {
    result.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

async function playAll(unit) {
  for (const p of unit.phrases) {
    await speak(p.en, LANGS.en);
    await speak(p.es, LANGS.es);
  }
}

function renderReview(view) {
  const s = store.get();
  const pool = allPhrases().filter((p) => s.studied[p.unitId]);
  const queue = dueCards(s.cards, pool.map((p) => p.id)).map((id) => pool.find((p) => p.id === id));
  mount(view, h('a', { href: '#/curso', class: 'back' }, '← Unidades'), h('h1', {}, 'Repaso espaciado'));
  if (!pool.length) {
    mount(view, h('p', {}, 'Primero marca alguna unidad como estudiada.'));
    return;
  }
  if (!queue.length) {
    mount(view, h('p', {}, '¡Al día! No tienes frases pendientes hoy. Vuelve mañana o haz una sesión de hipnosis.'));
    return;
  }
  const box = h('div', { class: 'flashcard' });
  mount(view, h('p', { class: 'muted' }, `${queue.length} frases pendientes. Lee el español, di la frase en inglés y luego compruébala.`), box);
  let i = 0;
  const show = () => {
    const p = queue[i];
    if (!p) { box.replaceChildren(h('p', {}, '✅ Repaso terminado.')); return; }
    const answer = h('div', { class: 'answer hidden' },
      h('div', { class: 'en', lang: 'en' }, p.en),
      h('div', { class: 'row' },
        ['😵 No la sabía', '😅 Con dificultad', '🙂 Bien', '😎 Perfecta'].map((label, k) =>
          h('button', { class: 'btn', onclick: () => grade([0, 3, 4, 5][k]) }, label)),
      ),
    );
    box.replaceChildren(
      h('span', { class: 'muted' }, `${i + 1} / ${queue.length}`),
      h('div', { class: 'es big' }, p.es),
      h('button', { class: 'btn primary', onclick: () => { answer.classList.remove('hidden'); speak(p.en, LANGS.en); } }, 'Mostrar respuesta'),
      answer,
    );
  };
  const grade = (q) => {
    const p = queue[i];
    store.update((st) => { st.cards[p.id] = review(st.cards[p.id], q); });
    i++;
    show();
  };
  show();
  return () => stopSpeaking();
}
