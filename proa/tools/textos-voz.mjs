// Lista todos los textos fijos de la app que se pre-generan con voz natural (Kokoro).
// Uso: node tools/textos-voz.mjs > textos.json   (lo consume tools/bake_voices.py)
import { UNITS, allPhrases } from '../js/data/curriculum.js';
import { generateScript } from '../js/features/hypnosis-script.js';
import { buildOfflineExam } from '../js/features/exam-offline.js';
import { BAKED_RATES } from '../js/audio/baked.js';
import { GUIDE } from '../js/sim/guide.js';
import { EXERCISES } from '../js/sim/exercises.js';
import { createState, actions, run, LOADS } from '../js/sim/generator.js';

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

// Simulador del generador de emergencia: guía, partes de los ejercicios y mensajes del registro.
for (const g of Object.values(GUIDE)) { add(g.textEn, 'en'); for (const [en] of g.terms) add(en, 'en'); }
for (const ex of EXERCISES) add(ex.report.en, 'en');
{
  // Recorre todas las maniobras para reunir los mensajes (en inglés) que puede dar el registro.
  const s = createState();
  const flows = [
    () => { actions.blackout(s); run(s, 10); actions.restoreMsb(s); run(s, 12); },
    () => { actions.setMode(s, 'manual'); actions.startEngine(s); run(s, 7); actions.blackout(s); run(s, 1); actions.breakerOn(s); run(s, 1); },
    () => { actions.setTieMode(s, 'emergency'); for (const k of Object.keys(LOADS)) { actions.toggleLoad(s, k); actions.toggleLoad(s, k); } actions.toggleLoad(s, 'ltfw'); run(s, 5); actions.reset(s); },
    () => { actions.toggleLoad(s, 'auxiliaries'); actions.toggleLoad(s, 'ltfw'); actions.breakerOn(s); run(s, 2); actions.restoreMsb(s); run(s, 1); actions.breakerOff(s); run(s, 1); actions.stopEngine(s); },
    () => { actions.setTieMode(s, 'normal'); actions.setMode(s, 'auto'); actions.insulationFault(s, true); run(s, 1); actions.insulationFault(s, false); },
  ];
  for (const f of flows) f();
  for (const ev of s.events) add(ev.en, 'en');
}

process.stdout.write(JSON.stringify([...items.values()], null, 1));
