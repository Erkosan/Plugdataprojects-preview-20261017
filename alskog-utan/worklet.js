// Älskog 3000 — mixer, sidechain (Puls), master-FX and punch-in in one AudioWorklet.
// Input 0: the rytm slot. RUNKINATOR's browser engine has 11 channels:
//   0-1 main, 2 kick, 3 snare, 4 hat (dry stems), 5-6 raw sample,
//   7-8 sample as it enters the main mix, 9-10 effect return (exact).
//   Any other drum machine is stereo (params.rytmStereo): its main mix is channel strip 0.
// Input 1: the synth slot, stereo (VULVA, TURBOTUTTE, SVETTAN …). Output: stereo master.
// RUNKINATOR also sends kick/snare hits on a MessagePort ("Spökkick").
// Real-time safe: no allocation inside the sample loop (Safari's audio thread
// drops out on garbage collection).

// Swappable machines: every machine processor registered after this module is
// wrapped so that Älskog can release it. A released processor returns false from
// process(), which lets the browser collect it (engine, wasm heap and samples)
// once its node is dropped. Machines are not changed; the id comes in through
// processorOptions.__alskog, set by Älskog's createNode.
const RELEASED = globalThis.__alskogReleased || (globalThis.__alskogReleased = new Set());
const LIVE = globalThis.__alskogLive || (globalThis.__alskogLive = new Set());
if (!globalThis.__alskogWrapped) {
  globalThis.__alskogWrapped = true;
  const register = globalThis.registerProcessor;
  globalThis.registerProcessor = function (name, Processor) {
    if (name === 'alskog') return register(name, Processor);
    class Held extends Processor {
      constructor(...args) {
        super(...args);
        const o = args[0] && args[0].processorOptions;
        this.__alskog = o && Number.isFinite(o.__alskog) ? o.__alskog : 0;
        this.__dead = false;
        if (this.__alskog) LIVE.add(this.__alskog);
      }
      process(inputs, outputs, parameters) {
        if (this.__dead) return false;
        if (RELEASED.has(this.__alskog)) {
          this.__dead = true; RELEASED.delete(this.__alskog); LIVE.delete(this.__alskog);
          try { this.port.onmessage = null; this.port.close(); } catch { /* already closed */ }
          return false;
        }
        return super.process(inputs, outputs, parameters);
      }
    }
    return register(name, Held);
  };
}

const CH = 6; // kick, snare, hat, sample, runk fx (or the whole drum machine on 0), synth
const KICK = 0, VULVA = 5;
const PUNCH = { '': 0, hacka: 1, bromsa: 2, krossa: 3, frys: 4, baklanges: 5, hjartslag: 6, kyss: 7 };
const GATE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];

class Svf { // TPT state-variable filter
  constructor() { this.ic1 = 0; this.ic2 = 0; this.hp = 0; this.set(1000, 0.8); }
  set(fc, q) {
    const g = Math.tan(Math.PI * Math.min(fc, sampleRate * 0.45) / sampleRate), k = 1 / q;
    this.k = k; this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.hp = x - this.k * v1 - v2; return v2;
  }
}
class Comb {
  constructor(n) { this.b = new Float32Array(n); this.i = 0; this.f = 0; }
  run(x, fb, damp) { const o = this.b[this.i]; this.f = o * (1 - damp) + this.f * damp; this.b[this.i] = x + this.f * fb; if (++this.i >= this.b.length) this.i = 0; return o; }
  clear() { this.b.fill(0); this.f = 0; }
}
class Allpass {
  constructor(n) { this.b = new Float32Array(n); this.i = 0; }
  run(x) { const o = this.b[this.i]; this.b[this.i] = x + o * 0.5; if (++this.i >= this.b.length) this.i = 0; return o - x; }
  clear() { this.b.fill(0); }
}
class Reverb { // Freeverb-style "Sovrum"
  constructor() {
    const s = sampleRate / 44100, c = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], a = [556, 441, 341, 225];
    this.cl = c.map((n) => new Comb(Math.round(n * s))); this.cr = c.map((n) => new Comb(Math.round((n + 23) * s)));
    this.al = a.map((n) => new Allpass(Math.round(n * s))); this.ar = a.map((n) => new Allpass(Math.round((n + 23) * s)));
    this.l = 0; this.r = 0;
  }
  run(l, r, fb, damp) {
    const x = (l + r) * 0.015; let yl = 0, yr = 0;
    for (let i = 0; i < 8; ++i) { yl += this.cl[i].run(x, fb, damp); yr += this.cr[i].run(x, fb, damp); }
    for (let i = 0; i < 4; ++i) { yl = this.al[i].run(yl); yr = this.ar[i].run(yr); }
    this.l = yl; this.r = yr;
  }
  clear() { for (const f of [...this.cl, ...this.cr, ...this.al, ...this.ar]) f.clear(); }
}
// 3-band kill EQ (Avvisa): two cascaded one-poles per split, per side.
class Kill {
  constructor() { this.s = new Float64Array(8); this.lo = 1 - Math.exp(-2 * Math.PI * 250 / sampleRate); this.hi = 1 - Math.exp(-2 * Math.PI * 2500 / sampleRate); }
  run(x, side, kb, km, kt) {
    const s = this.s, o = side * 4;
    s[o] += this.lo * (x - s[o]); s[o + 1] += this.lo * (s[o] - s[o + 1]);
    s[o + 2] += this.hi * (x - s[o + 2]); s[o + 3] += this.hi * (s[o + 2] - s[o + 3]);
    const lo = s[o + 1], hi = x - s[o + 3], mid = x - lo - hi;
    return lo * kb + mid * km + hi * kt;
  }
}

class Alskog extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = {
      ch: Array.from({ length: CH }, () => ({ lust: 0.75, pan: 0.5, svett: 0, sovrum: 0, eko: 0, on: true, duck: false, kb: 1, km: 1, kt: 1 })),
      tacke: 0.5, msvett: 0.3, msovrum: 0.4, andning: 0, kropp: 0.8, sked: false,
      xf: 0.5, hangel: 0, flort: false, otrohet: false, svartsjuka: false, skilsmassa: 0,
      pulsSrc: 0, djup: 0.6, slapp: 0.35,
      bpm: 120, playing: false, start: 0,
      punch: '', kamasutra: new Array(16).fill(''), frys: false, rec: false,
      stryp: 0.25, riser: 0, breath: false, vibrator: 0, meko: 0.4, ekotid: 1
    };
    this.kill = Array.from({ length: CH }, () => new Kill());
    this.gain = new Float64Array(CH); this.target = new Float64Array(CH); this.peak = new Float64Array(CH);
    this.inL = new Float64Array(CH); this.inR = new Float64Array(CH);
    this.eKick = 0; this.eGhost = 0; this.eSnare = 0; this.eHs = 0; this.eDrums = 0; this.eVulva = 0;
    this.hangelF = [new Svf(), new Svf()]; this.tackeF = [new Svf(), new Svf()];
    this.riserF = [new Svf(), new Svf()]; this.eko = [new Float32Array(sampleRate * 3), new Float32Array(sampleRate * 3)]; this.ekoW = 0; this.ekoLp = [0, 0]; this.ekoD = sampleRate * 0.25;
    this.vib = [new Float32Array(4096), new Float32Array(4096)]; this.vibW = 0; this.vibPh = 0; this.vibWow = 0; this.vibAmt = 0; this.seed = 22222; this.impT = -1; this.impPh = 0; this.riserLvl = 0;
    this.rev = new Reverb();
    this.hist = [new Float32Array(sampleRate * 4), new Float32Array(sampleRate * 4)]; this.w = 0;
    this.active = 0; this.anchor = 0; this.t = 0; this.read = 0; this.mix = 0; this.lastStep = -1;
    this.hold0 = 0; this.hold1 = 0; this.holdN = 0; this.gateEnv = 1;
    this.lim = 1; this.strypUntil = 0;
    this.mPeak0 = 0; this.mPeak1 = 0; this.rms = 0; this.blocks = 0; this.rec = []; this.recN = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'params') Object.assign(this.p, data.params);
      else if (data.type === 'dusch') { this.rev.clear(); this.active = 0; this.mix = 0; }
      else if (data.type === 'impact') { this.impT = 0; this.impPh = 0; }
      else if (data.type === 'release') { for (const id of data.ids) if (LIVE.has(id)) RELEASED.add(id); }
      else if (data.type === 'link') data.port.onmessage = ({ data: voice }) => { if (voice === 0) this.eGhost = 1; };
    };
  }

  readHist(c, pos) {
    const h = this.hist[c], n = h.length; let i = Math.floor(pos); const f = pos - i;
    i = ((i % n) + n) % n; const j = i + 1 === n ? 0 : i + 1;
    return h[i] * (1 - f) + h[j] * f;
  }

  process(inputs, outputs) {
    const p = this.p, out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length;
    const runk = inputs[0] || [], vul = inputs[1] || [];
    const zero = this.zero || (this.zero = new Float32Array(n));
    const ch = (arr, i) => (arr[i] && arr[i].length ? arr[i] : zero);
    const stereo = !!p.rytmStereo;
    const kS = ch(runk, stereo ? 0 : 2), kR = stereo ? ch(runk, 1) : kS, sS = stereo ? zero : ch(runk, 3), hS = stereo ? zero : ch(runk, 4);
    const smL = stereo ? zero : ch(runk, 7), smR = stereo ? zero : ch(runk, 8), fxL = stereo ? zero : ch(runk, 9), fxR = stereo ? zero : ch(runk, 10);
    const vL = ch(vul, 0), vR = ch(vul, 1);
    const sr = sampleRate, beatLen = 60 / p.bpm;
    const rel = Math.exp(-1 / (sr * (0.03 + p.slapp * 0.6))), fast = Math.exp(-1 / (sr * 0.06));

    // Block-rate clock and settings.
    const now = currentTime, pos = p.playing ? Math.max(0, (now - p.start) / beatLen) : 0;
    const step = Math.floor(pos * 4) % 16, bar = Math.floor(pos / 4);
    let punch = p.punch;
    if (!punch && p.playing && p.kamasutra[step]) punch = p.kamasutra[step];
    const id = PUNCH[punch] || 0;
    const stepChanged = step !== this.lastStep; this.lastStep = step;
    if (id !== this.active || (stepChanged && !p.punch && id && id !== 4)) { this.active = id; this.anchor = this.w; this.t = 0; this.read = this.w; }
    const act = this.active, kissing = id === 7;
    const otro = p.otrohet ? (bar % 2) : -1; // 0 = master FX on RUNKINATOR only, 1 = Vulva only
    const rot = p.skilsmassa * 0.5 * Math.cos(2 * Math.PI * pos / 16);
    const tk = Math.max(0, Math.min(1, p.tacke + 0.22 * p.andning * Math.sin(2 * Math.PI * pos / 8)));
    const lp = tk < 0.47, hp = tk > 0.53;
    if (lp) { const fc = 20000 * Math.pow(80 / 20000, (0.47 - tk) / 0.47); this.tackeF[0].set(fc, 0.9); this.tackeF[1].set(fc, 0.9); }
    if (hp) { const fc = 20 * Math.pow(6000 / 20, (tk - 0.53) / 0.47); this.tackeF[0].set(fc, 0.9); this.tackeF[1].set(fc, 0.9); }
    const useHangel = p.hangel > 0.01;
    if (useHangel) {
      const fc = Math.exp(Math.log(20000) * (1 - p.hangel) + Math.log(250 + 15000 * Math.min(1, this.eKick * 2)) * p.hangel);
      this.hangelF[0].set(fc, 0.9); this.hangelF[1].set(fc, 0.9);
    }
    if (p.riser > 0.001) { const fc = 250 * Math.pow(48, p.riser); this.riserF[0].set(fc, 4); this.riserF[1].set(fc * 1.06, 4); }
    const pre = 1 + p.stryp * 3, limRel = 0.0004 + p.stryp * 0.0016;
    const frys = p.frys || id === 4;
    const fb = frys ? 0.999 : 0.74 + 0.24 * p.msovrum, damp = frys ? 0 : 0.35;
    const wetGain = frys ? 1.1 : 0.25 + 0.9 * p.msovrum;
    // Eko: tempo-synced ping-pong (1/16, 1/8, 1/8 punkterad, 1/4, 3/8).
    const ekoDiv = [0.25, 0.5, 0.75, 1, 1.5][Math.max(0, Math.min(4, p.ekotid | 0))];
    const ekoTarget = Math.min(this.eko[0].length - 2, ekoDiv * beatLen * sr), ekoFb = 0.2 + 0.55 * p.meko, ekoRet = 0.95 * p.meko;
    const svettOn = p.msvett > 0.01, drive = 1 + 20 * p.msvett, driveNorm = 0.5 / Math.tanh(drive);
    for (let c = 0; c < CH; ++c) {
      const q = p.ch[c];
      let g = q.on ? q.lust * q.lust * 1.6 : 0;
      g *= c === VULVA ? Math.min(1, 2 * (1 - p.xf)) : Math.min(1, 2 * p.xf);
      if ((kissing && c !== KICK) || p.breath) g = 0;
      this.target[c] = g;
    }
    const hs = beatLen / 4, H0 = this.hist[0], H1 = this.hist[1], N = H0.length;
    const inL = this.inL, inR = this.inR, gain = this.gain, target = this.target, peak = this.peak;
    const pans = this.pans || (this.pans = new Float64Array(CH));
    for (let c = 0; c < CH; ++c) {
      let pan = p.ch[c].pan;
      if (p.skilsmassa > 0.01) pan = Math.max(0, Math.min(1, c === VULVA ? pan - rot - p.skilsmassa * 0.3 : pan + rot + p.skilsmassa * 0.3));
      pans[c] = pan;
    }

    for (let i = 0; i < n; ++i) {
      const k = stereo ? (kS[i] + kR[i]) * 0.5 : kS[i], s = sS[i], h = hS[i];
      inL[0] = kS[i]; inR[0] = kR[i]; inL[1] = s; inR[1] = s; inL[2] = h; inR[2] = h;
      inL[3] = smL[i]; inR[3] = smR[i]; inL[4] = fxL[i]; inR[4] = fxR[i]; inL[5] = vL[i]; inR[5] = vR[i];

      // Envelopes for Puls / Hångel / Flört / Svartsjuka.
      const ak = p.ch[KICK].on ? Math.abs(k) : 0, as = Math.abs(s), ah = Math.abs(h);
      const av = Math.max(Math.abs(vL[i]), Math.abs(vR[i]));
      this.eKick = ak > this.eKick ? ak : this.eKick * rel;
      this.eGhost *= rel;
      this.eSnare = as > this.eSnare ? as : this.eSnare * rel;
      const ahs = as > ah ? as : ah;
      this.eHs = ahs > this.eHs ? ahs : this.eHs * fast;
      const ad = Math.max(Math.abs(k), ahs);
      this.eDrums = ad > this.eDrums ? ad : this.eDrums * fast;
      this.eVulva = av > this.eVulva ? av : this.eVulva * fast;
      const pulsEnv = p.pulsSrc === 0 ? this.eKick * 2.5 : p.pulsSrc === 1 ? this.eGhost : this.eSnare * 2.5;
      const duck = 1 - p.djup * (pulsEnv > 1 ? 1 : pulsEnv);
      this.duck = duck;

      let d0L = 0, d0R = 0, d1L = 0, d1R = 0, svL = 0, svR = 0, soL = 0, soR = 0, ekL = 0, ekR = 0;
      for (let c = 0; c < CH; ++c) {
        const q = p.ch[c];
        gain[c] += (target[c] - gain[c]) * 0.002;
        let g = gain[c];
        if (g < 1e-6 && target[c] === 0) continue;
        if (q.duck) g *= duck;
        if (c === VULVA && p.flort) g *= 1 - 0.85 * Math.min(1, this.eHs * 4);
        if (p.svartsjuka) g *= c === VULVA ? 1 - 0.6 * Math.min(1, this.eDrums * 3) : 1 - 0.6 * Math.min(1, this.eVulva * 3);
        let xl = inL[c], xr = inR[c];
        if (q.kb < 1 || q.km < 1 || q.kt < 1) { xl = this.kill[c].run(xl, 0, q.kb, q.km, q.kt); xr = this.kill[c].run(xr, 1, q.kb, q.km, q.kt); }
        if (c === VULVA && useHangel) { xl = this.hangelF[0].run(xl); xr = this.hangelF[1].run(xr); }
        const pan = pans[c];
        const yl = xl * g * (pan < 0.5 ? 1 : 2 * (1 - pan)), yr = xr * g * (pan > 0.5 ? 1 : 2 * pan);
        const a = yl > 0 ? yl : -yl, b = yr > 0 ? yr : -yr;
        if (a > peak[c]) peak[c] = a; if (b > peak[c]) peak[c] = b;
        if (c === VULVA) { d1L += yl; d1R += yr; } else { d0L += yl; d0R += yr; }
        if (!kissing || c === KICK) { svL += yl * q.svett; svR += yr * q.svett; soL += yl * q.sovrum; soR += yr * q.sovrum; ekL += yl * q.eko; ekR += yr * q.eko; }
      }
      // Svett (drive bus) and Sovrum (reverb bus).
      const sL = svettOn ? Math.tanh(svL * drive) * driveNorm : 0, sR = svettOn ? Math.tanh(svR * drive) * driveNorm : 0;
      this.rev.run(frys ? 0 : soL, frys ? 0 : soR, fb, damp);
      const wl0 = this.rev.l * wetGain, wr0 = this.rev.r * wetGain;
      // Eko ping-pong with a soft, slightly dark feedback path; delay time glides.
      this.ekoD += (ekoTarget - this.ekoD) * 0.0005;
      const E0 = this.eko[0], E1 = this.eko[1], EN = E0.length;
      let rp = this.ekoW - this.ekoD; while (rp < 0) rp += EN;
      const ei = Math.floor(rp), ef = rp - ei, ej = ei + 1 === EN ? 0 : ei + 1;
      const eL = E0[ei] * (1 - ef) + E0[ej] * ef, eR = E1[ei] * (1 - ef) + E1[ej] * ef;
      this.ekoLp[0] += 0.35 * (eR - this.ekoLp[0]); this.ekoLp[1] += 0.35 * (eL - this.ekoLp[1]);
      E0[this.ekoW] = (ekL + ekR) * 0.5 + this.ekoLp[0] * ekoFb; E1[this.ekoW] = this.ekoLp[1] * ekoFb;
      if (++this.ekoW >= EN) this.ekoW = 0;
      const wl = wl0 + eL * ekoRet, wr = wr0 + eR * ekoRet;

      // Master FX target: everything, or one machine at a time (Otrohet).
      let tl, tr, passL = 0, passR = 0;
      if (otro === 0) { tl = d0L + sL + wl; tr = d0R + sR + wr; passL = d1L; passR = d1R; }
      else if (otro === 1) { tl = d1L + wl; tr = d1R + wr; passL = d0L + sL; passR = d0R + sR; }
      else { tl = d0L + d1L + sL + wl; tr = d0R + d1R + sR + wr; }

      // Täcke (DJ filter).
      if (lp) { tl = this.tackeF[0].run(tl); tr = this.tackeF[1].run(tr); }
      else if (hp) { this.tackeF[0].run(tl); this.tackeF[1].run(tr); tl = this.tackeF[0].hp; tr = this.tackeF[1].hp; }

      // History + punch-in.
      H0[this.w] = tl; H1[this.w] = tr;
      let pl = tl, pr = tr;
      if (act === 1) { // Hacka: loop the last 1/16
        const len = Math.max(64, Math.round(hs * sr)); const at = this.anchor - len + (this.t % len);
        pl = this.readHist(0, at); pr = this.readHist(1, at);
      } else if (act === 2) { // Bromsa: tape stop over one beat
        const speed = Math.max(0, 1 - this.t / (beatLen * sr)); this.read += speed; const fade = speed * 4 > 1 ? 1 : speed * 4;
        pl = this.readHist(0, this.read - 1) * fade; pr = this.readHist(1, this.read - 1) * fade;
      } else if (act === 5) { // Baklänges: last bar backwards
        const len = Math.round(beatLen * 4 * sr); const at = this.anchor - 1 - (this.t % len);
        pl = this.readHist(0, at); pr = this.readHist(1, at);
      } else if (act === 3) { // Krossa: bitcrush + sample hold
        if (this.holdN-- <= 0) { this.holdN = 6; this.hold0 = Math.round(tl * 24) / 24; this.hold1 = Math.round(tr * 24) / 24; }
        pl = this.hold0 * 1.2; pr = this.hold1 * 1.2;
      } else if (act === 6) { // Hjärtslag: trance gate on 1/16
        const st = Math.floor((pos + i / sr / beatLen) * 4) % 16;
        this.gateEnv += (GATE[st] - this.gateEnv) * 0.01; pl = tl * this.gateEnv; pr = tr * this.gateEnv;
      }
      const want = act && act !== 4 && act !== 7 ? 1 : 0;
      this.mix += (want - this.mix) * 0.01;
      const ml = tl + (pl - tl) * this.mix, mr = tr + (pr - tr) * this.mix;
      if (++this.w >= N) this.w = 0; this.t++;

      // Riser (noise through a rising band-pass) and the Klimax impact.
      this.riserLvl += (p.riser - this.riserLvl) * (p.riser < this.riserLvl ? 0.05 : 0.0005);
      let xl = 0, xr = 0, mlv = 0, mrv = 0;
      if (this.riserLvl > 0.001) {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0; const nz = this.seed / 2147483648 - 1;
        this.riserF[0].run(nz); this.riserF[1].run(-nz);
        const lvl = this.riserLvl * this.riserLvl * 0.6; xl += this.riserF[0].ic1 * lvl; xr += this.riserF[1].ic1 * lvl;
      }
      if (this.impT >= 0) {
        const tt = this.impT / sr, f = 32.703 + 70 * Math.exp(-tt * 6); // lands on C1
        this.impPh += 2 * Math.PI * f / sr;
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0; const nz = this.seed / 2147483648 - 1;
        const boom = Math.sin(this.impPh) * Math.exp(-tt / 0.45) * 0.9 + nz * Math.exp(-tt / 0.04) * 0.5;
        xl += boom; xr += boom; if (++this.impT > sr * 2.5) this.impT = -1;
      }
      // Vibrator: tape vibrato (5.5 Hz) with slow wow on the whole mix.
      this.vibAmt += (p.vibrator - this.vibAmt) * 0.0005;
      if (this.vibAmt > 0.002) {
        const V0 = this.vib[0], V1 = this.vib[1], VN = V0.length;
        V0[this.vibW] = ml + passL; V1[this.vibW] = mr + passR;
        this.vibPh += 2 * Math.PI * 5.5 / sr; this.vibWow += 2 * Math.PI * 0.6 / sr;
        const d = sr * (0.006 + this.vibAmt * (0.0035 * Math.sin(this.vibPh) + 0.004 * Math.sin(this.vibWow)) + this.vibAmt * 0.0075);
        let rp = this.vibW - d; while (rp < 0) rp += VN;
        const i0 = Math.floor(rp), fr = rp - i0, i1 = i0 + 1 === VN ? 0 : i0 + 1;
        const wet = Math.min(1, this.vibAmt * 4);
        const vl = V0[i0] * (1 - fr) + V0[i1] * fr, vr = V1[i0] * (1 - fr) + V1[i1] * fr;
        if (++this.vibW >= VN) this.vibW = 0;
        mlv = (ml + passL) * (1 - wet) + vl * wet; mrv = (mr + passR) * (1 - wet) + vr * wet;
      } else { mlv = ml + passL; mrv = mr + passR; }
      // Kropp (master), Sked (mono), Stryp (drive into the limiter).
      let ol = (mlv + xl) * p.kropp * 1.25 * pre, or = (mrv + xr) * p.kropp * 1.25 * pre;
      if (p.sked) { const m = (ol + or) * 0.5; ol = m; or = m; }
      const al = ol > 0 ? ol : -ol, ar = or > 0 ? or : -or, pk = al > ar ? al : ar;
      const need = pk > 0.89 ? 0.89 / pk : 1;
      this.lim = need < this.lim ? need : this.lim + (1 - this.lim) * limRel;
      ol *= this.lim; or *= this.lim;
      if (this.lim < 0.97) this.strypUntil = now + 0.25;
      L[i] = ol; R[i] = or;
      if (al > this.mPeak0) this.mPeak0 = al; if (ar > this.mPeak1) this.mPeak1 = ar;
      this.rms = this.rms * 0.9999 + (ol * ol + or * or) * 0.00005;
    }

    if (p.rec) {
      const chunk = new Float32Array(n * 2);
      for (let i = 0; i < n; ++i) { chunk[2 * i] = L[i]; chunk[2 * i + 1] = R[i]; }
      this.rec.push(chunk); this.recN += n;
      if (this.recN >= 16384) { this.port.postMessage({ type: 'rec', chunks: this.rec }); this.rec = []; this.recN = 0; }
    } else if (this.rec.length) { this.port.postMessage({ type: 'rec', chunks: this.rec }); this.rec = []; this.recN = 0; }

    if (++this.blocks >= 12) {
      this.blocks = 0;
      this.port.postMessage({ type: 'meters', ch: Array.from(peak), master: [this.mPeak0, this.mPeak1], rms: Math.sqrt(this.rms), stryp: now < this.strypUntil, step: p.playing ? step : -1, pos, duck: this.duck ?? 1, held: LIVE.size });
      peak.fill(0); this.mPeak0 = 0; this.mPeak1 = 0;
    }
    return true;
  }
}
registerProcessor('alskog', Alskog);
