// Texto → fonemas con espeak-ng compilado a WebAssembly (piper-phonemize). Lo usan Piper y Kokoro.
const PIPER_WASM = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

// Devuelve { ids, phonemes } para una voz de espeak ('es', 'en-gb', 'en-us', 'en-gb-x-rp'…).
export async function phonemize(text, espeakVoice) {
  const { createPiperPhonemize } = await import('../../vendor/piper-phonemize.js');
  return new Promise((resolve, reject) => {
    let done = false;
    createPiperPhonemize({
      print: (data) => {
        if (done) return;
        done = true;
        const r = JSON.parse(data);
        resolve({ ids: r.phoneme_ids, phonemes: r.phonemes.join('') });
      },
      printErr: (msg) => { if (!done) { done = true; reject(new Error(msg)); } },
      locateFile: (url) => (url.endsWith('.wasm') ? `${PIPER_WASM}.wasm` : url.endsWith('.data') ? `${PIPER_WASM}.data` : url),
    }).then((module) => {
      module.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
    }, reject);
  });
}
