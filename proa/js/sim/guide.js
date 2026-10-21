// Guía bilingüe de cada elemento del cuadro del generador de emergencia.
// terms: vocabulario clave inglés → español.
export const GUIDE = {
  ammeter: {
    en: 'Ammeter (A)', es: 'Amperímetro (A)',
    textEn: 'The ammeter shows the current delivered by the emergency generator in one phase. Use the selector below it to read phase L1, L2 or L3. If the current stays above the limit, the overcurrent protection trips the breaker.',
    textEs: 'Indica la corriente que entrega el generador de emergencia en una fase. Con el selector de debajo se lee la fase L1, L2 o L3. Si la corriente se mantiene por encima del límite, la protección de sobrecorriente dispara el interruptor.',
    terms: [['current', 'corriente'], ['phase', 'fase'], ['load', 'carga']],
  },
  voltmeter: {
    en: 'Voltmeter (V)', es: 'Voltímetro (V)',
    textEn: 'The voltmeter shows the generator voltage. The rated voltage is 440 volts. Never close the breaker before the voltage is stable at about 440 volts.',
    textEs: 'Indica la tensión del generador. La tensión nominal es de 440 voltios. No se cierra el interruptor hasta que la tensión esté estable en unos 440 V.',
    terms: [['voltage', 'tensión'], ['rated voltage', 'tensión nominal'], ['stable', 'estable']],
  },
  wattmeter: {
    en: 'Wattmeter (kW)', es: 'Vatímetro (kW)',
    textEn: 'The wattmeter shows the active power taken by the consumers, in kilowatts. It tells you how loaded the emergency generator is.',
    textEs: 'Indica la potencia activa que consumen los equipos, en kilovatios. Te dice cuánta carga lleva el generador de emergencia.',
    terms: [['active power', 'potencia activa'], ['consumer', 'consumidor'], ['on load', 'en carga']],
  },
  varmeter: {
    en: 'Varmeter (kVar)', es: 'Varímetro (kVAr)',
    textEn: 'The varmeter shows the reactive power, in kilovars. Motors such as pumps and compressors take reactive power, which also increases the current.',
    textEs: 'Indica la potencia reactiva, en kilovares. Los motores (bombas, compresores) consumen reactiva, y eso también aumenta la corriente.',
    terms: [['reactive power', 'potencia reactiva'], ['motor', 'motor'], ['power factor', 'factor de potencia']],
  },
  insulation: {
    en: 'Insulation meter (kΩ)', es: 'Medidor de aislamiento (kΩ)',
    textEn: 'The insulation meter shows the insulation resistance of the emergency switchboard to earth. A high value is good. A low value means an earth fault: find the faulty circuit and isolate it.',
    textEs: 'Indica la resistencia de aislamiento del cuadro de emergencia respecto a masa. Un valor alto es bueno. Un valor bajo indica una derivación a masa: hay que localizar el circuito y aislarlo.',
    terms: [['insulation resistance', 'resistencia de aislamiento'], ['earth fault', 'derivación a masa'], ['isolate', 'aislar']],
  },
  meterA: {
    en: 'Ammeter selector', es: 'Selector del amperímetro',
    textEn: 'Turn the selector to read the current of phase one, two or three. The three phases should be almost equal.',
    textEs: 'Gíralo para leer la corriente de la fase 1, 2 o 3. Las tres fases deben ser casi iguales.',
    terms: [['selector switch', 'conmutador'], ['phase one / two / three', 'fase uno / dos / tres'], ['balanced', 'equilibrado']],
  },
  meterV: {
    en: 'Voltmeter selector', es: 'Selector del voltímetro',
    textEn: 'Turn the selector to read the voltage of each phase. A big difference between phases indicates a fault.',
    textEs: 'Gíralo para leer la tensión de cada fase. Una diferencia grande entre fases indica una avería.',
    terms: [['line voltage', 'tensión de línea'], ['fault', 'avería']],
  },
  supplyEsb: {
    en: 'Supply from ESB (green lamp)', es: 'Tensión en el ESB (luz verde)',
    textEn: 'This green lamp is on when the emergency switchboard has power, from the main switchboard or from the emergency generator.',
    textEs: 'Se enciende cuando el cuadro de emergencia tiene tensión, venga del cuadro principal o del generador de emergencia.',
    terms: [['emergency switchboard (ESB)', 'cuadro de emergencia'], ['power available', 'tensión disponible']],
  },
  supplyFromMsb: {
    en: 'Supply of ESB from MSB (green lamp)', es: 'ESB alimentado desde el MSB (luz verde)',
    textEn: 'This green lamp is on when the tie breaker is closed and the main switchboard feeds the emergency switchboard. This is normal operation at sea.',
    textEs: 'Se enciende cuando el interruptor de acoplamiento está cerrado y el cuadro principal alimenta al de emergencia. Es la situación normal navegando.',
    terms: [['main switchboard (MSB)', 'cuadro principal'], ['tie breaker', 'interruptor de acoplamiento'], ['normal operation', 'operación normal']],
  },
  overcurrent: {
    en: 'Overcurrent trip (red lamp)', es: 'Disparo por sobrecorriente (luz roja)',
    textEn: 'This red lamp shows that the overcurrent protection has tripped the generator breaker. Reduce the load, press RESET and then close the breaker again.',
    textEs: 'Indica que la protección de sobrecorriente ha disparado el interruptor del generador. Reduce la carga, pulsa RESET y vuelve a cerrar el interruptor.',
    terms: [['overcurrent', 'sobrecorriente'], ['to trip', 'disparar'], ['to reduce the load', 'reducir la carga']],
  },
  reset: {
    en: 'RESET button', es: 'Pulsador RESET',
    textEn: 'Press RESET to reset the overcurrent trip after you have found and removed the cause.',
    textEs: 'Rearma el disparo por sobrecorriente después de encontrar y eliminar la causa.',
    terms: [['to reset', 'rearmar'], ['cause', 'causa']],
  },
  breakerOff: {
    en: 'Generator breaker OFF (red button)', es: 'Interruptor del generador OFF (pulsador rojo)',
    textEn: 'The red button opens the emergency generator breaker. It is lit when the breaker is open. It only works in manual control.',
    textEs: 'Abre el interruptor del generador de emergencia. Está iluminado cuando el interruptor está abierto. Solo funciona en control manual.',
    terms: [['breaker open', 'interruptor abierto'], ['to open', 'abrir']],
  },
  breakerOn: {
    en: 'Generator breaker ON (white button)', es: 'Interruptor del generador ON (pulsador blanco)',
    textEn: 'The white button closes the emergency generator breaker. It is lit when the breaker is closed and the generator is on load.',
    textEs: 'Cierra el interruptor del generador de emergencia. Se ilumina cuando el interruptor está cerrado y el generador está en carga.',
    terms: [['breaker closed', 'interruptor cerrado'], ['to close', 'cerrar'], ['on load', 'en carga']],
  },
  tieMode: {
    en: 'Control of tie breaker to MSB', es: 'Control del acoplamiento al MSB',
    textEn: 'Position one, normal operation: the main switchboard feeds the emergency switchboard. Position two, emergency supply of MSB: in manual control, the emergency generator can feed essential consumers of the main switchboard through the tie breaker.',
    textEs: 'Posición 1, operación normal: el cuadro principal alimenta al de emergencia. Posición 2, alimentación de emergencia del MSB: en control manual, el generador de emergencia puede alimentar consumidores esenciales del cuadro principal a través del acoplamiento.',
    terms: [['emergency supply', 'alimentación de emergencia'], ['essential consumers', 'consumidores esenciales'], ['back-feed', 'alimentación inversa']],
  },
  mode: {
    en: 'Control of EG breaker and tie breaker', es: 'Control del interruptor del EG y del acoplamiento',
    textEn: 'Position one, auto: after a blackout the emergency generator starts and closes its breaker by itself, and stops when main power returns. Position two, manual: the engineer starts the generator and operates the breakers.',
    textEs: 'Posición 1, automático: tras un apagón el generador arranca y cierra su interruptor solo, y se para cuando vuelve la tensión principal. Posición 2, manual: el maquinista arranca el generador y maniobra los interruptores.',
    terms: [['automatic', 'automático'], ['manual', 'manual'], ['blackout', 'apagón']],
  },
  engine: {
    en: 'Emergency generator engine', es: 'Motor del generador de emergencia',
    textEn: 'The local control panel of the diesel engine. In manual control you start it here. After starting, wait until the voltage is 440 volts before closing the breaker.',
    textEs: 'Panel local del motor diésel. En control manual se arranca aquí. Tras arrancar, espera a que la tensión llegue a 440 V antes de cerrar el interruptor.',
    terms: [['to start the engine', 'arrancar el motor'], ['to stop', 'parar'], ['cooling down', 'enfriamiento']],
  },
  loads: {
    en: 'Emergency consumers', es: 'Consumidores de emergencia',
    textEn: 'Consumers fed from the emergency switchboard. Before feeding the main switchboard from the emergency generator, stop non-essential consumers so the generator is not overloaded.',
    textEs: 'Equipos alimentados desde el cuadro de emergencia. Antes de alimentar el cuadro principal desde el generador de emergencia, para los consumidores no esenciales para no sobrecargar el generador.',
    terms: [['non-essential', 'no esencial'], ['overload', 'sobrecarga'], ['to shed load', 'deslastrar carga']],
  },
};

export const GUIDE_ORDER = [
  'ammeter', 'voltmeter', 'wattmeter', 'varmeter', 'insulation', 'meterA', 'meterV',
  'supplyEsb', 'supplyFromMsb', 'overcurrent', 'breakerOff', 'breakerOn', 'reset', 'tieMode', 'mode', 'engine', 'loads',
];
