import datos from './datos-fiscales.js';
import {
  calcularIva,
  calcularFactura,
  calcularCuotaAutonomo,
  calcularNetoAutonomo,
  calcularPrecioHora,
} from './calculos.js';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fila = (etiqueta, valor, destacado = false) =>
  `<div class="fila${destacado ? ' destacado' : ''}"><span>${etiqueta}</span><strong>${valor}</strong></div>`;

const calculadoras = {
  iva(f) {
    const tipo = Number(f.tipo.value);
    const r = calcularIva({ importe: Number(f.importe.value), tipo, incluido: f.incluido.checked });
    return fila('Base imponible', eur.format(r.base)) + fila(`IVA (${tipo} %)`, eur.format(r.cuota)) +
      fila('Total con IVA', eur.format(r.total), true);
  },
  factura(f) {
    const r = calcularFactura({
      base: Number(f.base.value), tipoIva: Number(f.tipoIva.value), retencion: Number(f.retencion.value),
    });
    return fila('Base imponible', eur.format(r.base)) + fila('+ IVA', eur.format(r.iva)) +
      fila('− Retención IRPF', eur.format(r.retencion)) + fila('Total a cobrar', eur.format(r.total), true);
  },
  cuota(f) {
    const r = calcularCuotaAutonomo({
      rendimientoMensual: Number(f.ingresos.value) - Number(f.gastos.value || 0),
      tarifaPlana: f.tarifaPlana.checked,
    }, datos);
    return fila('Rendimiento computable', eur.format(r.rendimientoComputable)) +
      fila('Tramo', `${r.tramo} de ${datos.autonomos.tramos.length}`) +
      fila('Base de cotización', eur.format(r.base)) +
      fila('Cuota mensual', eur.format(r.cuota), true) + fila('Cuota anual', eur.format(r.cuota * 12));
  },
  neto(f) {
    const r = calcularNetoAutonomo({
      facturacionAnual: Number(f.facturacion.value),
      gastosAnuales: Number(f.gastos.value || 0),
      tarifaPlana: f.tarifaPlana.checked,
    }, datos);
    return fila('Cuota autónomos (año)', eur.format(r.cuotaAnual)) + fila('IRPF estimado (año)', eur.format(r.irpf)) +
      fila('Neto anual', eur.format(r.netoAnual)) + fila('Neto mensual', eur.format(r.netoMensual), true) +
      fila('Presión fiscal sobre facturación', `${r.tipoEfectivo.toLocaleString('es-ES')} %`);
  },
  hora(f) {
    const r = calcularPrecioHora({
      netoMensualDeseado: Number(f.neto.value),
      gastosMensuales: Number(f.gastos.value || 0),
      horasFacturablesSemana: Number(f.horas.value),
      semanasVacaciones: Number(f.vacaciones.value || 0),
    }, datos);
    if (!r) return '<p>Introduce un número de horas válido.</p>';
    return fila('Facturación anual necesaria', eur.format(r.facturacionAnual)) +
      fila('Horas facturables al año', r.horasAnuales.toLocaleString('es-ES')) +
      fila('Precio mínimo por hora (sin IVA)', eur.format(r.precioHora), true);
  },
};

for (const form of document.querySelectorAll('form[data-calc]')) {
  const salida = document.getElementById(form.dataset.salida);
  const calcular = () => {
    try {
      salida.innerHTML = calculadoras[form.dataset.calc](form.elements);
    } catch (e) {
      salida.textContent = 'Revisa los datos introducidos.';
    }
  };
  form.addEventListener('input', calcular);
  form.addEventListener('submit', (e) => { e.preventDefault(); calcular(); });
  calcular();
}
