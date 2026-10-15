import { h, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { UNITS, allPhrases } from '../data/curriculum.js';
import { dueCards } from '../core/srs.js';

export function renderHome(view) {
  const s = store.get();
  const studied = Object.keys(s.studied).length;
  const due = dueCards(s.cards, allPhrases().filter((p) => s.studied[p.unitId]).map((p) => p.id)).length;
  const lastExam = s.exams.at(-1);

  mount(view, 
    h('section', { class: 'hero' },
      h('h1', {}, 'Inglés marítimo, de forma diferente'),
      h('p', { class: 'lead' }, 'Aprende las frases que se usan a bordo y en la radio con relajación profunda, memoria visual y conversación real.'),
    ),
    h('div', { class: 'stats' },
      stat(`${studied}/${UNITS.length}`, 'unidades estudiadas'),
      stat(due, 'frases para repasar hoy'),
      stat(s.sessions.length, 'sesiones de hipnosis'),
      stat(lastExam ? `${lastExam.score}/10` : '—', 'último examen'),
    ),
    h('h2', {}, 'Tu método'),
    h('ol', { class: 'method' },
      step('📘', 'Estudia una unidad', 'Cada unidad vive en un lugar del barco: tu palacio de la memoria.', '#/curso'),
      step('🗣️', 'Haz shadowing', 'Escucha y repite en voz alta; la app evalúa tu pronunciación.', '#/curso'),
      step('🌊', 'Fíjalo en autohipnosis', 'Escucha las frases en relajación profunda con sonido binaural. Repítela cuantas veces quieras.', '#/hipnosis'),
      step('📻', 'Examínate hablando', 'Una conversación por radio sobre lo que has estudiado.', '#/examen'),
    ),
    h('h2', {}, 'Herramientas'),
    h('div', { class: 'grid' },
      card('🔤', 'Traductor marítimo', 'Texto o voz, español ⇄ inglés, con la frase SMCP equivalente.', '#/traductor'),
      card('🎧', 'Intérprete', 'Media en una conversación entre personas que hablan español e inglés, por turnos o en automático.', '#/interprete'),
    ),
  );
}

const stat = (value, label) => h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label));
const step = (icon, title, text, href) =>
  h('li', {}, h('a', { href }, h('span', { class: 'icon' }, icon), h('div', {}, h('strong', {}, title), h('p', {}, text))));
const card = (icon, title, text, href) =>
  h('a', { class: 'card link', href }, h('span', { class: 'icon big' }, icon), h('strong', {}, title), h('p', {}, text));
