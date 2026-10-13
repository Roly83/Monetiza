# Plan de negocio — Monetiza

## 1. Resumen

**Monetiza** es una web de **calculadoras gratuitas y guías prácticas para autónomos y freelancers en España**.
Atrae tráfico desde Google con búsquedas de alta intención ("calculadora cuota autónomos", "cuánto paga un autónomo",
"cómo hacer una factura") y lo monetiza de tres formas:

| Fuente | Cómo funciona | Por qué encaja |
|---|---|---|
| **Afiliación** | Comisión por cada alta en gestorías online, software de facturación, bancos y seguros para autónomos | Es el nicho mejor pagado del sector: el lector *ya* necesita esos servicios |
| **Publicidad (AdSense)** | Pago por cada mil visitas | Finanzas es de los temas con mejor RPM en español |
| **Producto digital propio** | *Pack Autónomo* (plantilla Excel de IVA/IRPF trimestral) a 19 € | 100 % de margen, se vende solo, la tienda gestiona IVA y cobros |

Todo funciona sin servidores ni costes fijos: la web es estática en **GitHub Pages** (gratis) y un flujo de
**GitHub Actions** escribe y publica dos artículos nuevos a la semana con la API de Claude, verificando datos con búsqueda web.

## 2. Por qué este negocio y no otro

Analicé las opciones de negocio que pueden funcionar de forma automática y que un agente de IA puede gestionar:

| Opción | Automatizable | Coste inicial | Riesgo | Veredicto |
|---|---|---|---|---|
| Web de contenidos + herramientas (SEO) | Alta | ~0 € | Bajo | ✅ **Elegida** |
| Tienda dropshipping | Media (atención al cliente, devoluciones) | 300–1.000 € en anuncios | Alto | ❌ |
| SaaS de suscripción | Baja al principio (soporte, bugs, pagos) | Bajo | Medio | Más adelante |
| Trading/criptos automatizado | Alta | Capital propio | Muy alto, puedes perder dinero | ❌ |
| Canal de YouTube/TikTok con IA | Media | Bajo | Plataformas penalizan contenido masivo de IA | ❌ |

Ventajas del nicho "autónomos en España":
- **Más de 3,3 millones de autónomos** y unas 30.000 altas nuevas al mes, con dudas recurrentes cada trimestre.
- **Demanda que se repite**: cada trimestre (modelos 303/130), cada enero (cambios de cuota) y cada campaña de la renta.
- **Las calculadoras atraen enlaces y visitas recurrentes**, algo que la IA generativa de los buscadores no sustituye igual de bien que un texto.
- **Afiliados con comisiones altas** (orientativo: 20–80 € por cliente en gestorías y software de facturación, 10–50 € en bancos).
- **En español hay menos competencia** que en inglés para el mismo tipo de web.

## 3. Proyección de ingresos (realista, no garantizada)

Una web nueva tarda en posicionarse en Google. Escenario base con 2 artículos/semana:

| Mes | Visitas/mes | Publicidad | Afiliación | Producto | **Total** |
|---|---|---|---|---|---|
| 1–3 | 0 – 1.000 | 0 € | 0 – 30 € | 0 – 20 € | **0 – 50 €** |
| 4–6 | 2.000 – 6.000 | 10 – 50 € | 30 – 150 € | 20 – 80 € | **60 – 280 €** |
| 7–12 | 8.000 – 25.000 | 60 – 250 € | 150 – 500 € | 80 – 300 € | **290 – 1.050 €** |
| 13–18 | 25.000 – 50.000 | 250 – 500 € | 500 – 1.000 € | 300 – 600 € | **1.050 – 2.100 €** |

Supuestos: 1,5 páginas vistas por visita, RPM de 6–10 €, 1 % de clics en afiliados con 5 % de conversión y 35 € de
comisión media, 0,1 % de compra del producto a 16 € netos.

**Objetivo de 1.000 €/mes:** ~30.000 visitas/mes, alcanzable en torno al **mes 10–15** si el contenido se mantiene
constante y se consiguen algunos enlaces. Si a los 6 meses el tráfico no supera las 3.000 visitas/mes, toca revisar la estrategia (ver §6).

## 4. Costes

| Concepto | Coste |
|---|---|
| Hosting (GitHub Pages) | 0 € |
| API de Claude (8–9 artículos/mes con búsqueda web) | ~3–8 €/mes |
| Dominio propio (recomendado desde el mes 1) | ~10–15 €/año |
| Tienda (Lemon Squeezy / Gumroad) | Solo comisión por venta (~5–10 %) |
| Email (Brevo/MailerLite, plan gratuito) | 0 € |
| **Total** | **< 10 €/mes** |

## 5. Qué hace el piloto automático y qué necesitas hacer tú

**Automático (GitHub Actions):**
- Lunes y jueves: elige el siguiente tema de `content/temas.json`, investiga con búsqueda web, redacta el artículo con enlaces internos y lo publica (o abre una PR para que lo apruebes).
- Cada publicación: compila la web, pasa los tests de las calculadoras y despliega en GitHub Pages.
- Cada 2 de enero: abre una tarea para actualizar las cifras fiscales del nuevo año.

**Lo que requiere tu identidad (no puedo hacerlo yo por ley o por las condiciones de cada plataforma):**
- Darte de alta en los programas de afiliados, AdSense y la tienda (piden tu nombre, NIF y cuenta bancaria).
- Cobrar los ingresos y **declararlos a Hacienda**. Si los ingresos se vuelven habituales, consulta con una gestoría si debes darte de alta como autónomo.
- Revisar de vez en cuando las PR de artículos (recomendado al menos los primeros meses: es contenido fiscal).

## 6. Hoja de ruta

1. **Semana 1** — Activar GitHub Pages, comprar dominio, poner tus datos legales, añadir la clave de API. Dar de alta la web en Google Search Console y enviar el sitemap.
2. **Semana 1–2** — Solicitar afiliación (gestorías online, software de facturación, neobancos, seguros; muchos están en redes como Awin, Tradedoubler o tienen programa propio). Subir el Pack Autónomo a Lemon Squeezy.
3. **Mes 2–3** — Con 20–30 artículos, solicitar AdSense. Crear la newsletter.
4. **Mes 3–6** — Revisar Search Console: ampliar los artículos que ya reciben impresiones y añadir temas relacionados a la cola.
5. **Mes 6+** — Nuevas calculadoras (sueldo neto asalariado, autónomo vs. SL, finiquito), más productos (pack de plantillas de presupuestos, curso "Tu primer año de autónomo") y, si hay tráfico, una versión de pago con recordatorios fiscales por email.

## 7. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Errores en cifras fiscales | Datos centralizados en `content/datos-fiscales.json`, tests automáticos, búsqueda web en cada artículo, avisos legales y revisión anual |
| Google penaliza contenido de IA de baja calidad | Pocos artículos y muy trabajados (2/semana), herramientas útiles, verificación de fuentes oficiales, revisión humana opcional |
| Cambios en algoritmos de Google | Diversificar con newsletter y producto propio |
| Un programa de afiliados cierra | Varios afiliados por categoría, configurables en un solo archivo |
