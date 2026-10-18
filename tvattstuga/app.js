// TVÄTTSTUGA 3000 i Källarplan · Tvättstuga B 1971 (FOLKHEMMETS SKUGGOR).
// Polymetrisk 5-spårs trum- och tvättmaskin i c-moll med Wascator W75, stenmangel, vattenventil, luddfilter och arg tvättlapp.
// Ljudet är PlugData-motorn (tvattstuga.pd -> hvcc -> WebAssembly) i en AudioWorklet.
const $ = (id) => document.getElementById(id), room = $('room');
const VERSION = 'tvattstuga-web-1';
const STORAGE = 'tvattstuga-session-v1';
const CHANNEL = 6; // MIDI channel 7 (zero-based 6); channel 1 (zero-based 0) is shared
const inAlskog = (() => { try { return window.parent !== window && !!window.parent.alskog; } catch { return false; } })();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let ac = null, node = null, ready = false, starting = null, midiAccess = null, storeTimer = null;
let engineParams = {};
let playing = false, clocked = false, centrifug = false, tvattlapp = false;
let koktvatt = false, selectedTrack = 0, presetIndex = 0, drumAngle = 0;
const pending = [];

room.setAttribute('role', 'group');
room.setAttribute('aria-label', 'Tvättstuga B, Källarplan 1971: TVÄTTSTUGA 3000 med Wascator W75, stenmangel, vattenventil, luddfilter och bokningstavla.');

// ---------- Programverk / Bokningstavla LCD
const say = (line, valText) => {
  $('lline').textContent = line;
  if (valText !== undefined && valText !== '') $('lval').textContent = valText;
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
    node = new AudioWorkletNode(ac, 'tvattstuga', {
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
  ['FÖRTVÄTT', 'TRUMDJUP', 'trumma', 0.65, '--ch-kick', 'FÖRTVÄTT'],
  ['VALSTRYCK', 'MANGELBETT', 'mangel', 0.55, '--ch-snare', 'VALSTRYCK'],
  ['VATTENTRYCK', 'VENTILPYS', 'ventil', 0.50, '--ch-hat', 'VATTENTRYCK'],
  ['LUDDFILTER', 'FILTER & SMÄLL', 'ludd', 0.55, '--ch-clap', 'LUDDFILTER'],
  ['CENTRIFUG', 'METALLKLANG', 'varvtal', 0.55, '--ch-tom', 'CENTRIFUG'],
  ['OBALANS', 'PUMP & VOBBEL', 'obalans', 0.30, '--ch-kick', 'OBALANS'],
  ['KALK', 'OVERDRIVE', 'kalk', 0.28, '--ch-tom', 'KALKAVLAGRING'],
  ['TORKRUM', 'KÄLLAREKO', 'torkrum', 0.22, '--ch-hat', 'TORKRUM'],
  ['VOLYM', 'UTNIVÅ', 'volume', 0.80, '--control', 'VOLYM']
];
const KN = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="ds-knob-arc" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="ds-knob-ptr" x1="25" y1="25" x2="25" y2="9"/></svg>';
const val = Object.fromEntries(K.map((k) => [k[2], k[3]]));

$('knobs').innerHTML = K.map((k, i) =>
  `<div class="tv-knob"><button class="ds-control ds-knob" id="kn${i}" type="button" role="slider" aria-valuemin="0" aria-valuemax="100" style="--ds-face:var(${k[4]})" aria-label="${k[0]} (${k[1].toLowerCase()})">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`
).join('');

const knobIndex = (name) => K.findIndex((k) => k[2] === name);
const knobInt = (i) => Math.round(val[K[i][2]] * 100);
const knobLine = (i) => `${K[i][5]} · ${K[i][1]} ${knobInt(i)}`;

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
  room.style.setProperty('--obalans', val.obalans.toFixed(2));
  room.style.setProperty('--kalk', val.kalk.toFixed(2));
}
applyVisuals();

// ---------- 2 Signature Gestures: CENTRIFUG 1400V & ARG TVÄTTLAPP
function retrigger(el, cls) {
  if (!el || reducedMotion.matches) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setCentrifug(v, quiet) {
  centrifug = !!v;
  param('centrifug', centrifug ? 1 : 0);
  $('centrifug').setAttribute('aria-pressed', String(centrifug));
  room.classList.toggle('centrifug', centrifug);
  if (!quiet) say('CENTRIFUG 1400 VARV · RUSNING ' + (centrifug ? 'PÅ' : 'AV'), centrifug ? '1400V' : 'AV');
  store();
}

function setTvattlapp(v, quiet) {
  tvattlapp = !!v;
  param('tvattlapp', tvattlapp ? 1 : 0);
  $('tvattlapp').setAttribute('aria-pressed', String(tvattlapp));
  room.classList.toggle('tvattlapp', tvattlapp);
  if (tvattlapp) retrigger($('tvattlapp-note'), 'slap');
  if (!quiet) say('ARG TVÄTTLAPP · SKÄLL & FILL ' + (tvattlapp ? 'PÅ' : 'AV'), tvattlapp ? 'SKÄLL!' : 'AV');
  store();
}

$('centrifug').onclick = () => { ensureAudio(); setCentrifug(!centrifug); };
$('centrifug').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('CENTRIFUG 1400 VARV · RUSNING', centrifug ? '1400V' : 'AV'); });
$('wascator-window').onclick = () => { ensureAudio(); setCentrifug(!centrifug); };

$('tvattlapp').onclick = () => { ensureAudio(); setTvattlapp(!tvattlapp); };
$('tvattlapp').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('ARG TVÄTTLAPP · SKÄLL & FILL', tvattlapp ? 'SKÄLL!' : 'AV'); });
$('tvattlapp-note').onclick = () => { ensureAudio(); setTvattlapp(!tvattlapp); };

// ---------- 5-Track x 16-Step Polymetric Sequencer
const TRACKS = [
  {id: 'trumma', name: 'TRUMMA', meaning: 'KICK', color: '--ch-kick', dim: '--ch-kick-dim', defLen: 16},
  {id: 'mangel', name: 'MANGEL', meaning: 'SNARE', color: '--ch-snare', dim: '--ch-snare-dim', defLen: 16},
  {id: 'ventil', name: 'VENTIL', meaning: 'HIHAT', color: '--ch-hat', dim: '--ch-hat-dim', defLen: 16},
  {id: 'ludd', name: 'LUDDFILTER', meaning: 'CLAP', color: '--ch-clap', dim: '--ch-clap-dim', defLen: 16},
  {id: 'centrifug', name: 'CENTRIFUG', meaning: 'TOM', color: '--ch-tom', dim: '--ch-tom-dim', defLen: 12}
];
const CENTRIFUG_NOTES = ['C3', 'Eb3', 'G3', 'C4', 'F3', 'Ab3', 'Bb3', 'G3', 'C3', 'Eb3', 'Bb3', 'G3', 'F3', 'Eb3', 'D3', 'G3'];

const PRESETS = [
  {
    id: 'kulortvatt',
    name: 'Kulörtvätt 60° (c-moll)',
    temp: '60°C',
    knobs: {trumma: 0.65, mangel: 0.55, ventil: 0.50, ludd: 0.55, varvtal: 0.55, obalans: 0.30, kalk: 0.28, torkrum: 0.22, volume: 0.80},
    swing: 0.15, centrifug: false, tvattlapp: false,
    lengths: [16, 16, 16, 16, 12],
    grid: [
      [2, 0, 0, 0, 1, 0, 0, 1, 2, 0, 1, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1],
      [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0],
      [1, 0, 0, 2, 0, 1, 0, 0, 2, 0, 1, 0, 1, 0, 2, 0]
    ]
  },
  {
    id: 'fintvatt',
    name: 'Fintvätt 40°',
    temp: '40°C',
    knobs: {trumma: 0.52, mangel: 0.42, ventil: 0.64, ludd: 0.46, varvtal: 0.62, obalans: 0.18, kalk: 0.14, torkrum: 0.38, volume: 0.80},
    swing: 0.22, centrifug: false, tvattlapp: false,
    lengths: [16, 16, 12, 16, 14],
    grid: [
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0],
      [1, 0, 2, 1, 0, 1, 2, 0, 1, 1, 2, 0, 1, 0, 2, 1],
      [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      [2, 0, 1, 0, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 0]
    ]
  },
  {
    id: 'koktvatt',
    name: 'Koktvätt 95°',
    temp: '95°C',
    knobs: {trumma: 0.84, mangel: 0.78, ventil: 0.58, ludd: 0.72, varvtal: 0.64, obalans: 0.45, kalk: 0.52, torkrum: 0.28, volume: 0.84},
    swing: 0.08, centrifug: false, tvattlapp: false,
    lengths: [16, 16, 16, 16, 12],
    grid: [
      [2, 0, 1, 0, 2, 0, 1, 1, 2, 0, 1, 0, 2, 1, 0, 1],
      [0, 0, 0, 0, 2, 0, 0, 1, 0, 1, 0, 0, 2, 0, 2, 0],
      [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 2, 2, 1],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 1],
      [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 0]
    ]
  },
  {
    id: 'obalans',
    name: 'Centrifug i obalans',
    temp: '1400V',
    knobs: {trumma: 0.76, mangel: 0.62, ventil: 0.54, ludd: 0.60, varvtal: 0.82, obalans: 0.78, kalk: 0.38, torkrum: 0.34, volume: 0.82},
    swing: 0.28, centrifug: true, tvattlapp: false,
    lengths: [16, 14, 15, 12, 11],
    grid: [
      [2, 0, 0, 1, 0, 2, 0, 0, 2, 0, 1, 0, 0, 2, 0, 1],
      [0, 0, 1, 0, 2, 0, 0, 1, 0, 2, 0, 0, 2, 0, 1, 0],
      [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 0],
      [0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 2, 0, 0, 0, 0],
      [2, 1, 0, 2, 1, 0, 2, 0, 1, 2, 0, 1, 0, 0, 0, 0]
    ]
  },
  {
    id: 'mangeltechno',
    name: 'Mangel-techno',
    temp: '75°C',
    knobs: {trumma: 0.82, mangel: 0.85, ventil: 0.68, ludd: 0.65, varvtal: 0.58, obalans: 0.42, kalk: 0.44, torkrum: 0.20, volume: 0.84},
    swing: 0.04, centrifug: false, tvattlapp: false,
    lengths: [16, 16, 16, 8, 12],
    grid: [
      [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 1, 0],
      [0, 0, 2, 0, 0, 0, 2, 1, 0, 0, 2, 0, 0, 1, 2, 2],
      [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 2],
      [0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 1],
      [1, 2, 0, 1, 0, 2, 1, 0, 2, 0, 1, 2, 0, 1, 0, 0]
    ]
  },
  {
    id: 'brittmarie',
    name: 'Britt-Maries hämnd',
    temp: '4TR!!',
    knobs: {trumma: 0.88, mangel: 0.86, ventil: 0.72, ludd: 0.88, varvtal: 0.78, obalans: 0.64, kalk: 0.68, torkrum: 0.42, volume: 0.85},
    swing: 0.16, centrifug: false, tvattlapp: true,
    lengths: [16, 16, 16, 16, 12],
    grid: [
      [2, 0, 1, 2, 0, 1, 2, 0, 2, 1, 0, 2, 1, 0, 2, 1],
      [0, 1, 0, 0, 2, 0, 1, 2, 0, 1, 2, 0, 2, 1, 2, 2],
      [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 2, 2, 2],
      [2, 0, 0, 1, 2, 0, 1, 0, 2, 0, 1, 1, 2, 0, 2, 2],
      [2, 1, 2, 0, 2, 1, 0, 2, 1, 2, 0, 2, 1, 2, 0, 1]
    ]
  }
];

const extras = {bpm: 120, swing: 0.15, tune: 0};
let lengths = [...PRESETS[0].lengths];
let mutes = [false, false, false, false, false];
let G = PRESETS[0].grid.map((row) => [...row]);

// Encode step0..step15 for the engine: s0 + (s1 << 2) + (s2 << 4) + (s3 << 6) + (s4 << 8)
function stepCode(i) {
  let code = 0;
  for (let t = 0; t < 5; t++) {
    const s = mutes[t] ? 0 : (G[t][i] & 3);
    code += (s << (t * 2));
  }
  return code;
}

function sendStep(i) {
  param('step' + i, stepCode(i));
}

function sendAllSteps() {
  for (let i = 0; i < 16; i++) sendStep(i);
}

// Build 5-track x 16-step grid UI
$('seq-grid').innerHTML = TRACKS.map((tr, t) => `
  <div class="tv-track-row" id="trow${t}" style="--tr-color:var(${tr.color});--tr-dim:var(${tr.dim})">
    <button class="ds-control tv-track-sel" id="tsel${t}" type="button" aria-pressed="${t === 0}" aria-label="Välj spår ${tr.name} (${tr.meaning})">${tr.name}</button>
    <button class="ds-control tv-mute-btn" id="mute${t}" type="button" aria-pressed="false" aria-label="Tysta ${tr.name}">M</button>
    <button class="ds-control tv-len-btn" id="len${t}" type="button" aria-label="${tr.name} längd (1–16 steg)">LEN ${lengths[t]}</button>
    ${Array.from({length: 16}, (_, i) =>
      `<button class="ds-control ds-step tv-step${i % 4 === 0 ? ' beat-start' : ''}" id="st${t}_${i}" type="button" data-state="0" aria-pressed="false"></button>`
    ).join('')}
  </div>
`).join('');

function stepStateLabel(t, i, st) {
  const tr = TRACKS[t];
  if (st === 0) return [`${tr.name} STEG ${i + 1} · VILA`, 'VILA'];
  if (t === 2) return [`VENTIL STEG ${i + 1} · ${st === 2 ? 'ÖPPEN ÅNGA' : 'STÄNGD VENTIL'}`, st === 2 ? 'ÖPPEN' : 'STÄNGD'];
  if (t === 4) {
    const n = CENTRIFUG_NOTES[i % CENTRIFUG_NOTES.length];
    return [`CENTRIFUG STEG ${i + 1} · ${n}${st === 2 ? ' KOKTVÄTT' : ''}`, n];
  }
  return [`${tr.name} STEG ${i + 1} · ${st === 2 ? 'KOKTVÄTT (ACCENT)' : 'SLAG'}`, st === 2 ? 'ACC' : 'SLAG'];
}

function drawCell(t, i) {
  const b = $(`st${t}_${i}`);
  if (!b) return;
  const st = G[t][i] | 0;
  b.dataset.state = String(st);
  b.setAttribute('aria-pressed', String(st > 0));
  b.classList.toggle('is-outside', i >= lengths[t]);
  if (st === 0) b.textContent = '';
  else if (t === 2) b.textContent = st === 2 ? 'Ö' : '•';
  else if (t === 4) b.textContent = st === 2 ? CENTRIFUG_NOTES[i].replace('3', '').replace('4', '') : '•';
  else b.textContent = st === 2 ? '!' : '•';
  const [line] = stepStateLabel(t, i, st);
  b.setAttribute('aria-label', line);
}

function drawTrackRow(t) {
  $('tsel' + t).setAttribute('aria-pressed', String(selectedTrack === t));
  $('mute' + t).setAttribute('aria-pressed', String(mutes[t]));
  $('len' + t).textContent = 'LEN ' + lengths[t];
  for (let i = 0; i < 16; i++) drawCell(t, i);
}

function drawGrid() {
  for (let t = 0; t < 5; t++) drawTrackRow(t);
}

function selectTrack(t, quiet) {
  selectedTrack = clamp(t | 0, 0, 4);
  for (let k = 0; k < 5; k++) $('tsel' + k).setAttribute('aria-pressed', String(k === selectedTrack));
  const tr = TRACKS[selectedTrack];
  if (!quiet) say(`${tr.name} · ${tr.meaning} (LEN ${lengths[selectedTrack]})`, `LEN ${lengths[selectedTrack]}`);
}

function setTrackLen(t, len, quiet) {
  lengths[t] = clamp(Math.round(len), 1, 16);
  param('len' + t, lengths[t]);
  drawTrackRow(t);
  const tr = TRACKS[t];
  if (!quiet) say(`${tr.name} LÄNGD · ${lengths[t]} STEG`, `LEN ${lengths[t]}`);
  store();
}

function setTrackMute(t, v, quiet) {
  mutes[t] = !!v;
  drawTrackRow(t);
  sendAllSteps();
  const tr = TRACKS[t];
  if (!quiet) say(`${tr.name} · ${mutes[t] ? 'AVSTÄNGD (MUTE)' : 'AKTIV'}`, mutes[t] ? 'MUTE' : 'PÅ');
  store();
}

TRACKS.forEach((tr, t) => {
  $('tsel' + t).onclick = () => selectTrack(t);
  $('mute' + t).onclick = () => { ensureAudio(); setTrackMute(t, !mutes[t]); };
  $('len' + t).onclick = (ev) => {
    ensureAudio();
    selectTrack(t, 1);
    const cycle = [16, 12, 8, 6, 4, 15, 14, 11];
    let next;
    if (ev.shiftKey) {
      next = lengths[t] <= 1 ? 16 : lengths[t] - 1;
    } else {
      const idx = cycle.indexOf(lengths[t]);
      next = idx >= 0 ? cycle[(idx + 1) % cycle.length] : 16;
    }
    setTrackLen(t, next);
  };
  $('len' + t).addEventListener('wheel', (ev) => {
    ev.preventDefault();
    ensureAudio();
    setTrackLen(t, lengths[t] + (ev.deltaY < 0 ? 1 : -1));
  }, {passive: false});
  $('len' + t).addEventListener('pointerenter', (ev) => {
    if (ev.pointerType === 'mouse') say(`${tr.name} LÄNGD · ${lengths[t]} STEG`, `LEN ${lengths[t]}`);
  });

  for (let i = 0; i < 16; i++) {
    const b = $(`st${t}_${i}`);
    b.onclick = (ev) => {
      ensureAudio();
      selectTrack(t, 1);
      const cur = G[t][i] | 0;
      if (ev.shiftKey || koktvatt) {
        G[t][i] = cur === 2 ? 0 : 2;
      } else {
        G[t][i] = (cur + 1) % 3;
      }
      drawCell(t, i);
      sendStep(i);
      say(...stepStateLabel(t, i, G[t][i]));
      store();
    };
    b.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ensureAudio();
      G[t][i] = G[t][i] === 2 ? 0 : 2;
      drawCell(t, i);
      sendStep(i);
      say(...stepStateLabel(t, i, G[t][i]));
      store();
    });
    b.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType === 'mouse') say(...stepStateLabel(t, i, G[t][i]));
    });
  }
});
drawGrid();

// ---------- Transport, SWING, KOKTVÄTT & Track tools
function clearPlayheads() {
  for (let t = 0; t < 5; t++) {
    for (let i = 0; i < 16; i++) $(`st${t}_${i}`)?.classList.remove('is-current');
  }
}

function setPlaying(v, quiet) {
  playing = !!v;
  $('play').setAttribute('aria-pressed', String(playing));
  $('pi').setAttribute('d', playing ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
  room.classList.toggle('playing', playing);
  if (playing) {
    if (!quiet) say('PROGRAMVERKET RULLAR · TVÄTTSTUGA B', 'SPELAR');
  } else {
    clearPlayheads();
    if (!quiet) say('STOPP · PROGRAMVERKET STANNAT', 'STOPP');
  }
}

function togglePlay() {
  ensureAudio();
  if (clocked) { say('SYNKAD · MIDI-KLOCKAN STYR PROGRAMVERKET', 'SYNKAD'); return; }
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

function setSwing(sw, quiet) {
  extras.swing = clamp(sw, 0, 1);
  const pct = Math.round(extras.swing * 100);
  $('swingBtn').textContent = 'SWING ' + pct;
  param('swing', extras.swing);
  if (!quiet) say(`SWING · OBALANS I RYTMEN ${pct}`, String(pct));
  store();
}
$('swingBtn').onclick = () => {
  const steps = [0, 0.08, 0.15, 0.24, 0.35, 0.5];
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
    say(`SWING · OBALANS I RYTMEN ${pct}`, String(pct));
  }
});

function setKoktvatt(v) {
  koktvatt = !!v;
  $('accBtn').setAttribute('aria-pressed', String(koktvatt));
  say(`KOKTVÄTT · ACCENT & ÖPPEN VENTIL ${koktvatt ? 'PÅ' : 'AV'}`, koktvatt ? '95°C' : 'AV');
}
$('accBtn').onclick = () => setKoktvatt(!koktvatt);

$('randTrackBtn').onclick = () => {
  ensureAudio();
  const t = selectedTrack;
  const density = [0.38, 0.32, 0.68, 0.26, 0.45][t];
  for (let i = 0; i < 16; i++) {
    if (t === 0 && i === 0) G[t][i] = 2;
    else if (Math.random() < density) G[t][i] = Math.random() < 0.32 ? 2 : 1;
    else G[t][i] = 0;
    drawCell(t, i);
  }
  sendAllSteps();
  say(`${TRACKS[t].name} · SLUMPAD TVÄTTRYTM`, 'SLUMP');
  store();
};

$('clearTrackBtn').onclick = () => {
  ensureAudio();
  const t = selectedTrack;
  for (let i = 0; i < 16; i++) {
    G[t][i] = 0;
    drawCell(t, i);
  }
  sendAllSteps();
  say(`${TRACKS[t].name} · SPÅRET SKÖLJT (TOMT)`, 'TOM');
  store();
};

// ---------- Bottom Interactive Drum Pads (#pads) & C-Minor Tuned Centrifug Keys (#keys)
const PADS = [
  {name: 'TRUMMA', sub: 'KICK', note: 36, key: 'Z', color: '--ch-kick', voice: 0},
  {name: 'MANGEL', sub: 'SNARE', note: 38, key: 'X', color: '--ch-snare', voice: 1},
  {name: 'VENTIL ST', sub: 'STÄNGD', note: 42, key: 'C', color: '--ch-hat', voice: 2},
  {name: 'VENTIL ÖP', sub: 'ÖPPEN', note: 46, key: 'V', color: '--ch-hat', voice: 2},
  {name: 'LUDDFILTER', sub: 'CLAP', note: 39, key: 'B', color: '--ch-clap', voice: 3},
  {name: 'CENTRIFUG', sub: 'METALL', note: 45, key: 'N', color: '--ch-tom', voice: 4}
];

$('pads').innerHTML = PADS.map((p, i) => `
  <button class="ds-control tv-pad" id="pad${i}" type="button" data-pad="${i}" style="--pad-color:var(${p.color})" aria-label="${p.name} (${p.sub})">
    <span class="tv-pad-name">${p.name}</span>
    <span class="tv-pad-sub">${p.sub}</span>
    <span class="tv-pad-key">${p.key}</span>
  </button>
`).join('');

// 1-octave C-minor tuned CENTRIFUG metal-pipe keys: C3, D3, Eb3, F3, G3, Ab3, Bb3, C4
const CM_KEYS = [
  {label: 'C3', note: 48, key: 'A'},
  {label: 'D3', note: 50, key: 'S'},
  {label: 'Eb3', note: 51, key: 'D'},
  {label: 'F3', note: 53, key: 'F'},
  {label: 'G3', note: 55, key: 'G'},
  {label: 'Ab3', note: 56, key: 'H'},
  {label: 'Bb3', note: 58, key: 'J'},
  {label: 'C4', note: 60, key: 'K'}
];

$('keys').innerHTML = CM_KEYS.map((k, i) => `
  <button class="ds-control tv-key" id="key${i}" type="button" data-key="${i}" data-note="${k.label}" aria-label="Centrifug ${k.label}">
    <span class="tv-key-pipe"></span>
    <span class="tv-key-note">${k.label}</span>
    <span class="tv-key-hint">${k.key}</span>
  </button>
`).join('');

function triggerPad(idx, accent = false) {
  const p = PADS[idx];
  if (!p) return;
  ensureAudio();
  const el = $('pad' + idx);
  el?.classList.add('down');
  setTimeout(() => el?.classList.remove('down'), 120);
  const vel = (accent || koktvatt) ? 124 : 96;
  post({type: 'midi', bytes: [0x90 | CHANNEL, p.note, vel]});
  setTimeout(() => post({type: 'midi', bytes: [0x80 | CHANNEL, p.note, 0]}), 90);
  animateLaundryHit(p.voice, vel, (accent || koktvatt) ? 1 : 0);
  say(`MASKINPARKEN · ${p.name} (${p.sub})${(accent || koktvatt) ? ' KOKTVÄTT' : ''}`, p.sub);
}

function triggerCmKey(idx, accent = false) {
  const k = CM_KEYS[idx];
  if (!k) return;
  ensureAudio();
  const el = $('key' + idx);
  el?.classList.add('down');
  setTimeout(() => el?.classList.remove('down'), 130);
  const vel = (accent || koktvatt) ? 124 : 96;
  post({type: 'midi', bytes: [0x90 | CHANNEL, k.note, vel]});
  setTimeout(() => post({type: 'midi', bytes: [0x80 | CHANNEL, k.note, 0]}), 100);
  animateLaundryHit(4, vel, (accent || koktvatt) ? 1 : 0);
  say(`CENTRIFUGTRUMMA · STÅLRÖR ${k.label}${(accent || koktvatt) ? ' KOKTVÄTT' : ''}`, k.label);
}

PADS.forEach((_, i) => {
  $('pad' + i).addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    triggerPad(i, ev.shiftKey);
  });
});

CM_KEYS.forEach((_, i) => {
  $('key' + i).addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    triggerCmKey(i, ev.shiftKey);
  });
});

const PAD_KEYMAP = 'zxcvbn';
const CM_KEYMAP = 'asdfghjk';
const typing = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, summary, .menu-panel');

document.addEventListener('keydown', (e) => {
  if (typing(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const pIdx = PAD_KEYMAP.indexOf(k);
  const cIdx = CM_KEYMAP.indexOf(k);
  if (pIdx >= 0 && k.length === 1) { e.preventDefault(); triggerPad(pIdx, e.shiftKey); }
  else if (cIdx >= 0 && k.length === 1) { e.preventDefault(); triggerCmKey(cIdx, e.shiftKey); }
  else if (e.key === 'Shift') setKoktvatt(true);
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'q') { ensureAudio(); setCentrifug(!centrifug); }
  else if (k === 'w') { ensureAudio(); setTvattlapp(!tvattlapp); }
  else if (/^[1-6]$/.test(e.key)) { ensureAudio(); loadPreset(+e.key - 1); }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && !typing(e)) e.preventDefault();
  if (e.key === 'Shift') setKoktvatt(false);
});

// ---------- Presets UI & Randomize
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
  setSwing(pr.swing ?? 0.15, 1);
  setCentrifug(!!pr.centrifug, 1);
  setTvattlapp(!!pr.tvattlapp, 1);
  lengths = [...(pr.lengths || [16, 16, 16, 16, 12])];
  mutes = [false, false, false, false, false];
  G = pr.grid.map((row) => [...row]);
  for (let t = 0; t < 5; t++) param('len' + t, lengths[t]);
  drawGrid();
  sendAllSteps();
  markPreset(idx);
  title(pr.name.toUpperCase());
  if (!quiet) say(`TVÄTTPROGRAM · ${pr.name.toUpperCase()}`, pr.temp || 'C-MOLL');
  store();
  return pr;
}

PRESETS.forEach((_, i) => {
  $('pr' + i).onclick = () => { ensureAudio(); loadPreset(i); closeMenu(); };
});

function randomizeProgram() {
  ensureAudio();
  const lenChoices = [16, 16, 12, 14, 15, 8];
  for (let t = 0; t < 5; t++) {
    lengths[t] = t === 0 ? 16 : lenChoices[Math.floor(Math.random() * lenChoices.length)];
    param('len' + t, lengths[t]);
    const density = [0.35, 0.28, 0.65, 0.24, 0.42][t];
    for (let i = 0; i < 16; i++) {
      if (t === 0 && (i === 0 || i === 8)) G[t][i] = 2;
      else if (t === 1 && (i === 4 || i === 12)) G[t][i] = 2;
      else if (Math.random() < density) G[t][i] = Math.random() < 0.3 ? 2 : 1;
      else G[t][i] = 0;
    }
  }
  drawGrid();
  sendAllSteps();
  title('SLUMPAT TVÄTTPASS · C-MOLL');
  say('SLUMPAT PROGRAM · POLYMETRISK TVÄTTSTUGA', 'SLUMP');
  store();
}

// ---------- Engine events & Laundry Room Physics
let shakeTimer = null, mangelTimer = null;
function animateLaundryHit(voice, velocity = 100, accent = 0) {
  if (reducedMotion.matches) return;
  const v = voice | 0;
  if (v === 0 || v === 4) {
    // TRUMMA or CENTRIFUG: rotate Wascator drum & shake chassis on heavy hits
    drumAngle = (drumAngle + (v === 4 ? 72 : 42) + (accent ? 28 : 0)) % 360;
    room.style.setProperty('--drum-rot', drumAngle + 'deg');
    if (v === 0) {
      const sh = accent ? 2.5 : 1.2;
      room.style.setProperty('--shake-x', (drumAngle % 2 === 0 ? sh : -sh) + 'px');
      room.style.setProperty('--shake-y', sh + 'px');
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => {
        room.style.setProperty('--shake-x', '0px');
        room.style.setProperty('--shake-y', '0px');
      }, 65);
    }
  } else if (v === 1) {
    // MANGEL: clamp cast-iron rollers together
    const m = $('mangel-rollers');
    m?.classList.add('clamp');
    clearTimeout(mangelTimer);
    mangelTimer = setTimeout(() => m?.classList.remove('clamp'), 240);
  } else if (v === 2) {
    // VENTIL: puff steam & turn valve wheel
    retrigger($('ventil-steam'), 'puff');
    const w = $('ventil-wheel');
    w?.classList.add('turn');
    setTimeout(() => w?.classList.remove('turn'), 240);
  } else if (v === 3) {
    // LUDDFILTER: shake pink/lilac lint trap
    retrigger($('ludd-trap'), 'slap');
  }
}

const hook = new EventTarget();
function fire(ev) {
  const v = ev.values || [];
  if (ev.name === 'ev_step') {
    const step = v[0] | 0;
    if (!playing) return;
    for (let t = 0; t < 5; t++) {
      const cur = step % Math.max(1, lengths[t]);
      for (let i = 0; i < 16; i++) {
        $(`st${t}_${i}`)?.classList.toggle('is-current', i === cur);
      }
    }
    const detail = {step, time: ev.time};
    hook.dispatchEvent(new CustomEvent('step', {detail}));
    if (typeof hook.onstep === 'function') hook.onstep(detail);
  } else if (ev.name === 'ev_hit') {
    const [voice, velocity, accent] = v;
    animateLaundryHit(voice, velocity, accent);
    const detail = {
      voice: voice | 0,
      track: TRACKS[voice | 0]?.id || 'trumma',
      velocity: velocity ?? 100,
      accent: !!accent,
      time: ev.time
    };
    hook.dispatchEvent(new CustomEvent('hit', {detail}));
    if (typeof hook.onhit === 'function') hook.onhit(detail);
  } else if (ev.name === 'ev_centrifug') {
    const active = !!(v[0] ?? 1);
    room.classList.toggle('centrifug', active || centrifug);
    const detail = {active, time: ev.time};
    hook.dispatchEvent(new CustomEvent('centrifug', {detail}));
    if (typeof hook.oncentrifug === 'function') hook.oncentrifug(detail);
  } else if (ev.name === 'ev_lapp') {
    const active = !!(v[0] ?? 1);
    if (active) retrigger($('tvattlapp-note'), 'slap');
    const detail = {active, time: ev.time};
    hook.dispatchEvent(new CustomEvent('lapp', {detail}));
    if (typeof hook.onlapp === 'function') hook.onlapp(detail);
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
  param('bpm', extras.bpm);
  param('swing', extras.swing);
  param('centrifug', centrifug ? 1 : 0);
  param('tvattlapp', tvattlapp ? 1 : 0);
  for (let t = 0; t < 5; t++) param('len' + t, lengths[t]);
  sendAllSteps();
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
    centrifug,
    tvattlapp,
    lengths: [...lengths],
    mutes: [...mutes],
    grid: G.map((row) => [...row])
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
  if (!data || data.format !== VERSION) throw new Error('Fel filformat för TVÄTTSTUGA 3000.');
  if (!Array.isArray(data.grid) || data.grid.length !== 5) throw new Error('Programmatrisen i filen är trasig.');
  if (data.knobs) {
    K.forEach((k, i) => {
      const v = data.knobs[k[2]];
      if (Number.isFinite(v)) setK(i, v, 1);
    });
  }
  if (data.extras) {
    if (Number.isFinite(data.extras.bpm)) { extras.bpm = clamp(Math.round(data.extras.bpm), 30, 300); param('bpm', extras.bpm); }
    if (Number.isFinite(data.extras.swing)) setSwing(data.extras.swing, 1);
  }
  setCentrifug(!!data.centrifug, 1);
  setTvattlapp(!!data.tvattlapp, 1);
  if (Array.isArray(data.lengths) && data.lengths.length === 5) {
    lengths = data.lengths.map((l) => clamp(Math.round(l), 1, 16));
    for (let t = 0; t < 5; t++) param('len' + t, lengths[t]);
  }
  if (Array.isArray(data.mutes) && data.mutes.length === 5) {
    mutes = data.mutes.map(Boolean);
  }
  G = data.grid.map((row) => Array.from({length: 16}, (_, i) => clamp(row[i] | 0, 0, 2)));
  drawGrid();
  sendAllSteps();
  if (Number.isInteger(data.preset)) markPreset(data.preset);
  if (data.title) title(String(data.title));
  store();
}
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) restore(JSON.parse(saved));
  else drawGrid();
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
$('randomize').onclick = () => { randomizeProgram(); closeMenu(); };
$('clear').onclick = () => {
  G = Array.from({length: 5}, () => Array(16).fill(0));
  drawGrid();
  sendAllSteps();
  store();
  closeMenu();
  say('PROGRAMVERKET RENSAT · VÄLJ NYA STEG', 'TOM');
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
  link.download = 'Tvattstuga-session.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  closeMenu();
  say('SESSIONEN EXPORTERAD · TVATTSTUGA-SESSION.JSON', 'EXPORT');
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

// ---------- MIDI (Channel 7 and shared Channel 1, plus MIDI Clock)
const CCKNOB = {
  16: 'trumma',
  17: 'mangel',
  18: 'ventil',
  19: 'ludd',
  74: 'ludd',
  20: 'varvtal',
  71: 'varvtal',
  21: 'obalans',
  22: 'kalk',
  77: 'kalk',
  23: 'torkrum',
  24: 'volume',
  7: 'volume'
};
const listening = (channel) => channel === 7 || channel === 1;

function panic() {
  post({type: 'midi', bytes: [0xb0 | CHANNEL, 123, 0]});
  post({type: 'midi', bytes: [0xb0, 123, 0]});
}

function handleCC(cc, v) {
  if (cc in CCKNOB) {
    setK(knobIndex(CCKNOB[cc]), v / 127);
  } else if (cc === 25) {
    ensureAudio();
    setCentrifug(v >= 64);
  } else if (cc === 26 || cc === 64) {
    ensureAudio();
    setTvattlapp(v >= 64);
  } else if (cc === 14) {
    extras.bpm = Math.round(30 + 270 * v / 127);
    param('bpm', extras.bpm);
    say(`TEMPO · ${extras.bpm} BPM`, `${extras.bpm} BPM`);
    store();
  } else if (cc === 15) {
    if ((v >= 64) !== playing) togglePlay();
  } else if (cc === 27) {
    setSwing(v / 127);
  } else if (cc >= 28 && cc <= 32) {
    setTrackLen(cc - 28, 1 + Math.round(15 * v / 127));
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
      say(`MIDI · TON ${data[1]}${data[2] >= 100 ? ' KOKTVÄTT' : ''}`, `N ${data[1]}`);
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
    say(count ? `MIDI · ${count} ${count === 1 ? 'ENHET' : 'ENHETER'} KANAL 7 OCH 1` : 'MIDI PÅ · KOPPLA IN EN KONTROLLER', count ? 'CH 7/1' : 'MIDI');
  };
  midiAccess.onstatechange = bind;
  bind();
}
$('midi').onclick = async () => { try { await connectMidi(); closeMenu(); } catch (error) { alert(error.message); } };

const MIDIMAP = [
  [16, 'FÖRTVÄTT · trumdjup (TRUMMA)'],
  [17, 'VALSTRYCK · mangelbett (MANGEL)'],
  [18, 'VATTENTRYCK · ventilpys (VENTIL)'],
  [19, 'LUDDFILTER · filter & smäll (även CC74)'],
  [20, 'CENTRIFUG · metallklang (även CC71)'],
  [21, 'OBALANS · pump & vobbel'],
  [22, 'KALKAVLAGRING · overdrive (även CC77)'],
  [23, 'TORKRUM · källareko'],
  [7, 'VOLYM · utnivå (även CC24)'],
  [25, 'CENTRIFUG 1400 VARV · rusning (64–127)'],
  [26, 'ARG TVÄTTLAPP · skäll & fill (även CC64)'],
  [14, 'Tempo 30–300 BPM'],
  [15, 'Start / stopp'],
  [27, 'Swing (0–100)'],
  [28, 'TRUMMA längd (1–16 steg, CC28–32 för spår 1–5)']
];
$('midi-map-list').innerHTML =
  '<li><code>Toner</code> kanal 7 och 1 · trumplattor (36, 38, 42, 46, 39, 45) &amp; c-moll (48–60)</li>' +
  '<li><code>MIDI-klocka</code> start, fortsätt, stopp och klocka styr programverket</li>' +
  MIDIMAP.map(([cc, label]) => `<li><code>CH7/CH1 CC${cc}</code> ${label}</li>`).join('');

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
const INSTALLED = 'tvattstuga-installed-v1';
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

// ---------- Host Hook (window.tvattstuga)
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
      len0: lengths[0],
      len1: lengths[1],
      len2: lengths[2],
      len3: lengths[3],
      len4: lengths[4],
      centrifug: centrifug ? 1 : 0,
      tvattlapp: tvattlapp ? 1 : 0,
      start: playing ? 1 : 0
    };
  },
  get grid() { return G.map((row) => [...row]); },
  get lengths() { return [...lengths]; },
  get presets() { return PRESETS.map((p) => ({id: p.id, name: p.name})); },
  update(name, value) {
    const i = knobIndex(name);
    if (i >= 0) setK(i, value, 1);
    else if (name === 'centrifug') setCentrifug(!!value, 1);
    else if (name === 'tvattlapp') setTvattlapp(!!value, 1);
    else if (name === 'start') { if (!!value !== playing) togglePlay(); }
    else if (name === 'swing') setSwing(value, 1);
    else if (name === 'bpm') { extras.bpm = clamp(Math.round(value), 30, 300); param('bpm', extras.bpm); store(); }
    else if (/^len[0-4]$/.test(name)) { setTrackLen(+name.slice(3), value, 1); }
    else if (/^step\d+$/.test(name)) {
      const idx = +name.slice(4);
      if (idx >= 0 && idx < 16) {
        const v = value | 0;
        for (let t = 0; t < 5; t++) {
          G[t][idx] = (v >> (t * 2)) & 3;
          drawCell(t, idx);
        }
        param(name, v);
      }
    }
  },
  noteOn(note, vel = 100, ch = 7) {
    ensureAudio();
    const c = clamp((ch | 0) - 1, 0, 15);
    post({type: 'midi', bytes: [0x90 | c, clamp(note | 0, 0, 127), clamp(vel | 0, 1, 127)]});
  },
  noteOff(note, ch = 7) {
    const c = clamp((ch | 0) - 1, 0, 15);
    post({type: 'midi', bytes: [0x80 | c, clamp(note | 0, 0, 127), 0]});
  },
  controlChange(cc, value, ch = 7) {
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
window.tvattstuga = hook;
