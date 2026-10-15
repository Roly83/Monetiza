import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, newCard, dueCards } from '../js/core/srs.js';
import { similarity, normalize, bestMatches } from '../js/core/text.js';
import { earFrequencies, PRESETS } from '../js/audio/binaural.js';
import { generateScript, estimateSeconds } from '../js/features/hypnosis-script.js';
import { buildOfflineExam, scoreAnswer, finalReport } from '../js/features/exam-offline.js';
import { UNITS, allPhrases } from '../js/data/curriculum.js';
import { attributeSpeaker } from '../js/features/interpreter.js';

test('frecuencias binaurales: la diferencia entre oídos es el pulso', () => {
  const { left, right } = earFrequencies(200, 6);
  assert.equal(right - left, 6);
  assert.equal((left + right) / 2, 200);
  for (const p of Object.values(PRESETS)) assert.ok(p.beat > 0 && p.carrier > 100);
});

test('repetición espaciada: aciertos alargan el intervalo, fallos lo reinician', () => {
  const now = 0;
  let c = review(newCard(now), 5, now);
  assert.equal(c.interval, 1);
  c = review(c, 4, now);
  assert.equal(c.interval, 3);
  c = review(c, 5, now);
  assert.ok(c.interval > 3);
  const fail = review(c, 0, now);
  assert.equal(fail.reps, 0);
  assert.ok(fail.ease >= 1.3);
  assert.deepEqual(dueCards({ a: { due: 10 }, b: { due: 1e15 } }, ['a', 'b', 'c'], 100), ['a', 'c']);
});

test('similitud tolera mayúsculas, signos y acentos', () => {
  assert.equal(normalize('¡Paren Máquinas!'), 'paren maquinas');
  assert.equal(similarity('Stop engines.', 'stop engines'), 1);
  assert.ok(similarity('I am altering course to port', 'I am altering course to port.') > 0.99);
  assert.ok(similarity('hello world', 'stop engines') === 0);
});

test('el traductor sin conexión encuentra frases del glosario', () => {
  const m = bestMatches('hombre al agua', allPhrases(), 'es');
  assert.equal(m[0].p.en, 'Person overboard.');
});

test('guion de hipnosis: estructura completa y repeticiones según duración', () => {
  const unit = UNITS[2];
  const s = generateScript({ phrases: unit.phrases.map((p) => ({ ...p, ancla: unit.ancla })), minutes: 16 });
  const kinds = new Set(s.segments.map((x) => x.kind));
  for (const k of ['induccion', 'profundizacion', 'aprendizaje', 'sugestion', 'salida']) assert.ok(kinds.has(k), k);
  assert.equal(s.segments.at(-1).kind, 'salida');
  const en = s.segments.filter((x) => x.lang === 'en').length;
  assert.equal(en, unit.phrases.length * 2 * s.repetitions);
  const secs = estimateSeconds(s);
  assert.ok(secs > 8 * 60 && secs < 24 * 60, `duración ${secs}s`);
  assert.throws(() => generateScript({ phrases: [] }));
});

test('examen sin conexión: puntúa y genera informe', () => {
  const items = buildOfflineExam(allPhrases(), 5, () => 0.3);
  assert.equal(items.length, 5);
  assert.equal(scoreAnswer('Person overboard', 'Person overboard.').score, 10);
  assert.ok(scoreAnswer('no idea', 'Let go the anchor.').score <= 2);
  const r = finalReport([{ score: 10, expected: 'a' }, { score: 4, expected: 'b' }]);
  assert.equal(r.average, 7);
  assert.match(r.text, /Repasa: b/);
});

test('intérprete: identifica a la persona por idioma y alterna si comparten idioma', () => {
  const ps = [
    { id: 'a', lang: 'es' }, { id: 'b', lang: 'en' }, { id: 'c', lang: 'en' },
  ];
  assert.equal(attributeSpeaker(ps, 'es', null).id, 'a');
  assert.equal(attributeSpeaker(ps, 'en', 'a').id, 'b');
  assert.equal(attributeSpeaker(ps, 'en', 'b').id, 'c');
  assert.equal(attributeSpeaker(ps, 'en', 'c').id, 'b');
});

test('temario: 8 unidades con frases y traducciones completas', () => {
  assert.equal(UNITS.length, 8);
  for (const u of UNITS) {
    assert.ok(u.ancla && u.intro);
    for (const p of u.phrases) assert.ok(p.en && p.es, `${u.id}: ${p.en}`);
  }
});

test('audio de la sesión: cada frase empieza tras la anterior y su pausa', async () => {
  const { timeline } = await import('../js/features/hypnosis-render.js');
  const { starts, total } = timeline([2, 3], [1000, 500]);
  assert.deepEqual(starts, [6, 9]);
  assert.equal(total, 6 + 2 + 1 + 3 + 0.5 + 10);
});

test('Kokoro: frases, tokens y recorte de silencio', async () => {
  const { splitSentences, tokenize, trimSilence } = await import('../js/audio/kokoro.js');
  assert.deepEqual(splitSentences('Mayday. I am on fire! Over?'), ['Mayday.', 'I am on fire!', 'Over?']);
  assert.deepEqual(tokenize('ab z', { a: 1, b: 2, ' ': 16 }), [1, 2, 16]); // 'z' no está en el vocabulario
  const pcm = new Float32Array(48000);
  pcm.fill(0.5, 20000, 22000);
  const out = trimSilence(pcm);
  assert.ok(out.length < 6000 && out.length >= 2000, `recortado a ${out.length}`);
});

test('textos fijos con voz pre-generada: incluyen frases, guiones y examen', async () => {
  const { execFileSync } = await import('node:child_process');
  const items = JSON.parse(execFileSync('node', [new URL('../tools/textos-voz.mjs', import.meta.url).pathname]).toString());
  const texts = new Set(items.map((i) => i.text));
  assert.ok(texts.has('Person overboard.'));
  assert.ok(texts.has('Hombre al agua.'));
  assert.ok(texts.has('Cuatro… tres… dos… uno.'));
  assert.ok([...texts].some((t) => t.startsWith('Dilo en inglés marítimo')));
});
