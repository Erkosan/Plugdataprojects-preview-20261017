// GRANNEN 3000 i Lägenheten 1971 (FOLKHEMMETS SKUGGOR).
// Subbas genom 200 mm betong kl. 02:15. Gösta, 68, bor i lägenhet 1102 ovanpå och bankar med kvasten i taket.
// Ljudet är PlugData-motorn (grannen.pd -> hvcc -> WebAssembly) i en AudioWorklet.
const $ = (id) => document.getElementById(id), room = $('room');
const VERSION = 'grannen-web-1';
const STORAGE = 'grannen-session-v1';
const CHANNEL = 7; // MIDI channel 8 (zero-based 7); channel 1 (zero-based 0) is shared
const inAlskog = (() => { try { return window.parent !== window && !!window.parent.alskog; } catch { return false; } })();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let ac = null, node = null, ready = false, starting = null, midiAccess = null, storeTimer = null;
let engineParams = {};
let playing = false, clocked = false, klagar = false, vrakning = false;
let oct = 0, acc = false, glideFlag = false, write = false, wpos = 0, presetIndex = 0;
let lastTouch = performance.now();
const pending = [];

// ---------- C-minor scale & note naming (flat notation for C minor: C D Eb F G Ab Bb)
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const C_MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10];
const C_MINOR_NOTES = [];
for (let o = -1; o <= 2; o++) {
  for (const deg of C_MINOR_DEGREES) {
    const n = o * 12 + deg;
    if (n >= -12 && n <= 24) C_MINOR_NOTES.push(n);
  }
}
const nn = (n) => NAMES[((n % 12) + 12) % 12] + (2 + Math.floor(n / 12));
const snapToCMinor = (n) => {
  let best = C_MINOR_NOTES[0], bestDist = 999;
  for (const cand of C_MINOR_NOTES) {
    const d = Math.abs(cand - n);
    if (d < bestDist) { best = cand; bestDist = d; }
  }
  return best;
};

room.setAttribute('role', 'group');
room.setAttribute('aria-label', 'Lägenheten 1971: GRANNEN 3000 sitter monterad i bärväggen av 200 mm betong. Ovanpå bor Gösta, 68, som bankar med kvasten i taket. Vattenradiatorn längst ned är klaviaturen.');

// ---------- Trapphus-namntavla LCD
const say = (line, valText) => {
  $('lline').textContent = line;
  if (valText !== undefined && valText !== '') $('lval').textContent = valText;
  lastTouch = performance.now();
};
const title = (text) => { $('lname').textContent = text; };

// ---------- AudioWorklet engine
function post(message) { if (node) node.port.postMessage(message); else pending.push(message); }
const param = (name, value) => post({type: 'param', name, value});

function ensureAudio() {
  if (ac) { if (ac.state !== 'running') ac.resume().catch(() => {}); return starting; }
  const Context = window.AudioContext || window.webkitAudioContext;
  ac = new Context({latencyHint: 'interactive'});
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
  ac.resume().catch(() => {});
  starting = (async () => {
    const parameters = await (await fetch('params.json')).json();
    engineParams = parameters || {};
    await ac.audioWorklet.addModule('worklet.js');
    node = new AudioWorkletNode(ac, 'grannen', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {parameters}
    });
    node.port.onmessage = fromEngine;
    node.connect(ac.destination);
    syncEngine();
    for (const message of pending.splice(0)) if (message.type !== 'param') node.port.postMessage(message);
  })().catch((error) => { say('MOTORFEL · ' + String(error.message || error).toUpperCase(), 'FEL'); throw error; });
  return starting;
}
const unlock = () => { if (!ac) ensureAudio(); else if (ac.state !== 'running') ac.resume().catch(() => {}); };
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, {capture: true, passive: true});

// ---------- 9 Knobs (0–100 on LCD, no numbers printed on knobs)
const K = [
  ['BETONG', 'SUBNIVÅ', 'sub', 0.75, '--ch-concrete'],
  ['DUNS', 'ANSLAG', 'punch', 0.65, '--ch-concrete'],
  ['STOMME', 'AVKLINGNING', 'decay', 0.45, '--ch-concrete'],
  ['SVIKT', 'GLID', 'glide', 0.30, '--ch-concrete'],
  ['BÄRVÄGG', 'FILTER', 'wall', 0.40, '--ch-filter'],
  ['ELEMENTRÖR', 'METALLKLIRR', 'pipe', 0.30, '--ch-filter'],
  ['VENTILATION', 'OVERDRIVE', 'hum', 0.25, '--ch-fx'],
  ['TRAPPHUS', 'RUMSKLANG', 'stair', 0.30, '--ch-fx'],
  ['VOLYM', 'UTNIVÅ', 'volume', 0.80, '--control']
];
const KN = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="ds-knob-arc" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="ds-knob-ptr" x1="25" y1="25" x2="25" y2="9"/></svg>';
const val = Object.fromEntries(K.map((k) => [k[2], k[3]]));

$('knobs').innerHTML = K.map((k, i) =>
  `<div class="gr-knob"><button class="ds-control ds-knob" id="kn${i}" type="button" role="slider" aria-valuemin="0" aria-valuemax="100" style="--ds-face:var(${k[4]})" aria-label="${k[0]} (${k[1].toLowerCase()})">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`
).join('');

const knobIndex = (name) => K.findIndex((k) => k[2] === name);
const knobInt = (i) => Math.round(val[K[i][2]] * 100);
const knobLine = (i) => `${K[i][0]} · ${K[i][1]} ${knobInt(i)}`;

function setK(i, v, quiet) {
  const k = K[i];
  if (!k) return;
  val[k[2]] = clamp(v);
  const e = $('kn' + i);
  const pct = knobInt(i);
  e.style.setProperty('--angle', (val[k[2]] * 270 - 135) + 'deg');
  e.setAttribute('aria-valuenow', String(pct));
  e.setAttribute('aria-valuetext', String(pct));
  if (!quiet) say(knobLine(i), String(pct));
  param(k[2], val[k[2]]);
  applyVisuals();
  store();
}

K.forEach((k, i) => {
  const e = $('kn' + i);
  setK(i, val[k[2]], 1);
  e.addEventListener('pointerdown', (ev) => {
    ensureAudio();
    try { e.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
    let y = ev.clientY;
    const mv = (m) => { if (m.pointerId !== ev.pointerId) return; setK(i, val[k[2]] + (y - m.clientY) / 150); y = m.clientY; };
    const up = (u) => { if (u.pointerId !== ev.pointerId) return; e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up); };
    e.addEventListener('pointermove', mv);
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    say(knobLine(i), String(knobInt(i)));
  });
  e.addEventListener('dblclick', () => setK(i, k[3]));
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(knobLine(i), String(knobInt(i))); });
  e.addEventListener('focus', () => say(knobLine(i), String(knobInt(i))));
  e.addEventListener('wheel', (ev) => { ev.preventDefault(); setK(i, val[k[2]] + (ev.deltaY < 0 ? 0.04 : -0.04)); }, {passive: false});
  e.addEventListener('keydown', (ev) => {
    const d = {ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05}[ev.key];
    if (d) { ev.preventDefault(); ev.stopPropagation(); setK(i, val[k[2]] + d); }
  });
});

function applyVisuals() {
  room.style.setProperty('--sub', val.sub.toFixed(2));
  room.style.setProperty('--hum', val.hum.toFixed(2));
}
applyVisuals();

// ---------- 2 Signature Gestures: GRANNEN KLAGAR & VRÄKNING
function triggerKlagarVisual() {
  retrigger($('kvast'), 'bang');
  retrigger($('shock'), 'burst');
  retrigger($('dust'), 'fall');
  retrigger($('pipeRiser'), 'clang');
}

function setKlagar(v, quiet) {
  klagar = !!v;
  param('klagar', klagar ? 1 : 0);
  $('klagar').setAttribute('aria-pressed', String(klagar));
  room.classList.toggle('klagar', klagar);
  if (klagar) triggerKlagarVisual();
  if (!quiet) say('GRANNEN KLAGAR · KVAST I TAKET ' + (klagar ? 'PÅ' : 'AV'), klagar ? 'PÅ' : 'AV');
  store();
}

function setVrakning(v, quiet) {
  vrakning = !!v;
  param('vrakning', vrakning ? 1 : 0);
  $('vrakning').setAttribute('aria-pressed', String(vrakning));
  room.classList.toggle('vrakning', vrakning);
  if (!quiet) say('VRÄKNING · SUB-DYK (-1 OKTAV)', vrakning ? '-1 OKT' : 'AV');
  store();
}

$('klagar').onclick = () => { ensureAudio(); setKlagar(!klagar); };
$('pipeValve').onclick = () => { ensureAudio(); setKlagar(!klagar); };
$('klagar').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('GRANNEN KLAGAR · KVAST I TAKET PÅ/AV', klagar ? 'PÅ' : 'AV'); });

$('vrakning').onclick = () => { ensureAudio(); setVrakning(!vrakning); };
$('vrakning').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('VRÄKNING · SUB-DYK (-1 OKTAV)', vrakning ? '-1 OKT' : 'AV'); });

// ---------- 6 C-Minor Factory Presets & 16-Step Sequencer
const s = (n, a = 0, sl = 0) => ({n: snapToCMinor(n), a: a ? 1 : 0, s: sl ? 1 : 0});

const PRESETS = [
  {
    id: 'nattklocka',
    name: 'Nattklocka 02:15 (c-moll)',
    knobs: {sub: 0.78, punch: 0.68, decay: 0.46, glide: 0.32, wall: 0.38, pipe: 0.28, hum: 0.22, stair: 0.28, volume: 0.82},
    length: 16, swing: 0.08, klagar: false, vrakning: false,
    steps: [s(0, 1), s(0), s(12, 0, 1), s(0), null, s(0, 1), s(3), s(0), s(0), s(12, 0, 1), s(10), s(7, 1), s(0), null, s(3), s(2, 0, 1)]
  },
  {
    id: 'barvagg',
    name: 'Bärvägg i svängning',
    knobs: {sub: 0.88, punch: 0.76, decay: 0.58, glide: 0.42, wall: 0.28, pipe: 0.18, hum: 0.35, stair: 0.24, volume: 0.84},
    length: 16, swing: 0.14, klagar: false, vrakning: false,
    steps: [s(0, 1), null, s(0, 0, 1), s(3, 1), null, s(5), s(7, 0, 1), s(5), s(0, 1), null, s(-2, 0, 1), s(0, 1), null, s(3), s(2, 0, 1), s(0)]
  },
  {
    id: 'storningsjouren',
    name: 'Störningsjouren rycker ut',
    knobs: {sub: 0.74, punch: 0.85, decay: 0.38, glide: 0.25, wall: 0.62, pipe: 0.68, hum: 0.54, stair: 0.40, volume: 0.82},
    length: 16, swing: 0.0, klagar: true, vrakning: false,
    steps: [s(0, 1), s(12, 1, 1), s(0), s(7, 1), s(8, 0, 1), s(7), s(3, 1), s(0), s(0, 1), s(12, 1, 1), s(10), s(7, 1), s(5, 0, 1), s(3), s(2, 1), s(0, 0, 1)]
  },
  {
    id: 'elementrors-dub',
    name: 'Elementrörs-dub',
    knobs: {sub: 0.82, punch: 0.55, decay: 0.64, glide: 0.48, wall: 0.32, pipe: 0.74, hum: 0.18, stair: 0.72, volume: 0.80},
    length: 16, swing: 0.22, klagar: false, vrakning: false,
    steps: [s(0, 1), null, null, s(7, 1, 1), s(5), null, s(3, 1), null, s(0, 1), null, null, s(10, 1, 1), s(7), null, s(-5, 0, 1), null]
  },
  {
    id: 'tvattstugetekno',
    name: 'Tvättstugetekno',
    knobs: {sub: 0.80, punch: 0.82, decay: 0.34, glide: 0.20, wall: 0.54, pipe: 0.42, hum: 0.46, stair: 0.22, volume: 0.84},
    length: 16, swing: 0.05, klagar: false, vrakning: false,
    steps: [s(0, 1), s(0), s(12, 1), s(0), s(3, 1), s(0), s(10, 0, 1), s(7), s(0, 1), s(0), s(12, 1), s(0), s(8, 1), s(7, 0, 1), s(5), s(3, 1)]
  },
  {
    id: 'vrakningsbeslut',
    name: 'Vräkningsbeslut',
    knobs: {sub: 0.94, punch: 0.78, decay: 0.70, glide: 0.55, wall: 0.24, pipe: 0.36, hum: 0.40, stair: 0.48, volume: 0.85},
    length: 16, swing: 0.12, klagar: true, vrakning: true,
    steps: [s(0, 1, 1), s(0), null, s(3, 1, 1), s(2), null, s(-5, 1), null, s(0, 1, 1), s(7, 1), s(5, 0, 1), s(3), s(0, 1), null, s(-2, 0, 1), s(0)]
  }
];

const extras = {bpm: 120, length: 16, swing: 0.08, tune: 0};
let P = PRESETS[0].steps.map((x) => x && {...x});

// Encode step for GR_Seq.pd: 0 = rest, 1..99 = MIDI note (36 + p.n), +100 = accent (duns), +200 = slide (svikt)
const stepCode = (p) => p ? clamp(Math.round(36 + p.n), 1, 99) + (p.a ? 100 : 0) + (p.s ? 200 : 0) : 0;
function sendStep(i) {
  param('step' + i, stepCode(P[i]));
}

const stepSayText = (i) => {
  const p = P[i];
  if (!p) return [`STEG ${i + 1} · PAUS`, 'PAUS'];
  const flags = (p.a ? ' DUNS' : '') + (p.s ? ' SVIKT' : '');
  return [`STEG ${i + 1} · ${nn(p.n)}${flags}`, nn(p.n)];
};

function drawStep(i) {
  const col = $('scol' + i), b = $('sp' + i), noteEl = $('sn' + i), dBtn = $('sd' + i), sBtn = $('ss' + i);
  const p = P[i];
  col.classList.toggle('is-outside', i >= extras.length);
  b.setAttribute('aria-pressed', String(!!p));
  b.classList.toggle('is-write', write && i === wpos);
  noteEl.textContent = p ? nn(p.n) : '−';
  dBtn.setAttribute('aria-pressed', String(!!(p && p.a)));
  sBtn.setAttribute('aria-pressed', String(!!(p && p.s)));
  b.setAttribute('aria-label', `Steg ${i + 1} ${p ? nn(p.n) + (p.a ? ' duns' : '') + (p.s ? ' svikt' : '') : 'paus'}`);
}

for (let i = 0; i < 16; i++) {
  $('steps').insertAdjacentHTML('beforeend',
    `<div class="gr-step-col" id="scol${i}">
      <button class="ds-control ds-step gr-step" id="sp${i}" type="button">
        <span class="gr-step-num">${i + 1}</span>
        <span class="gr-step-note" id="sn${i}">−</span>
      </button>
      <div class="gr-step-flags">
        <button class="ds-control gr-flag" id="sd${i}" type="button" aria-pressed="false" aria-label="Steg ${i + 1} duns (accent)">D</button>
        <button class="ds-control gr-flag slide" id="ss${i}" type="button" aria-pressed="false" aria-label="Steg ${i + 1} svikt (glid)">S</button>
      </div>
    </div>`
  );
  const b = $('sp' + i), dBtn = $('sd' + i), sBtn = $('ss' + i);

  // Drag vertically on a step to pick note in C minor (or chromatic with Shift), or click to toggle
  b.addEventListener('pointerdown', (ev) => {
    ensureAudio();
    if (write) {
      wpos = i;
      P.forEach((_, k) => drawStep(k));
      say(`SKRIV · STEG ${i + 1} VÄLJ TON PÅ ELEMENTET`, `STEG ${i + 1}`);
      return;
    }
    try { b.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
    let startY = ev.clientY, dragged = false;
    const mv = (m) => {
      if (m.pointerId !== ev.pointerId) return;
      const dy = startY - m.clientY;
      if (Math.abs(dy) >= 10) {
        dragged = true;
        const stepsDelta = Math.trunc(dy / 10);
        startY -= stepsDelta * 10;
        if (!P[i]) P[i] = {n: snapToCMinor(oct * 12), a: acc ? 1 : 0, s: glideFlag ? 1 : 0};
        if (m.shiftKey) {
          P[i].n = clamp(P[i].n + stepsDelta, -12, 24);
        } else {
          const curIdx = Math.max(0, C_MINOR_NOTES.indexOf(snapToCMinor(P[i].n)));
          const nextIdx = clamp(curIdx + stepsDelta, 0, C_MINOR_NOTES.length - 1);
          P[i].n = C_MINOR_NOTES[nextIdx];
        }
        drawStep(i); sendStep(i); say(...stepSayText(i)); store();
      }
    };
    const up = (u) => {
      if (u.pointerId !== ev.pointerId) return;
      b.removeEventListener('pointermove', mv);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
      if (!dragged) {
        P[i] = P[i] ? null : {n: snapToCMinor(oct * 12), a: acc ? 1 : 0, s: glideFlag ? 1 : 0};
        drawStep(i); sendStep(i); say(...stepSayText(i)); store();
      }
    };
    b.addEventListener('pointermove', mv);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  });

  b.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    ensureAudio();
    if (!P[i]) P[i] = {n: snapToCMinor(oct * 12), a: acc ? 1 : 0, s: glideFlag ? 1 : 0};
    const delta = ev.deltaY < 0 ? 1 : -1;
    if (ev.shiftKey) {
      P[i].n = clamp(P[i].n + delta, -12, 24);
    } else {
      const curIdx = Math.max(0, C_MINOR_NOTES.indexOf(snapToCMinor(P[i].n)));
      P[i].n = C_MINOR_NOTES[clamp(curIdx + delta, 0, C_MINOR_NOTES.length - 1)];
    }
    drawStep(i); sendStep(i); say(...stepSayText(i)); store();
  }, {passive: false});

  b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && !write) say(...stepSayText(i)); });

  dBtn.onclick = () => {
    ensureAudio();
    if (!P[i]) P[i] = {n: snapToCMinor(oct * 12), a: 1, s: 0};
    else P[i].a = P[i].a ? 0 : 1;
    drawStep(i); sendStep(i); say(...stepSayText(i)); store();
  };
  sBtn.onclick = () => {
    ensureAudio();
    if (!P[i]) P[i] = {n: snapToCMinor(oct * 12), a: 0, s: 1};
    else P[i].s = P[i].s ? 0 : 1;
    drawStep(i); sendStep(i); say(...stepSayText(i)); store();
  };
  drawStep(i);
}

// ---------- Transport, LEN, SWING & Mode buttons
function setPlaying(v, quiet) {
  playing = !!v;
  $('play').setAttribute('aria-pressed', String(playing));
  $('pi').setAttribute('d', playing ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
  room.classList.toggle('playing', playing);
  if (playing) {
    if (!quiet) say('SLINGAN RULLAR · BETONGEN SKAKAR', 'SPELAR');
  } else {
    for (let k = 0; k < 16; k++) $('sp' + k).classList.remove('is-current');
    if (!quiet) say('STOPP · TYST I TRAPPHUSET', 'STOPP');
  }
}

function togglePlay() {
  ensureAudio();
  if (clocked) { say('SYNKAD · MIDI-KLOCKAN STYR SLINGAN', 'SYNKAD'); return; }
  setPlaying(!playing);
  param('start', playing ? 1 : 0);
}
$('play').onclick = togglePlay;
$('stopBtn').onclick = () => {
  ensureAudio();
  if (clocked) { clocked = false; $('syncBadge').textContent = 'INTERN'; $('syncBadge').classList.remove('clocked'); }
  setPlaying(false);
  param('start', 0);
  panic();
};

function setLength(len, quiet) {
  extras.length = clamp(Math.round(len), 1, 16);
  $('lenBtn').textContent = 'LEN ' + extras.length;
  param('length', extras.length);
  for (let i = 0; i < 16; i++) drawStep(i);
  if (!quiet) say(`LÄNGD · ANTAL STEG ${extras.length}`, String(extras.length));
  store();
}
$('lenBtn').onclick = () => {
  const next = extras.length >= 16 ? 4 : extras.length === 4 ? 8 : extras.length === 8 ? 12 : 16;
  setLength(next);
};
$('lenBtn').addEventListener('wheel', (ev) => {
  ev.preventDefault();
  setLength(extras.length + (ev.deltaY < 0 ? 1 : -1));
}, {passive: false});
$('lenBtn').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say(`LÄNGD · ANTAL STEG ${extras.length}`, String(extras.length)); });

function setSwing(sw, quiet) {
  extras.swing = clamp(sw, 0, 1);
  const pct = Math.round(extras.swing * 100);
  $('swingBtn').textContent = 'SWING ' + pct;
  param('swing', extras.swing);
  if (!quiet) say(`SWING · HÄNG I RYTMEN ${pct}`, String(pct));
  store();
}
$('swingBtn').onclick = () => {
  const steps = [0, 0.08, 0.16, 0.25, 0.35, 0.5];
  const next = steps.find((v) => v > extras.swing + 0.02) ?? 0;
  setSwing(next);
};
$('swingBtn').addEventListener('wheel', (ev) => {
  ev.preventDefault();
  setSwing(extras.swing + (ev.deltaY < 0 ? 0.04 : -0.04));
}, {passive: false});
$('swingBtn').addEventListener('pointerenter', (e) => {
  if (e.pointerType === 'mouse') {
    const pct = Math.round(extras.swing * 100);
    say(`SWING · HÄNG I RYTMEN ${pct}`, String(pct));
  }
});

function setOct(d) {
  oct = clamp(oct + d, -1, 1);
  say(`OKTAV · ELEMENTET BÖRJAR PÅ ${nn(oct * 12)}`, nn(oct * 12));
}
function setAcc(v) {
  acc = !!v;
  $('bacc').setAttribute('aria-pressed', String(acc));
  say(`DUNS · EXTRA ANSLAG ${acc ? 'PÅ' : 'AV'}`, acc ? 'PÅ' : 'AV');
}
function setGlideFlag(v) {
  glideFlag = !!v;
  $('bsl').setAttribute('aria-pressed', String(glideFlag));
  say(`SVIKT · GLID PÅ STEG ${glideFlag ? 'PÅ' : 'AV'}`, glideFlag ? 'PÅ' : 'AV');
}
function setWrite(v) {
  write = !!v;
  $('bwr').setAttribute('aria-pressed', String(write));
  P.forEach((_, k) => drawStep(k));
  say(write ? `SKRIV · STEG ${wpos + 1} SPELA PÅ ELEMENTET` : 'SKRIV · AVSLUTAT', write ? `STEG ${wpos + 1}` : 'AV');
}
$('odn').onclick = () => setOct(-1);
$('oup').onclick = () => setOct(1);
$('bacc').onclick = () => setAcc(!acc);
$('bsl').onclick = () => setGlideFlag(!glideFlag);
$('bwr').onclick = () => setWrite(!write);

// ---------- ELEMENTET: 2-Octave Water Radiator Keyboard (C2 to C4, MIDI 36 to 60)
const KEYMAP = 'awsedftgyhujkolp;';
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const BLACK = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6], [13, 8], [15, 9], [18, 11], [20, 12], [22, 13]];
const KEYW = 60;

WHITE.forEach((sem, i) => {
  const inScale = C_MINOR_DEGREES.includes(sem % 12);
  $('keys').insertAdjacentHTML('beforeend',
    `<button class="gr-key w${inScale ? ' c-min' : ''}" id="key${sem}" type="button" data-note="${nn(sem)}" style="left:${i * KEYW}px" aria-label="${nn(sem)}"></button>`
  );
});
BLACK.forEach(([sem, after]) => {
  const inScale = C_MINOR_DEGREES.includes(sem % 12);
  $('keys').insertAdjacentHTML('beforeend',
    `<button class="gr-key b${inScale ? ' c-min' : ''}" id="key${sem}" type="button" data-note="${nn(sem)}" style="left:${after * KEYW}px" aria-label="${nn(sem)}"></button>`
  );
});

const sounding = new Map(); // semitone index -> midi note sent
function writeStepNote(n, a, sl) {
  P[wpos] = {n: clamp(n, -12, 24), a: a ? 1 : 0, s: sl ? 1 : 0};
  sendStep(wpos);
  const writtenStep = wpos;
  wpos = (wpos + 1) % extras.length;
  P.forEach((_, k) => drawStep(k));
  say(`SKRIV · STEG ${writtenStep + 1} → ${nn(n)}`, nn(n));
  store();
}

function keyOn(sem) {
  if (sounding.has(sem)) return;
  ensureAudio();
  const n = sem + oct * 12;
  const midi = clamp(36 + n, 24, 84);
  sounding.set(sem, midi);
  $('key' + sem)?.classList.add('down');
  const vel = acc ? 124 : 96;
  post({type: 'midi', bytes: [0x90 | CHANNEL, midi, vel]});
  say(`ELEMENTET · TON ${nn(n)}${acc ? ' DUNS' : ''}`, nn(n));
  if (write) writeStepNote(n, acc, glideFlag);
}

function keyOff(sem) {
  $('key' + sem)?.classList.remove('down');
  const midi = sounding.get(sem);
  if (midi === undefined) return;
  sounding.delete(sem);
  post({type: 'midi', bytes: [0x80 | CHANNEL, midi, 0]});
}

// Multi-touch & mouse glissando on Elementet
const fingers = new Map();
const keyAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  return el && el.classList.contains('gr-key') ? +el.id.slice(3) : null;
};
$('keys').addEventListener('pointerdown', (e) => {
  const sem = keyAt(e.clientX, e.clientY);
  if (sem === null) return;
  e.preventDefault();
  try { $('keys').setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  fingers.set(e.pointerId, sem);
  if ([...fingers.values()].filter((v) => v === sem).length === 1) keyOn(sem);
});
$('keys').addEventListener('pointermove', (e) => {
  if (!fingers.has(e.pointerId)) return;
  const was = fingers.get(e.pointerId), sem = keyAt(e.clientX, e.clientY);
  if (sem === was) return;
  fingers.set(e.pointerId, sem);
  if (sem !== null && ![...fingers.entries()].some(([id, v]) => id !== e.pointerId && v === sem)) keyOn(sem);
  if (was !== null && ![...fingers.values()].includes(was)) keyOff(was);
});
const lift = (e) => {
  if (!fingers.has(e.pointerId)) return;
  const sem = fingers.get(e.pointerId);
  fingers.delete(e.pointerId);
  if (sem !== null && ![...fingers.values()].includes(sem)) keyOff(sem);
};
$('keys').addEventListener('pointerup', lift);
$('keys').addEventListener('pointercancel', lift);
$('keys').addEventListener('lostpointercapture', lift);
$('keys').addEventListener('contextmenu', (e) => e.preventDefault());

const typing = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, summary, .menu-panel');
document.addEventListener('keydown', (e) => {
  if (typing(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase(), sem = KEYMAP.indexOf(k);
  if (sem >= 0 && k.length === 1) { e.preventDefault(); keyOn(sem); }
  else if (k === 'z') setOct(-1);
  else if (k === 'x') setOct(1);
  else if (e.key === 'Shift') setAcc(true);
  else if (e.key === 'Enter') { e.preventDefault(); setWrite(!write); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'c' || k === 'q') { ensureAudio(); setKlagar(!klagar); }
  else if (k === 'v') { ensureAudio(); setVrakning(!vrakning); }
  else if (/^[1-6]$/.test(e.key)) { ensureAudio(); loadPreset(+e.key - 1); }
});
document.addEventListener('keyup', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !typing(e)) e.preventDefault();
  const k = e.key.toLowerCase(), sem = KEYMAP.indexOf(k);
  if (sem >= 0 && k.length === 1) keyOff(sem);
  else if (e.key === 'Shift') setAcc(false);
});
window.addEventListener('blur', () => { for (const sem of [...sounding.keys()]) keyOff(sem); setAcc(false); });

// ---------- Presets UI & Randomize in C minor
$('preset-list').innerHTML = PRESETS.map((p, i) =>
  `<button type="button" id="pr${i}" role="radio" aria-checked="${i === 0}">${i + 1}. ${p.name}</button>`
).join('');

function markPreset(idx) {
  presetIndex = idx;
  PRESETS.forEach((_, i) => $('pr' + i)?.setAttribute('aria-checked', String(i === idx)));
}

function loadPreset(id, quiet) {
  let idx = typeof id === 'number' ? id : PRESETS.findIndex((p) => p.id === id || p.name.toLowerCase() === String(id).toLowerCase());
  if (idx < 0 || idx >= PRESETS.length) idx = 0;
  const pr = PRESETS[idx];
  for (const [name, value] of Object.entries(pr.knobs)) {
    const ki = knobIndex(name);
    if (ki >= 0) setK(ki, value, 1);
  }
  setLength(pr.length ?? 16, 1);
  setSwing(pr.swing ?? 0, 1);
  setKlagar(!!pr.klagar, 1);
  setVrakning(!!pr.vrakning, 1);
  P = pr.steps.map((x) => x && {...x});
  P.forEach((_, i) => { drawStep(i); sendStep(i); });
  markPreset(idx);
  title(pr.name.toUpperCase());
  if (!quiet) say(`LÄGENHETSLJUD · ${pr.name.toUpperCase()}`, 'C-MOLL');
  store();
  return pr;
}

PRESETS.forEach((_, i) => {
  $('pr' + i).onclick = () => { ensureAudio(); loadPreset(i); closeMenu(); };
});

function randomizeCMinor() {
  ensureAudio();
  const pool = [-12, -5, -2, 0, 2, 3, 5, 7, 8, 10, 12];
  P = Array.from({length: 16}, (_, i) => {
    if (i === 0 || Math.random() < 0.72) {
      const n = i === 0 ? 0 : pool[Math.floor(Math.random() * pool.length)];
      return {n, a: Math.random() < 0.35 ? 1 : 0, s: Math.random() < 0.28 ? 1 : 0};
    }
    return null;
  });
  P.forEach((_, i) => { drawStep(i); sendStep(i); });
  title('SLUMPAD · C-MOLL');
  say('SLUMPAD SLINGA · C D EB F G AB BB', 'C-MOLL');
  store();
}

// ---------- Engine events & room vibration physics
function retrigger(el, cls) {
  if (!el || reducedMotion.matches) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let tiltTimer = null, shakeTimer = null;
function hitWall(note, accent) {
  const amp = (accent ? 1.4 : 0.85) * (0.4 + val.sub * 0.8);
  const angle = ((note % 2 === 0 ? 1 : -1) * (2.2 + amp * 3.2)).toFixed(2) + 'deg';
  room.style.setProperty('--tilt', angle);
  room.style.setProperty('--shake', (accent ? '2px' : '1px'));
  retrigger($('pipeRiser'), 'clang');
  clearTimeout(tiltTimer);
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => room.style.setProperty('--shake', '0px'), 55);
  tiltTimer = setTimeout(() => room.style.setProperty('--tilt', '-1.2deg'), 180);
}

let lastStepTime = -1;
const hook = new EventTarget();
function fire(ev) {
  const v = ev.values || [];
  if (ev.name === 'ev_step') {
    const i = v[0] | 0;
    lastStepTime = ev.time;
    if (!playing) return;
    for (let k = 0; k < 16; k++) $('sp' + k).classList.toggle('is-current', k === i);
    const detail = {step: i, time: ev.time};
    hook.dispatchEvent(new CustomEvent('step', {detail}));
    if (typeof hook.onstep === 'function') hook.onstep(detail);
  } else if (ev.name === 'ev_note') {
    const [voice, note, accent, slide] = v;
    const fromSeq = voice === 0 || Math.abs(ev.time - lastStepTime) < 1e-5;
    if (fromSeq && !playing) return;
    hitWall(note, accent);
    const detail = {
      note,
      accent: !!accent,
      slide: !!slide,
      time: ev.time,
      voice: fromSeq ? 'slinga' : 'live'
    };
    hook.dispatchEvent(new CustomEvent('note', {detail}));
    if (typeof hook.onnote === 'function') hook.onnote(detail);
  } else if (ev.name === 'ev_off') {
    const detail = {voice: v[0] ? 'live' : 'slinga', time: ev.time};
    hook.dispatchEvent(new CustomEvent('off', {detail}));
    if (typeof hook.onoff === 'function') hook.onoff(detail);
  } else if (ev.name === 'ev_klagar') {
    triggerKlagarVisual();
    const detail = {intensity: v[0] ?? 1, time: ev.time};
    hook.dispatchEvent(new CustomEvent('klagar', {detail}));
    if (typeof hook.onklagar === 'function') hook.onklagar(detail);
  }
}

const events = [];
function fromEngine({data}) {
  if (data.type === 'ev') events.push(data);
  else if (data.type === 'ready') { ready = true; }
  else if (data.type === 'error') say('MOTORFEL · ' + String(data.message).toUpperCase(), 'FEL');
}

function syncEngine() {
  K.forEach((k) => param(k[2], val[k[2]]));
  for (const [name, value] of Object.entries(extras)) param(name, value);
  param('klagar', klagar ? 1 : 0);
  param('vrakning', vrakning ? 1 : 0);
  P.forEach((_, i) => sendStep(i));
  param('start', playing ? 1 : 0);
}

(function loop() {
  if (ac && events.length) {
    const heard = ac.currentTime - Math.min(0.25, ac.outputLatency || ac.baseLatency || 0);
    while (events.length && events[0].time <= heard) fire(events.shift());
    if (events.length > 256) events.splice(0, events.length - 256);
  }
  requestAnimationFrame(loop);
})();

// ---------- Scale the 1180x740 room as one picture
function fit() {
  const stage = $('stage'), cs = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const zoom = Math.max(0.2, Math.min(w / 1180, h / 740));
  document.documentElement.style.setProperty('--zoom', zoom.toFixed(4));
}
new ResizeObserver(fit).observe($('stage'));
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
fit();
if (matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth) say('VRID MOBILEN · LIGGANDE LÄGE', 'VRID');

// ---------- Session persistence (localStorage + export/import)
function snapshot() {
  return {
    format: VERSION,
    preset: presetIndex,
    title: $('lname').textContent,
    knobs: {...val},
    extras: {...extras},
    klagar,
    vrakning,
    steps: P.map((p) => p && {n: p.n, a: p.a ? 1 : 0, s: p.s ? 1 : 0})
  };
}
function store() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(snapshot())); } catch { /* private mode */ }
  }, 250);
}
function restore(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || data.format !== VERSION) throw new Error('Fel filformat för GRANNEN 3000.');
  if (!Array.isArray(data.steps) || data.steps.length !== 16) throw new Error('Slingan i filen är trasig.');
  if (data.knobs) {
    K.forEach((k, i) => {
      const v = data.knobs[k[2]];
      if (Number.isFinite(v)) setK(i, v, 1);
    });
  }
  if (data.extras) {
    if (Number.isFinite(data.extras.bpm)) { extras.bpm = clamp(Math.round(data.extras.bpm), 30, 300); param('bpm', extras.bpm); }
    if (Number.isFinite(data.extras.length)) setLength(data.extras.length, 1);
    if (Number.isFinite(data.extras.swing)) setSwing(data.extras.swing, 1);
    if (Number.isFinite(data.extras.tune)) { extras.tune = clamp(data.extras.tune, -12, 12); param('tune', extras.tune); }
  }
  setKlagar(!!data.klagar, 1);
  setVrakning(!!data.vrakning, 1);
  P = data.steps.map((p) => p && Number.isFinite(p.n) ? {n: clamp(Math.round(p.n), -12, 24), a: p.a ? 1 : 0, s: p.s ? 1 : 0} : null);
  P.forEach((_, i) => { drawStep(i); sendStep(i); });
  if (Number.isInteger(data.preset)) markPreset(data.preset);
  if (data.title) title(String(data.title));
  store();
}
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) restore(JSON.parse(saved));
  else P.forEach((_, i) => { drawStep(i); });
} catch { /* start fresh */ }

// ---------- Gear menu actions
const menu = $('menu');
const closeMenu = () => { menu.open = false; };
document.addEventListener('pointerdown', (e) => { if (menu.open && !menu.contains(e.target)) closeMenu(); });

$('preset-toggle').onclick = () => {
  const sec = $('preset-panel');
  sec.hidden = !sec.hidden;
  $('preset-toggle').setAttribute('aria-expanded', String(!sec.hidden));
};
$('randomize').onclick = () => { randomizeCMinor(); closeMenu(); };
$('clear').onclick = () => {
  P = Array(16).fill(null);
  wpos = 0;
  P.forEach((_, i) => { drawStep(i); sendStep(i); });
  store();
  closeMenu();
  say('SLINGAN RENSAD · SKRIV NYA TONER I C-MOLL', 'TOM');
};
$('save-local').onclick = () => {
  try { localStorage.setItem(STORAGE, JSON.stringify(snapshot())); } catch { /* private */ }
  closeMenu();
  say('SESSIONEN SPARAD I WEBBLÄSAREN', 'SPARAD');
};
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Grannen-session.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  closeMenu();
  say('SESSIONEN EXPORTERAD · GRANNEN-SESSION.JSON', 'EXPORT');
};
$('open').onclick = () => $('load').click();
$('load').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    restore(JSON.parse(await file.text()));
    closeMenu();
    say('SESSIONEN IMPORTERAD · ' + file.name.toUpperCase(), 'IMPORT');
  } catch (error) {
    alert('Kunde inte importera sessionen: ' + error.message);
  }
};

// ---------- MIDI (Channel 8 and shared Channel 1, plus MIDI Clock)
const CCKNOB = {
  16: 'sub',
  17: 'punch',
  18: 'decay',
  19: 'glide',
  20: 'wall',
  21: 'pipe',
  22: 'hum',
  23: 'stair',
  7: 'volume',
  74: 'wall',
  71: 'pipe',
  5: 'glide'
};
const listening = (channel) => channel === 8 || channel === 1;

function panic() {
  for (const sem of [...sounding.keys()]) keyOff(sem);
  post({type: 'midi', bytes: [0xb0 | CHANNEL, 123, 0]});
  post({type: 'midi', bytes: [0xb0, 123, 0]});
}

function handleCC(cc, v) {
  if (cc in CCKNOB) {
    setK(knobIndex(CCKNOB[cc]), v / 127);
  } else if (cc === 24) {
    ensureAudio();
    setKlagar(v >= 64);
  } else if (cc === 25 || cc === 64) {
    ensureAudio();
    setVrakning(v >= 64);
  } else if (cc === 14) {
    extras.bpm = Math.round(30 + 270 * v / 127);
    param('bpm', extras.bpm);
    say(`TEMPO · ${extras.bpm} BPM`, `${extras.bpm} BPM`);
    store();
  } else if (cc === 15) {
    if ((v >= 64) !== playing) togglePlay();
  } else if (cc === 28) {
    setLength(1 + Math.round(15 * v / 127));
  } else if (cc === 29) {
    setSwing(v / 127);
  } else if (cc === 30) {
    extras.tune = -12 + 24 * v / 127;
    param('tune', extras.tune);
    store();
  } else if (cc === 120 || cc === 123) {
    panic();
  }
}

function midiMessage({data}) {
  if (!data || data.length < 1) return;
  const status = data[0], kind = status & 0xf0, channel = (status & 15) + 1;
  if (status === 0xf8 || status === 0xfa || status === 0xfb || status === 0xfc) {
    if (status !== 0xf8) ensureAudio();
    post({type: 'rt', byte: status});
    if (status === 0xfa || status === 0xfb) {
      if (playing && !clocked) param('start', 0);
      clocked = true;
      $('syncBadge').textContent = 'SYNKAD';
      $('syncBadge').classList.add('clocked');
      setPlaying(true, 1);
      say('SYNKAD · FÖLJER MIDI-KLOCKAN', 'SYNKAD');
    } else if (status === 0xfc) {
      clocked = false;
      $('syncBadge').textContent = 'INTERN';
      $('syncBadge').classList.remove('clocked');
      setPlaying(false, 1);
    }
    return;
  }
  if (data.length < 3 || !listening(channel)) return;
  if (kind === 0x90 || kind === 0x80) {
    const on = kind === 0x90 && data[2] > 0;
    const outCh = status & 15;
    ensureAudio();
    post({type: 'midi', bytes: [(on ? 0x90 : 0x80) | outCh, data[1], on ? data[2] : 0]});
    if (on) {
      const n = data[1] - 36, a = data[2] >= 100;
      say(`MIDI · TON ${nn(n)}${a ? ' DUNS' : ''}`, nn(n));
      if (write && n >= -12 && n <= 24) writeStepNote(n, a, glideFlag);
    }
  } else if (kind === 0xb0) {
    handleCC(data[1], data[2]);
  }
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI stöds inte här. Prova Chrome eller Edge på en dator.');
  ensureAudio();
  midiAccess ||= await navigator.requestMIDIAccess({sysex: false});
  const bind = () => {
    let count = 0;
    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = midiMessage;
      if (input.state === 'connected') count++;
    }
    $('midi').textContent = count ? `MIDI ansluten (${count})` : 'Anslut MIDI';
    say(count ? `MIDI · ${count} ${count === 1 ? 'ENHET' : 'ENHETER'} KANAL 8 OCH 1` : 'MIDI PÅ · KOPPLA IN ETT KEYBOARD', count ? 'CH 8/1' : 'MIDI');
  };
  midiAccess.onstatechange = bind;
  bind();
}
$('midi').onclick = async () => { try { await connectMidi(); closeMenu(); } catch (error) { alert(error.message); } };

const MIDIMAP = [
  [16, 'BETONG · subnivå'],
  [17, 'DUNS · anslag'],
  [18, 'STOMME · avklingning'],
  [19, 'SVIKT · glid (även CC5)'],
  [20, 'BÄRVÄGG · filter (även CC74)'],
  [21, 'ELEMENTRÖR · metallklirr (även CC71)'],
  [22, 'VENTILATION · overdrive'],
  [23, 'TRAPPHUS · rumsklang'],
  [7, 'VOLYM · utnivå'],
  [24, 'GRANNEN KLAGAR · kvast i taket (64–127)'],
  [25, 'VRÄKNING · sub-dyk -1 oktav (även CC64)'],
  [14, 'Tempo 30–300 BPM'],
  [15, 'Start / stopp'],
  [28, 'Slingans längd (1–16 steg)'],
  [29, 'Swing (0–100)'],
  [30, 'Stämning ±12 halvtoner']
];
$('midi-map-list').innerHTML =
  '<li><code>Toner</code> kanal 8 och 1 · anslag ≥ 100 = duns · legato = svikt</li>' +
  '<li><code>MIDI-klocka</code> start, fortsätt, stopp och klocka styr slingan</li>' +
  MIDIMAP.map(([cc, label]) => `<li><code>CH8/CH1 CC${cc}</code> ${label}</li>`).join('');

const menuPanel = menu.querySelector('.menu-panel');
const showMap = (show) => {
  menuPanel.classList.toggle('show-midi-map', show);
  $('midi-map-panel').hidden = !show;
  $('midi-map-toggle').setAttribute('aria-expanded', String(show));
};
$('midi-map-toggle').onclick = () => showMap(true);
$('midi-map-back').onclick = () => showMap(false);
menu.addEventListener('toggle', () => { if (!menu.open) showMap(false); });

// ---------- PWA install & Fullscreen
const INSTALLED = 'grannen-installed-v1';
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installedBefore = () => { try { return localStorage.getItem(INSTALLED) === '1'; } catch { return false; } };
function showInstalled() {
  try { localStorage.setItem(INSTALLED, '1'); } catch { /* ok */ }
  installPrompt = null;
  $('install-app').textContent = 'Appen är installerad';
  $('install-app').disabled = true;
}
if (isStandalone() || installedBefore()) showInstalled();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!installedBefore()) { $('install-app').textContent = 'Installera app'; $('install-app').disabled = false; }
});
window.addEventListener('appinstalled', showInstalled);
$('install-app').onclick = async () => {
  closeMenu();
  if (isStandalone()) { showInstalled(); return; }
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  alert(ios ? 'På iPhone och iPad: tryck Dela och välj ”Lägg till på hemskärmen”.' : 'Öppna webbläsarens meny och välj ”Installera app” eller ”Lägg till på startskärmen”.');
};

const fullscreenTarget = document.documentElement;
if (!(fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen)) $('fullscreen').hidden = true;
$('fullscreen').onclick = async () => {
  closeMenu();
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await (fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen).call(fullscreenTarget);
  } catch { say('HELSKÄRM GICK INTE', 'FEL'); }
};

// ---------- VST3 downloads
fetch('downloads.json').then((r) => r.ok ? r.json() : null).then((list) => {
  if (!Array.isArray(list) || !list.length) return;
  const link = (d) => `<a href="downloads/${encodeURIComponent(d.file)}" download>${d.label}</a>`;
  const builds = list.filter((d) => d.kind !== 'kit'), kits = list.filter((d) => d.kind === 'kit');
  $('download-grid').innerHTML = builds.map(link).join('');
  $('download-grid').hidden = !builds.length;
  $('download-kit').innerHTML = kits.map(link).join('');
  $('download-kit').hidden = !kits.length;
  $('downloads').hidden = false;
}).catch(() => {});

if ('serviceWorker' in navigator && !inAlskog && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- Host Hook (window.grannen)
Object.defineProperties(hook, Object.getOwnPropertyDescriptors({
  get context() { return ac; },
  get node() { return node; },
  get ready() { return ready; },
  get params() { return engineParams; },
  get playing() { return playing; },
  get values() {
    return {
      ...val,
      ...extras,
      klagar: klagar ? 1 : 0,
      vrakning: vrakning ? 1 : 0,
      start: playing ? 1 : 0
    };
  },
  get slinga() { return P.map((p) => p && {...p}); },
  get presets() { return PRESETS.map((p) => ({id: p.id, name: p.name})); },
  update(name, value) {
    const i = knobIndex(name);
    if (i >= 0) setK(i, value, 1);
    else if (name === 'klagar') setKlagar(!!value, 1);
    else if (name === 'vrakning') setVrakning(!!value, 1);
    else if (name === 'start') { if (!!value !== playing) togglePlay(); }
    else if (name === 'length') setLength(value, 1);
    else if (name === 'swing') setSwing(value, 1);
    else if (name === 'bpm') { extras.bpm = clamp(Math.round(value), 30, 300); param('bpm', extras.bpm); store(); }
    else if (name === 'tune') { extras.tune = clamp(value, -12, 12); param('tune', extras.tune); store(); }
    else if (/^step\d+$/.test(name)) { param(name, value); }
  },
  noteOn(note, vel = 100, ch = 8) {
    ensureAudio();
    const c = clamp((ch | 0) - 1, 0, 15);
    post({type: 'midi', bytes: [0x90 | c, clamp(note | 0, 0, 127), clamp(vel | 0, 1, 127)]});
  },
  noteOff(note, ch = 8) {
    const c = clamp((ch | 0) - 1, 0, 15);
    post({type: 'midi', bytes: [0x80 | c, clamp(note | 0, 0, 127), 0]});
  },
  controlChange(cc, value, ch = 8) {
    ensureAudio();
    const c = clamp((ch | 0) - 1, 0, 15);
    post({type: 'midi', bytes: [0xb0 | c, clamp(cc | 0, 0, 127), clamp(value | 0, 0, 127)]});
    handleCC(cc | 0, value | 0);
  },
  realtime(byte) {
    midiMessage({data: [byte | 0]});
  },
  setTransport({bpm: nextBpm, playing: nextPlaying} = {}) {
    ensureAudio();
    if (Number.isFinite(nextBpm)) {
      extras.bpm = clamp(Math.round(nextBpm), 30, 300);
      param('bpm', extras.bpm);
    }
    if (typeof nextPlaying === 'boolean' && nextPlaying !== playing) {
      setPlaying(nextPlaying, 1);
      param('start', playing ? 1 : 0);
    }
  },
  loadPreset(id) {
    ensureAudio();
    return loadPreset(id);
  },
  exportSession() { return snapshot(); },
  importSession(data) { restore(data); return snapshot(); },
  panic,
  togglePlay,
  ensureAudio
}));
window.grannen = hook;
