// Vista «DG LO Purifier»: depuradora de aceite de los generadores (se alinea a un generador con sus válvulas).
import { purifierView } from './purifier-view.js';

export default purifierView({
  id: 'dglop', viewId: 'dglop', en: 'DG LO Purifier', es: 'Depuradora de aceite de los DG', fluid: 'lo',
  src: ['dg1Sump', 'dg2Sump', 'dg3Sump'], selValves: ['v-dglop-dg1', 'v-dglop-dg2', 'v-dglop-dg3'], dst: null,
});
