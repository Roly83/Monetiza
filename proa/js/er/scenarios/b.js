// Prácticas evaluadas del grupo B: refrigeración, contraincendios, generador de agua dulce y agua sanitaria.
const run = (p, id) => p.c[id].run;

export default [
  {
    id: 'b-sea-chest', setup: 'sea', minutes: 8,
    en: 'Sea chest strainer blocked: change over sea chest', es: 'Filtro de la toma de mar obstruido: cambiar de toma de mar',
    brief: {
      en: 'The low sea chest strainer is clogged. The SW pressure falls and the standby pump starts. Change over to the high sea chest, restore normal SW pressure with one pump and put the other pump back in standby.',
      es: 'El filtro de la toma de mar baja está obstruido. Baja la presión de agua de mar y arranca la bomba de reserva. Cambia a la toma de mar alta, recupera la presión normal con una bomba y deja la otra otra vez en reserva.',
    },
    prepare(p) { p.faults['sw-strainer'] = true; },
    goals: [
      { en: 'High sea chest valve open', es: 'Válvula de la toma de mar alta abierta', check: (p) => p.c['v-sc-high'].open },
      { en: 'Low (clogged) sea chest valve closed', es: 'Válvula de la toma de mar baja (obstruida) cerrada', check: (p) => !p.c['v-sc-low'].open },
      { en: 'One SW pump running, the other in standby, SW pressure normal for 30 s', es: 'Una bomba de mar en marcha, la otra en reserva y presión normal durante 30 s',
        check: (p) => [run(p, 'swp1'), run(p, 'swp2')].filter(Boolean).length === 1 && (p.c.swp1.standby || p.c.swp2.standby) && p.cool.swPress > 1.4, hold: 30 },
      { en: 'LT temperature under control (below 38 °C)', es: 'Temperatura BT controlada (menos de 38 °C)', check: (p) => p.cool.ltT < 38 && p.history.has('open:v-sc-high') },
    ],
    fail: (p) => (p.cool.ltT > 45 ? { en: 'LT cooling water overheated.', es: 'El agua de refrigeración BT se ha sobrecalentado.' } : null),
  },
  {
    id: 'b-fwg-start', setup: 'sea', minutes: 12,
    en: 'Start the freshwater generator', es: 'Arrancar el generador de agua dulce',
    brief: {
      en: 'At sea, more than 20 nm from the coast, with the main engine running. Start the vacuum freshwater generator: ejector pump, vacuum, feed water, jacket water heating, distillate pump. Send distillate below 10 ppm to the FW tanks.',
      es: 'Navegando, a más de 20 millas de la costa y con el motor principal en marcha. Arranca el generador de agua dulce de vacío: bomba del eyector, vacío, agua de alimentación, calefacción con agua de camisas y bomba de destilado. Envía el destilado con menos de 10 ppm a los tanques.',
    },
    prepare(p) {
      for (const id of ['v-fwg-ovbd', 'v-fwg-suc', 'v-fwg-feed', 'v-fwg-hwin', 'v-fwg-hwout', 'v-fwg-fillP']) Object.assign(p.c[id], { open: false, pos: 0 });
      p.c.fwgEj.cmd = false; p.c.fwgDp.cmd = false;
      Object.assign(p.fwg, { vac: 0, heat: 0, prod: 0, ppm: 0, toTank: false, producing: false });
    },
    goals: [
      { en: 'Ejector pump running with sea suction and overboard open', es: 'Bomba del eyector en marcha con aspiración y descarga abiertas', check: (p) => run(p, 'fwgEj') && p.c['v-fwg-ovbd'].open && p.c['v-fwg-suc'].open },
      { en: 'Vacuum below -0.85 bar', es: 'Vacío por debajo de -0,85 bar', check: (p) => p.fwg.vac < -0.85 },
      { en: 'Hot water valves open and evaporating (heat > 300 kW)', es: 'Válvulas de agua caliente abiertas y evaporando (más de 300 kW)', check: (p) => p.fwg.heat > 300 },
      { en: 'Distillate below 10 ppm going to the FW tanks (production > 15 t/day)', es: 'Destilado con menos de 10 ppm hacia los tanques (producción > 15 t/día)', check: (p) => p.fwg.toTank && p.fwg.delivered > 15, hold: 20 },
    ],
    fail: (p) => (p.cool.htT < 65 && p.sig.meRunning ? { en: 'Jacket water cooled down too much.', es: 'El agua de camisas se ha enfriado demasiado.' } : null),
  },
  {
    id: 'b-efp', setup: 'sea', minutes: 6,
    en: 'Fire main burst: start the emergency fire pump', es: 'Rotura del colector C.I.: arrancar la bomba de emergencia',
    brief: {
      en: 'Fire on deck: the main fire pump is running but the fire main has burst in the engine room and the pressure is low. Isolate the engine room section and supply the deck hydrants with the emergency fire pump (above 7 bar).',
      es: 'Incendio en cubierta: la bomba C.I. principal está en marcha pero el colector se ha roto en la cámara de máquinas y la presión es baja. Aísla el tramo de la cámara de máquinas y alimenta los hidrantes de cubierta con la bomba de emergencia (más de 7 bar).',
    },
    prepare(p) {
      p.faults['fire-leak'] = true;
      p.c.fp1.cmd = true;
      Object.assign(p.c['v-hyd-deck1'], { open: true, pos: 1 });
      Object.assign(p.c['v-efp-suc'], { open: false, pos: 0 });
    },
    goals: [
      { en: 'Fire main isolating valve (ER / deck) closed', es: 'Válvula de aislamiento del colector (máquinas / cubierta) cerrada', check: (p) => !p.c['v-fire-iso'].open },
      { en: 'Emergency fire pump running with its sea suction open', es: 'Bomba de emergencia en marcha con su aspiración abierta', check: (p) => run(p, 'efp') && p.c['v-efp-suc'].open },
      { en: 'Deck fire main above 7 bar for 20 s', es: 'Colector de cubierta por encima de 7 bar durante 20 s', check: (p) => p.cool.fireDeck > 7 && p.c['v-hyd-deck1'].open, hold: 20 },
    ],
  },
];
