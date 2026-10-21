// Lista todos los textos fijos de la app que se pre-generan con voz natural (Kokoro).
// Uso: node tools/textos-voz.mjs > textos.json   (lo consume tools/bake_voices.py)
import { UNITS, allPhrases } from '../js/data/curriculum.js';
import { generateScript } from '../js/features/hypnosis-script.js';
import { buildOfflineExam } from '../js/features/exam-offline.js';
import { BAKED_RATES } from '../js/audio/baked.js';

const items = new Map();
const add = (text, lang) => {
  if (text) items.set(`${lang}|${text}`, { text, lang, rates: BAKED_RATES[lang] });
};

for (const p of allPhrases()) { add(p.en, 'en'); add(p.es, 'es'); }
for (const u of UNITS) {
  const s = generateScript({ phrases: u.phrases.map((p) => ({ ...p, ancla: u.ancla })), minutes: 40, repetitions: 2 });
  for (const seg of s.segments) add(seg.text, seg.lang);
}
for (const it of buildOfflineExam(allPhrases(), allPhrases().length)) add(it.prompt_es, 'es');
add('Modo sin conexión: te diré una situación en español y respondes con la frase estándar en inglés.', 'es');
add('Vessel Neptune, this is Valencia Traffic. Reduce speed and stand by on channel one-six. Over.', 'en');
add('Buque Neptune, aquí Valencia Tráfico. Reduzca la velocidad y permanezca a la escucha. Cambio.', 'es');
add('Vessel Neptune, this is Valencia Traffic. Over.', 'en');
add('Buque Neptune, aquí Valencia Tráfico. Cambio.', 'es');

process.stdout.write(JSON.stringify([...items.values()], null, 1));
