// Mini-ayudante para crear elementos del DOM sin frameworks.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(msg, kind = 'info') {
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 4500);
}

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Ejecuta una acción asíncrona mostrando estado de carga en un botón.
export async function busy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ ' + label;
  try {
    return await fn();
  } catch (e) {
    toast(e.message || String(e), 'error');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// Añade hijos a un contenedor ignorando los vacíos (null/false/undefined).
export function mount(parent, ...children) {
  parent.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
}
