// Prácticas evaluadas del grupo D: lastre, sentinas y separador, aguas residuales e incinerador.
import { SHIP, WELLS, BALLAST } from '../model/hull.js';
import { pct } from '../core.js';

const listMoment = (deg) => SHIP.displ * SHIP.gm * Math.tan((deg * Math.PI) / 180);
const noMarpol = (p) => (p.stats.marpol > 0 ? { en: 'Pollution / BWM violation recorded.', es: 'Se ha registrado una infracción de contaminación / BWM.' } : null);

export default [
  {
    id: 'ballast-list', setup: 'sea', minutes: 12,
    en: 'Correct a 3° list with ballast', es: 'Corregir una escora de 3° con lastre',
    brief: {
      en: 'A cargo shift has given the ship a 3° list to port. Transfer ballast internally (no sea water in or out) to bring the ship upright, then secure the ballast system.',
      es: 'Un corrimiento de carga ha escorado el buque 3° a babor. Traslada lastre entre tanques (sin tomar ni descargar agua de mar) para adrizarlo y después asegura el sistema de lastre.',
    },
    prepare(p) {
      p.hull.listMoment = -listMoment(3);
      p.hull.heel = -3;
    },
    goals: [
      { en: 'A ballast pump running on an internal transfer', es: 'Una bomba de lastre trasegando entre tanques', check: (p) => (p.c.bp1.run || p.c.bp2.run) && p.hull.flow > 0.05 },
      { en: 'Ship upright: list below 0.5° for 30 s', es: 'Buque adrizado: escora menor de 0,5° durante 30 s', check: (p) => Math.abs(p.hull.heel) < 0.5, hold: 30 },
      { en: 'Ballast pumps stopped and tank valves closed', es: 'Bombas de lastre paradas y válvulas de tanques cerradas', check: (p) => p.history.has('goal:ballast-list:1') && !p.c.bp1.run && !p.c.bp2.run && BALLAST.every((t) => !p.c[`vs-${t.id}`].open && !p.c[`vf-${t.id}`].open) },
    ],
    fail: (p) => noMarpol(p) ?? (Math.abs(p.hull.heel) > 6 ? { en: 'The list exceeded 6°.', es: 'La escora ha superado los 6°.' } : null),
  },
  {
    id: 'ows-marpol', setup: 'sea', minutes: 20,
    en: 'Pump ER bilges through the OWS complying with MARPOL', es: 'Achicar sentinas a través del separador cumpliendo MARPOL',
    brief: {
      en: 'The engine room bilge wells are high. Pump them to the bilge holding tank, then process the holding tank through the oily water separator (15 ppm). Record the operation in the Oil Record Book and stop the separator.',
      es: 'Las sentinas de la cámara de máquinas están altas. Achícalas al tanque de retención y después trata ese tanque con el separador de agua oleosa (15 ppm). Anota la operación en el Libro Registro de Hidrocarburos y para el separador.',
    },
    prepare(p) {
      for (const w of WELLS) p.c[w.id].level = 0.62 * p.c[w.id].cap;
      p.c.bilgeHold.level = 14;
      p.hull.holdOil = 14 * 0.02;
    },
    goals: [
      { en: 'All ER bilge wells below 20 %', es: 'Todos los pozos de sentina por debajo del 20 %', check: (p) => WELLS.every((w) => pct(p.c[w.id]) < 20) },
      { en: 'OWS discharging overboard below 15 ppm (0.5 m³)', es: 'Separador descargando al mar por debajo de 15 ppm (0,5 m³)', check: (p) => p.hull.ows.discharged >= 0.5 },
      { en: 'Oil Record Book entry made', es: 'Anotación hecha en el Libro Registro de Hidrocarburos', check: (p) => p.history.has('orb-entry') },
      { en: 'OWS and bilge pump stopped, overboard valve closed', es: 'Separador y bomba de sentinas parados, válvula al mar cerrada', check: (p) => p.history.has('orb-entry') && !p.c.ows.run && !p.c.bilp.run && !p.c['v-ows-ob'].open },
    ],
    fail: noMarpol,
  },
  {
    id: 'inc-sludge', setup: 'sea', minutes: 20,
    en: 'Start the incinerator and burn sludge', es: 'Arrancar el incinerador y quemar lodos',
    brief: {
      en: 'Transfer sludge to the waste oil service tank and heat it, start the incinerator on the diesel pilot burner, and when the chamber is above 850 °C burn waste oil for 2 minutes without a high temperature shutdown.',
      es: 'Trasiega lodos al tanque de servicio de aceite residual y caliéntalo, arranca el incinerador con el quemador piloto de diésel y, cuando la cámara pase de 850 °C, quema aceite residual durante 2 minutos sin parada por alta temperatura.',
    },
    prepare(p) { p.c.incWo.level = 0.1; p.c.incWo.temp = 35; },
    goals: [
      { en: 'Waste oil tank above 50 % and heated above 70 °C', es: 'Tanque de aceite residual por encima del 50 % y a más de 70 °C', check: (p) => pct(p.c.incWo) > 50 && p.c.incWo.temp > 70 },
      { en: 'Pilot burner firing after pre-purge', es: 'Quemador piloto encendido tras el barrido', check: (p) => p.inc.state === 'firing' },
      { en: 'Combustion chamber above 850 °C', es: 'Cámara de combustión por encima de 850 °C', check: (p) => p.inc.T > 850 },
      { en: 'Waste oil burning for 2 minutes', es: 'Aceite residual quemándose durante 2 minutos', check: (p) => p.inc.woOn, hold: 120 },
    ],
    fail: (p) => (p.history.has('inc-lockout:hightemp') ? { en: 'High temperature shutdown.', es: 'Parada por alta temperatura.' } : null),
  },
];
