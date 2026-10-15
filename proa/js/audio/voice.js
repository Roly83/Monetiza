// Capa de voz común: decide qué motor genera la voz y reproduce el audio generado.
// - kokoro: voz neuronal más natural (recomendada)
// - piper: voz neuronal más rápida y ligera
// - browser: voz del sistema (sin descargas)
import { store } from '../core/store.js';
import { findBaked, loadBaked, BAKED_VOICES } from './baked.js';
import { KOKORO_VOICES, KOKORO_MB, synthesizeKokoro, prepareKokoro, isKokoroDownloaded } from './kokoro.js';
import { VOICES as PIPER_VOICES, synthesize as synthesizePiper, prepareVoices as preparePiper, isVoiceDownloaded, voiceById } from './neural-tts.js';

export const ENGINES = {
  kokoro: 'Natural (Kokoro) · recomendada',
  piper: 'Rápida (Piper)',
  browser: 'Del navegador (sin descargas)',
};

// Voces de un motor. En Kokoro se indica cuáles no tienen audios pre-generados (necesitan el modelo).
export function voicesFor(engine) {
  if (engine === 'piper') return PIPER_VOICES;
  const mark = (lang) => KOKORO_VOICES[lang].map((v) => (BAKED_VOICES[lang].includes(v.id) ? v : { ...v, label: `${v.label} · necesita descarga` }));
  return { en: mark('en'), es: mark('es') };
}

const settings = () => store.get().settings;

export function selectedVoices(engine = settings().voiceEngine) {
  const s = settings();
  return engine === 'piper' ? { en: s.neuralEn, es: s.neuralEs } : { en: s.kokoroEn, es: s.kokoroEs };
}

// Tamaño aproximado de la descarga pendiente (MB) para un motor y unas voces.
export async function pendingDownloadMb(engine, voices = selectedVoices(engine)) {
  if (engine === 'kokoro') return (await isKokoroDownloaded()) ? 0 : KOKORO_MB;
  if (engine === 'piper') {
    let mb = 0;
    for (const id of [voices.en, voices.es]) if (!(await isVoiceDownloaded(id))) mb += voiceById(id)?.mb ?? 0;
    return mb;
  }
  return 0;
}

export async function prepareEngine(engine, voices = selectedVoices(engine), onProgress) {
  if (engine === 'kokoro') await prepareKokoro([voices.en, voices.es], onProgress);
  else if (engine === 'piper') await preparePiper([voices.en, voices.es], (id, l, t) => onProgress?.(l, t));
}

// Genera audio (PCM) con el motor indicado. lang: 'en' | 'es'.
// Con Kokoro usa primero los audios pre-generados (instantáneos); si el texto es nuevo, el modelo.
export async function synth(text, lang, { engine = settings().voiceEngine, voices = selectedVoices(engine), rate = 1, onProgress, modelAllowed = true } = {}) {
  const voice = voices[lang];
  if (engine === 'piper') return synthesizePiper(text, voice, { rate, onProgress });
  const baked = await findBaked(text, voice, rate);
  if (baked) return loadBaked(baked);
  if (!modelAllowed) throw new Error('Este texto necesita la voz natural descargada.');
  return synthesizeKokoro(text, voice, { rate, onProgress });
}

// Cuántos textos de una lista no tienen audio pre-generado (y necesitarían el modelo).
export async function missingBaked(items, voices) {
  let missing = 0;
  for (const { text, lang, rate } of items) if (!(await findBaked(text, voices[lang], rate))) missing++;
  return missing;
}

let ctx = null;
let current = null;
let generation = 0; // se incrementa al detener: descarta audios que terminan de generarse tarde

export async function playPcm({ pcm, sampleRate }) {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  ctx ??= new Ctx();
  await ctx.resume();
  if (current) { try { current.stop(); } catch {} current = null; }
  const buf = ctx.createBuffer(1, pcm.length, sampleRate);
  buf.copyToChannel(pcm, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  current = src;
  return new Promise((resolve) => {
    src.onended = () => { if (current === src) current = null; resolve(); };
    src.start();
  });
}

export function stopNatural() {
  generation++;
  if (current) {
    try { current.stop(); } catch {}
    current = null;
  }
}

// Habla con la voz natural. Si el texto no está pre-generado y el modelo no se ha descargado,
// lanza un error para que se use la voz del navegador (sin descargas inesperadas).
export async function speakNatural(text, lang, { rate = 1 } = {}) {
  const s = settings();
  if (s.voiceEngine === 'browser') throw new Error('Voz del navegador seleccionada.');
  const g = generation;
  const audio = await synth(text, lang, { rate, modelAllowed: Boolean(s.naturalReady?.[s.voiceEngine]) });
  if (g !== generation) return; // se detuvo mientras se generaba
  await playPcm(audio);
}
