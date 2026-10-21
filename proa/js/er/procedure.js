// Procedimiento de arranque completo del buque (de buque muerto a navegar), paso a paso para el alumno.
// Cada paso: { phase (1..5, como PHASES de plant.js), view (vista donde se hace), en, es, check?(p), do?(p, act, run) }.
// - check(p): condición que confirma que el paso está hecho (la interfaz puede marcarlo en verde).
// - do(p, act, run): las acciones reales del operador que hace la prueba automática (tests/er-startup.test.js);
//   act(p, nombre, ...args) y run(p, segundos) tienen la firma de plant.js. La interfaz ignora `do`.
// La prueba recorre esta lista en orden: si cambias el procedimiento, la prueba lo comprueba.
import { isOpen, pct } from './core.js';
import { purState } from './model/fuel.js';
import { meReady } from './model/engine.js';
import { connected } from './model/electrical.js';
import { treated } from './model/sewage.js';

// Espera (simulada) hasta que se cumpla la condición, con un límite de tiempo (s).
const waitFor = (p, run, cond, max) => {
  for (let t = 0; t < max && !cond(p); t += 5) run(p, 5);
};
const runs = (p, id) => Boolean(p.c[id]?.run);

export const PROCEDURE = [
  // ======================= 1 · Energía de emergencia =======================
  {
    phase: 1, view: 'eg',
    en: 'Check the emergency generator DO tank level (above 50 %) and that its quick-closing valve is open',
    es: 'Comprueba el nivel del tanque de diésel del generador de emergencia (más del 50 %) y que su válvula de cierre rápido está abierta',
    check: (p) => pct(p.c.egDoTank) > 50 && isOpen(p, 'egQcv'),
  },
  {
    phase: 1, view: 'eg',
    en: 'Set the EG local control panel to LOCAL and press START (battery start)',
    es: 'Pon el panel local del G. E. en LOCAL y pulsa START (arranque con baterías)',
    do: (p, act, run) => { act(p, 'egLcp', 'local'); act(p, 'egStart'); run(p, 10); },
    check: (p) => p.elec.eg.state === 'running' && p.elec.eg.v > 420,
  },
  {
    phase: 1, view: 'eg',
    en: 'Open the EG room ventilation flaps (FLAPS OPEN) and start the EG room fan',
    es: 'Abre los flaps de ventilación del local del G. E. (FLAPS OPEN) y arranca el ventilador del local',
    do: (p, act, run) => { act(p, 'flaps', true); act(p, 'start', 'egfan'); run(p, 10); },
    check: (p) => p.elec.flaps.pos > 0.9 && runs(p, 'egfan'),
  },
  {
    phase: 1, view: 'esb',
    en: 'On the ESB, turn the control selector to MANUAL, check 440 V / 60 Hz and close the EG breaker (ON)',
    es: 'En el ESB, pasa el selector de control a MANUAL, comprueba 440 V / 60 Hz y cierra el interruptor del G. E. (ON)',
    do: (p, act, run) => { act(p, 'egMode', 'manual'); act(p, 'egBreakerOn'); run(p, 2); },
    check: (p) => p.sig.esbLive && p.elec.eg.breaker,
  },
  {
    phase: 1, view: 'esb',
    en: 'Check the battery charger is ON and charging, and the fire detection panel is powered (SMOKE DETECTOR breaker)',
    es: 'Comprueba que el cargador de baterías está encendido y cargando, y que la central de detección de incendios tiene tensión (interruptor SMOKE DETECTOR)',
    do: (p, act, run) => { act(p, 'chargerOn', true); run(p, 2); },
    check: (p) => p.elec.battery.charging && p.safety.detPower,
  },
  {
    phase: 1, view: 'air',
    en: 'Start the emergency air compressor (fed from the ESB) to charge the emergency air receiver',
    es: 'Arranca el compresor de aire de emergencia (desde el ESB) para cargar la botella de emergencia',
    do: (p, act, run) => { act(p, 'start', 'eac'); run(p, 2); },
    check: (p) => runs(p, 'eac'),
  },
  {
    phase: 1, view: 'air',
    en: 'Open the valve from the emergency air receiver to the diesel generators starting air line',
    es: 'Abre la válvula de la botella de emergencia a la línea de aire de arranque de los generadores',
    do: (p, act) => { act(p, 'open', 'v-emr-dg'); },
    check: (p) => isOpen(p, 'v-emr-dg'),
  },
  // ======================= 2 · Energía principal =======================
  {
    phase: 2, view: 'cooling',
    en: 'Open the low sea chest suction valve (check central cooler No 1 SW/LT valves and SW overboard valve open)',
    es: 'Abre la válvula de la toma de mar baja (comprueba abiertas las válvulas del enfriador central nº 1 y la descarga al costado)',
    do: (p, act) => { act(p, 'open', 'v-sc-low'); },
    check: (p) => isOpen(p, 'v-sc-low') && isOpen(p, 'v-sw-ovbd') && isOpen(p, 'v-cc1-sw') && isOpen(p, 'v-cc1-lt'),
  },
  {
    phase: 2, view: 'esb',
    en: 'Start LT FW pump No 2 from its ESB starter, so the first diesel generator has cooling water',
    es: 'Arranca la bomba de agua dulce BT nº 2 desde su arrancador del ESB, para que el primer generador tenga refrigeración',
    do: (p, act, run) => { act(p, 'start', 'ltp2', 'panel'); run(p, 10); },
    check: (p) => runs(p, 'ltp2') && p.cool.ltPress > 1.5,
  },
  {
    phase: 2, view: 'fuel',
    en: 'Check the DO service tank level and the DO supply valve to the diesel generators open',
    es: 'Comprueba el nivel del tanque de servicio de diésel y que la válvula de diésel a los generadores está abierta',
    check: (p) => Boolean(p.sig.dgFuelOk) && pct(p.c.doServ) > 30,
  },
  {
    phase: 2, view: 'air',
    en: 'Wait until the emergency air receiver is above 20 bar',
    es: 'Espera a que la botella de aire de emergencia pase de 20 bar',
    do: (p, act, run) => waitFor(p, run, (q) => q.c.emr.press > 20, 900),
    check: (p) => (p.sig.dgStartAir ?? 0) > 20,
  },
  {
    phase: 2, view: 'msb',
    en: 'Check DG No 1 is in REMOTE and press START for DG No 1 on the MSB generator panel',
    es: 'Comprueba que el generador nº 1 está en REMOTO y pulsa START del generador nº 1 en su panel del MSB',
    do: (p, act, run) => { act(p, 'dgStart', 1); run(p, 15); },
    check: (p) => p.elec.dg[0].state === 'running' && p.elec.dg[0].v > 420,
  },
  {
    phase: 2, view: 'msb',
    en: 'Check 440 V / 60 Hz and close DG No 1 breaker onto the dead busbar: the MSB is energized',
    es: 'Comprueba 440 V / 60 Hz y cierra el interruptor del generador nº 1 sobre barras muertas: el MSB tiene tensión',
    do: (p, act, run) => { act(p, 'breakerClose', 1); run(p, 2); },
    check: (p) => p.sig.msbLive && p.elec.dg[0].breaker,
  },
  {
    phase: 2, view: 'esb',
    en: 'Open the EG breaker (OFF): the ESB is now fed from the MSB through the tie breaker',
    es: 'Abre el interruptor del G. E. (OFF): el ESB pasa a alimentarse del MSB por el interruptor de acoplamiento',
    do: (p, act, run) => { act(p, 'egBreakerOff'); run(p, 2); },
    check: (p) => p.elec.eg.tie && p.sig.esbLive && !p.elec.eg.breaker,
  },
  {
    phase: 2, view: 'esb',
    en: 'Turn the ESB control selector back to AUTO; on the EG panel select REMOTE and flaps AUTO (the EG cools down and stops)',
    es: 'Vuelve el selector del ESB a AUTO; en el panel del G. E. selecciona REMOTO y flaps en AUTO (el G. E. se enfría y se para)',
    do: (p, act, run) => { act(p, 'egMode', 'auto'); act(p, 'egLcp', 'remote'); act(p, 'flapsMode', 'auto'); run(p, 5); },
    check: (p) => p.elec.eg.mode === 'auto' && p.elec.eg.lcp === 'remote' && p.elec.flaps.mode === 'auto',
  },
  {
    phase: 2, view: 'sewage',
    en: 'Sewage plant: put the discharge pump in MANUAL (stopped) until the biological plant is working again — no untreated discharge in port (MARPOL Annex IV)',
    es: 'Planta de aguas residuales: pon la bomba de descarga en MANUAL (parada) hasta que la planta biológica vuelva a funcionar — nada de descargas sin tratar en puerto (MARPOL Anexo IV)',
    do: (p, act) => { act(p, 'stpPumpAuto', false); act(p, 'stop', 'stpp'); },
    check: (p) => !p.sew.auto && !p.c.stpp.cmd,
  },
  {
    phase: 2, view: 'cooling',
    en: 'Start main SW pump No 1; when the SW pressure is normal, select main SW pump No 2 to STANDBY',
    es: 'Arranca la bomba de agua de mar nº 1; con la presión normal, pon la nº 2 en RESERVA',
    do: (p, act, run) => { act(p, 'start', 'swp1'); run(p, 15); act(p, 'standby', 'swp2', true); },
    check: (p) => runs(p, 'swp1') && p.c.swp2.standby && p.cool.swPress > 1.2,
  },
  {
    phase: 2, view: 'cooling',
    en: 'Start LT FW pump No 1, then stop LT FW pump No 2 and select it to STANDBY',
    es: 'Arranca la bomba BT nº 1, para la bomba BT nº 2 y ponla en RESERVA',
    do: (p, act, run) => { act(p, 'start', 'ltp1'); run(p, 10); act(p, 'stop', 'ltp2'); act(p, 'standby', 'ltp2', true); run(p, 10); },
    check: (p) => runs(p, 'ltp1') && p.c.ltp2.standby && p.cool.ltPress > 1.5,
  },
  {
    phase: 2, view: 'air',
    en: 'Start main air compressors No 1 and No 2 (pressure switch in AUTO) and stop the emergency air compressor',
    es: 'Arranca los compresores de aire principales nº 1 y nº 2 (presostato en AUTO) y para el compresor de emergencia',
    do: (p, act, run) => { act(p, 'start', 'mac1'); act(p, 'start', 'mac2'); act(p, 'stop', 'eac'); run(p, 5); },
    check: (p) => runs(p, 'mac1') && runs(p, 'mac2'),
  },
  {
    phase: 2, view: 'co2',
    en: 'Check the ER fire dampers open and start the ER supply and exhaust fans',
    es: 'Comprueba abiertas las compuertas cortafuegos y arranca los ventiladores de impulsión y extracción de la sala de máquinas',
    do: (p, act, run) => { act(p, 'start', 'erf1'); act(p, 'start', 'erf2'); run(p, 5); },
    check: (p) => p.c.erDampers.open && runs(p, 'erf1') && runs(p, 'erf2'),
  },
  // ======================= 3 · Servicios auxiliares =======================
  {
    phase: 3, view: 'cooling',
    en: 'Start HT (jacket) FW pump No 1; when the HT pressure is normal, select HT pump No 2 to STANDBY',
    es: 'Arranca la bomba de agua de camisas (AT) nº 1; con la presión normal, pon la nº 2 en RESERVA',
    do: (p, act, run) => { act(p, 'start', 'htp1'); run(p, 15); act(p, 'standby', 'htp2', true); },
    check: (p) => runs(p, 'htp1') && p.c.htp2.standby && p.cool.htPress > 1.5,
  },
  {
    phase: 3, view: 'cooling',
    en: 'Switch on the jacket water electric preheater (needs HT flow)',
    es: 'Conecta el precalentador eléctrico del agua de camisas (necesita caudal AT)',
    do: (p, act, run) => { act(p, 'start', 'htph'); run(p, 2); },
    check: (p) => runs(p, 'htph'),
  },
  {
    phase: 3, view: 'steam',
    en: 'Check the boiler water level in the gauge glass and the hot well level; start boiler feed pump No 1 and select No 2 to STANDBY',
    es: 'Comprueba el nivel de agua de la caldera en el tubo de nivel y el del pozo caliente; arranca la bomba de alimentación nº 1 y pon la nº 2 en RESERVA',
    do: (p, act, run) => { act(p, 'start', 'bfp1'); act(p, 'standby', 'bfp2', true); run(p, 5); },
    check: (p) => runs(p, 'bfp1') && p.c.bfp2.standby && p.steam.level > 30,
  },
  {
    phase: 3, view: 'steam',
    en: 'Select burner fuel DO, boiler control AUTO and switch the burner ON (pre-purge, ignition, low fire)',
    es: 'Selecciona combustible del quemador DO, control de la caldera AUTO y conecta el quemador (barrido, encendido, llama baja)',
    do: (p, act, run) => { act(p, 'blrFuel', 'DO'); act(p, 'blrMode', 'auto'); act(p, 'blrBurner', true); run(p, 60); },
    check: (p) => p.steam.flame,
  },
  {
    phase: 3, view: 'lube',
    en: 'Start ME LO pump No 1 and select No 2 to STANDBY (circulate and warm the oil)',
    es: 'Arranca la bomba de aceite del MP nº 1 y pon la nº 2 en RESERVA (circula y calienta el aceite)',
    do: (p, act, run) => { act(p, 'start', 'melp1'); act(p, 'standby', 'melp2', true); run(p, 20); },
    check: (p) => runs(p, 'melp1') && (p.sig.meLoPress ?? 0) > 2.4,
  },
  {
    phase: 3, view: 'fcm',
    en: 'FCM on DO: start FO supply pump No 1 and FO circulating pump No 1; select pumps No 2 to STANDBY',
    es: 'FCM con diésel: arranca la bomba de alimentación nº 1 y la de circulación nº 1; pon las nº 2 en RESERVA',
    do: (p, act, run) => {
      act(p, 'start', 'fsp1'); act(p, 'start', 'fcp1');
      act(p, 'standby', 'fsp2', true); act(p, 'standby', 'fcp2', true); run(p, 30);
    },
    check: (p) => (p.sig.meFuelPress ?? 0) > 7 && p.sig.meFuelOk,
  },
  {
    phase: 3, view: 'sterntube',
    en: 'Stern tube: check the aft and fwd seal header tank levels; with the filling valve to the gravity tank open, start the LO filling pump (filling takes about 20 min: carry on)',
    es: 'Bocina: comprueba el nivel de los tanques de los sellos de popa y proa; con la válvula de llenado al tanque de gravedad abierta, arranca la bomba de llenado (tarda unos 20 min: sigue con lo demás)',
    do: (p, act, run) => { act(p, 'start', 'stFill'); run(p, 2); },
    check: (p) => runs(p, 'stFill') && isOpen(p, 'v-st-grav') && pct(p.c.stAft) >= 30 && pct(p.c.stFwd) >= 30,
  },
  {
    phase: 3, view: 'steam',
    en: 'Wait until the steam pressure is above 6 bar (main steam stop valve open)',
    es: 'Espera a que la presión de vapor pase de 6 bar (válvula principal de vapor abierta)',
    do: (p, act, run) => waitFor(p, run, (q) => q.steam.press > 6.2, 1800),
    check: (p) => p.steam.press > 6 && isOpen(p, 'v-stm-main'),
  },
  {
    phase: 3, view: 'fuel',
    en: 'Open the steam heating valves of the HFO settling and service tanks',
    es: 'Abre las válvulas de vapor de calefacción de los tanques de sedimentación y de servicio de HFO',
    do: (p, act) => { act(p, 'open', 'v-sett-heat'); act(p, 'open', 'v-serv-heat'); },
    check: (p) => isOpen(p, 'v-sett-heat') && isOpen(p, 'v-serv-heat'),
  },
  {
    phase: 3, view: 'cooling',
    en: 'Check the jacket water steam preheater valve is open (the preheater thermostat keeps 60 °C)',
    es: 'Comprueba abierta la válvula de vapor del precalentador de camisas (su termostato mantiene 60 °C)',
    check: (p) => isOpen(p, 'v-preheat'),
  },
  {
    phase: 3, view: 'melop',
    en: 'ME LO purifier: open suction and outlet valves, START, wait for full speed, HEATER ON, WATER SEAL, then FEED ON',
    es: 'Depuradora de aceite del MP: abre aspiración y salida, START, espera la velocidad nominal, HEATER ON, WATER SEAL y FEED ON',
    do: (p, act, run) => {
      act(p, 'open', 'melop-suc'); act(p, 'open', 'melop-out'); act(p, 'start', 'melop'); run(p, 10);
      act(p, 'purHeater', 'melop', true);
      waitFor(p, run, (q) => q.pur.melop.speed >= 0.95, 300);
      act(p, 'purSeal', 'melop'); run(p, 15);
      waitFor(p, run, (q) => q.pur.melop.temp > 82, 1200);
      act(p, 'purFeed', 'melop', true); run(p, 10);
    },
    check: (p) => purState(p, 'melop') === 'separating',
  },
  {
    phase: 3, view: 'cooling',
    en: 'Start the main fire pump and check the fire main pressure (above 7 bar)',
    es: 'Arranca la bomba contraincendios principal y comprueba la presión del colector (más de 7 bar)',
    do: (p, act, run) => { act(p, 'start', 'fp1'); run(p, 15); },
    check: (p) => (p.sig.fireMainPress ?? 0) > 7,
  },
  {
    phase: 3, view: 'msb',
    en: 'Set the power management (PMS) to AUTO and start DG No 2: the PMS synchronizes it and shares the load',
    es: 'Pon la gestión de potencia (PMS) en AUTO y arranca el generador nº 2: el PMS lo sincroniza y reparte la carga',
    do: (p, act, run) => { act(p, 'setPms', 'auto'); act(p, 'dgStart', 2); waitFor(p, run, (q) => q.elec.dg[1].breaker, 120); run(p, 30); },
    check: (p) => connected(p).length >= 2 && p.elec.pms === 'auto',
  },
  // ======================= 4 · Habilitación y entorno =======================
  {
    phase: 4, view: 'sanitary',
    en: 'Open the FW tank outlet valves and the hydrophore outlet; recharge the hydrophore air cushion with service air',
    es: 'Abre las salidas de los tanques de agua dulce y la del hidróforo; recarga el colchón de aire del hidróforo con aire de servicio',
    do: (p, act) => { act(p, 'open', 'v-fwP-out'); act(p, 'open', 'v-fwS-out'); act(p, 'open', 'v-hyd-out'); act(p, 'hydAirCharge'); },
    check: (p) => isOpen(p, 'v-hyd-out') && p.san.air > 5,
  },
  {
    phase: 4, view: 'sanitary',
    en: 'Put both hydrophore pumps and the calorifier heater in AUTO; open the calorifier steam valve',
    es: 'Pon las dos bombas del hidróforo y la resistencia del calorífero en AUTO; abre la válvula de vapor del calorífero',
    do: (p, act, run) => { act(p, 'compAuto', 'hyd1', true); act(p, 'compAuto', 'hyd2', true); act(p, 'compAuto', 'calHeater', true); act(p, 'open', 'v-cal-steam'); waitFor(p, run, (q) => q.san.press > 4, 900); },
    check: (p) => p.c.hyd1.auto && p.san.press > 3,
  },
  {
    phase: 4, view: 'sewage',
    en: 'Sewage plant: start the air blower (aeration) and the chlorine dosing pump',
    es: 'Planta de aguas residuales: arranca la soplante (aireación) y la bomba dosificadora de cloro',
    do: (p, act, run) => { act(p, 'start', 'stpb'); act(p, 'start', 'stpcl'); run(p, 10); },
    check: (p) => runs(p, 'stpb') && runs(p, 'stpcl'),
  },
  {
    phase: 4, view: 'refrig',
    en: 'Check the refrigeration condenser cooling water valve open; start provision compressor No 1 and select No 2 to STANDBY',
    es: 'Comprueba abierta el agua de refrigeración del condensador; arranca el compresor de gambuzas nº 1 y pon el nº 2 en RESERVA',
    do: (p, act, run) => { act(p, 'start', 'rcomp1'); act(p, 'standby', 'rcomp2', true); run(p, 5); },
    check: (p) => runs(p, 'rcomp1') && p.c.rcomp2.standby && isOpen(p, 'rf-cw'),
  },
  {
    phase: 4, view: 'ac',
    en: 'AC plant: start the AHU supply fan first, then the AC compressor',
    es: 'Aire acondicionado: arranca primero el ventilador de la UTA y después el compresor',
    do: (p, act, run) => { act(p, 'start', 'ahu'); run(p, 3); act(p, 'start', 'acc'); run(p, 3); },
    check: (p) => runs(p, 'ahu') && runs(p, 'acc'),
  },
  {
    phase: 4, view: 'bilge',
    en: 'Pump the ER bilge wells to the bilge holding tank: open the bilge well suction valves and start the bilge pump',
    es: 'Achica los pozos de sentina al tanque de retención: abre las válvulas de aspiración de los pozos y arranca la bomba de sentinas',
    do: (p, act, run) => {
      for (const w of ['bwAft', 'bwFP', 'bwFS']) act(p, 'open', `v-${w}`);
      act(p, 'start', 'bilp');
      waitFor(p, run, (q) => (q.sig.bilgeMaxPct ?? 100) < 30, 1200);
    },
    check: (p) => (p.sig.bilgeMaxPct ?? 100) < 50,
  },
  {
    phase: 4, view: 'bilge',
    en: 'Stop the bilge pump and close the bilge well suction valves (emergency bilge suction stays closed)',
    es: 'Para la bomba de sentinas y cierra las válvulas de aspiración de los pozos (el achique de emergencia sigue cerrado)',
    do: (p, act, run) => { act(p, 'stop', 'bilp'); for (const w of ['bwAft', 'bwFP', 'bwFS']) act(p, 'close', `v-${w}`); run(p, 2); },
    check: (p) => !runs(p, 'bilp') && !isOpen(p, 'v-ebs'),
  },
  {
    phase: 4, view: 'ballast',
    en: 'Correct the list: transfer ballast from the starboard to the port topside wing tank with ballast pump No 1 (internal transfer, no sea water)',
    es: 'Corrige la escora: trasiega lastre del tanque alto de estribor al de babor con la bomba de lastre nº 1 (trasiego interno, sin agua de mar)',
    do: (p, act, run) => {
      act(p, 'open', 'vs-blWS'); act(p, 'open', 'vf-blWP'); act(p, 'open', 'v-bl-fill'); act(p, 'start', 'bp1');
      waitFor(p, run, (q) => q.c.blWP.level >= q.c.blWS.level - 1, 600);
      run(p, 60);
    },
    check: (p) => Math.abs(p.hull.heel) < 1,
  },
  {
    phase: 4, view: 'ballast',
    en: 'Secure the ballast system (SECURE: pumps stopped, all valves closed)',
    es: 'Asegura el sistema de lastre (SECURE: bombas paradas y todas las válvulas cerradas)',
    do: (p, act, run) => { act(p, 'ballastSecure'); run(p, 2); },
    check: (p) => !runs(p, 'bp1') && !p.c['v-bl-sea'].open && !p.c['v-bl-ob'].open,
  },
  {
    phase: 4, view: 'mist',
    en: 'Put the water mist system in AUTO (check tank level above 50 %)',
    es: 'Pon el sistema de agua nebulizada en AUTO (comprueba el tanque por encima del 50 %)',
    do: (p, act) => { act(p, 'mistMode', 'auto'); },
    check: (p) => p.safety.mist.mode === 'auto' && pct(p.c.wmTank) > 50,
  },
  {
    phase: 4, view: 'sewage',
    en: 'When the plant is treating again (dissolved oxygen and chlorine restored), put the sewage discharge pump back in AUTO (overboard valve open)',
    es: 'Cuando la planta vuelva a tratar (oxígeno disuelto y cloro recuperados), vuelve a poner la bomba de descarga en AUTO (válvula al mar abierta)',
    do: (p, act, run) => { waitFor(p, run, (q) => treated(q) && q.sew.o2 > 1.5, 3600); act(p, 'stpPumpAuto', true); },
    check: (p) => p.sew.auto && treated(p) && isOpen(p, 'v-stp-ob'),
  },
  {
    phase: 4, view: 'incinerator',
    en: 'Check the incinerator is stopped and safe (no lockout, charging door closed)',
    es: 'Comprueba que el incinerador está parado y seguro (sin bloqueo y con la puerta de carga cerrada)',
    check: (p) => ['off', 'firing'].includes(p.inc.state) && !p.inc.door,
  },
  // ======================= 5 · Motor principal y salida =======================
  {
    phase: 5, view: 'sterntube',
    en: 'When the stern tube LO gravity tank is above half, stop the filling pump (seal header tanks above 30 %)',
    es: 'Cuando el tanque de gravedad de aceite de la bocina pase de la mitad, para la bomba de llenado (tanques de los sellos por encima del 30 %)',
    do: (p, act, run) => {
      waitFor(p, run, (q) => pct(q.c.stGrav) > 50, 1800);
      act(p, 'stop', 'stFill'); run(p, 2);
    },
    check: (p) => !runs(p, 'stFill') && pct(p.c.stGrav) >= 40 && pct(p.c.stAft) >= 30 && pct(p.c.stFwd) >= 30,
  },
  {
    phase: 5, view: 'air',
    en: 'Wait until the main air receivers are above 25 bar, then drain the condensate from both receivers',
    es: 'Espera a que las botellas principales pasen de 25 bar y purga el condensado de las dos botellas',
    do: (p, act, run) => {
      waitFor(p, run, (q) => q.c.mr1.press > 28 && q.c.mr2.press > 28, 900);
      act(p, 'open', 'v-mr1-drain'); act(p, 'open', 'v-mr2-drain'); run(p, 10);
      act(p, 'close', 'v-mr1-drain'); act(p, 'close', 'v-mr2-drain'); run(p, 60);
    },
    check: (p) => p.c.mr1.press > 25 && p.c.mr2.press > 25 && p.airWater.mr1 < 0.3,
  },
  {
    phase: 5, view: 'air',
    en: 'Close the emergency receiver valve to the DG starting line (keep the emergency receiver full)',
    es: 'Cierra la válvula de la botella de emergencia a la línea de arranque de los generadores (botella de emergencia llena y reservada)',
    do: (p, act) => { act(p, 'close', 'v-emr-dg'); },
    check: (p) => !isOpen(p, 'v-emr-dg') && (p.sig.dgStartAir ?? 0) > 10,
  },
  {
    phase: 5, view: 'me',
    en: 'With LO pressure normal, turn the engine with the turning gear, then DISENGAGE the turning gear',
    es: 'Con presión de aceite normal, vira el motor con el virador y luego DESENGRANA el virador',
    do: (p, act) => { act(p, 'meTurningGear', false); },
    check: (p) => !p.me.turningGear,
  },
  {
    phase: 5, view: 'me',
    en: 'Open the ME main starting valve (starting air above 15 bar)',
    es: 'Abre la válvula principal de arranque del MP (aire de arranque por encima de 15 bar)',
    do: (p, act) => { act(p, 'open', 'me-msv'); },
    check: (p) => isOpen(p, 'me-msv') && (p.sig.meStartAir ?? 0) > 15,
  },
  {
    phase: 5, view: 'steering',
    en: 'Start steering gear pumps No 1 and No 2 and test the rudder from the bridge (hard over to port and starboard, then midships)',
    es: 'Arranca las bombas del servo nº 1 y nº 2 y prueba el timón desde el puente (todo a babor, todo a estribor y a la vía)',
    do: (p, act, run) => {
      act(p, 'start', 'sgp1'); act(p, 'start', 'sgp2'); run(p, 3);
      act(p, 'sgHelm', -35); run(p, 15); act(p, 'sgHelm', 35); run(p, 20); act(p, 'sgHelm', 0); run(p, 15);
    },
    check: (p) => runs(p, 'sgp1') && runs(p, 'sgp2') && Math.abs(p.sg.rudder) < 1,
  },
  {
    phase: 5, view: 'cooling',
    en: 'Check the ME is preheated: jacket water above 60 °C with an HT pump running',
    es: 'Comprueba que el MP está precalentado: agua de camisas por encima de 60 °C con una bomba AT en marcha',
    do: (p, act, run) => waitFor(p, run, (q) => q.cool.htT > 60, 3600),
    check: (p) => p.cool.htT > 58 && (p.sig.htFlow ?? 0) > 0.3,
  },
  {
    phase: 5, view: 'me',
    en: 'Check the auxiliary blowers in AUTO and all start interlocks clear (READY TO START)',
    es: 'Comprueba las soplantes auxiliares en AUTO y sin enclavamientos de arranque (LISTO PARA ARRANCAR)',
    do: (p, act) => { if (!p.me.blowerAuto) act(p, 'meBlowerAuto', true); },
    check: (p) => p.me.blowerAuto && meReady(p),
  },
  {
    phase: 5, view: 'bridge',
    en: 'Bridge rings DEAD SLOW AHEAD on the engine telegraph',
    es: 'El puente da AVANTE MUY POCA en el telégrafo',
    do: (p, act) => { act(p, 'meTelegraph', 'DSA'); },
    check: (p) => p.me.tel === 5,
  },
  {
    phase: 5, view: 'me',
    en: 'In the ECR, answer the telegraph with the ECR lever to DEAD SLOW AHEAD: the engine starts on air and runs on fuel',
    es: 'En la sala de control, contesta el telégrafo con la palanca de la ECR en AVANTE MUY POCA: el motor arranca con aire y entra en combustible',
    do: (p, act, run) => { act(p, 'meAnswer', 'DSA'); run(p, 30); },
    check: (p) => p.me.state === 'running' && p.me.rpm > 20,
  },
  {
    phase: 5, view: 'steam',
    en: 'Start the exhaust gas economizer circulating pump',
    es: 'Arranca la bomba de circulación del economizador de gases de escape',
    do: (p, act, run) => { act(p, 'start', 'egcp'); run(p, 5); },
    check: (p) => runs(p, 'egcp'),
  },
  {
    phase: 5, view: 'me',
    en: 'Request BRIDGE control from the ECR (control transfer)',
    es: 'Pide desde la sala de control el paso del control al PUENTE (transferencia)',
    do: (p, act) => { act(p, 'meTransfer', 'bridge'); },
    check: (p) => p.me.transferReq === 'bridge' || p.me.control === 'bridge',
  },
  {
    phase: 5, view: 'bridge',
    en: 'On the bridge, with the telegraph matching the ECR lever, press ACCEPT TRANSFER',
    es: 'En el puente, con el telégrafo igual que la palanca de la ECR, pulsa ACCEPT TRANSFER (aceptar transferencia)',
    do: (p, act, run) => { act(p, 'meTransferAccept'); run(p, 5); },
    check: (p) => p.me.control === 'bridge' && p.me.state === 'running',
  },
  {
    phase: 5, view: 'bridge',
    en: 'Increase speed step by step with the telegraph: SLOW, HALF, FULL and NAV. FULL AHEAD (follow the load programme)',
    es: 'Aumenta la velocidad por pasos con el telégrafo: POCA, MEDIA, TODA y AVANTE TODA DE NAVEGACIÓN (sigue el programa de carga)',
    do: (p, act, run) => {
      for (const o of ['SA', 'HA', 'FA']) { act(p, 'meTelegraph', o); run(p, 60); }
      act(p, 'meTelegraph', 'NFA'); waitFor(p, run, (q) => q.me.rpm > 88, 900);
    },
    check: (p) => p.me.control === 'bridge' && p.me.rpm > 50,
  },
  {
    phase: 5, view: 'fwg',
    en: 'Fresh water generator: open sea suction and overboard valves, start the ejector pump and wait for vacuum (air valve closed)',
    es: 'Generador de agua dulce: abre la aspiración de mar y la descarga al costado, arranca la bomba del eyector y espera el vacío (válvula de aire cerrada)',
    do: (p, act, run) => {
      act(p, 'open', 'v-fwg-suc'); act(p, 'open', 'v-fwg-ovbd'); act(p, 'start', 'fwgEj');
      waitFor(p, run, (q) => q.fwg.vac < -0.88, 600);
    },
    check: (p) => p.fwg.vac < -0.85,
  },
  {
    phase: 5, view: 'fwg',
    en: 'Open the FWG feed water valve and the jacket water inlet/outlet valves; when it boils, start the distillate pump and open the valve to FW tank (P)',
    es: 'Abre la alimentación del FWG y las válvulas de entrada y salida de agua de camisas; cuando hierva, arranca la bomba de destilado y abre la válvula al tanque de agua dulce (Br)',
    do: (p, act, run) => {
      act(p, 'open', 'v-fwg-feed'); act(p, 'open', 'v-fwg-hwin'); act(p, 'open', 'v-fwg-hwout'); run(p, 60);
      act(p, 'open', 'v-fwg-fillP'); act(p, 'start', 'fwgDp');
      waitFor(p, run, (q) => q.fwg.prod > 10 && q.fwg.toTank, 900);
    },
    check: (p) => p.fwg.prod > 10 && p.fwg.toTank && runs(p, 'fwgDp'),
  },
  {
    phase: 5, view: 'hfo1',
    en: 'When the settling tank is above 60 °C, HFO purifier No 1: open suction and outlet valves, START, HEATER ON, WATER SEAL, then FEED ON at 98 °C',
    es: 'Con la sedimentación por encima de 60 °C, depuradora de HFO nº 1: abre aspiración y salida, START, HEATER ON, WATER SEAL y FEED ON a 98 °C',
    do: (p, act, run) => {
      waitFor(p, run, (q) => q.c.hfoSett.temp > 60, 3600);
      act(p, 'open', 'hfop1-suc'); act(p, 'open', 'hfop1-out'); act(p, 'start', 'hfop1'); run(p, 10);
      act(p, 'purHeater', 'hfop1', true);
      waitFor(p, run, (q) => q.pur.hfop1.speed >= 0.95, 300);
      act(p, 'purSeal', 'hfop1'); run(p, 15);
      waitFor(p, run, (q) => q.pur.hfop1.temp > 92, 1200);
      act(p, 'purFeed', 'hfop1', true); run(p, 10);
    },
    check: (p) => purState(p, 'hfop1') === 'separating' && p.c.hfoSett.temp > 60 && p.c.hfoServ.temp > 60,
  },
  {
    phase: 5, view: 'fcm',
    en: 'At sea, with the HFO service tank above 70 °C, change the ME over from DO to HFO: viscosity controller in TEMP mode, set point 137 °C (about 13 cSt; ramp 1.2 °C/min, max. 2 °C/min), changeover valve to HFO',
    es: 'Ya navegando, con el tanque de servicio de HFO por encima de 70 °C, cambia el MP de diésel a HFO: controlador de viscosidad en modo TEMP, consigna 137 °C (unos 13 cSt; rampa de 1,2 °C/min, máx. 2 °C/min) y válvula de cambio a HFO',
    do: (p, act, run) => { waitFor(p, run, (q) => q.c.hfoServ.temp > 70, 3600); act(p, 'fcmMode', 'temp'); act(p, 'fcmTempSet', 137); act(p, 'fcmChangeover', 'HFO'); run(p, 10); },
    check: (p) => p.fuel.fcm.co === 'HFO' && p.fuel.fcm.mode === 'temp',
  },
  {
    phase: 5, view: 'fcm',
    en: 'When the fuel temperature reaches the set point (137 °C, about 13 cSt), put the viscosity controller in VISC mode (13 cSt)',
    es: 'Cuando el combustible llegue a la consigna (137 °C, unos 13 cSt), pasa el controlador de viscosidad a modo VISC (13 cSt)',
    do: (p, act, run) => { waitFor(p, run, (q) => q.fuel.fcm.T > 136.5, 7200); act(p, 'fcmMode', 'visc'); run(p, 60); },
    check: (p) => p.fuel.fcm.mode === 'visc' && p.sig.meFuelType === 'HFO' && p.sig.meFuelVisc > 10 && p.sig.meFuelVisc < 15,
  },
];
