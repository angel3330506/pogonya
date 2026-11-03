// Все звуки синтезируются на лету через WebAudio — никаких файлов.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(c.destination);
      // шум для ударов/взрывов
      const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // мотор
      this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 50;
      this.eng2 = c.createOscillator(); this.eng2.type = 'square'; this.eng2.frequency.value = 25;
      this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400;
      this.engG = c.createGain(); this.engG.gain.value = 0;
      const g2 = c.createGain(); g2.gain.value = 0.5;
      this.eng.connect(this.engF); this.eng2.connect(g2); g2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master);
      this.eng.start(); this.eng2.start();
      // сирена
      this.sir = c.createOscillator(); this.sir.type = 'triangle'; this.sir.frequency.value = 700;
      this.sirG = c.createGain(); this.sirG.gain.value = 0;
      this.sir.connect(this.sirG); this.sirG.connect(this.master); this.sir.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.8 : 0; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  engine(speed01, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.eng.frequency.setTargetAtTime(45 + speed01 * 120, t, 0.08);
    this.eng2.frequency.setTargetAtTime(22 + speed01 * 60, t, 0.08);
    this.engF.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
    this.engG.gain.setTargetAtTime(active ? 0.06 + speed01 * 0.05 : 0, t, 0.1);
  }

  siren(level, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sir.frequency.setTargetAtTime(Math.sin(time * 5) > 0 ? 960 : 720, t, 0.02);
    this.sirG.gain.setTargetAtTime(level * 0.05, t, 0.1);
  }

  _noise(dur, freq, vol, type = 'lowpass') {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur);
  }
  _tone(freq, dur, vol, type = 'sine', t0 = 0, slide) {
    const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  crash(power) { if (!this.ctx) return; const p = Math.min(1, power); this._noise(0.15 + p * 0.3, 700 + p * 1500, 0.15 + p * 0.45); this._tone(90, 0.2, 0.2 * p, 'square', 0, 40); }
  thud() { if (!this.ctx) return; this._noise(0.12, 500, 0.18); }
  boom() { if (!this.ctx) return; this._noise(1.2, 380, 0.9); this._tone(120, 0.8, 0.5, 'sine', 0, 30); }
  coin() { if (!this.ctx) return; this._tone(1320, 0.09, 0.18, 'square'); this._tone(1980, 0.18, 0.15, 'square', 0.07); }
  heal() { if (!this.ctx) return; [660, 880, 1100].forEach((f, i) => this._tone(f, 0.15, 0.15, 'triangle', i * 0.07)); }
  splash() { if (!this.ctx) return; this._noise(0.9, 1200, 0.5, 'bandpass'); }
  tick() { if (!this.ctx) return; this._tone(2200, 0.03, 0.12, 'square'); }
  click() { if (!this.ctx) return; this._tone(900, 0.05, 0.1, 'triangle'); }
  win() { if (!this.ctx) return; [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.3, 0.18, 'triangle', i * 0.09)); }
  star() { if (!this.ctx) return; this._tone(880, 0.12, 0.12, 'triangle'); this._tone(1320, 0.2, 0.12, 'triangle', 0.1); }
}
