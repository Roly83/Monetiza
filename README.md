# Monetiza

Web de **calculadoras y guías para autónomos en España** que se gestiona en piloto automático y genera ingresos con
afiliación, publicidad y un producto digital propio.

- 📈 Plan de negocio, proyecciones y costes: [`docs/PLAN-DE-NEGOCIO.md`](docs/PLAN-DE-NEGOCIO.md)
- 🌐 Web (cuando actives GitHub Pages): https://roly83.github.io/Monetiza

## Qué incluye

| Parte | Dónde |
|---|---|
| 5 calculadoras (IVA, factura, cuota de autónomos, sueldo neto, precio por hora) | `src/assets/calculos.js`, `scripts/herramientas.mjs` |
| Datos fiscales del año (un solo archivo para actualizar) | `content/datos-fiscales.json` |
| Artículos en Markdown | `content/articulos/` |
| Cola de 42 temas para el piloto automático | `content/temas.json` |
| Generador de artículos con Claude + búsqueda web | `scripts/generar-articulo.mjs` |
| Producto de pago: Pack Autónomo (Excel con fórmulas de 303/130) | `scripts/generar-producto.py` |
| Afiliados, AdSense, newsletter, tienda y datos legales | `site.config.json` |
| Automatizaciones | `.github/workflows/` |

## Puesta en marcha (≈ 1 hora, una sola vez)

1. **Fusiona esta rama en `main`.**
2. **Activa GitHub Pages:** *Settings → Pages → Source: GitHub Actions*.
3. **Clave de API para el piloto automático:** crea una clave en https://console.anthropic.com y añádela en
   *Settings → Secrets and variables → Actions → New repository secret* con el nombre `ANTHROPIC_API_KEY`.
   Pon un límite de gasto mensual (10 € sobra).
4. **Permite que Actions abra PRs:** *Settings → Actions → General → Workflow permissions →* marca
   "Read and write permissions" y "Allow GitHub Actions to create and approve pull requests".
5. **(Opcional) Publicación 100 % automática:** en *Settings → Secrets and variables → Actions → Variables*, crea
   `AUTOPUBLICAR` = `true`. Sin ella, cada artículo llega como PR y lo publicas fusionándola.
6. **Completa `site.config.json`:** tus datos legales (`titular`), y a medida que te aprueben, los enlaces de
   afiliado, el ID de AdSense, el formulario de newsletter y el enlace de compra del producto. Lo que esté vacío no se muestra.
7. **Producto:** ejecuta el flujo *Actions → Generar producto (Pack Autónomo)*, descarga el Excel y súbelo a
   [Lemon Squeezy](https://lemonsqueezy.com) o Gumroad (gestionan el IVA europeo por ti). Pega el enlace en `producto.urlCompra`.
8. **Google Search Console:** añade la web y envía `sitemap.xml`.
9. **Dominio propio (recomendado):** cómpralo, crea un archivo `CNAME` en la raíz con el dominio, cambia `url` y
   deja `basePath` vacío (`""`) en `site.config.json`.

## Comandos

```bash
npm install
npm test                 # tests de las calculadoras
npm run build            # genera la web en dist/
npm run articulo         # genera el siguiente artículo (requiere ANTHROPIC_API_KEY)
npm run producto         # genera productos/pack-autonomo-AAAA.xlsx (requiere Python + openpyxl)
```

## Automatizaciones

| Flujo | Cuándo | Qué hace |
|---|---|---|
| Publicar web | Cada push a `main` | Tests + build + despliegue en GitHub Pages |
| Piloto automático | Lunes y jueves | Investiga y escribe un artículo nuevo; lo publica o abre PR |
| Revisión fiscal anual | 2 de enero | Abre una tarea con la lista de cifras a actualizar |
| Generar producto | Manual | Crea el Excel del Pack Autónomo para subirlo a la tienda |

> Las calculadoras y artículos son orientativos. Revisa `content/datos-fiscales.json` cuando cambie la normativa.
