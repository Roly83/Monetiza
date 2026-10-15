// Service worker: guarda la app en caché para usarla sin conexión (temario, hipnosis, examen guiado).
const CACHE = 'proa-v2';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './js/app.js', './js/core/store.js', './js/core/srs.js', './js/core/text.js', './js/core/ui.js', './js/core/ai.js',
  './js/audio/binaural.js', './js/audio/speech.js', './js/data/curriculum.js',
  './js/features/home.js', './js/features/course.js', './js/features/hypnosis.js', './js/features/hypnosis-script.js',
  './js/features/translator.js', './js/features/interpreter.js', './js/features/exam.js', './js/features/exam-offline.js',
  './js/features/settings.js', './js/features/hypnosis-render.js', './js/audio/neural-tts.js', './js/core/idb.js',
  './vendor/piper-phonemize.js', './vendor/lame.min.js',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la IA va siempre a la red
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)),
  );
});
