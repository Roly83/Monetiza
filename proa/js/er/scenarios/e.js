// Prácticas evaluadas del grupo E: incendios (agua nebulizada y CO2) y planta frigorífica.
import { erSealed } from '../model/safety.js';

const has = (p, code) => p.history.has(code);

export default [
  {
    id: 'e-mist-purifier', setup: 'sea', minutes: 5,
    en: 'Fire in the purifier room: water mist release', es: 'Incendio en el local de depuradoras: disparo del agua nebulizada',
    brief: {
      en: 'The water mist system was left in MANUAL after maintenance. A fire breaks out in the purifier room. Release the water mist on the right section, put the fire out, then reset the system and return it to AUTO.',
      es: 'El agua nebulizada se quedó en MANUAL tras un mantenimiento. Se declara un incendio en el local de depuradoras. Dispara el agua nebulizada en la sección correcta, apaga el fuego y después rearma el sistema y vuelve a dejarlo en AUTOMÁTICO.',
    },
    prepare(p) {
      p.safety.mist.mode = 'manual';
      p.faults['fire-purifier'] = true;
    },
    goals: [
      { en: 'Fire alarm in the purifier room', es: 'Alarma de incendio en el local de depuradoras', check: (p) => has(p, 'alarm:fire-purifier') },
      { en: 'Water mist released on the purifier room section', es: 'Agua nebulizada disparada en la sección de depuradoras', check: (p) => has(p, 'wm-release:purifier') },
      { en: 'Fire extinguished', es: 'Incendio extinguido', check: (p) => has(p, 'fire-out:purifier') },
      { en: 'Water mist reset: valves closed, pump stopped, system in AUTO', es: 'Agua nebulizada rearmada: válvulas cerradas, bomba parada y sistema en AUTOMÁTICO', check: (p) => has(p, 'fire-out:purifier') && p.safety.mist.mode === 'auto' && !p.c.wmp.cmd && !p.c['wm-purifier'].open },
    ],
    fail: (p) => (p.safety.zones.purifier.fire > 0.98 ? { en: 'The fire is out of control.', es: 'El incendio está fuera de control.' } : null),
  },
  {
    id: 'e-co2-er', setup: 'sea', minutes: 10,
    en: 'Engine room fire: CO2 release procedure', es: 'Incendio en la sala de máquinas: procedimiento de disparo de CO2',
    brief: {
      en: 'A large fire on the main engine top cannot be controlled and the water mist pump unit has failed. The Master orders CO2 flooding of the engine room. Follow the release procedure in the correct order: open the release cabinet (pre-alarm), confirm the headcount, stop ventilation and close fire dampers and skylight, trip the fuel quick-closing valves, then open the pilot cylinders and the main valve.',
      es: 'Un gran incendio en la parte alta del motor principal no se puede controlar y el grupo de agua nebulizada está averiado. El capitán ordena inundar la sala de máquinas con CO2. Sigue el procedimiento en orden: abre el armario de disparo (prealarma), confirma el recuento de personal, para la ventilación y cierra compuertas y lumbrera, dispara las válvulas de cierre rápido de combustible y después abre las botellas piloto y la válvula principal.',
    },
    prepare(p) {
      p.faults['fire-metop'] = true;
      p.faults.wmp = true;
      p.safety.zones.metop.fire = 0.6;
    },
    goals: [
      { en: 'CO2 release cabinet opened and headcount confirmed', es: 'Armario de disparo abierto y recuento de personal confirmado', check: (p) => has(p, 'co2-headcount') },
      { en: 'Engine room sealed (fans stopped, dampers and skylight closed)', es: 'Sala de máquinas cerrada (ventiladores parados, compuertas y lumbrera cerradas)', check: (p) => erSealed(p) },
      { en: 'Fuel oil quick-closing valves tripped', es: 'Válvulas de cierre rápido de combustible disparadas', check: (p) => p.safety.qcvTripped },
      { en: 'CO2 released into the sealed engine room', es: 'CO2 descargado en la sala de máquinas cerrada', check: (p) => has(p, 'co2-release-sealed') },
      { en: 'Fire extinguished', es: 'Incendio extinguido', check: (p) => has(p, 'fire-out:metop') },
    ],
    fail(p) {
      if (has(p, 'co2-err-headcount')) return { en: 'CO2 was released without confirming that the engine room was evacuated.', es: 'Se descargó el CO2 sin confirmar que la sala de máquinas estaba evacuada.' };
      if (has(p, 'co2-release-unsealed')) return { en: 'CO2 was released into an engine room that was not sealed.', es: 'Se descargó el CO2 en una sala de máquinas que no estaba cerrada.' };
      return null;
    },
  },
  {
    id: 'e-refrig', setup: 'sea', minutes: 25,
    en: 'Refrigeration compressor failure', es: 'Avería del compresor frigorífico',
    brief: {
      en: 'Provision refrigeration compressor No 1 has failed and No 2 was not selected as standby. The meat and fish rooms are warming up. Start compressor No 2 and bring the rooms back to temperature.',
      es: 'El compresor frigorífico nº 1 se ha averiado y el nº 2 no estaba en reserva. Las cámaras de carne y pescado se están calentando. Arranca el compresor nº 2 y recupera la temperatura de las cámaras.',
    },
    prepare(p) {
      p.faults.rcomp1 = true;
      p.c.rcomp2.standby = false;
      p.hvac.rooms.meat.temp = -11.5;
      p.hvac.rooms.fish.temp = -12.5;
    },
    goals: [
      { en: 'Refrigeration compressor No 2 running', es: 'Compresor frigorífico nº 2 en marcha', check: (p) => p.c.rcomp2.run },
      { en: 'Faulty compressor No 1 stopped (isolated)', es: 'Compresor nº 1 averiado parado (aislado)', check: (p) => !p.c.rcomp1.cmd },
      { en: 'Meat room below −15 °C', es: 'Cámara de carne por debajo de −15 °C', check: (p) => p.hvac.rooms.meat.temp < -15 },
      { en: 'Fish room below −15 °C', es: 'Cámara de pescado por debajo de −15 °C', check: (p) => p.hvac.rooms.fish.temp < -15 },
    ],
  },
];
