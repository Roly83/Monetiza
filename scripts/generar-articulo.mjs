// Piloto automático de contenido: toma el siguiente tema de content/temas.json, lo investiga con
// búsqueda web y escribe un artículo en content/articulos/. Requiere ANTHROPIC_API_KEY.
//
// Uso: node scripts/generar-articulo.mjs [--slug=<slug>] [--dry-run]
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerArticulos, parsearArticulo } from './articulos.mjs';
import { herramientas } from './herramientas.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirArticulos = join(raiz, 'content/articulos');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));

const { temas } = JSON.parse(readFileSync(join(raiz, 'content/temas.json'), 'utf8'));
const datosFiscales = readFileSync(join(raiz, 'content/datos-fiscales.json'), 'utf8');
const existentes = leerArticulos(dirArticulos);

const tema = args.slug
  ? temas.find((t) => t.slug === args.slug)
  : temas.find((t) => !existsSync(join(dirArticulos, `${t.slug}.md`)));

if (!tema) {
  console.log('No quedan temas pendientes en content/temas.json. Añade más para seguir publicando.');
  process.exit(0);
}

const hoy = new Date().toISOString().slice(0, 10);
const enlacesInternos = [
  ...existentes.map((a) => `- ${a.titulo} → ../${a.slug}/`),
  ...herramientas.map((h) => `- ${h.corto} → ../../herramientas/${h.slug}/`),
].join('\n');

const sistema = `Eres el redactor jefe de Monetiza, una web española de calculadoras y guías para autónomos y freelancers.
Escribes en español de España, con tono cercano, claro y riguroso. Tu prioridad es la exactitud: los lectores toman decisiones fiscales con lo que lees.

Reglas:
- Antes de escribir, verifica con la búsqueda web las cifras, plazos y normativa vigentes a fecha ${hoy} (prioriza fuentes oficiales: agenciatributaria.gob.es, seg-social.es, boe.es).
- Si un dato no está confirmado o depende del caso, dilo explícitamente en lugar de inventarlo.
- No menciones marcas comerciales concretas ni prometas resultados.
- Estructura: introducción breve que responda directamente a la pregunta, secciones con "## ", ejemplos numéricos, una tabla si ayuda, y una sección final de preguntas frecuentes con 3-4 preguntas en "### ".
- Entre 1.200 y 1.800 palabras. No incluyas el título H1 (se añade automáticamente).
- Incluye 2-4 enlaces internos relevantes en formato Markdown usando EXACTAMENTE estas rutas relativas:
${enlacesInternos}

Datos fiscales que usan nuestras calculadoras (mantén la coherencia; si la web oficial indica valores distintos, usa los oficiales y menciónalo):
${datosFiscales}

Formato de respuesta, sin nada más:
<descripcion>meta descripción SEO de 140-155 caracteres</descripcion>
<articulo>
cuerpo en Markdown
</articulo>`;

async function generar() {
  const client = new Anthropic();
  const mensajes = [{ role: 'user', content: `Escribe el artículo: "${tema.titulo}".` }];
  let respuesta;
  // La búsqueda web es una herramienta de servidor: si el turno se pausa ("pause_turn"), se reanuda.
  for (let intento = 0; intento < 5; intento++) {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system: sistema,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages: mensajes,
    });
    respuesta = await stream.finalMessage();
    if (respuesta.stop_reason !== 'pause_turn') break;
    mensajes.push({ role: 'assistant', content: respuesta.content });
  }
  if (respuesta.stop_reason === 'refusal') throw new Error('El modelo rechazó generar este tema.');
  if (respuesta.stop_reason === 'max_tokens') throw new Error('Respuesta truncada (max_tokens).');
  const texto = respuesta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  console.log(`Tokens: entrada ${respuesta.usage.input_tokens}, salida ${respuesta.usage.output_tokens}`);
  return texto;
}

const texto = await generar();
const descripcion = texto.match(/<descripcion>([\s\S]*?)<\/descripcion>/)?.[1].trim().replace(/\s+/g, ' ');
const cuerpo = texto.match(/<articulo>([\s\S]*?)<\/articulo>/)?.[1].trim();

if (!descripcion || !cuerpo) throw new Error(`Formato de respuesta inesperado:\n${texto.slice(0, 500)}`);
const palabras = cuerpo.split(/\s+/).length;
if (palabras < 700 || (cuerpo.match(/^## /gm) ?? []).length < 3) {
  throw new Error(`Artículo demasiado corto o sin estructura (${palabras} palabras). No se publica.`);
}

const md = `---
titulo: ${tema.titulo}
descripcion: ${descripcion.replace(/\n/g, ' ')}
fecha: ${hoy}
slug: ${tema.slug}
${tema.herramienta ? `herramienta: ${tema.herramienta}\n` : ''}afiliados: ${tema.afiliados ?? ''}
---
${cuerpo}
`;
parsearArticulo(md, tema.slug); // valida la cabecera

if (args['dry-run']) {
  console.log(md);
} else {
  writeFileSync(join(dirArticulos, `${tema.slug}.md`), md);
  console.log(`Publicado content/articulos/${tema.slug}.md (${palabras} palabras)`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `slug=${tema.slug}\ntitulo=${tema.titulo}\n`);
  }
}
