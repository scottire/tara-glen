// v12 audio: 100% procedural WebAudio (no files, no licences needed). Per zone: a short chiptune loop (square/triangle/sine,
// SNES-ish), a noise-based ambient bed, and random one-shots. Zone buses cross-fade. Starts on the first tap (iOS unlock);
// mute lives in the menu and is persisted.
type Song = { bpm: number; root: number; wave: OscillatorType; lead: (number | null)[]; bass: (number | null)[]; vol: number; kick?: boolean; lp?: number };
type Zone = { song: Song; bed?: { f: number; q: number; vol: number; lfo?: number; type?: BiquadFilterType }; shots: [string, number][] };
const N = null;
const ZONES: Record<string, Zone> = {
  z1: { song: { bpm: 88, root: 60, wave: 'triangle', vol: 0.07, lead: [0, N, 4, 7, 9, N, 7, 4, 5, N, 4, 2, 0, N, N, N], bass: [-12, N, N, N, -7, N, N, N, -15, N, N, N, -10, N, N, N] },
    bed: { f: 3000, q: 0.4, vol: 0.006 }, shots: [['bird', 2.5], ['bird', 4]] },
  z2: { song: { bpm: 132, root: 67, wave: 'square', vol: 0.045, lead: [0, 4, 7, 12, 7, 4, 0, 4, 2, 5, 9, 14, 9, 5, 2, N], bass: [-12, N, -5, N, -12, N, -5, N, -10, N, -3, N, -10, N, -3, N] },
    bed: { f: 1100, q: 1.2, vol: 0.02, lfo: 3.1 }, shots: [['kid', 3], ['squeak', 3.5]] },
  z3: { song: { bpm: 92, root: 57, wave: 'square', vol: 0.03, lead: [0, N, N, 3, N, N, 7, N, 5, N, 3, N, 2, N, N, N], bass: [-12, N, N, N, N, N, -12, N, -14, N, N, N, -9, N, N, N] },
    bed: { f: 400, q: 0.7, vol: 0.02, lfo: 0.15 }, shots: [['bark', 7]] },
  z4: { song: { bpm: 100, root: 65, wave: 'triangle', vol: 0.06, lead: [0, N, 7, N, 4, N, 9, N, 7, N, 12, N, 11, N, 7, N], bass: [-12, N, N, N, -5, N, N, N, -7, N, N, N, -10, N, N, N] },
    bed: { f: 700, q: 1.5, vol: 0.035, lfo: 0.2 }, shots: [['gull', 6], ['fore', 18]] },
  z5: { song: { bpm: 140, root: 62, wave: 'square', vol: 0.04, kick: true, lead: [0, 0, 4, N, 7, 7, 4, N, 5, 5, 9, N, 7, N, N, N], bass: [-12, N, -12, N, -5, N, -5, N, -7, N, -7, N, -12, N, -12, N] },
    bed: { f: 650, q: 0.8, vol: 0.05, lfo: 0.5 }, shots: [['chant', 9]] },
  z6: { song: { bpm: 120, root: 45, wave: 'sawtooth', vol: 0.06, kick: true, lp: 320, lead: [N, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N], bass: [N, N, 0, N, N, N, 0, N, N, N, 3, N, N, N, -2, N] },
    bed: { f: 4500, q: 6, vol: 0.004, lfo: 7 }, shots: [['cricket', 2]] },
  z7: { song: { bpm: 72, root: 63, wave: 'sine', vol: 0.07, lead: [0, 7, 12, 7, 4, 7, 11, 7, 2, 9, 14, 9, 7, 4, 2, N], bass: [-12, N, N, N, -8, N, N, N, -10, N, N, N, -5, N, N, N] },
    bed: { f: 500, q: 0.5, vol: 0.06, lfo: 0.11, type: 'lowpass' }, shots: [['crackle', 0.7], ['gull', 9]] },
};
const KEY = 'tara-glen-mute';
class Audio {
  ctx?: AudioContext; master?: GainNode; buses: Record<string, GainNode> = {}; noise?: AudioBuffer; cur = ''; step: Record<string, number> = {};
  next: Record<string, number> = {}; shotAt: Record<string, number> = {}; muted = localStorage.getItem(KEY) === '1'; timer = 0;
  constructor() {
    const unlock = () => { this.start(); if (this.ctx?.state === 'running') ['pointerdown', 'touchend', 'keydown'].forEach((e) => removeEventListener(e, unlock, true)); };
    ['pointerdown', 'touchend', 'keydown'].forEach((e) => addEventListener(e, unlock, true));
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; document.hidden ? this.ctx.suspend() : this.ctx.resume(); });
  }
  get state() { return this.ctx?.state ?? 'locked'; }
  start() {
    if (!this.ctx) { const C = (window as any).AudioContext || (window as any).webkitAudioContext; if (!C) return; this.ctx = new C(); const c = this.ctx!;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(c.destination);
      const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
      // iOS: play a silent blip inside the gesture
      const o = c.createOscillator(), g = c.createGain(); g.gain.value = 0; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.01);
      this.timer = window.setInterval(() => this.tick(), 90); }
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    if (this.cur) this.zone(this.cur, false, true);
  }
  setMuted(m: boolean) { this.muted = m; localStorage.setItem(KEY, m ? '1' : '0'); if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05); }
  bus(z: string) {
    if (this.buses[z]) return this.buses[z];
    const c = this.ctx!, g = c.createGain(); g.gain.value = 0; g.connect(this.master!); this.buses[z] = g;
    const bed = ZONES[z]?.bed;
    if (bed) { const src = c.createBufferSource(); src.buffer = this.noise!; src.loop = true; const f = c.createBiquadFilter(); f.type = bed.type ?? 'bandpass'; f.frequency.value = bed.f; f.Q.value = bed.q;
      const bg = c.createGain(); bg.gain.value = bed.vol; src.connect(f).connect(bg).connect(g); src.start();
      if (bed.lfo) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = bed.lfo; lg.gain.value = bed.vol * 0.8; l.connect(lg).connect(bg.gain); l.start(); } }
    return g;
  }
  /** cross-fade to a zone's music + ambience */
  zone(z: string, _eve = false, force = false) {
    if (z === this.cur && !force) return; this.cur = z; if (!this.ctx || !ZONES[z]) return;
    const t = this.ctx.currentTime;
    for (const [k, g] of Object.entries(this.buses)) g.gain.setTargetAtTime(k === z ? 1 : 0, t, 0.8);
    this.bus(z).gain.setTargetAtTime(1, t, 0.8); this.next[z] = Math.max(this.next[z] ?? 0, t + 0.05);
  }
  tick() {
    const c = this.ctx; if (!c || c.state !== 'running' || this.muted) return;
    const t = c.currentTime;
    for (const [z, g] of Object.entries(this.buses)) { if (z !== this.cur && g.gain.value < 0.01) continue;
      const Z = ZONES[z], s = Z.song, dt = 60 / s.bpm / 4;
      if ((this.next[z] ?? 0) < t) this.next[z] = t + 0.05;
      while (this.next[z] < t + 0.25) { const i = (this.step[z] = ((this.step[z] ?? -1) + 1) % 16), at = this.next[z];
        if (s.lead[i] != null) this.note(g, s.wave, s.root + s.lead[i]!, at, dt * 1.6, s.vol, s.lp);
        if (s.bass[i] != null) this.note(g, s.lp ? 'sawtooth' : 'triangle', s.root + s.bass[i]!, at, dt * 1.8, s.vol * 1.1, s.lp);
        if (s.kick && i % 4 === 0) this.kick(g, at, s.lp ? 0.35 : 0.18);
        this.next[z] += dt; }
      if (z === this.cur) for (const [name, every] of Z.shots) { const k = z + name; if (!this.shotAt[k]) this.shotAt[k] = t + every * Math.random();
        if (t > this.shotAt[k]) { this.shotAt[k] = t + every * (0.6 + Math.random() * 0.9); this.shot(g, name, t + 0.02); } } }
  }
  env(g: GainNode, at: number, vol: number, dur: number) { const e = this.ctx!.createGain(); e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(vol, at + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, at + dur); e.connect(g); return e; }
  note(g: GainNode, wave: OscillatorType, midi: number, at: number, dur: number, vol: number, lp?: number) {
    const c = this.ctx!, o = c.createOscillator(); o.type = wave; o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    let out: AudioNode = this.env(g, at, vol, dur);
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.connect(out); out = f; }
    o.connect(out); o.start(at); o.stop(at + dur + 0.02);
  }
  kick(g: GainNode, at: number, vol: number) { const c = this.ctx!, o = c.createOscillator(); o.frequency.setValueAtTime(120, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.12); o.connect(this.env(g, at, vol, 0.18)); o.start(at); o.stop(at + 0.2); }
  burst(g: GainNode, at: number, dur: number, vol: number, f: number, q = 1) { const c = this.ctx!, s = c.createBufferSource(); s.buffer = this.noise!; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    s.connect(bp).connect(this.env(g, at, vol, dur)); s.start(at, Math.random()); s.stop(at + dur + 0.02); }
  glide(g: GainNode, wave: OscillatorType, f: number[], at: number, dur: number, vol: number, formant?: number) {
    const c = this.ctx!, o = c.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f[0], at); f.slice(1).forEach((x, i) => o.frequency.linearRampToValueAtTime(x, at + (dur * (i + 1)) / (f.length - 1)));
    let out: AudioNode = this.env(g, at, vol, dur); if (formant) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = formant; b.Q.value = 3; b.connect(out); out = b; }
    o.connect(out); o.start(at); o.stop(at + dur + 0.02);
  }
  shot(g: GainNode, name: string, at: number) {
    const r = Math.random;
    if (name === 'bird') for (let i = 0; i < 3 + r() * 4; i++) this.glide(g, 'sine', [2600 + r() * 900, 3800 + r() * 600, 2400], at + i * 0.11, 0.08, 0.025);
    else if (name === 'kid') this.glide(g, 'sawtooth', [380 + r() * 120, 720 + r() * 200, 520], at, 0.45, 0.03, 1200);
    else if (name === 'squeak') { for (let i = 0; i < 2; i++) this.glide(g, 'sine', [1150, 1650, 1250], at + i * 0.9, 0.35, 0.018); }
    else if (name === 'bark') for (let i = 0; i < 2; i++) { this.burst(g, at + i * 0.22, 0.1, 0.12, 600, 2); this.glide(g, 'sawtooth', [240, 170], at + i * 0.22, 0.1, 0.05, 700); }
    else if (name === 'fore') { this.glide(g, 'sawtooth', [210, 190], at, 0.22, 0.05, 700); this.glide(g, 'sawtooth', [200, 150], at + 0.22, 0.4, 0.05, 1300); }
    else if (name === 'gull') for (let i = 0; i < 3; i++) this.glide(g, 'triangle', [1500, 1700, 900], at + i * 0.32, 0.26, 0.03);
    else if (name === 'chant') { for (let i = 0; i < 4; i++) [0, 4, 7].forEach((n) => this.glide(g, 'sawtooth', [220 * 2 ** (n / 12) * (i === 3 ? 0.89 : 1)], at + i * 0.38, 0.34, 0.016, 900)); }
    else if (name === 'cricket') for (let i = 0; i < 4; i++) this.glide(g, 'square', [4200, 4300], at + i * 0.05, 0.03, 0.006);
    else if (name === 'crackle') for (let i = 0; i < 2 + r() * 4; i++) this.burst(g, at + r() * 0.5, 0.02, 0.08, 1800 + r() * 2000, 0.8);
  }
}
export const audio = new Audio();
(window as any).tgAudio = audio;
