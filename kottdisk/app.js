import { KottdiskEngine } from './engine.js?v=overhaul-3';

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const PARAMS = [
  ['kd_volume', 'VOLYM', 'UTNIVÅ', .65, 'scale', '#e4d6ae'],
  ['kd_tone', 'DISK', 'LJUSHET', .65, 'bank', '#eac4b8'],
  ['kd_bite', 'MARMORERING', 'FM', .35, 'bank', '#d88d83'],
  ['kd_ratio', 'STYCKNING', 'ÖVERTONER', .25, 'bank', '#e9b18e'],
  ['kd_attack', 'ANSATS', 'ANSATS', .08, 'bank', '#cfbd84'],
  ['kd_decay', 'MÖRHET', 'AVKLINGNING', .4, 'bank', '#cfbd84'],
  ['kd_sustain', 'KROPP', 'HÅLLNIVÅ', .45, 'bank', '#cfbd84'],
  ['kd_release', 'VILA', 'SLÄPP', .3, 'bank', '#cfbd84'],
  ['kd_warmth', 'FETT', 'MÄTTNAD', .2, 'scale', '#d7ae7b'],
  ['kd_space', 'SALUHALL', 'RUM', .18, 'scale', '#b5bfa4'],
  ['kd_tender', 'MÖRA', 'EXTRA BETT', 0],
  ['kd_hold', 'LÅT VILA', 'HÅLL TONER', 0],
  ['zz_kd_bone', 'BEN', 'METALLANSLAG', 0],
  ['zz_kd_grind', 'KVARNA', 'RYTMISK MALNING', 0],
];
const definitions = Object.fromEntries(PARAMS.map(p => [p[0], p]));
const defaults = Object.fromEntries(PARAMS.map(p => [p[0], p[3]]));
const values = { ...defaults };
const controls = new Map();
const SESSION_KEY = 'kottdisk.session.v1';
const engine = new KottdiskEngine();
const transport = { bpm: 120, playing: false };
const sources = new Map();
const sounding = new Map();
const pointerNotes = new Map();
const computerNotes = new Map();
let ready = false;
let starting = null;
let storageTimer;
let displayTimer;
let selectedPreset = 'favorit';
let midiAccess;
let midiInput;
let demoEnabled = false;
let demoDesired = false;
let demoRequest = 0;
let demoClock;
let demoNext = 0;
let demoStep = 0;
let demoSerial = 0;
let hostTransport = false;
const demoOffs = new Set();
const tenderPointers = new Set();
const tenderKeys = new Set();
const heldVoices = new Set();
const cancelGestures = new Set();
const performanceInputs = new Map(['kd_tender', 'zz_kd_bone', 'zz_kd_grind'].map(name => [name, new Map()]));
const momentary = new Set(performanceInputs.keys());
let downloadsLoaded = false;

const presets = {
  favorit: { name: 'Diskens favorit', values: { ...defaults } },
  falukarlek: { name: 'Falukärlek', values: { ...defaults, kd_tone: .4, kd_bite: .12, kd_ratio: .06, kd_attack: .015, kd_decay: .48, kd_sustain: .56, kd_release: .16, kd_warmth: .36, kd_space: .12 } },
  nattmorad: { name: 'Skinksammet', values: { ...defaults, kd_tone: .48, kd_bite: .22, kd_ratio: .08, kd_attack: .6, kd_decay: .65, kd_sustain: .72, kd_release: .62, kd_warmth: .26, kd_space: .52 } },
  glaskropp: { name: 'Benporslin', values: { ...defaults, kd_tone: .75, kd_bite: .3, kd_ratio: .76, kd_attack: .01, kd_decay: .48, kd_sustain: .12, kd_release: .4, kd_warmth: .08, kd_space: .65 } },
  ravaror: { name: 'Fläskmorr', values: { ...defaults, kd_tone: .6, kd_bite: .79, kd_ratio: .19, kd_attack: .01, kd_decay: .22, kd_sustain: .68, kd_release: .12, kd_warmth: .86, kd_space: .12 } },
  sidenfett: { name: 'Knivspets', values: { ...defaults, kd_tone: .82, kd_bite: .52, kd_ratio: .38, kd_attack: .015, kd_decay: .24, kd_sustain: .1, kd_release: .12, kd_warmth: .18, kd_space: .28 } },
};

function status(message) { $('#menu-status').textContent = message; }
function fail(error) {
  console.error('KÖTTDISK:', error);
  showDisplay('KÖTTDISK · LJUD', '—', '');
  $('#lcd-state').textContent = 'ÖPPNA MENYN';
  status(error?.message || 'Ljudet kunde inte starta. Försök igen.');
}
engine.onerror = error => { ready = false; starting = null; fail(error); };
function showDisplay(label, value, unit = '%') {
  clearTimeout(displayTimer);
  $('#lcd-label').textContent = label;
  $('#lcd-value').textContent = String(value);
  $('#lcd-unit').textContent = unit;
}
function describe(name) {
  const p = definitions[name];
  if (p) showDisplay(`${p[1]} · ${p[2]}`, Math.round(values[name] * 100));
}
function restDisplay() {
  clearTimeout(displayTimer);
  displayTimer = setTimeout(() => {
    if (document.querySelector('.knob:focus-visible') || tenderPointers.size || tenderKeys.size || [...performanceInputs.values()].some(inputs => inputs.size)) return;
    showDisplay('KÖTTETS LUSTAR', '3000', 'FM');
  }, 1800);
}
function scheduleSave() {
  clearTimeout(storageTimer);
  storageTimer = setTimeout(() => saveLocal(false), 250);
}
function update(name, value, options = {}) {
  if (!definitions[name] || !Number.isFinite(Number(value))) return false;
  value = clamp(Number(value));
  if (name === 'kd_hold' || name === 'kd_tender') value = value >= .5 ? 1 : 0;
  values[name] = value;
  const knob = controls.get(name);
  if (knob) {
    knob.style.setProperty('--angle', `${-135 + value * 270}deg`);
    knob.setAttribute('aria-valuenow', String(Math.round(value * 100)));
    knob.setAttribute('aria-valuetext', `${Math.round(value * 100)} procent`);
  }
  if (name === 'kd_hold') {
    $('#hold').setAttribute('aria-pressed', String(Boolean(value)));
    if (!value) heldVoices.clear();
  }
  if (name === 'kd_tender') $('#tender').setAttribute('aria-pressed', String(Boolean(value)));
  document.querySelectorAll(`[data-performance="${name}"]`).forEach(pad => pad.setAttribute('aria-pressed', String(Boolean(value))));
  $('#instrument').classList.toggle('is-grinding', Boolean(values.zz_kd_grind));
  $('#instrument').classList.toggle('is-striking', Boolean(values.zz_kd_bone));
  if (ready) engine.setParam(name, value);
  if (options.display !== false) describe(name);
  if (options.preset !== false && !momentary.has(name) && name !== 'kd_hold') {
    selectedPreset = 'custom';
    $('#presets').value = 'custom';
  }
  if (!momentary.has(name)) scheduleSave();
  if (name === 'kd_hold') renderVoices();
  return true;
}

async function start() {
  if (ready && engine.healthy !== false) {
    await engine.start();
    if (engine.healthy === false) throw new Error('Ljudmotorn behöver öppnas igen.');
    return engine;
  }
  if (starting) return starting;
  ready = false;
  starting = (async () => {
    try {
      await engine.start();
      if (engine.healthy === false) throw new Error('Ljudmotorn behöver öppnas igen.');
      for (const [name, value] of Object.entries(values)) engine.setParam(name, value);
      engine.setTransport({ ...transport, playing: hostTransport ? transport.playing : demoEnabled });
      ready = true;
      for (const [key, note] of sounding) {
        if (sources.size && sounding.has(key)) engine.noteOn(note.note, note.velocity, note.channel);
      }
      $('#lcd-state').textContent = 'FÄRSKT OCH SPELBART';
      return engine;
    } finally { starting = null; }
  })();
  return starting;
}
function gestureStart() { start().catch(fail); }
function noteKey(note, channel) { return `${channel}:${note}`; }
function renderVoices() {
  const count = Math.min(6, new Set([...sounding.keys(), ...heldVoices]).size);
  document.querySelectorAll('.voice-lamps i').forEach((lamp, i) => lamp.classList.toggle('on', i < count));
  $('#instrument').classList.toggle('is-sounding', count > 0);
  const active = new Set([...sounding.values()].map(n => n.note));
  document.querySelectorAll('.key').forEach(key => key.classList.toggle('active', active.has(Number(key.dataset.note))));
}
function playNote(note, velocity = 100, channel = 1, source = `host:${channel}:${note}`) {
  note = clamp(Math.round(Number(note)), 0, 127);
  velocity = clamp(Math.round(Number(velocity)), 0, 127);
  channel = clamp(Math.round(Number(channel)), 1, 16);
  if (![note, velocity, channel].every(Number.isFinite)) return;
  if (velocity === 0) { releaseSource(source); return; }
  if (sources.has(source)) releaseSource(source);
  const key = noteKey(note, channel);
  const wasOn = sounding.has(key);
  sources.set(source, key);
  sounding.set(key, { note, velocity, channel });
  heldVoices.delete(key);
  if (ready && engine.healthy !== false && !wasOn) engine.noteOn(note, velocity, channel);
  if (!ready || engine.healthy === false || engine.context?.state !== 'running') gestureStart();
  renderVoices();
}
function releaseSource(source) {
  const key = sources.get(source);
  if (!key) return;
  sources.delete(source);
  if ([...sources.values()].includes(key)) return;
  const note = sounding.get(key);
  sounding.delete(key);
  if (note && ready) engine.noteOff(note.note, note.channel);
  if (values.kd_hold) heldVoices.add(key);
  renderVoices();
}
function noteOn(note, velocity = 100, channel = 1) { if ([1, 9].includes(Number(channel))) playNote(note, velocity, channel); }
function noteOff(note, channel = 1) { if ([1, 9].includes(Number(channel))) releaseSource(`host:${channel}:${note}`); }
const ccParams = { 7: 'kd_volume', 1: 'kd_bite', 16: 'kd_tone', 17: 'kd_bite', 18: 'kd_ratio', 19: 'kd_attack', 20: 'kd_decay', 21: 'kd_sustain', 22: 'kd_release', 23: 'kd_warmth', 24: 'kd_space', 25: 'kd_tender', 26: 'kd_hold', 64: 'kd_hold' };
function controlChange(cc, value, channel = 1) {
  if (![1, 9].includes(Number(channel))) return;
  cc = Math.round(Number(cc)); value = clamp(Math.round(Number(value)), 0, 127);
  if (!Number.isFinite(cc) || !Number.isFinite(value)) return;
  if (cc === 120 || cc === 123) panic();
  else if (ccParams[cc]) update(ccParams[cc], value / 127, { display: false });
  else if (ready) engine.controlChange(cc, value, channel);
  else start().then(() => engine.controlChange(cc, value, channel)).catch(fail);
}
function clearDemoNotes() {
  for (const timer of demoOffs) clearTimeout(timer);
  demoOffs.clear();
  for (const source of [...sources.keys()]) if (source.startsWith('demo:')) releaseSource(source);
  for (const [name, inputs] of performanceInputs) {
    if (!inputs.delete('demo')) continue;
    if (name === 'kd_tender') syncTender(); else update(name, Math.max(0, ...inputs.values()), { display: false });
  }
}
function panic() {
  toggleDemo(false);
  clearDemoNotes();
  sources.clear(); sounding.clear(); heldVoices.clear();
  releaseGestures();
  for (const name of momentary) update(name, 0, { display: false });
  update('kd_hold', 0, { display: false });
  if (ready) engine.panic();
  renderVoices();
}
function setTransport(next = {}) {
  hostTransport = true;
  const previousPlaying = transport.playing;
  const previousBpm = transport.bpm;
  if (Number.isFinite(Number(next.bpm)) && Number(next.bpm) > 0) transport.bpm = clamp(Number(next.bpm), 20, 400);
  if (typeof next.playing === 'boolean') transport.playing = next.playing;
  if (ready) engine.setTransport({ ...transport });
  if (!transport.playing) clearDemoNotes();
  if (transport.playing !== previousPlaying || transport.bpm !== previousBpm) {
    demoNext = performance.now();
    if (transport.playing && !previousPlaying) demoStep = 0;
  }
  return { ...transport };
}

function makeControl(p) {
  const [name, label, meaning, value, location, accent] = p;
  if (!location) return;
  const root = document.createElement('div'); root.className = 'control'; root.style.setProperty('--accent', accent);
  const knob = document.createElement('div');
  knob.className = 'knob'; knob.id = name; knob.tabIndex = 0;
  knob.setAttribute('role', 'slider'); knob.setAttribute('aria-label', `${label} · ${meaning}`);
  knob.setAttribute('aria-valuemin', '0'); knob.setAttribute('aria-valuemax', '100');
  knob.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  knob.setAttribute('aria-valuetext', `${Math.round(value * 100)} procent`);
  knob.setAttribute('aria-orientation', 'vertical');
  knob.style.setProperty('--angle', `${value * 270 - 135}deg`);
  knob.innerHTML = '<span class="pip" aria-hidden="true"></span><span class="dial" aria-hidden="true"></span>';
  const caption = document.createElement('span'); caption.className = 'control-caption'; caption.textContent = label;
  caption.id = `${name}-caption`; caption.setAttribute('aria-hidden', 'true');
  const line = document.createElement('span'); line.className = 'control-line';
  root.append(knob, caption, line); $(location === 'scale' ? '#scale-controls' : '#control-bank').append(root);
  controls.set(name, knob);
  let drag;
  let lastTap;
  function cancelDrag() {
    if (!drag) return;
    const id = drag.id; drag = null; knob.classList.remove('is-dragging');
    if (knob.hasPointerCapture(id)) knob.releasePointerCapture(id);
    restDisplay();
  }
  cancelGestures.add(cancelDrag);
  knob.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault(); gestureStart(); knob.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: values[name], distance: 0, started: event.timeStamp };
    knob.setPointerCapture(event.pointerId); knob.classList.add('is-dragging'); describe(name);
  });
  knob.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = drag.y - event.clientY;
    const scale = $('#instrument').getBoundingClientRect().width / 1200;
    drag.distance += Math.hypot(dx, dy);
    drag.x = event.clientX; drag.y = event.clientY;
    drag.value = clamp(drag.value + (dy + dx * .4) / scale / (event.shiftKey ? 1600 : 200));
    update(name, drag.value);
  });
  knob.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    if (drag.distance < 6 && event.timeStamp - drag.started < 350) {
      if (lastTap && event.timeStamp - lastTap.time < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 22) {
        update(name, defaults[name]); lastTap = null;
      } else lastTap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
    } else lastTap = null;
    cancelDrag();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) knob.addEventListener(type, event => { if (drag?.id === event.pointerId) { lastTap = null; cancelDrag(); } });
  knob.addEventListener('pointerenter', () => describe(name));
  knob.addEventListener('pointerleave', () => { if (!drag) restDisplay(); });
  knob.addEventListener('focus', () => describe(name));
  knob.addEventListener('blur', () => { cancelDrag(); restDisplay(); });
  knob.addEventListener('dblclick', event => { event.preventDefault(); update(name, defaults[name]); });
  knob.addEventListener('wheel', event => {
    event.preventDefault(); gestureStart();
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1);
    update(name, values[name] - clamp(pixels * .0005, -.1, .1) * (event.shiftKey ? .1 : 1)); restDisplay();
  }, { passive: false });
  knob.addEventListener('keydown', event => {
    const step = event.shiftKey ? .001 : .01;
    const moves = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: .1, PageDown: -.1 };
    if (event.key in moves) { event.preventDefault(); gestureStart(); update(name, values[name] + moves[event.key]); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); gestureStart(); update(name, event.key === 'Home' ? 0 : 1); }
  });
}
PARAMS.forEach(makeControl);

const whiteNotes = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71];
const noteNames = ['C', 'Ciss', 'D', 'Diss', 'E', 'F', 'Fiss', 'G', 'Giss', 'A', 'Aiss', 'B'];
for (let note = 48; note <= 71; note++) {
  const white = whiteNotes.indexOf(note);
  const button = document.createElement('button');
  button.type = 'button'; button.className = `key ${white >= 0 ? 'white' : 'black'}`; button.dataset.note = note;
  button.setAttribute('aria-label', `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`);
  button.tabIndex = note === 48 ? 0 : -1;
  if (white >= 0) { button.style.left = `${white * 70}px`; button.style.width = '70px'; }
  else {
    const before = whiteNotes.findLastIndex(n => n < note);
    button.style.left = `${(before + 1) * 70 - 21}px`; button.style.width = '42px';
  }
  button.addEventListener('keydown', event => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) playNote(note, 100, 1, `focus:${note}`);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 48 : event.key === 'End' ? 71 : clamp(note + (event.key === 'ArrowRight' ? 1 : -1), 48, 71);
      button.tabIndex = -1; const target = $(`.key[data-note="${next}"]`); target.tabIndex = 0; target.focus({ preventScroll: true });
    }
  });
  button.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); releaseSource(`focus:${note}`); } });
  button.addEventListener('blur', () => releaseSource(`focus:${note}`));
  $('#keyboard').append(button);
}
function pointerNote(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.key');
  return target && $('#keyboard').contains(target) ? Number(target.dataset.note) : null;
}
$('#keyboard').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const note = pointerNote(event); if (note === null) return;
  event.preventDefault(); $('#keyboard').setPointerCapture(event.pointerId); pointerNotes.set(event.pointerId, note);
  playNote(note, 106, 1, `pointer:${event.pointerId}`);
});
$('#keyboard').addEventListener('pointermove', event => {
  if (!pointerNotes.has(event.pointerId)) return;
  const note = pointerNote(event); if (note === pointerNotes.get(event.pointerId)) return;
  releaseSource(`pointer:${event.pointerId}`); pointerNotes.set(event.pointerId, note);
  if (note !== null) playNote(note, 106, 1, `pointer:${event.pointerId}`);
});
function releasePointer(event) {
  if (!pointerNotes.has(event.pointerId)) return;
  releaseSource(`pointer:${event.pointerId}`); pointerNotes.delete(event.pointerId);
  if ($('#keyboard').hasPointerCapture(event.pointerId)) $('#keyboard').releasePointerCapture(event.pointerId);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#keyboard').addEventListener(type, releasePointer);

const keyMap = { KeyA: 48, KeyW: 49, KeyS: 50, KeyE: 51, KeyD: 52, KeyF: 53, KeyT: 54, KeyG: 55, KeyY: 56, KeyH: 57, KeyU: 58, KeyJ: 59, KeyK: 60, KeyO: 61, KeyL: 62, KeyP: 63, Semicolon: 64, Quote: 65, BracketRight: 66, Backslash: 67, KeyZ: 68, KeyX: 69, KeyC: 70, KeyV: 71 };
function isEditing(event) { return $('#menu').open || event.target.closest('input,select,textarea,[contenteditable=true]'); }
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { panic(); return; }
  if (isEditing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('button,[role=slider]') && (event.code === 'Space' || event.code === 'Enter')) return;
  if (keyMap[event.code] !== undefined) {
    event.preventDefault(); if (event.repeat || computerNotes.has(event.code)) return;
    computerNotes.set(event.code, keyMap[event.code]); playNote(keyMap[event.code], 100, 1, `computer:${event.code}`);
  } else if (event.code === 'Space') {
    event.preventDefault(); if (!event.repeat) toggleDemo().catch(fail);
  }
});
document.addEventListener('keyup', event => {
  if (!computerNotes.has(event.code)) return;
  event.preventDefault(); computerNotes.delete(event.code); releaseSource(`computer:${event.code}`);
});

function syncTender() { update('kd_tender', tenderPointers.size || tenderKeys.size || performanceInputs.get('kd_tender').size ? 1 : 0); }
$('#tender').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); gestureStart(); $('#tender').focus({ preventScroll: true });
  $('#tender').setPointerCapture(event.pointerId); tenderPointers.add(event.pointerId); syncTender();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#tender').addEventListener(type, event => {
  tenderPointers.delete(event.pointerId);
  if ($('#tender').hasPointerCapture(event.pointerId)) $('#tender').releasePointerCapture(event.pointerId);
  syncTender(); restDisplay();
});
$('#tender').addEventListener('keydown', event => {
  if (!['Space', 'Enter'].includes(event.code)) return;
  event.preventDefault(); if (event.repeat) return;
  gestureStart(); tenderKeys.add(event.code); syncTender();
});
$('#tender').addEventListener('keyup', event => {
  if (!['Space', 'Enter'].includes(event.code)) return;
  event.preventDefault(); tenderKeys.delete(event.code); syncTender(); restDisplay();
});
$('#tender').addEventListener('blur', () => { tenderKeys.clear(); syncTender(); restDisplay(); });
$('#tender').addEventListener('pointerenter', () => describe('kd_tender'));
$('#tender').addEventListener('pointerleave', restDisplay);
$('#hold').addEventListener('click', () => { gestureStart(); update('kd_hold', 1 - values.kd_hold); restDisplay(); });
$('#hold').addEventListener('pointerenter', () => describe('kd_hold'));
$('#hold').addEventListener('pointerleave', restDisplay);
$('#hold').addEventListener('focus', () => describe('kd_hold'));
$('#hold').addEventListener('blur', restDisplay);

// The original counter illustration is also a pressure surface. It never makes sound itself.
for (const button of document.querySelectorAll('[data-performance]')) {
  const name = button.dataset.performance, inputs = performanceInputs.get(name);
  const pointers = new Set(), keys = new Set();
  const prefix = button.id + ':';
  function sync() { if (name === 'kd_tender') syncTender(); else update(name, Math.max(0, ...inputs.values())); }
  function clear() {
    for (const id of pointers) {
      inputs.delete(prefix + id);
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    pointers.clear(); for (const key of keys) inputs.delete(prefix + key); keys.clear(); sync();
  }
  cancelGestures.add(clear);
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); gestureStart(); button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId); pointers.add(event.pointerId); inputs.set(prefix + event.pointerId, 1); sync();
  });
  button.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || name === 'kd_tender') return;
    const rect = button.getBoundingClientRect();
    inputs.set(prefix + event.pointerId, clamp(1 - (event.clientY - (rect.y + rect.height / 2)) / rect.height, .08, 1)); sync();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
    if (!pointers.delete(event.pointerId)) return;
    inputs.delete(prefix + event.pointerId);
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    sync(); restDisplay();
  });
  button.addEventListener('keydown', event => {
    if (!['Space', 'Enter'].includes(event.code)) return;
    event.preventDefault(); if (event.repeat) return;
    gestureStart(); keys.add(event.code); inputs.set(prefix + event.code, 1); sync();
  });
  button.addEventListener('keyup', event => {
    if (!keys.delete(event.code)) return;
    event.preventDefault(); inputs.delete(prefix + event.code); sync(); restDisplay();
  });
  button.addEventListener('blur', () => {
    for (const key of keys) inputs.delete(prefix + key); keys.clear(); sync(); restDisplay();
  });
  button.addEventListener('pointerenter', () => describe(name));
  button.addEventListener('pointerleave', restDisplay);
  button.addEventListener('focus', () => describe(name));
  button.addEventListener('click', event => {
    // Assistive technology can activate a button without pointer/key events.
    if (event.detail !== 0 || pointers.size || keys.size) return;
    gestureStart(); inputs.set(prefix + 'assist', 1); sync();
    setTimeout(() => { inputs.delete(prefix + 'assist'); sync(); restDisplay(); }, 120);
  });
}

const phrase = [
  [48, 60, 63, 67], [], [55], [58], [60, 63], [], [67], [63],
  [44, 60, 63, 68], [], [56], [60], [63, 68], [], [67], [63],
  [46, 58, 62, 65], [], [53], [58], [62, 65], [], [67], [65],
  [43, 55, 58, 62], [], [55], [58], [62], [65], [63], [50, 55],
];
function demoTick() {
  if (!demoEnabled || (hostTransport && !transport.playing)) return;
  const now = performance.now();
  const interval = 30000 / transport.bpm;
  if (now - demoNext > interval * 2) demoNext = now;
  while (now >= demoNext) {
    const notes = phrase[demoStep % phrase.length];
    const duration = interval * (demoStep % 8 === 0 ? 1.8 : .73);
    notes.forEach((note, index) => {
      const source = `demo:${demoSerial++}`;
      playNote(note, index === 0 ? 92 : 74, 1, source);
      const timer = setTimeout(() => { releaseSource(source); demoOffs.delete(timer); }, duration);
      demoOffs.add(timer);
    });
    const accent = demoStep % 16 === 6 ? ['zz_kd_bone', .78] : demoStep % 16 === 14 ? ['zz_kd_grind', .72] : demoStep % 8 === 3 ? ['kd_tender', 1] : null;
    if (accent) {
      const [name, depth] = accent, inputs = performanceInputs.get(name);
      inputs.set('demo', depth);
      if (name === 'kd_tender') syncTender(); else update(name, Math.max(...inputs.values()), { display: false });
      const timer = setTimeout(() => {
        inputs.delete('demo');
        if (name === 'kd_tender') syncTender(); else update(name, Math.max(0, ...inputs.values()), { display: false });
        demoOffs.delete(timer);
      }, name === 'zz_kd_grind' ? interval * .85 : 85);
      demoOffs.add(timer);
    }
    demoStep++; demoNext += interval;
  }
}
async function toggleDemo(force) {
  const next = typeof force === 'boolean' ? force : !demoDesired;
  demoDesired = next;
  const request = ++demoRequest;
  if (next) {
    try { await start(); } catch (error) { if (request === demoRequest) demoDesired = false; throw error; }
    if (request !== demoRequest) return;
  }
  demoEnabled = next; clearInterval(demoClock); clearDemoNotes();
  $('#demo').setAttribute('aria-pressed', String(next));
  $('#demo span').textContent = next ? 'Stoppa smakprovet' : 'Spela ett smakprov';
  if (ready) engine.setTransport({ ...transport, playing: hostTransport ? transport.playing : next });
  if (next) {
    demoStep = 0; demoNext = performance.now(); demoClock = setInterval(demoTick, 20); demoTick();
    status(hostTransport && !transport.playing ? 'Smakprovet väntar på värdens transport.' : 'Spelar ett smakprov i c-moll.');
  } else status('Smakprovet är stoppat.');
}
$('#demo').addEventListener('click', () => toggleDemo().catch(fail));
$('#panic').addEventListener('click', () => { toggleDemo(false); panic(); status('Alla toner släppta.'); });

function session() { return { schema: 'kottdisk-session', version: 1, preset: selectedPreset, values: { ...values, kd_tender: 0, kd_hold: 0, zz_kd_bone: 0, zz_kd_grind: 0 } }; }
function applySession(data) {
  if (!data || data.version !== 1 || data.schema !== 'kottdisk-session' || !data.values || typeof data.values !== 'object') throw new Error('Det här är inte en KÖTTDISK-session i version 1.');
  for (const [name, value] of Object.entries(data.values)) {
    if (!definitions[name] || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Sessionsfilen innehåller ogiltiga reglage.');
  }
  if (!PARAMS.slice(0, 12).every(([name]) => Object.hasOwn(data.values, name))) throw new Error('Sessionsfilen saknar reglage.');
  panic();
  for (const name of Object.keys(defaults)) update(name, momentary.has(name) || name === 'kd_hold' ? 0 : (data.values[name] ?? defaults[name]), { display: false, preset: false });
  selectedPreset = presets[data.preset] ? data.preset : 'custom'; $('#presets').value = selectedPreset;
  showDisplay('STYCKNING · ÅTERSTÄLLD', '3000', 'FM'); restDisplay();
}
function saveLocal(report = true) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session())); if (report) status('Din styckning är sparad i webbläsaren.'); }
  catch { if (report) status('Webbläsaren tillåter inte lagring. Hämta en sessionsfil i stället.'); }
}
for (const [id, preset] of Object.entries(presets)) $('#presets').add(new Option(preset.name, id));
$('#presets').add(new Option('Egen styckning', 'custom'));
$('#presets').addEventListener('change', event => {
  const preset = presets[event.target.value]; if (!preset) return;
  panic(); for (const [name, value] of Object.entries(preset.values)) update(name, value, { display: false, preset: false });
  selectedPreset = event.target.value; scheduleSave();
  showDisplay('STYCKNING · ' + preset.name.toLocaleUpperCase('sv'), '3000', 'FM'); restDisplay();
  status(`${preset.name} är vald.`);
});
try { const saved = localStorage.getItem(SESSION_KEY); if (saved) applySession(JSON.parse(saved)); } catch { /* An invalid stored session leaves the factory sound intact. */ }
$('#save-session').addEventListener('click', () => saveLocal());
$('#export-session').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(session(), null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'kottdisk-3000-session.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); status('Sessionsfilen är hämtad.');
});
$('#import-session').addEventListener('click', () => $('#session-file').click());
$('#session-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 100000) throw new Error('Sessionsfilen är för stor.'); applySession(JSON.parse(await file.text())); saveLocal(false); status('Din styckning är öppnad.'); }
  catch (error) { status(error.message || 'Sessionsfilen kunde inte öppnas.'); }
  event.target.value = '';
});

function midiMessage(event) {
  const [statusByte, first, second = 0] = event.data;
  const type = statusByte & 0xf0; const channel = (statusByte & 0x0f) + 1;
  const source = `midi:${channel}:${first}`;
  if (type === 0x90 && second > 0) playNote(first, second, 1, source);
  else if (type === 0x80 || type === 0x90) releaseSource(source);
  else if (type === 0xb0) controlChange(first, second, 1);
  else if (statusByte === 0xfa || statusByte === 0xfb) setTransport({ playing: true });
  else if (statusByte === 0xfc) setTransport({ playing: false });
}
function releaseMidi() {
  for (const source of [...sources.keys()]) if (source.startsWith('midi:')) releaseSource(source);
  if (midiInput) midiInput.onmidimessage = null;
  midiInput = null;
}
function chooseMidi(id) {
  releaseMidi();
  midiInput = midiAccess?.inputs.get(id);
  if (midiInput) { midiInput.onmidimessage = midiMessage; $('#midi-status').textContent = `Ansluten: ${midiInput.name || 'MIDI-klaviatur'}.`; }
  else $('#midi-status').textContent = 'Ingen MIDI-ingång vald.';
}
function refreshMidi() {
  const select = $('#midi-input'); const current = midiInput?.id;
  select.replaceChildren(new Option('Välj en MIDI-ingång', ''));
  for (const input of midiAccess.inputs.values()) if (input.state !== 'disconnected') select.add(new Option(input.name || 'MIDI-klaviatur', input.id));
  select.disabled = select.options.length === 1;
  if (current && midiAccess.inputs.get(current)?.state !== 'disconnected') select.value = current;
  else { releaseMidi(); if (select.options.length > 1) { select.selectedIndex = 1; chooseMidi(select.value); } }
  if (select.disabled) $('#midi-status').textContent = 'Ingen MIDI-ingång hittades. Anslut en klaviatur.';
}
$('#connect-midi').addEventListener('click', async () => {
  if (!navigator.requestMIDIAccess) { $('#midi-status').textContent = 'Den här webbläsaren saknar Web MIDI. Spela med skärmens klaviatur eller använd en webbläsare med MIDI-stöd.'; return; }
  try { await start(); midiAccess = await navigator.requestMIDIAccess({ sysex: false }); midiAccess.onstatechange = refreshMidi; refreshMidi(); status('MIDI är aktiverat.'); }
  catch (error) { $('#midi-status').textContent = `MIDI kunde inte anslutas: ${error.message}`; }
});
$('#midi-input').addEventListener('change', event => chooseMidi(event.target.value));
$('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else { status('Helskärm stöds inte i den här webbläsaren.'); return; }
  } catch { status('Webbläsaren kunde inte öppna helskärm.'); }
});
document.addEventListener('fullscreenchange', () => { $('#fullscreen').textContent = document.fullscreenElement ? 'Lämna helskärm' : 'Visa helskärm'; resize(); });

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
async function loadDownloads() {
  if (downloadsLoaded) return;
  downloadsLoaded = true;
  try {
    const response = await fetch('./downloads.json'); if (!response.ok) throw new Error('not found');
    const data = await response.json();
    const entries = Array.isArray(data) ? data : Array.isArray(data.downloads) ? data.downloads : Array.isArray(data.files) ? data.files : [];
    const container = $('#downloads'); container.replaceChildren();
    for (const entry of entries) {
      const url = safeUrl(entry.url || entry.href || entry.path); if (!url) continue;
      const link = document.createElement('a'); link.className = 'download-link'; link.href = url; link.download = ''; link.textContent = entry.label || entry.name || entry.title || 'Hämta byggpaket'; container.append(link);
      if (/käll|source/i.test(link.textContent)) $('#source-link').href = url;
      if (/licen/i.test(link.textContent)) $('#license-link').href = url;
    }
    if (!container.children.length) { const p = document.createElement('p'); p.textContent = 'Inga byggpaket finns i den här utgåvan.'; container.append(p); }
    const sourceUrl = safeUrl(data.source?.url || data.source || data.sourceUrl); if (sourceUrl) $('#source-link').href = sourceUrl;
    const licenseUrl = safeUrl(data.license?.url || data.license || data.licenseUrl); if (licenseUrl) $('#license-link').href = licenseUrl;
    if (data.version || data.commit) $('#build-info').textContent = `KÖTTDISK 3000 · ${data.version || String(data.commit).slice(0, 8)}`;
  } catch { $('#downloads').textContent = 'Byggpaketen kunde inte hämtas. Prova igen när du är ansluten.'; downloadsLoaded = false; }
}
$('#menu-open').addEventListener('click', () => {
  releaseGestures();
  $('#menu').showModal(); loadDownloads();
});
$('#menu-close').addEventListener('click', () => $('#menu').close());
$('#menu').addEventListener('click', event => { if (event.target !== $('#menu')) return; const rect = $('#menu').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#menu').close(); });
$('#menu').addEventListener('cancel', () => panic());
function releaseGestures() {
  for (const cancel of cancelGestures) cancel();
  for (const source of [...sources.keys()]) if (/^(computer|pointer|focus):/.test(source)) releaseSource(source);
  for (const id of pointerNotes.keys()) if ($('#keyboard').hasPointerCapture(id)) $('#keyboard').releasePointerCapture(id);
  for (const id of tenderPointers) if ($('#tender').hasPointerCapture(id)) $('#tender').releasePointerCapture(id);
  computerNotes.clear(); pointerNotes.clear(); tenderPointers.clear(); tenderKeys.clear();
  for (const [name, inputs] of performanceInputs) { inputs.clear(); update(name, 0, { display: false }); }
}
window.addEventListener('blur', releaseGestures);
document.addEventListener('visibilitychange', () => { if (document.hidden) { toggleDemo(false); panic(); } });
window.addEventListener('pagehide', () => { saveLocal(false); toggleDemo(false); panic(); });
function resize() {
  const width = Math.max(240, document.documentElement.clientWidth);
  const height = window.innerHeight;
  const scale = Math.min(1, (width - (width < 640 ? 16 : 40)) / 1200, Math.max(.2, (height - 65) / 750));
  $('#instrument-frame').style.width = `${1200 * scale}px`; $('#instrument-frame').style.height = `${750 * scale}px`;
  $('#instrument').style.transform = `scale(${scale})`;
}
window.addEventListener('resize', resize); resize();

window.kottdisk = {
  start, update, noteOn, noteOff, controlChange, setTransport, panic,
  get values() { return { ...values }; }, get engine() { return engine; },
  get transport() { return { ...transport }; }, get ready() { return ready; },
  get presets() { return structuredClone(presets); },
  loadPreset(name) { if (!presets[name]) return false; $('#presets').value = name; $('#presets').dispatchEvent(new Event('change')); return true; },
  exportSession: session, importSession: applySession,
  playDemo: () => toggleDemo(true), stopDemo: () => toggleDemo(false),
};

// A service worker is an optional shell cache; local development stays uncached.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !new URLSearchParams(location.search).has('no-sw')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offlinecache:', error)));
}
