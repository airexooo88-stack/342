import { Settings } from './Settings';

/**
 * Procedural sound effects synthesized with the Web Audio API.
 * Everything (gunfire, reloads, hits, UI) is generated at runtime so the
 * prototype ships with zero audio assets.
 */
class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Must be triggered by a user gesture (browser autoplay policy). */
  resume() {
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  private init() {
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = Settings.get().masterVolume;
      this.master.connect(this.ctx.destination);
      // pre-bake a white-noise buffer for percussive/explosion textures
      const len = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      Settings.onChange((s) => {
        if (this.master) this.master.gain.value = s.masterVolume;
      });
    } catch {
      this.ctx = null;
    }
  }

  private get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noise(duration: number, gain: number, filterFreq: number, q = 1) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.now;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    gain: number,
    type: OscillatorType = 'square'
  ) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.now;
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }

  /** Spatial-ish attenuation based on distance for AI gunfire etc. */
  private dist(volume: number, distance: number) {
    const v = volume / (1 + distance * distance * 0.01);
    return Math.max(0, Math.min(1, v));
  }

  // ----------------------------------------------------------- public SFX
  shootRifle(distance = 0) {
    const v = this.dist(0.55, distance);
    if (v <= 0.001) return;
    this.tone(420, 90, 0.09, v, 'sawtooth');
    this.noise(0.12, v * 0.9, 1800, 0.7);
    this.noise(0.05, v * 0.5, 600, 1);
  }

  shootPistol(distance = 0) {
    const v = this.dist(0.5, distance);
    if (v <= 0.001) return;
    this.tone(520, 120, 0.07, v, 'square');
    this.noise(0.08, v * 0.7, 2200, 0.8);
  }

  knifeSwing() {
    this.noise(0.16, 0.3, 1200, 0.5);
  }

  knifeHit() {
    this.tone(180, 60, 0.12, 0.4, 'square');
    this.noise(0.1, 0.4, 500, 1);
  }

  reloadClick() {
    this.tone(900, 700, 0.04, 0.25, 'square');
  }

  reloadDone() {
    this.tone(700, 1100, 0.06, 0.25, 'square');
  }

  hitFlesh() {
    this.tone(260, 120, 0.06, 0.3, 'square');
    this.noise(0.05, 0.25, 700, 1);
  }

  hitMarker() {
    this.tone(1400, 1400, 0.03, 0.18, 'sine');
  }

  hitWall(distance = 0) {
    const v = this.dist(0.3, distance);
    this.noise(0.05, v, 3200, 1.2);
  }

  explosion() {
    this.noise(0.9, 0.9, 220, 0.6);
    this.tone(120, 30, 0.8, 0.7, 'sawtooth');
  }

  beep() {
    this.tone(1500, 1500, 0.05, 0.25, 'sine');
  }

  uiHover() {
    this.tone(660, 660, 0.03, 0.08, 'sine');
  }

  uiClick() {
    this.tone(880, 1200, 0.05, 0.14, 'square');
  }

  footstep() {
    this.noise(0.05, 0.06, 350, 2);
  }

  roundWin() {
    this.tone(523, 523, 0.12, 0.25, 'square');
    setTimeout(() => this.tone(784, 784, 0.18, 0.25, 'square'), 120);
  }

  roundLose() {
    this.tone(330, 220, 0.4, 0.25, 'sawtooth');
  }
}

export const Audio = new AudioSynth();
