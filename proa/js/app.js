import { h } from './core/ui.js';
import { hasAI } from './core/ai.js';
import { store } from './core/store.js';
import { renderHome } from './features/home.js';
import { renderCourse } from './features/course.js';
import { renderHypnosis } from './features/hypnosis.js';
import { renderTranslator } from './features/translator.js';
import { renderInterpreter } from './features/interpreter.js';
import { renderExam } from './features/exam.js';
import { renderSettings } from './features/settings.js';

const ROUTES = [
  { id: 'inicio', label: 'Inicio', icon: '🧭', render: renderHome },
  { id: 'curso', label: 'Curso', icon: '📘', render: renderCourse },
  { id: 'hipnosis', label: 'Hipnosis', icon: '🌊', render: renderHypnosis },
  { id: 'traductor', label: 'Traductor', icon: '🔤', render: renderTranslator },
  { id: 'interprete', label: 'Intérprete', icon: '🎧', render: renderInterpreter },
  { id: 'examen', label: 'Examen', icon: '📻', render: renderExam },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️', render: renderSettings },
];

let cleanup = null;

function route() {
  const [id, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const r = ROUTES.find((x) => x.id === id) ?? ROUTES[0];
  document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.id === r.id ? 'page' : 'false'));
  if (typeof cleanup === 'function') cleanup();
  const view = document.getElementById('view');
  view.replaceChildren();
  cleanup = r.render(view, rest);
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  updateStatus();
}

function updateStatus() {
  const el = document.getElementById('ai-status');
  el.textContent = hasAI() ? 'IA conectada' : 'Modo sin conexión';
  el.className = `pill ${hasAI() ? 'ok' : 'off'}`;
}

// Tema: oscuro (por defecto), claro o automático según el sistema.
const THEMES = { dark: ['🌙', 'Modo oscuro'], light: ['☀️', 'Modo claro'], auto: ['🌗', 'Tema automático'] };
export function applyTheme() {
  const t = store.get().settings.theme || 'dark';
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById('theme-btn');
  btn.textContent = THEMES[t][0];
  btn.title = `${THEMES[t][1]} (pulsa para cambiar)`;
  btn.setAttribute('aria-label', btn.title);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#0b2239';
}
document.getElementById('theme-btn').addEventListener('click', () => {
  const order = ['dark', 'light', 'auto'];
  store.update((s) => { s.settings.theme = order[(order.indexOf(s.settings.theme) + 1) % order.length]; });
});
window.addEventListener('proa:store', applyTheme);
applyTheme();

document.getElementById('tabs').append(
  ...ROUTES.map((r) => h('a', { href: `#/${r.id}`, 'data-id': r.id }, h('span', { 'aria-hidden': 'true' }, r.icon), r.label)),
);
window.addEventListener('hashchange', route);
window.addEventListener('proa:store', updateStatus);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(() => {
    // La primera vez el service worker aún no controla la página: se recarga una vez para activar
    // el aislamiento (necesario para usar varios hilos en la voz neuronal).
    if (!globalThis.crossOriginIsolated && !sessionStorage.getItem('proa:coi-reload')) {
      navigator.serviceWorker.ready.then(() => {
        sessionStorage.setItem('proa:coi-reload', '1');
        if (navigator.serviceWorker.controller) location.reload();
        else navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      });
    }
  }).catch(() => {});
}
