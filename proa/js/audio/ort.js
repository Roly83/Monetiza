// Carga única de ONNX Runtime Web (motor de inferencia para los modelos de voz).
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
let ortPromise = null;

export function loadOrt() {
  if (globalThis.ort) return Promise.resolve(globalThis.ort);
  ortPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${ORT_BASE}ort.min.js`;
    s.onload = () => {
      globalThis.ort.env.wasm.wasmPaths = ORT_BASE;
      // Con aislamiento (lo activa sw.js) se pueden usar varios hilos; sin él, solo uno.
      globalThis.ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      resolve(globalThis.ort);
    };
    s.onerror = () => { ortPromise = null; reject(new Error('No se pudo cargar el motor de voz. Revisa la conexión.')); };
    document.head.append(s);
  });
  return ortPromise;
}

// Descarga con progreso y guarda en Cache Storage para no volver a descargar.
export async function cachedFetch(url, cacheName, onProgress) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url.split('/').pop()} (${res.status}).`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const blob = new Blob(chunks);
  await cache.put(url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
  return blob.arrayBuffer();
}

export async function isCached(url, cacheName) {
  if (!globalThis.caches) return false;
  return Boolean(await (await caches.open(cacheName)).match(url));
}
