// Prácticas evaluadas del grupo C: combustible, aceite y vapor.
import { isAlarm, isOpen } from '../core.js';
import { purState } from '../model/fuel.js';

const had = (p, id) => p.history.has(`alarm:${id}`);

export default [
  {
    id: 'hfo-pur2-start', setup: 'sea', minutes: 8,
    en: 'Start HFO purifier No 2', es: 'Arrancar la depuradora de HFO nº 2',
    brief: {
      en: 'HFO purifier No 2 is stopped and isolated. Line it up from the settling tank to the service tank, start it, heat the oil to about 98 °C, make the water seal and put it into separation.',
      es: 'La depuradora de HFO nº 2 está parada y aislada. Alinéala de la sedimentación al servicio, arráncala, calienta el combustible a unos 98 °C, haz el sello de agua y ponla a separar.',
    },
    prepare(p) {
      const s = p.pur.hfop2, m = p.c.hfop2;
      m.cmd = false; m.run = false;
      Object.assign(s, { speed: 0, heater: false, feed: false, seal: false, sealT: 0, disch: null, temp: p.c.hfoSett.temp, flow: 0 });
      for (const v of ['hfop2-suc', 'hfop2-out']) { p.c[v].open = false; p.c[v].pos = 0; }
    },
    goals: [
      { en: 'Suction and clean oil outlet valves open', es: 'Válvulas de aspiración y de salida de aceite limpio abiertas', check: (p) => isOpen(p, 'hfop2-suc') && isOpen(p, 'hfop2-out') },
      { en: 'Bowl at full speed', es: 'Tambor a la velocidad nominal', check: (p) => p.pur.hfop2.speed >= 0.99 },
      { en: 'Oil heated to 95 °C or more', es: 'Combustible calentado a 95 °C o más', check: (p) => p.pur.hfop2.temp >= 95 },
      { en: 'Separating for 60 s without alarms', es: 'Separando durante 60 s sin alarmas', check: (p) => purState(p, 'hfop2') === 'separating' && !isAlarm(p, 'pur-hfop2-lt') && !isAlarm(p, 'pur-hfop2-seal'), hold: 60 },
    ],
    fail: (p) => (had(p, 'pur-hfop2-seal') ? { en: 'Feed opened without a water seal: oil lost to the sludge tank.', es: 'Se abrió la alimentación sin sello de agua: combustible perdido al tanque de lodos.' } : null),
  },
  {
    id: 'fo-changeover', setup: 'sea', minutes: 40,
    en: 'Change over ME fuel from HFO to DO before manoeuvring', es: 'Cambiar el combustible del MP de HFO a diésel antes de maniobrar',
    brief: {
      en: 'The ship will enter an emission control area and then manoeuvre. Change the main engine over to DO without exceeding 2 °C/min and without letting the viscosity fall below 1.5 cSt: put the viscosity controller in TEMPERATURE mode, lower the set point gradually and change over the 3-way valve.',
      es: 'El buque va a entrar en una zona de control de emisiones y después maniobrará. Cambia el motor principal a diésel sin superar 2 °C/min y sin que la viscosidad baje de 1,5 cSt: pon el controlador de viscosidad en modo TEMPERATURA, baja la consigna poco a poco y cambia la válvula de tres vías.',
    },
    prepare() {},
    goals: [
      { en: 'Viscosity controller in TEMPERATURE mode', es: 'Controlador de viscosidad en modo TEMPERATURA', check: (p) => p.fuel.fcm.mode === 'temp' },
      { en: '3-way changeover valve on DO', es: 'Válvula de tres vías en diésel (DO)', check: (p) => p.fuel.fcm.co === 'DO' },
      { en: 'Fuel at the engine at least 90 % DO', es: 'Combustible en el motor al menos 90 % diésel', check: (p) => p.fuel.fcm.frac < 0.1 },
      { en: 'Fuel temperature below 100 °C with pressure above 7 bar', es: 'Temperatura del combustible menor de 100 °C con presión mayor de 7 bar', check: (p) => p.fuel.fcm.T < 100 && (p.sig.meFuelPress ?? 0) > 7 },
    ],
    fail(p) {
      if (had(p, 'fcm-grad')) return { en: 'Fuel temperature changed faster than 2 °C/min.', es: 'La temperatura del combustible cambió más de 2 °C/min.' };
      if (had(p, 'fcm-visc-low')) return { en: 'Fuel viscosity fell too low (pump seizure risk).', es: 'La viscosidad del combustible bajó demasiado (riesgo de gripado de las bombas).' };
      if (had(p, 'fcm-press-low')) return { en: 'ME fuel pressure was lost.', es: 'Se perdió la presión de combustible del MP.' };
      return null;
    },
  },
  {
    id: 'blr-llw', setup: 'port', minutes: 12,
    en: 'Boiler: low water level trip recovery', es: 'Caldera: recuperación tras disparo por nivel muy bajo',
    brief: {
      en: 'Boiler feed pump No 1 failed and the standby pump was not selected. The burner has tripped on LOW-LOW water level. Restore the feed, the water level and the steam pressure.',
      es: 'Ha fallado la bomba de alimentación nº 1 y la de reserva no estaba seleccionada. El quemador ha disparado por nivel MUY BAJO. Recupera la alimentación, el nivel y la presión de vapor.',
    },
    prepare(p) {
      const c = p.c, s = p.steam;
      p.faults.bfp1 = true;
      c.bfp1.fault = true; c.bfp1.run = false;
      c.bfp2.standby = false; c.bfp2.cmd = false; c.bfp2.run = false;
      Object.assign(s, { level: 13, press: 5.8, burner: 'lockout', flame: false, timer: 15,
        lockReason: { code: 'llw', en: 'low-low water level', es: 'nivel de agua muy bajo' } });
    },
    goals: [
      { en: 'Feed pump No 2 running', es: 'Bomba de alimentación nº 2 en marcha', check: (p) => p.c.bfp2.run },
      { en: 'Boiler water level above 40 %', es: 'Nivel de agua de la caldera por encima del 40 %', check: (p) => p.steam.level > 40 },
      { en: 'Burner reset and firing', es: 'Quemador rearmado y encendido', check: (p) => p.steam.flame },
      { en: 'Steam pressure above 6.5 bar', es: 'Presión de vapor por encima de 6,5 bar', check: (p) => p.steam.press > 6.5 },
    ],
    fail: (p) => (p.steam.level > 90 ? { en: 'Boiler overfilled (water carry-over).', es: 'Caldera sobrellenada (arrastre de agua).' } : null),
  },
];
