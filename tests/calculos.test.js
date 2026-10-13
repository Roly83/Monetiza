import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calcularIva,
  calcularFactura,
  calcularCuotaAutonomo,
  calcularIrpf,
  calcularNetoAutonomo,
  calcularPrecioHora,
} from '../src/assets/calculos.js';

const datos = JSON.parse(readFileSync(new URL('../content/datos-fiscales.json', import.meta.url)));

test('IVA sobre base y desglose de total', () => {
  assert.deepEqual(calcularIva({ importe: 100, tipo: 21 }), { base: 100, cuota: 21, total: 121 });
  assert.deepEqual(calcularIva({ importe: 121, tipo: 21, incluido: true }), { base: 100, cuota: 21, total: 121 });
});

test('factura con retención del 15 %', () => {
  assert.deepEqual(calcularFactura({ base: 1000, tipoIva: 21, retencion: 15 }), {
    base: 1000, iva: 210, retencion: 150, total: 1060,
  });
});

test('cuota de autónomos por tramos', () => {
  assert.equal(calcularCuotaAutonomo({ rendimientoMensual: 500 }, datos).cuota, 200);
  // 1500 * 0.93 = 1395 -> tramo 1300-1500
  assert.equal(calcularCuotaAutonomo({ rendimientoMensual: 1500 }, datos).cuota, 294);
  assert.equal(calcularCuotaAutonomo({ rendimientoMensual: 10000 }, datos).cuota, 590);
  assert.equal(calcularCuotaAutonomo({ rendimientoMensual: 3000, tarifaPlana: true }, datos).cuota, 80);
});

test('IRPF progresivo con mínimo personal', () => {
  assert.equal(calcularIrpf(5000, datos), 0);
  // 12450*0.19 + 7550*0.24 = 2365.5 + 1812 = 4177.5 ; mínimo 5550*0.19 = 1054.5
  assert.equal(calcularIrpf(20000, datos), 3123);
});

test('neto de autónomo coherente', () => {
  const r = calcularNetoAutonomo({ facturacionAnual: 30000, gastosAnuales: 3000 }, datos);
  assert.ok(r.netoAnual > 15000 && r.netoAnual < 27000, `neto ${r.netoAnual}`);
  assert.ok(r.tipoEfectivo > 0 && r.tipoEfectivo < 50);
});

test('precio por hora alcanza el neto objetivo', () => {
  const r = calcularPrecioHora({ netoMensualDeseado: 2000, gastosMensuales: 200, horasFacturablesSemana: 25 }, datos);
  const comprobacion = calcularNetoAutonomo({ facturacionAnual: r.facturacionAnual, gastosAnuales: 2400 }, datos);
  assert.ok(Math.abs(comprobacion.netoAnual - 24000) < 50);
  assert.ok(r.precioHora > 20 && r.precioHora < 60, `precio ${r.precioHora}`);
});
