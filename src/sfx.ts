// Procedural WebAudio SFX — no assets, all synthesized. DOOM-ish crunch.
let ctx: AudioContext | null = null;
let chainsawNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(dur: number, freq: number, gainPeak: number, type: BiquadFilterType = 'lowpass') {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const gain = a.createGain();
  gain.gain.setValueAtTime(gainPeak, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

function tone(freqFrom: number, freqTo: number, dur: number, gainPeak: number, type: OscillatorType = 'square') {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), a.currentTime + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(gainPeak, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  osc.connect(gain).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + dur);
}

export const sfx = {
  unlock() {
    audio();
  },
  pistol() {
    noiseBurst(0.09, 2500, 0.4);
    tone(220, 60, 0.09, 0.2, 'square');
  },
  shotgun() {
    noiseBurst(0.28, 900, 0.7);
    tone(140, 40, 0.25, 0.35, 'sawtooth');
  },
  chainsawStart() {
    const a = audio();
    if (!a || chainsawNode) return;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 75;
    const lfo = a.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 25;
    lfo.connect(lfoGain).connect(osc.frequency);
    const gain = a.createGain();
    gain.gain.value = 0.12;
    osc.connect(gain).connect(a.destination);
    osc.start();
    lfo.start();
    chainsawNode = { osc, gain, lfo };
  },
  chainsawStop() {
    if (!chainsawNode) return;
    try {
      chainsawNode.gain.gain.setTargetAtTime(0, audio()!.currentTime, 0.05);
      chainsawNode.osc.stop(audio()!.currentTime + 0.2);
      chainsawNode.lfo.stop(audio()!.currentTime + 0.2);
    } catch { /* already stopped */ }
    chainsawNode = null;
  },
  demonDie() {
    tone(400, 50, 0.35, 0.3, 'square');
    noiseBurst(0.2, 500, 0.25);
  },
  shieldPing() {
    tone(1800, 1200, 0.08, 0.2, 'triangle');
  },
  spellCast() {
    tone(200, 1600, 0.4, 0.25, 'sawtooth');
  },
  explosion() {
    noiseBurst(0.6, 400, 0.8);
    tone(90, 25, 0.5, 0.4, 'sawtooth');
  },
  door() {
    tone(80, 160, 0.5, 0.3, 'sawtooth');
    noiseBurst(0.4, 300, 0.15);
  },
  hurt() {
    tone(120, 60, 0.15, 0.4, 'square');
  },
  step() {
    noiseBurst(0.04, 400, 0.08);
  },
};
