// Convierte una sesión de autohipnosis en un archivo MP3 (voz neuronal + fondo binaural en estéreo).
// Un archivo de audio se reproduce con la pantalla apagada y desde los controles de bloqueo.
import { synthesize } from '../audio/neural-tts.js';
import { buildBed } from '../audio/binaural.js';

const SAMPLE_RATE = 22050;
const INTRO = 6; // segundos de fondo antes de la primera frase
const OUTRO = 10;

// Calcula en qué segundo empieza cada segmento (función pura, testeable).
export function timeline(durations, pausesMs) {
  let t = INTRO;
  const starts = durations.map((d, i) => {
    const s = t;
    t += d + (pausesMs[i] ?? 2000) / 1000;
    return s;
  });
  return { starts, total: t + OUTRO };
}

let lamePromise = null;
function loadLame() {
  if (globalThis.lamejs) return Promise.resolve(globalThis.lamejs);
  lamePromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../../vendor/lame.min.js', import.meta.url).href;
    s.onload = () => resolve(globalThis.lamejs);
    s.onerror = () => reject(new Error('No se pudo cargar el codificador MP3.'));
    document.head.append(s);
  });
  return lamePromise;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function encodeMp3(buffer, onProgress) {
  const lamejs = await loadLame();
  const enc = new lamejs.Mp3Encoder(2, buffer.sampleRate, 96);
  const toInt16 = (f) => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
    return out;
  };
  const L = toInt16(buffer.getChannelData(0));
  const R = toInt16(buffer.getChannelData(1));
  const parts = [];
  const block = 1152 * 20;
  for (let i = 0; i < L.length; i += block) {
    const mp3 = enc.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block));
    if (mp3.length) parts.push(new Uint8Array(mp3));
    if ((i / block) % 20 === 0) { onProgress?.(i / L.length); await tick(); }
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: 'audio/mpeg' });
}

// session: { segments, preset, ocean }. voices: { es, en } ids de voz.
// onProgress(fase, fracción 0-1, detalle)
export async function renderSession(session, voices, onProgress = () => {}) {
  const segs = session.segments;
  const audios = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    onProgress('voz', i / segs.length, `Generando voz ${i + 1}/${segs.length}`);
    const isEn = s.lang === 'en';
    audios.push(await synthesize(s.text, isEn ? voices.en : voices.es, {
      rate: isEn ? 0.8 : 0.88,
      onProgress: (l, t) => onProgress('descarga', t ? l / t : 0, `Descargando voz ${isEn ? 'inglesa' : 'española'} (${Math.round(l / 1e6)} MB${t ? ` de ${Math.round(t / 1e6)}` : ''})`),
    }));
    await tick();
  }

  const { starts, total } = timeline(audios.map((a) => a.pcm.length / a.sampleRate), segs.map((s) => s.pause_ms));
  onProgress('mezcla', 0, 'Mezclando con el sonido binaural…');
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  buildBed(ctx, ctx.destination, { preset: session.preset, ocean: session.ocean, volume: 0.32, duration: total });
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.95;
  voiceGain.connect(ctx.destination);
  audios.forEach((a, i) => {
    const buf = ctx.createBuffer(1, a.pcm.length, a.sampleRate);
    buf.copyToChannel(a.pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceGain);
    src.start(starts[i]);
  });
  const rendered = await ctx.startRendering();
  onProgress('mp3', 0, 'Creando el archivo MP3…');
  const blob = await encodeMp3(rendered, (f) => onProgress('mp3', f, `Creando el archivo MP3… ${Math.round(f * 100)}%`));
  return { blob, seconds: Math.round(total) };
}
