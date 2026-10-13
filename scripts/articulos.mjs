// Lectura de artículos Markdown con cabecera tipo "frontmatter" sencilla (clave: valor).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function parsearArticulo(texto, archivo = '') {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`Falta la cabecera --- en ${archivo}`);
  const meta = {};
  for (const linea of m[1].split('\n')) {
    const i = linea.indexOf(':');
    if (i === -1) continue;
    const clave = linea.slice(0, i).trim();
    let valor = linea.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    if (clave === 'afiliados') valor = valor.split(',').map((s) => s.trim()).filter(Boolean);
    meta[clave] = valor;
  }
  for (const campo of ['titulo', 'descripcion', 'fecha', 'slug']) {
    if (!meta[campo]) throw new Error(`Falta "${campo}" en ${archivo}`);
  }
  return { afiliados: [], ...meta, cuerpo: m[2].trim() };
}

export function leerArticulos(directorio) {
  return readdirSync(directorio)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parsearArticulo(readFileSync(join(directorio, f), 'utf8'), f))
    .filter((a) => a.borrador !== 'true')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
