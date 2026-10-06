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
    noiseBurst(0.02, 6000, 0.3, 'highpass');
    noiseBurst(0.08, 3000, 0.45);
    tone(180, 50, 0.1, 0.25, 'square');
    const a = audio();
    if (a) setTimeout(() => noiseBurst(0.09, 1200, 0.13), 90); // echo tail
  },
  shotgun() {
    noiseBurst(0.3, 700, 0.75);
    tone(110, 35, 0.3, 0.4, 'sawtooth');
    const a = audio();
    if (a) setTimeout(() => noiseBurst(0.25, 500, 0.28), 120);
  },
  pump1() {
    tone(900, 300, 0.05, 0.2, 'triangle');
    noiseBurst(0.03, 2500, 0.15);
  },
  pump2() {
    tone(500, 900, 0.05, 0.2, 'triangle');
    noiseBurst(0.03, 3000, 0.15);
  },
  clank() {
    tone(1200, 400, 0.08, 0.3, 'triangle');
    noiseBurst(0.04, 4000, 0.2);
  },
  blink() {
    tone(1500, 300, 0.15, 0.12, 'sine');
  },
  doorSlide() {
    noiseBurst(0.6, 300, 0.2);
    tone(70, 90, 0.6, 0.15, 'sawtooth');
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
  chainsawRev(on: boolean) {
    const a = audio();
    if (!a || !chainsawNode) return;
    chainsawNode.osc.frequency.setTargetAtTime(on ? 120 : 75, a.currentTime, 0.05);
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
  growl() {
    tone(60, 40, 0.3, 0.12, 'sawtooth');
    noiseBurst(0.25, 200, 0.08);
  },
  bossRoar() {
    tone(50, 30, 1.2, 0.5, 'sawtooth');
    noiseBurst(1.0, 150, 0.4);
  },
  bossDie() {
    noiseBurst(0.6, 400, 0.8);
    tone(90, 25, 0.5, 0.4, 'sawtooth');
    const a = audio();
    if (a) {
      setTimeout(() => {
        noiseBurst(0.6, 400, 0.8);
        tone(90, 25, 0.5, 0.4, 'sawtooth');
      }, 150);
    }
  },
  alert() {
    tone(880, 440, 0.12, 0.25, 'square');
  },
};
