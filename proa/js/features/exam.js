import { h, toast, mount } from '../core/ui.js';
import { store } from '../core/store.js';
import { hasAI, examTurn } from '../core/ai.js';
import { UNITS, allPhrases } from '../data/curriculum.js';
import { speak, listen, LANGS, support, stopSpeaking } from '../audio/speech.js';
import { buildOfflineExam, scoreAnswer, finalReport } from './exam-offline.js';

const SCENARIOS = [
  'Comunicación por VHF con el Centro de Tráfico Marítimo (VTS) de Valencia al aproximarse a puerto',
  'Conversación en el puente con el capitán durante una guardia',
  'Llamada de socorro y coordinación con Salvamento Marítimo',
  'Maniobra de atraque con el práctico y los remolcadores',
];

export function renderExam(view) {
  const s = store.get();
  const studiedUnits = UNITS.filter((u) => s.studied[u.id]);
  const units = studiedUnits.length ? studiedUnits : UNITS.slice(0, 2);
  const scenario = h('select', {}, SCENARIOS.map((x) => h('option', {}, x)));
  const nq = h('select', {}, [4, 6, 8].map((n) => h('option', { value: n, selected: n === 6 }, `${n} preguntas`)));
  const start = h('button', { class: 'btn primary big' }, '📻 Empezar examen');
  const chat = h('ol', { class: 'chat', 'aria-live': 'polite' });
  const answerBox = h('div', { class: 'answer-box hidden' });
  let stopped = false;

  start.addEventListener('click', async () => {
    start.disabled = true;
    chat.replaceChildren();
    stopped = false;
    try {
      const phrases = allPhrases().filter((p) => units.some((u) => u.id === p.unitId));
      const result = hasAI()
        ? await aiExam({ units, scenario: scenario.value, total: Number(nq.value) })
        : await offlineExam(phrases, Number(nq.value));
      if (result) {
        store.update((st) => st.exams.push({ at: Date.now(), score: result.average, ai: hasAI(), units: units.map((u) => u.id) }));
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      start.disabled = false;
      start.textContent = '↻ Repetir examen';
      answerBox.classList.add('hidden');
    }
  });

  const say = (who, text, extra) => chat.append(h('li', { class: who }, h('strong', {}, who === 'examiner' ? '📻 Examinador' : '🧑‍✈️ Tú'), h('div', {}, text), extra ?? null));

  // Pide la respuesta por voz o por texto.
  function getAnswer() {
    return new Promise((resolve) => {
      const input = h('input', { type: 'text', placeholder: 'Escribe tu respuesta en inglés…' });
      const send = h('button', { class: 'btn primary', onclick: () => resolve(input.value.trim()) }, 'Enviar');
      const mic = h('button', { class: 'btn', disabled: !support.stt }, '🎙️ Responder hablando');
      mic.addEventListener('click', async () => {
        mic.disabled = true;
        mic.textContent = '🎙️ Escuchando…';
        try {
          const t = await listen(LANGS.en, { interim: (x) => { input.value = x; } }).result;
          if (t) resolve(t); else { mic.textContent = '🎙️ No te oí, prueba otra vez'; mic.disabled = false; }
        } catch (e) { toast(e.message, 'error'); mic.disabled = false; }
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') resolve(input.value.trim()); });
      answerBox.replaceChildren(mic, input, send);
      answerBox.classList.remove('hidden');
      (support.stt ? mic : input).focus();
    });
  }

  async function aiExam({ units: us, scenario: sc, total }) {
    const content = us.map((u) => `${u.title}: ${u.phrases.map((p) => p.en).join(' | ')}`).join('\n');
    const history = [{ role: 'user', content: 'Empieza el examen.' }];
    const scores = [];
    for (let q = 1; q <= total + 1 && !stopped; q++) {
      const turn = await examTurn({ history, content, questionNumber: Math.min(q, total), totalQuestions: total, scenario: sc });
      if (turn.evaluation.applies) {
        scores.push(turn.evaluation.score);
        chat.lastChild?.append(h('div', { class: 'eval' }, `Nota: ${turn.evaluation.score}/10 · ${turn.evaluation.feedback_es}`, h('br'), h('em', {}, `Modelo: ${turn.evaluation.model_answer}`)));
      }
      say('examiner', turn.examiner_says);
      await speak(turn.examiner_says, LANGS.en, { rate: 0.95 });
      history.push({ role: 'assistant', content: turn.examiner_says });
      if (turn.finished || q > total) {
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        chat.append(h('li', { class: 'report' }, h('strong', {}, '📋 Informe final'), h('p', {}, turn.final_report || `Nota media: ${avg.toFixed(1)}/10`)));
        return { average: Math.round(avg * 10) / 10 };
      }
      const answer = await getAnswer();
      answerBox.classList.add('hidden');
      say('student', answer || '(sin respuesta)');
      history.push({ role: 'user', content: answer || '(sin respuesta)' });
    }
    return null;
  }

  async function offlineExam(phrases, total) {
    const items = buildOfflineExam(phrases, total);
    const results = [];
    say('examiner', 'Modo sin conexión: te diré una situación en español y respondes con la frase estándar en inglés.');
    for (const it of items) {
      if (stopped) return null;
      say('examiner', it.prompt_es);
      await speak(it.prompt_es, LANGS.es);
      const answer = await getAnswer();
      answerBox.classList.add('hidden');
      const { score, feedback } = scoreAnswer(answer, it.phrase.en);
      results.push({ score, expected: it.phrase.en });
      say('student', answer || '(sin respuesta)', h('div', { class: 'eval' }, `Nota: ${score}/10 · ${feedback}`, h('br'), h('em', {}, `Modelo: ${it.phrase.en}`)));
      await speak(it.phrase.en, LANGS.en);
    }
    const rep = finalReport(results);
    chat.append(h('li', { class: 'report' }, h('strong', {}, '📋 Informe final'), h('p', {}, rep.text)));
    return { average: rep.average };
  }

  mount(view, 
    h('h1', {}, '📻 Examen oral'),
    h('p', { class: 'lead' }, 'Una conversación como en la radio o a bordo. El examinador solo pregunta sobre lo que ya has estudiado y evalúa cada respuesta.'),
    h('p', { class: 'muted' }, `Contenido del examen: ${units.map((u) => u.title).join(', ')}${studiedUnits.length ? '' : ' (aún no has marcado unidades como estudiadas; se usan las dos primeras)'}.`),
    hasAI() ? null : h('div', { class: 'warning' }, 'Sin clave de API se usa el examen guiado sin conexión. Con la IA activada el examen es una conversación libre.'),
    h('div', { class: 'form' }, hasAI() ? h('label', {}, 'Escenario', scenario) : null, h('label', {}, 'Longitud', nq), start),
    chat, answerBox,
  );
  return () => { stopped = true; stopSpeaking(); };
}
