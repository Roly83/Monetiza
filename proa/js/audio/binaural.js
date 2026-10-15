// Motor de sonido binaural con Web Audio API.
// Un tono distinto en cada oído (p. ej. 200 Hz y 206 Hz): el cerebro percibe un "pulso" de 6 Hz.
// Se acompaña de ruido rosa con oleaje para enmascarar los tonos. Requiere auriculares.

export const PRESETS = {
  alfa: { label: 'Alfa · 10 Hz (relajación atenta, ideal para memorizar)', beat: 10, carrier: 220 },
  theta: { label: 'Theta · 6 Hz (relajación profunda, hipnosis)', beat: 6, carrier: 200 },
  'alfa-theta': { label: 'Descenso alfa → theta (inducción progresiva)', beat: 10, toBeat: 6, carrier: 210 },
  beta: { label: 'Beta baja · 14 Hz (repaso activo)', beat: 14, carrier: 240 },
};

// Frecuencias de cada oído para un pulso dado (función pura, testeable).
export function earFrequencies(carrier, beat) {
  return { left: carrier - beat / 2, right: carrier + beat / 2 };
}

function pinkNoiseBuffer(ctx, seconds = 4) {
  const len = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // Filtro de Paul Kellet para ruido rosa.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

export class BinauralEngine {
  constructor() {
    this.ctx = null;
    this.nodes = [];
    this.master = null;
    this.running = false;
  }

  async start({ preset = 'theta', volume = 0.35, ocean = true, rampSeconds = 300 } = {}) {
    if (this.running) this.stop(0);
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) throw new Error('Este navegador no soporta Web Audio.');
    this.ctx = this.ctx ?? new Ctx();
    await this.ctx.resume();
    const ctx = this.ctx;
    const p = PRESETS[preset] ?? PRESETS.theta;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(volume, now + 8); // entrada suave
    this.master.connect(ctx.destination);

    const merger = ctx.createChannelMerger(2);
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.25;
    merger.connect(toneGain).connect(this.master);

    const { left, right } = earFrequencies(p.carrier, p.beat);
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.frequency.setValueAtTime(left, now);
    oscR.frequency.setValueAtTime(right, now);
    if (p.toBeat) {
      const end = earFrequencies(p.carrier, p.toBeat);
      oscL.frequency.linearRampToValueAtTime(end.left, now + rampSeconds);
      oscR.frequency.linearRampToValueAtTime(end.right, now + rampSeconds);
    }
    oscL.connect(merger, 0, 0);
    oscR.connect(merger, 0, 1);
    oscL.start();
    oscR.start();
    this.nodes.push(oscL, oscR);

    if (ocean) {
      const noise = ctx.createBufferSource();
      noise.buffer = pinkNoiseBuffer(ctx);
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.35;
      // Oleaje: modulación lenta del volumen (una ola cada ~9 s).
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.25;
      lfo.connect(lfoDepth).connect(waveGain.gain);
      noise.connect(lp).connect(waveGain).connect(this.master);
      noise.start();
      lfo.start();
      this.nodes.push(noise, lfo);
    }
    this.running = true;
  }

  setVolume(v) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5);
  }

  // Bajada suave del sonido y parada.
  stop(fadeSeconds = 4) {
    if (!this.ctx || !this.running) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    const nodes = this.nodes;
    this.nodes = [];
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch {} }), fadeSeconds * 1000 + 100);
    this.running = false;
  }

  suspend() { return this.ctx?.suspend(); }
  resume() { return this.ctx?.resume(); }
}
