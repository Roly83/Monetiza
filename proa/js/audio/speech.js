// Voz: síntesis (TTS) y reconocimiento (STT) con las APIs del navegador. Sin coste ni servidor.
import { store } from '../core/store.js';

const synth = globalThis.speechSynthesis;
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export const support = {
  tts: Boolean(synth),
  stt: Boolean(Recognition),
};

export const LANGS = { es: 'es-ES', en: 'en-GB' };

let voicesCache = [];
function voices() {
  if (!synth) return [];
  const v = synth.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}
synth?.addEventListener?.('voiceschanged', voices);

export function listVoices(langPrefix) {
  return voices().filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
}

function pickVoice(lang) {
  const s = store.get().settings;
  const wanted = lang.startsWith('en') ? s.voiceEn : s.voiceEs;
  const all = voices();
  return (
    all.find((v) => v.name === wanted) ||
    all.find((v) => v.lang === lang) ||
    all.find((v) => v.lang.startsWith(lang.slice(0, 2)))
  );
}

let cancelled = false;

// Habla un texto y resuelve al terminar. rate: velocidad (1 = normal).
export function speak(text, lang = LANGS.en, { rate, pitch = 1, volume = 1 } = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve();
    cancelled = false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.voice = pickVoice(lang) ?? null;
    u.rate = rate ?? (lang.startsWith('en') ? store.get().settings.rateEn : 1);
    u.pitch = pitch;
    u.volume = volume;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export function stopSpeaking() {
  cancelled = true;
  synth?.cancel();
}

export const wasCancelled = () => cancelled;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Escucha una frase y devuelve el texto reconocido ('' si no se entendió).
// Devuelve un objeto con la promesa y un método para detener la escucha.
export function listen(lang = LANGS.en, { interim } = {}) {
  if (!Recognition) {
    return { result: Promise.reject(new Error('Reconocimiento de voz no disponible. Usa Chrome o Edge.')), stop() {} };
  }
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = Boolean(interim);
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let finalText = '';
  const result = new Promise((resolve, reject) => {
    rec.onresult = (e) => {
      let text = '';
      for (const r of e.results) {
        text += r[0].transcript;
        if (r.isFinal) finalText = text;
      }
      interim?.(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') resolve('');
      else reject(new Error(`Error de micrófono: ${e.error}`));
    };
    rec.onend = () => resolve(finalText.trim());
  });
  rec.start();
  return { result, stop: () => rec.stop() };
}
