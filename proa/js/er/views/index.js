// Lista de vistas del simulador, en el orden de «System selection» del simulador real.
import controlView from './control.js';
import bridgeView from './bridge.js';
import dgView from './dg.js';
import msbView from './msb.js';
import egView from './eg.js';
import esbView from './esb.js';
import meView from './me.js';
import sterntubeView from './sterntube.js';
import airView from './air.js';
import coolingView from './cooling.js';
import fuelView from './fuel.js';
import fcmView from './fcm.js';
import hfo1View from './hfo1.js';
import hfo2View from './hfo2.js';
import lubeView from './lube.js';
import lotView from './lot.js';
import melopView from './melop.js';
import dglopView from './dglop.js';
import steamView from './steam.js';
import fwgView from './fwg.js';
import ballastView from './ballast.js';
import sanitaryView from './sanitary.js';
import bilgeView from './bilge.js';
import steeringView from './steering.js';
import sewageView from './sewage.js';
import co2View from './co2.js';
import mistView from './mist.js';
import refrigView from './refrig.js';
import acView from './ac.js';
import incineratorView from './incinerator.js';
import { options, assessment, config } from './pages.js';

export const VIEWS = [
  controlView, bridgeView, dgView, msbView, egView, esbView, meView, sterntubeView, airView, coolingView, fuelView, fcmView, hfo1View, hfo2View, lubeView, lotView, melopView, dglopView, steamView, fwgView, ballastView, sanitaryView, bilgeView, steeringView, sewageView, co2View, mistView, refrigView, acView, incineratorView,
  options, assessment, config,
];
