// TAXFREE 3000 Web Application.
// Sound is rendered by the PlugData patch engine (taxfree.pd -> hvcc -> wasm) via AudioWorklet.
const $ = (id) => document.getElementById(id);
const ship = $('ship');
const STORAGE = 'taxfree-session-v1';
const CHANNEL = 3; // MIDI channel 4 (0-based: 3)

let ac = null, node = null, ready = false, starting = null, midiAccess = null;
let currentOct = 0;
const state = {
  params: {},
  bottles: [0, 0, 2, 0, 0, 0, 2, 1, 0, 0, 2, 0, 0, 1, 2, 0],
  arp: 0,
  ekotid: 1,
  hold: false,
  playing: false,
  bpm: 100,
  swing: 0,
  length: 16
};
const eventsLog = [];
const pendingMessages = [];

// Parameter metadata for UI labels and formatting
const KNOBS_META = {
  rakbuffe: { name: 'RÄKBUFFÉ', desc: 'FILTER CUTOFF', group: 'groupKlang' },
  dimma: { name: 'DIMMA', desc: 'RESONANS', group: 'groupKlang' },
  vagfyll: { name: 'VÅGFYLLA', desc: 'WAVEFOLD', group: 'groupKlang' },
  stot: { name: 'STÖT', desc: 'DECAY / LÄNGD', group: 'groupKlang' },

  klirr: { name: 'KLIRR', desc: 'FLASKRESONANS', group: 'groupGlas' },
  spritback: { name: 'SPRITBACK', desc: 'KLANGTID', group: 'groupGlas' },
  tullkvot: { name: 'TULLKVOT', desc: 'DRIVE', group: 'groupGlas' },

  sjogang: { name: 'SJÖGÅNG', desc: 'SVAJ / DYNING', group: 'groupSjo' },
  kuling: { name: 'KULING', desc: 'FART', group: 'groupSjo' },

  eko: { name: 'BANDEKO', desc: 'MÄNGD', group: 'groupEko' },
  ekofb: { name: 'SVALL', desc: 'ÅTERKOPPLING', group: 'groupEko' },
  gung: { name: 'GUNG', desc: 'GATE-DJUP', group: 'groupEko' },
  diskotek: { name: 'DISKOTEK', desc: 'RUMSKLANG', group: 'groupEko' },

  volume: { name: 'VOLYM', desc: 'MASTERVOLYM', group: 'groupMaster' }
};

// Window host hook
const hook = new EventTarget();
window.taxfree = hook;

Object.defineProperties(hook, {
  values: { get: () => ({ ...state.params, bpm: state.bpm, start: state.playing ? 1 : 0, hold: state.hold ? 1 : 0, arp: state.arp, ekotid: state.ekotid }) },
  update: { value: (name, val) => setParam(name, val) },
  noteOn: { value: (note, vel = 100) => sendNote(note, vel) },
  noteOff: { value: (note) => sendNote(note, 0) },
  panic: { value: () => { post({ type: 'param', name: 'hold', value: 0 }); } },
  overbord: { value: () => triggerOverbord() },
  ensureAudio: { value: () => ensureAudio() },
  node: { get: () => node },
  context: { get: () => ac },
  ready: { get: () => ready },
  events: { get: () => eventsLog }
});

function post(msg) {
  if (node) node.port.postMessage(msg);
  else pendingMessages.push(msg);
}

function setParam(name, value) {
  state.params[name] = value;
  post({ type: 'param', name, value });
  updateKnobVisual(name, value);
}

function sendNote(note, vel) {
  ensureAudio();
  post({ type: 'midi', bytes: [vel > 0 ? (0x90 | CHANNEL) : (0x80 | CHANNEL), note, vel] });
}

function ensureAudio() {
  if (ac) {
    if (ac.state !== 'running') ac.resume().catch(() => {});
    return starting;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  ac = new AudioCtx({ latencyHint: 'interactive' });
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
  ac.resume().catch(() => {});

  starting = (async () => {
    const parameters = await (await fetch('params.json')).json();
    for (const [k, v] of Object.entries(parameters)) {
      if (!(k in state.params)) state.params[k] = v.default;
    }
    await ac.audioWorklet.addModule('worklet.js');
    node = new AudioWorkletNode(ac, 'taxfree', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { parameters }
    });
    node.port.onmessage = handleEngineEvent;
    node.connect(ac.destination);

    ready = true;
    hook.dispatchEvent(new CustomEvent('ready'));
    for (const [k, v] of Object.entries(state.params)) {
      post({ type: 'param', name: k, value: v });
    }
    for (const msg of pendingMessages.splice(0)) {
      node.port.postMessage(msg);
    }
  })().catch((err) => {
    say('MOTORFEL', String(err.message || err).toUpperCase());
    throw err;
  });
  return starting;
}

const unlockAudio = () => { ensureAudio(); if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}

function say(name, line = '', val = '') {
  $('lname').textContent = name;
  $('lline').textContent = line;
  if (val !== '') $('lval').textContent = val;
}

// Engine events
function handleEngineEvent({ data }) {
  if (!data) return;
  if (data.type === 'ready') {
    ready = true;
    say('TAXFREE · REDO', 'DÄCK 6 KLOCKAN 03:30 I KULING', 'REDO');
    hook.dispatchEvent(new CustomEvent('ready'));
    return;
  }
  if (data.type === 'error') {
    say('MOTORFEL', String(data.message).toUpperCase());
    return;
  }
  if (data.type !== 'ev') return;
  eventsLog.push(data);
  if (eventsLog.length > 200) eventsLog.shift();

  const { name, values } = data;
  if (name === 'ev_voice') {
    const [voice, note, vel] = values;
    updateKeyVisual(note, vel > 0);
    hook.dispatchEvent(new CustomEvent('note', { detail: { voice, note, velocity: vel, time: data.time } }));
  } else if (name === 'ev_pluck') {
    const [voice, note] = values;
    flashKeyVisual(note);
    hook.dispatchEvent(new CustomEvent('pluck', { detail: { voice, note, time: data.time } }));
  } else if (name === 'ev_sjo') {
    const lean = values[0] || 0;
    ship.style.setProperty('--lean', `${(lean * 14).toFixed(2)}deg`);
    hook.dispatchEvent(new CustomEvent('sjo', { detail: { tilt: lean, time: data.time } }));
  } else if (name === 'ev_klirr') {
    const bottleIdx = Math.round(values[0]);
    const el = $(`bottle-${bottleIdx}`);
    if (el) {
      el.classList.remove('clinking');
      void el.offsetWidth;
      el.classList.add('clinking');
    }
    hook.dispatchEvent(new CustomEvent('klirr', { detail: { val: values[0], time: data.time } }));
  } else if (name === 'ev_step') {
    const step = Math.round(values[0]);
    document.querySelectorAll('.tf-bottle').forEach((b, i) => {
      b.classList.toggle('step-lit', i === step);
    });
    hook.dispatchEvent(new CustomEvent('step', { detail: { step, time: data.time } }));
  } else if (name === 'ev_overbord') {
    const isUnder = values[0] > 0.5;
    ship.classList.toggle('underwater', isUnder);
    if (isUnder) {
      say('MAN ÖVERBORD', 'ACKORDET SUGS UNDER VATTENYTAN', 'PLASK');
      spawnBubbles();
    } else {
      say('BRYTER YTAN', 'ACKORDET BRYTER VATTENYTAN PÅ TAKTSLAGET', 'STÄNK');
      triggerSplash();
    }
    hook.dispatchEvent(new CustomEvent('overbord', { detail: { underwater: isUnder ? 1 : 0, time: data.time } }));
  }
}

function triggerOverbord() {
  ensureAudio();
  setParam('overbord', 1);
  setTimeout(() => setParam('overbord', 0), 50);
}

function spawnBubbles() {
  const container = $('bubbles');
  container.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const b = document.createElement('div');
    b.className = 'tf-bubble';
    const sz = 6 + Math.random() * 24;
    b.style.width = `${sz}px`;
    b.style.height = `${sz}px`;
    b.style.left = `${Math.random() * 100}%`;
    b.style.animationDelay = `${(Math.random() * 0.8).toFixed(2)}s`;
    b.style.animationDuration = `${(1.2 + Math.random() * 1.5).toFixed(2)}s`;
    container.appendChild(b);
  }
}

function triggerSplash() {
  const s = $('splash');
  s.classList.remove('splash-active');
  void s.offsetWidth;
  s.classList.add('splash-active');
  setTimeout(() => s.classList.remove('splash-active'), 1200);
}

// Build Knobs
function initKnobs() {
  for (const [id, meta] of Object.entries(KNOBS_META)) {
    buildKnob(id, meta);
  }
}

function buildKnob(id, meta) {
  const group = $(meta.group);
  if (!group) return;

  const wrap = document.createElement('div');
  wrap.className = 'tf-knob-wrap';
  wrap.id = `wrap-${id}`;

  const lbl = document.createElement('label');
  lbl.className = 'ds-engrave';
  lbl.textContent = meta.name;

  const knob = document.createElement('div');
  knob.className = 'ds-knob tf-knob';
  knob.id = `knob-${id}`;
  knob.setAttribute('role', 'slider');
  knob.setAttribute('aria-label', `${meta.name} (${meta.desc})`);
  knob.setAttribute('aria-valuemin', '0');
  knob.setAttribute('aria-valuemax', '100');
  knob.tabIndex = 0;

  const dot = document.createElement('span');
  dot.className = 'ds-knob-dot';
  knob.appendChild(dot);

  wrap.appendChild(knob);
  wrap.appendChild(lbl);
  group.appendChild(wrap);

  let startY = 0, startVal = 0;
  function updateVisual(val) {
    const norm = Math.max(0, Math.min(1, val));
    const deg = -140 + norm * 280;
    knob.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    knob.setAttribute('aria-valuenow', Math.round(norm * 100));
  }

  function onPointerDown(e) {
    ensureAudio();
    startY = e.clientY;
    startVal = state.params[id] !== undefined ? state.params[id] : 0.5;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e) {
    const dy = startY - e.clientY;
    const next = Math.max(0, Math.min(1, startVal + dy * 0.006));
    setParam(id, next);
    updateVisual(next);
    showVal(next);
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function showVal(val) {
    const pct = Math.round(val * 100);
    say(meta.name, meta.desc, `${pct}`);
  }

  wrap.addEventListener('pointerdown', onPointerDown);
  wrap.addEventListener('pointerenter', () => {
    const cur = state.params[id] !== undefined ? state.params[id] : 0.5;
    showVal(cur);
  });

  const initVal = state.params[id] !== undefined ? state.params[id] : 0.5;
  updateVisual(initVal);
}

function updateKnobVisual(id, val) {
  const knob = $(`knob-${id}`);
  if (!knob) return;
  const norm = Math.max(0, Math.min(1, val));
  const deg = -140 + norm * 280;
  knob.style.transform = `rotate(${deg.toFixed(1)}deg)`;
  knob.setAttribute('aria-valuenow', Math.round(norm * 100));
}

// Build Spritbacken (16 Bottles)
function initCrate() {
  const crate = $('crate');
  crate.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const btn = document.createElement('button');
    btn.className = 'tf-bottle';
    btn.id = `bottle-${i}`;
    btn.dataset.index = i;
    const initial = state.bottles[i] || 0;
    btn.dataset.state = initial;
    btn.title = `Flaska ${i + 1}`;

    btn.addEventListener('click', () => {
      ensureAudio();
      let cur = parseInt(btn.dataset.state, 10);
      cur = (cur + 1) % 3;
      btn.dataset.state = cur;
      state.bottles[i] = cur;
      setParam(`g${i}`, cur);

      const label = cur === 0 ? 'TOM' : (cur === 1 ? 'FULL' : 'ACCENT');
      say(`FLASKA ${i + 1}`, `STEG ${i + 1} I SPRITBACKEN`, label);
    });

    crate.appendChild(btn);
  }
}

// Build Bar Counter Klaviatur (25 Keys, C3 to C5: 48..72)
const WHITE_NOTES = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
const BLACK_NOTES = [49, 51, 54, 56, 58, 61, 63, 66, 68, 70];
const BLACK_OFFSETS = {
  49: 1, 51: 2, 54: 4, 56: 5, 58: 6,
  61: 8, 63: 9, 66: 11, 68: 12, 70: 13
};

function initKeyboard() {
  const container = $('keys');
  container.innerHTML = '';

  for (let sem = 0; sem <= 24; sem++) {
    const note = 48 + sem;
    const isBlack = BLACK_NOTES.includes(note);
    const k = document.createElement('div');
    k.id = `key${sem}`;
    k.className = `tf-key ${isBlack ? 'tf-key-black' : 'tf-key-white'}`;
    k.dataset.note = note;
    k.dataset.sem = sem;
    if (isBlack) {
      const whiteIdx = BLACK_OFFSETS[note];
      k.style.left = `${(whiteIdx / 15) * 100}%`;
    }
    container.appendChild(k);
  }

  // Delegated pointer handling for multi-touch and mouse
  const fingers = new Map();
  const keyAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.classList.contains('tf-key') ? el : null;
  };

  container.addEventListener('pointerdown', (e) => {
    ensureAudio();
    const el = keyAt(e.clientX, e.clientY);
    if (!el) return;
    e.preventDefault();
    try { container.setPointerCapture(e.pointerId); } catch {}
    fingers.set(e.pointerId, el);
    const note = parseInt(el.dataset.note, 10);
    sendNote(note + currentOct * 12, 100);
    el.classList.add('active');
    say('BARDISKEN', 'NOT', `${note + currentOct * 12}`);
  });

  container.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    const wasEl = fingers.get(e.pointerId);
    const nowEl = keyAt(e.clientX, e.clientY);
    if (wasEl === nowEl) return;
    fingers.set(e.pointerId, nowEl);
    if (wasEl) {
      sendNote(parseInt(wasEl.dataset.note, 10) + currentOct * 12, 0);
      wasEl.classList.remove('active');
    }
    if (nowEl) {
      sendNote(parseInt(nowEl.dataset.note, 10) + currentOct * 12, 100);
      nowEl.classList.add('active');
    }
  });

  const lift = (e) => {
    if (!fingers.has(e.pointerId)) return;
    const el = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (el) {
      sendNote(parseInt(el.dataset.note, 10) + currentOct * 12, 0);
      el.classList.remove('active');
    }
  };

  container.addEventListener('pointerup', lift);
  container.addEventListener('pointercancel', lift);
  container.addEventListener('lostpointercapture', lift);
  container.addEventListener('contextmenu', (e) => e.preventDefault());
}

function updateKeyVisual(note, isOn) {
  const base = note - currentOct * 12;
  const sem = base - 48;
  const el = $(`key${sem}`);
  if (el) el.classList.toggle('active', isOn);
}

function flashKeyVisual(note) {
  const base = note - currentOct * 12;
  const sem = base - 48;
  const el = $(`key${sem}`);
  if (el) {
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 90);
  }
}

// Computer keyboard notes
const KEY_MAP = {
  KeyA: 48, KeyW: 49, KeyS: 50, KeyE: 51, KeyD: 52, KeyF: 53, KeyT: 54, KeyG: 55, KeyY: 56, KeyH: 57, KeyU: 58, KeyJ: 59, KeyK: 60,
  KeyO: 61, KeyL: 62, KeyP: 63, Semicolon: 64
};
const activeKeys = new Set();

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT') return;
  ensureAudio();
  if (e.code in KEY_MAP) {
    const n = KEY_MAP[e.code] + currentOct * 12;
    activeKeys.add(e.code);
    sendNote(n, 100);
    updateKeyVisual(n, true);
  } else if (e.code === 'KeyQ') {
    $('overbord').click();
  } else if (e.code === 'KeyI') {
    $('hold').click();
  } else if (e.code === 'Space') {
    e.preventDefault();
    $('playBtn').click();
  } else if (e.code === 'KeyZ') {
    $('odn').click();
  } else if (e.code === 'KeyX') {
    $('oup').click();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code in KEY_MAP) {
    const n = KEY_MAP[e.code] + currentOct * 12;
    activeKeys.delete(e.code);
    sendNote(n, 0);
    updateKeyVisual(n, false);
  }
});

// Controls & Buttons
function setupControls() {
  $('lline').addEventListener('click', () => ensureAudio());
  $('lname').addEventListener('click', () => ensureAudio());

  // MAN ÖVERBORD
  $('overbord').addEventListener('click', () => triggerOverbord());

  // ANKARE
  $('hold').addEventListener('click', () => {
    ensureAudio();
    state.hold = !state.hold;
    $('hold').setAttribute('aria-pressed', state.hold ? 'true' : 'false');
    $('hold').classList.toggle('active', state.hold);
    setParam('hold', state.hold ? 1 : 0);
    say('ANKARE', state.hold ? 'HÅLL ACKORDET AKTIVT' : 'SLÄPPT', state.hold ? 'PÅ' : 'AV');
  });

  // Play / Stopp
  $('playBtn').addEventListener('click', () => {
    ensureAudio();
    state.playing = !state.playing;
    $('playBtn').setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    $('playIcon').setAttribute('href', state.playing ? '#i-stop' : '#i-play');
    setParam('start', state.playing ? 1 : 0);
    say('SPRITBACKEN', state.playing ? 'GATE-SLINGAN SPELAR' : 'STOPPAD', state.playing ? 'PLAY' : 'STOPP');
  });

  // BPM
  $('bpm').addEventListener('change', () => {
    const v = Math.max(30, Math.min(300, parseInt($('bpm').value, 10) || 100));
    $('bpm').value = v;
    state.bpm = v;
    setParam('bpm', v);
    say('TEMPO', 'BPM', `${v}`);
  });

  // Octave buttons
  $('odn').addEventListener('click', () => {
    currentOct = Math.max(-2, currentOct - 1);
    say('OKTAV', 'KLAVIATUR', `${currentOct}`);
  });
  $('oup').addEventListener('click', () => {
    currentOct = Math.min(2, currentOct + 1);
    say('OKTAV', 'KLAVIATUR', `${currentOct}`);
  });

  // ARP toggle group
  $('arpGroup').querySelectorAll('.tf-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureAudio();
      $('arpGroup').querySelectorAll('.tf-opt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseInt(btn.dataset.val, 10);
      state.arp = val;
      setParam('arp', val);
      const names = ['AV', 'UPP', 'NER', 'SLUMP'];
      say('DANSGOLV', 'ARPEGGIO', names[val]);
    });
  });

  // RELING ekotid toggle group
  $('ekotidGroup').querySelectorAll('.tf-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      ensureAudio();
      $('ekotidGroup').querySelectorAll('.tf-opt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseInt(btn.dataset.val, 10);
      state.ekotid = val;
      setParam('ekotid', val);
      const times = ['1/8', '3/16', '1/4', '3/8'];
      say('RELING', 'EKOTID', times[val]);
    });
  });

  setupMenu();
}

function setupMenu() {
  $('gearBtn').addEventListener('click', () => {
    ensureAudio();
    $('menuDialog').showModal();
  });
  $('closeMenuBtn').addEventListener('click', () => $('menuDialog').close());

  // MIDI dialog
  $('btnMidiMap').addEventListener('click', () => {
    $('menuDialog').close();
    $('midiDialog').showModal();
  });
  $('closeMidiBtn').addEventListener('click', () => $('midiDialog').close());

  // Menu Actions
  $('btnExempel').addEventListener('click', () => {
    playExempel();
  });
  $('btnRensa').addEventListener('click', () => {
    $('menuDialog').close();
    rensa();
  });
  $('btnSpara').addEventListener('click', () => {
    localStorage.setItem(STORAGE, JSON.stringify(state));
    say('SESSION SPARAD', 'LOKALT I WEBLÄSAREN');
  });
  $('btnOppna').addEventListener('click', () => {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      Object.assign(state, JSON.parse(raw));
      applyLoadedState();
      say('SESSION ÖPPNAD', 'SPARADE VÄRDEN ÅTERSTÄLLDA');
    }
  });
  $('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });
  $('btnMidi').addEventListener('click', initMidi);
}

function playExempel() {
  ensureAudio();
  // Turn on ANKARE
  state.hold = true;
  $('hold').setAttribute('aria-pressed', 'true');
  $('hold').classList.add('active');
  setParam('hold', 1);

  // Play Cm9 dub chord: [48, 55, 58, 62, 63] (C3, G3, Bb3, D4, Eb4)
  const chord = [48, 55, 58, 62, 63];
  chord.forEach((n) => sendNote(n, 100));

  // Start crate
  if (!state.playing) {
    $('playBtn').click();
  }
  say('EXEMPEL · DUB-CHORD', 'C-MOLL 9 MED ANKARE OCH SPRITBACKEN', 'DUB');
}

function rensa() {
  ensureAudio();
  state.hold = false;
  $('hold').setAttribute('aria-pressed', 'false');
  $('hold').classList.remove('active');
  setParam('hold', 0);
  if (state.playing) $('playBtn').click();
  post({ type: 'param', name: 'hold', value: 0 });
  say('NOLLSTÄLLD', 'ALLA LJUD STOPPADE');
}

function applyLoadedState() {
  for (const [k, v] of Object.entries(state.params)) {
    setParam(k, v);
  }
  $('bpm').value = state.bpm;
  state.bottles.forEach((s, i) => {
    const b = $(`bottle-${i}`);
    if (b) b.dataset.state = s;
    setParam(`g${i}`, s);
  });
}

const CC_TO_PARAM = {
  14: 'bpm',
  15: 'start',
  16: 'rakbuffe',
  17: 'dimma',
  18: 'vagfyll',
  19: 'stot',
  20: 'klirr',
  21: 'spritback',
  22: 'tullkvot',
  23: 'sjogang',
  24: 'kuling',
  25: 'eko',
  26: 'ekofb',
  27: 'ekotid',
  28: 'gung',
  29: 'diskotek',
  30: 'arp',
  31: 'overbord',
  64: 'hold',
  7: 'volume'
};

function handleMidiBytes(bytes) {
  if (!bytes || bytes.length < 3) return;
  const [st, d1, d2] = bytes;
  const kind = st & 0xf0, ch = st & 0x0f;
  if (ch !== CHANNEL && ch !== 0) return; // channel 4 or shared channel 1

  if (kind === 0xb0) { // CC
    const param = CC_TO_PARAM[d1];
    if (param) {
      if (param === 'hold') {
        state.hold = d2 >= 64;
        $('hold').setAttribute('aria-pressed', state.hold ? 'true' : 'false');
        $('hold').classList.toggle('active', state.hold);
        setParam('hold', state.hold ? 1 : 0);
      } else if (param === 'overbord') {
        if (d2 >= 64) triggerOverbord();
      } else if (param === 'start') {
        const play = d2 >= 64;
        if (play !== state.playing) $('playBtn').click();
      } else if (param === 'bpm') {
        const v = Math.round(30 + (270 * d2) / 127);
        state.bpm = v;
        $('bpm').value = v;
        setParam('bpm', v);
      } else if (param === 'ekotid' || param === 'arp') {
        const v = Math.min(3, Math.floor((d2 / 128) * 4));
        setParam(param, v);
      } else {
        const val = d2 / 127;
        setParam(param, val);
      }
    }
  }
}

function initMidi() {
  if (!navigator.requestMIDIAccess) {
    say('WEB MIDI SAKNAS', 'WEBLÄSAREN STÖDER INTE MIDI');
    return;
  }
  navigator.requestMIDIAccess().then((access) => {
    midiAccess = access;
    say('MIDI ANSLUTEN', 'LYSSNAR PÅ KANAL 4 OCH 1');
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e) => {
        const bytes = Array.from(e.data);
        post({ type: 'midi', bytes });
        handleMidiBytes(bytes);
      };
    }
  }).catch((err) => say('MIDI FEL', String(err.message || err)));
}

// Downloads list
async function loadDownloads() {
  try {
    const res = await fetch('downloads.json');
    if (!res.ok) return;
    const list = await res.json();
    const container = $('downloadsList');
    container.innerHTML = '';
    list.forEach((item) => {
      const a = document.createElement('a');
      a.className = 'ds-menu-item';
      a.style.display = 'block';
      a.style.textDecoration = 'none';
      a.href = `downloads/${item.file}`;
      a.textContent = `💾 ${item.label} (${item.file})`;
      container.appendChild(a);
    });
  } catch (_) {}
}

// Window resize & zoom
function updateZoom() {
  const w = window.innerWidth, h = window.innerHeight;
  const zoom = Math.min(w / 1180, h / 740, 1.35);
  document.documentElement.style.setProperty('--zoom', zoom.toFixed(3));
}
window.addEventListener('resize', updateZoom);

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  updateZoom();
  initKnobs();
  initCrate();
  initKeyboard();
  setupControls();
  loadDownloads();
});
