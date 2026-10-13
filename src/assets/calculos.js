// Funciones de cálculo puras. Las usan tanto las páginas (navegador) como los tests (Node).
// Todos los importes en euros. Los resultados son estimaciones orientativas.

export const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** IVA: a partir de la base imponible o del total (IVA incluido). */
export function calcularIva({ importe, tipo, incluido = false }) {
  const base = incluido ? importe / (1 + tipo / 100) : importe;
  const cuota = base * (tipo / 100);
  return { base: redondear(base), cuota: redondear(cuota), total: redondear(base + cuota) };
}

/** Factura de autónomo: base + IVA − retención de IRPF. */
export function calcularFactura({ base, tipoIva, retencion }) {
  const iva = base * (tipoIva / 100);
  const irpf = base * (retencion / 100);
  return {
    base: redondear(base),
    iva: redondear(iva),
    retencion: redondear(irpf),
    total: redondear(base + iva - irpf),
  };
}

/**
 * Cuota mensual de autónomos (sistema por ingresos reales).
 * rendimientoMensual: (ingresos − gastos) / 12, antes de restar la propia cuota.
 */
export function calcularCuotaAutonomo({ rendimientoMensual, tarifaPlana = false }, datos) {
  const { deduccionGenericaPct, tramos } = datos.autonomos;
  const computable = Math.max(0, rendimientoMensual) * (1 - deduccionGenericaPct / 100);
  const indice = tramos.findIndex((t) => t.hasta === null || computable <= t.hasta);
  const tramo = tramos[indice];
  return {
    rendimientoComputable: redondear(computable),
    tramo: indice + 1,
    base: tramo.base,
    cuota: tarifaPlana ? datos.autonomos.tarifaPlana : tramo.cuota,
  };
}

/** Cuota íntegra de IRPF aplicando la escala progresiva y el mínimo personal. */
export function calcularIrpf(baseLiquidable, datos) {
  const { escala, minimoPersonal } = datos.irpf;
  const tramoImpuesto = (importe) => {
    let restante = Math.max(0, importe);
    let desde = 0;
    let cuota = 0;
    for (const { hasta, tipo } of escala) {
      const tope = hasta ?? Infinity;
      const enTramo = Math.min(restante, tope - desde);
      if (enTramo <= 0) break;
      cuota += enTramo * (tipo / 100);
      restante -= enTramo;
      desde = tope;
    }
    return cuota;
  };
  return redondear(Math.max(0, tramoImpuesto(baseLiquidable) - tramoImpuesto(minimoPersonal)));
}

/** Neto anual de un autónomo en estimación directa simplificada. */
export function calcularNetoAutonomo({ facturacionAnual, gastosAnuales, tarifaPlana = false }, datos) {
  const rendimientoPrevio = facturacionAnual - gastosAnuales;
  const { cuota } = calcularCuotaAutonomo(
    { rendimientoMensual: rendimientoPrevio / 12, tarifaPlana },
    datos,
  );
  const cuotaAnual = cuota * 12;
  const rendimientoNeto = rendimientoPrevio - cuotaAnual;
  const { gastosDificilJustificacionPct: pct, gastosDificilJustificacionMax: max } = datos.irpf;
  const dificilJustificacion = Math.min(Math.max(0, rendimientoNeto) * (pct / 100), max);
  const baseLiquidable = Math.max(0, rendimientoNeto - dificilJustificacion);
  const irpf = calcularIrpf(baseLiquidable, datos);
  const neto = rendimientoNeto - irpf;
  return {
    cuotaAnual: redondear(cuotaAnual),
    baseLiquidable: redondear(baseLiquidable),
    irpf: redondear(irpf),
    netoAnual: redondear(neto),
    netoMensual: redondear(neto / 12),
    tipoEfectivo: facturacionAnual > 0 ? redondear(((cuotaAnual + irpf) / facturacionAnual) * 100) : 0,
  };
}

/** Precio por hora mínimo para alcanzar un neto mensual deseado. */
export function calcularPrecioHora(
  { netoMensualDeseado, gastosMensuales, horasFacturablesSemana, semanasVacaciones = 5 },
  datos,
) {
  const semanas = 52 - semanasVacaciones;
  const horasAnuales = horasFacturablesSemana * semanas;
  if (horasAnuales <= 0) return null;
  const gastosAnuales = gastosMensuales * 12;
  const objetivo = netoMensualDeseado * 12;
  // Búsqueda binaria de la facturación que deja el neto objetivo tras cuota e IRPF.
  let bajo = 0;
  let alto = 2_000_000;
  for (let i = 0; i < 60; i++) {
    const medio = (bajo + alto) / 2;
    const { netoAnual } = calcularNetoAutonomo({ facturacionAnual: medio, gastosAnuales }, datos);
    if (netoAnual < objetivo) bajo = medio;
    else alto = medio;
  }
  return {
    facturacionAnual: redondear(alto),
    horasAnuales,
    precioHora: redondear(alto / horasAnuales),
  };
}
