// Prácticas evaluadas del grupo A: motor principal, puente, bocina y servomotor.
import { isOpen } from '../core.js';
import { orderIndex, STOP_I } from '../model/engine.js';

export default [
  {
    id: 'a-me-start', setup: 'port', minutes: 6,
    en: 'Prepare and start the main engine from the ECR and hand over to the bridge',
    es: 'Preparar y arrancar el motor principal desde la ECR y pasar el control al puente',
    brief: {
      en: 'The main engine is in ECR control with the turning gear engaged and the main starting valve closed. The bridge rings DEAD SLOW AHEAD. Prepare the engine, answer the telegraph with the ECR lever and, once running, transfer control to the bridge (request in the ECR, accept on the bridge).',
      es: 'El motor principal está en control desde la ECR con el virador engranado y la válvula principal de arranque cerrada. El puente pide AVANTE MUY POCA. Prepara el motor, contesta el telégrafo con la palanca de la ECR y, ya en marcha, pasa el control al puente (se pide en la ECR y se acepta en el puente).',
    },
    prepare(p) {
      Object.assign(p.me, { control: 'ecr', turningGear: true, ans: STOP_I, tel: orderIndex('DSA') });
      p.c['me-msv'].open = false;
      p.c['me-msv'].pos = 0;
    },
    goals: [
      { en: 'Turning gear disengaged and main starting valve open', es: 'Virador desengranado y válvula principal de arranque abierta', check: (p) => !p.me.turningGear && isOpen(p, 'me-msv') },
      { en: 'Telegraph answered from the ECR (DEAD SLOW AHEAD)', es: 'Telégrafo contestado desde la ECR (AVANTE MUY POCA)', check: (p) => p.me.ans === p.me.tel && p.me.tel === orderIndex('DSA') && p.history.has('me-ans-DSA') },
      { en: 'Main engine running ahead on fuel', es: 'Motor principal en marcha avante con combustible', check: (p) => p.me.state === 'running' && p.sig.meRpm > 20 },
      { en: 'Control on the bridge with the engine running', es: 'Control en el puente con el motor en marcha', check: (p) => p.me.control === 'bridge' && p.me.state === 'running' },
    ],
    fail: (p) => (p.me.startFail ? { en: 'Main engine start failure.', es: 'Fallo de arranque del motor principal.' } : null),
  },
  {
    id: 'a-sg-leak', setup: 'sea', minutes: 6,
    en: 'Steering gear: hydraulic oil leak — change over to pump No 2',
    es: 'Servomotor: fuga de aceite hidráulico — cambio a la bomba nº 2',
    brief: {
      en: 'At sea, steering with pump No 1. A hydraulic leak appears in system No 1. Start pump No 2, stop pump No 1, isolate system No 1 and check that the rudder follows a helm order of 10° or more.',
      es: 'Navegando, gobernando con la bomba nº 1. Aparece una fuga en el sistema hidráulico nº 1. Arranca la bomba nº 2, para la nº 1, aísla el sistema nº 1 y comprueba que el timón sigue una orden de 10° o más.',
    },
    prepare(p) { p.faults['sg-leak'] = true; p.c.sgp2.standby = false; },
    goals: [
      { en: 'Steering gear pump No 2 running', es: 'Bomba del servo nº 2 en marcha', check: (p) => p.c.sgp2.run },
      { en: 'Pump No 1 stopped and system No 1 isolated', es: 'Bomba nº 1 parada y sistema nº 1 aislado', check: (p) => !p.c.sgp1.cmd && !isOpen(p, 'sg-iso1') },
      { en: 'Rudder follows a helm order of 10° or more (system No 2)', es: 'El timón sigue una orden de 10° o más (sistema nº 2)', check: (p) => Math.abs(p.sg.helm) >= 10 && Math.abs(p.sg.rudder - p.sg.helm) < 1 && !p.c.sgp1.run, hold: 5 },
    ],
    fail: (p) => (p.c.sgTank2.level < 0.1 ? { en: 'Steering gear oil tank No 2 empty.', es: 'Tanque de aceite del servo nº 2 vacío.' } : null),
  },
  {
    id: 'a-me-slowdown', setup: 'sea', minutes: 8,
    en: 'ME slowdown: high exhaust temperature on cylinder 3',
    es: 'Slowdown del motor principal: temperatura alta de escape del cilindro 3',
    brief: {
      en: 'At sea in bridge control. The fuel valve of cylinder 3 starts leaking and its exhaust temperature rises until the safety system slows the engine down. Cut out the fuel pump of cylinder 3, reset the slowdown and bring the engine back above 70 rpm with all exhaust temperatures below 430 °C.',
      es: 'Navegando con control desde el puente. El inyector del cilindro 3 gotea y su temperatura de escape sube hasta que el sistema de seguridad reduce la carga (slowdown). Anula la bomba de combustible del cilindro 3, rearma el slowdown y vuelve a más de 70 rpm con todas las temperaturas de escape por debajo de 430 °C.',
    },
    prepare(p) { p.faults['me-cyl3'] = true; },
    goals: [
      { en: 'Fuel pump of cylinder 3 cut out', es: 'Bomba de combustible del cilindro 3 anulada', check: (p) => p.me.cut[2] },
      { en: 'No slowdown active', es: 'Sin slowdown activo', check: (p) => p.me.cut[2] && !p.me.slowdown },
      { en: 'ME above 70 rpm, all exhaust temperatures below 430 °C', es: 'Motor por encima de 70 rpm y todos los escapes por debajo de 430 °C', check: (p) => p.sig.meRpm > 70 && p.me.exh.every((t) => t < 430) && p.me.cut[2], hold: 20 },
    ],
    fail: (p) => (p.me.shutdown ? { en: 'The main engine shut down.', es: 'El motor principal se ha parado (shutdown).' } : null),
  },
];
