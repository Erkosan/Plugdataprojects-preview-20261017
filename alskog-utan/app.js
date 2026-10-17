// Älskog 3000 — the third machine: mixer, Puls, master-FX, punch-in and conductor
// for two machines of the series, one in the rytm slot and one in the synth slot
// (registry: maskiner.json). The machines run unchanged in frames (see shim.js);
// their audio enters Älskog's worklet, Älskog drives their transport, tempo and
// key via their own host hooks (window.<id>: window.runkinator, window.vulva,
// window.turbotutte, window.svettan …). Only two machines are loaded at a time;
// the one swapped out is released completely (frame, worklet node, engine).

// The registry: which machine may sit in which slot. Filled by build_alskog.py
// with the machines whose web build exists; the fallback is the original pair.
const ORIGINAL = {
  rytm: [{ id: 'runkinator', namn: 'RUNKINATOR', kort: 'RUNK', ljud: 'runk11', midi: '1, 10–13', farg: '#c94b5b', dim: '#5c2a33' }],
  synth: [{ id: 'vulva', namn: 'VULVA', kort: 'VULVA', midi: '1, 14', farg: '#e396c0', dim: '#6a3c55' }]
};
const REG = await fetch(new URL('maskiner.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null) || ORIGINAL;
const SLOTS = ['rytm', 'synth'];
const VARIANT = document.body.dataset.variant || '';
const PORRFILM = VARIANT !== 'utan'; // the catalog's ÄLSKOG is the variant without Porrfilm
const STORE = 'alskog-session-v1' + (VARIANT ? '-' + VARIANT : '');
const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const HEART = 'M12 21s-7.5-4.6-9.5-9.2C1 8.4 3.1 5 6.6 5c2.1 0 3.6 1.2 4.4 2.6h2C13.8 6.2 15.3 5 17.4 5 20.9 5 23 8.4 21.5 11.8 19.5 16.4 12 21 12 21z';
const SVG = 'http://www.w3.org/2000/svg';
const CHANNELS = [
  { id: 'kick', name: 'KICK', color: '#c94b5b', dim: '#5c2a33' },
  { id: 'snare', name: 'SNARE', color: '#dfc23a', dim: '#5e5326' },
  { id: 'hat', name: 'HAT', color: '#9aaee6', dim: '#3d4763' },
  { id: 'sample', name: 'SAMPLE', color: '#a37bcf', dim: '#4a3a5e' },
  { id: 'runkfx', name: 'RUNK FX', color: '#7fc8b0', dim: '#33544a' },
  { id: 'vulva', name: 'VULVA', color: '#e396c0', dim: '#6a3c55' }
];
const ICON = {
  kick: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  ghost: 'M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2-2 2zM10 10h.01M14 10h.01',
  snare: 'M4 8h16v8H4zM4 8l4 8M12 8l4 8',
  hacka: 'M4 6v12M8 6v12M12 9v6M16 9v6M20 11v2',
  bromsa: 'M3 6h6l3 4 3 5 6 3',
  baklanges: 'M10 7L5 12l5 5M5 12h10a4 4 0 0 0 0-8h-3',
  frys: 'M12 2v20M4 6l16 12M20 6L4 18M9 4l3 3 3-3M9 20l3-3 3 3',
  krossa: 'M3 20h4v-4h4v-4h4V8h4V4h2',
  hjartslag: 'M2 12h4l2-5 3 10 3-12 2 7h6',
  kyss: 'M3 12c3-4 6-4 9-1 3-3 6-3 9 1-3 4-6 5-9 5s-6-1-9-5zM3 12h18',
  dusch: 'M7 4h7a4 4 0 0 1 4 4M4 13l1 2M8 13l1 3M12 13l1 4M16 13l1 3M10 9h6',
  tonart: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  duett: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 20a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 9l3 4',
  flort: 'M4 6h10v7H8l-4 3zM20 10v8l-3-2h-5',
  otrohet: 'M7 4l-4 4 4 4M3 8h12M17 20l4-4-4-4M21 16H9',
  svartsjuka: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  skilsmassa: 'M12 3v18M8 7L4 12l4 5M16 7l4 5-4 5',
  hangel: 'M4 16c2-6 4-9 8-9s6 3 8 9M8 16a4 4 0 0 0 8 0',
  tap: 'M9 11V5a2 2 0 0 1 4 0v6M13 10V8a2 2 0 0 1 4 0v5c0 4-3 7-6 7s-5-2-6-5l-1-3a1.5 1.5 0 0 1 3-1l1 2',
  play: 'M7 4l13 8-13 8z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z'
};
const PUNCHES = [
  ['hacka', 'HACKA · STUTTER 1/16'], ['bromsa', 'BROMSA · TAPE-STOP'], ['baklanges', 'BAKLÄNGES'], ['frys', 'FRYS · REVERB-FRYS'],
  ['krossa', 'KROSSA · BITCRUSH'], ['hjartslag', 'HJÄRTSLAG · TRANCE-GATE'], ['kyss', 'KYSS · BLACKOUT'], ['dusch', 'KALL DUSCH · PANIK']
];
const KAMA = ['', 'hacka', 'bromsa', 'krossa', 'frys', 'baklanges', 'hjartslag'];
const KAMA_NAME = ['TOM', 'HACKA', 'BROMSA', 'KROSSA', 'FRYS', 'BAKLÄNGES', 'HJÄRTSLAG'];
const HANGEL = [
  { id: 'hangel', knob: true, name: 'HÅNGEL · KICKEN ÖPPNAR VULVAS FILTER', icon: ICON.hangel },
  { id: 'tonart', name: 'TONART · KICKEN FÖLJER VULVAS GRUNDTON', icon: ICON.tonart },
  { id: 'duett', name: 'DUETT · VULVAS STEG TRIGGAR SAMPLE', icon: ICON.duett },
  { id: 'flort', name: 'FLÖRT · VULVA TYSTNAR NÄR TRUMMORNA SLÅR', icon: ICON.flort },
  { id: 'otrohet', name: 'OTROHET · MASTER-FX BYTER MASKIN VARJE TAKT', icon: ICON.otrohet },
  { id: 'svartsjuka', name: 'SVARTSJUKA · DEN HÖGSTA TRYCKER NED DEN ANDRA', icon: ICON.svartsjuka },
  { id: 'skilsmassa', knob: true, name: 'SKILSMÄSSA · ISÄR I STEREO, ROTERAR', icon: ICON.skilsmassa }
];

const clamp = (v) => Math.max(0, Math.min(1, v));
const pct = (v) => Math.round(v * 100) + '%';
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- state
function upgradeLive(L) { // older sessions: add new controls with defaults
  const d = defaultLive();
  L.master = Object.assign(d.master, L.master);
  for (const c of CHANNELS) L.ch[c.id] = Object.assign(d.ch[c.id], L.ch[c.id]);
  if (!Array.isArray(L.kamasutra)) L.kamasutra = new Array(16).fill(0);
  return L;
}
function defaultLive() {
  const ch = {};
  const lust = { kick: 0.78, snare: 0.7, hat: 0.6, sample: 0.65, runkfx: 0.62, vulva: 0.72 };
  for (const c of CHANNELS) ch[c.id] = { lust: lust[c.id], pan: 0.5, svett: 0, sovrum: c.id === 'snare' || c.id === 'vulva' ? 0.25 : 0.08, eko: c.id === 'vulva' ? 0.18 : c.id === 'snare' ? 0.1 : 0, singel: false, blyg: false, duck: c.id === 'vulva', kill: { b: false, m: false, t: false } };
  return {
    ch, master: { tacke: 0.5, svett: 0.25, sovrum: 0.4, andning: 0, kropp: 0.8, stryp: 0.25, eko: 0.4, ekotid: 0.5 }, sked: false,
    kamasutra: new Array(16).fill(0),
    xf: 0.5, vibrator: 0, hangel: { hangel: 0, tonart: false, duett: false, flort: false, otrohet: false, svartsjuka: false, skilsmassa: 0 },
    puls: { src: 0, djup: 0.5, slapp: 0.35 }
  };
}
const S = {
  live: defaultLive(), scenes: [], scene: 0, smek: 0, undo: [],
  bpm: 124, tempo: '', playing: false, start: 0, key: null, rytm: 'runkinator', synth: 'vulva', swapping: '',
  chain: new Array(16).fill(null), chainPos: -1,
  vulvaBanks: new Array(8).fill(null), vulvaBank: 0, trogen: true, brev: false,
  pfSel: -1, takeArm: -1, taking: null, chainNext: 0, slotStart: 0, xy: { x: 0, y: 0 }, corners: [0, 1, 2, 3], porrfilm: false,
  punch: '', arc: '', arcStart: 0, gral: -1, rec: false,
  hover: '', view: 1, step: -1
};
S.scenes = Array.from({ length: 8 }, () => clone(S.live));
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && saved.version === 1) {
    if (saved.live) S.live = Object.assign(defaultLive(), saved.live);
    upgradeLive(S.live);
    if (Array.isArray(saved.scenes) && saved.scenes.length === 8) S.scenes = saved.scenes;
    for (const k of ['scene', 'bpm']) if (Number.isFinite(saved[k])) S[k] = saved[k];
    if (Array.isArray(saved.chain) && saved.chain.length === 16) S.chain = saved.chain.map((c) => (c && typeof c === 'object' ? c : null));
    if (Array.isArray(saved.vulvaBanks) && saved.vulvaBanks.length === 8) S.vulvaBanks = saved.vulvaBanks;
    if (Number.isInteger(saved.vulvaBank)) S.vulvaBank = saved.vulvaBank;
    if (typeof saved.trogen === 'boolean') S.trogen = saved.trogen;
    if (Number.isInteger(saved.key) && saved.key >= 0 && saved.key < 12) S.key = saved.key;
    for (const k of SLOTS) if (REG[k].some((m) => m.id === saved[k])) S[k] = saved[k];
    if (Array.isArray(saved.kamasutra) && saved.kamasutra.length === 16 && !saved.live?.kamasutra) S.live.kamasutra = saved.kamasutra;
    if (Array.isArray(saved.scenes)) for (const sc of S.scenes) upgradeLive(sc);
  }
} catch { /* fresh session */ }
let saveTimer = 0;
function save() {
  captureVulva();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ version: 1, live: S.live, scenes: S.scenes, scene: S.scene, bpm: S.bpm, chain: S.chain, vulvaBanks: S.vulvaBanks, vulvaBank: S.vulvaBank, trogen: S.trogen, key: S.key, rytm: S.rytm, synth: S.synth })); } catch { /* private mode */ }
  }, 400);
}

// ---------------------------------------------------------------- audio host
// The two slots. slot.rytm.m is the registry entry of the machine in it, .frame its iframe.
for (const k of SLOTS) if (!REG[k] || !REG[k].length) REG[k] = ORIGINAL[k];
const slot = Object.fromEntries(SLOTS.map((k) => [k, { m: null, frame: null, met: false }]));
const machineOf = (k) => slot[k].m || REG[k][0];
const slotOf = (id) => SLOTS.find((k) => slot[k].m && slot[k].m.id === id) || SLOTS.find((k) => REG[k].some((m) => m.id === id));
const host = {
  ctx: null, node: null, bus: {}, nodes: {}, held: {}, seq: 0, modules: {}, ready: null,
  makeBus(k) {
    const old = this.bus[k];
    if (old) { try { old.disconnect(); } catch { /* gone */ } }
    const bus = this.bus[k] = new GainNode(this.ctx, { channelCount: k === 'rytm' ? 11 : 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
    if (this.node) bus.connect(this.node, 0, k === 'rytm' ? 0 : 1);
    return bus;
  },
  ensureContext() {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    for (const k of SLOTS) this.makeBus(k);
    this.ready = ctx.audioWorklet.addModule(new URL('worklet.js?v=20261017-1', import.meta.url)).then(() => this.makeNode());
    // Safari may suspend or interrupt audio: resume on the next touch.
    ctx.onstatechange = () => { if (ctx.state !== 'running' && S.playing) lcd('LJUDET PAUSADES · TRYCK VAR SOM HELST'); };
    addEventListener('pointerdown', () => { if (ctx.state !== 'running') ctx.resume(); }, true);
    return ctx;
  },
  makeNode() {
    const ctx = this.ctx;
    if (this.node) { try { this.node.disconnect(); this.bus.rytm.disconnect(); this.bus.synth.disconnect(); } catch { /* already gone */ } }
    const node = this.node = new AudioWorkletNode(ctx, 'alskog', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 11, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
    this.bus.rytm.connect(node, 0, 0);
    this.bus.synth.connect(node, 0, 1);
    node.connect(ctx.destination);
    node.port.onmessage = ({ data }) => onEngine(data);
    // If Älskog's engine ever fails, rebuild it; the machines keep running.
    node.onprocessorerror = () => { lcd('ÄLSKOG STARTAR OM LJUDET …'); setTimeout(() => { this.linked = false; this.makeNode(); }, 50); };
    pushParams(); this.linked = false; this.link();
  },
  contextFor(machine, base) {
    const ctx = this.ensureContext(), bus = this.bus[slotOf(machine)], modules = this.modules, ready = this.ready;
    // Älskog's module goes first (it wraps registerProcessor so machines can be released).
    // A module is loaded once per AudioContext; a machine that comes back reuses it.
    const worklet = { addModule: (url, options) => { const abs = new URL(String(url), base || location.href).href; return (modules[abs] ??= ready.catch(() => {}).then(() => ctx.audioWorklet.addModule(abs, options))); } };
    return new Proxy(ctx, {
      get(target, key) {
        if (key === 'destination') return bus;
        if (key === 'close') return () => Promise.resolve();
        if (key === 'audioWorklet') return worklet;
        const v = Reflect.get(target, key, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
      set(target, key, value) { return Reflect.set(target, key, value, target); }
    });
  },
  createNode(machine, name, options) {
    const id = ++this.seq, o = options || {};
    const node = new AudioWorkletNode(this.ensureContext(), name, { ...o, processorOptions: { ...(o.processorOptions || {}), __alskog: id } });
    this.nodes[machine] = node; (this.held[machine] ||= []).push(id);
    if (machine === 'runkinator') { this.linked = false; this.link(); }
    if (machine === 'vulva') node.port.addEventListener('message', ({ data }) => { if (data && data.type === 'position') onVulvaStep(data.step); });
    return node;
  },
  // Spökkick: RUNKINATOR's worklet posts kick/snare hits straight to Älskog's worklet.
  link() {
    const runk = this.nodes.runkinator;
    if (this.linked || !runk || !this.node) return;
    const { port1, port2 } = new MessageChannel();
    this.node.port.postMessage({ type: 'link', port: port1 }, [port1]);
    runk.port.postMessage({ type: 'alskog-link', port: port2 }, [port2]);
    this.linked = true;
  },
  // Let go of a machine completely: its processor stops (and can be collected), its
  // node and port are dropped, and its slot gets a fresh, empty bus.
  release(machine) {
    const ids = this.held[machine] || [], node = this.nodes[machine];
    delete this.held[machine]; delete this.nodes[machine];
    if (this.node && ids.length) this.node.port.postMessage({ type: 'release', ids });
    if (node) { try { node.disconnect(); } catch { /* gone */ } try { node.port.onmessage = null; node.port.close(); } catch { /* gone */ } }
    if (machine === 'runkinator') this.linked = false;
    if (this.ctx) this.makeBus(slotOf(machine));
  },
  togglePlay() { togglePlay(); },
  step(d) { setView(S.view + d); }
};
window.alskog = host;
// Diagnostics (like window.vulva / window.runkinator): state and last meters.
host.debug = { get state() { return S; }, get meters() { return meters; } };
// A slot's host hook (window.<id> inside its frame), or null while it loads.
function hookOf(k) { const sl = slot[k]; try { return (sl.frame && sl.m && sl.frame.contentWindow[sl.m.id]) || null; } catch { return null; } }
const api = (id) => { const k = SLOTS.find((x) => slot[x].m && slot[x].m.id === id); return k ? hookOf(k) : null; };
const frameDoc = (k) => { try { return slot[k].frame.contentDocument; } catch { return null; } };

// How Älskog talks to each machine. Every machine built after NY-MASKIN.md has the
// standard hook (ensureAudio, update('start' | 'bpm' | 'tune'), values), so a new
// machine needs no entry here; only the two oldest have their own ways.
const tuneFor = (k) => ((k + 6) % 12) - 6; // C = 0, the smallest shift either way
const GENERIC = {
  ensure: (h) => h.ensureAudio && h.ensureAudio(),
  start: (h, on) => h.update('start', on ? 1 : 0),
  bpm: (h, b) => h.update('bpm', b),
  key: (h, k) => { if (h.values && 'tune' in h.values) h.update('tune', tuneFor(k)); },
  root: (h) => (h.values && Number.isFinite(h.values.tune) ? 48 + h.values.tune : undefined)
};
const ADAPT = {
  runkinator: { key: null, root: null }, // no key of its own; the kick follows with Hångel TONART
  perkele: { key: null, root: null }, // tuned in C, no key of its own
  vulva: {
    ensure: (h) => h.startAudio(),
    start: (h, on) => h.set(h.ids.seq_run, on ? 1 : 0),
    bpm: (h, b) => h.set(h.ids.seq_bpm, b),
    key: (h, k) => { const cur = h.values[h.ids.seq_base]; let best = 48 + k; for (let n = 24 + k; n <= 84; n += 12) if (Math.abs(n - cur) < Math.abs(best - cur)) best = n; if (best !== cur) h.set(h.ids.seq_base, best); },
    root: (h) => h.values[h.ids.seq_base],
    // First meeting: give Vulva its example sequence if the pattern is empty.
    prime: (h, k) => { const has = Array.from({ length: 16 }, (_, s) => h.values[h.ids.step_0_pitch + s * 5 + 1] > 0.5).some(Boolean); if (!has) frameDoc(k)?.querySelector('#demo')?.click(); }
  },
  svettan: { // the gubbar need something to sing: their own example, the first time they play here
    meet: (h, k) => { const d = frameDoc(k)?.querySelector('#demo'); if (d && !slot[k].met && !/^Stoppa/.test(d.textContent)) d.click(); slot[k].met = true; },
    halt: (h, k) => { const d = frameDoc(k)?.querySelector('#demo'); if (d && /^Stoppa/.test(d.textContent)) d.click(); }
  }
};
function call(k, fn, ...args) {
  const h = hookOf(k), m = slot[k].m; if (!h || !m) return undefined;
  const f = { ...GENERIC, ...(ADAPT[m.id] || {}) }[fn]; if (!f) return undefined;
  try { return f(h, ...args); } catch { return undefined; }
}
const synthRoot = () => call('synth', 'root');
const shownKey = () => (S.key !== null ? S.key : ((Math.round(synthRoot() ?? 48) % 12) + 12) % 12);
function sendKey() { if (S.key === null) return; for (const k of SLOTS) call(k, 'key', S.key); }

let starting = null;
async function startEngines() {
  host.ensureContext();
  await host.ctx.resume();
  await host.ready;
  if (SLOTS.some((k) => !hookOf(k))) throw new Error('Maskinerna laddar fortfarande.');
  lcd('VÄCKER MASKINERNA …');
  await Promise.all(SLOTS.map((k) => call(k, 'ensure')));
  for (const k of SLOTS) call(k, 'prime', k);
}
async function togglePlay() {
  if (S.playing) { stopAll(); return; }
  try {
    if (!starting) starting = startEngines();
    await starting;
  } catch (error) { starting = null; lcd(String(error.message || error).toUpperCase()); return; }
  sendTempo(); sendKey();
  for (const k of SLOTS) call(k, 'start', true);
  for (const k of SLOTS) call(k, 'meet', k);
  S.playing = true; S.start = host.ctx.currentTime + 0.004; S.chainPos = -1; S.chainNext = 0; lastBar = -1;
  S.hover = '';
  pushParams(); render();
}
function stopAll() {
  for (const k of SLOTS) { call(k, 'start', false); call(k, 'halt', k); }
  if (S.taking) finishTake();
  S.playing = false; S.arc = ''; pushParams(); render();
}
function effectiveBpm() { return Math.max(30, Math.min(300, S.tempo === 'mys' ? Math.round(S.bpm / 2) : S.tempo === 'hets' ? S.bpm * 2 : S.bpm)); }
function sendTempo() {
  const b = effectiveBpm();
  for (const k of SLOTS) call(k, 'bpm', b);
}
function forsoning() {
  if (!S.playing) return;
  for (const k of SLOTS) call(k, 'start', false);
  for (const k of SLOTS) call(k, 'start', true);
  S.start = host.ctx.currentTime + 0.004; lastBar = -1; pushParams();
}

// ---------------------------------------------------------------- engine params
function pushParams() {
  if (!host.node) return;
  const L = S.live, anySolo = CHANNELS.some((c) => L.ch[c.id].singel);
  const punch = S.punch === 'dusch' ? '' : S.punch || (S.gral >= 0 ? gralPunch : '') || arc.punch;
  host.node.port.postMessage({ type: 'params', params: {
    ch: CHANNELS.map((c) => { const q = L.ch[c.id]; return { lust: q.lust, pan: q.pan, svett: q.svett, sovrum: q.sovrum, eko: q.eko || 0, on: !q.blyg && (!anySolo || q.singel), duck: q.duck, kb: q.kill.b ? 0 : 1, km: q.kill.m ? 0 : 1, kt: q.kill.t ? 0 : 1 }; }),
    tacke: L.master.tacke, msvett: L.master.svett, msovrum: L.master.sovrum, andning: L.master.andning, kropp: L.master.kropp * arcGain, sked: L.sked,
    xf: L.xf, vibrator: L.vibrator || 0, hangel: L.hangel.hangel, flort: L.hangel.flort, otrohet: L.hangel.otrohet, svartsjuka: L.hangel.svartsjuka, skilsmassa: L.hangel.skilsmassa,
    pulsSrc: L.puls.src, djup: L.puls.djup, slapp: L.puls.slapp, rytmStereo: machineOf('rytm').ljud !== 'runk11',
    bpm: effectiveBpm(), playing: S.playing, start: S.start, punch,
    kamasutra: S.live.kamasutra.map((k) => KAMA[k]), frys: S.arc === 'efterspel', rec: S.rec,
    stryp: L.master.stryp, riser: arc.riser, breath: arc.breath, meko: L.master.eko, ekotid: Math.round(L.master.ekotid * 4)
  } });
}
let arcGain = 1;

// Tonart: RUNKINATOR's kick follows the synth's root note.
setInterval(() => {
  const r = api('runkinator'), root = synthRoot();
  if (!S.live.hangel.tonart || !r || !r.ready || !Number.isFinite(root)) return;
  let f = 440 * Math.pow(2, (root - 69) / 12); while (f > 100) f /= 2; while (f < 30) f *= 2;
  const want = Math.log(f / 30) / Math.log(10 / 3);
  if (Math.abs((r.values.kick_base_pitch ?? 0) - want) > 0.005) r.update('kick_base_pitch', want);
}, 150);

// Duett: Vulva's sounding steps trigger RUNKINATOR's sample (note G on CH1).
function onVulvaStep(step) {
  if (!S.live.hangel.duett || !S.playing) return;
  const v = api('vulva'), node = host.nodes.runkinator;
  if (!v || !node || step < 0) return;
  const on = v.values[v.ids.step_0_pitch + step * 5 + 1] > 0.5;
  if (!on) return;
  node.port.postMessage({ type: 'midi', pitch: 67, velocity: 96, channel: 0 });
  setTimeout(() => node.port.postMessage({ type: 'midi', pitch: 67, velocity: 0, channel: 0 }), 60);
}

// ---------------------------------------------------------------- engine feedback
let meters = { ch: new Array(6).fill(0), master: [0, 0], rms: 0, stryp: false };
let recChunks = [];
function onEngine(data) {
  if (data.type === 'meters') { meters = data; S.step = data.step; paintMeters(); }
  else if (data.type === 'rec') recChunks.push(...data.chunks);
}
function saveRecording() {
  const frames = recChunks.reduce((n, c) => n + c.length / 2, 0);
  if (!frames) return;
  const sr = host.ctx.sampleRate, bytes = 44 + frames * 4, buf = new ArrayBuffer(bytes), d = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; ++i) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, bytes - 8, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 2, true);
  d.setUint32(24, sr, true); d.setUint32(28, sr * 4, true); d.setUint16(32, 4, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, frames * 4, true);
  let o = 44;
  for (const c of recChunks) for (let i = 0; i < c.length; ++i, o += 2) d.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 32767, true);
  recChunks = [];
  const a = document.createElement('a'), stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })); a.download = `Alskog-${stamp}.wav`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------- conductor clock
let lastBar = -1, gralPunch = '';
function beatPos() { return S.playing && host.ctx ? Math.max(0, (host.ctx.currentTime - S.start) / (60 / effectiveBpm())) : 0; }
setInterval(() => {
  if (!S.playing) return;
  const pos = beatPos(), bar = Math.floor(pos / 4);
  // Gräl: one bar of chaos, then land on the downbeat.
  if (S.gral >= 0) {
    const want = pos < S.gral ? '' : pos < S.gral + 4 ? ['hacka', 'baklanges', 'krossa', 'hacka'][Math.floor(pos - S.gral) % 4] : null;
    if (want === null) { S.gral = -1; gralPunch = ''; pushParams(); render(); }
    else if (want !== gralPunch) { gralPunch = want; pushParams(); }
  }
  // Förspel → Vuxenmys → KNULLKNULLKNULL → andetag → Klimax (drop) / Efterspel.
  if (S.arc) arcTick(pos);
  // Porrfilm: the manus plays its scenes in order, each for its own length.
  if (S.brev && PORRFILM) manusTick(pos);
}, 25);
// Samlag: stages that ease Älskog's controls from where they were towards a
// hotter (or calmer) target. Pressed by hand a stage stays until you change;
// IDKA SAMLAG runs the whole curve. Drops restore the starting point (arcBase)
// with an impact and an afterglow that eases back over several bars.
const STAGE = {
  forspel: { bars: 8, set: { 'master.tacke': (b) => Math.max(0.6, b.master.tacke), 'master.sovrum': (b) => Math.min(1, b.master.sovrum + 0.2), 'master.andning': () => 0.35, 'hangel.hangel': () => 0.4 } },
  vuxenmys: { bars: 4, set: { 'master.tacke': () => 0.74, 'master.sovrum': () => 0.75, 'master.svett': () => 0.55, 'puls.djup': () => 0.8, 'hangel.hangel': () => 0.6 } },
  knull: { bars: 4, set: { 'master.tacke': () => 0.9, 'master.svett': () => 0.85, 'master.sovrum': () => 0.9, 'puls.djup': () => 0.85 } },
  cigg: { bars: 4, set: { 'master.tacke': () => 0.3, 'master.sovrum': () => 0.85, 'master.andning': () => 0.3, 'master.svett': (b) => b.master.svett * 0.5, 'puls.djup': () => 0, 'hangel.hangel': () => 0.3 }, kickBlyg: true },
  klimax: { bars: 8, drop: { 'master.svett': (b) => Math.min(1, b.master.svett + 0.3), 'master.sovrum': (b) => Math.min(1, b.master.sovrum + 0.25), 'master.stryp': (b) => Math.min(1, b.master.stryp + 0.3), 'puls.djup': (b) => Math.max(b.puls.djup, 0.85) } },
  runda: { bars: 8, drop: { 'master.svett': (b) => Math.min(1, b.master.svett + 0.4), 'master.stryp': (b) => Math.min(1, b.master.stryp + 0.5), 'puls.djup': (b) => Math.max(b.puls.djup, 0.9), 'master.tacke': () => 0.5 } }
};
const SAMLAG = ['forspel', 'vuxenmys', 'knull', 'klimax', 'cigg', 'runda'];
const NAME = { samlag: 'IDKA SAMLAG', forspel: 'FÖRSPEL', vuxenmys: 'VUXENMYS', knull: 'KNULLKNULLKNULL', klimax: 'KLIMAX', cigg: 'CIGG PÅ SÄNGKANTEN', runda: 'RUNDA TVÅ', efterspel: 'EFTERSPEL', andas: 'ANDETAG' };
const arc = { punch: '', riser: 0, breath: false, drop: 0, into: '', from: null, rolling: false };
let arcBase = null;
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const getp = (o, path) => path.split('.').reduce((x, k) => x[k], o);
const setp = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };
function setRoll(on) { if (arc.rolling === on) return; arc.rolling = on; const r = api('runkinator'); if (r) r.update('zzzzzzzzzzz_perf_roll', on ? 1 : 0); }
function nextBar(pos) { return Math.ceil(pos / 4 - 1e-6) * 4; }
function enterStage(id, at) {
  if (id === 'klimax' || id === 'runda') { // breathe on the last beat, then drop
    let drop = nextBar(at); if (drop - at < 1.2) drop += 4;
    S.arc = 'andas'; arc.into = id; arc.drop = drop; S.arcStart = at;
  } else { S.arc = id; S.arcStart = at; arc.from = clone(S.live); }
  render();
}
function startArc(id) {
  const pos = beatPos();
  if (!arcBase || !S.arc || S.arc === 'efterspel') arcBase = clone(S.live);
  S.auto = id === 'samlag';
  enterStage(S.auto ? 'forspel' : id, S.auto || id === 'forspel' ? nextBar(pos) : pos);
  pushParams();
}
function endArc(restore = true) {
  if (restore && arcBase) S.live = clone(arcBase);
  S.arc = ''; S.auto = false; arcGain = 1; arc.punch = ''; arc.riser = 0; arc.breath = false; setRoll(false); arcBase = null;
  pushParams(); render();
}
function afterStage(id, end) { // what follows a finished stage
  if (!S.auto) { if (id === 'klimax' || id === 'runda') endArc(true); return; }
  const next = SAMLAG[SAMLAG.indexOf(id) + 1];
  if (next) enterStage(next, end); else endArc(true);
}
function stagePunch(id, barIn, step, auto) {
  if (id === 'vuxenmys') return step === 15 || (barIn % 4 === 3 && step >= 12 && step % 2 === 0) ? 'hacka' : '';
  if (id === 'knull') { const b = auto ? barIn : barIn % 3; return b === 0 ? (step % 8 === 7 ? 'hacka' : '') : b === 1 ? (step >= 8 && step % 2 ? 'hacka' : '') : b === 2 ? 'hjartslag' : 'hacka'; }
  return '';
}
function arcTick(pos) {
  const b = arcBase, L = S.live, st = S.arc;
  if (st === 'andas') { // hold your breath: one beat of near-silence, then the drop
    arc.riser = Math.max(arc.riser, lerp(0.3, 1, 1 - (arc.drop - pos) / 4));
    arc.breath = pos >= arc.drop - 1; if (arc.breath) { arc.punch = ''; setRoll(false); }
    if (pos >= arc.drop) {
      const def = STAGE[arc.into]; S.live = clone(b);
      for (const [path, fn] of Object.entries(def.drop)) setp(S.live, path, fn(b));
      arc.from = clone(S.live); arc.breath = false; arc.riser = 0; arc.punch = '';
      host.node?.port.postMessage({ type: 'impact' }); heartFlash = performance.now();
      S.arc = arc.into; S.arcStart = arc.drop; render();
    }
    pushParams(); renderSoon(); return;
  }
  if (st === 'efterspel') {
    const k = Math.min(1, (pos - S.arcStart) / 16); arcGain = 1 - k;
    arc.punch = k > 0.85 ? 'bromsa' : '';
    if (k >= 1) { arcGain = 1; arc.punch = ''; S.arc = ''; arcBase = null; stopAll(); return; }
    pushParams(); return;
  }
  const def = STAGE[st]; if (!def || pos < S.arcStart) return;
  const len = def.bars * 4, barIn = Math.floor((pos - S.arcStart) / 4), step = Math.floor(pos * 4) % 16;
  const k = (pos - S.arcStart) / len;
  if (def.drop) { // afterglow: ease the boost back to the starting point
    for (const path of Object.keys(def.drop)) setp(L, path, lerp(getp(arc.from, path), getp(b, path), k));
  } else { // ramp in (whole stage in Samlag, one bar by hand), then hold
    const ramp = S.auto ? k : (pos - S.arcStart) / 4;
    for (const [path, fn] of Object.entries(def.set)) setp(L, path, lerp(getp(arc.from, path), fn(b), ramp));
    L.ch.kick.blyg = def.kickBlyg ? true : b.ch.kick.blyg;
    arc.punch = stagePunch(st, barIn, step, S.auto);
    if (st === 'vuxenmys') arc.riser = S.auto ? k * 0.3 : 0.2;
    else if (st === 'knull') { arc.riser = S.auto ? 0.3 + 0.7 * k : 0.45 + 0.15 * Math.sin(pos * Math.PI / 2); setRoll(S.auto ? barIn >= 1 : true); }
    else arc.riser = 0;
  }
  const next = S.auto ? SAMLAG[SAMLAG.indexOf(st) + 1] : '';
  if (next && STAGE[next].drop && pos >= S.arcStart + len - 1) { // last beat: breathe, then drop on the one
    S.arc = 'andas'; arc.into = next; arc.drop = S.arcStart + len; S.arcStart = pos; render();
  } else if (k >= 1 && (S.auto || def.drop)) { arc.punch = ''; setRoll(false); afterStage(st, S.arcStart + len); }
  pushParams(); renderSoon();
}
let heartFlash = 0;
// ---------------------------------------------------------------- Porrfilm: manus, scenes, takes
function toggleManus() { if (S.brev) { stopManus(); lcd('CUT!'); } else { startManus(); lcd(S.playing ? 'ACTION! · MANUSET BÖRJAR PÅ NÄSTA ETTA' : 'ACTION! · MANUSET BÖRJAR NÄR NI SÄTTER IGÅNG'); } render(); }
// RUNKINATOR bank b as parameter names (same families its own session files use).
function runkBankNames(b) {
  const p2 = (n) => String(n).padStart(2, '0'), p3 = (n) => String(n).padStart(3, '0'), out = [];
  for (const t of ['kick', 'snare', 'closed_hat', 'open_hat', 'zzz_future']) out.push(`zzzzz_pattern_${t}_b${p2(b + 1)}`);
  for (let row = 0; row < 5; ++row) {
    for (let h = 0; h < 2; ++h) out.push(`zzzzzzzzz_rpack_${p2(row * 16 + b * 2 + h)}`);
    for (let k = 0; k < 8; ++k) out.push(`zzzzzzzzzzzz_probability_${p3(row * 64 + b * 8 + k)}`);
    out.push(`zzzzzzzzzzzz_accent_${p2(row * 8 + b)}`);
  }
  for (let v = 0; v < 4; ++v) for (let k = 0; k < 8; ++k) out.push(`zzzzzzzzzzz_samplepack_${p3(v * 64 + b * 8 + k)}`);
  return out;
}
function runkBankEmpty(b) { const r = api('runkinator'); if (!r || !r.values) return true; return ['kick', 'snare', 'closed_hat', 'open_hat', 'zzz_future'].every((t) => !r.values[`zzzzz_pattern_${t}_b${String(b + 1).padStart(2, '0')}`]); }
function emptyVulvaPattern() { const v = api('vulva'); return v ? vulvaPatternIds(v).map((id, n) => [id, n === 0 ? 16 : (n - 1) % 5 === 0 ? 48 : 0]) : null; }
// Copy (two steps: KOPIERA, then the target) and delete, for every kind of sequence.
const COPY = {
  runk: { name: 'RUNK-BANK', copy: (a, b) => { const r = api('runkinator'); const from = runkBankNames(a), to = runkBankNames(b); from.forEach((n, k) => r.update(to[k], r.values[n] || 0)); if (runkBank() === b) r.update('zzzz_bank', b); },
          clear: (b) => { const r = api('runkinator'); for (const n of runkBankNames(b)) r.update(n, 0); if (runkBank() === b) r.update('zzzz_bank', b); } },
  vulva: { name: 'VULVA-BANK', copy: (a, b) => { captureVulva(); S.vulvaBanks[b] = clone(S.vulvaBanks[a]); if (S.vulvaBank === b) selectVulvaBank(b); },
           clear: (b) => { const e = emptyVulvaPattern(); if (!e) return; S.vulvaBanks[b] = e; if (S.vulvaBank === b) { const v = api('vulva'); for (const [id, val] of e) v.set(id, val); } } },
  scene: { name: 'STÄLLNING', copy: (a, b) => { S.scenes[b] = clone(S.scenes[a]); if (S.scene === b) loadScene(b); },
           clear: (b) => { S.scenes[b] = defaultLive(); if (S.scene === b) loadScene(b); } },
  manus: { name: 'SCEN', copy: (a, b) => { S.chain[b] = clone(S.chain[a]); },
           clear: (b) => { S.chain[b] = null; if (S.takeArm === b) S.takeArm = -1; } }
};
S.copyFrom = null;
// One way to copy and delete everywhere:
//   hold   → the thing lights up as "kopierad"; tap where the copy should go
//   double → a small ✕ appears on it; tap the ✕ to delete
function holdCopy(type, from) {
  if (type === 'manus' && !S.chain[from]) { lcd('TOM SCEN · INGET ATT KOPIERA'); return; }
  S.copyFrom = { type, from }; render(); lcd(`${COPY[type].name} ${from + 1} KOPIERAD · TRYCK DÄR DEN SKA LIGGA`);
}
function pasteTo(type, b) { // true when the tap was used as a paste
  if (!S.copyFrom || S.copyFrom.type !== type) return false;
  const { from } = S.copyFrom; S.copyFrom = null;
  if (from !== b) { COPY[type].copy(from, b); save(); lcd(`${COPY[type].name} ${from + 1} → ${b + 1}`); } else lcd('KOPIERING AVBRUTEN');
  render(); return true;
}
function offerDelete(btn, type, k) {
  btn.querySelector('.del-x')?.remove();
  const x = document.createElement('span'); x.className = 'del-x'; x.textContent = '✕'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', `Ta bort ${COPY[type].name.toLowerCase()} ${k + 1}`);
  x.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  x.addEventListener('click', (ev) => { ev.stopPropagation(); x.remove(); COPY[type].clear(k); save(); render(); lcd(`${COPY[type].name} ${k + 1} ${type === 'scene' ? 'NOLLSTÄLLD' : 'BORTTAGEN'}`); });
  btn.appendChild(x); lcd(`TRYCK PÅ ✕ FÖR ATT TA BORT ${COPY[type].name} ${k + 1}`);
  setTimeout(() => x.remove(), 3500);
}
let lastTap = { e: null, t: 0 }; // a double tap is two taps on the same thing with nothing between
addEventListener('pointerdown', (ev) => { if (lastTap.e && !lastTap.e.contains(ev.target)) lastTap = { e: null, t: 0 }; }, true);
function gestures(e, { tap, hold, dbl }) {
  let timer = 0, held = false;
  e.addEventListener('pointerdown', () => { held = false; clearTimeout(timer); if (hold) timer = setTimeout(() => { held = true; hold(); }, 480); });
  for (const n of ['pointerup', 'pointerleave', 'pointercancel']) e.addEventListener(n, () => clearTimeout(timer));
  e.addEventListener('contextmenu', (ev) => ev.preventDefault());
  e.addEventListener('click', (ev) => {
    if (held) { held = false; return; }
    const now = performance.now(), again = lastTap.e === e && now - lastTap.t < 330;
    lastTap = again ? { e: null, t: 0 } : { e, t: now };
    if (dbl && again) { dbl(); return; }
    if (tap) tap(ev);
  });
}
addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && S.copyFrom) { S.copyFrom = null; render(); lcd('KOPIERING AVBRUTEN'); } });
// Everything a take can remember: every continuous control of the mix.
function livePaths() {
  const p = ['master.tacke', 'master.svett', 'master.sovrum', 'master.andning', 'master.kropp', 'master.stryp', 'master.eko', 'master.ekotid', 'xf', 'vibrator', 'hangel.hangel', 'hangel.skilsmassa', 'puls.djup', 'puls.slapp'];
  for (const c of CHANNELS) for (const k of ['lust', 'pan', 'svett', 'sovrum', 'eko']) p.push(`ch.${c.id}.${k}`);
  return p;
}
let lastTakeStep = -1;
function startManus() {
  S.brev = true; S.chainPos = -1; lastTakeStep = -1;
  S.chainNext = S.playing ? nextBar(beatPos()) : 0;
}
function stopManus() { if (S.taking) finishTake(); S.brev = false; S.chainPos = -1; S.takeArm = -1; }
function finishTake() {
  const t = S.taking; S.taking = null; if (!t || !t.frames.length) return;
  const keep = t.paths.map((_, k) => k).filter((k) => t.frames.some((f) => Math.abs(f[k] - t.frames[0][k]) > 1e-4));
  const slot = S.chain[t.slot]; if (!slot) return;
  slot.take = keep.length ? { paths: keep.map((k) => t.paths[k]), frames: t.frames.map((f) => keep.map((k) => f[k])) } : null;
  save(); render(); lcd(keep.length ? `TAGNING KLAR · SCEN ${t.slot + 1} · ${keep.length} REGLAGE` : `TAGNING · SCEN ${t.slot + 1} · INGA RÖRELSER`);
}
function manusTick(pos) {
  const used = S.chain.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  if (!used.length) return;
  if (pos >= S.chainNext) {
    if (S.taking) finishTake();
    const idx = used.indexOf(S.chainPos); S.chainPos = used[(idx + 1) % used.length];
    const slot = S.chain[S.chainPos]; S.slotStart = S.chainNext; S.chainNext += (slot.len || 4) * 4; lastTakeStep = -1;
    applyChainSlot(slot);
    if (S.takeArm === S.chainPos) { S.taking = { slot: S.chainPos, frames: [], paths: livePaths() }; S.takeArm = -1; lcd(`TAGNING PÅGÅR · SCEN ${S.chainPos + 1}`); }
    render();
  }
  const slot = S.chain[S.chainPos]; if (!slot) return;
  const step = Math.floor((pos - S.slotStart) * 4);
  if (S.taking && S.taking.slot === S.chainPos) { const f = S.taking.frames; while (f.length <= step) f.push(S.taking.paths.map((p) => getp(S.live, p))); }
  else if (slot.take && step !== lastTakeStep) {
    lastTakeStep = step; const fr = slot.take.frames[Math.min(step, slot.take.frames.length - 1)];
    if (fr) { slot.take.paths.forEach((p, k) => setp(S.live, p, fr[k])); pushParams(); renderSoon(); }
  }
}

function applyChainSlot(slot) {
  const r = api('runkinator');
  if (r) r.update('zzzz_bank', slot.r);
  selectVulvaBank(slot.v);
  if (S.trogen && Number.isInteger(slot.s)) loadScene(slot.s); // FRI or no ställning: only banks change
}
// Vulva has one 16-step pattern; Älskog keeps eight of them (VULVA A–H).
function vulvaPatternIds(v) { const ids = [v.ids.seq_length]; for (let i = 0; i < 80; ++i) ids.push(v.ids.step_0_pitch + i); return ids; }
function captureVulva() {
  const v = api('vulva'); if (!v || !v.values) return;
  S.vulvaBanks[S.vulvaBank] = vulvaPatternIds(v).map((id) => [id, v.values[id]]);
}
function selectVulvaBank(k) {
  const v = api('vulva'); if (!v) return;
  captureVulva();
  if (S.vulvaBanks[k]) for (const [id, val] of S.vulvaBanks[k]) v.set(id, val);
  else S.vulvaBanks[k] = vulvaPatternIds(v).map((id) => [id, v.values[id]]); // a new bank starts as a copy
  S.vulvaBank = k; save(); render();
}
const BANK = 'ABCDEFGH';
function runkBank() { const r = api('runkinator'); return r && r.values ? r.values.zzzz_bank ?? 0 : 0; }
function slotLong(c, i) { return c ? `SCEN ${i + 1} · RUNK ${BANK[c.r]} + VULVA ${BANK[c.v]} · ${Number.isInteger(c.s) ? 'STÄLLNING ' + (c.s + 1) + (S.trogen ? '' : ' (VILAR)') : 'IMPRO'} · ${c.len || 4} TAKTER${c.take ? ' · ● RÖRELSER' : ''}` : `SCEN ${i + 1} · TOM`; }

// ---------------------------------------------------------------- scenes (Ställningar) + Smek
function loadScene(i) { S.scene = i; S.smek = 0; S.live = clone(S.scenes[i]); pushParams(); sendTempo(); save(); render(); }
function applyBed() { // bilinear blend of the four corner Ställningar
  const { x, y } = S.xy, w = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
  const snaps = S.corners.map((k) => S.scenes[k]), top = w.indexOf(Math.max(...w));
  const walk = (vals) => {
    const first = vals[0];
    if (Array.isArray(first)) return vals[top].slice();
    if (first && typeof first === 'object') { const o = {}; for (const k of Object.keys(first)) o[k] = walk(vals.map((v) => (v ? v[k] : first[k]))); return o; }
    if (typeof first === 'number') return vals.reduce((sum, v, n) => sum + (typeof v === 'number' ? v : first) * w[n], 0);
    return vals[top];
  };
  S.live = walk(snaps); pushParams(); render();
}

// ---------------------------------------------------------------- DOM helpers
const body = document.querySelector('#ak-body');
function el(tag, cls, style, parent = body) { const e = document.createElement(tag); if (cls) e.className = cls; if (style) Object.assign(e.style, style); parent.appendChild(e); return e; }
function svg(path, size, cls = 'ico', parent) { const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', path); p.setAttribute('class', cls); s.appendChild(p); if (parent) parent.appendChild(s); return s; }
function heart(size, parent) { const s = svg(HEART, size, '', parent); s.firstChild.setAttribute('fill', '#3b1220'); return s.firstChild; }
function px(v) { return v + 'px'; }
function box(x, y, w, h) { return { left: px(x), top: px(y), width: px(w), height: px(h) }; }
function lcd(text) { S.hover = text; paintLcd(); }
function hoverable(e, label) { e.addEventListener('pointerenter', () => lcd(typeof label === 'function' ? label() : label)); }
function knobSvg(parent) {
  const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('aria-hidden', 'true');
  const a = document.createElementNS(SVG, 'path'); a.setAttribute('d', 'M 24.5 75.5 A 36 36 0 1 1 75.5 75.5'); a.setAttribute('class', 'arc');
  const l = document.createElementNS(SVG, 'line'); for (const [k, v] of [['x1', 50], ['y1', 50], ['x2', 50], ['y2', 20]]) l.setAttribute(k, v); l.setAttribute('class', 'ptr');
  s.append(a, l); parent.appendChild(s); return l;
}
// Drag (vertical/horizontal), click-to-position for bars, wheel; like the machines.
function control(e, { get, set, axis = 'y', absolute = false, label }) {
  e.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); e.setPointerCapture(ev.pointerId);
    const r = e.getBoundingClientRect(), size = axis === 'y' ? r.height : r.width;
    if (absolute) set(clamp(axis === 'y' ? 1 - (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width));
    let last = axis === 'y' ? ev.clientY : ev.clientX;
    const move = (m) => { const cur = axis === 'y' ? m.clientY : m.clientX; const d = axis === 'y' ? last - cur : cur - last; last = cur; set(clamp(get() + d / (absolute ? size : 160))); lcd(label() ); };
    const up = () => { e.removeEventListener('pointermove', move); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up); };
    e.addEventListener('pointermove', move); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    lcd(label());
  });
  e.addEventListener('wheel', (ev) => { ev.preventDefault(); set(clamp(get() + (ev.deltaY < 0 ? 0.04 : -0.04))); lcd(label()); }, { passive: false });
  hoverable(e, label);
}
function changed() { pushParams(); save(); renderSoon(); }
let renderQueued = false;
function renderSoon() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); } }

// ---------------------------------------------------------------- build panel
el('div', 'pin');
for (let x = 24; x <= 1100 - 14 - 24; x += 30) {
  for (const y of [9, 700 - 14 - 9]) { if (y > 300 && x > 450 && x < 636) continue; const h = heart(14, el('div', 'ak-abs', box(x, y, 14, 14))); h.setAttribute('fill', 'none'); h.setAttribute('stroke', '#6b2a3d'); h.setAttribute('stroke-width', '2'); }
}
for (let y = 54; y <= 700 - 14 - 54; y += 30) for (const x of [9, 1100 - 14 - 9]) { const h = heart(14, el('div', 'ak-abs', box(x, y, 14, 14))); h.setAttribute('fill', 'none'); h.setAttribute('stroke', '#6b2a3d'); h.setAttribute('stroke-width', '2'); }
el('div', 'logo').textContent = 'ÄLSKOG 3000';
// Section plates: each channel, the master and the middle band read as their own units.
const plates = CHANNELS.map((c, i) => el('div', 'sect', box(38 + i * 130, 36, 122, 258)));
el('div', 'sect', box(818, 36, 246, 258));
el('div', 'sect band', box(38, 302, 1026, 76));

const ui = { strips: [] };
CHANNELS.forEach((c, i) => {
  const L = () => S.live.ch[c.id];
  const s = { c, i, aria: [] };
  const wrap = el('div', 'ak-abs', box(39 + i * 130, 56, 120, 236));
  const head = el('div', 'engrave strip-name', { left: px(38 + i * 130), top: '41px', width: '122px' }); head.textContent = c.name;
  const bar = (x, y, w, h, color, key, name, axis = 'y') => {
    const b = el('button', 'bar ' + (axis === 'y' ? 'v' : 'h'), { ...box(x, y, w, h), background: color }, wrap);
    s.aria.push([b, name]);
    const hd = el('span', 'handle', null, b);
    control(b, { get: () => L()[key], set: (v) => { L()[key] = v; changed(); }, axis, absolute: true, label: () => `${s.c.name} · ${name}  ${pct(L()[key])}` });
    return hd;
  };
  s.wrap = wrap; s.head = head;
  s.svett = bar(4, 40, 18, 90, '#e07a3a', 'svett', 'SVETT');
  s.lust = bar(26, 0, 28, 130, c.color, 'lust', 'LUST');
  s.sovrum = bar(58, 40, 18, 90, '#45ad4c', 'sovrum', 'SOVRUM');
  s.eko = bar(80, 40, 18, 90, '#8f86e8', 'eko', 'EKO');
  s.pan = bar(4, 136, 112, 18, c.color, 'pan', 'SÄNGSIDA', 'x');
  const hearts = el('div', 'hearts', { left: '102px', top: '0px', width: '14px', height: '130px', flexDirection: 'column-reverse', justifyContent: 'space-between' }, wrap);
  s.lamps = Array.from({ length: 8 }, () => heart(14, el('span', '', null, hearts)));
  const kills = el('div', 'grid', { ...box(4, 160, 112, 32), gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, wrap);
  s.kill = ['b', 'm', 't'].map((k, j) => {
    const nm = ['BAS', 'MITT', 'TOPP'][j];
    const b = el('button', 'small', { fontSize: '10px', letterSpacing: '0.04em' }, kills); b.textContent = nm;
    s.aria.push([b, `avvisa ${nm.toLowerCase()}`]);
    b.onclick = () => { L().kill[k] = !L().kill[k]; changed(); lcd(`${s.c.name} · AVVISA ${nm}  ${L().kill[k] ? 'PÅ' : 'AV'}`); };
    hoverable(b, () => `${s.c.name} · AVVISA ${nm} (kill)`); return b;
  });
  const btns = el('div', 'grid', { ...box(4, 196, 112, 32), gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }, wrap);
  s.btn = [['singel', 'S', 'SINGEL (solo)'], ['blyg', 'B', 'BLYG (mute)'], ['duck', '♥', 'JUCKAR MED (sidechain)']].map(([k, t, nm]) => {
    const b = el('button', 'mono', null, btns); b.textContent = t; s.aria.push([b, nm]);
    b.onclick = () => { L()[k] = !L()[k]; changed(); lcd(`${s.c.name} · ${nm}  ${L()[k] ? 'PÅ' : 'AV'}`); };
    hoverable(b, () => `${s.c.name} · ${nm}`); return [k, b];
  });
  ui.strips.push(s);
});

function chanView(i) {
  const r = machineOf('rytm'), y = machineOf('synth');
  if (i === 5) return { ...CHANNELS[5], name: y.namn, color: y.farg, dim: y.dim };
  if (r.ljud === 'runk11') return CHANNELS[i];
  return i === 0 ? { ...CHANNELS[0], name: r.namn, color: r.farg, dim: r.dim } : { ...CHANNELS[i], off: true };
}
function paintChannels() {
  ui.strips.forEach((s) => {
    s.c = chanView(s.i);
    s.head.textContent = s.c.off ? '' : s.c.name;
    s.lust.parentNode.style.background = s.c.color; s.pan.parentNode.style.background = s.c.color;
    for (const [b, suffix] of s.aria) b.setAttribute('aria-label', `${s.c.name} ${suffix}`);
    for (const e of [s.wrap, plates[s.i]]) e.classList.toggle('vilar', !!s.c.off);
  });
  const r = chanView(0), y = chanView(5), rm = machineOf('rytm'), ym = machineOf('synth');
  xf.style.background = `linear-gradient(90deg, ${y.color} 0 50%, ${r.color} 50% 100%)`;
  xfl.firstChild.textContent = ym.kort; xfl.lastChild.textContent = rm.kort;
  ui.sLampNames[0].textContent = ym.kort; ui.sLampNames[1].textContent = rm.kort;
  setView(S.view);
}
const genitive = () => machineOf('synth').namn + 'S';
const EKOTID = ['1/16', '1/8', '1/8.', '1/4', '3/8'];
const ekotidName = () => EKOTID[Math.round(S.live.master.ekotid * 4)];
ui.master = [['tacke', 'TÄCKE', '#45ad4c', 0, 0, 'TÄCKE · FILTER (LP ← → HP)'], ['svett', 'SVETT', '#e07a3a', 1, 0, 'SVETT · DRIVE'], ['sovrum', 'SOVRUM', '#c3b0e0', 2, 0, 'SOVRUM · REVERB'],
  ['eko', 'EKO', '#8f86e8', 0, 1, 'EKO · PINGPONG-DELAY (MÄNGD OCH ÅTERKOPPLING)'], ['ekotid', 'EKOTID', '#b6aef0', 1, 1, 'EKOTID'], ['andning', 'ANDNING', '#e0bd5e', 2, 1, 'ANDNING · LFO PÅ TÄCKET']].map(([k, nm, color, col, row, long]) => {
  const b = el('button', 'tile knob tall', { ...box(824 + col * 81, 42 + row * 124, 76, 118), background: color }); b.setAttribute('aria-label', long === 'EKOTID' ? 'Ekotid (takt-synkad)' : long);
  const ptr = knobSvg(b);
  const label = k === 'ekotid' ? () => `EKOTID · ${ekotidName()} (TAKT-SYNKAD)` : () => `${long}  ${pct(S.live.master[k])}`;
  control(b, { get: () => S.live.master[k], set: (v) => { S.live.master[k] = v; changed(); }, label });
  const n = el('span', 'tile-name', null, b); n.textContent = nm; if (k === 'ekotid') ui.ekotidName = n;
  return [k, ptr];
});

// Tvåsamhet, Höfter
const xf = el('button', 'bar h', { ...box(48, 308, 248, 50), background: 'linear-gradient(90deg, #e396c0 0 50%, #c94b5b 50% 100%)' }); xf.setAttribute('aria-label', 'Tvåsamhet (crossfader Vulva–RUNKINATOR)');
el('span', '', { position: 'absolute', left: '12px', right: '12px', top: '22px', height: '6px', background: 'rgba(20,20,20,0.55)' }, xf);
ui.xf = el('span', '', { position: 'absolute', top: '5px', width: '18px', height: '38px', background: '#f4ecd8', border: '1px solid #1a0610' }, xf);
control(xf, { get: () => S.live.xf, set: (v) => { S.live.xf = v; changed(); }, axis: 'x', absolute: true, label: () => `TVÅSAMHET  ${S.live.xf < 0.48 ? 'MER ' + machineOf('synth').kort : S.live.xf > 0.52 ? 'MER ' + machineOf('rytm').kort : 'LIKA'}` });
const xfl = el('div', 'engrave', { left: '48px', top: '362px', width: '248px', display: 'flex', justifyContent: 'space-between' }); xfl.innerHTML = '<span>VULVA</span><span>TVÅSAMHET</span><span>RUNK</span>';
const vib = el('button', 'tile knob', { ...box(318, 308, 50, 50), background: '#e0bd5e' }); vib.setAttribute('aria-label', 'Vibrator (tejp-vibrato på allt)');
ui.vibrator = knobSvg(vib);
control(vib, { get: () => S.live.vibrator || 0, set: (v) => { S.live.vibrator = v; changed(); }, label: () => `VIBRATOR · HELA MIXEN DALLRAR (TEJP-VIBRATO)  ${pct(S.live.vibrator || 0)}` });
el('div', 'engrave', { left: '305px', top: '362px', width: '76px', letterSpacing: '0.14em' }).textContent = 'VIBRATOR';

// Hångel row
const hg = el('div', 'grid', { ...box(390, 308, 414, 50), gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' });
ui.hangel = HANGEL.map((h) => {
  const b = el('button', '', null, hg); b.setAttribute('aria-label', h.name); svg(h.icon, 26, 'ico', b);
  const nm = () => h.name.replace('VULVAS', genitive()).replace('VULVA ', machineOf('synth').namn + ' ');
  if (h.knob) control(b, { get: () => S.live.hangel[h.id], set: (v) => { S.live.hangel[h.id] = v; changed(); }, label: () => `${nm()}  ${pct(S.live.hangel[h.id])}` });
  else { b.onclick = () => { S.live.hangel[h.id] = !S.live.hangel[h.id]; changed(); lcd(`${nm()}  ${S.live.hangel[h.id] ? 'PÅ' : 'AV'}`); }; hoverable(b, () => `${nm()}  ${S.live.hangel[h.id] ? 'PÅ' : 'AV'}`); }
  return [h, b];
});
el('div', 'engrave', { left: '390px', top: '362px', width: '414px', letterSpacing: '0.32em' }).textContent = 'HÅNGEL';

// Kropp + meters + Stryp + Sked
const kr = el('button', 'bar h', { ...box(824, 308, 170, 26), background: '#f2bcd9' }); kr.setAttribute('aria-label', 'Kropp (master)');
ui.kropp = el('span', 'handle', null, kr);
control(kr, { get: () => S.live.master.kropp, set: (v) => { S.live.master.kropp = v; changed(); }, axis: 'x', absolute: true, label: () => `KROPP · MASTER  ${pct(S.live.master.kropp)}` });
const mh = el('div', 'hearts', { left: '824px', top: '338px', width: '170px', justifyContent: 'space-between' });
ui.masterLamps = Array.from({ length: 12 }, () => heart(13, el('span', '', null, mh)));
const ml = el('div', 'engrave', { left: '824px', top: '360px', width: '170px', display: 'flex', justifyContent: 'space-between', pointerEvents: 'auto' });
el('span', '', null, ml).textContent = 'KROPP';
const sk = el('button', 'tile knob', { ...box(1004, 308, 54, 50), background: '#7a3a52' }); sk.setAttribute('aria-label', 'Stryp (maxa kroppen)');
ui.strypPtr = knobSvg(sk);
control(sk, { get: () => S.live.master.stryp, set: (v) => { S.live.master.stryp = v; changed(); }, label: () => `STRYP · TRYCK IHOP OCH MAXA KROPPEN  ${pct(S.live.master.stryp)}` });
ui.stryp = el('div', 'engrave', { left: '1004px', top: '362px', width: '56px', letterSpacing: '0.16em' }); ui.stryp.textContent = 'STRYP';
ui.sked = el('button', '', { fontSize: '10px', letterSpacing: '0.22em', color: 'var(--engrave)', background: 'transparent' }, ml);
ui.sked.onclick = () => { S.live.sked = !S.live.sked; changed(); lcd(S.live.sked ? 'SKED · MONO' : 'ISÄR · STEREO'); };

el('div', 'velvet');

// Juck (sidechain)
const pw = el('div', 'ak-abs', { ...box(46, 398, 252, 52), display: 'flex', gap: '6px' });
ui.puls = [['STÖT · KICKEN', ICON.kick], ['SPÖKSTÖT · KICKMÖNSTRET, ÄVEN NÄR KICKEN ÄR BLYG', ICON.ghost], ['SMISK · SNAREN', ICON.snare]].map(([nm, ic], i) => {
  const b = el('button', '', { width: '48px', height: '52px', border: '1px solid #0d0307', display: 'flex', alignItems: 'center', justifyContent: 'center' }, pw);
  b.setAttribute('aria-label', 'Juck-källa: ' + nm); svg(ic, 26, 'ico', b);
  b.onclick = () => { S.live.puls.src = i; changed(); lcd('JUCK ← ' + nm); }; hoverable(b, 'JUCK · ' + nm); return b;
});
ui.pulsKnobs = [['djup', 'JUCK · DJUP'], ['slapp', 'JUCK · SLÄPP']].map(([k, nm]) => {
  const b = el('button', 'tile knob', { position: 'relative', width: '48px', height: '52px', background: '#c94b5b' }, pw); b.setAttribute('aria-label', nm);
  const ptr = knobSvg(b); control(b, { get: () => S.live.puls[k], set: (v) => { S.live.puls[k] = v; changed(); }, label: () => `${nm}  ${pct(S.live.puls[k])}` });
  return [k, ptr];
});

// Punch-in pads (hold)
const pg = el('div', 'grid', { ...box(310, 398, 498, 52), gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '6px' });
ui.punch = PUNCHES.map(([id, nm]) => {
  const b = el('button', '', { border: '1px solid #0d0307' }, pg); b.setAttribute('aria-label', nm); svg(ICON[id], 26, 'ico', b);
  const down = (ev) => { ev.preventDefault(); b.setPointerCapture?.(ev.pointerId); if (id === 'dusch') { kallDusch(); return; } S.punch = id; pushParams(); render(); lcd('» ' + nm); };
  const up = () => { if (S.punch === id) { S.punch = ''; pushParams(); render(); } };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  b.addEventListener('dblclick', () => { if (id !== 'dusch') { S.punch = id; pushParams(); render(); lcd('» ' + nm + ' (LÅST)'); } });
  hoverable(b, nm); return [id, b];
});
function kallDusch() {
  S.punch = ''; S.gral = -1; if (S.arc) endArc(false);
  Object.assign(S.live.master, { tacke: 0.5, andning: 0 }); S.live.hangel.hangel = 0; S.live.hangel.skilsmassa = 0;
  host.node?.port.postMessage({ type: 'dusch' }); pushParams(); save(); render(); lcd('KALL DUSCH · ALLT NEUTRALT');
}

// Flaskan / Gräl / Förlåt
const cg = el('div', 'grid', { ...box(46, 456, 252, 30), gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' });
[['FLASKAN', '#e0bd5e', 'SNURRA FLASKAN · SLUMPA BLYGHET, SÄNGSIDOR OCH KAMASUTRA', flaskan],
 ['GRÄL', '#e07a3a', 'GRÄL · EN TAKT KAOS, LANDAR PÅ ETTAN', gral],
 ['FÖRLÅT', '#c9dcc0', 'FÖRLÅT · ÅNGRA', forlat]].forEach(([t, bg, nm, fn]) => {
  const b = el('button', '', { background: bg, fontSize: '11px', letterSpacing: '0.14em' }, cg); b.textContent = t; b.setAttribute('aria-label', nm);
  b.onclick = fn; hoverable(b, nm);
});
function flaskan() {
  S.undo.push({ live: clone(S.live) }); if (S.undo.length > 30) S.undo.shift();
  for (const c of CHANNELS) { const q = S.live.ch[c.id]; if (c.id !== 'kick') q.blyg = Math.random() < 0.22; q.pan = clamp(0.5 + (Math.random() - 0.5) * 0.7); }
  S.live.kamasutra = S.live.kamasutra.map((_, i) => (Math.random() < (i % 4 === 3 ? 0.35 : 0.1) ? 1 + Math.floor(Math.random() * (KAMA.length - 1)) : 0));
  changed(); lcd('FLASKAN HAR SNURRAT');
}
function gral() { if (!S.playing) { lcd('GRÄL KRÄVER ATT NI SPELAR'); return; } S.gral = Math.ceil(beatPos() / 4 + 0.001) * 4 - 4 + 4; S.gral = Math.ceil(beatPos()); lcd('GRÄL · NU!'); render(); }
function forlat() { const u = S.undo.pop(); if (!u) { lcd('INGET ATT FÖRLÅTA'); return; } S.live = u.live; changed(); sendTempo(); lcd('FÖRLÅTEN'); }

// Kamasutra (16-step punch lane)
const kg = el('div', 'grid', { ...box(310, 456, 498, 30), gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', gap: '3px' });
ui.kama = Array.from({ length: 16 }, (_, i) => {
  const b = el('button', '', null, kg); b.setAttribute('aria-label', 'Kamasutra steg ' + (i + 1));
  const ic = svg('', 16, 'ico', b);
  b.onclick = () => { S.live.kamasutra[i] = (S.live.kamasutra[i] + 1) % KAMA.length; changed(); lcd(`KAMASUTRA ${i + 1} · ${KAMA_NAME[S.live.kamasutra[i]]}`); };
  b.oncontextmenu = (ev) => { ev.preventDefault(); S.live.kamasutra[i] = 0; changed(); };
  hoverable(b, () => `KAMASUTRA STEG ${i + 1} · ${KAMA_NAME[S.live.kamasutra[i]]}`); return [b, ic.firstChild];
});

// Ställningar + Minns + Smek
const sg = el('div', 'grid', { ...box(46, 494, 368, 34), gridTemplateColumns: 'repeat(9, minmax(0, 1fr))' });
ui.scenes = Array.from({ length: 8 }, (_, i) => {
  const b = el('button', '', { fontSize: '14px', border: '1px solid #0d0307' }, sg); b.textContent = i + 1; b.setAttribute('aria-label', 'Ställning ' + (i + 1));
  gestures(b, { tap: () => { if (pasteTo('scene', i)) return; loadScene(i); lcd('STÄLLNING ' + (i + 1)); }, hold: () => holdCopy('scene', i), dbl: () => offerDelete(b, 'scene', i) });
  hoverable(b, 'STÄLLNING ' + (i + 1) + ' · HÅLL = KOPIERA · DUBBELTRYCK = NOLLSTÄLL'); return b;
});
ui.minns = el('button', '', { fontSize: '9px', letterSpacing: '0.08em', background: '#f2bcd9', border: '1px solid #0d0307' }, sg); ui.minns.textContent = 'MINNS';
ui.minns.setAttribute('aria-label', 'Minns ställningen (spara scen)');
ui.minns.onclick = () => { S.scenes[S.scene] = clone(S.live); S.smek = 0; save(); render(); lcd(`STÄLLNING ${S.scene + 1} · MINNS`); };
hoverable(ui.minns, () => `MINNS STÄLLNING ${S.scene + 1}`);
// Sängen: an XY bed whose four corners are Ställningar; the finger blends them.
const bed = ui.bed = el('button', 'bed', { ...box(424, 494, 384, 100), position: 'absolute' }); bed.setAttribute('aria-label', 'Sängen (glid mellan fyra ställningar)');
ui.bedDot = el('span', 'bed-dot', null, bed);
ui.corners = [0, 1, 2, 3].map((c) => {
  const b = el('button', 'bed-corner c' + c, null, bed); b.setAttribute('aria-label', 'Sängens hörn ' + (c + 1));
  b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  b.onclick = (ev) => { ev.stopPropagation(); S.corners[c] = (S.corners[c] + 1) % 8; save(); applyBed(); render(); lcd(`SÄNGENS HÖRN ${c + 1} = STÄLLNING ${S.corners[c] + 1}`); };
  hoverable(b, () => `HÖRN ${c + 1} · STÄLLNING ${S.corners[c] + 1} (TRYCK FÖR ATT BYTA)`); return b;
});
const bedMove = (ev) => { const r = bed.getBoundingClientRect(); S.xy = { x: clamp((ev.clientX - r.left) / r.width), y: clamp((ev.clientY - r.top) / r.height) }; applyBed(); renderSoon(); lcd(bedText()); };
bed.addEventListener('pointerdown', (ev) => { ev.preventDefault(); bed.setPointerCapture(ev.pointerId); bedMove(ev);
  const mv = (m) => bedMove(m), up = () => { bed.removeEventListener('pointermove', mv); bed.removeEventListener('pointerup', up); bed.removeEventListener('pointercancel', up); };
  bed.addEventListener('pointermove', mv); bed.addEventListener('pointerup', up); bed.addEventListener('pointercancel', up); });
hoverable(bed, () => bedText());
function bedText() { const [a, b, c, d] = S.corners.map((k) => k + 1); return `SÄNGEN · ${a} ↖ ${b} ↗ ${c} ↙ ${d} ↘ · ${pct(S.xy.x)} / ${pct(S.xy.y)}`; }

// Sextejp (record the master as WAV) and Låt det hända (Klimax comes by itself).
ui.sextejp = el('button', 'sextejp', { ...box(46, 534, 180, 60), position: 'absolute' }); ui.sextejp.setAttribute('aria-label', 'Sextejp (spela in mastern som WAV)');
ui.recDot = heart(16, ui.sextejp); el('span', '', null, ui.sextejp).textContent = 'SEXTEJP'; ui.recTime = el('span', 'time', null, ui.sextejp);
ui.sextejp.onclick = () => arcPress('filma'); hoverable(ui.sextejp, 'SEXTEJP · SPELA IN ALLT SOM LÅTER, SPARAS SOM WAV');
ui.lat = el('button', 'lat', { ...box(232, 534, 182, 60), position: 'absolute' }); ui.lat.setAttribute('aria-label', 'Låt det hända (Klimax av sig själv)');
ui.latLamp = heart(16, ui.lat); el('span', '', null, ui.lat).textContent = 'LÅT DET HÄNDA';
ui.lat.onclick = () => { S.lat = !S.lat; S.lust = 0; render(); lcd(S.lat ? 'LÅT DET HÄNDA · KLIMAX KOMMER NÄR DET VARIT HETT EN STUND' : 'LÅT DET HÄNDA · AV'); };
hoverable(ui.lat, 'LÅT DET HÄNDA · NÄR UPPHETSNINGEN HÅLLER I SIG KOMMER KLIMAX AV SIG SJÄLV');

// Transport
ui.play = el('button', '', { ...box(46, 600, 64, 60), position: 'absolute', border: '1px solid #0d0307', display: 'flex', alignItems: 'center', justifyContent: 'center' });
ui.playIcon = svg(ICON.play, 32, '', ui.play).firstChild; ui.playIcon.setAttribute('fill', '#fff');
ui.play.onclick = () => togglePlay(); hoverable(ui.play, () => (S.playing ? 'AVBRYT (SPACE)' : 'SÄTT IGÅNG (SPACE)'));
const tap = el('button', '', { ...box(116, 600, 60, 60), position: 'absolute', background: '#c9dcc0', border: '1px solid #0d0307', display: 'flex', alignItems: 'center', justifyContent: 'center' });
svg(ICON.tap, 28, 'ico', tap); tap.setAttribute('aria-label', 'Knacka (tap tempo)');
let taps = [];
tap.onclick = () => {
  const t = performance.now(); taps = taps.filter((x) => t - x < 2500); taps.push(t);
  if (taps.length >= 2) { const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1); S.bpm = Math.max(30, Math.min(300, Math.round(60000 / d))); sendTempo(); changed(); }
  lcd('KNACKA PÅ · ' + S.bpm);
};
hoverable(tap, 'KNACKA PÅ · TAP TEMPO');
ui.bpm = el('button', '', { ...box(182, 600, 104, 60), position: 'absolute', background: '#f6f6f2', fontSize: '30px', border: '1px solid #0d0307' }); ui.bpm.setAttribute('aria-label', 'Hjärtfrekvens (BPM)');
control(ui.bpm, { get: () => (S.bpm - 30) / 270, set: (v) => { S.bpm = Math.round(30 + v * 270); sendTempo(); changed(); }, label: () => `HJÄRTFREKVENS · ${effectiveBpm()} BPM` });
ui.tempo = [['mys', 'MYS', 'MYS · HALVTID', 292, 38], ['hets', 'HETS', 'HETS · DUBBELTID', 332, 38], ['fas', '⟲', 'FÖRSONING · BÅDA TILL TAKT 1', 372, 30]].map(([id, t, nm, x, w]) => {
  const b = el('button', '', { ...box(x, 600, w, 60), position: 'absolute', fontSize: '11px', letterSpacing: '0.04em', border: '1px solid #0d0307' }); b.textContent = t; b.setAttribute('aria-label', nm);
  b.onclick = () => { if (id === 'fas') { forsoning(); lcd(nm); return; } S.tempo = S.tempo === id ? '' : id; sendTempo(); changed(); lcd(nm + (S.tempo === id ? '  PÅ' : '  AV')); };
  hoverable(b, nm); return [id, b];
});
// TONART: Älskog sets the key for both machines that play (the synth's root, the
// tune of the newer machines; RUNKINATOR's kick follows with Hångel TONART).
ui.key = el('button', 'key', { ...box(404, 600, 38, 60), position: 'absolute', border: '1px solid #0d0307' }); ui.key.setAttribute('aria-label', 'Tonart');
const keyLabel = () => `TONART · ${KEYS[shownKey()]}`;
function setKey(k) { S.key = ((k % 12) + 12) % 12; sendKey(); save(); render(); lcd(keyLabel()); }
let keyDrag = 0;
ui.key.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ui.key.setPointerCapture(ev.pointerId); keyDrag = 0; const y0 = ev.clientY, k0 = shownKey();
  const mv = (m) => { const d = Math.round((y0 - m.clientY) / 14); if (d !== keyDrag) { keyDrag = d; setKey(k0 + d); } };
  const up = () => { ui.key.removeEventListener('pointermove', mv); ui.key.removeEventListener('pointerup', up); ui.key.removeEventListener('pointercancel', up); if (!keyDrag) setKey(shownKey() + 1); };
  ui.key.addEventListener('pointermove', mv); ui.key.addEventListener('pointerup', up); ui.key.addEventListener('pointercancel', up); });
ui.key.addEventListener('wheel', (ev) => { ev.preventDefault(); setKey(shownKey() + (ev.deltaY < 0 ? 1 : -1)); }, { passive: false });
hoverable(ui.key, keyLabel);
const lcdBox = ui.lcdBox = el('div', 'lcd');
el('div', 'glow', null, lcdBox);
const lt = el('div', 'top', null, lcdBox); el('span', 'name', null, lt).textContent = 'ÄLSKOG 3000'; ui.lcdRight = el('span', 'right', null, lt);
ui.lcdLine = el('div', 'line', null, lcdBox);
const heat = el('div', 'heat', null, lcdBox); ui.heat = Array.from({ length: 16 }, () => heart(13, el('span', '', null, heat)));
const hw = el('div', 'ak-abs', { ...box(754, 600, 54, 60), display: 'flex', alignItems: 'center', justifyContent: 'center' });
ui.heart = heart(42, hw); ui.heartSvg = ui.heart.parentNode;

// Idka samlag + stages + Efterspel; Kall dusch and Filma.
const ag = el('div', 'ak-abs', { ...box(824, 398, 230, 262), display: 'flex', flexDirection: 'column', gap: '5px' });
ui.arc = [];
const arcBtn = (parent, id, t, h, fs, bg, nm, fg = '#141414') => {
  const b = el('button', '', { height: px(h), flex: '1 1 0', background: bg, fontSize: px(fs), letterSpacing: '0.12em', lineHeight: '1.1', border: '1px solid #0d0307', color: fg }, parent);
  b.textContent = t; b.setAttribute('aria-label', nm); b.onclick = () => arcPress(id); hoverable(b, nm); ui.arc.push([id, b, bg, fg]); return b;
};
const arow = (h) => el('div', '', { display: 'flex', gap: '5px', height: px(h), flex: '0 0 auto' }, ag);
arcBtn(arow(34), 'samlag', 'IDKA SAMLAG', 34, 13, '#f06c99', 'IDKA SAMLAG · HELA KURVAN AUTOMATISKT', '#fff');
{ const r = arow(30); arcBtn(r, 'forspel', 'FÖRSPEL', 30, 10, '#f2bcd9', 'FÖRSPEL · VÄRM UPP OCH STANNA DÄR'); arcBtn(r, 'vuxenmys', 'VUXENMYS', 30, 10, '#e396c0', 'VUXENMYS · DET HETTAR TILL'); }
arcBtn(arow(30), 'knull', 'KNULLKNULLKNULL', 30, 12, '#d45d9a', 'KNULLKNULLKNULL · TRUMVIRVEL OCH RISER');
arcBtn(arow(46), 'klimax', 'KLIMAX', 46, 20, '#e0436e', 'KLIMAX · ANDETAG, DROP PÅ ETTAN, 8 TAKTER EFTERGLÖD', '#fff');
{ const r = arow(30); arcBtn(r, 'cigg', 'CIGG PÅ SÄNGKANTEN', 30, 8, '#c3b0e0', 'CIGG PÅ SÄNGKANTEN · BREAKDOWN, KICKEN VILAR'); arcBtn(r, 'runda', 'RUNDA TVÅ', 30, 10, '#b03a5c', 'RUNDA TVÅ · TILLBAKA ÄNNU HÅRDARE', '#fff'); }
{ const r = arow(30); arcBtn(r, 'efterspel', 'EFTERSPEL', 30, 11, '#9d8cc0', 'EFTERSPEL · FRYS, TONA UT, BROMSA'); arcBtn(r, 'dusch', 'KALL DUSCH', 30, 11, '#6fb6d8', 'KALL DUSCH · ALLT NEUTRALT'); }
function arcPress(id) {
  if (id === 'dusch') { kallDusch(); return; }
  if (id === 'filma') {
    if (!host.node) { lcd('SÄTT IGÅNG FÖRST'); return; }
    S.rec = !S.rec; S.recStart = performance.now(); pushParams(); render();
    if (!S.rec) setTimeout(saveRecording, 200); lcd(S.rec ? 'SEXTEJPEN RULLAR …' : 'SEXTEJPEN SPARAD · WAV'); return;
  }
  if (!S.playing) { lcd('SÄTT IGÅNG FÖRST'); return; }
  const current = S.auto ? 'samlag' : S.arc === 'andas' ? arc.into : S.arc;
  if (current === id) { endArc(true); lcd(NAME[id] + ' · AVBRUTEN'); return; }
  if (id === 'efterspel') { if (!arcBase) arcBase = clone(S.live); S.auto = false; S.arc = 'efterspel'; S.arcStart = beatPos(); arc.punch = ''; setRoll(false); pushParams(); render(); return; }
  startArc(id);
}

// Älskog-listen (Vulva/RUNKINATOR views)
const strip = document.querySelector('#strip');
ui.sPlay = el('button', 'play', null, strip); ui.sPlayIcon = svg(ICON.play, 26, '', ui.sPlay).firstChild; ui.sPlayIcon.setAttribute('fill', '#fff'); ui.sPlay.onclick = () => togglePlay();
ui.sBpm = el('span', 'bpm', null, strip);
ui.sLampNames = [];
ui.sLamps = ['VULVA', 'RUNK', 'KROPP'].map((t) => { const w = el('span', 'lamp', null, strip); const h = heart(20, w); const n = el('span', '', null, w); n.textContent = t; ui.sLampNames.push(n); return h; });
ui.sHeart = heart(32, strip); ui.sHeartSvg = ui.sHeart.parentNode;
el('span', 'grow', null, strip);
// The current machine's banks, right where you play it.
const sb = ui.sBankRow = el('span', 'banks', null, strip);
ui.sBanks = Array.from({ length: 8 }, (_, k) => {
  const b = el('button', '', null, sb); b.textContent = BANK[k];
  const type = () => (S.view === 0 ? 'vulva' : 'runk');
  gestures(b, {
    tap: () => { if (!banksHere()) return; if (pasteTo(type(), k)) return; if (S.view === 0) selectVulvaBank(k); else { const r = api('runkinator'); if (r) r.update('zzzz_bank', k); } renderSoon(); },
    hold: () => { if (banksHere()) holdCopy(type(), k); }, dbl: () => { if (banksHere()) offerDelete(b, type(), k); } });
  return b;
});
// Banks A–H belong to RUNKINATOR and VULVA; the other machines keep their own.
function banksHere() { return S.view === 0 ? machineOf('synth').id === 'vulva' && !!api('vulva') : S.view === 2 ? machineOf('rytm').id === 'runkinator' && !!api('runkinator') : false; }
ui.sKyss = el('button', 'kyss', null, strip); ui.sKyss.textContent = 'KYSS';
ui.sKyss.addEventListener('pointerdown', (ev) => { ev.preventDefault(); S.punch = 'kyss'; pushParams(); render(); });
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) ui.sKyss.addEventListener(t, () => { if (S.punch === 'kyss') { S.punch = ''; pushParams(); render(); } });

// ---------------------------------------------------------------- Porrfilm overlay
// A film strip of 16 scenes. A scene = which roles (RUNK bank, VULVA bank), which
// Ställning and how many bars. Everything is edited right on the scene.
const pf = document.querySelector('#pf-body'), pfTab = document.querySelector('#pf-tab');
function openPorrfilm(open) { S.porrfilm = open; document.body.classList.toggle('pf-open', open); pfTab.setAttribute('aria-expanded', String(open)); if (!open && S.copyFrom) S.copyFrom = null; fit(); render(); }
pfTab.onclick = () => openPorrfilm(!S.porrfilm);
for (let x = 22; x < 1080; x += 28) for (const y of [9, 451]) el('span', 'sprocket', box(x, y, 14, 10), pf);
el('div', 'pf-title', box(30, 28, 250, 52), pf).innerHTML = '<span class="clap"></span><span>PORRFILM 3000</span>';
ui.brev = el('button', 'pf-action', box(290, 28, 170, 52), pf); ui.brev.onclick = () => toggleManus();
hoverable(ui.brev, () => (S.brev ? 'CUT! · STOPPA FILMEN' : 'ACTION! · SPELA SCENERNA I ORDNING, FRÅN NÄSTA ETTA'));
ui.trogen = el('button', 'pf-toggle', box(468, 28, 220, 52), pf);
ui.trogen.onclick = () => { S.trogen = !S.trogen; save(); render(); lcd(S.trogen ? 'ENLIGT MANUS · SCENERNA BYTER ÄVEN STÄLLNING' : 'IMPROVISERA · SCENERNA BYTER BARA ROLLER, MIXEN ÄR DIN'); };
hoverable(ui.trogen, () => (S.trogen ? 'ENLIGT MANUS · SCENERNA BYTER ÄVEN STÄLLNING' : 'IMPROVISERA · SCENERNA BYTER BARA ROLLER, MIXEN ÄR DIN'));
ui.pfStatus = el('div', 'pf-status', box(696, 28, 230, 52), pf);
ui.burn = el('button', 'pf-btn burn', box(934, 28, 84, 52), pf); ui.burn.textContent = 'RIV'; ui.burn.setAttribute('aria-label', 'Riv manuset');
ui.burn.onclick = () => burnLetters(); hoverable(ui.burn, 'RIV MANUSET · TÖMMER ALLA SCENER, INGET ANNAT');
function burnLetters() {
  if (!S.chain.some(Boolean)) { lcd('INGET MANUS ATT RIVA'); return; }
  if (!confirm('Riv manuset? Alla scener töms (roller, ställningar och mix rörs inte).')) return;
  stopManus(); S.chain = new Array(16).fill(null); save(); render(); lcd('MANUSET RIVET');
}
const helpBtn = el('button', 'pf-btn help', box(1024, 28, 46, 52), pf); helpBtn.textContent = '?'; helpBtn.setAttribute('aria-label', 'Så funkar filmen');
const help = el('div', 'pf-help', box(30, 92, 1040, 342), pf); help.hidden = true;
help.innerHTML = `<h3>Så funkar filmen</h3>
<div class="help-cols">
<div><b>1. Musiken spelas in i maskinerna.</b> Noter och trummor spelar du in i Vulva och RUNKINATOR som vanligt. Varje maskin har åtta mönster: <i>roller</i> A–H (knapparna i listen längst ned på deras sidor).</div>
<div><b>2. En scen är ett recept, inte en inspelning.</b> "Spela RUNK B och VULVA A, med ställning 3, i 4 takter." Tryck på en tom ruta så blir det som låter just nu en scen. Tryck på en bricka i rutan för att ändra den.</div>
<div><b>3. ACTION! spelar scenerna i ordning</b> från vänster, från nästa etta, och börjar om. Vid varje scenbyte byter maskinerna roll (och Älskog ställning, om <i>Enligt manus</i>).</div>
<div><b>4. ● är det enda som spelas in i realtid:</b> tryck ● på en scen, så spelas dina reglagerörelser in nästa gång den scenen spelar och upprepas sedan varje varv. Håll ● för att sudda.</div>
</div>
<p class="help-gestures">HÅLL = KOPIERA (tryck sedan där den ska ligga) · DUBBELTRYCK = ✕ TA BORT · Samma sak på roller och ställningar.</p>`;
helpBtn.onclick = () => { help.hidden = !help.hidden; };
help.onclick = () => { help.hidden = true; };
const mg = el('div', 'grid', { ...box(30, 92, 1040, 342), gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: '8px' }, pf);
const LENS = [1, 2, 4, 8];
const chip = (parent, cls, label, onTap) => {
  const c = el('span', 'chip ' + cls, null, parent); c.setAttribute('role', 'button'); c.setAttribute('aria-label', label);
  c.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  c.addEventListener('click', (ev) => { ev.stopPropagation(); onTap(); save(); render(); }); return c;
};
ui.chain = Array.from({ length: 16 }, (_, i) => {
  const b = el('button', 'pf-card', null, mg); b.setAttribute('aria-label', 'Scen ' + (i + 1));
  const c = () => S.chain[i];
  const card = { b, n: el('span', 'n', null, b), empty: el('span', 'plus', null, b) };
  card.empty.textContent = '+';
  card.len = chip(b, 'len', `Scen ${i + 1} längd`, () => { const x = c(); x.len = LENS[(LENS.indexOf(x.len || 4) + 1) % 4]; lcd(`SCEN ${i + 1} · ${x.len} TAKTER`); });
  card.r = chip(b, 'role runk', `Scen ${i + 1} RUNK-roll`, () => { const x = c(); x.r = (x.r + 1) % 8; lcd(`SCEN ${i + 1} · RUNK ${BANK[x.r]}`); });
  card.v = chip(b, 'role vulva', `Scen ${i + 1} VULVA-roll`, () => { const x = c(); x.v = (x.v + 1) % 8; lcd(`SCEN ${i + 1} · VULVA ${BANK[x.v]}`); });
  card.s = chip(b, 'stl', `Scen ${i + 1} ställning`, () => { const x = c(); x.s = Number.isInteger(x.s) ? (x.s < 7 ? x.s + 1 : null) : 0; lcd(`SCEN ${i + 1} · ${Number.isInteger(x.s) ? 'STÄLLNING ' + (x.s + 1) : 'INGEN STÄLLNING (IMPRO)'}`); });
  card.rec = chip(b, 'rec', `Scen ${i + 1} tagning`, () => {
    if (S.takeArm === i) { S.takeArm = -1; lcd('TAGNING AVBRUTEN'); return; }
    S.takeArm = i; if (!S.brev) startManus(); lcd(`● SCEN ${i + 1} SPELAR IN DINA REGLAGE NÄSTA GÅNG DEN SPELAR`);
  });
  let recHold = 0; card.rec.addEventListener('pointerdown', () => { recHold = setTimeout(() => { if (c() && c().take) { c().take = null; save(); render(); lcd(`SCEN ${i + 1} · TAGNINGEN SUDDAD`); } }, 600); });
  for (const n of ['pointerup', 'pointerleave', 'pointercancel']) card.rec.addEventListener(n, () => clearTimeout(recHold));
  gestures(b, {
    tap: () => {
      if (pasteTo('manus', i)) return;
      if (!c()) { S.chain[i] = { r: runkBank(), v: S.vulvaBank, s: S.trogen ? S.scene : null, len: 4, take: null }; save(); render(); lcd(slotLong(S.chain[i], i)); }
      else lcd(slotLong(c(), i));
    },
    hold: () => holdCopy('manus', i), dbl: () => { if (c()) offerDelete(b, 'manus', i); }
  });
  hoverable(b, () => (c() ? slotLong(c(), i) + ' · HÅLL = KOPIERA · DUBBELTRYCK = ✕' : `SCEN ${i + 1} · TOM · TRYCK = GÖR EN SCEN AV DET SOM LÅTER NU`));
  return card;
});

// ---------------------------------------------------------------- render
const deg = (v) => -135 + v * 270;
function setPtr(line, v) { line.setAttribute('transform', `rotate(${deg(v)} 50 50)`); }
function render() {
  paintPorrfilm();
  const L = S.live;
  ui.strips.forEach((s) => {
    const q = L.ch[s.c.id];
    s.svett.style.top = px(Math.round((1 - q.svett) * 86)); s.lust.style.top = px(Math.round((1 - q.lust) * 126));
    s.sovrum.style.top = px(Math.round((1 - q.sovrum) * 86)); s.eko.style.top = px(Math.round((1 - (q.eko || 0)) * 86)); s.pan.style.left = px(Math.round(q.pan * 106));
    s.kill.forEach((b, j) => { const on = q.kill['bmt'[j]]; b.style.background = on ? '#14050b' : s.c.color; b.style.color = on ? s.c.color : '#141414'; b.setAttribute('aria-pressed', String(on)); });
    s.btn.forEach(([k, b]) => { const on = q[k]; b.style.background = on ? (k === 'duck' ? '#e0436e' : '#f4ecd8') : s.c.dim; b.style.color = on ? (k === 'duck' ? '#fff' : '#141414') : '#e8d5dc'; b.setAttribute('aria-pressed', String(on)); });
  });
  ui.master.forEach(([k, ptr]) => setPtr(ptr, L.master[k])); ui.ekotidName.textContent = 'EKO ' + ekotidName();
  ui.xf.style.left = px(Math.round(10 + L.xf * 210)); setPtr(ui.vibrator, L.vibrator || 0);
  ui.hangel.forEach(([h, b]) => { const v = L.hangel[h.id], on = h.knob ? v > 0.02 : !!v; b.style.background = h.knob ? (on ? '#f06c99' : '#7a3a52') : (on ? '#f2bcd9' : '#7a3a52'); b.firstChild.firstChild.style.stroke = on ? '#141414' : '#f2bcd9'; b.setAttribute('aria-pressed', String(on)); });
  ui.kropp.style.left = px(Math.round(L.master.kropp * 164)); setPtr(ui.strypPtr, L.master.stryp);
  ui.sked.textContent = L.sked ? 'SKED' : 'ISÄR';
  ui.puls.forEach((b, i) => { b.style.background = L.puls.src === i ? '#e8f3df' : '#9db592'; b.setAttribute('aria-pressed', String(L.puls.src === i)); });
  ui.pulsKnobs.forEach(([k, ptr]) => setPtr(ptr, L.puls[k]));
  const active = S.punch || (S.gral >= 0 ? gralPunch : '');
  ui.punch.forEach(([id, b]) => { const on = active === id; b.style.background = on ? '#fff3b6' : id === 'dusch' ? '#6fb6d8' : '#d45d9a'; b.firstChild.firstChild.style.stroke = on ? '#c0285f' : '#141414'; });
  ui.kama.forEach(([b, path], i) => { const v = S.live.kamasutra[i]; path.setAttribute('d', v ? ICON[KAMA[v]] : ''); b.style.background = v ? '#d45d9a' : (i % 4 === 0 ? '#5a1f33' : '#45162a'); b.style.border = S.playing && S.step === i ? '2px solid #fff3b6' : '1px solid #0d0307'; });
  ui.scenes.forEach((b, i) => { b.style.background = S.scene === i ? '#c9a86a' : '#efe6cf'; b.setAttribute('aria-pressed', String(S.scene === i)); });
  paintBanks();
  ui.play.style.background = S.playing ? '#45ad4c' : '#2f6b33'; ui.playIcon.setAttribute('d', S.playing ? ICON.pause : ICON.play);
  ui.play.setAttribute('aria-label', S.playing ? 'Avbryt' : 'Sätt igång');
  ui.sPlay.style.background = S.playing ? '#45ad4c' : '#2f6b33'; ui.sPlayIcon.setAttribute('d', S.playing ? ICON.pause : ICON.play);
  ui.bpm.textContent = effectiveBpm(); ui.sBpm.textContent = effectiveBpm();
  ui.key.textContent = KEYS[shownKey()]; ui.key.classList.toggle('set', S.key !== null);
  ui.tempo.forEach(([id, b]) => { const on = S.tempo === id; b.style.background = on ? '#fff3b6' : '#c9dcc0'; b.setAttribute('aria-pressed', String(on)); });
  const cur = S.arc === 'andas' ? arc.into : S.arc, nextAuto = S.auto ? SAMLAG[SAMLAG.indexOf(cur) + 1] : '';
  ui.arc.forEach(([id, b, bg, fg]) => { const on = cur === id || (id === 'samlag' && S.auto);
    b.style.background = on ? '#fff3b6' : bg; b.style.color = on ? '#141414' : fg;
    b.classList.toggle('blink', id === nextAuto || (id === 'klimax' && !S.arc && heatLevel >= 14)); });
  ui.sextejp.classList.toggle('on', S.rec); ui.lat.classList.toggle('on', !!S.lat); ui.latLamp.setAttribute('fill', S.lat ? '#ff4f7b' : '#3b1220');
  ui.recDot.setAttribute('fill', S.rec ? '#ff2d5f' : '#7a3a52'); if (!S.rec) ui.recTime.textContent = '';
  ui.sKyss.style.background = S.punch === 'kyss' ? '#fff3b6' : '#d45d9a';
  const dur = (60 / effectiveBpm()).toFixed(3) + 's';
  for (const h of [ui.heartSvg, ui.sHeartSvg]) { h.classList.toggle('beat', S.playing); h.style.animationDuration = dur; }
  for (const h of [ui.heart, ui.sHeart]) h.setAttribute('fill', performance.now() - heartFlash < 1500 ? '#ff2d5f' : S.playing ? '#e0436e' : '#5a2b39');
  paintLcd();
}
let heatLevel = 0;
function paintPorrfilm() {
  const copy = S.copyFrom;
  ui.brev.textContent = S.brev ? 'CUT!' : 'ACTION!'; ui.brev.classList.toggle('rolling', S.brev);
  ui.brev.setAttribute('aria-label', S.brev ? 'Cut (stoppa manuset)' : 'Action (starta manuset)'); ui.brev.setAttribute('aria-pressed', String(S.brev));
  ui.trogen.textContent = S.trogen ? 'ENLIGT MANUS' : 'IMPROVISERA'; ui.trogen.classList.toggle('impro', !S.trogen);
  ui.trogen.setAttribute('aria-label', S.trogen ? 'Enligt manus: scenerna byter ställning' : 'Improvisera: scenerna byter bara roller'); ui.trogen.setAttribute('aria-pressed', String(S.trogen));
  const cur = S.chainPos >= 0 && S.chain[S.chainPos], n = S.chain.filter(Boolean).length;
  const status = S.taking ? `● SPELAR IN · SCEN ${S.taking.slot + 1}` : cur ? `SCEN ${S.chainPos + 1} · RUNK ${BANK[cur.r]} · VULVA ${BANK[cur.v]}` : S.brev ? 'VÄNTAR PÅ ETTAN' : n ? `${n} SCENER · TRYCK ACTION!` : 'TRYCK PÅ EN RUTA';
  ui.pfStatus.textContent = status;
  pfTab.innerHTML = `<span>${S.porrfilm ? '▲' : '▼'}</span> PORRFILM${S.brev ? ` <b class="${S.taking ? 'recording' : 'rolling'}">● ${cur ? 'SCEN ' + (S.chainPos + 1) : '…'}</b>` : ''}`;
  ui.chain.forEach((card, i) => {
    const c = S.chain[i], b = card.b;
    card.n.textContent = 'SCEN ' + (i + 1);
    b.classList.toggle('filled', !!c); card.empty.hidden = !!c;
    for (const k of ['len', 'r', 'v', 's', 'rec']) card[k].hidden = !c;
    if (c) {
      card.len.textContent = (c.len || 4) + ' T'; card.r.textContent = 'RUNK ' + BANK[c.r]; card.v.textContent = 'VULVA ' + BANK[c.v];
      card.s.textContent = Number.isInteger(c.s) ? '♥ ' + (c.s + 1) : 'IMPRO'; card.s.classList.toggle('off', Number.isInteger(c.s) && !S.trogen);
      card.rec.textContent = c.take ? '● ' + c.take.paths.length : '●'; card.rec.classList.toggle('has', !!c.take);
      card.rec.classList.toggle('armed', S.takeArm === i || !!(S.taking && S.taking.slot === i));
    }
    b.classList.toggle('playing', S.brev && S.chainPos === i);
    b.classList.toggle('copied', !!copy && copy.type === 'manus' && copy.from === i);
    b.classList.toggle('target', !!copy && copy.type === 'manus' && copy.from !== i);
  });
  ui.scenes.forEach((b, k) => { b.classList.toggle('copied', !!copy && copy.type === 'scene' && copy.from === k); b.classList.toggle('target', !!copy && copy.type === 'scene' && copy.from !== k); });
  const bt = S.view === 0 ? 'vulva' : 'runk';
  ui.sBanks.forEach((b, k) => { b.classList.toggle('copied', !!copy && copy.type === bt && copy.from === k); b.classList.toggle('target', !!copy && copy.type === bt && copy.from !== k); });
}
function arcText() {
  const pos = beatPos(), pre = S.auto ? 'SAMLAG · ' : '';
  if (S.arc === 'andas') return arc.breath ? '…HÅLL ANDAN…' : `${pre}${NAME[arc.into]} OM ${Math.max(1, Math.ceil(arc.drop - pos))} SLAG`;
  const def = STAGE[S.arc];
  if (def) return pos < S.arcStart ? `${pre}${NAME[S.arc]} PÅ NÄSTA ETTA` : (S.auto || def.drop) ? `${pre}${NAME[S.arc]} · TAKT ${Math.min(def.bars, Math.floor((pos - S.arcStart) / 4) + 1)}/${def.bars}` : `${NAME[S.arc]} · KVAR TILLS DU BYTER`;
  return NAME[S.arc] + ' …';
}
function paintBanks() {
  ui.sBankRow.hidden = !banksHere();
  const rb = runkBank();
  ui.sBanks.forEach((b, k) => {
    const vul = S.view === 0, on = vul ? k === S.vulvaBank : k === rb;
    b.style.background = on ? (vul ? '#e396c0' : '#c94b5b') : vul ? (S.vulvaBanks[k] ? '#8a4f6d' : '#4a2a3a') : (runkBankEmpty(k) ? '#3a1a22' : '#5c2a33');
    b.style.color = on ? (vul ? '#141414' : '#fff') : '#e8d5dc';
    b.setAttribute('aria-label', (vul ? 'Vulva bank ' : 'RUNKINATOR bank ') + BANK[k] + ' (listen)'); b.setAttribute('aria-pressed', String(on));
  });
}
function paintLcd() {
  const active = S.punch || (S.gral >= 0 ? gralPunch : '');
  const p = PUNCHES.find((x) => x[0] === active);
  ui.lcdLine.textContent = S.arc ? arcText() : p ? '» ' + p[1] : (S.hover || `STÄLLNING ${S.scene + 1}`);
  ui.lcdBox.classList.toggle('msg', !!(S.arc || p || S.hover));
  ui.lcdRight.textContent = S.rec ? '● TEJPAR' : S.playing ? (S.tempo === 'mys' ? 'MYS' : S.tempo === 'hets' ? 'HETS' : '♥ ' + effectiveBpm()) : 'VILAR';
}
function lampFill(on, k, n) { return on ? (k >= n - 2 ? '#ff4f7b' : k >= n * 0.55 ? '#ffd23a' : '#f2a9c4') : '#3b1220'; }
function paintMeters() {
  ui.strips.forEach((s, i) => { const lit = Math.round(Math.min(1, meters.ch[i] * 1.4) * 8); s.lamps.forEach((h, k) => h.setAttribute('fill', lampFill(k < lit, k, 8))); });
  const m = Math.max(meters.master[0], meters.master[1]), lit = Math.round(Math.min(1, m * 1.12) * 12);
  ui.masterLamps.forEach((h, k) => h.setAttribute('fill', lampFill(k < lit, k, 12)));
  ui.stryp.style.color = meters.stryp ? '#ff4f7b' : 'var(--engrave)';
  heatLevel = Math.min(16, Math.round(meters.rms * 40 + (S.punch ? 4 : 0) + S.live.master.svett * 3 + S.live.master.sovrum * 2 + ({ forspel: 4, vuxenmys: 8, knull: 11, andas: 16, klimax: 16, cigg: 2, runda: 16 }[S.arc] || 0)));
  if (S.arc) paintLcd();
  if (S.rec) { const t = Math.floor((performance.now() - S.recStart) / 1000); ui.recTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
  if (S.lat && S.playing && !S.arc) {
    S.lust = Math.max(0, (S.lust || 0) + (heatLevel >= 11 ? 1 : -0.6));
    ui.latLamp.setAttribute('fill', `rgba(255,79,123,${0.3 + 0.7 * Math.min(1, S.lust / 240)})`);
    if (S.lust >= 240) { S.lust = 0; startArc('klimax'); lcd('DET HÄNDER …'); }
  }
  ui.heat.forEach((h, k) => h.setAttribute('fill', k < heatLevel ? (k >= 13 ? '#ff4f7b' : k >= 9 ? '#f2a9c4' : '#fff3b6') : '#3a2a36'));
  ui.sLamps[0].setAttribute('fill', meters.ch[5] > 0.02 ? chanView(5).color : '#3b1220');
  ui.sLamps[1].setAttribute('fill', Math.max(...meters.ch.slice(0, 5)) > 0.02 ? chanView(0).color : '#3b1220');
  ui.sLamps[2].setAttribute('fill', m > 0.02 ? '#f2a9c4' : '#3b1220');
  paintBanks(); paintPorrfilm();
  ui.bedDot.style.left = (S.xy.x * 100) + '%'; ui.bedDot.style.top = (S.xy.y * 100) + '%';
  ui.corners.forEach((b, c) => { b.textContent = S.corners[c] + 1; });
  ui.kama.forEach(([b], i) => { b.style.border = S.playing && S.step === i ? '2px solid #fff3b6' : '1px solid #0d0307'; });

}

// ---------------------------------------------------------------- views, scaling, keys
const navPrev = document.querySelector('#nav-prev'), navNext = document.querySelector('#nav-next');
function setView(v) {
  if (S.view === 0) captureVulva();
  const NAMES = [machineOf('synth').namn, 'ÄLSKOG', machineOf('rytm').namn], SHORT = [machineOf('synth').kort, 'ÄLSKOG', machineOf('rytm').kort];
  S.view = ((v % 3) + 3) % 3; document.body.dataset.view = S.view;
  navPrev.querySelector('.nav-name').textContent = SHORT[(S.view + 2) % 3]; navNext.querySelector('.nav-name').textContent = SHORT[(S.view + 1) % 3];
  navPrev.setAttribute('aria-label', 'Till ' + NAMES[(S.view + 2) % 3]);
  if (ui.sBanks) paintBanks(); navNext.setAttribute('aria-label', 'Till ' + NAMES[(S.view + 1) % 3]);
}
navPrev.onclick = () => setView(S.view - 1); navNext.onclick = () => setView(S.view + 1);
function fit() {
  const pfs = Math.min((innerWidth - 12) / 1100, (innerHeight * 0.82) / 470);
  const pfScale = document.querySelector('#pf-scale'), k = Math.max(0.2, pfs); pfScale.style.height = (470 * k) + 'px'; pfScale.style.width = (1100 * k) + 'px'; pf.style.transform = `scale(${k})`;
  const s = Math.min((innerWidth - 150) / 1100, (innerHeight - 30) / 700);
  document.querySelector('#ak-scale').style.transform = `scale(${Math.max(0.2, s)})`;
}
addEventListener('resize', fit);
addEventListener('keydown', (ev) => {
  if (ev.target.closest && ev.target.closest('input,textarea,select')) return;
  if (ev.code === 'Space' && !ev.repeat) { ev.preventDefault(); togglePlay(); }
  else if (ev.key === '[' || ev.key === 'ArrowLeft' && ev.altKey) setView(S.view - 1);
  else if (ev.key === ']' || ev.key === 'ArrowRight' && ev.altKey) setView(S.view + 1);
});
// Swipe between machines on touch screens (outside the panel controls).
let swipe = null;
addEventListener('touchstart', (e) => { if (e.touches.length === 1 && !e.target.closest('#ak-body button')) swipe = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
addEventListener('touchend', (e) => { if (!swipe) return; const t = e.changedTouches[0], dx = t.clientX - swipe[0], dy = t.clientY - swipe[1]; swipe = null; if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2) setView(S.view + (dx < 0 ? 1 : -1)); }, { passive: true });

// ---------------------------------------------------------------- menu: app, sessions, guide
const gear = document.querySelector('#gear'), menuEl = document.querySelector('#ak-menu');
const openMenu = (open) => { menuEl.hidden = !open; gear.setAttribute('aria-expanded', String(open)); if (open) document.querySelector('#menu-close').focus(); };
gear.onclick = () => openMenu(menuEl.hidden);
document.querySelector('#menu-close').onclick = () => openMenu(false);
addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !menuEl.hidden) openMenu(false); });
addEventListener('pointerdown', (ev) => { if (!menuEl.hidden && !menuEl.contains(ev.target) && !gear.contains(ev.target)) openMenu(false); }, true);
let installPrompt = null;
const install = document.querySelector('#m-install'), installHelp = document.querySelector('#m-install-help');
const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
const paintInstall = () => { if (standalone()) { install.textContent = 'Appen är installerad'; install.disabled = true; } };
addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installPrompt = ev; });
addEventListener('appinstalled', () => { installPrompt = null; paintInstall(); });
install.onclick = async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice.catch(() => null); installPrompt = null; paintInstall(); return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  installHelp.hidden = false;
  installHelp.textContent = ios ? 'I Safari: tryck på Dela-knappen och välj "Lägg till på hemskärmen".' : 'Öppna webbläsarens meny och välj "Installera app" eller "Lägg till på hemskärmen".';
};
paintInstall();
document.querySelector('#m-save').onclick = () => {
  captureVulva();
  const data = { format: 'alskog-session', version: 1, live: S.live, scenes: S.scenes, scene: S.scene, bpm: S.bpm, chain: S.chain, vulvaBanks: S.vulvaBanks, vulvaBank: S.vulvaBank, trogen: S.trogen, key: S.key, rytm: S.rytm, synth: S.synth };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = 'Alskog-session.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); lcd('SESSIONEN SPARAD');
};
document.querySelector('#m-midi').onclick = () => {
  for (const k of SLOTS) frameDoc(k)?.querySelector('#midi')?.click();
  const r = machineOf('rytm'), y = machineOf('synth');
  openMenu(false); lcd(`MIDI · BÅDA MASKINERNA LYSSNAR (${r.kort} CH${r.midi || '1'} · ${y.kort} CH${y.midi || '1'})`);
};
document.querySelector('#m-open').onclick = () => document.querySelector('#m-file').click();
document.querySelector('#m-file').onchange = async (ev) => {
  const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.format !== 'alskog-session' || d.version !== 1) throw new Error('Det är inte en Älskog-session.');
    S.live = upgradeLive(Object.assign(defaultLive(), d.live));
    if (Array.isArray(d.scenes) && d.scenes.length === 8) S.scenes = d.scenes.map(upgradeLive);
    S.scene = Number.isInteger(d.scene) ? d.scene : 0; S.bpm = Number.isFinite(d.bpm) ? d.bpm : S.bpm;
    if (Array.isArray(d.chain) && d.chain.length === 16) S.chain = d.chain.map((c) => (c && typeof c === 'object' ? c : null));
    if (Array.isArray(d.vulvaBanks) && d.vulvaBanks.length === 8) S.vulvaBanks = d.vulvaBanks;
    S.trogen = d.trogen !== false; const vb = Number.isInteger(d.vulvaBank) ? d.vulvaBank : 0; S.vulvaBank = vb;
    const v = api('vulva'); if (v && S.vulvaBanks[vb]) for (const [id, val] of S.vulvaBanks[vb]) v.set(id, val);
    S.key = Number.isInteger(d.key) && d.key >= 0 && d.key < 12 ? d.key : null;
    pushParams(); sendTempo(); sendKey(); save(); render(); openMenu(false); lcd('SESSIONEN ÖPPNAD');
    for (const k of SLOTS) if (REG[k].some((m) => m.id === d[k]) && d[k] !== machineOf(k).id) await swap(k, d[k]);
  } catch (error) { lcd(String(error.message || error).toUpperCase()); }
};
document.querySelector('#m-reset').onclick = () => {
  if (!confirm('Göra slut? Allt i Älskog nollställs: mix, ställningar, Vulva-banker och brev. Maskinernas egna inställningar påverkas inte.')) return;
  try { localStorage.removeItem(STORE); } catch { /* private mode */ }
  location.reload();
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------------------------------------------------------------- the slots: which machine is in bed
const stage = document.querySelector('#stage'), alskogView = document.querySelector('#alskog-view');
function mount(k, id) {
  const m = REG[k].find((x) => x.id === id) || REG[k][0];
  const f = document.createElement('iframe');
  f.id = 'frame-' + m.kort.toLowerCase(); f.className = 'machine'; f.dataset.slot = k; f.dataset.machine = m.id;
  f.allow = 'midi; autoplay'; f.title = m.namn + ' 3000'; f.src = `machines/${m.id}/index.html`;
  slot[k] = { m, frame: f, met: false }; S[k] = m.id;
  stage.insertBefore(f, alskogView);
  return m;
}
// Swap the machine in a slot. Only two machines are ever loaded: the one that
// leaves is stopped, its engine released and its frame removed before the new one loads.
async function swap(k, id) {
  if (S.swapping || machineOf(k).id === id || !REG[k].some((m) => m.id === id)) return;
  const old = slot[k], playing = S.playing;
  S.swapping = k; S.key = shownKey(); // the key the old one played in stays
  if (old.m.id === 'vulva') captureVulva();
  call(k, 'start', false); call(k, 'halt', k);
  if (S.copyFrom) S.copyFrom = null;
  host.release(old.m.id);
  try { old.frame.src = 'about:blank'; } catch { /* gone */ }
  old.frame.remove();
  const m = mount(k, id);
  paintChannels(); renderMenuSlots(); pushParams(); render(); lcd(`${m.namn} KLIVER IN …`);
  try {
    await waitFor(() => hookOf(k), 60000);
    if (m.id === 'vulva') { const v = hookOf(k); if (v && S.vulvaBanks[S.vulvaBank]) for (const [n, val] of S.vulvaBanks[S.vulvaBank]) v.set(n, val); }
    if (host.ctx && (starting || playing)) {
      await call(k, 'ensure'); call(k, 'prime', k);
      if (playing && S.playing) { sendTempo(); sendKey(); call(k, 'start', true); call(k, 'meet', k); forsoning(); }
    }
    sendTempo(); sendKey();
    lcd(`${m.namn} 3000 I SÄNGEN`);
  } catch { lcd(`${m.namn} VILL INTE · FÖRSÖK IGEN`); }
  S.swapping = ''; save(); renderMenuSlots(); render();
}
function waitFor(test, ms) {
  return new Promise((resolve, reject) => { const t0 = performance.now(); const tick = () => { const v = test(); if (v) resolve(v); else if (performance.now() - t0 > ms) reject(new Error('timeout')); else setTimeout(tick, 50); }; tick(); });
}
// The choice lives under the gear: one row per slot, one button per machine.
const slotsEl = document.querySelector('#m-slots');
function renderMenuSlots() {
  slotsEl.replaceChildren();
  for (const k of SLOTS) {
    if (REG[k].length < 2) continue;
    const row = el('div', 'slot-row', null, slotsEl);
    el('span', 'slot-name', null, row).textContent = k === 'rytm' ? 'Rytm' : 'Synth';
    for (const m of REG[k]) {
      const b = el('button', 'slot-pick', null, row); b.type = 'button'; b.textContent = m.namn; b.style.setProperty('--ch', m.farg);
      const on = machineOf(k).id === m.id; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', `${k === 'rytm' ? 'Rytm' : 'Synth'}: ${m.namn} 3000`);
      b.disabled = !!S.swapping; if (S.swapping === k && on) b.classList.add('laddar');
      b.onclick = () => swap(k, m.id);
    }
  }
  slotsEl.hidden = !slotsEl.childElementCount;
}
host.swap = swap;
for (const k of SLOTS) mount(k, S[k]);
paintChannels(); renderMenuSlots();

setView(1); fit(); render();
lcd('ÄLSKOG VÄNTAR · SÄTT IGÅNG');
