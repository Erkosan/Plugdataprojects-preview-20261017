// GISSLA 3000 i källarvalvet under koret. Bröderna knäböjer med nakna ryggar, kyrkvaktmästaren svänger
// rökelsekaret och Pastor Gregorius ser på från sin ikon.
// The sound is the PlugData engine (gissla.pd -> hvcc -> WebAssembly) running in an AudioWorklet;
// this page is the vault around it and only ever talks to the engine through its parameters and MIDI.
const $ = (id) => document.getElementById(id), valv = $('valv');
const VERSION = 'gissla-web-1';
const STORAGE = 'gissla-session-v1';
const CHANNEL = 2;  // MIDI channel 3, zero-based
const inAlskog = (() => { try { return window.parent !== window && !!window.parent.alskog; } catch { return false; } })();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let ac = null, node = null, ready = false, starting = null, midiAccess = null, storeTimer = null;
let playing = false, clocked = false, lenMode = false, sel = 0, lastTouch = performance.now(), lastCount = -1, penance = false;
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
    node = new AudioWorkletNode(ac, 'gissla', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {parameters}});
    node.port.onmessage = fromEngine;
    node.connect(ac.destination);
    syncEngine();
    for (const message of pending.splice(0)) if (message.type !== 'param') node.port.postMessage(message);
  })().catch((error) => { say('MOTORFEL', String(error.message || error).toUpperCase()); throw error; });
  return starting;
}
const unlock = () => { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); };
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, {capture: true, passive: true});

// ---------- the display
const say = (name, line = '') => { $('lname').textContent = name; $('lline').textContent = line; lastTouch = performance.now(); };

// ---------- the eight tracks, one brother each
const TRACKS = [
  {name: 'KÖTT', mean: 'KICK', ch: '--ch-kott', note: 36, voice: 0}, {name: 'PISKA', mean: 'SNARE', ch: '--ch-piska', note: 38, voice: 1},
  {name: 'HANDFLATA', mean: 'CLAP', ch: '--ch-hud', note: 39, voice: 2}, {name: 'RÖKELSE', mean: 'HIHAT', ch: '--ch-rokelse', note: 42, voice: 3},
  {name: 'SANCTUS', mean: 'ALTARKLOCKOR', ch: '--ch-sanctus', note: 81, voice: 5}, {name: 'KLOCKA', mean: 'KYRKKLOCKA', ch: '--ch-klocka', note: 53, voice: 6},
  {name: 'ANDE', mean: 'ANDETAG', ch: '--ch-ande', note: 70, voice: 7}, {name: 'KÖR', mean: 'HAH!', ch: '--ch-kor', note: 79, voice: 8}];
const VOICE_TRACK = [0, 1, 2, 3, 3, 4, 5, 6, 7, -1];
const VOICE_NAME = ['KÖTT', 'PISKA', 'HANDFLATA', 'RÖKELSE', 'RÖKELSE', 'SANCTUS', 'KYRKKLOCKA', 'ANDE', 'KÖR', 'SKRIK'];
const VOICE_NOTE = [36, 38, 39, 42, 46, 81, 53, 70, 79, 78];
// A back, seen from behind: a tonsured head, shoulders, the spine, the habit pulled down to the waist.
const welts = (seed) => [0, 1, 2].map((k) => { const y = 88 + ((seed * 13 + k * 17) % 46), a = (seed + k) % 2 ? -1 : 1;
  return `<path class="gs-welt" d="M${22 + k * 3} ${y - a * 12} Q50 ${y - a * 2} ${62 + k * 2} ${y + a * 10}"/>`; }).join('');
const BACK = (i) => `<svg viewBox="0 0 84 196" aria-hidden="true">
  <path class="gs-skin" d="M42 50 C24 50 8 58 8 76 C8 100 18 122 22 150 L62 150 C66 122 76 100 76 76 C76 58 60 50 42 50 Z"/>
  <path class="gs-spine" d="M42 58 V146 M26 76 C30 90 34 94 38 96 M58 76 C54 90 50 94 46 96"/>
  <g class="gs-welts-old">${welts(i + 5)}</g><g class="gs-welts-new">${welts(i)}</g>
  <rect class="gs-skin" x="36" y="40" width="12" height="14"/>
  <circle class="gs-tonsure" cx="42" cy="30" r="15"/><circle class="gs-crown" cx="42" cy="27" r="9"/>
  <path class="gs-habit" d="M18 146 C12 166 8 182 2 196 L82 196 C76 182 72 166 66 146 Z"/>
  <path class="gs-cord" d="M18 152 C34 158 50 158 66 152 M50 156 C52 170 48 180 52 190"/></svg>`;
$('monks').innerHTML = TRACKS.map((t, i) => `<button class="gs-monk" id="pad${i}" style="left:${i * 88}px;--pad:var(${t.ch})" aria-label="${t.name.toLowerCase()}, ${t.mean.toLowerCase()}">${BACK(i)}<span class="gs-plaque"><span class="ds-engrave">${t.name}</span></span></button>`).join('');
valv.setAttribute('role', 'group');
valv.setAttribute('aria-label', 'Källarvalvet under koret: åtta bröder knäböjer med nakna ryggar, kyrkvaktmästaren svänger rökelsekaret och Pastor Gregorius ser på från sin ikon.');

function hitVoice(voice, velocity = 100) {
  ensureAudio();
  post({type: 'midi', bytes: [0x90 | CHANNEL, VOICE_NOTE[voice], velocity]});
}
const hitPad = (i, velocity = 100) => hitVoice(TRACKS[i].voice, velocity);
function selectTrack(t, quiet) {
  sel = t;
  $('track').textContent = TRACKS[t].name;
  $('track').style.color = `var(${TRACKS[t].ch})`;
  TRACKS.forEach((_, i) => $('pad' + i).classList.toggle('is-selected', i === t));
  drawSteps();
  if (!quiet) say(TRACKS[t].name + ' · ' + TRACKS[t].mean, '');
}
TRACKS.forEach((t, i) => {
  const e = $('pad' + i);
  e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); hitPad(i, 112); selectTrack(i, 1); say(t.name + ' · ' + t.mean, ''); });
  e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); hitPad(i, 112); selectTrack(i, 1); } });
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(t.name + ' · ' + t.mean, ''); });
});
$('sexton').addEventListener('pointerdown', (e) => { e.preventDefault(); hitVoice(4, 110); say('RÖKELSE · SVING', ''); });
$('sexton').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('KYRKVAKTMÄSTAREN', 'RÖKELSE'); });
$('sally').addEventListener('pointerdown', (e) => { e.preventDefault(); hitVoice(6, 120); say('KLOCKA · KYRKKLOCKA', ''); });
$('sally').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('KLOCKREPET', ''); });

// ---------- knobs: the brothers' flesh, then the procession and the vault
const K = [  // engraved, name, meaning, param, default, colour
  ['KÖTT', 'KÖTT', 'KICK', 'kott', .5, '--ch-kott'], ['SNÄRT', 'SNÄRT', 'PISKANS DECAY', 'snart', .45, '--ch-piska'],
  ['HUD', 'HUD', 'HANDFLATA', 'hud', .4, '--ch-hud'], ['RÖKELSE', 'RÖKELSE', 'HIHAT', 'rokelse', .4, '--ch-rokelse'],
  ['KLOCKA', 'KLOCKA', 'EFTERKLANG', 'klocka', .5, '--ch-klocka'], ['FLOCK', 'FLOCK', 'KÖRENS STORLEK', 'flock', .5, '--ch-kor'],
  ['SKULD', 'SKULD', 'SWING', 'skuld', 0, '--control'], ['NÅD', 'NÅD', 'CHANS', 'nad', .1, '--control'],
  ['PROCESSION', 'PROCESSION', 'DELNING', 'delning', .5, '--control'], ['SYND', 'SYND', 'DRIVE', 'synd', .25, '--control'],
  ['VALV', 'VALV', 'REVERB', 'valv', .55, '--control'], ['VOLYM', 'VOLYM', '', 'volume', .8, '--control']];
const KN = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="ds-knob-arc" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="ds-knob-ptr" x1="25" y1="25" x2="25" y2="9"/></svg>';
const val = Object.fromEntries(K.map((k) => [k[3], k[4]]));
$('knobs').innerHTML = K.map((k, i) => `<div class="gs-knob"><button class="ds-control ds-knob" id="kn${i}" role="slider" aria-valuemin="0" aria-valuemax="100" style="--ds-face:var(${k[5]})" aria-label="${k[1]}${k[2] ? ' (' + k[2].toLowerCase() + ')' : ''}">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`).join('');
const DELNING = ['ÅTTONDELAR', 'TRIOLER', 'SEXTONDELAR'];
const delningOf = (v) => Math.round(clamp(v) * 2);
const engineValue = (name, v) => name === 'delning' ? delningOf(v) : v;
function knobValue(i) {
  const k = K[i], v = val[k[3]];
  if (k[3] === 'delning') return DELNING[delningOf(v)];
  return Math.round(v * 100) + '';
}
const knobText = (i) => [K[i][1] + (K[i][2] ? ' · ' + K[i][2] : ''), knobValue(i)];
function setK(i, v, quiet) {
  const k = K[i];
  val[k[3]] = clamp(v);
  const e = $('kn' + i);
  e.style.setProperty('--angle', (val[k[3]] * 270 - 135) + 'deg');
  e.setAttribute('aria-valuenow', Math.round(val[k[3]] * 100));
  e.setAttribute('aria-valuetext', knobValue(i));
  if (!quiet) say(...knobText(i));
  param(k[3], engineValue(k[3], val[k[3]]));
  if (k[3] === 'delning') $('steps').classList.toggle('even', delningOf(val.delning) !== 1);
  if (k[3] === 'valv') valv.style.setProperty('--valv', val.valv.toFixed(3));
  if (k[3] === 'synd') valv.style.setProperty('--synd', val.synd.toFixed(3));
  store();
}
K.forEach((k, i) => {
  const e = $('kn' + i);
  setK(i, val[k[3]], 1);
  e.addEventListener('pointerdown', (ev) => {
    ensureAudio();
    try { e.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers */ }
    let y = ev.clientY;
    const mv = (m) => { if (m.pointerId !== ev.pointerId) return; setK(i, val[k[3]] + (y - m.clientY) / 160); y = m.clientY; };
    const up = (u) => { if (u.pointerId !== ev.pointerId) return; e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up); };
    e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    say(...knobText(i));
  });
  e.addEventListener('dblclick', () => setK(i, k[4]));
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(...knobText(i)); });
  e.addEventListener('focus', () => say(...knobText(i)));
  e.addEventListener('wheel', (ev) => { ev.preventDefault(); setK(i, val[k[3]] + (ev.deltaY < 0 ? .04 : -.04)); }, {passive: false});
  e.addEventListener('keydown', (ev) => {
    const d = {ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05}[ev.key];
    if (d) { ev.preventDefault(); ev.stopPropagation(); setK(i, val[k[3]] + d); }
  });
});
const knobIndex = (name) => K.findIndex((k) => k[3] === name);

// ---------- the slinga: eight rows of 16 steps (0 vila, 1 slag, 2 accent; RÖKELSE 1 ryck, 2 sving) and one length
// The psalms on the hymn board. Their rows only hold step values: the bells and the choir sound their own c-moll notes.
const PSALMS = [
  {num: '69', name: 'PROCESSIONEN', line: 'TOLV SLAG I TRIOLER', len: 12, knobs: {delning: .5, skuld: 0, nad: .1, valv: .55, synd: .25},
    rows: [[2,0,0,0,0,0,1,0,0,0,0,1],[0,0,0,2,0,0,0,0,0,2,0,0],[0,0,0,0,0,1,0,0,0,0,1,1],[1,0,1,1,0,1,1,0,1,1,0,2],[0,0,0,0,0,0,1,0,0,0,0,0],[2,0,0,0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,0,0,1,0,0,0],[0,0,0,0,0,0,0,0,0,2,0,0]]},
  {num: '13', name: 'MISERERE', line: 'LÅNGSAMT, PÅ KNÄ', len: 6, knobs: {delning: .5, skuld: .2, nad: .2, valv: .8, synd: .1},
    rows: [[2,0,0,1,0,0],[0,0,0,0,0,0],[0,0,0,2,0,0],[0,1,1,0,1,2],[0,0,0,0,0,0],[2,0,0,0,0,0],[0,0,1,0,0,1],[0,0,0,0,0,0]]},
  {num: '666', name: 'DIES IRAE', line: 'VREDENS DAG I SEXTONDELAR', len: 16, knobs: {delning: 1, skuld: .1, nad: .05, valv: .4, synd: .6},
    rows: [[2,0,0,0,1,0,0,0,2,0,1,0,1,0,0,0],[0,0,0,0,2,0,0,0,0,0,0,0,2,0,0,1],[0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0],[1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,0]]},
  {num: '40', name: 'FLAGELLANTERNA', line: 'NIO SLAG, ETT FÖR VARJE SYND', len: 9, knobs: {delning: .5, skuld: 0, nad: .15, valv: .6, synd: .35},
    rows: [[2,0,0,1,0,0,1,0,0],[0,0,2,0,0,2,0,1,2],[0,1,0,0,1,0,0,0,0],[1,0,1,1,0,1,1,0,2],[0,0,0,0,0,0,1,0,0],[2,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,0,1],[0,0,0,0,0,0,0,0,2]]}];
const pad16 = (row) => Array.from({length: 16}, (_, i) => row[i] || 0);
let rows = PSALMS[0].rows.map(pad16), len = PSALMS[0].len, psalm = 0;
const extras = {bpm: 72, tune: 0};
const code = (i) => rows.reduce((sum, row, t) => sum + row[i] * 3 ** t, 0);
const sendStep = (i) => param('step' + i, code(i));
const STEPNAMES = (t, v) => t === 3 ? ['VILA', 'RYCK', 'SVING'][v] : ['VILA', 'SLAG', 'ACCENT'][v];
for (let i = 0; i < 16; i++) $('steps').insertAdjacentHTML('beforeend', `<button class="ds-control ds-step gs-step" id="sp${i}"><span class="ds-step-accent"></span></button>`);
function drawStep(i) {
  const b = $('sp' + i), v = rows[sel][i], ch = TRACKS[sel].ch;
  b.setAttribute('aria-pressed', String(v > 0));
  b.style.setProperty('--ds-face', `var(${ch}-dim)`);
  b.style.setProperty('--step-ch', `var(${ch})`);
  v === 2 ? b.dataset.accent = '1' : b.removeAttribute('data-accent');
  b.classList.toggle('is-outside', i >= len);
  b.setAttribute('aria-label', `${TRACKS[sel].name} steg ${i + 1}, ${STEPNAMES(sel, v).toLowerCase()}`);
}
function drawSteps() { for (let i = 0; i < 16; i++) drawStep(i); drawPlayhead(); }
function setLen(n, quiet) {
  len = Math.max(1, Math.min(16, Math.round(n)));
  param('len', len);
  drawSteps();
  if (!quiet) say('SLINGAN · LÄNGD', len + ' STEG');
  store();
}
for (let i = 0; i < 16; i++) {
  const b = $('sp' + i);
  b.onclick = () => {
    ensureAudio();
    if (lenMode) { setLen(i + 1); setLenMode(false); return; }
    rows[sel][i] = (rows[sel][i] + 1) % 3; drawStep(i); sendStep(i);
    say(TRACKS[sel].name + ' · STEG ' + (i + 1), STEPNAMES(sel, rows[sel][i]));
    markPsalm(-1); store();
  };
  b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(TRACKS[sel].name + ' · STEG ' + (i + 1), lenMode ? 'LÄNGD ' + (i + 1) : STEPNAMES(sel, rows[sel][i])); });
}
function setLenMode(on) { lenMode = on; $('len').setAttribute('aria-pressed', String(on)); if (on) say('SLINGAN · LEN', 'VÄLJ SISTA STEGET'); }
$('len').onclick = () => setLenMode(!lenMode);
function drawPlayhead() {
  const pos = playing && lastCount >= 0 ? lastCount % len : -1;
  for (let k = 0; k < 16; k++) $('sp' + k).classList.toggle('is-current', k === pos);
}

// ---------- psalmtavlan
$('psalms').innerHTML = PSALMS.map((p, i) => `<button class="gs-psalm" id="ps${i}" role="radio" aria-checked="false" aria-label="psalm ${p.num}, ${p.name.toLowerCase()}">${p.num}</button>`).join('');
function markPsalm(i) { psalm = i; PSALMS.forEach((_, k) => $('ps' + k).setAttribute('aria-checked', String(k === i))); }
function loadPsalm(i, quiet) {
  const p = PSALMS[i];
  rows = p.rows.map(pad16); len = p.len;
  param('len', len);
  for (let s = 0; s < 16; s++) sendStep(s);
  for (const [name, value] of Object.entries(p.knobs)) setK(knobIndex(name), value, 1);
  markPsalm(i); drawSteps(); store();
  if (!quiet) say('PSALM ' + p.num + ' · ' + p.name, p.line);
}
PSALMS.forEach((p, i) => {
  $('ps' + i).onclick = () => { ensureAudio(); loadPsalm(i); };
  $('ps' + i).addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say('PSALM ' + p.num + ' · ' + p.name, p.line); });
});

// ---------- transport
function setPlaying(v) {
  playing = v;
  $('play').setAttribute('aria-pressed', String(v));
  $('pi').setAttribute('d', v ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
  if (!v) { lastCount = -1; drawPlayhead(); }
}
function togglePlay() {
  ensureAudio();
  if (clocked) { say('SYNKAD', 'MIDI-KLOCKAN STYR'); return; }
  setPlaying(!playing); param('start', playing ? 1 : 0);
  say(playing ? 'PROCESSIONEN · IGÅNG' : 'MISERERE', playing ? '' : 'TYSTNAD I VALVET');
}
$('play').onclick = togglePlay;
const bpm = () => Math.min(300, Math.max(30, Math.round(+$('bpm').value || 72)));
function setBpm(v, quiet) {
  $('bpm').value = Math.min(300, Math.max(30, Math.round(v)));
  extras.bpm = bpm(); param('bpm', extras.bpm); $('lval').textContent = extras.bpm + ' BPM'; store();
  if (!quiet) say('TEMPO', bpm() + ' BPM');
}
$('bpm').addEventListener('input', () => { if ($('bpm').value !== '') { extras.bpm = bpm(); param('bpm', extras.bpm); $('lval').textContent = extras.bpm + ' BPM'; store(); } });
$('bpm').addEventListener('change', () => setBpm(bpm()));
$('bpm').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
function setTune(v) { extras.tune = Math.max(-6, Math.min(5, Math.round(v))); param('tune', extras.tune); store(); }

// ---------- BOTGÖRING · TRUMVIRVEL: held, the whip rolls faster until someone screams; let go and all falls on the one
function botgoring(on) {
  on = !!on;
  if (on === penance) return;
  ensureAudio();
  penance = on;
  param('botgoring', on ? 1 : 0);
  $('bot').setAttribute('aria-pressed', String(on));
  valv.classList.toggle('penance', on);
  if (on) say('BOTGÖRING · TRUMVIRVEL', 'MEA CULPA');
}
const botEl = $('bot');
botEl.addEventListener('pointerdown', (e) => { e.preventDefault(); try { botEl.setPointerCapture(e.pointerId); } catch { /* synthetic */ } botgoring(true); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) botEl.addEventListener(type, () => botgoring(false));
botEl.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); botgoring(true); } });
botEl.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); botgoring(false); } });
botEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !penance) say('BOTGÖRING · TRUMVIRVEL', 'HÅLL INNE'); });
window.addEventListener('blur', () => botgoring(false));

// ---------- keyboard
const KEYMAP = 'asdfghjk';
const typing = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, summary, .menu-panel');
document.addEventListener('keydown', (e) => {
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase(), pad = KEYMAP.indexOf(k);
  if (k === 'b') { e.preventDefault(); if (!e.repeat) botgoring(true); return; }
  if (e.repeat) return;
  if (pad >= 0 && k.length === 1) { e.preventDefault(); hitPad(pad, 112); selectTrack(pad, 1); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (/^[1-4]$/.test(e.key)) { ensureAudio(); loadPsalm(+e.key - 1); }
});
document.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'b') botgoring(false);
  if (e.key === ' ' && !typing(e)) e.preventDefault();
});

// ---------- engine events, played back when they are heard
function retrigger(el, cls) { if (reducedMotion.matches) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const hook = new EventTarget();
const emit = (type, detail) => { hook.dispatchEvent(new CustomEvent(type, {detail})); if (typeof hook['on' + type] === 'function') hook['on' + type](detail); };
function fire(ev) {
  const v = ev.values;
  if (ev.name === 'ev_hit') {
    const voice = Math.round(v[0]), velocity = v[1];
    const track = VOICE_TRACK[voice];
    if (track >= 0) { const pad = $('pad' + track); retrigger(pad, velocity > .95 ? 'hit-hard' : 'hit'); }
    if (voice === 3) retrigger($('sexton'), 'jerk');
    if (voice === 4) { retrigger($('sexton'), 'swing'); retrigger($('smoke'), 'puff'); }
    if (voice === 6) { retrigger(valv, 'toll'); retrigger($('window'), 'glow'); }
    if (voice === 9) { retrigger(valv, 'scream'); say('AAAAAAH!', 'BRODER ANSELM'); }
    if (voice === 0) emit('pump', {time: ev.time, depth: velocity});
    emit('hit', {voice, track, name: VOICE_NAME[voice], velocity, note: VOICE_NOTE[voice], time: ev.time});
  } else if (ev.name === 'ev_step') {
    lastCount = v[0];
    if (playing) drawPlayhead();
    emit('step', {count: v[0], step: v[0] % len, time: ev.time});
  } else if (ev.name === 'ev_botgoring') {
    const phase = v[0];
    if (phase === 0) say('ETTAN', 'AMEN');
    emit('botgoring', {phase, time: ev.time});
  } else if (ev.name === 'ev_spare') {
    emit('spare', {time: ev.time});
  }
}
const events = [];
function fromEngine({data}) {
  if (data.type === 'ev') events.push(data);
  else if (data.type === 'ready') { ready = true; say('MISERERE', 'BRÖDERNA VÄNTAR'); }
  else if (data.type === 'error') say('MOTORFEL', String(data.message).toUpperCase());
}
function syncEngine() {
  K.forEach((k) => param(k[3], engineValue(k[3], val[k[3]])));
  param('bpm', extras.bpm); param('tune', extras.tune); param('len', len);
  for (let i = 0; i < 16; i++) sendStep(i);
  param('botgoring', penance ? 1 : 0);
  param('start', playing ? 1 : 0);
}

// ---------- predikan: Pastor Gregorius murmurs from his icon when nobody plays
const PREDIKAN = [
  ['MEA CULPA', 'MEA MAXIMA CULPA'], ['BRÖDER', 'RYGGARNA FRAM'], ['DOLOR', 'EST VOLUPTAS'], ['PASTOR GREGORIUS', 'KYSKHET ÄR EN ÖVNING'],
  ['PASTOR GREGORIUS', 'ÖVNING GER FÄRDIGHET'], ['SANKT SEBASTIAN', 'HADE DET OCKSÅ SKÖNT'], ['PASTOR GREGORIUS', 'VEM HAR SMORT PISKAN?'],
  ['BRODER ANSELM', 'INTE SÅ HÅRT. HÅRDARE.'], ['PASTOR GREGORIUS', 'TIONDET TAS UPP I NATURA'], ['IN NOMINE', 'GREGORII'],
  ['PASTOR GREGORIUS', 'DEN SOM SPARAR RISET'], ['PASTOR GREGORIUS', 'SKA BIKTA SIG TVÅ GÅNGER'], ['KYRKVAKTMÄSTAREN', 'RÖKELSEN ÄR INTE RÖKELSE'],
  ['PASTOR GREGORIUS', 'NÅDEN ÄR SLUT FÖR IDAG']];
let predikan = 0;
setInterval(() => {
  if (playing || penance || performance.now() - lastTouch < 9000) return;
  const [who, line] = PREDIKAN[predikan++ % PREDIKAN.length];
  $('lname').textContent = who; $('lline').textContent = line;
}, 6000);

// ---------- the animation loop
(function loop() {
  if (ac && events.length) {
    const heard = ac.currentTime - Math.min(.25, ac.outputLatency || ac.baseLatency || 0);
    while (events.length && events[0].time <= heard) fire(events.shift());
    if (events.length > 512) events.splice(0, events.length - 512);
  }
  requestAnimationFrame(loop);
})();

// ---------- scale the vault as one picture
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
if (matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth) say('VRID MOBILEN', 'LIGGANDE LÄGE');

// ---------- remember everything between visits
function snapshot() {
  return {format: VERSION, knobs: {...val}, extras: {...extras}, rows: rows.map((r) => r.slice()), len, psalm, track: sel};
}
function store() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(snapshot())); } catch { /* private mode */ } }, 300);
}
function restore(data) {
  if (!data || data.format !== VERSION) throw new Error('Fel filformat.');
  if (!Array.isArray(data.rows) || data.rows.length !== 8 || !data.rows.every((r) => Array.isArray(r) && r.length === 16 && r.every((v) => [0, 1, 2].includes(v)))) throw new Error('Slingan i filen är trasig.');
  K.forEach((k, i) => { const v = data.knobs && data.knobs[k[3]]; if (Number.isFinite(v)) setK(i, v, 1); });
  if (data.extras && Number.isFinite(data.extras.bpm)) setBpm(data.extras.bpm, 1);
  if (data.extras && Number.isFinite(data.extras.tune)) setTune(data.extras.tune);
  rows = data.rows.map((r) => r.slice());
  if (Number.isFinite(data.len)) len = Math.max(1, Math.min(16, Math.round(data.len)));
  param('len', len);
  for (let i = 0; i < 16; i++) sendStep(i);
  markPsalm(Number.isInteger(data.psalm) ? data.psalm : -1);
  selectTrack(Number.isInteger(data.track) ? clamp(data.track, 0, 7) : 0, 1);
}
try { const saved = localStorage.getItem(STORAGE); if (saved) restore(JSON.parse(saved)); else markPsalm(0); } catch { markPsalm(0); }
selectTrack(sel, 1);
$('lval').textContent = extras.bpm + ' BPM';

// ---------- gear menu (shell; never in the vault)
const menu = $('menu');
const closeMenu = () => { menu.open = false; };
document.addEventListener('pointerdown', (e) => { if (menu.open && !menu.contains(e.target)) closeMenu(); });
// Spela exempel: PROCESSIONEN, two bars of BOTGÖRING in the middle, then down on the one.
let demoTimers = [];
$('demo').onclick = async () => {
  closeMenu();
  await ensureAudio();
  if (demoTimers.length) { demoTimers.forEach(clearTimeout); demoTimers = []; botgoring(false); $('demo').textContent = 'Spela exempel'; if (playing) togglePlay(); return; }
  $('demo').textContent = 'Stoppa exemplet';
  loadPsalm(0, 1);
  if (!playing) togglePlay();
  const bar = 12 * 60000 / bpm() / 3;
  demoTimers = [setTimeout(() => botgoring(true), bar * 2.5), setTimeout(() => botgoring(false), bar * 2.5 + 3200),
    setTimeout(() => { demoTimers = []; $('demo').textContent = 'Spela exempel'; }, bar * 2.5 + 3200 + bar * 2)];
};
$('clear').onclick = () => { rows = Array.from({length: 8}, () => Array(16).fill(0)); for (let i = 0; i < 16; i++) sendStep(i); drawSteps(); markPsalm(-1); store(); closeMenu(); say('SLINGAN RENSAD', 'SYNDERNA FÖRLÅTNA'); };
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'Gissla-session.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); closeMenu(); say('SESSIONEN SPARAD', 'SLINGA, LÄNGD OCH RATTAR');
};
$('open').onclick = () => $('load').click();
$('load').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { restore(JSON.parse(await file.text())); store(); closeMenu(); say('SESSIONEN ÖPPNAD', file.name.toUpperCase()); }
  catch (error) { alert('Kunde inte öppna sessionen: ' + error.message); }
};
// MIDI: GISSLA listens on channel 3 and the shared channel 1. Alone on the page it takes every channel.
const CCKNOB = Object.fromEntries(['kott', 'snart', 'hud', 'rokelse', 'klocka', 'flock', 'skuld', 'nad', 'delning', 'synd', 'valv'].map((n, i) => [16 + i, n]));
CCKNOB[7] = 'volume';
const listening = (channel) => !inAlskog || channel === 3 || channel === 1;
function midiMessage({data}) {
  if (!data || data.length < 1) return;
  const kind = data[0] & 0xf0, channel = (data[0] & 15) + 1;
  // MIDI clock drives the sequencer in the engine itself (eight ticks per triplet step), like a DAW does for the VST3.
  if (data[0] === 0xf8 || data[0] === 0xfa || data[0] === 0xfb || data[0] === 0xfc) {
    if (data[0] !== 0xf8) ensureAudio();
    post({type: 'rt', byte: data[0]});
    if (data[0] === 0xfa || data[0] === 0xfb) {
      if (playing && !clocked) param('start', 0);
      clocked = true; setPlaying(true); say('SYNKAD', 'FÖLJER MIDI-KLOCKAN');
    } else if (data[0] === 0xfc) { clocked = false; setPlaying(false); }
    return;
  }
  if (data.length < 3 || !listening(channel)) return;
  if (kind === 0x90 || kind === 0x80) {
    const on = kind === 0x90 && data[2] > 0;
    if (!on) return;  // drums ignore note-offs
    ensureAudio();
    post({type: 'midi', bytes: [0x90 | (inAlskog ? (data[0] & 15) : CHANNEL), data[1], data[2]]});
  } else if (kind === 0xb0) {
    const cc = data[1], v = data[2];
    if (cc in CCKNOB) setK(knobIndex(CCKNOB[cc]), CCKNOB[cc] === 'delning' ? Math.floor(v / 43) / 2 : v / 127);
    else if (cc === 14) setBpm(30 + 270 * v / 127);
    else if (cc === 15) { if ((v >= 64) !== playing) togglePlay(); }
    else if (cc === 80 || cc === 64) botgoring(v >= 64);
    else if (cc === 102) setLen(1 + Math.round(15 * v / 127));
    else if (cc === 123 || cc === 120) { botgoring(false); post({type: 'midi', bytes: [0xb0 | CHANNEL, 123, 0]}); }
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
    say(count ? 'MIDI · ' + count + (count === 1 ? ' ENHET' : ' ENHETER') : 'MIDI PÅ', count ? (inAlskog ? 'KANAL 3 OCH 1' : 'ALLA KANALER') : '');
  };
  midiAccess.onstatechange = bind; bind();
}
$('midi').onclick = async () => { try { await connectMidi(); closeMenu(); } catch (error) { alert(error.message); } };
const MIDIMAP = [[16, 'KÖTT · kick'], [17, 'SNÄRT · piskans decay'], [18, 'HUD · handflata'], [19, 'RÖKELSE · hihat'], [20, 'KLOCKA · efterklang'],
  [21, 'FLOCK · körens storlek'], [22, 'SKULD · swing'], [23, 'NÅD · chans'], [24, 'PROCESSION · åttondelar, trioler, sextondelar'], [25, 'SYND · drive'],
  [26, 'VALV · reverb'], [7, 'Volym'], [14, 'Tempo 30–300 BPM'], [15, 'Start / stopp'], [80, 'BOTGÖRING (håll 64–127)'], [64, 'Sustainpedalen: BOTGÖRING'], [102, 'Slingans längd']];
$('midi-map-list').innerHTML = '<li><code>Noter</code> kanal 3 och 1 · GM: 36 KÖTT, 38 PISKA, 39 HANDFLATA, 42 och 46 RÖKELSE, 81 SANCTUS, 53 KYRKKLOCKA, 70 ANDE, 79 HAH!, 78 SKRIK</li><li><code>MIDI-klocka</code> start, stopp och klocka styr sequencern</li>'
  + MIDIMAP.map(([cc, label]) => `<li><code>CH3/CH1 CC${cc}</code> ${label}</li>`).join('');
const panel = menu.querySelector('.menu-panel');
const showMap = (show) => { panel.classList.toggle('show-midi-map', show); $('midi-map-panel').hidden = !show; $('midi-map-toggle').setAttribute('aria-expanded', String(show)); };
$('midi-map-toggle').onclick = () => showMap(true);
$('midi-map-back').onclick = () => showMap(false);
menu.addEventListener('toggle', () => { if (!menu.open) showMap(false); });
// Installing as an app
const INSTALLED = 'gissla-installed-v1';
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

// ---------- host hook (ÄLSKOG and diagnostics), the same shape as window.perkele.
// Events: 'hit' {voice, track, name, velocity, note, time}, 'step' {count, step, time}, 'pump' {time, depth} on every KÖTT,
// 'botgoring' {phase: 1 held, 2 the scream, 0 back on the one, time}, 'spare' {time} when NÅD spares a step.
// Times are AudioContext seconds when the sound is heard. Everything is in c-moll; 'tune' (−6…5) is for ÄLSKOG's TONART.
Object.defineProperties(hook, Object.getOwnPropertyDescriptors({
  get values() {
    const out = {};
    K.forEach((k) => { out[k[3]] = engineValue(k[3], val[k[3]]); });
    return {...out, len, bpm: bpm(), tune: extras.tune, start: playing ? 1 : 0, botgoring: penance ? 1 : 0};
  },
  update(name, value) {
    const i = knobIndex(name);
    if (name === 'delning') setK(i, clamp(value, 0, 2) / 2, 1);
    else if (i >= 0) setK(i, value, 1);
    else if (name === 'bpm') setBpm(value, 1);
    else if (name === 'tune') setTune(value);
    else if (name === 'start') { if (!!value !== playing) togglePlay(); }
    else if (name === 'botgoring') botgoring(value);
    else if (name === 'len') setLen(value, 1);
  },
  setTempo(value) { setBpm(value, 1); },
  start() { if (!playing) togglePlay(); }, stop() { if (playing) togglePlay(); },
  noteOn(note, velocity = 100) { ensureAudio(); post({type: 'midi', bytes: [0x90 | CHANNEL, note, velocity]}); },
  noteOff() { /* drums: nothing to release */ },
  hit(voice, velocity = 100) { const i = typeof voice === 'number' ? voice : VOICE_NAME.indexOf(voice); if (i >= 0) hitVoice(i, velocity); },
  get pattern() { return {rows: rows.map((r) => r.slice()), len}; },
  setPattern({rows: r, len: l} = {}) {
    if (Array.isArray(r) && r.length === 8) { rows = r.map(pad16); for (let s = 0; s < 16; s++) sendStep(s); }
    if (Number.isFinite(l)) setLen(l, 1);
    markPsalm(-1); drawSteps(); store();
  },
  psalms: PSALMS.map((p) => p.num + ' ' + p.name), loadPsalm,
  botgoring, togglePlay, ensureAudio, voiceNotes: VOICE_NOTE,
  get playing() { return playing; }, get node() { return node; }, get context() { return ac; }, get ready() { return ready; },
}));
window.gissla = hook;
