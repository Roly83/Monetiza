// Voz neuronal Kokoro-82M (Apache-2.0) ejecutada en el navegador: la más natural de la app.
// El modelo (92 MB) y las voces se sirven desde la propia web y se guardan en caché tras la primera descarga.
import { loadOrt, cachedFetch, isCached } from './ort.js';
import { phonemize } from './phonemize.js';

const BASE = new URL('../../models/kokoro/', import.meta.url).href;
const MODEL = `${BASE}kokoro-v1.0.int8.onnx`;
const CACHE = 'proa-kokoro-v1';
const SAMPLE_RATE = 24000;
const MAX_TOKENS = 500;

export const KOKORO_VOICES = {
  en: [
    { id: 'bm_george', label: 'George · hombre, británico', espeak: 'en-gb-x-rp' },
    { id: 'bf_emma', label: 'Emma · mujer, británica', espeak: 'en-gb-x-rp' },
    { id: 'bm_lewis', label: 'Lewis · hombre, británico (grave)', espeak: 'en-gb-x-rp' },
    { id: 'am_michael', label: 'Michael · hombre, americano', espeak: 'en-us' },
    { id: 'af_heart', label: 'Heart · mujer, americana', espeak: 'en-us' },
    { id: 'af_bella', label: 'Bella · mujer, americana', espeak: 'en-us' },
  ],
  es: [
    { id: 'em_alex', label: 'Alex · hombre', espeak: 'es' },
    { id: 'ef_dora', label: 'Dora · mujer', espeak: 'es' },
  ],
};
export const KOKORO_MB = 93;

const voiceInfo = (id) => [...KOKORO_VOICES.en, ...KOKORO_VOICES.es].find((v) => v.id === id);

export const isKokoroDownloaded = () => isCached(MODEL, CACHE);

let modelPromise = null;
function loadModel(onProgress) {
  modelPromise ??= (async () => {
    const ort = await loadOrt();
    const [vocab, model] = await Promise.all([
      fetch(`${BASE}vocab.json`).then((r) => r.json()),
      cachedFetch(MODEL, CACHE, onProgress),
    ]);
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    return { ort, session, vocab };
  })().catch((e) => { modelPromise = null; throw e; });
  return modelPromise;
}

const styles = new Map();
async function loadStyle(id) {
  if (!styles.has(id)) {
    styles.set(id, cachedFetch(`${BASE}voices/${id}.bin`, CACHE).then((b) => new Float32Array(b)));
  }
  return styles.get(id);
}

export function prepareKokoro(voiceIds, onProgress) {
  return Promise.all([loadModel(onProgress), ...voiceIds.map(loadStyle)]);
}

// Recorta el silencio del principio y del final (deja un margen corto).
export function trimSilence(pcm, threshold = 0.01, margin = Math.round(SAMPLE_RATE * 0.08)) {
  let start = 0;
  let end = pcm.length - 1;
  while (start < end && Math.abs(pcm[start]) < threshold) start++;
  while (end > start && Math.abs(pcm[end]) < threshold) end--;
  return pcm.slice(Math.max(0, start - margin), Math.min(pcm.length, end + margin));
}

// Divide el texto en frases para respetar el límite de fonemas del modelo.
export function splitSentences(text) {
  return (text.match(/[^.!?…;]+[.!?…;]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

// Convierte fonemas en identificadores del vocabulario (los desconocidos se descartan).
export function tokenize(phonemes, vocab) {
  const ids = [];
  for (const ch of phonemes) if (vocab[ch] !== undefined) ids.push(vocab[ch]);
  return ids;
}

const pcmCache = new Map();

// Sintetiza un texto. rate < 1 = más lento. Devuelve { pcm: Float32Array, sampleRate }.
export async function synthesizeKokoro(text, voiceId, { rate = 1, onProgress } = {}) {
  const key = `${voiceId}|${rate}|${text}`;
  if (pcmCache.has(key)) return pcmCache.get(key);
  const info = voiceInfo(voiceId);
  if (!info) throw new Error(`Voz desconocida: ${voiceId}`);
  const [{ ort, session, vocab }, style] = await Promise.all([loadModel(onProgress), loadStyle(voiceId)]);
  // Fonemas de todo el texto; se agrupan frases hasta el límite del modelo para generar en pocas pasadas.
  const groups = [];
  let current = [];
  for (const sentence of splitSentences(text)) {
    const { phonemes } = await phonemize(sentence, info.espeak);
    const ids = tokenize(phonemes, vocab);
    if (current.length && current.length + ids.length + 1 > MAX_TOKENS) { groups.push(current); current = []; }
    if (current.length) current.push(vocab[' ']);
    current.push(...ids.slice(0, MAX_TOKENS));
  }
  if (current.length) groups.push(current);
  const parts = [];
  for (const tokens of groups) {
    const row = Math.min(tokens.length, 510) - 1;
    const feeds = {
      tokens: new ort.Tensor('int64', BigInt64Array.from([0, ...tokens, 0].map(BigInt)), [1, tokens.length + 2]),
      style: new ort.Tensor('float32', style.subarray(row * 256, row * 256 + 256), [1, 256]),
      speed: new ort.Tensor('float32', Float32Array.from([rate]), [1]),
    };
    const { audio } = await session.run(feeds);
    parts.push(trimSilence(audio.data));
  }
  const len = parts.reduce((t, p) => t + p.length, 0);
  const pcm = new Float32Array(len);
  let o = 0;
  for (const p of parts) { pcm.set(p, o); o += p.length; }
  const out = { pcm, sampleRate: SAMPLE_RATE };
  pcmCache.set(key, out);
  if (pcmCache.size > 300) pcmCache.delete(pcmCache.keys().next().value);
  return out;
}
