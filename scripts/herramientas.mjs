// Definición de las calculadoras: formulario + texto SEO. `calc` enlaza con src/assets/app.js.

export const herramientas = [
  {
    slug: 'calculadora-iva',
    titulo: 'Calculadora de IVA 2026: añadir o quitar IVA',
    corto: 'Calculadora de IVA',
    descripcion: 'Calcula el IVA al 21 %, 10 % o 4 %: añade IVA a una base o desglosa un precio con IVA incluido. Gratis y al instante.',
    calc: 'iva',
    afiliados: ['facturacion', 'gestoria'],
    formulario: `
      <label>Importe (€)<input type="number" name="importe" value="100" min="0" step="0.01" required></label>
      <label>Tipo de IVA
        <select name="tipo"><option value="21">21 % (general)</option><option value="10">10 % (reducido)</option><option value="4">4 % (superreducido)</option></select>
      </label>
      <label class="check"><input type="checkbox" name="incluido"> El importe ya incluye IVA</label>`,
    texto: `
      <h2>Cómo se calcula el IVA</h2>
      <p>Para <strong>añadir IVA</strong> multiplica la base imponible por el tipo: 100 € × 21 % = 21 € de IVA, total 121 €.
      Para <strong>quitar IVA</strong> de un precio final divide entre 1 + tipo: 121 € ÷ 1,21 = 100 € de base.</p>
      <h2>Tipos de IVA en España</h2>
      <ul><li><strong>21 %</strong>: tipo general (la mayoría de servicios profesionales).</li>
      <li><strong>10 %</strong>: hostelería, transporte de viajeros, algunas obras de vivienda.</li>
      <li><strong>4 %</strong>: pan, leche, frutas, libros, medicamentos.</li></ul>
      <p>Si eres autónomo, el IVA que cobras no es tuyo: lo ingresas a Hacienda cada trimestre con el modelo 303, restando el IVA soportado en tus gastos.</p>`,
  },
  {
    slug: 'calculadora-factura-autonomo',
    titulo: 'Calculadora de facturas para autónomos (IVA y retención IRPF)',
    corto: 'Calculadora de factura',
    descripcion: 'Calcula el total de una factura de autónomo con IVA y retención de IRPF del 15 % o 7 %. Ideal para presupuestos y facturas.',
    calc: 'factura',
    afiliados: ['facturacion', 'banco'],
    formulario: `
      <label>Base imponible (€)<input type="number" name="base" value="1000" min="0" step="0.01" required></label>
      <label>IVA
        <select name="tipoIva"><option value="21">21 %</option><option value="10">10 %</option><option value="4">4 %</option><option value="0">Exento / 0 %</option></select>
      </label>
      <label>Retención IRPF
        <select name="retencion"><option value="15">15 % (general)</option><option value="7">7 % (nuevos autónomos)</option><option value="0">Sin retención (cliente particular)</option></select>
      </label>`,
    texto: `
      <h2>¿Cuándo aplicar retención en una factura?</h2>
      <p>Los profesionales (actividades del epígrafe de profesionales) aplican retención de IRPF cuando facturan a
      <strong>empresas u otros autónomos</strong>. A particulares no se aplica. El tipo general es del 15 %, y del 7 % el año de alta y los dos siguientes.</p>
      <h2>Fórmula</h2>
      <p>Total factura = base + IVA − retención. Ejemplo: 1.000 € + 210 € − 150 € = 1.060 €.</p>
      <p>Desde la implantación de Verifactu, las facturas deben emitirse con un software homologado: elige uno que lo cumpla.</p>`,
  },
  {
    slug: 'calculadora-cuota-autonomos',
    titulo: 'Calculadora de cuota de autónomos 2026 por ingresos reales',
    corto: 'Cuota de autónomos',
    descripcion: 'Descubre cuánto pagarás de cuota de autónomos en 2026 según tus rendimientos netos. Tabla de tramos y tarifa plana de 80 €.',
    calc: 'cuota',
    afiliados: ['gestoria', 'seguro'],
    formulario: `
      <label>Ingresos mensuales (€)<input type="number" name="ingresos" value="2500" min="0" step="1" required></label>
      <label>Gastos mensuales deducibles (€)<input type="number" name="gastos" value="300" min="0" step="1"></label>
      <label class="check"><input type="checkbox" name="tarifaPlana"> Tengo tarifa plana (primer año)</label>`,
    texto: `
      <h2>Cómo funciona la cuota por ingresos reales</h2>
      <p>Desde 2023 la cuota depende de tus <strong>rendimientos netos</strong> (ingresos − gastos), a los que se resta un 7 % de gastos genéricos.
      Ese resultado mensual te sitúa en uno de los 15 tramos. Al final del año la Seguridad Social regulariza con los datos de Hacienda: si pagaste de menos te reclamará la diferencia; si pagaste de más, te la devuelve.</p>
      <h2>Tarifa plana</h2>
      <p>Los nuevos autónomos pagan 80 €/mes durante 12 meses, ampliables otros 12 si sus rendimientos no superan el SMI.</p>
      <p><em>Tabla de tramos vigente según la última publicación oficial disponible; compruébala en la web de la Seguridad Social.</em></p>`,
  },
  {
    slug: 'calculadora-sueldo-neto-autonomo',
    titulo: 'Calculadora de sueldo neto de autónomo: cuánto ganas de verdad',
    corto: 'Sueldo neto autónomo',
    descripcion: 'Calcula tu sueldo neto como autónomo restando cuota de Seguridad Social e IRPF a tu facturación anual. Estimación gratuita 2026.',
    calc: 'neto',
    afiliados: ['gestoria', 'facturacion', 'banco'],
    formulario: `
      <label>Facturación anual sin IVA (€)<input type="number" name="facturacion" value="36000" min="0" step="100" required></label>
      <label>Gastos anuales deducibles (€)<input type="number" name="gastos" value="4000" min="0" step="100"></label>
      <label class="check"><input type="checkbox" name="tarifaPlana"> Tengo tarifa plana</label>`,
    texto: `
      <h2>Qué se resta a tu facturación</h2>
      <ol><li><strong>Gastos deducibles</strong> de la actividad (software, material, cuota de coworking, parte de suministros...).</li>
      <li><strong>Cuota de autónomos</strong>, según tus rendimientos.</li>
      <li><strong>IRPF</strong> según la escala progresiva, tras el 5 % de gastos de difícil justificación (máx. 2.000 €).</li></ol>
      <p>La estimación usa la escala estatal más la autonómica media; tu comunidad puede variar ligeramente el resultado. Las retenciones e ingresos a cuenta del modelo 130 son pagos adelantados de este mismo IRPF.</p>`,
  },
  {
    slug: 'calculadora-precio-hora-freelance',
    titulo: 'Calculadora de precio por hora para freelance',
    corto: 'Precio por hora',
    descripcion: '¿Cuánto cobrar por hora como freelance? Calcula tu tarifa mínima a partir del sueldo neto que quieres, tus gastos e impuestos.',
    calc: 'hora',
    afiliados: ['facturacion', 'seguro'],
    formulario: `
      <label>Sueldo neto mensual deseado (€)<input type="number" name="neto" value="2000" min="0" step="50" required></label>
      <label>Gastos fijos mensuales (€)<input type="number" name="gastos" value="200" min="0" step="10"></label>
      <label>Horas facturables por semana<input type="number" name="horas" value="25" min="1" max="80" step="1"></label>
      <label>Semanas de vacaciones al año<input type="number" name="vacaciones" value="5" min="0" max="20" step="1"></label>`,
    texto: `
      <h2>Por qué tu tarifa debe ser más alta de lo que crees</h2>
      <p>No todas las horas de trabajo se facturan: prospección, administración y formación ocupan entre un 30 % y un 50 % del tiempo.
      Además debes cubrir cuota de autónomos, IRPF, vacaciones y bajas. Esta calculadora encuentra la facturación anual que deja el neto que quieres y la divide entre tus horas facturables reales.</p>`,
  },
];
