# Simulador de sala de máquinas (ER Simulator) — guía para desarrolladores

Página: `proa/simulador.html` → `js/er/ui/app.js`. Sin compilación, ES modules, vanilla JS. Pruebas: `node --test proa/tests/*.test.js`.
Servidor local: `cd proa && python3 -m http.server 8777` → http://localhost:8777/simulador.html

## Reglas generales

- **Todo lo que ve el usuario es bilingüe**: inglés (idioma de trabajo, va primero) + español. Botones con `bi(en, es)` o `btn(en, es, fn)`,
  rótulos de mimic con `en`/`es`, alarmas `alarm(p, id, cond, en, es)`, eventos `log(p, code, en, es)`, mensajes de acción `M(en, es)`.
  Usa terminología naval inglesa real (SMCP / manuales de máquinas). Comentarios de código en español, como el resto del proyecto.
- El modelo (`js/er/model/*.js`) es **lógica pura sin DOM**, testeable con node. Las vistas (`js/er/views/*.js`) solo dibujan y llaman acciones.
- Modelos simplificados pero **físicamente coherentes** (lags de primer orden, balances de masa/energía aproximados) y **conectados** entre sistemas por `p.sig`.
- La situación `sea` (navegando) debe ser **estable**: 30 min simulados sin alarmas activas ni derivas. `port` y `dead` también coherentes.
- Lee siempre señales de otros módulos con valor por defecto (`p.sig.x ?? valorNormal`) porque pueden no existir aún.
- Cada módulo solo modifica **sus** archivos. Si necesitas cambiar algo común (core.js, plant.js, app.js, css común) no lo hagas: explícalo en tu informe final.

## Estado de la planta (`p`)

`createPlant()` en `core.js`: `p.t` (s), `p.c` (componentes por id), `p.sig` (señales), `p.alarms`, `p.events`, `p.history` (Set de códigos para evaluación),
`p.faults` (averías del instructor: `p.faults[id] === true`), `p.env` ({ swTemp, ambient, seaDistanceNm }), `p.stats` ({ badSync, blackouts, marpol, trips }), `p.feeders`.

### Componentes (core.js)
- `addMotor(p, id, { en, es, bus: 'MSB'|'ESB', kw, kind: 'pump'|'fan'|'compressor'|'purifier'|..., restart, feeder })`
  → `{ cmd, run, standby, fault, trip, local, load (factor 0..1 de kw), hours }`. `motorsStep` (lo llama plant.js) pone `run` según `cmd`, tensión del
  cuadro, avería (`fault`) y disparo (`trip`), y suma el consumo eléctrico. Tras un apagón los motores se paran (`cmd=false`) salvo `restart: true`
  (rearranque secuencial) o los que están en `standby`. Pon `m.fault = Boolean(p.faults[...])` en tu `step` para las averías.
  Puedes poner `m.interlock = (p) => M(...)|null` (bloqueo de arranque) en `init`.
- `addValve(p, id, { en, es, open, kind: 'valve'|'cvalve' })` → `{ open, pos 0..1, auto, fault }`. `cvalve` = válvula de control (posición; `auto`
  significa que tu modelo la regula: si `auto` la mueves tú en `step`).
- `addTank(p, id, { en, es, cap (m³), level (m³), temp, fluid })`; utilidades `moveLevel`, `transfer(from, to, m3)`, `pct(tank)`.
- `addFeeder(p, id, { en, es, bus, kw, pref })` interruptores de cuadro; `feederLive(p, id)`.
- `standbyPair(p, [ids], lowCondition, en, es)` arranque automático de la bomba en reserva.
- `alarm(p, id, active, en, es, sev 'warn'|'alarm'|'trip')` — llámala en cada `step` con la condición; `isAlarm(p, id)`.
- `log(p, code, en, es)` eventos (también añade `code` a `p.history`).
- `lag(v, target, tau, dt)`, `clamp`, `M(en, es)`.
- Fluidos (`fluid` de tanques y tuberías): `sw, fw, lt, ht, lo, hfo, do, air, steam, elec, bilge, sew, co2, ref, cond`.

### Módulo de sistema (`js/er/model/<x>.js`)
```js
export function init(p) {}            // crea componentes y estado propio (p.<x> = {...})
export const setup = { sea(p) {}, port(p) {}, dead(p) {} };  // situación inicial (pon cmd=true a lo que deba ir en marcha, niveles…)
export function step(p, dt) {}         // física + alarmas + señales p.sig
export const actions = { nombre(p, ...args) { return null | M(en, es); } };  // nombres únicos en toda la planta: usa prefijo (meStart, ballastPump…)
export const FAULTS = [{ id, en, es, system: '<x>' }];  // averías para el instructor
```
Orden de cálculo en cada paso (plant.js): `electrical.pre` → `motorsStep` → air, cooling, fuel, lube, steam, engine, steering, water, hull, sewage,
incinerator, safety, hvac → `electrical.post`. `createSim(setup)` hace init + setup + 20 s de estabilización y pone t=0.
Acciones genéricas ya disponibles: `start, stop, standby, resetTrip, open, close, toggle, setPos, setAuto, setLocal` (con id del componente).

### Contrato de señales `p.sig` (quién escribe → quién lee)
| Señal | Escribe | Significado |
|---|---|---|
| msbLive, esbLive, msbFreq, msbVolt, dgKw[], egKw, egRunning | electrical | planta eléctrica |
| meStartAir, dgStartAir, serviceAir, controlAir (bar) | air | `drawAir(p, 'me'|'dg', bar)` gasta aire de arranque (exportada en air.js) |
| swFlow, ltFlow, htFlow (0..1), ltTemp, htTemp (°C salida camisas MP), fireMainPress (bar) | cooling | refrigeración central y C.I. |
| hfoServicePct, doServicePct, meFuelPress, meFuelTemp, meFuelVisc, meFuelOk, dgFuelOk, meFuelType 'HFO'|'DO' | fuel | combustible |
| meLoPress, meLoTemp, meLoOk, sternLoOk | lube | aceite |
| steamPress, steamAvail (0..1) | steam | vapor |
| steamUse { id: kg/h } | consumidores de vapor | cada consumidor declara su gasto y steam lo suma |
| meRpm (con signo), meLoad (0..1), meRunning, mePowerKw, shipSpeed (kn), meControl, telegraph | engine | motor principal |
| rudderAngle, helmOrder | steering / bridge | servo |
| fwTankPct, fwgProduction (t/día), fwgHeatKw | water | agua dulce |
| heel, trim, bilgeMaxPct, owsPpm | hull | lastre y sentinas |
| fireCount, fireZones, qcvTripped, erVentOn, co2Released | safety | incendios, CO2, agua nebulizada, ventilación |
| accomTemp, provTemps | hvac | AC y gambuzas |
Consumidores eléctricos fijos ya definidos en electrical: feeders del ESB (`f-lt2`, `f-efp`, `f-sg2`, `f-eac`, `f-smoke`, …). Ids de motores que
**deben** existir porque el cuadro de emergencia los dibuja: `ltp2` (feeder `f-lt2`, bus ESB), `efp` (feeder `f-efp`, ESB), `sgp2` (feeder `f-sg2`, ESB).
Tanque de diésel de servicio: `doServ` (lo usa la bomba de llenado del generador de emergencia). Botellas de aire `mr1`, `mr2`, `emr`.

## Vistas (`js/er/views/<id>.js`)
```js
export default { id, en, es, indent?, render(ctx) { return { el, update(p) } } };
```
`ctx.p()` planta actual · `ctx.act(name, ...args)` ejecuta acción y muestra el mensaje · `ctx.face(id)` abre ficha · `ctx.nav(viewId)` · `ctx.say(textEn)`.
- Esquema: `mimic(elements, ctx, { w, hgt })` en `ui/mimic.js` (ver la cabecera del archivo: pipe, pump, motor, valve, tank, receiver, value, label, box, hx, bar, custom).
  viewBox por defecto 1000×620. Al tocar una bomba/válvula/tanque se abre su ficha genérica; `registerFace(id, (ctx) => ({ en, es, body, update(p) }))` en
  `ui/faceplate.js` para fichas propias (paneles locales, depuradoras, calderas…). Widgets en `ui/widgets.js`: `meter, knob, lamp, push, rotaryBreaker,
  synchroscope, readout, bi, plate, scale`.
- Ejemplos completos: `views/eg.js` (mimic + fichas propias), `views/esb.js` y `views/msb.js` (cuadros con instrumentos), `views/dg.js`.
- Estilo: aspecto de simulador profesional (Kongsberg/Transas): fondo lila claro/oscuro del mimic ya resuelto en `er.css`. Si necesitas CSS propio, crea
  `proa/er-<grupo>.css`, y avisa en el informe para enlazarlo en `simulador.html`.

## Prácticas evaluadas (`js/er/scenarios/<grupo>.js`)
`export default [{ id, setup: 'sea'|'port'|'dead', minutes, en, es, brief: { en, es }, prepare(p), goals: [{ en, es, check(p), hold? }], fail?(p) }]`
(ver ejemplos en `scenarios.js`).

## Pruebas (`proa/tests/er-<grupo>.test.js`)
Usa `createSim`, `run`, `act` de `js/er/plant.js`. Mínimo: estabilidad de `sea` (30 min sin alarmas activas de tu sistema), una avería y su alarma,
y que cada práctica se pueda resolver con acciones.
