// Ejercicios guiados del simulador. Cada uno prepara una situación (setup) y comprueba
// el estado (check). hold: segundos que la condición debe mantenerse para darlo por bueno.
import { actions, run, esbSource, readings } from './generator.js';

const blackoutOnEg = (s) => { actions.setMode(s, 'manual'); actions.blackout(s); actions.startEngine(s); run(s, 7); actions.breakerOn(s); run(s, 0.5); };

export const EXERCISES = [
  {
    id: 'phases',
    title: 'Comprueba las tres fases',
    goal: 'Con el generador en carga, lee la corriente y la tensión de las fases L1, L2 y L3 con los dos selectores.',
    hints: ['Gira el selector del amperímetro a 2 y a 3.', 'Haz lo mismo con el del voltímetro.', 'Las tres lecturas deben ser casi iguales.'],
    report: { en: 'All three phases are balanced. Voltage four hundred and forty volts.', es: 'Las tres fases están equilibradas. Tensión 440 voltios.' },
    setup: blackoutOnEg,
    check: (s) => ['meterA-L2', 'meterA-L3', 'meterV-L2', 'meterV-L3'].every((k) => s.history.has(k)),
  },
  {
    id: 'auto',
    title: 'Apagón con arranque automático',
    goal: 'Con el selector en AUTO, provoca un apagón y observa cómo el generador de emergencia arranca y toma la carga.',
    hints: ['Comprueba que «Control of EG breaker» está en 1 (AUTO).', 'Pulsa «Apagón» en el panel del instructor.', 'Espera a que se encienda «Generator breaker ON».'],
    report: { en: 'Blackout. The emergency generator has started automatically and is on load.', es: 'Apagón. El generador de emergencia ha arrancado automáticamente y está en carga.' },
    setup: () => {},
    check: (s) => s.history.has('blackout') && s.mode === 'auto' && esbSource(s) === 'eg',
  },
  {
    id: 'restore',
    title: 'Vuelta a la normalidad',
    goal: 'Tras el apagón vuelve la tensión principal. Devuelve el cuadro de emergencia al MSB y deja el generador parado.',
    hints: ['Pulsa «Restablecer MSB» en el panel del instructor.', 'En AUTO el interruptor se abre y el acoplamiento se cierra solo.', 'El motor se enfría 10 s y se para.'],
    report: { en: 'Main power restored. Emergency switchboard supplied from the main switchboard. Emergency generator stopped.', es: 'Tensión principal restablecida. Cuadro de emergencia alimentado desde el principal. Generador de emergencia parado.' },
    setup: (s) => { actions.blackout(s); run(s, 8); },
    check: (s) => esbSource(s) === 'msb' && s.engine === 'stopped' && s.history.has('msb-restored'),
  },
  {
    id: 'manual',
    title: 'Arranque manual',
    goal: 'Hay un apagón y el control está en MANUAL. Arranca el generador y dale tensión al cuadro de emergencia.',
    hints: ['Pulsa START en el panel local del motor.', 'Espera a que el voltímetro marque 440 V.', 'Pulsa «Generator breaker ON» (botón blanco).'],
    report: { en: 'Emergency generator started manually. Breaker closed. Emergency switchboard on line.', es: 'Generador de emergencia arrancado a mano. Interruptor cerrado. Cuadro de emergencia con tensión.' },
    setup: (s) => { actions.setMode(s, 'manual'); actions.blackout(s); run(s, 0.2); },
    check: (s) => s.mode === 'manual' && esbSource(s) === 'eg',
  },
  {
    id: 'backfeed',
    title: 'Alimenta el cuadro principal',
    goal: 'El generador de emergencia ya alimenta el ESB. Alimenta también los consumidores esenciales del MSB sin que dispare la protección, durante 10 segundos.',
    hints: ['Antes, para consumidores no esenciales (p. ej. «Engine room auxiliaries»).', 'Gira «Control of tie breaker to MSB» a 2 (emergency supply).', 'Vigila que el amperímetro quede por debajo de la zona roja.'],
    report: { en: 'Non-essential consumers stopped. Main switchboard supplied from the emergency generator.', es: 'Consumidores no esenciales parados. Cuadro principal alimentado desde el generador de emergencia.' },
    setup: blackoutOnEg,
    check: (s) => s.tieBreaker && s.genBreaker && !s.msbLive && !s.trip,
    hold: 10,
  },
  {
    id: 'trip',
    title: 'Disparo por sobrecorriente y rearme',
    goal: 'Al alimentar el MSB con todos los consumidores el generador se sobrecarga y dispara. Rearma y vuelve a dar tensión.',
    hints: ['Observa la luz roja «Overcurrent trip».', 'Reduce la carga: para consumidores no esenciales.', 'Pulsa RESET y después «Generator breaker ON».'],
    report: { en: 'Overcurrent trip on the emergency generator. Load reduced, trip reset, breaker closed again.', es: 'Disparo por sobrecorriente del generador de emergencia. Carga reducida, disparo rearmado e interruptor cerrado de nuevo.' },
    setup: (s) => { blackoutOnEg(s); actions.toggleLoad(s, 'ltfw'); actions.setTieMode(s, 'emergency'); },
    check: (s) => s.history.has('trip') && s.history.has('reset') && esbSource(s) === 'eg' && readings(s).amps < 260,
  },
  {
    id: 'insulation',
    title: 'Fallo de aislamiento',
    goal: 'Salta una alarma en el cuadro de emergencia. Mira los instrumentos y responde qué ocurre.',
    hints: ['Fíjate en el medidor de kΩ.', 'Un valor alto es bueno; uno bajo indica derivación a masa.'],
    report: { en: 'Low insulation alarm. Earth fault on the emergency switchboard.', es: 'Alarma de aislamiento bajo. Derivación a masa en el cuadro de emergencia.' },
    setup: (s) => { actions.insulationFault(s, true); s.events.pop(); },
    quiz: {
      q: 'What does the panel show? · ¿Qué indica el panel?',
      options: [
        ['Generator overcurrent', 'Sobrecorriente en el generador'],
        ['Earth fault (low insulation)', 'Derivación a masa (aislamiento bajo)'],
        ['Low voltage on phase L2', 'Tensión baja en la fase L2'],
        ['Everything is normal', 'Todo es normal'],
      ],
      answer: 1,
    },
  },
];
