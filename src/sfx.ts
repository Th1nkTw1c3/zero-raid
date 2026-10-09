// Procedural WebAudio SFX — no assets, all synthesized. DOOM-ish crunch.
// When Freedoom ds*.wav samples are loaded they play instead of the synth.
let ctx: AudioContext | null = null;
let chainsawNode: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
let chainsawSample: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let sawLoopName = '';
const buffers = new Map<string, AudioBuffer>();
export let sfxReady = false;

// Load Freedoom wavs listed in the manifest; never blocks boot.
export async function loadSounds(): Promise<boolean> {
  try {
    const res = await fetch('freedoom/manifest.json');
    if (!res.ok) return false;
    const man = (await res.json()) as { sounds?: string[] };
    const names = man.sounds || [];
    if (!names.length) return false;
    const a = audio() || new AudioContext();
    await Promise.all(
      names.map(async (n) => {
        const r = await fetch(`freedoom/sounds/${n}`);
        if (!r.ok) return;
        const buf = await a.decodeAudioData(await r.arrayBuffer());
        buffers.set(n.replace(/\.wav$/, ''), buf);
      }),
    );
    sfxReady = buffers.size > 0;
    return sfxReady;
  } catch {
    return false;
  }
}

// Distance → volume (1 near, 0.2 at ~12 tiles).
function distVol(dist?: number): number {
  return dist == null ? 1 : Math.min(1, Math.max(0.2, 1.2 - dist * 0.08));
}

function sample(name: string, vol = 1): boolean {
  const a = audio();
  const b = buffers.get(name);
  if (!a || !b) return false;
  const src = a.createBufferSource();
  src.buffer = b;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(a.destination);
  src.start();
  return true;
}

function sampleLoop(name: string, vol = 1): { src: AudioBufferSourceNode; gain: GainNode } | null {
  const a = audio();
  const b = buffers.get(name);
  if (!a || !b) return null;
  const src = a.createBufferSource();
  src.buffer = b;
  src.loop = true;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(a.destination);
  src.start();
  return { src, gain: g };
}

const KIND_SIT: Record<string, string> = {
  imp: 'dsbgsit1', phantom: 'dssgtsit', cursed: 'dsbrssit',
  swarmer: 'dssklatk', bot: 'dsbspsit', boss: 'dscybsit',
};
const KIND_DIE: Record<string, string> = {
  imp: 'dsbgdth1', phantom: 'dssgtdth', cursed: 'dsbrsdth',
  swarmer: 'dsskldth', bot: 'dsbspdth', boss: 'dscybdth',
};

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
    if (sample('dspistol')) return;
    noiseBurst(0.02, 6000, 0.3, 'highpass');
    noiseBurst(0.08, 3000, 0.45);
    tone(180, 50, 0.1, 0.25, 'square');
    const a = audio();
    if (a) setTimeout(() => noiseBurst(0.09, 1200, 0.13), 90); // echo tail
  },
  shotgun() {
    if (sample('dsshotgn')) return;
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
    if (sample('dsdoropn')) return;
    noiseBurst(0.6, 300, 0.2);
    tone(70, 90, 0.6, 0.15, 'sawtooth');
  },
  chainsawStart() {
    const a = audio();
    if (!a || chainsawNode || chainsawSample) return;
    if (buffers.has('dssawidl')) {
      sample('dssawup');
      sawLoopName = 'dssawidl';
      chainsawSample = sampleLoop(sawLoopName, 0.4);
      return;
    }
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
    if (!a) return;
    if (chainsawSample) {
      const want = on ? 'dssawful' : 'dssawidl';
      if (want !== sawLoopName) {
        sawLoopName = want;
        try { chainsawSample.src.stop(); } catch { /* stopped */ }
        chainsawSample = sampleLoop(want, 0.45);
      }
      return;
    }
    if (!chainsawNode) return;
    chainsawNode.osc.frequency.setTargetAtTime(on ? 120 : 75, a.currentTime, 0.05);
  },
  sawHit() {
    if (sample('dssawhit')) return;
    noiseBurst(0.06, 1800, 0.2);
  },
  chainsawStop() {
    if (chainsawSample) {
      try { chainsawSample.src.stop(); } catch { /* stopped */ }
      chainsawSample = null;
      sawLoopName = '';
      return;
    }
    if (!chainsawNode) return;
    try {
      chainsawNode.gain.gain.setTargetAtTime(0, audio()!.currentTime, 0.05);
      chainsawNode.osc.stop(audio()!.currentTime + 0.2);
      chainsawNode.lfo.stop(audio()!.currentTime + 0.2);
    } catch { /* already stopped */ }
    chainsawNode = null;
  },
  demonDie(kind?: string, dist?: number) {
    if (kind && sample(KIND_DIE[kind] || 'dsbgdth1', distVol(dist))) return;
    if (sample('dsbgdth1', distVol(dist))) return;
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
    if (sample('dsplpain')) return;
    tone(120, 60, 0.15, 0.4, 'square');
  },
  barrel() {
    if (sample('dsbarexp')) return;
    this.explosion();
  },
  step() {
    noiseBurst(0.04, 400, 0.08);
  },
  growl(kind?: string, dist?: number) {
    if (kind && sample(KIND_SIT[kind] || 'dsbgsit1', distVol(dist))) return;
    if (sample('dsbgsit1', distVol(dist))) return;
    tone(60, 40, 0.3, 0.12, 'sawtooth');
    noiseBurst(0.25, 200, 0.08);
  },
  bossRoar() {
    if (sample('dscybsit')) return;
    tone(50, 30, 1.2, 0.5, 'sawtooth');
    noiseBurst(1.0, 150, 0.4);
  },
  bossDie() {
    if (sample('dscybdth')) return;
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
  fireball(dist?: number) {
    if (sample('dsfirsht', distVol(dist))) return;
    // whoosh — bandpass noise sweep down
    noiseBurst(0.25, 800, 0.3, 'bandpass');
    setTimeout(() => noiseBurst(0.2, 300, 0.18, 'bandpass'), 60);
  },
  hiss(dist?: number) {
    if (sample('dsfirxpl', distVol(dist))) return;
    noiseBurst(0.18, 2400, 0.22, 'highpass');
  },
};
