// Vista «Control Room»: resumen de toda la planta en la consola de la sala de control (ECR).
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';

const v = (x, y, en, es, get, unit, dec, nav, warn, w = 120) => ({ t: 'value', x, y, en, es, get, unit, dec, nav, warn, w });
const sig = (k, d = null) => (p) => p.sig[k] ?? d;

export default {
  id: 'control', en: 'Control Room', es: 'Sala de control',
  render(ctx) {
    const els = [
      { t: 'label', x: 500, y: 30, en: 'Engine Control Room — plant overview', es: 'Sala de control de máquinas — resumen de la planta', size: 15 },
      // Planta eléctrica
      { t: 'pipe', d: 'M60 130 H560', fluid: 'elec', on: (p) => p.sig.msbLive },
      { t: 'pipe', d: 'M560 130 H640', fluid: 'elec', on: (p) => p.elec.eg.tie && p.sig.msbLive },
      { t: 'pipe', d: 'M640 130 H900', fluid: 'elec', on: (p) => p.sig.esbLive },
      { t: 'label', x: 100, y: 118, en: 'MSB', es: 'Cuadro principal', size: 11 },
      { t: 'label', x: 760, y: 118, en: 'ESB', es: 'Cuadro de emergencia', size: 11 },
      ...[1, 2, 3].map((n) => ({ t: 'box', x: 60 + (n - 1) * 160, y: 160, w: 130, h: 60, en: `DG ${n}`, es: '', nav: 'dg', size: 13,
        state: (p) => { const g = p.elec.dg[n - 1]; return g.trip && g.trip !== 'start' ? 'alarm' : g.breaker ? 'run' : g.state === 'running' ? 'warn' : 'stop'; } })),
      ...[1, 2, 3].map((n) => v(70 + (n - 1) * 160, 195, null, null, (p) => p.elec.dg[n - 1].kw, 'kW', 0, 'msb', null, 110)),
      { t: 'box', x: 760, y: 160, w: 140, h: 60, en: 'Emergency gen.', es: 'Generador de emergencia', nav: 'eg', size: 12,
        state: (p) => (p.elec.eg.breaker ? 'run' : ['running', 'cooldown'].includes(p.elec.eg.state) ? 'warn' : 'stop') },
      v(560, 165, 'Bus frequency', 'Frecuencia', (p) => p.elec.busF, 'Hz', 2, 'msb', (p) => p.sig.msbLive && Math.abs(p.elec.busF - 60) > 1),
      v(560, 210, 'Plant load', 'Carga', (p) => p.elec.msbKw, 'kW', 0, 'msb'),
      // Motor principal y servicios
      { t: 'box', x: 60, y: 270, w: 300, h: 150, en: 'Main Engine', es: 'Motor principal', ty: 22, nav: 'me', state: (p) => (p.sig.meRunning ? 'run' : 'stop') },
      v(80, 320, 'Speed', 'Revoluciones', sig('meRpm', 0), 'rpm', 0, 'me'),
      v(220, 320, 'Load', 'Carga', (p) => 100 * (p.sig.meLoad ?? 0), '%', 0, 'me'),
      v(80, 375, 'LO pressure', 'Presión aceite', sig('meLoPress'), 'bar', 1, 'lube', (p) => p.sig.meRunning && (p.sig.meLoPress ?? 3) < 2),
      v(220, 375, 'JCW outlet', 'Agua camisas', sig('htTemp'), '°C', 0, 'cooling', (p) => (p.sig.htTemp ?? 80) > 92),
      v(420, 290, 'Starting air', 'Aire de arranque', sig('meStartAir'), 'bar', 1, 'air', (p) => (p.sig.meStartAir ?? 30) < 15),
      v(420, 345, 'Control air', 'Aire de control', sig('controlAir'), 'bar', 1, 'air', (p) => (p.sig.controlAir ?? 7) < 5),
      v(420, 400, 'LT FW temp.', 'Agua dulce BT', sig('ltTemp'), '°C', 1, 'cooling'),
      v(580, 290, 'Fuel pressure', 'Presión combustible', sig('meFuelPress'), 'bar', 1, 'fcm'),
      v(580, 345, 'Fuel viscosity', 'Viscosidad', sig('meFuelVisc'), 'cSt', 1, 'fcm', (p) => p.sig.meFuelVisc && (p.sig.meFuelVisc < 10 || p.sig.meFuelVisc > 17)),
      v(580, 400, 'Steam pressure', 'Presión de vapor', sig('steamPress'), 'bar', 1, 'steam'),
      v(740, 290, 'Rudder angle', 'Ángulo de timón', sig('rudderAngle'), '°', 0, 'steering'),
      v(740, 345, 'Ship speed', 'Velocidad', sig('shipSpeed'), 'kn', 1, 'bridge'),
      v(740, 400, 'Fire main', 'Colector C.I.', sig('fireMainPress'), 'bar', 1, 'cooling'),
      v(60, 480, 'HFO service tank', 'Tanque servicio HFO', sig('hfoServicePct'), '%', 0, 'fuel', (p) => (p.sig.hfoServicePct ?? 80) < 30),
      v(220, 480, 'ER bilge', 'Sentina', sig('bilgeMaxPct'), '%', 0, 'bilge', (p) => (p.sig.bilgeMaxPct ?? 0) > 70),
      v(380, 480, 'Fresh water', 'Agua dulce', sig('fwTankPct'), '%', 0, 'sanitary'),
      v(540, 480, 'Heel', 'Escora', sig('heel'), '°', 1, 'ballast', (p) => Math.abs(p.sig.heel ?? 0) > 3),
      v(700, 480, 'Fire alarms', 'Incendios', (p) => (p.sig.fireCount ?? 0) || 'NONE', '', 0, 'mist', (p) => (p.sig.fireCount ?? 0) > 0),
      { t: 'label', x: 500, y: 560, en: 'Click a value to open its system.', es: 'Toca un valor para abrir su sistema.', size: 11 },
    ];
    const m = mimic(els, ctx);
    return { el: m.el, update: m.update };
  },
};
