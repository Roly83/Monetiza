// Audios pre-generados con Kokoro para todo el texto fijo de la app (frases, guiones, examen guiado).
// Suenan al instante y sin descargar el modelo. Se crean con tools/bake_voices.py.
export const BAKED_RATES = { en: [0.9, 0.75], es: [0.9] };
export const BAKED_VOICES = { en: ['bm_george', 'bf_emma'], es: ['em_alex', 'ef_dora'] };

const BASE = new URL('../../models/clips/', import.meta.url).href;
let indexPromise = null;
const loadIndex = () => (indexPromise ??= fetch(`${BASE}index.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

// Busca el audio pre-generado más cercano en velocidad (tolerancia ±0,2). Devuelve la URL o null.
export async function findBaked(text, voice, rate = 1) {
  const index = await loadIndex();
  const byVoice = index[voice];
  if (!byVoice) return null;
  let best = null;
  for (const r of Object.keys(byVoice)) {
    const file = byVoice[r][text.trim()];
    if (file && Math.abs(Number(r) - rate) <= 0.2 && (!best || Math.abs(Number(r) - rate) < Math.abs(best.r - rate))) {
      best = { r: Number(r), file };
    }
  }
  return best ? `${BASE}${voice}/${best.file}` : null;
}

let decoder = null;
const pcmCache = new Map();

export async function loadBaked(url) {
  if (pcmCache.has(url)) return pcmCache.get(url);
  const p = (async () => {
    const data = await (await fetch(url)).arrayBuffer();
    decoder ??= new OfflineAudioContext(1, 1, 24000);
    const buf = await decoder.decodeAudioData(data);
    return { pcm: buf.getChannelData(0), sampleRate: buf.sampleRate };
  })();
  pcmCache.set(url, p);
  p.catch(() => pcmCache.delete(url));
  if (pcmCache.size > 200) pcmCache.delete(pcmCache.keys().next().value);
  return p;
}
