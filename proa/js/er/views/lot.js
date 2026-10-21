// Vista «LO Transfer System»: trasiego de aceite desde el almacén o la sedimentación al cárter del MP,
// a los cárteres de los generadores, al tanque de bocina o a la sedimentación.
import { h } from '../../core/ui.js';
import { mimic } from '../ui/mimic.js';
import { bi } from '../ui/widgets.js';

export default {
  id: 'lot', en: 'LO Transfer System', es: 'Trasiego de aceite', indent: true,
  render(ctx) {
    const pumping = (p) => p.c.lotp.run && (p.c['v-lot-stor'].open || p.c['v-lot-sett'].open);
    const to = (id) => (p) => pumping(p) && p.c[id].open;
    const dsts = [
      ['v-lot-me', 'meSump', 'ME sump', 'Cárter MP'],
      ['v-lot-dg1', 'dg1Sump', 'DG 1 sump', 'Cárter DG 1'], ['v-lot-dg2', 'dg2Sump', 'DG 2 sump', 'Cárter DG 2'], ['v-lot-dg3', 'dg3Sump', 'DG 3 sump', 'Cárter DG 3'],
      ['v-lot-stern', 'stGrav', 'Stern tube', 'Bocina'],
    ];
    const els = [
      { t: 'label', x: 500, y: 26, en: 'Lubricating Oil Transfer System', es: 'Sistema de trasiego de aceite lubricante', size: 15 },
      { t: 'pipe', d: 'M110 240 V300 H200 V380 H284', fluid: 'lo', on: (p) => pumping(p) && p.c['v-lot-stor'].open },
      { t: 'pipe', d: 'M290 240 V300 H200', fluid: 'lo', on: (p) => pumping(p) && p.c['v-lot-sett'].open },
      { t: 'pipe', d: 'M316 380 H380 V200 H940', fluid: 'lo', on: pumping },
      { t: 'pipe', d: 'M380 380 V470 H290 V420', fluid: 'lo', on: to('v-lot-tosett') },
      { t: 'tank', id: 'loStor', x: 50, y: 110, w: 120, h: 130, en: 'LO storage tank', es: 'Almacén de aceite' },
      { t: 'tank', id: 'loSett', x: 240, y: 110, w: 100, h: 130, en: 'LO settling tank', es: 'Sedimentación' },
      { t: 'valve', id: 'v-lot-stor', x: 110, y: 280, vertical: true, en: '', es: '' },
      { t: 'valve', id: 'v-lot-sett', x: 290, y: 280, vertical: true, en: '', es: '' },
      { t: 'pump', id: 'lotp', x: 300, y: 380 },
      { t: 'valve', id: 'v-lot-tosett', x: 380, y: 440, vertical: true, en: 'To settling', es: 'A sedimentación', lx: -52, ly: 0 },
    ];
    dsts.forEach(([v, tank, en, es], i) => {
      const x = 440 + i * 110;
      els.push({ t: 'pipe', d: `M${x + 45} 200 V340`, fluid: 'lo', on: to(v) });
      els.push({ t: 'valve', id: v, x: x + 45, y: 260, vertical: true, en: '', es: '' });
      if (ctx.p().c[tank]) els.push({ t: 'tank', id: tank, x, y: 340, w: 90, h: 110, en, es });
      else els.push({ t: 'box', x, y: 340, w: 90, h: 110, en, es });
    });
    els.push(
      { t: 'value', x: 50, y: 520, w: 130, get: (p) => p.c.loSett.water, unit: '% w', dec: 2, en: 'Water in settling', es: 'Agua en sedimentación' },
      { t: 'value', x: 200, y: 520, w: 130, get: (p) => p.c.meSump.water, unit: '% w', dec: 2, en: 'Water in ME sump', es: 'Agua en cárter MP', warn: (p) => p.c.meSump.water > 0.2, nav: 'melop' },
      { t: 'box', x: 440, y: 500, w: 140, h: 50, en: 'DG LO purifier →', es: 'Depuradora aceite DG', nav: 'dglop', size: 11 },
      { t: 'box', x: 600, y: 500, w: 140, h: 50, en: 'ME LO system →', es: 'Aceite del MP', nav: 'lube', size: 11 },
    );
    const m = mimic(els, ctx);
    return { el: h('div', {}, m.el, h('p', { class: 'muted small' }, bi('Open one suction and the destination valve, then start the pump. Watch the levels: stop before overfilling.', 'Abre una aspiración y la válvula de destino y arranca la bomba. Vigila los niveles: para antes de rebosar.'))), update: m.update };
  },
};
