// SVETTAN 3000 i bastun. Sex nakna gubbar på laven är kören: varje röst i motorn är en gubbe.
// The sound is the PlugData engine (svettan.pd -> hvcc -> WebAssembly) running in an AudioWorklet;
// this page is the bastu around it and only ever talks to the engine through its parameters and MIDI.
const $ = (id) => document.getElementById(id), bastu = $('bastu');
const VERSION = 'svettan-web-1';
const STORAGE = 'svettan-session-v1';
const CHANNEL = 15;  // MIDI channel 16, zero-based
const inAlskog = (() => { try { return window.parent !== window && !!window.parent.alskog; } catch { return false; } })();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let ac = null, node = null, ready = false, starting = null, midiAccess = null, storeTimer = null;
let playing = false, clocked = false, hold = false, oct = 0, heat = null, lastTouch = performance.now();
const pending = [];

// ---------- engine
function post(message) { if (node) node.port.postMessage(message); else pending.push(message); }
const param = (name, value) => post({type: 'param', name, value});
function ensureAudio() {
  if (ac) { if (ac.state !== 'running') ac.resume().catch(() => {}); return starting; }
  const Context = window.AudioContext || window.webkitAudioContext;
  ac = new Context({latencyHint: 'interactive'});
  // iPhone: play through the ringer switch, like the other 3000 machines.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
  ac.resume().catch(() => {});
  starting = (async () => {
    const parameters = await (await fetch('params.json')).json();
    await ac.audioWorklet.addModule('worklet.js');
    node = new AudioWorkletNode(ac, 'svettan', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {parameters}});
    node.port.onmessage = fromEngine;
    node.connect(ac.destination);
    // The full state goes over first; queued notes follow (queued parameter values are older).
    syncEngine();
    for (const message of pending.splice(0)) if (message.type !== 'param') node.port.postMessage(message);
  })().catch((error) => { say('MOTORFEL', String(error.message || error).toUpperCase()); throw error; });
  return starting;
}
const unlock = () => { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, {capture: true, passive: true});

// ---------- the display
const say = (name, line = '') => { $('lname').textContent = name; $('lline').textContent = line; lastTouch = performance.now(); };
const temp = (h) => Math.round(30 + 80 * h);

// ---------- the gubbar: one per engine voice
const GUBBAR = [
  {name: 'BENGT', x: 300, y: 70, skin: '#efc4a8', hair: 'transparent', extra: '<span class="sv-stache"></span>', bald: 1},
  {name: 'LASSE', x: 470, y: 70, skin: '#e8b998', hair: '#cfcac2', extra: '<span class="sv-beard"></span>'},
  {name: 'KJELL', x: 640, y: 70, skin: '#d9a07a', hair: '#3b2a1e', chest: 1},
  {name: 'ROFFE', x: 385, y: 188, skin: '#f2c9b0', hair: '#8a6a3a', extra: '<span class="sv-shades"></span>'},
  {name: 'GÖRAN', x: 555, y: 188, skin: '#e9bc9c', hair: '#9b9a96', extra: '<span class="sv-glasses"></span>'},
  {name: 'STIG-ÅKE', x: 725, y: 188, skin: '#f4d2b8', hair: '#b4a48a', comb: 1}];
$('gubbar').outerHTML = GUBBAR.map((g, i) => `<div class="sv-gubbe${g.bald ? ' bald' : ''}${g.chest ? ' chest' : ''}${g.comb ? ' comb' : ''}" id="g${i}" style="left:${g.x}px;top:${g.y}px;--skin:${g.skin};--hair:${g.hair};--sway-delay:${-i * .37}s">
 <span class="sv-bubble" id="gb${i}"></span>
 <div class="sv-head"><span class="sv-hair"></span><div class="sv-eyes"><i></i><i></i></div>${g.extra || ''}<span class="sv-mouth"></span><span class="sv-sweat"></span></div>
 <div class="sv-torso"><span class="sv-arm l"></span><span class="sv-arm r"></span><span class="sv-belly"></span></div>
 <div class="sv-towel"></div><div class="sv-legs"><i></i><i></i></div>
 <span class="sv-name ds-engrave">${g.name}</span></div>`).join('');
// The stones on the aggregat and the leaves of björkriset are drawn once.
$('stones').innerHTML = [[0, 22], [30, 16], [62, 24], [94, 14], [126, 22], [156, 18], [14, 0], [46, 2], [80, 0], [112, 4], [142, 0], [62, -18], [100, -16]]
  .map(([x, y]) => `<i style="left:${x}px;top:${y + 18}px"></i>`).join('');
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let leaves = '';
  for (let i = 0; i < 46; i++) {
    const a = -1.2 + rnd() * 2.4, r = 18 + rnd() * 70, x = 48 + Math.sin(a) * r * .55, y = 24 + Math.cos(a) * r * .95 + 10;
    leaves += `<ellipse class="leaf${rnd() < .4 ? ' d' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="4.2" transform="rotate(${(a * -57 + 90 + rnd() * 30).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  $('vihta').innerHTML = `<svg viewBox="0 0 96 128" aria-hidden="true"><path d="M48 4 C40 8 40 16 48 18 C56 16 56 8 48 4"/><path d="M48 18 V40 M48 40 C40 60 30 90 26 120 M48 40 C46 70 44 100 44 124 M48 40 C52 70 56 100 60 124 M48 40 C58 60 68 90 72 118"/><path d="M42 26 H54 M42 30 H54" stroke-width="3" stroke="#c9b28a"/>${leaves}</svg>`;
}
bastu.setAttribute('role', 'group');
bastu.setAttribute('aria-label', 'Bastun: sex nakna gubbar sitter på laven och sjunger det du spelar. Till höger aggregatet och bastuspannen, till vänster fönstret mot isvaken och björkriset på kroken. Fotpallen längst ned är klaviaturen.');
const voiceNote = Array(6).fill(null);  // the note each gubbe is singing, or null
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nn = (n) => NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
const MOUTHS = [['M', 'MMMMM', 'm'], ['O', 'OOOOH', 'o'], ['Å', 'ÅÅÅÅH', 'aa'], ['A', 'AAAAH', 'a'], ['Ä', 'ÄÄÄÄH', 'ae'], ['E', 'EEEEH', 'e'], ['I', 'IIIIH', 'i']];
let kastaUntil = 0;
const mouthNow = () => MOUTHS[performance.now() < kastaUntil ? 3 : Math.round(val.vowel * 6)];
function drawMouths() {
  const shape = mouthNow()[2];
  if (bastu.dataset.mouth !== shape) bastu.dataset.mouth = shape;
}
function sing(voice, note, velocity) {
  const g = $('g' + voice);
  if (!g) return;
  if (velocity > 0) {
    voiceNote[voice] = note;
    g.classList.add('sings');
    const bubble = $('gb' + voice);
    bubble.textContent = nn(note);
    retrigger(bubble, 'pop');
    say(GUBBAR[voice].name + ' · ' + nn(note), mouthNow()[1]);
  } else {
    voiceNote[voice] = null;
    g.classList.remove('sings');
  }
}

// ---------- knobs
const K = [  // name, meaning, param, default, channel colour
  ['VÄRME', 'TEMPERATUR', 'heat', .45, '--ch-heat'], ['MUN', 'VOKAL', 'vowel', .35, '--ch-choir'], ['FLÅS', 'ANDEDRÄKT', 'breath', .35, '--ch-choir'],
  ['DALLER', 'VIBRATO', 'tremble', .3, '--ch-choir'], ['ANDETAG', 'ANSATS OCH SLÄPP', 'swell', .35, '--ch-choir'], ['GUBBAR', 'UNISONO', 'crowd', .4, '--ch-choir'],
  ['DROPPAR', 'SVETTDROPPAR', 'drops', .3, '--ch-water'], ['SVETT', 'DRIVE', 'drive', .2, '--ch-heat'], ['PANEL', 'RUMSKLANG', 'room', .4, '--ch-wood'],
  ['PUMP', 'BJÖRKRISET DUCKAR KÖREN', 'whip', .35, '--ch-birch'], ['SMISK', 'BJÖRKRISETS NIVÅ', 'smack', .6, '--ch-birch']];
const KN = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="ds-knob-arc" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="ds-knob-ptr" x1="25" y1="25" x2="25" y2="9"/></svg>';
const val = Object.fromEntries(K.map((k) => [k[2], k[3]]));
const knobHtml = (k, i) => `<div class="sv-knob"><button class="ds-control ds-knob" id="kn${i}" role="slider" aria-valuemin="0" aria-valuemax="100" style="--ds-face:var(${k[4]})" aria-label="${k[0]} (${k[1].toLowerCase()})">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`;
$('knobs').innerHTML = K.slice(0, 9).map(knobHtml).join('');
$('kvastKnobs').innerHTML = K.slice(9).map((k, j) => knobHtml(k, j + 9)).join('');
function knobValue(i) {
  const k = K[i], v = val[k[2]];
  if (k[2] === 'heat') return 'MÅL ' + temp(Math.min(v, .9)) + '°C';
  if (k[2] === 'vowel') { const m = MOUTHS[Math.round(v * 6)]; return m[0] + ' · ' + m[1]; }
  if (k[2] === 'swell') return 'ANSATS ' + ((12 + 2400 * v * v) / 1000).toFixed(2) + ' S';
  return Math.round(v * 100) + '%';
}
const knobText = (i) => [K[i][0] + ' · ' + K[i][1], knobValue(i)];
function setK(i, v, quiet) {
  const k = K[i];
  val[k[2]] = clamp(v);
  const e = $('kn' + i);
  e.style.setProperty('--angle', (val[k[2]] * 270 - 135) + 'deg');
  e.setAttribute('aria-valuenow', Math.round(val[k[2]] * 100));
  e.setAttribute('aria-valuetext', knobValue(i));
  if (!quiet) { say(...knobText(i)); markPreset(-1); }
  param(k[2], val[k[2]]);
  if (k[2] === 'vowel') drawMouths();
  if (k[2] === 'tremble') bastu.style.setProperty('--sway', (1.6 - val.tremble * 1.25).toFixed(2) + 's');
  store();
}
K.forEach((k, i) => {
  const e = $('kn' + i);
  setK(i, val[k[2]], 1);
  e.addEventListener('pointerdown', (ev) => {
    ensureAudio();
    try { e.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers */ }
    let y = ev.clientY;
    const mv = (m) => { if (m.pointerId !== ev.pointerId) return; setK(i, val[k[2]] + (y - m.clientY) / 160); y = m.clientY; };
    const up = (u) => { if (u.pointerId !== ev.pointerId) return; e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up); };
    e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    say(...knobText(i));
  });
  e.addEventListener('dblclick', () => setK(i, k[3]));
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(...knobText(i)); });
  e.addEventListener('focus', () => say(...knobText(i)));
  e.addEventListener('wheel', (ev) => { ev.preventDefault(); setK(i, val[k[2]] + (ev.deltaY < 0 ? .04 : -.04)); }, {passive: false});
  e.addEventListener('keydown', (ev) => {
    const d = {ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05}[ev.key];
    if (d) { ev.preventDefault(); ev.stopPropagation(); setK(i, val[k[2]] + d); }
  });
});
const knobIndex = (name) => K.findIndex((k) => k[2] === name);

// ---------- bastur: six sounds, named after the sauna they come from
const BASTUR = [
  ['FINSK', 'FINSK BASTU · TORR OCH HET', {heat: .82, vowel: .5, breath: .2, tremble: .35, swell: .3, crowd: .3, drops: .25, drive: .45, room: .3}],
  ['RÖK', 'RÖKBASTU · SOT OCH MUMMEL', {heat: .6, vowel: 1 / 6, breath: .6, tremble: .25, swell: .55, crowd: .55, drops: .2, drive: .3, room: .65}],
  ['SPA', 'HOTELLSPA · LJUMMET OCH RENT', {heat: .25, vowel: 5 / 6, breath: .15, tremble: .15, swell: .45, crowd: .2, drops: .1, drive: 0, room: .55}],
  ['BADHUS', 'BADHUSET 1962 · EKO OCH DALLER', {heat: .5, vowel: 2 / 6, breath: .35, tremble: .7, swell: .4, crowd: .45, drops: .55, drive: .15, room: .85}],
  ['MUNKAR', 'MUNKARNA · MUNNEN STÄNGD', {heat: .35, vowel: 0, breath: .3, tremble: .2, swell: .7, crowd: .7, drops: .05, drive: .1, room: .7}],
  ['GYMMET', 'GYMMETS BASTU · PUMP OCH SMISK', {heat: .7, vowel: 4 / 6, breath: .25, tremble: .3, swell: .15, crowd: .35, drops: .3, drive: .55, room: .25, whip: .7, smack: .7}]];
let preset = -1;
$('presets').innerHTML = BASTUR.map((b, i) => `<button class="ds-control sv-preset" id="ps${i}" role="radio" aria-checked="false" aria-label="${b[1].toLowerCase()}">${b[0]}</button>`).join('');
function markPreset(i) { preset = i; BASTUR.forEach((_, k) => $('ps' + k).setAttribute('aria-checked', String(k === i))); }
function choosePreset(i) {
  for (const [name, value] of Object.entries(BASTUR[i][2])) setK(knobIndex(name), value, 1);
  markPreset(i); store();
  say('BASTU · ' + BASTUR[i][1].split(' · ')[0], BASTUR[i][1].split(' · ')[1]);
}
BASTUR.forEach((b, i) => {
  const e = $('ps' + i);
  e.onclick = () => { ensureAudio(); choosePreset(i); };
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say('BASTU · ' + b[1].split(' · ')[0], b[1].split(' · ')[1]); });
});

// ---------- fotpallen: two octaves, every finger owns a key
const KEYMAP = 'awsedftgyhujkolp;';
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const BLACK = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6], [13, 8], [15, 9], [18, 11], [20, 12], [22, 13]];
const KEYW = 52;
WHITE.forEach((sem, i) => $('keys').insertAdjacentHTML('beforeend', `<button class="sv-key w" id="key${sem}" style="left:${i * KEYW}px" aria-label="${nn(48 + sem)}"></button>`));
BLACK.forEach(([sem, after]) => $('keys').insertAdjacentHTML('beforeend', `<button class="sv-key b" id="key${sem}" style="left:${after * KEYW}px" aria-label="${nn(48 + sem)}"></button>`));
const sounding = new Map();  // key index -> midi note sent, so octave changes never strand a note
function keyOn(sem) {
  if (sounding.has(sem)) return;
  ensureAudio();
  const midi = 48 + oct * 12 + sem;
  sounding.set(sem, midi);
  $('key' + sem)?.classList.add('down');
  post({type: 'midi', bytes: [0x90 | CHANNEL, midi, 100]});
}
function keyOff(sem) {
  $('key' + sem)?.classList.remove('down');
  const midi = sounding.get(sem);
  if (midi === undefined) return;
  sounding.delete(sem);
  post({type: 'midi', bytes: [0x80 | CHANNEL, midi, 0]});
}
const fingers = new Map();
const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.classList.contains('sv-key') ? +el.id.slice(3) : null; };
$('keys').addEventListener('pointerdown', (e) => {
  const sem = keyAt(e.clientX, e.clientY);
  if (sem === null) return;
  e.preventDefault();
  try { $('keys').setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
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
function setOct(d) { oct = Math.max(-2, Math.min(2, oct + d)); say('OKTAV · ' + (oct > 0 ? '+' : '') + oct, 'FOTPALLEN BÖRJAR PÅ ' + nn(48 + oct * 12)); }
$('odn').onclick = () => setOct(-1);
$('oup').onclick = () => setOct(1);

const typing = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, summary, .menu-panel');
document.addEventListener('keydown', (e) => {
  if (typing(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase(), sem = KEYMAP.indexOf(k);
  if (sem >= 0 && k.length === 1) { e.preventDefault(); keyOn(sem); }
  else if (k === 'z') setOct(-1);
  else if (k === 'x') setOct(1);
  else if (k === 'q') { ensureAudio(); kasta(); }
  else if (k === 'i') { ensureAudio(); setHold(!hold); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (/^[1-6]$/.test(e.key)) { ensureAudio(); choosePreset(+e.key - 1); }
});
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && !typing(e)) e.preventDefault();
  const k = e.key.toLowerCase(), sem = KEYMAP.indexOf(k);
  if (sem >= 0 && k.length === 1) keyOff(sem);
});
window.addEventListener('blur', () => { for (const sem of [...sounding.keys()]) keyOff(sem); });

// ---------- KASTA: the ladle throws water on the stones
let kastaTimer;
function kasta() {
  param('kasta', 1);
  clearTimeout(kastaTimer);
  kastaTimer = setTimeout(() => param('kasta', 0), 40);
}
function onKasta() {
  kastaUntil = performance.now() + 1500; drawMouths();
  retrigger($('bucket'), 'throw'); retrigger($('steam'), 'burst'); retrigger(bastu, 'kastat');
  retrigger($('kasta'), 'flash');
  clearTimeout(onKasta.timer);
  onKasta.timer = setTimeout(() => { bastu.classList.remove('kastat'); drawMouths(); }, 1600);
  clearTimeout(onKasta.steam);
  onKasta.steam = setTimeout(() => $('steam').classList.remove('burst'), 2300);
  say('KASTA · FSSSSSSH', 'VATTEN PÅ STENARNA · ALLA: AAAAAH');
}
for (const id of ['kasta', 'bucket']) $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); ensureAudio(); kasta(); });
for (const id of ['kasta', 'bucket']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) { ensureAudio(); kasta(); } } });
$('kasta').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('KASTA · VATTEN PÅ STENARNA', 'KÖREN SVÄLLER OCH BLIR VARMARE (Q)'); });

// ---------- ISVAK: everyone out in the lake. The chord freezes (sustain) and the bastu cools down.
function setHold(v) {
  hold = !!v; param('hold', hold ? 1 : 0);
  $('isvak').setAttribute('aria-pressed', String(hold)); $('window').setAttribute('aria-pressed', String(hold));
  bastu.classList.toggle('frozen', hold);
  say(hold ? 'ISVAK · ALLA UT I SJÖN' : 'ISVAK · IN I VÄRMEN IGEN', hold ? 'ACKORDET FRYSER FAST · BASTUN SVALNAR' : 'SLÄPPTA TONER SLÄPPS');
  store();
}
$('isvak').onclick = () => { ensureAudio(); setHold(!hold); };
$('window').onclick = () => { ensureAudio(); setHold(!hold); };
$('isvak').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('ISVAK · HÅLL ACKORDET', 'SOM EN SUSTAINPEDAL · KYLER BASTUN (I)'); });

// ---------- björkriset: 16 steps of smisk (1) and hård smisk (2)
const KVAST = [2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 1, 0, 1, 0, 0];
let kv = KVAST.slice();
const extras = {bpm: 96, length: 16, swing: 0, tune: 0, volume: .8};
const stepText = (i) => ['BJÖRKRIS · STEG ' + (i + 1), ['VILA', 'SMISK', 'HÅRD SMISK'][kv[i]]];
function drawStep(i) {
  const b = $('sp' + i);
  b.setAttribute('aria-pressed', String(kv[i] > 0));
  b.style.setProperty('--ds-face', kv[i] ? 'var(--ch-birch)' : 'var(--ch-birch-dim)');
  kv[i] === 2 ? b.dataset.accent = '1' : b.removeAttribute('data-accent');
  b.setAttribute('aria-label', 'Steg ' + (i + 1) + ', ' + stepText(i)[1].toLowerCase());
}
for (let i = 0; i < 16; i++) {
  $('steps').insertAdjacentHTML('beforeend', `<button class="ds-control ds-step sv-step" id="sp${i}"><span class="ds-step-accent"></span></button>`);
  const b = $('sp' + i);
  b.onclick = () => { ensureAudio(); kv[i] = (kv[i] + 1) % 3; drawStep(i); param('kv' + i, kv[i]); say(...stepText(i)); store(); };
  b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(...stepText(i)); });
  drawStep(i);
}
function setPlaying(v) {
  playing = v;
  $('play').setAttribute('aria-pressed', String(v)); $('vihta').setAttribute('aria-pressed', String(v));
  $('pi').setAttribute('d', v ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
  if (v) say('BJÖRKRIS · SMISK SMISK', 'KÖREN PUMPAR MED RISET');
  else { for (let k = 0; k < 16; k++) $('sp' + k).classList.remove('is-current'); say('BJÖRKRISET HÄNGER PÅ KROKEN', ''); }
}
function togglePlay() {
  ensureAudio();
  if (clocked) { say('SYNKAD · MIDI-KLOCKAN STYR BJÖRKRISET'); return; }
  setPlaying(!playing); param('start', playing ? 1 : 0);
}
$('play').onclick = togglePlay;
$('vihta').onclick = togglePlay;
$('vihta').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('BJÖRKRISET · STARTA OCH STOPPA', 'MELLANSLAG'); });
const bpm = () => Math.min(300, Math.max(30, Math.round(+$('bpm').value || 96)));
function setBpm(v, quiet) {
  $('bpm').value = Math.min(300, Math.max(30, Math.round(v)));
  extras.bpm = bpm(); param('bpm', extras.bpm); store();
  if (!quiet) say('TEMPO · BJÖRKRISET', bpm() + ' BPM');
}
$('bpm').addEventListener('input', () => { if ($('bpm').value !== '') { extras.bpm = bpm(); param('bpm', extras.bpm); say('TEMPO · BJÖRKRISET', bpm() + ' BPM'); store(); } });
$('bpm').addEventListener('change', () => setBpm(bpm()));
$('bpm').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// ---------- heat: thermometer, stones, red faces
function setHeat(h) {
  heat = h;
  const t = temp(h);
  $('lval').textContent = t + '°C';
  $('thermoRead').textContent = t + '°';
  $('mercury').style.height = (clamp((t - 20) / 100) * 100).toFixed(1) + '%';
  bastu.style.setProperty('--heat', clamp(h).toFixed(3));
  bastu.style.setProperty('--flush', clamp((h - .3) / .7).toFixed(3));
  bastu.classList.toggle('scorching', t >= 100);
}

// ---------- svimma: someone faints, gets carried out, wakes up
let fainted = -1;
function onSvimma(on) {
  if (on) {
    const singing = voiceNote.map((n, i) => n === null ? -1 : i).filter((i) => i >= 0);
    const pool = singing.length ? singing : [0, 1, 2, 3, 4, 5];
    fainted = pool[Math.floor(Math.random() * pool.length)];
    $('g' + fainted).classList.add('faint');
    say(GUBBAR[fainted].name + ' SVIMMADE!', 'FÖR VARMT · BÄR UT HONOM');
  } else if (fainted >= 0) {
    $('g' + fainted).classList.remove('faint');
    say(GUBBAR[fainted].name + ' VAKNADE', '"JAG MÅR BRA. KASTA EN TILL."');
    fainted = -1;
  }
}

// ---------- drops of sweat from the ceiling
function drop(note) {
  if (reducedMotion.matches || $('drops').childElementCount > 14) return;
  const d = document.createElement('i');
  d.className = 'sv-drop';
  d.style.left = (290 + ((note * 37) % 560) + Math.random() * 30).toFixed(0) + 'px';
  $('drops').append(d);
  setTimeout(() => d.remove(), 1100);
}

// ---------- engine events, played back when they are heard
function retrigger(el, cls) { if (reducedMotion.matches) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const hook = new EventTarget();
function fire(ev) {
  const v = ev.values;
  if (ev.name === 'ev_voice') {
    const [voice, note, velocity] = v;
    sing(voice - 1, note, velocity);
    const detail = {voice, note, velocity, time: ev.time, gubbe: GUBBAR[voice - 1] && GUBBAR[voice - 1].name};
    hook.dispatchEvent(new CustomEvent('note', {detail}));
    if (typeof hook.onnote === 'function') hook.onnote(detail);
  } else if (ev.name === 'ev_heat') setHeat(v[0]);
  else if (ev.name === 'ev_kasta') onKasta();
  else if (ev.name === 'ev_svimma') onSvimma(v[0] > .5);
  else if (ev.name === 'ev_drop') drop(v[0]);
  else if (ev.name === 'ev_step') {
    const i = v[0];
    if (!playing) return;
    for (let k = 0; k < 16; k++) $('sp' + k).classList.toggle('is-current', k === i);
    if (kv[i]) retrigger($('vihta'), kv[i] === 2 ? 'hard' : 'smack');
  }
}
const events = [];
function fromEngine({data}) {
  if (data.type === 'ev') events.push(data);
  else if (data.type === 'ready') { ready = true; say('BASTUN ÄR VARM', 'GUBBARNA VÄNTAR · SPELA ETT ACKORD'); }
  else if (data.type === 'error') say('MOTORFEL', String(data.message).toUpperCase());
}
function syncEngine() {
  K.forEach((k) => param(k[2], val[k[2]]));
  for (const [name, value] of Object.entries(extras)) param(name, value);
  kv.forEach((v, i) => param('kv' + i, v));
  param('hold', hold ? 1 : 0); param('kasta', 0);
  param('start', playing ? 1 : 0);
}

// ---------- bastuprat: the gubbar talk when nobody plays
const PRAT = [
  ['BENGT', 'DET HÄR ÄR INGENTING. I FINLAND KÖR DE 120.'], ['LASSE', 'KASTA EN TILL, DÅ.'], ['KJELL', 'VEM SATT HÄR FÖRE MIG? DET ÄR BLÖTT.'],
  ['ROFFE', 'SOLGLASÖGONEN ÄR FÖR ATT JAG ÄR KÄND.'], ['GÖRAN', 'JAG SER INGENTING. GLASÖGONEN IGEN.'], ['STIG-ÅKE', 'KÄNN PÅ DEN HÄR MUSKELN.'],
  ['BENGT', 'HANDDUKEN ÄR VALFRI EFTER 22.'], ['KJELL', 'TITTA INTE NER.'], ['ROFFE', 'DET ÄR VÄRMEN SOM GÖR DEN LITEN.'],
  ['LASSE', 'SJUNG MED NU, GUBBAR.'], ['GÖRAN', 'NÅGON HAR SLÄPPT EN. DET LUKTAR KORV.'], ['STIG-ÅKE', 'SISTA I ISVAKEN BJUDER PÅ PILSNER.'],
  ['ALLA', 'MMMMMMMMMMMMMM.']];
let prat = 0;
setInterval(() => {
  if (performance.now() - lastTouch < 7000 || voiceNote.some((n) => n !== null)) return;
  const [who, line] = PRAT[prat++ % PRAT.length];
  $('lname').textContent = 'BASTUPRAT · ' + who; $('lline').textContent = line;
}, 4500);

// ---------- the animation loop
const lastStyle = new Map();
function css(el, key, value) { const id = (el.id || 'b') + key; if (lastStyle.get(id) !== value) { lastStyle.set(id, value); el.style.setProperty(key, value); } }
(function loop() {
  if (ac && events.length) {
    const heard = ac.currentTime - Math.min(.25, ac.outputLatency || ac.baseLatency || 0);
    while (events.length && events[0].time <= heard) fire(events.shift());
    if (events.length > 512) events.splice(0, events.length - 512);
  }
  css(bastu, '--singing', String(voiceNote.filter((n) => n !== null).length));
  requestAnimationFrame(loop);
})();

// ---------- scale the bastu as one picture
function fit() {
  const stage = $('stage'), cs = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const zoom = Math.max(.2, Math.min(w / 1180, h / 740));
  document.documentElement.style.setProperty('--zoom', zoom.toFixed(4));
}
new ResizeObserver(fit).observe($('stage'));
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
fit();
if (matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth) say('VRID MOBILEN', 'LIGGANDE LÄGE · HELA BASTUN SYNS');

// ---------- remember everything between visits
function snapshot() {
  return {format: VERSION, knobs: {...val}, extras: {...extras}, bjorkris: kv.slice(), hold, preset};
}
function store() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(snapshot())); } catch { /* private mode */ } }, 300);
}
function restore(data) {
  if (!data || data.format !== VERSION) throw new Error('Fel filformat.');
  if (!Array.isArray(data.bjorkris) || data.bjorkris.length !== 16 || !data.bjorkris.every((v) => [0, 1, 2].includes(v))) throw new Error('Björkriset i filen är trasigt.');
  K.forEach((k, i) => { const v = data.knobs && data.knobs[k[2]]; if (Number.isFinite(v)) setK(i, v, 1); });
  if (data.extras) for (const name of Object.keys(extras)) if (Number.isFinite(data.extras[name])) extras[name] = data.extras[name];
  setBpm(extras.bpm, 1);
  for (const name of ['length', 'swing', 'tune', 'volume']) param(name, extras[name]);
  kv = data.bjorkris.slice(); kv.forEach((v, i) => { drawStep(i); param('kv' + i, v); });
  markPreset(Number.isInteger(data.preset) ? data.preset : -1);
}
try { const saved = localStorage.getItem(STORAGE); if (saved) restore(JSON.parse(saved)); } catch { /* start fresh */ }
drawMouths();

// ---------- gear menu (shell; never in the bastu)
const menu = $('menu');
const closeMenu = () => { menu.open = false; };
document.addEventListener('pointerdown', (e) => { if (menu.open && !menu.contains(e.target)) closeMenu(); });
// Spela exempel: a slow I-vi-IV-V with björkriset, so a first visit hears the whole bastu.
const DEMO = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 57, 60], [43, 50, 55, 59]];
let demoTimer = null;
function stopDemo() { clearInterval(demoTimer); demoTimer = null; for (let n = 36; n < 90; n++) post({type: 'midi', bytes: [0x80 | CHANNEL, n, 0]}); }
$('demo').onclick = async () => {
  closeMenu();
  await ensureAudio();
  if (demoTimer) { stopDemo(); $('demo').textContent = 'Spela exempel'; if (playing) togglePlay(); say('EXEMPLET SLUT'); return; }
  $('demo').textContent = 'Stoppa exemplet';
  if (!playing) togglePlay();
  let bar = 0, last = [];
  const step = () => {
    for (const n of last) post({type: 'midi', bytes: [0x80 | CHANNEL, n, 0]});
    last = DEMO[bar % DEMO.length];
    for (const n of last) post({type: 'midi', bytes: [0x90 | CHANNEL, n, 96]});
    if (bar % 4 === 3) setTimeout(kasta, 1200);
    bar++;
  };
  step();
  demoTimer = setInterval(step, 4 * 60000 / bpm());
};
$('clear').onclick = () => { kv = Array(16).fill(0); kv.forEach((v, i) => { drawStep(i); param('kv' + i, v); }); store(); closeMenu(); say('BJÖRKRISET RENSAT', 'KLICKA PÅ STEGEN FÖR SMISK'); };
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'Svettan-session.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); closeMenu(); say('SESSIONEN SPARAD', 'RATTAR, BJÖRKRIS OCH BASTU');
};
$('open').onclick = () => $('load').click();
$('load').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { restore(JSON.parse(await file.text())); store(); closeMenu(); say('SESSIONEN ÖPPNAD', file.name.toUpperCase()); }
  catch (error) { alert('Kunde inte öppna sessionen: ' + error.message); }
};
// MIDI: SVETTAN listens on channel 16 and the shared channel 1. Alone on the page it takes every channel.
const CCKNOB = {16: 'heat', 17: 'vowel', 18: 'breath', 19: 'tremble', 20: 'swell', 21: 'crowd', 22: 'drops', 23: 'drive', 24: 'room', 25: 'whip', 26: 'smack', 1: 'tremble'};
const CCEXTRA = {7: ['volume', (v) => v / 127, 'VOLYM'], 28: ['length', (v) => 1 + Math.round(15 * v / 127), 'BJÖRKRIS · LÄNGD'],
  29: ['swing', (v) => v / 127, 'BJÖRKRIS · SWING'], 30: ['tune', (v) => -12 + 24 * v / 127, 'STÄMNING']};
const listening = (channel) => !inAlskog || channel === 16 || channel === 1;
function midiMessage({data}) {
  if (!data || data.length < 1) return;
  const kind = data[0] & 0xf0, channel = (data[0] & 15) + 1;
  // MIDI clock drives björkriset in the engine itself (six ticks per step), like a DAW does for the VST3.
  if (data[0] === 0xf8 || data[0] === 0xfa || data[0] === 0xfb || data[0] === 0xfc) {
    if (data[0] !== 0xf8) ensureAudio();
    post({type: 'rt', byte: data[0]});
    if (data[0] === 0xfa || data[0] === 0xfb) {
      if (playing && !clocked) param('start', 0);
      clocked = true; setPlaying(true); say('SYNKAD · FÖLJER MIDI-KLOCKAN');
    } else if (data[0] === 0xfc) { clocked = false; setPlaying(false); }
    return;
  }
  if (data.length < 3 || !listening(channel)) return;
  if (kind === 0x90 || kind === 0x80) {
    const on = kind === 0x90 && data[2] > 0, out = inAlskog ? (data[0] & 15) : CHANNEL;
    ensureAudio();
    post({type: 'midi', bytes: [(on ? 0x90 : 0x80) | out, data[1], on ? data[2] : 0]});
  } else if (kind === 0xb0) {
    const cc = data[1], v = data[2];
    if (cc in CCKNOB) setK(knobIndex(CCKNOB[cc]), v / 127);
    else if (cc === 27) { if (v >= 64) { ensureAudio(); kasta(); } }
    else if (cc === 64) { ensureAudio(); if ((v >= 64) !== hold) setHold(v >= 64); }
    else if (cc === 14) setBpm(30 + 270 * v / 127);
    else if (cc === 15) { if ((v >= 64) !== playing) togglePlay(); }
    else if (cc === 123 || cc === 120) post({type: 'midi', bytes: [0xb0 | CHANNEL, 123, 0]});
    else if (cc in CCEXTRA) {
      const [name, map, label] = CCEXTRA[cc], value = map(v);
      extras[name] = value; param(name, value); store();
      say(label, name === 'tune' ? (value >= 0 ? '+' : '') + value.toFixed(1) + ' HT' : name === 'length' ? value + ' STEG' : Math.round(value * 100) + '%');
    }
  }
}
async function connectMidi() {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI stöds inte här. Prova Chrome eller Edge på en dator.');
  ensureAudio();
  midiAccess ||= await navigator.requestMIDIAccess({sysex: false});
  const bind = () => {
    let count = 0;
    for (const input of midiAccess.inputs.values()) { input.onmidimessage = midiMessage; if (input.state === 'connected') count++; }
    $('midi').textContent = count ? `MIDI ansluten (${count})` : 'Anslut MIDI';
    say(count ? 'MIDI · ' + count + (count === 1 ? ' ENHET' : ' ENHETER') : 'MIDI PÅ · KOPPLA IN ETT KEYBOARD', count ? (inAlskog ? 'KANAL 16 OCH 1' : 'ALLA KANALER') : '');
  };
  midiAccess.onstatechange = bind; bind();
}
$('midi').onclick = async () => { try { await connectMidi(); closeMenu(); } catch (error) { alert(error.message); } };
const MIDIMAP = [[16, 'VÄRME · temperatur'], [17, 'MUN · vokal M O Å A Ä E I'], [18, 'FLÅS · andedräkt'], [19, 'DALLER · vibrato (även CC1)'],
  [20, 'ANDETAG · ansats och släpp'], [21, 'GUBBAR · unisono'], [22, 'DROPPAR · svettdroppar'], [23, 'SVETT · drive'], [24, 'PANEL · rumsklang'],
  [25, 'PUMP · björkriset duckar kören'], [26, 'SMISK · björkrisets nivå'], [27, 'KASTA (64–127 kastar)'], [64, 'ISVAK · sustainpedal'],
  [14, 'Tempo 30–300 BPM'], [15, 'Björkriset start / stopp'], [7, 'Volym'], [28, 'Björkrisets längd'], [29, 'Swing'], [30, 'Stämning ±12 halvtoner']];
$('midi-map-list').innerHTML = '<li><code>Toner</code> kanal 16 och 1 · sex gubbar, den sjunde tonen tar den äldsta</li><li><code>MIDI-klocka</code> start, stopp och klocka styr björkriset</li>' + MIDIMAP.map(([cc, label]) => `<li><code>CH16/CH1 CC${cc}</code> ${label}</li>`).join('');
const panel = menu.querySelector('.menu-panel');
const showMap = (show) => { panel.classList.toggle('show-midi-map', show); $('midi-map-panel').hidden = !show; $('midi-map-toggle').setAttribute('aria-expanded', String(show)); };
$('midi-map-toggle').onclick = () => showMap(true);
$('midi-map-back').onclick = () => showMap(false);
menu.addEventListener('toggle', () => { if (!menu.open) showMap(false); });
// Installing as an app
const INSTALLED = 'svettan-installed-v1';
let installPrompt;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installedBefore = () => { try { return localStorage.getItem(INSTALLED) === '1'; } catch { return false; } };
function showInstalled() { try { localStorage.setItem(INSTALLED, '1'); } catch { /* ok */ } installPrompt = null; $('install-app').textContent = 'Appen är installerad'; $('install-app').disabled = true; }
if (isStandalone() || installedBefore()) showInstalled();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (!installedBefore()) { $('install-app').textContent = 'Installera app'; $('install-app').disabled = false; } });
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
  } catch { say('HELSKÄRM GICK INTE'); }
};
// VST3 downloads: the build lists whatever it placed in downloads/.
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
if ('serviceWorker' in navigator && !inAlskog && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- host hook (Älskog 3000 and diagnostics), like window.runkinator and window.turbotutte
Object.defineProperties(hook, Object.getOwnPropertyDescriptors({
  get values() { return {...val, ...extras, bpm: bpm(), start: playing ? 1 : 0, hold: hold ? 1 : 0}; },
  update(name, value) {
    const i = knobIndex(name);
    if (i >= 0) setK(i, value, 1);
    else if (name === 'bpm') setBpm(value, 1);
    else if (name === 'start') { if (!!value !== playing) togglePlay(); }
    else if (name === 'hold') setHold(!!value);
    else if (name === 'kasta') { if (value) kasta(); }
    else if (name in extras) { extras[name] = value; param(name, value); }
  },
  noteOn(note, velocity = 100) { ensureAudio(); post({type: 'midi', bytes: [0x90 | CHANNEL, note, velocity]}); },
  noteOff(note) { post({type: 'midi', bytes: [0x80 | CHANNEL, note, 0]}); },
  kasta, togglePlay, ensureAudio, choosePreset,
  get heat() { return heat; }, get singing() { return voiceNote.slice(); },
  get node() { return node; }, get context() { return ac; }, get ready() { return ready; },
}));
window.svettan = hook;
