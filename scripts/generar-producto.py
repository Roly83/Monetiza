"""Genera el producto digital de pago: Pack Autónomo (plantilla Excel con fórmulas).

Uso: python3 scripts/generar-producto.py  ->  productos/pack-autonomo-<año>.xlsx
Sube el archivo resultante a Lemon Squeezy o Gumroad y pega el enlace en site.config.json.
"""
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = Path(__file__).resolve().parent.parent
DATOS = json.loads((RAIZ / "content/datos-fiscales.json").read_text(encoding="utf-8"))
ANIO = DATOS["anio"]
VERDE = PatternFill("solid", fgColor="0E7A5F")
CLARO = PatternFill("solid", fgColor="E8F5F0")
BLANCO = Font(color="FFFFFF", bold=True)
EUR = '#,##0.00 "€"'
FILAS = 200


def cabecera(ws, titulos, anchos):
    for i, (t, a) in enumerate(zip(titulos, anchos), start=1):
        c = ws.cell(row=1, column=i, value=t)
        c.fill, c.font = VERDE, BLANCO
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width = a
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"


wb = Workbook()

# --- Instrucciones ---
ws = wb.active
ws.title = "Instrucciones"
ws.column_dimensions["A"].width = 110
lineas = [
    (f"PACK AUTÓNOMO {ANIO} — Monetiza", Font(size=18, bold=True, color="0E7A5F")),
    ("Control de facturación, IVA e IRPF trimestral para autónomos en estimación directa.", Font(italic=True)),
    ("", None),
    ("1. Hoja 'Ingresos': anota cada factura emitida. IVA, retención y total se calculan solos.", None),
    ("2. Hoja 'Gastos': anota cada factura de gasto deducible. Indica % de IVA deducible (100 % normal, 50 % vehículo...).", None),
    ("3. Hoja 'Trimestres': verás el resultado orientativo de los modelos 303 (IVA) y 130 (IRPF) de cada trimestre.", None),
    ("4. Hoja 'Calendario': plazos de presentación habituales. Comprueba siempre el calendario oficial de la AEAT.", None),
    ("5. Hoja 'Checklist gastos': repasa antes de cada trimestre que no te dejas gastos deducibles.", None),
    ("", None),
    ("Las celdas verdes claras son las únicas que debes rellenar. No borres las fórmulas.", Font(bold=True)),
    ("Resultados orientativos: no sustituyen el asesoramiento de un profesional.", Font(color="888888")),
]
for i, (texto, fuente) in enumerate(lineas, start=1):
    c = ws.cell(row=i, column=1, value=texto)
    if fuente:
        c.font = fuente

# --- Ingresos ---
ws = wb.create_sheet("Ingresos")
cabecera(ws, ["Fecha", "Nº factura", "Cliente", "NIF cliente", "Concepto", "Base imponible", "% IVA", "Cuota IVA",
              "% Retención", "Retención IRPF", "Total factura", "Trimestre", "Cobrada (S/N)"],
         [12, 12, 26, 14, 30, 15, 8, 13, 11, 14, 15, 10, 11])
dv_iva = DataValidation(type="list", formula1='"21,10,4,0"', allow_blank=True)
dv_ret = DataValidation(type="list", formula1='"15,7,0"', allow_blank=True)
dv_sn = DataValidation(type="list", formula1='"S,N"', allow_blank=True)
for dv in (dv_iva, dv_ret, dv_sn):
    ws.add_data_validation(dv)
for r in range(2, FILAS + 2):
    for col in "ABCDEFGIM":
        ws[f"{col}{r}"].fill = CLARO
    ws[f"A{r}"].number_format = "DD/MM/YYYY"
    ws[f"H{r}"] = f'=IF(F{r}="","",ROUND(F{r}*G{r}/100,2))'
    ws[f"J{r}"] = f'=IF(F{r}="","",ROUND(F{r}*I{r}/100,2))'
    ws[f"K{r}"] = f'=IF(F{r}="","",F{r}+H{r}-J{r})'
    ws[f"L{r}"] = f'=IF(A{r}="","",ROUNDUP(MONTH(A{r})/3,0))'
    for col in "FHJK":
        ws[f"{col}{r}"].number_format = EUR
    dv_iva.add(f"G{r}")
    dv_ret.add(f"I{r}")
    dv_sn.add(f"M{r}")

# --- Gastos ---
ws = wb.create_sheet("Gastos")
cabecera(ws, ["Fecha", "Proveedor", "NIF proveedor", "Concepto", "Base imponible", "% IVA", "Cuota IVA",
              "% IVA deducible", "IVA deducible", "% Deducible IRPF", "Gasto deducible IRPF", "Trimestre"],
         [12, 26, 14, 30, 15, 8, 13, 13, 14, 14, 17, 10])
ws.add_data_validation(dv_iva := DataValidation(type="list", formula1='"21,10,4,0"', allow_blank=True))
for r in range(2, FILAS + 2):
    for col in "ABCDEFHJ":
        ws[f"{col}{r}"].fill = CLARO
    ws[f"A{r}"].number_format = "DD/MM/YYYY"
    ws[f"H{r}"] = 100
    ws[f"J{r}"] = 100
    ws[f"G{r}"] = f'=IF(E{r}="","",ROUND(E{r}*F{r}/100,2))'
    ws[f"I{r}"] = f'=IF(E{r}="","",ROUND(G{r}*H{r}/100,2))'
    # La parte de IVA no deducible se suma al gasto en IRPF.
    ws[f"K{r}"] = f'=IF(E{r}="","",ROUND((E{r}+G{r}-I{r})*J{r}/100,2))'
    ws[f"L{r}"] = f'=IF(A{r}="","",ROUNDUP(MONTH(A{r})/3,0))'
    for col in "EGIK":
        ws[f"{col}{r}"].number_format = EUR
    dv_iva.add(f"F{r}")

# --- Trimestres ---
ws = wb.create_sheet("Trimestres")
cabecera(ws, ["Concepto", "1T", "2T", "3T", "4T", "Año"], [52, 15, 15, 15, 15, 16])
ws["H1"], ws["H2"] = "Cuota autónomos mensual", 294
ws["H1"].font = Font(bold=True)
ws["H2"].fill, ws["H2"].number_format = CLARO, EUR
ws.column_dimensions["H"].width = 24
filas = [
    ("MODELO 303 — IVA", None),
    ("IVA repercutido (cobrado)", "=SUMIF(Ingresos!$L{r},{t},Ingresos!$H{r})"),
    ("IVA soportado deducible (pagado)", "=SUMIF(Gastos!$L{r},{t},Gastos!$I{r})"),
    ("Resultado 303 (a ingresar si es positivo)", "={c}3-{c}4"),
    ("", None),
    ("MODELO 130 — IRPF (acumulado desde enero)", None),
    ("Ingresos acumulados (bases)", "=SUMIF(Ingresos!$L{r},\"<=\"&{t},Ingresos!$F{r})"),
    ("Gastos acumulados deducibles", "=SUMIF(Gastos!$L{r},\"<=\"&{t},Gastos!$K{r})+$H$2*3*{t}"),
    ("Rendimiento neto acumulado", "={c}8-{c}9"),
    ("20 % del rendimiento", "=MAX(0,ROUND({c}10*0.2,2))"),
    ("Retenciones acumuladas soportadas", "=SUMIF(Ingresos!$L{r},\"<=\"&{t},Ingresos!$J{r})"),
    ("Pagos 130 de trimestres anteriores", "{previo}"),
    ("Resultado 130 (a ingresar si es positivo)", "=MAX(0,{c}11-{c}12-{c}13)"),
    ("", None),
    ("RESUMEN", None),
    ("Dinero a apartar este trimestre (303 + 130)", "=MAX(0,{c}5)+{c}14"),
]
for i, (texto, formula) in enumerate(filas, start=2):
    ws.cell(row=i, column=1, value=texto).font = Font(bold=formula is None)
    if formula is None:
        continue
    for t in range(1, 5):
        c = get_column_letter(t + 1)
        previo = "=0" if t == 1 else "=" + "+".join(f"{get_column_letter(k + 1)}14" for k in range(1, t))
        # {r} queda vacío: las columnas abreviadas se amplían a rangos explícitos más abajo.
        f = formula.format(r="", t=t, c=c, previo=previo)
        ws.cell(row=i, column=t + 1, value=f).number_format = EUR
    if i in (3, 4, 5, 14, 17):
        ws.cell(row=i, column=6, value=f"=SUM(B{i}:E{i})").number_format = EUR


def rango(hoja, col):
    return f"{hoja}!${col}$2:${col}${FILAS + 1}"


# Sustituye las referencias abreviadas por rangos explícitos (compatibles con Excel, LibreOffice y Google Sheets).
for fila in ws.iter_rows(min_row=2, min_col=2, max_col=5):
    for celda in fila:
        if isinstance(celda.value, str):
            v = celda.value
            for hoja in ("Ingresos", "Gastos"):
                for col in "FHIJKL":
                    v = v.replace(f"{hoja}!${col}", rango(hoja, col))
            celda.value = v

# --- Calendario ---
ws = wb.create_sheet("Calendario")
cabecera(ws, ["Plazo habitual", "Modelo", "Qué se presenta"], [26, 16, 60])
calendario = [
    ("1 – 20 de abril", "303 y 130", "IVA e IRPF del 1.er trimestre"),
    ("Abril – 30 de junio", "Renta (100)", "Declaración anual de IRPF del año anterior"),
    ("1 – 20 de julio", "303 y 130", "IVA e IRPF del 2.º trimestre"),
    ("1 – 20 de octubre", "303 y 130", "IVA e IRPF del 3.er trimestre"),
    ("1 – 30 de enero", "303, 130 y 390", "IVA e IRPF del 4.º trimestre y resumen anual de IVA"),
    ("1 – 31 de enero", "111, 115, 190, 180", "Retenciones (si tienes empleados o alquilas local)"),
    ("Febrero", "347", "Operaciones con terceros superiores a 3.005,06 € anuales"),
]
for i, fila in enumerate(calendario, start=2):
    for j, v in enumerate(fila, start=1):
        ws.cell(row=i, column=j, value=v)
ws.cell(row=len(calendario) + 3, column=1, value="Si el último día es festivo o fin de semana, el plazo se traslada al siguiente hábil. "
        "Con domiciliación bancaria el plazo suele terminar unos días antes.").font = Font(italic=True, color="888888")

# --- Checklist ---
ws = wb.create_sheet("Checklist gastos")
cabecera(ws, ["✔", "Gasto", "Nota"], [6, 44, 64])
checklist = [
    ("Cuota de autónomos", "Deducible al 100 % en IRPF"),
    ("Gestoría / asesoría", "Factura a tu nombre"),
    ("Software y suscripciones", "Facturación, diseño, nube, dominio y hosting"),
    ("Teléfono e internet", "Si es línea exclusiva, 100 %; si es mixta, la parte afecta"),
    ("Suministros de casa", "30 % de la parte proporcional de la vivienda afecta"),
    ("Alquiler de local / coworking", "Si alquilas local a un particular o empresa, revisa la retención (modelo 115)"),
    ("Equipos informáticos", "Más de 300 €: amortizar"),
    ("Formación", "Relacionada con la actividad"),
    ("Publicidad y marketing", "Anuncios, imprenta, web"),
    ("Seguros", "RC profesional; salud hasta 500 €/año por persona"),
    ("Comisiones bancarias", "Cuenta usada para la actividad"),
    ("Dietas y desplazamientos", "Con tarjeta, fuera de tu municipio y con límites diarios"),
    ("Material de oficina", "Papelería, consumibles"),
    ("Colegio profesional / asociaciones", "Cuotas obligatorias o vinculadas"),
]
for i, (g, n) in enumerate(checklist, start=2):
    ws.cell(row=i, column=1).fill = CLARO
    ws.cell(row=i, column=2, value=g)
    ws.cell(row=i, column=3, value=n)

salida = RAIZ / "productos" / f"pack-autonomo-{ANIO}.xlsx"
salida.parent.mkdir(exist_ok=True)
wb.save(salida)
print(f"Producto generado: {salida.relative_to(RAIZ)}")
