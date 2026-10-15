// Persistencia local (localStorage). Todo vive en el dispositivo del usuario.
const KEY = 'proa:v1';

const defaults = () => ({
  settings: {
    apiKey: '',
    model: 'claude-opus-5-5',
    rateEn: 0.9,
    voiceEn: '',
    voiceEs: '',
    hypnosisAccepted: false,
    neuralEs: 'es_ES-davefx-medium',
    neuralEn: 'en_GB-alan-medium',
    theme: 'dark',
    voiceEngine: 'kokoro',
    kokoroEn: 'bm_george',
    kokoroEs: 'em_alex',
    naturalReady: {},
  },
  studied: {}, // unitId -> { seen: n, completedAt }
  cards: {}, // phraseId -> tarjeta de repetición espaciada
  sessions: [], // sesiones de autohipnosis guardadas
  exams: [], // resultados de exámenes orales
  shadowing: {}, // phraseId -> mejor puntuación
});

let memory = null;

function load() {
  if (memory) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    memory = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
    memory.settings = { ...defaults().settings, ...memory.settings };
  } catch {
    memory = defaults();
  }
  return memory;
}

function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Sin almacenamiento disponible (modo privado): la app sigue funcionando en memoria.
  }
}

export const store = {
  get: () => load(),
  update(fn) {
    fn(load());
    save();
    globalThis.dispatchEvent?.(new CustomEvent('proa:store'));
  },
  reset() {
    memory = defaults();
    save();
  },
  exportJson: () => JSON.stringify(load(), null, 2),
};
