// Examen guiado sin IA: el examinador plantea situaciones y se evalúa la respuesta por similitud.
import { similarity } from '../core/text.js';

export function buildOfflineExam(phrases, n = 6, rand = Math.random) {
  const pool = [...phrases];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map((p) => ({
    phrase: p,
    prompt_en: `Tell me in standard maritime English: ${p.es}`,
    prompt_es: `Dilo en inglés marítimo: «${p.es}»`,
  }));
}

export function scoreAnswer(answer, expected) {
  const sim = similarity(answer, expected);
  const score = Math.round(sim * 10);
  const feedback = score >= 9 ? '¡Perfecto!' : score >= 7 ? 'Muy bien, casi exacto.' : score >= 4 ? 'Se entiende, pero no es la frase estándar.' : 'Hay que repasarla.';
  return { score, feedback };
}

export function finalReport(results) {
  const avg = results.length ? results.reduce((t, r) => t + r.score, 0) / results.length : 0;
  const weak = results.filter((r) => r.score < 7).map((r) => r.expected);
  return {
    average: Math.round(avg * 10) / 10,
    text: `Nota media: ${avg.toFixed(1)}/10.` + (weak.length ? ` Repasa: ${weak.join(' · ')}` : ' ¡Dominas este contenido!'),
  };
}
