// Voz neuronal Piper ejecutada dentro del navegador (sin servidor). Genera audio de verdad
// (no solo reproducción), lo que permite crear archivos que suenan con la pantalla apagada.
// Las voces se descargan una sola vez desde Hugging Face y se guardan en la caché del navegador.

import { loadOrt, cachedFetch as cachedFetchShared, isCached } from './ort.js';
import { phonemize } from './phonemize.js';

const HF_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';
const CACHE = 'proa-voces-v1';

export const VOICES = {
  es: [
    { id: 'es_ES-davefx-medium', label: 'Davefx · hombre, España', path: 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx', mb: 63 },
    { id: 'es_ES-sharvard-medium', label: 'Sharvard · España', path: 'es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx', mb: 77 },
    { id: 'es_MX-claude-high', label: 'Claude · hombre, México (alta calidad)', path: 'es/es_MX/claude/high/es_MX-claude-high.onnx', mb: 63 },
  ],
  en: [
    { id: 'en_GB-alan-medium', label: 'Alan · hombre, británico', path: 'en/en_GB/alan/medium/en_GB-alan-medium.onnx', mb: 63 },
    { id: 'en_GB-cori-medium', label: 'Cori · mujer, británica', path: 'en/en_GB/cori/medium/en_GB-cori-medium.onnx', mb: 63 },
    { id: 'en_US-lessac-medium', label: 'Lessac · mujer, americana', path: 'en/en_US/lessac/medium/en_US-lessac-medium.onnx', mb: 63 },
  ],
};

export const voiceById = (id) => [...VOICES.es, ...VOICES.en].find((v) => v.id === id);

const cachedFetch = (url, onProgress) => cachedFetchShared(url, CACHE, onProgress);

export async function isVoiceDownloaded(id) {
  const v = voiceById(id);
  if (!v || !globalThis.caches) return false;
  return isCached(HF_BASE + v.path, CACHE);
}

const sessions = new Map(); // voiceId -> Promise<{session, config}>

function loadVoice(id, onProgress) {
  if (!sessions.has(id)) {
    const p = (async () => {
      const v = voiceById(id);
      if (!v) throw new Error(`Voz desconocida: ${id}`);
      const ort = await loadOrt();
      const config = JSON.parse(new TextDecoder().decode(await cachedFetch(`${HF_BASE}${v.path}.json`)));
      const model = await cachedFetch(HF_BASE + v.path, onProgress);
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      return { session, config };
    })();
    p.catch(() => sessions.delete(id));
    sessions.set(id, p);
  }
  return sessions.get(id);
}

const pcmCache = new Map();

// Sintetiza un texto. rate < 1 = más lento. Devuelve { pcm: Float32Array, sampleRate }.
export async function synthesize(text, voiceId, { rate = 1, onProgress } = {}) {
  const key = `${voiceId}|${rate}|${text}`;
  if (pcmCache.has(key)) return pcmCache.get(key);
  const { session, config } = await loadVoice(voiceId, onProgress);
  const ort = globalThis.ort;
  const { ids } = await phonemize(text.trim(), config.espeak.voice);
  const feeds = {
    input: new ort.Tensor('int64', ids, [1, ids.length]),
    input_lengths: new ort.Tensor('int64', [ids.length]),
    scales: new ort.Tensor('float32', [config.inference.noise_scale, config.inference.length_scale / rate, config.inference.noise_w]),
  };
  if (Object.keys(config.speaker_id_map ?? {}).length) feeds.sid = new ort.Tensor('int64', [0]);
  const { output } = await session.run(feeds);
  const out = { pcm: new Float32Array(output.data), sampleRate: config.audio.sample_rate };
  pcmCache.set(key, out);
  return out;
}

export function prepareVoices(ids, onProgress) {
  return Promise.all(ids.map((id) => loadVoice(id, (l, t) => onProgress?.(id, l, t))));
}
