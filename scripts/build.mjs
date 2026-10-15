// Genera la web estática en dist/ a partir de la configuración, las calculadoras y los artículos Markdown.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { herramientas } from './herramientas.mjs';
import { leerArticulos } from './articulos.mjs';
import { paginasLegales } from './legal.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const config = JSON.parse(readFileSync(join(raiz, 'site.config.json'), 'utf8'));
const datosFiscales = JSON.parse(readFileSync(join(raiz, 'content/datos-fiscales.json'), 'utf8'));

const base = config.basePath.replace(/\/$/, '');
const ruta = (p) => `${base}${p}`;
const absoluta = (p) => `${config.url.replace(/\/$/, '')}${p}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bloqueAnuncio() {
  if (!config.adsense.clienteId) return '';
  return `<div class="anuncio"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(config.adsense.clienteId)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function bloqueAfiliados(claves = []) {
  const items = claves.map((k) => config.afiliados[k]).filter((a) => a && a.url);
  if (!items.length) return '';
  return `<section class="recomendaciones"><h2>Herramientas recomendadas</h2>${items
    .map((a) => `<div class="recomendacion"><h3>${esc(a.titulo)}</h3><p>${esc(a.texto)}</p><a class="boton" href="${esc(a.url)}" rel="sponsored nofollow noopener" target="_blank">${esc(a.cta)}</a></div>`)
    .join('')}<p class="aviso-afiliado">Algunos enlaces son de afiliado: si contratas a través de ellos recibimos una comisión sin coste extra para ti.</p></section>`;
}

function bloqueProducto() {
  const p = config.producto;
  if (!p.urlCompra) return '';
  return `<aside class="producto"><h2>${esc(p.nombre)} — ${esc(p.precio)}</h2><p>${esc(p.descripcion)}</p><a class="boton" href="${esc(p.urlCompra)}" rel="noopener" target="_blank">Descargar el pack</a></aside>`;
}

function bloqueNewsletter() {
  if (!config.newsletter.urlFormulario) return '';
  return `<aside class="tarjeta"><strong>Recibe el calendario fiscal y avisos de cambios</strong><p>Un correo al mes, sin spam.</p><p><a class="boton" href="${esc(config.newsletter.urlFormulario)}" rel="noopener" target="_blank">Suscribirme gratis</a></p></aside>`;
}

function layout({ titulo, descripcion, camino, cuerpo, jsonLd, scripts = '' }) {
  const canonical = absoluta(camino);
  const tituloCompleto = camino === '/' ? `${config.nombre} — ${config.eslogan}` : `${titulo} | ${config.nombre}`;
  const adsense = config.adsense.clienteId
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsense.clienteId)}" crossorigin="anonymous"></script>`
    : '';
  const analitica = config.analitica.plausibleDominio
    ? `<script defer data-domain="${esc(config.analitica.plausibleDominio)}" src="https://plausible.io/js/script.js"></script>`
    : '';
  return `<!doctype html>
<html lang="${config.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<link rel="stylesheet" href="${ruta('/assets/estilo.css')}">
<link rel="alternate" type="application/rss+xml" title="${esc(config.nombre)}" href="${ruta('/feed.xml')}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>€</text></svg>">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
${adsense}${analitica}
</head>
<body>
<header class="sitio"><div class="contenedor">
<a class="logo" href="${ruta('/')}">Moneti<span>za</span></a>
<nav><a href="${ruta('/#herramientas')}">Calculadoras</a><a href="${ruta('/blog/')}">Guías</a></nav>
</div></header>
<main class="contenedor">
${cuerpo}
</main>
<footer><div class="contenedor">
<p>© ${new Date().getFullYear()} ${esc(config.nombre)}. La información es orientativa y no sustituye el asesoramiento profesional.</p>
<p>${paginasLegales.map((p) => `<a href="${ruta(`/${p.slug}/`)}">${esc(p.titulo)}</a>`).join('')}</p>
</div></footer>
${scripts}
</body>
</html>`;
}

function escribir(camino, html) {
  const destino = join(dist, camino, camino.endsWith('.html') || camino.includes('.') ? '' : 'index.html');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html);
}

// --- Construcción ---
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(raiz, 'src/assets'), join(dist, 'assets'), { recursive: true });
writeFileSync(join(dist, 'assets/datos-fiscales.js'), `export default ${JSON.stringify(datosFiscales)};\n`);

const articulos = leerArticulos(join(raiz, 'content/articulos'));
const urls = ['/', '/blog/'];

// Portada
escribir('/', layout({
  titulo: config.nombre,
  descripcion: `${config.eslogan}. Calculadoras gratuitas de IVA, cuota de autónomos, sueldo neto e IRPF ${config.anioFiscal}.`,
  camino: '/',
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: config.nombre, url: absoluta('/') },
  cuerpo: `
<h1>Calculadoras y guías para autónomos ${config.anioFiscal}</h1>
<p class="lead">${esc(config.eslogan)}. Gratis, sin registro y actualizadas con la normativa fiscal vigente.</p>
<h2 id="herramientas">Calculadoras</h2>
<ul class="tarjetas">${herramientas.map((h) => `<li class="tarjeta"><a href="${ruta(`/herramientas/${h.slug}/`)}">${esc(h.corto)}</a><p>${esc(h.descripcion)}</p></li>`).join('')}</ul>
${bloqueProducto()}
<h2>Últimas guías</h2>
<ul class="tarjetas">${articulos.slice(0, 6).map((a) => `<li class="tarjeta"><a href="${ruta(`/blog/${a.slug}/`)}">${esc(a.titulo)}</a><p>${esc(a.descripcion)}</p></li>`).join('')}</ul>
${bloqueNewsletter()}`,
}));

// Calculadoras
for (const h of herramientas) {
  const camino = `/herramientas/${h.slug}/`;
  urls.push(camino);
  const relacionados = articulos.filter((a) => a.herramienta === h.slug).slice(0, 4);
  escribir(camino, layout({
    titulo: h.titulo,
    descripcion: h.descripcion,
    camino,
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebApplication', name: h.titulo, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: absoluta(camino) },
    scripts: `<script type="module" src="${ruta('/assets/app.js')}"></script>`,
    cuerpo: `
<h1>${esc(h.titulo)}</h1>
<p class="lead">${esc(h.descripcion)}</p>
<div class="calculadora">
<form data-calc="${h.calc}" data-salida="res-${h.calc}">${h.formulario}</form>
<div class="resultado" id="res-${h.calc}" aria-live="polite"></div>
</div>
${bloqueAfiliados(h.afiliados)}
${bloqueAnuncio()}
<article>${h.texto}</article>
${relacionados.length ? `<h2>Guías relacionadas</h2><ul>${relacionados.map((a) => `<li><a href="${ruta(`/blog/${a.slug}/`)}">${esc(a.titulo)}</a></li>`).join('')}</ul>` : ''}
${bloqueProducto()}
<p class="descargo">Datos fiscales ${datosFiscales.anio}. ${esc(datosFiscales.verificado)} Resultado orientativo: consulta a un asesor para tu caso concreto.</p>`,
  }));
}

// Blog
escribir('/blog/', layout({
  titulo: 'Guías para autónomos',
  descripcion: 'Guías prácticas sobre impuestos, facturación, cuota de autónomos y gestión para freelancers en España.',
  camino: '/blog/',
  cuerpo: `<h1>Guías para autónomos</h1><ul class="tarjetas">${articulos.map((a) => `<li class="tarjeta"><a href="${ruta(`/blog/${a.slug}/`)}">${esc(a.titulo)}</a><p>${esc(a.descripcion)}</p><p class="meta">${a.fecha}</p></li>`).join('')}</ul>`,
}));

for (const a of articulos) {
  const camino = `/blog/${a.slug}/`;
  urls.push(camino);
  const herramienta = herramientas.find((h) => h.slug === a.herramienta);
  const html = marked.parse(a.cuerpo);
  // Inserta un anuncio tras el segundo H2 para no romper la lectura inicial.
  let n = 0;
  const conAnuncio = html.replace(/<h2/g, (m) => (++n === 2 ? `${bloqueAnuncio()}${m}` : m));
  escribir(camino, layout({
    titulo: a.titulo,
    descripcion: a.descripcion,
    camino,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: a.titulo, description: a.descripcion, datePublished: a.fecha, author: { '@type': 'Organization', name: config.autor }, mainEntityOfPage: absoluta(camino) },
    cuerpo: `
<article>
<h1>${esc(a.titulo)}</h1>
<p class="meta">Actualizado: ${a.fecha}</p>
${herramienta ? `<p class="tarjeta">👉 Calcula tu caso: <a href="${ruta(`/herramientas/${herramienta.slug}/`)}">${esc(herramienta.corto)}</a></p>` : ''}
${conAnuncio}
</article>
${bloqueAfiliados(a.afiliados)}
${bloqueProducto()}
${bloqueNewsletter()}
<p class="descargo">Contenido informativo revisado con la normativa disponible a fecha de publicación. No constituye asesoramiento fiscal personalizado.</p>`,
  }));
}

// Páginas legales (obligatorias en España: LSSI-CE y RGPD)
for (const p of paginasLegales) {
  escribir(`/${p.slug}/`, layout({ titulo: p.titulo, descripcion: p.titulo, camino: `/${p.slug}/`, cuerpo: `<article><h1>${esc(p.titulo)}</h1>${marked.parse(p.cuerpo(config))}</article>` }));
}

escribir('/404.html', layout({ titulo: 'Página no encontrada', descripcion: 'Página no encontrada', camino: '/404.html', cuerpo: `<h1>Página no encontrada</h1><p><a href="${ruta('/')}">Volver a las calculadoras</a></p>` }));

// SEO: sitemap, robots, RSS, ads.txt
const hoy = new Date().toISOString().slice(0, 10);
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${absoluta(u)}</loc><lastmod>${articulos.find((a) => `/blog/${a.slug}/` === u)?.fecha ?? hoy}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${absoluta('/sitemap.xml')}\n`);
writeFileSync(join(dist, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${esc(config.nombre)}</title><link>${absoluta('/')}</link><description>${esc(config.eslogan)}</description>
${articulos.slice(0, 20).map((a) => `<item><title>${esc(a.titulo)}</title><link>${absoluta(`/blog/${a.slug}/`)}</link><guid>${absoluta(`/blog/${a.slug}/`)}</guid><pubDate>${new Date(a.fecha).toUTCString()}</pubDate><description>${esc(a.descripcion)}</description></item>`).join('\n')}
</channel></rss>
`);
if (config.adsense.clienteId) {
  writeFileSync(join(dist, 'ads.txt'), `google.com, ${config.adsense.clienteId.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
}
// App de inglés marítimo (estática): se publica en /proa/.
cpSync(join(raiz, 'proa'), join(dist, 'proa'), { recursive: true, filter: (src) => !src.includes(`${'/'}tests`) });
if (existsSync(join(raiz, 'CNAME'))) cpSync(join(raiz, 'CNAME'), join(dist, 'CNAME'));
writeFileSync(join(dist, '.nojekyll'), '');

console.log(`Web generada: ${herramientas.length} calculadoras, ${articulos.length} artículos, ${urls.length} URLs en el sitemap.`);
