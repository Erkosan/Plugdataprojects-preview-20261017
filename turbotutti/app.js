// TURBOTUTTI 3000 i Omklädningsrummet (förut TURBOTUTTE; motorn, mappen och window.turbotutte heter som förut). The room and its playing feel come from the design
// prototype (design-system/preview/omkladningsrummet.html); the sound is the PlugData engine
// (turbotutte.pd -> hvcc -> WebAssembly) running in an AudioWorklet.
const $ = (id) => document.getElementById(id), room = $('room');
const VERSION = 'turbotutte-web-1';
const STORAGE = 'turbotutti-session-v1', OLD_STORAGE = 'turbotutte-session-v1';
const inAlskog = (() => { try { return window.parent !== window && !!window.parent.alskog; } catch { return false; } })();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let cold = false, playing = false, clocked = false, bar = 0, score = 0, oct = 0, acc = false, glide = false, write = false, wpos = 0;
let ac = null, node = null, ready = false, starting = null, midiAccess = null, storeTimer = null;
const pending = [];

// ---------- the crew, one per stall
const crew = [
  {x: 60, act: 'snap', skin: '#e8d5b7', hair: '#3a2a1a', r: '<span class="ds-whip"></span>', extra: '<span class="ds-pop">SNÄRTTI!</span>'},
  {x: 172, act: 'scrub', skin: '#c99a6e', hair: '#111111', head: '<span class="ds-foam"></span>', closed: 1},
  {x: 284, act: 'sing', skin: '#f0d9c4', hair: '#c9a24a', r: '<span class="ds-bottle"></span>', extra: '<span class="ds-note">♪</span><span class="ds-note" style="animation-delay:1.2s">♫</span>', open: 1},
  {x: 896, act: 'puck', skin: '#8d5a3b', hair: '#111111', head: '<span class="ds-helmet"></span>', r: '<span class="ds-stick"></span>', extra: '<span class="ds-puck"></span>'},
  {x: 1008, act: 'flex', skin: '#dcb894', hair: '#6b4a2b'},
  {x: 1120, act: 'scrub', skin: '#f3e0cc', hair: '#d9d2c5', head: '<span class="ds-foam" style="transform:scale(.7)"></span>', closed: 1}];
$('stalls').outerHTML = crew.map((g, i) => `<div class="ds-rstall" id="st${i}" style="left:${g.x}px"><span class="ds-stall-head"></span><span class="ds-water"></span><span class="ds-splash"></span><span class="ds-steam" style="left:12px;animation-delay:${i * .7}s"></span><span class="ds-steam" style="right:8px;animation-delay:${i * .7 + 2}s"></span>
 <div class="ds-hop" id="hop${i}"><div class="ds-guy ${g.act}" id="guy${i}" style="--skin:${g.skin};--hair:${g.hair};animation-delay:${-i * .3}s">${g.extra || ''}
 <div class="ds-guy-head${g.closed ? ' closed' : ''}">${g.head || ''}<div class="ds-guy-eyes"><i></i><i></i></div><span class="ds-guy-mouth${g.open ? ' open' : ''}"></span></div>
 <div class="ds-guy-body"><span class="ds-guy-arm l"></span><span class="ds-guy-arm r">${g.r || ''}</span></div>
 <div class="ds-guy-towel"></div><div class="ds-guy-legs"><i></i><i></i></div><div class="ds-guy-feet"><i></i><i></i></div></div></div></div>`).join('')
  + crew.map((g, i) => `<div class="ds-pipe ds-pipe-v" id="pv${i}" style="left:${g.x}px"><span class="ds-slug"></span></div>`).join('');
room.setAttribute('role', 'group');
room.setAttribute('aria-label', 'Omklädningsrummet: TURBOTUTTI sitter i skåpväggen, bänken framför är klaviaturen och sex hockeykillar duschar runt omkring. Varje ton skickar vatten till en dusch.');
const say = (a, b) => { $('lline').textContent = a + (b !== undefined && b !== '' ? ' ' + b : ''); };
const title = (text) => { $('lname').textContent = text; };

// ---------- engine
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
    await ac.audioWorklet.addModule('worklet.js');
    node = new AudioWorkletNode(ac, 'turbotutte', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {parameters}});
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

// ---------- knobs
const K = [['TACKLINKI', 'DRIVE', 'drive', .45], ['HANDDUKKI', 'CUTOFF', 'cutoff', .35], ['ÅNGAA', 'RESONANS', 'resonance', .7],
  ['SPURTTI', 'ENV MOD', 'envmod', .6], ['DUSCHI', 'DECAY', 'decay', .4], ['SNÄRTTI', 'ACCENT', 'accent', .8]];
const KN = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="ds-knob-arc" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="ds-knob-ptr" x1="25" y1="25" x2="25" y2="9"/></svg>';
const val = K.map((k) => k[3]);
// VOLYM sits last, like VOLUME on a 303. The whole series is tuned to C, so tune (TUUTTI · TONART) has no knob on the
// panel; it stays in the engine and on CC21 for DAWs and hosts.
const XK = [['PUBLIKKI', 'VOLYM', 'volume', .8, 0, 1, 0]];  // name, meaning, param, default, min, max, step
$('knobs').innerHTML = K.map((k, i) => `<div class="ds-tt-knob"><button class="ds-control ds-knob" id="kn${i}" style="--ds-face:var(${i == 5 ? '--ch-bass' : '--towel'})" aria-label="${k[0]} (${k[1].toLowerCase()})">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`).join('')
  + XK.map((k) => `<div class="ds-tt-knob"><button class="ds-control ds-knob" id="kn-${k[2]}" aria-label="${k[0]} (${k[1].toLowerCase()})">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`).join('');
const knobText = (i) => [K[i][0] + ' · ' + K[i][1], Math.round(val[i] * 100) + '%'];
function bindKnob(e, {get, set, reset, text, fine = .04}) {
  e.addEventListener('pointerdown', (ev) => {
    e.setPointerCapture(ev.pointerId);
    let y = ev.clientY, pos = get();
    const mv = (m) => { if (m.pointerId !== ev.pointerId) return; pos = Math.min(1, Math.max(0, pos + (y - m.clientY) / 160)); set(pos); y = m.clientY; };
    const up = (u) => { if (u.pointerId !== ev.pointerId) return; e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up); };
    e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    say(...text());
  });
  e.addEventListener('dblclick', reset);
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(...text()); });
  e.addEventListener('wheel', (ev) => { ev.preventDefault(); set(get() + (ev.deltaY < 0 ? fine : -fine)); }, {passive: false});
  e.addEventListener('keydown', (ev) => {
    const d = {ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1}[ev.key];
    if (d) { ev.preventDefault(); ev.stopPropagation(); set(get() + d * fine * 1.25); }
  });
}
function setK(i, v, quiet) {
  val[i] = Math.min(1, Math.max(0, v));
  $('kn' + i).style.setProperty('--angle', (val[i] * 270 - 135) + 'deg');
  $('kn' + i).setAttribute('aria-valuetext', Math.round(val[i] * 100) + ' %');
  if (!quiet) say(...knobText(i));
  param(K[i][2], val[i]);
  apply();
  store();
}
K.forEach((k, i) => {
  setK(i, val[i], 1);
  bindKnob($('kn' + i), {get: () => val[i], set: (v) => setK(i, v), reset: () => setK(i, k[3]), text: () => knobText(i)});
});
say('TERVETULOA · OMKLÄDNINGSRUMMET');

// ---------- slingor: three lockers (banks) with eight slingor each, like the 303's pattern groups
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nn = (n) => NAMES[((n % 12) + 12) % 12] + (2 + Math.floor(n / 12));
const stallOf = (n) => Math.floor((((n % 12) + 12) % 12) / 2);
const LOCKERS = [{door: 0, name: 'SNÄRTARN', num: 7}, {door: 2, name: 'ÅNGINEN', num: 21}, {door: 3, name: 'TUTTINEN', num: 13}];
const s = (n, a = 0, sl = 0) => ({n, a, s: sl});
// The exempelslinga is in C minor at 120 BPM, the same key and tempo as SVETTILAINEN's exempel, so the two play together
// from the start (and 120 is what most DAWs open at). The engine's own bpm default stays 128 for existing DAW projects.
const EXAMPLE_BPM = 120;
const DEMO = [s(0, 1), s(0), s(12, 0, 1), s(0), null, s(0, 1), s(3), s(0), s(0), s(12, 0, 1), s(10), s(7, 1), s(0), null, s(10), s(3, 0, 1)];
// Every slinga is in C minor (C D Eb F G Ab Bb), like SVETTILAINEN's chords, so the two never clash.
const EXTRA = [  // a few classic acid shapes for SNÄRTARN's other slingor
  [s(0, 1), s(12), s(0), s(0, 0, 1), s(12), s(0, 1), s(15), s(0), s(0, 1), s(12), s(0, 0, 1), s(10), s(0), s(12, 1), s(0), s(7, 0, 1)],
  [s(0, 1), null, s(0), s(3, 0, 1), s(5), null, s(0, 1), s(-2), s(0), null, s(12, 1, 1), s(10), s(7), null, s(5, 0, 1), s(3)],
  [s(0), s(0, 0, 1), s(12), s(0), s(0, 1), s(0, 0, 1), s(10), s(0), s(0), s(0, 0, 1), s(12, 1), s(0), s(15, 1, 1), s(12), s(7), s(0, 1)],
  [s(-5, 1), s(7), s(-5), s(7, 0, 1), s(5), s(-5, 1), s(3, 0, 1), s(5), s(-5), s(7), s(-5, 1), s(10, 0, 1), s(8), s(7, 1), s(-5), s(3, 0, 1)],
  [s(0, 1, 1), s(12, 0, 1), s(0), null, s(0, 1, 1), s(15, 0, 1), s(0), null, s(0, 1, 1), s(12, 0, 1), s(0), s(10, 1), s(0, 0, 1), s(7, 0, 1), s(3), null],
  [s(0, 1), s(0), s(0), s(0, 1), s(0), s(0), s(0, 1), s(0), s(3, 1), s(3), s(3), s(5, 1), s(5), s(7, 0, 1), s(10, 0, 1), s(12, 1)],
  [s(0, 1), s(24, 0, 1), s(12), s(0), s(12, 1), s(0, 0, 1), s(19), s(12), s(0, 1), s(22, 0, 1), s(12), s(0), s(15, 1), s(12, 0, 1), s(10), s(7, 1)],
];
const emptySlinga = () => Array(16).fill(null);
const banks = LOCKERS.map((_, b) => Array.from({length: 8}, (_, k) => b === 0 ? (k === 0 ? DEMO : EXTRA[k - 1]).map((x) => x && {...x}) : emptySlinga()));
let bank = 0, slot = 0, pickBank = -1, queued = null, wave = 0;
let P = banks[0][0];
const extras = {tune: 0, volume: .8, room: .2, echo: 0, length: 16, swing: 0, slide: .35};
// TUUTTI · TONART (CC21 only) shows the key as a note name (the slingor are written in C); PUBLIKKI · VOLYM in percent.
const keyName = (t) => { const s = Math.round(t); return NAMES[((s % 12) + 12) % 12] + (s ? (s > 0 ? ' +' : ' −') + Math.abs(s) : ''); };
const xknob = (name) => XK.find((k) => k[2] === name);
const xnorm = (k) => (extras[k[2]] - k[4]) / (k[5] - k[4]);
const xValue = (k) => k[2] === 'tune' ? keyName(extras.tune) : Math.round(extras[k[2]] * 100) + '%';
const xText = (k) => [k[0] + ' · ' + k[1], xValue(k)];
function setExtra(name, value, quiet) {
  const k = xknob(name);
  if (name === 'tune') value = Math.min(12, Math.max(-12, Math.round(value)));  // whole semitones, with or without a knob
  if (k) {
    value = Math.min(k[5], Math.max(k[4], value));
    if (k[6]) value = Math.round(value / k[6]) * k[6];
  }
  extras[name] = value; param(name, value); store();
  if (!k) return;
  const e = $('kn-' + name);
  e.style.setProperty('--angle', (xnorm(k) * 270 - 135) + 'deg');
  e.setAttribute('aria-valuetext', xValue(k));
  if (!quiet) say(...xText(k));
}
XK.forEach((k) => {
  setExtra(k[2], extras[k[2]], 1);
  bindKnob($('kn-' + k[2]), {get: () => xnorm(k), set: (v) => setExtra(k[2], k[4] + v * (k[5] - k[4])), reset: () => setExtra(k[2], k[3]),
    text: () => xText(k), fine: k[6] ? k[6] / (k[5] - k[4]) : .04});
});
const stepCode = (p) => p ? Math.max(0, Math.min(63, p.n + 12)) + 64 + (p.a ? 128 : 0) + (p.s ? 256 : 0) : 12;
const sendStep = (i) => param('step' + i, stepCode(P[i]));

function drawStep(i) {
  const b = $('sp' + i), p = P[i];
  b.setAttribute('aria-pressed', !!p);
  b.style.setProperty('--ds-face', p ? 'var(--ch-bass)' : 'var(--ch-bass-dim)');
  p && p.a ? b.dataset.accent = '1' : b.removeAttribute('data-accent');
  b.classList.toggle('slide', !!(p && p.s));
  b.classList.toggle('is-write', write && i === wpos);
  b.setAttribute('aria-label', 'Steg ' + (i + 1) + (p ? ' ' + nn(p.n) + (p.a ? ' snärtti' : '') + (p.s ? ' gliidi' : '') : ' paus'));
}
const stepText = (i) => { const p = P[i]; return ['STEG ' + (i + 1) + ' ·', p ? nn(p.n) + (p.a ? ' SNÄRTTI' : '') + (p.s ? ' GLIIDI' : '') : 'PAUS']; };
for (let i = 0; i < 16; i++) {
  $('steps').insertAdjacentHTML('beforeend', `<button class="ds-control ds-step" id="sp${i}"><span class="ds-step-accent"></span></button>`);
  const b = $('sp' + i);
  b.onclick = () => {
    ensureAudio();
    if (write) { wpos = i; P.forEach((_, k) => drawStep(k)); say('SKRIVAA · STEG ' + (i + 1)); return; }
    P[i] = P[i] ? null : {n: oct * 12, a: acc ? 1 : 0, s: glide ? 1 : 0};
    drawStep(i); sendStep(i); say(...stepText(i)); store();
  };
  b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse' && !write) say(...stepText(i)); });
  drawStep(i);
}
function showSlinga(named = true) {
  P = banks[bank][slot];
  P.forEach((_, k) => { drawStep(k); sendStep(k); });
  title(named || bank || slot ? 'SKÅP ' + LOCKERS[bank].num + ' · SLINGA ' + (slot + 1) : 'OMKLÄDNING 2');
}
function chooseSlinga(b, k) {
  pickBank = -1; drawDoors();
  if (b === bank && k === slot && !queued) { say(LOCKERS[b].name, '· SLINGA ' + (k + 1)); return; }
  if (playing) {
    queued = {bank: b, slot: k}; drawDoors();
    say('NÄSTA · SKÅP ' + LOCKERS[b].num, 'SLINGA ' + (k + 1) + ' NÄR VARVET ÄR SLUT');
    return;
  }
  bank = b; slot = k; queued = null; showSlinga(); drawDoors(); store();
  say(LOCKERS[b].name + ' · SLINGA ' + (k + 1), P.some(Boolean) ? '' : 'TOM');
}
const used = (b, k) => banks[b][k].some(Boolean);
function drawDoors() {
  LOCKERS.forEach((l, b) => {
    const d = $('door' + l.door);
    d.classList.toggle('open', pickBank === b);
    d.classList.toggle('queued', !!queued && queued.bank === b);
    d.setAttribute('aria-expanded', pickBank === b);
  });
  WHITE.forEach((sem, k) => {
    const key = $('key' + sem);
    key.classList.toggle('pick', pickBank >= 0 && used(pickBank, k));
    key.classList.toggle('slot', pickBank >= 0 && pickBank === bank && k === slot);
  });
}
function openLocker(b) {
  ensureAudio();
  if (pickBank === b) { pickBank = -1; drawDoors(); say('SKÅPET STÄNGT'); return; }
  pickBank = b; drawDoors();
  const filled = banks[b].map((_, k) => used(b, k) ? k + 1 : null).filter(Boolean);
  say('SKÅP ' + LOCKERS[b].num + ' ' + LOCKERS[b].name + ' · SLINGOR', filled.length ? '(' + filled.join(' ') + ')' : '(TOMT)');
}
LOCKERS.forEach((l, b) => {
  const d = $('door' + l.door);
  d.addEventListener('click', () => openLocker(b));
  d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openLocker(b); } });
});
function setWave(v) {
  wave = v ? 1 : 0; param('wave', wave); store();
  say('VÅGI · ' + (wave ? 'FYRKANT' : 'SÅGTAND'));
  pump(1.2);
}
$('door1').addEventListener('click', () => { ensureAudio(); setWave(!wave); });
$('door1').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); ensureAudio(); setWave(!wave); } });

// ---------- the bench keyboard: planks are white keys, pucks are black keys
const KEYMAP = 'awsedftgyhujk';
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12], BLACK = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]];
WHITE.forEach((sem, i) => $('keys').insertAdjacentHTML('beforeend', `<button class="ds-key w" id="key${sem}" style="left:${i * 49}px" aria-label="${nn(sem)}"></button>`));
BLACK.forEach(([sem, after]) => $('keys').insertAdjacentHTML('beforeend', `<button class="ds-key b" id="key${sem}" style="left:${after * 49}px" aria-label="${nn(sem)}"></button>`));
const held = [];  // bench/computer keys currently down (semitone index), newest last
const sounding = new Map();  // semitone index -> midi note sent, so octave changes never strand a note
function keyOn(sem, source) {
  if (pickBank >= 0) {
    const k = WHITE.indexOf(sem);
    if (k >= 0) chooseSlinga(pickBank, k);
    return;
  }
  if (sounding.has(sem)) return;
  ensureAudio();
  const n = sem + oct * 12, midi = 36 + n;
  sounding.set(sem, midi); held.push(sem);
  $('key' + sem)?.classList.add('down');
  post({type: 'midi', bytes: [0x9e, midi, acc ? 127 : 96]});
  say(nn(n) + (acc ? ' · SNÄRTTI' : '') + (glide ? ' · GLIIDI' : ''), '· DUSCHI ' + (stallOf(n) + 1));
  if (write) writeNote(n, acc, glide);
}
function keyOff(sem) {
  $('key' + sem)?.classList.remove('down');
  const midi = sounding.get(sem);
  if (midi === undefined) return;
  sounding.delete(sem); held.splice(held.indexOf(sem), 1);
  post({type: 'midi', bytes: [0x8e, midi, 0]});
}
function writeNote(n, a, sl) {
  P[wpos] = {n, a: a ? 1 : 0, s: sl ? 1 : 0};
  sendStep(wpos); wpos = (wpos + 1) % 16;
  P.forEach((_, k) => drawStep(k)); store();
}
// Pointers: every finger owns one key; sliding a finger along the bench plays legato (a slide).
const fingers = new Map();
const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.classList.contains('ds-key') ? +el.id.slice(3) : null; };
$('keys').addEventListener('pointerdown', (e) => {
  const sem = keyAt(e.clientX, e.clientY);
  if (sem === null) return;
  e.preventDefault();
  try { $('keys').setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
  fingers.set(e.pointerId, sem);
  if ([...fingers.values()].filter((v) => v === sem).length === 1) keyOn(sem);
});
$('keys').addEventListener('pointermove', (e) => {
  if (!fingers.has(e.pointerId) || pickBank >= 0) return;
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
  else if (k === 'c') { ensureAudio(); setCold(true); }
  else if (k === 'v') { ensureAudio(); setWave(!wave); }
  else if (/^[1-8]$/.test(e.key)) chooseSlinga(pickBank >= 0 ? pickBank : bank, +e.key - 1);
  else if (e.key === 'Escape' && pickBank >= 0) { pickBank = -1; drawDoors(); say('SKÅPET STÄNGT'); }
});
document.addEventListener('keyup', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !typing(e)) e.preventDefault();
  const k = e.key.toLowerCase(), sem = KEYMAP.indexOf(k);
  if (sem >= 0 && k.length === 1) keyOff(sem);
  else if (e.key === 'Shift') setAcc(false);
  else if (k === 'c') setCold(false);
});
window.addEventListener('blur', () => { for (const sem of [...sounding.keys()]) keyOff(sem); setAcc(false); setCold(false); });
function setOct(d) { oct = Math.max(-1, Math.min(2, oct + d)); say('OKTAAVI · OKTAV ' + (oct > 0 ? '+' : '') + oct, '· C' + (2 + oct)); }
function setAcc(v) { acc = v; $('bacc').setAttribute('aria-pressed', v); }
function setWrite(v) {
  write = v; $('bwr').setAttribute('aria-pressed', v); P.forEach((_, k) => drawStep(k));
  say(v ? 'SKRIVAA · STEG ' + (wpos + 1) : 'SKRIVAA AV', '');
}
$('odn').onclick = () => setOct(-1);
$('oup').onclick = () => setOct(1);
$('bacc').onclick = () => setAcc(!acc);
$('bsl').onclick = () => { glide = !glide; $('bsl').setAttribute('aria-pressed', glide); say(glide ? 'GLIIDI · SLIDE PÅ' : 'GLIIDI AV'); };
$('bwr').onclick = () => setWrite(!write);

// ---------- ISKALL DUSCH: pull the chain, the filter chokes and the water goes ice cold; let go and it screams back
function setCold(v) {
  if (cold === v) return;
  cold = v; param('cold', v ? 1 : 0);
  $('chain').classList.toggle('pulled', v); room.classList.toggle('cold', v);
  if (v) say('ISKALL DUSCHI · FILTRET STRYPS');
  else { say('PERKELE! · FILTRET SKRIKER UPP'); crew.forEach((_, i) => { flow[i] = 1; retrigger($('hop' + i), 'hit'); }); }
}
const chain = $('chain');
chain.addEventListener('pointerdown', (e) => { try { chain.setPointerCapture(e.pointerId); } catch { /* ok */ } ensureAudio(); setCold(true); });
chain.addEventListener('pointerup', () => setCold(false));
chain.addEventListener('pointercancel', () => setCold(false));
chain.addEventListener('lostpointercapture', () => setCold(false));
chain.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) { ensureAudio(); setCold(true); } } });
chain.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') setCold(false); });

// ---------- transport
const bpm = () => Math.min(300, Math.max(30, Math.round(+$('bpm').value || EXAMPLE_BPM)));
function setPlaying(v) {
  playing = v;
  $('play').setAttribute('aria-pressed', v);
  $('pi').setAttribute('d', v ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
  room.classList.toggle('playing', v);
  if (v) { bar = 0; say('SLINKI · SPELAR'); }
  else {
    for (let k = 0; k < 16; k++) $('sp' + k).classList.remove('is-current');
    if (queued) { bank = queued.bank; slot = queued.slot; queued = null; showSlinga(); drawDoors(); store(); }
    say('PAUSSI · STOPP');
  }
}
function togglePlay() {
  ensureAudio();
  if (clocked) { say('SYNKAD · MIDI-KLOCKAN STYR SLINGAN'); return; }
  setPlaying(!playing); param('start', playing ? 1 : 0);
}
$('play').onclick = togglePlay;
function setBpm(v, quiet) {
  $('bpm').value = Math.min(300, Math.max(30, Math.round(v)));
  param('bpm', bpm()); apply(); store();
  if (!quiet) say('VATTENFARTTI · TEMPO', bpm() + ' BPM');
}
$('bpm').addEventListener('input', () => { if ($('bpm').value !== '') { param('bpm', bpm()); say('VATTENFARTTI · TEMPO', bpm() + ' BPM'); store(); } });
$('bpm').addEventListener('change', () => setBpm(bpm()));
$('bpm').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
function apply() { room.style.setProperty('--steam', (.15 + val[1] * .85).toFixed(2)); }

// ---------- water: driven by what the engine actually plays
const flow = crew.map(() => .2);
let liveNote = null;
function retrigger(el, cls) { if (reducedMotion.matches) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
let pumpTimer;
function pump(amount) { $('spk').style.setProperty('--pump', amount); clearTimeout(pumpTimer); pumpTimer = setTimeout(() => $('spk').style.setProperty('--pump', 1), 70); }
let glowTimer;
function splash(st, a) {
  flow[st] = 1; retrigger($('pv' + st), 'go'); retrigger($('hop' + st), 'hit'); pump(a ? 1.16 : 1.08);
  $('manifold').classList.add('glow'); clearTimeout(glowTimer); glowTimer = setTimeout(() => $('manifold').classList.remove('glow'), 90);
  if (a) { flow[0] = Math.max(flow[0], .9); retrigger($('guy0'), 'now'); retrigger($('hop0'), 'hit'); }
}
const hook = new EventTarget();
function fire(ev) {
  if (ev.name === 'ev_step') {
    const i = ev.values[0];
    if (!playing) return;
    for (let k = 0; k < 16; k++) $('sp' + k).classList.toggle('is-current', k === i);
    if (i === 0) {
      bar++;
      if (bar > 1 && bar % 4 === 1) {
        score++; $('lval').textContent = 'HEMMA ' + score + ' – 0';
        room.classList.add('cheer'); say('MAALI! · ALLA I DUSCHEN JUBLAR');
        setTimeout(() => room.classList.remove('cheer'), 1300);
      }
    }
  } else if (ev.name === 'ev_note') {
    const [voice, note, accent, slide] = ev.values;
    if (voice === 1) liveNote = note;
    if (voice === 0 && !playing) return;
    splash(stallOf(note - 36), accent);
    const detail = {note, accent: !!accent, slide: !!slide, time: ev.time, voice: voice ? 'live' : 'slinga'};
    hook.dispatchEvent(new CustomEvent('note', {detail}));
    if (typeof hook.onnote === 'function') hook.onnote(detail);
  } else if (ev.name === 'ev_off') {
    if (ev.values[0] === 1) liveNote = null;
  }
}
const events = [];
function fromEngine({data}) {
  if (data.type === 'ev') {
    events.push(data);
    // 303 grammar: a new slinga takes over when the running one comes round.
    if (data.name === 'ev_step' && queued && data.values[0] === (extras.length - 1)) {
      bank = queued.bank; slot = queued.slot; queued = null; showSlinga(); drawDoors(); store();
    }
  } else if (data.type === 'ready') { ready = true; }
  else if (data.type === 'error') say('MOTORFEL', String(data.message).toUpperCase());
}
function syncEngine() {
  K.forEach((k, i) => param(k[2], val[i]));
  for (const [name, value] of Object.entries(extras)) param(name, value);
  param('wave', wave); param('bpm', bpm()); param('cold', cold ? 1 : 0);
  P.forEach((_, i) => sendStep(i));
  param('start', playing ? 1 : 0);
}
const lastStyle = new Map();
function css(el, key, value) { const id = el.id + key; if (lastStyle.get(id) !== value) { lastStyle.set(id, value); el.style.setProperty(key, value); } }
let last = performance.now();
(function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (ac && events.length) {
    const heard = ac.currentTime - Math.min(.25, ac.outputLatency || ac.baseLatency || 0);
    while (events.length && events[0].time <= heard) fire(events.shift());
    if (events.length > 256) events.splice(0, events.length - 256);
  }
  if (liveNote !== null) flow[stallOf(liveNote - 36)] = 1;
  const active = playing || liveNote !== null, idle = active ? .3 : .18, decay = Math.exp(-dt * (2.5 + (1 - val[4]) * 5));
  let sum = 0;
  flow.forEach((f, i) => { flow[i] = idle + (f - idle) * decay; sum += flow[i]; css($('st' + i), '--flow', flow[i].toFixed(2)); });
  css(room, '--rain', (active ? Math.max(.12, 30 / bpm() * .5) : .6).toFixed(3) + 's');
  css(room, '--beat', (60 / bpm()).toFixed(3) + 's');
  css(room, '--puddle', (.3 + sum / crew.length * .9).toFixed(2));
  requestAnimationFrame(loop);
})(last);

// ---------- scale the room as one picture
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
if (matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth) say('VRID MOBILEN · LIGGANDE LÄGE');

// ---------- remember everything between visits
function snapshot() {
  return {format: VERSION, knobs: Object.fromEntries(K.map((k, i) => [k[2], val[i]])), bpm: bpm(), wave, extras: {...extras},
    bank, slot, lockers: LOCKERS.map((l, b) => ({name: l.name, slingor: banks[b]}))};
}
function store() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(snapshot())); } catch { /* private mode */ } }, 300);
}
function validSlinga(list) {
  return Array.isArray(list) && list.length === 16 && list.every((p) => p === null || (p && Number.isInteger(p.n) && p.n >= -12 && p.n <= 51));
}
function restore(data) {
  if (!data || data.format !== VERSION) throw new Error('Fel filformat.');
  if (!Array.isArray(data.lockers) || data.lockers.length !== LOCKERS.length) throw new Error('Filen saknar skåpen.');
  data.lockers.forEach((l, b) => {
    if (!Array.isArray(l.slingor) || l.slingor.length !== 8 || !l.slingor.every(validSlinga)) throw new Error('En slinga i filen är trasig.');
    banks[b] = l.slingor.map((list) => list.map((p) => p && {n: p.n, a: p.a ? 1 : 0, s: p.s ? 1 : 0}));
  });
  K.forEach((k, i) => { const v = data.knobs && data.knobs[k[2]]; if (Number.isFinite(v)) setK(i, v, 1); });
  if (data.extras) for (const name of Object.keys(extras)) if (Number.isFinite(data.extras[name])) setExtra(name, data.extras[name], 1);
  if (Number.isFinite(data.bpm)) setBpm(data.bpm, 1);
  wave = data.wave ? 1 : 0; param('wave', wave);
  bank = Math.max(0, Math.min(LOCKERS.length - 1, data.bank | 0)); slot = Math.max(0, Math.min(7, data.slot | 0));
  queued = null; showSlinga(false); drawDoors();
}
try { const saved = localStorage.getItem(STORAGE) || localStorage.getItem(OLD_STORAGE); if (saved) restore(JSON.parse(saved)); } catch { /* start fresh */ }

// ---------- gear menu (shell; never on the panel)
const menu = $('menu');
const closeMenu = () => { menu.open = false; };
document.addEventListener('pointerdown', (e) => { if (menu.open && !menu.contains(e.target)) closeMenu(); });
$('demo').onclick = () => { banks[bank][slot] = DEMO.map((x) => x && {...x}); showSlinga(); setBpm(EXAMPLE_BPM, 1); store(); closeMenu(); say('EXEMPELSLINGA', '· SKÅP ' + LOCKERS[bank].num + ' SLINGA ' + (slot + 1)); };
$('clear').onclick = () => { banks[bank][slot] = emptySlinga(); showSlinga(); wpos = 0; store(); closeMenu(); say('SLINGAN RENSAD', '· SKRIV IN NYA TONER'); };
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'Turbotutti-session.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); closeMenu(); say('SESSIONEN SPARAD', '· ALLA SKÅP OCH RATTAR');
};
$('open').onclick = () => $('load').click();
$('load').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { restore(JSON.parse(await file.text())); store(); closeMenu(); say('SESSIONEN ÖPPNAD', '· ' + file.name.toUpperCase()); }
  catch (error) { alert('Kunde inte öppna sessionen: ' + error.message); }
};
// MIDI: TURBOTUTTI listens on channel 15 and the shared channel 1. Alone on the page it takes every channel.
const CCMAP = {74: 1, 71: 2, 16: 3, 17: 4, 18: 5, 77: 0};
const CCEXTRA = {7: ['volume', (v) => v / 127, 'PUBLIKKI · VOLYM'], 70: ['wave', (v) => v / 127, 'VÅGI · SÅG → FYRKANT'], 21: ['tune', (v) => -12 + 24 * v / 127, 'TUUTTI · TONART'],
  91: ['room', (v) => v / 127, 'KAKELI · REVERB'], 92: ['echo', (v) => v / 127, 'EKKO · DELAY'], 20: ['length', (v) => 1 + Math.round(15 * v / 127), 'LÄNKD · STEG'],
  22: ['swing', (v) => v / 127, 'SVINKI · SWING'], 5: ['slide', (v) => v / 127, 'GLIIDTID · SLIDE']};
const listening = (channel) => !inAlskog || channel === 15 || channel === 1;
function midiMessage({data}) {
  if (!data || data.length < 1) return;
  const kind = data[0] & 0xf0, channel = (data[0] & 15) + 1;
  // MIDI clock drives the slinga in the engine itself (six ticks per step), like a DAW does for the VST3.
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
    const on = kind === 0x90 && data[2] > 0, out = inAlskog ? data[0] : (kind | 14);
    ensureAudio();
    post({type: 'midi', bytes: [on ? out : (0x80 | (out & 15)), data[1], on ? data[2] : 0]});
    if (on) {
      const n = data[1] - 36, a = data[2] >= 100;
      say(nn(n) + (a ? ' · SNÄRTTI' : ''), '· DUSCHI ' + (stallOf(n) + 1));
      if (write && n >= -12 && n <= 51) writeNote(n, a, glide);
    }
  } else if (kind === 0xb0) {
    const cc = data[1], v = data[2];
    if (cc in CCMAP) setK(CCMAP[cc], v / 127);
    else if (cc === 19) { ensureAudio(); setCold(v >= 64); }
    else if (cc === 14) setBpm(30 + 270 * v / 127);
    else if (cc === 15) { if ((v >= 64) !== playing) togglePlay(); }
    else if (cc === 123 || cc === 120) post({type: 'midi', bytes: [0xbe, 123, 0]});
    else if (cc in CCEXTRA) {
      const [name, map, label] = CCEXTRA[cc], value = map(v);
      if (name === 'wave') { wave = value; param('wave', wave); store(); }
      else setExtra(name, value, 1);
      say(label, name === 'tune' ? keyName(extras.tune) : name === 'length' ? value : Math.round(value * 100) + '%');
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
    say(count ? 'MIDI · ' + count + (count === 1 ? ' ENHET' : ' ENHETER') : 'MIDI PÅ · KOPPLA IN ETT KEYBOARD', count ? (inAlskog ? 'KANAL 15 OCH 1' : 'ALLA KANALER') : '');
  };
  midiAccess.onstatechange = bind; bind();
}
$('midi').onclick = async () => { try { await connectMidi(); closeMenu(); } catch (error) { alert(error.message); } };
const MIDIMAP = [[74, 'HANDDUKKI · cutoff'], [71, 'ÅNGAA · resonans'], [16, 'SPURTTI · env mod'], [17, 'DUSCHI · decay'], [18, 'SNÄRTTI · accent'],
  [77, 'TACKLINKI · drive'], [19, 'ISKALL DUSCHI (håll, 64–127)'], [14, 'VATTENFARTTI · tempo 30–300 BPM'], [15, 'Start / stopp'], [7, 'PUBLIKKI · volym'], [70, 'VÅGI · såg → fyrkant'],
  [21, 'TUUTTI · tonart ±12 halvtoner'], [91, 'KAKELI · reverb'], [92, 'EKKO · delay'], [20, 'LÄNKD · slingans längd'], [22, 'SVINKI · swing'], [5, 'GLIIDTID · slide']];
$('midi-map-list').innerHTML = '<li><code>Toner</code> kanal 15 och 1 · anslag ≥ 100 = snärtti · legato = gliidi</li><li><code>MIDI-klocka</code> start, stopp och klocka styr slingan</li>' + MIDIMAP.map(([cc, label]) => `<li><code>CH15/CH1 CC${cc}</code> ${label}</li>`).join('');
const panel = menu.querySelector('.menu-panel');
const showMap = (show) => { panel.classList.toggle('show-midi-map', show); $('midi-map-panel').hidden = !show; $('midi-map-toggle').setAttribute('aria-expanded', String(show)); };
$('midi-map-toggle').onclick = () => showMap(true);
$('midi-map-back').onclick = () => showMap(false);
menu.addEventListener('toggle', () => { if (!menu.open) showMap(false); });
// Installing as an app
const INSTALLED = 'turbotutti-installed-v1';
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
if ('serviceWorker' in navigator && !inAlskog) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- host hook (Älskog 3000 and diagnostics), like window.runkinator
Object.defineProperties(hook, Object.getOwnPropertyDescriptors({
  get values() { return {...Object.fromEntries(K.map((k, i) => [k[2], val[i]])), ...extras, wave, bpm: bpm(), start: playing ? 1 : 0, cold: cold ? 1 : 0}; },
  update(name, value) {
    const i = K.findIndex((k) => k[2] === name);
    if (i >= 0) setK(i, value, 1);
    else if (name === 'bpm') setBpm(value, 1);
    else if (name === 'start') { if (!!value !== playing) togglePlay(); }
    else if (name === 'cold') setCold(!!value);
    else if (name === 'wave') { wave = value; param('wave', value); }
    else if (name in extras) setExtra(name, value, 1);
  },
  noteOn(note, velocity = 96) { ensureAudio(); post({type: 'midi', bytes: [0x9e, note, velocity]}); },
  noteOff(note) { post({type: 'midi', bytes: [0x8e, note, 0]}); },
  togglePlay, ensureAudio,
  get slinga() { return P.map((p) => p && {...p}); },
  get presets() { return [DEMO, ...EXTRA].map((list) => list.map((p) => p && {...p})); },
  get node() { return node; }, get context() { return ac; }, get ready() { return ready; },
}));
window.turbotutte = hook;
