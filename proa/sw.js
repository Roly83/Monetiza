// Service worker:
// 1) guarda la app en caché para usarla sin conexión (temario, hipnosis, examen guiado);
// 2) añade las cabeceras de aislamiento (COOP/COEP) que GitHub Pages no permite configurar.
//    Con ellas el navegador deja usar varios hilos y la voz neuronal se genera mucho más rápido.
const CACHE = 'proa-v5';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './js/app.js', './js/core/store.js', './js/core/srs.js', './js/core/text.js', './js/core/ui.js', './js/core/ai.js',
  './js/core/idb.js', './js/data/curriculum.js',
  './js/audio/binaural.js', './js/audio/speech.js', './js/audio/neural-tts.js', './js/audio/kokoro.js',
  './js/audio/ort.js', './js/audio/phonemize.js', './js/audio/voice.js', './js/audio/baked.js',
  './js/features/home.js', './js/features/course.js', './js/features/hypnosis.js', './js/features/hypnosis-script.js',
  './js/features/hypnosis-render.js', './js/features/translator.js', './js/features/interpreter.js',
  './js/features/exam.js', './js/features/exam-offline.js', './js/features/settings.js',
  './simulador.html', './sim.css', './js/sim/generator.js', './js/sim/guide.js', './js/sim/exercises.js', './js/sim/panel.js',
  './vendor/piper-phonemize.js', './vendor/lame.min.js', './models/kokoro/vocab.json', './models/clips/index.json',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('proa-v') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaqueredirect') return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la IA y los CDN van a la red
  // El modelo y los estilos de voz los guarda kokoro.js en su propia caché: aquí no se duplican.
  // Los audios pre-generados (.mp3) sí se guardan para usarlos sin conexión.
  if (/\.(onnx|bin)$/.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return isolate(res);
    }).catch(() => caches.match(e.request).then(isolate)),
  );
});
