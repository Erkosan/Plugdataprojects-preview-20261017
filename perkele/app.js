// PERKELE 3000 i verkstaden. Pertti ligger under Ladan, radion står på, och verktygen på tavlan är trummorna.
// The sound is the PlugData engine (perkele.pd -> hvcc -> WebAssembly) running in an AudioWorklet;
// this page is the workshop around it and only ever talks to the engine through its parameters and MIDI.
const $ = (id) => document.getElementById(id), verkstad = $('verkstad');
const VERSION = 'perkele-web-1';
const STORAGE = 'perkele-session-v1';
const CHANNEL = 1;  // MIDI channel 2, zero-based
const inAlskog = (() => { try { return window.parent !== window && !!window.parent.alskog; } catch { return false; } })();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let ac = null, node = null, ready = false, starting = null, midiAccess = null, storeTimer = null;
let playing = false, clocked = false, humppa = false, lenMode = false, sel = 0, lastTouch = performance.now(), lastCount = -1;
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
    node = new AudioWorkletNode(ac, 'perkele', {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {parameters}});
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

// ---------- the six tracks and the seven tools on the board (one per engine voice)
const TRACKS = [
  {name: 'DÄCK', mean: 'KICK', ch: '--ch-tire'}, {name: 'MOTORHUV', mean: 'SNARE', ch: '--ch-hood'},
  {name: 'TRYCKLUFT', mean: 'HIHAT', ch: '--ch-air'}, {name: 'SKIFTNYCKEL', mean: 'CLAP', ch: '--ch-wrench'},
  {name: 'OLJEFAT', mean: 'TOM', ch: '--ch-barrel'}, {name: 'BROMSSKIVA', mean: 'COWBELL', ch: '--ch-disc'}];
const ICON = {
  tire: '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="27"/><circle cx="50" cy="50" r="7"/><circle cx="50" cy="50" r="36" stroke-dasharray="4 6"/>',
  hood: '<path d="M8 74 L24 22 H76 L92 74 Z"/><path d="M50 24 V72 M36 24 L30 72 M64 24 L70 72"/><circle cx="50" cy="66" r="4"/>',
  gun: '<path d="M10 30 H66 L74 38 H92 V46 H74 L66 52 H48 L40 86 H26 L32 52 H10 Z"/><path d="M48 52 C50 60 46 64 42 64"/><path d="M10 30 V52"/>',
  hose: '<ellipse cx="50" cy="56" rx="38" ry="24"/><ellipse cx="50" cy="56" rx="28" ry="16"/><ellipse cx="50" cy="56" rx="17" ry="9"/><path d="M88 56 C96 40 88 20 70 16 L64 14"/>',
  wrench: '<path d="M14 62 L66 40"/><path d="M14 56 L66 34 M18 70 L70 48"/><path d="M66 34 C70 20 86 14 94 22 L80 30 L84 40 L96 38 C92 52 78 56 70 48 Z"/><circle cx="20" cy="62" r="3"/>',
  barrel: '<path d="M24 14 H76 V88 H24 Z"/><ellipse cx="50" cy="14" rx="26" ry="6"/><path d="M24 36 H76 M24 66 H76"/><circle cx="62" cy="14" r="3"/>',
  disc: '<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="18"/><circle cx="50" cy="50" r="5"/><circle cx="50" cy="36" r="3"/><circle cx="63" cy="46" r="3"/><circle cx="58" cy="62" r="3"/><circle cx="42" cy="62" r="3"/><circle cx="37" cy="46" r="3"/><path d="M50 10 L54 26 M86 44 L72 46 M74 82 L64 70 M26 82 L36 70 M14 44 L28 46"/>'};
const PADS = [  // voice index = pad index; x, y in the verkstad
  {track: 0, note: 36, label: 'DÄCK', icon: 'tire', x: 236, y: 46, w: 112, h: 120},
  {track: 1, note: 38, label: 'MOTORHUV', icon: 'hood', x: 362, y: 50, w: 156, h: 104},
  {track: 2, note: 42, label: 'LUFTPISTOL', icon: 'gun', x: 534, y: 46, w: 132, h: 108},
  {track: 2, note: 46, label: 'LUFTSLANG', icon: 'hose', x: 522, y: 172, w: 144, h: 104},
  {track: 3, note: 39, label: 'SKIFTNYCKEL', icon: 'wrench', x: 236, y: 176, w: 152, h: 66},
  {track: 4, note: 45, label: 'OLJEFAT', icon: 'barrel', x: 404, y: 166, w: 104, h: 160},
  {track: 5, note: 56, label: 'BROMSSKIVA', icon: 'disc', x: 236, y: 246, w: 104, h: 84}];
const VOICE_TRACK = [0, 1, 2, 2, 3, 4, 5];
$('board').innerHTML = '<span class="pk-board-holes"></span>' + PADS.map((p, i) => `<button class="pk-pad" id="pad${i}" style="left:${p.x - 220}px;top:${p.y - 34}px;width:${p.w}px;height:${p.h}px;--pad:var(${TRACKS[p.track].ch})" aria-label="${p.label.toLowerCase()}, ${TRACKS[p.track].mean.toLowerCase()}"><svg viewBox="0 0 100 100" aria-hidden="true">${ICON[p.icon]}</svg><span class="ds-engrave">${p.label}</span></button>`).join('');
verkstad.setAttribute('role', 'group');
verkstad.setAttribute('aria-label', 'Verkstaden en vinterkväll: verktygstavlan är trummorna, Ladan står på pallbockar och Pertti ligger under den.');

function hitPad(i, velocity = 100) {
  ensureAudio();
  post({type: 'midi', bytes: [0x90 | CHANNEL, PADS[i].note, velocity]});
  post({type: 'midi', bytes: [0x80 | CHANNEL, PADS[i].note, 0]});
}
function selectTrack(t, quiet) {
  sel = t;
  $('track').textContent = TRACKS[t].name;
  $('track').style.color = `var(${TRACKS[t].ch})`;
  PADS.forEach((p, i) => $('pad' + i).classList.toggle('is-selected', p.track === t));
  drawSteps();
  if (!quiet) say(TRACKS[t].name + ' · ' + TRACKS[t].mean, 'LÄNGD ' + lens[t]);
}
PADS.forEach((p, i) => {
  const e = $('pad' + i);
  e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); hitPad(i, 112); selectTrack(p.track, 1); say(p.label + ' · ' + TRACKS[p.track].mean, ''); });
  e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); hitPad(i, 112); selectTrack(p.track, 1); } });
  e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(p.label + ' · ' + TRACKS[p.track].mean, ''); });
});

// ---------- knobs: the voices' character, then the engine and the room
const K = [  // engraved, name, meaning, param, default, colour
  ['DÄCK', 'DÄCKTRYCK', 'KICK', 'tire', .5, '--ch-tire'], ['HUV', 'MOTORHUV', 'SNARE', 'hood', .45, '--ch-hood'],
  ['LUFT', 'TRYCKLUFT', 'HIHAT', 'air', .4, '--ch-air'], ['NYCKEL', 'SKIFTNYCKEL', 'CLAP', 'wrench', .45, '--ch-wrench'],
  ['FAT', 'OLJEFAT', 'TOM', 'barrel', .45, '--ch-barrel'], ['SKIVA', 'BROMSSKIVA', 'COWBELL', 'disc', .4, '--ch-disc'],
  ['SLÄGGA', 'SLÄGGA', 'ACCENT', 'accent', .5, '--control'], ['MISS', 'MISSTÄNDNING', 'CHANS', 'misfire', .1, '--control'],
  ['VARV', 'VARVTAL', 'FART', 'rpm', .5, '--control'], ['KOSSU', 'KOSSU', 'SWING', 'swing', 0, '--control'],
  ['ROSTI', 'ROSTI', 'DRIVE', 'rust', .3, '--control'], ['PUMP', 'PUMP', 'SIDECHAIN', 'pump', .3, '--control'],
  ['RADIO', 'RADIO', 'LO-FI', 'radio', 0, '--control'], ['RUM', 'VERKSTAD', 'RUM', 'room', .3, '--control'],
  ['VOLYM', 'VOLYM', '', 'volume', .8, '--control']];
const KN = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="ds-knob-arc" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="ds-knob-ptr" x1="25" y1="25" x2="25" y2="9"/></svg>';
const val = Object.fromEntries(K.map((k) => [k[3], k[4]]));
$('knobs').innerHTML = K.map((k, i) => `<div class="pk-knob"><button class="ds-control ds-knob" id="kn${i}" role="slider" aria-valuemin="0" aria-valuemax="100" style="--ds-face:var(${k[5]})" aria-label="${k[1]}${k[2] ? ' (' + k[2].toLowerCase() + ')' : ''}">${KN}</button><span class="ds-engrave">${k[0]}</span></div>`).join('');
const RPM = ['HALVFART', 'NORMAL', 'DUBBELFART'];
const rpmOf = (v) => Math.round(clamp(v) * 2);
const engineValue = (name, v) => name === 'rpm' ? rpmOf(v) : v;
function knobValue(i) {
  const k = K[i], v = val[k[3]];
  if (k[3] === 'rpm') return RPM[rpmOf(v)];
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
  if (k[3] === 'radio') verkstad.style.setProperty('--radio', val.radio.toFixed(3));
  if (k[3] === 'rust') verkstad.style.setProperty('--rust', val.rust.toFixed(3));
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

// ---------- the slinga: six rows of 16 steps (0 vila, 1 slag, 2 accent; TRYCKLUFT 1 stängd, 2 öppen) and a length per track
// Cassettes by the radio. Their rows only hold step values: OLJEFAT plays C3 and everything stays in c-moll.
const CASSETTES = [
  {name: 'DIISELI', line: 'RAKT OCH TUNGT', humppa: 0, knobs: {rpm: .5, misfire: .1, swing: 0, room: .3},
    rows: [[2,0,0,0,1,0,0,1,2,0,0,0,1,0,0,0],[0,0,0,0,2,0,0,0,0,0,0,0,2,0,0,1],[1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1],[0,0,0,0,1,0,0,0,0,0,0,0,1,0,1,0],[0,0,1,0,0,0,0,0,0,2,0,0,0,0,0,0],[0,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0]], lens: [16, 16, 16, 16, 12, 16]},
  {name: 'HUMPPA', line: 'OOM-PAH FÖR DE ENSAMMA', humppa: 1, knobs: {rpm: .5, misfire: .15, swing: 0, room: .25},
    rows: [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,1,0,0,0,1,0,0,0,2,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],[1,0,0,0,0,0],[0,0,1]], lens: [16, 16, 16, 16, 6, 3]},
  {name: 'TANGO', line: 'FINSK TANGO I GARAGET', humppa: 0, knobs: {rpm: .5, misfire: .05, swing: .15, room: .45},
    rows: [[2,0,0,1,1,0,1,0,2,0,0,1,1,0,1,0],[0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,2,0],[0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0],[0,0,0,0,0,0,0,1],[0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0]], lens: [16, 16, 16, 16, 8, 16]},
  {name: 'TALVI', line: 'HALVFART, MINUS TRETTIO', humppa: 0, knobs: {rpm: 0, misfire: .25, swing: 0, room: .6},
    rows: [[2,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0],[2,0,1,0,1,0,1],[1,0,0,0,0],[1,0,0,1,0,0,0,0,0,0,1,0,0],[0,0,1,0,0,0,0,0,0]], lens: [16, 16, 7, 5, 13, 9]}];
const pad16 = (row) => Array.from({length: 16}, (_, i) => row[i] || 0);
let rows = CASSETTES[0].rows.map(pad16), lens = CASSETTES[0].lens.slice(), cassette = 0;
const extras = {bpm: 128};
const code = (i) => rows.reduce((sum, row, t) => sum + row[i] * 3 ** t, 0);
const sendStep = (i) => param('step' + i, code(i));
const STEPNAMES = (t, v) => t === 2 ? ['VILA', 'STÄNGD', 'ÖPPEN'][v] : ['VILA', 'SLAG', 'ACCENT'][v];
for (let i = 0; i < 16; i++) $('steps').insertAdjacentHTML('beforeend', `<button class="ds-control ds-step pk-step" id="sp${i}"><span class="ds-step-accent"></span></button>`);
function drawStep(i) {
  const b = $('sp' + i), v = rows[sel][i], ch = TRACKS[sel].ch;
  b.setAttribute('aria-pressed', String(v > 0));
  b.style.setProperty('--ds-face', v ? `var(${ch})` : `var(${ch}-dim)`);
  v === 2 ? b.dataset.accent = '1' : b.removeAttribute('data-accent');
  b.classList.toggle('is-outside', i >= lens[sel]);
  b.setAttribute('aria-label', `${TRACKS[sel].name} steg ${i + 1}, ${STEPNAMES(sel, v).toLowerCase()}`);
}
function drawSteps() { for (let i = 0; i < 16; i++) drawStep(i); drawPlayhead(); }
function setLen(t, n, quiet) {
  lens[t] = Math.max(1, Math.min(16, Math.round(n)));
  param('len' + t, lens[t]);
  if (t === sel) drawSteps();
  if (!quiet) say(TRACKS[t].name + ' · LÄNGD', lens[t] + ' STEG');
  store();
}
for (let i = 0; i < 16; i++) {
  const b = $('sp' + i);
  b.onclick = () => {
    ensureAudio();
    if (lenMode) { setLen(sel, i + 1); setLenMode(false); return; }
    rows[sel][i] = (rows[sel][i] + 1) % 3; drawStep(i); sendStep(i);
    say(TRACKS[sel].name + ' · STEG ' + (i + 1), STEPNAMES(sel, rows[sel][i]));
    markCassette(-1); store();
  };
  b.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say(TRACKS[sel].name + ' · STEG ' + (i + 1), lenMode ? 'LÄNGD ' + (i + 1) : STEPNAMES(sel, rows[sel][i])); });
}
function setLenMode(on) { lenMode = on; $('len').setAttribute('aria-pressed', String(on)); if (on) say(TRACKS[sel].name + ' · LEN', 'VÄLJ SISTA STEGET'); }
$('len').onclick = () => setLenMode(!lenMode);
function drawPlayhead() {
  const pos = playing && lastCount >= 0 ? lastCount % lens[sel] : -1;
  for (let k = 0; k < 16; k++) $('sp' + k).classList.toggle('is-current', k === pos);
}

// ---------- kassetterna
$('tapes').innerHTML = CASSETTES.map((c, i) => `<button class="pk-tape" id="tp${i}" role="radio" aria-checked="false" aria-label="kassett ${c.name.toLowerCase()}"><span>${c.name}</span></button>`).join('');
function markCassette(i) { cassette = i; CASSETTES.forEach((_, k) => $('tp' + k).setAttribute('aria-checked', String(k === i))); }
function loadCassette(i, quiet) {
  const c = CASSETTES[i];
  rows = c.rows.map(pad16); lens = c.lens.slice();
  for (let t = 0; t < 6; t++) param('len' + t, lens[t]);
  for (let s = 0; s < 16; s++) sendStep(s);
  for (const [name, value] of Object.entries(c.knobs)) setK(knobIndex(name), value, 1);
  setHumppa(!!c.humppa, 1);
  markCassette(i); drawSteps(); store();
  if (!quiet) say('KASSETT · ' + c.name, c.line);
}
CASSETTES.forEach((c, i) => {
  $('tp' + i).onclick = () => { ensureAudio(); loadCassette(i); };
  $('tp' + i).addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') say('KASSETT · ' + c.name, c.line); });
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
  say(playing ? 'KORJAAMO · IGÅNG' : 'KORJAAMO · STILLA', '');
}
$('play').onclick = togglePlay;
const bpm = () => Math.min(300, Math.max(30, Math.round(+$('bpm').value || 128)));
function setBpm(v, quiet) {
  $('bpm').value = Math.min(300, Math.max(30, Math.round(v)));
  extras.bpm = bpm(); param('bpm', extras.bpm); $('lval').textContent = extras.bpm + ' BPM'; store();
  if (!quiet) say('TEMPO', bpm() + ' BPM');
}
$('bpm').addEventListener('input', () => { if ($('bpm').value !== '') { extras.bpm = bpm(); param('bpm', extras.bpm); $('lval').textContent = extras.bpm + ' BPM'; store(); } });
$('bpm').addEventListener('change', () => setBpm(bpm()));
$('bpm').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
function setHumppa(on, quiet) {
  humppa = !!on; param('humppa', humppa ? 1 : 0);
  $('humppa').setAttribute('aria-pressed', String(humppa));
  verkstad.classList.toggle('humppa', humppa);
  if (!quiet) say(humppa ? 'HUMPPA · PÅ' : 'HUMPPA · AV', humppa ? 'DÄCK PÅ SLAGEN, HUVEN EMELLAN' : '');
  store();
}
$('humppa').onclick = () => { ensureAudio(); setHumppa(!humppa); };

// ---------- the gestures
let pulseTimer = {};
function pulse(name) {
  ensureAudio();
  param(name, 1);
  clearTimeout(pulseTimer[name]);
  pulseTimer[name] = setTimeout(() => param(name, 0), 40);
}
const perkele = () => pulse('perkele');
const startti = () => pulse('startti');
$('perkele').addEventListener('pointerdown', (e) => { e.preventDefault(); perkele(); });
$('legs').addEventListener('pointerdown', (e) => { e.preventDefault(); perkele(); });
$('startti').addEventListener('pointerdown', (e) => { e.preventDefault(); startti(); });
$('lada').addEventListener('pointerdown', (e) => { e.preventDefault(); startti(); });
for (const [id, fn] of [['perkele', perkele], ['legs', perkele], ['startti', startti], ['lada', startti]])
  $(id).addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); fn(); } });
$('perkele').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('PERKELE!', 'TUMMEN'); });
$('startti').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('STARTTI', 'PÅ NÄSTA ETTA'); });
$('humppa').addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') say('HUMPPA', '2/4'); });

// ---------- keyboard
const KEYMAP = 'asdfghj';
const typing = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, summary, .menu-panel');
document.addEventListener('keydown', (e) => {
  if (typing(e) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase(), pad = KEYMAP.indexOf(k);
  if (pad >= 0 && k.length === 1) { e.preventDefault(); hitPad(pad, 112); selectTrack(PADS[pad].track, 1); }
  else if (k === 'p') perkele();
  else if (k === 't') startti();
  else if (k === 'u') { ensureAudio(); setHumppa(!humppa); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (/^[1-4]$/.test(e.key)) { ensureAudio(); loadCassette(+e.key - 1); }
});
document.addEventListener('keyup', (e) => { if (e.key === ' ' && !typing(e)) e.preventDefault(); });

// ---------- engine events, played back when they are heard
function retrigger(el, cls) { if (reducedMotion.matches) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const hook = new EventTarget();
const emit = (type, detail) => { hook.dispatchEvent(new CustomEvent(type, {detail})); if (typeof hook['on' + type] === 'function') hook['on' + type](detail); };
let runningUntil = 0;
function fire(ev) {
  const v = ev.values;
  if (ev.name === 'ev_hit') {
    const [voice, velocity, offset] = v;
    const pad = $('pad' + voice);
    if (pad) retrigger(pad, velocity > .95 ? 'hit-hard' : 'hit');
    if (voice === 0) { retrigger($('lada'), 'bump'); emit('pump', {time: ev.time, depth: val.pump * velocity}); }
    emit('hit', {voice, track: VOICE_TRACK[voice], name: PADS[voice] && PADS[voice].label, velocity, offset, note: voice === 5 ? 48 + offset : PADS[voice] && PADS[voice].note, time: ev.time});
  } else if (ev.name === 'ev_step') {
    lastCount = v[0];
    if (playing) drawPlayhead();
    emit('step', {count: v[0], step: v[0] % 16, time: ev.time});
  } else if (ev.name === 'ev_perkele') {
    const phase = v[0];
    if (phase === 1) {
      retrigger($('bubble'), 'show'); retrigger(verkstad, 'perkele'); retrigger($('pertti'), 'kick');
      say('PERKELE!', 'SAATANA PERKELE');
    } else if (phase === 0) say('PERTTI', '...JAG HAR TIO TUMMAR KVAR');
    emit('perkele', {phase, time: ev.time});
  } else if (ev.name === 'ev_startti') {
    const phase = v[0];
    if (phase === 1) { verkstad.classList.add('cranking'); say('STARTTI', 'RRR-RRR-RRR'); }
    else if (phase === 2) { retrigger($('smoke'), 'puff'); $('lline').textContent = 'HOST'; }
    else if (phase === 3) {
      verkstad.classList.remove('cranking'); verkstad.classList.add('running'); retrigger($('smoke'), 'blast');
      runningUntil = performance.now() + 16 * 15000 / bpm();
      say('VROOM', 'DEN GICK IGÅNG');
    }
    emit('startti', {phase, time: ev.time});
  } else if (ev.name === 'ev_start') {
    if (v[0] > .5 && !playing) { setPlaying(true); param('start', 1); }
  } else if (ev.name === 'ev_misfire') {
    retrigger($('smoke'), v[0] > 1.5 ? 'blast' : 'puff');
    emit('misfire', {kind: v[0] > 1.5 ? 'baktändning' : 'tappat', time: ev.time});
  }
}
const events = [];
function fromEngine({data}) {
  if (data.type === 'ev') events.push(data);
  else if (data.type === 'ready') { ready = true; say('KORJAAMO', 'PERTTI LIGGER UNDER LADAN'); }
  else if (data.type === 'error') say('MOTORFEL', String(data.message).toUpperCase());
}
function syncEngine() {
  K.forEach((k) => param(k[3], engineValue(k[3], val[k[3]])));
  param('bpm', extras.bpm);
  for (let t = 0; t < 6; t++) param('len' + t, lens[t]);
  for (let i = 0; i < 16; i++) sendStep(i);
  param('humppa', humppa ? 1 : 0); param('perkele', 0); param('startti', 0);
  param('start', playing ? 1 : 0);
}

// ---------- verkstadsprat: Pertti talks from under the car when nobody plays
const PRAT = [
  ['PERTTI', 'RÄCK MIG 13:AN.'], ['PERTTI', 'DET ÄR INTE ROST. DET ÄR PATINA.'], ['PERTTI', 'VEM HAR DRUCKIT UPP BROMSVÄTSKAN?'],
  ['RADION', 'MINUS TRETTIOTVÅ I SODANKYLÄ.'], ['PERTTI', 'LADAN STARTAR ALLTID. I JULI.'], ['PERTTI', 'RÖVEN HAR FRUSIT FAST I GOLVET.'],
  ['PERTTI', 'DET LUKTAR KORV. DET ÄR KOPPLINGEN.'], ['PERTTI', 'SISU, SA FARSAN. SEN SÅLDE HAN BILEN.'],
  ['RADION', 'ÖNSKEPROGRAMMET: HUMPPA FÖR DE ENSAMMA.'], ['PERTTI', 'SAATANA. VAR ÄR TUMMEN?'], ['PERTTI', 'KALENDERN ÄR FRÅN -87. HON HAR INTE ÅLDRATS.']];
let prat = 0;
setInterval(() => {
  if (playing || performance.now() - lastTouch < 9000) return;
  const [who, line] = PRAT[prat++ % PRAT.length];
  $('lname').textContent = who; $('lline').textContent = line;
}, 6000);

// ---------- the animation loop
(function loop() {
  if (ac && events.length) {
    const heard = ac.currentTime - Math.min(.25, ac.outputLatency || ac.baseLatency || 0);
    while (events.length && events[0].time <= heard) fire(events.shift());
    if (events.length > 512) events.splice(0, events.length - 512);
  }
  if (runningUntil && performance.now() > runningUntil) { runningUntil = 0; verkstad.classList.remove('running'); }
  requestAnimationFrame(loop);
})();

// ---------- scale the verkstad as one picture
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
  return {format: VERSION, knobs: {...val}, extras: {...extras}, rows: rows.map((r) => r.slice()), lens: lens.slice(), humppa, cassette, track: sel};
}
function store() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(snapshot())); } catch { /* private mode */ } }, 300);
}
function restore(data) {
  if (!data || data.format !== VERSION) throw new Error('Fel filformat.');
  if (!Array.isArray(data.rows) || data.rows.length !== 6 || !data.rows.every((r) => Array.isArray(r) && r.length === 16 && r.every((v) => [0, 1, 2].includes(v)))) throw new Error('Slingan i filen är trasig.');
  K.forEach((k, i) => { const v = data.knobs && data.knobs[k[3]]; if (Number.isFinite(v)) setK(i, v, 1); });
  if (data.extras && Number.isFinite(data.extras.bpm)) setBpm(data.extras.bpm, 1);
  rows = data.rows.map((r) => r.slice());
  if (Array.isArray(data.lens) && data.lens.length === 6) lens = data.lens.map((n) => Math.max(1, Math.min(16, Math.round(+n || 16))));
  for (let t = 0; t < 6; t++) param('len' + t, lens[t]);
  for (let i = 0; i < 16; i++) sendStep(i);
  setHumppa(!!data.humppa, 1);
  markCassette(Number.isInteger(data.cassette) ? data.cassette : -1);
  selectTrack(Number.isInteger(data.track) ? clamp(data.track, 0, 5) : 0, 1);
}
try { const saved = localStorage.getItem(STORAGE); if (saved) restore(JSON.parse(saved)); else markCassette(0); } catch { markCassette(0); }
selectTrack(sel, 1);
$('lval').textContent = extras.bpm + ' BPM';

// ---------- gear menu (shell; never in the verkstad)
const menu = $('menu');
const closeMenu = () => { menu.open = false; };
document.addEventListener('pointerdown', (e) => { if (menu.open && !menu.contains(e.target)) closeMenu(); });
// Spela exempel: DIISELI, then STARTTI into the next bar and a PERKELE! two bars later.
let demoTimers = [];
$('demo').onclick = async () => {
  closeMenu();
  await ensureAudio();
  if (demoTimers.length) { demoTimers.forEach(clearTimeout); demoTimers = []; $('demo').textContent = 'Spela exempel'; if (playing) togglePlay(); return; }
  $('demo').textContent = 'Stoppa exemplet';
  loadCassette(0, 1);
  if (playing) togglePlay();
  startti();
  const bar = 16 * 15000 / bpm();
  demoTimers = [setTimeout(perkele, bar * 3.4), setTimeout(() => { setHumppa(true); }, bar * 5), setTimeout(() => { setHumppa(false); perkele(); }, bar * 7.4),
    setTimeout(() => { demoTimers = []; $('demo').textContent = 'Spela exempel'; }, bar * 9)];
};
$('clear').onclick = () => { rows = Array.from({length: 6}, () => Array(16).fill(0)); for (let i = 0; i < 16; i++) sendStep(i); drawSteps(); markCassette(-1); store(); closeMenu(); say('SLINGAN RENSAD', 'TAVLAN ÄR TOM'); };
$('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'Perkele-session.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); closeMenu(); say('SESSIONEN SPARAD', 'SLINGA, LÄNGDER OCH RATTAR');
};
$('open').onclick = () => $('load').click();
$('load').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { restore(JSON.parse(await file.text())); store(); closeMenu(); say('SESSIONEN ÖPPNAD', file.name.toUpperCase()); }
  catch (error) { alert('Kunde inte öppna sessionen: ' + error.message); }
};
// MIDI: PERKELE listens on channel 2 and the shared channel 1. Alone on the page it takes every channel.
const CCKNOB = Object.fromEntries(['tire', 'hood', 'air', 'wrench', 'barrel', 'disc', 'accent', 'misfire', 'rpm', 'swing', 'rust', 'pump', 'radio', 'room'].map((n, i) => [16 + i, n]));
CCKNOB[7] = 'volume';
const listening = (channel) => !inAlskog || channel === 2 || channel === 1;
function midiMessage({data}) {
  if (!data || data.length < 1) return;
  const kind = data[0] & 0xf0, channel = (data[0] & 15) + 1;
  // MIDI clock drives the sequencer in the engine itself (six ticks per step), like a DAW does for the VST3.
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
    if (cc in CCKNOB) setK(knobIndex(CCKNOB[cc]), v / 127);
    else if (cc === 14) setBpm(30 + 270 * v / 127);
    else if (cc === 15) { if ((v >= 64) !== playing) togglePlay(); }
    else if (cc === 80) { if (v >= 64) perkele(); }
    else if (cc === 81) { if (v >= 64) startti(); }
    else if (cc === 82) setHumppa(v >= 64);
    else if (cc >= 102 && cc <= 107) setLen(cc - 102, 1 + Math.round(15 * v / 127));
    else if (cc === 123 || cc === 120) post({type: 'midi', bytes: [0xb0 | CHANNEL, 123, 0]});
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
    say(count ? 'MIDI · ' + count + (count === 1 ? ' ENHET' : ' ENHETER') : 'MIDI PÅ', count ? (inAlskog ? 'KANAL 2 OCH 1' : 'ALLA KANALER') : '');
  };
  midiAccess.onstatechange = bind; bind();
}
$('midi').onclick = async () => { try { await connectMidi(); closeMenu(); } catch (error) { alert(error.message); } };
const MIDIMAP = [[16, 'DÄCKTRYCK · kick'], [17, 'MOTORHUV · snare'], [18, 'TRYCKLUFT · hihat'], [19, 'SKIFTNYCKEL · clap'], [20, 'OLJEFAT · tom'],
  [21, 'BROMSSKIVA · cowbell'], [22, 'SLÄGGA · accent'], [23, 'MISSTÄNDNING · chans'], [24, 'VARVTAL · halv, normal, dubbel'], [25, 'KOSSU · swing'],
  [26, 'ROSTI · drive'], [27, 'PUMP · sidechain'], [28, 'RADIO · lo-fi'], [29, 'VERKSTAD · rum'], [7, 'Volym'], [14, 'Tempo 30–300 BPM'],
  [15, 'Start / stopp'], [80, 'PERKELE! (64–127)'], [81, 'STARTTI (64–127)'], [82, 'HUMPPA'], ['102–107', 'Spårens längd, DÄCK till BROMSSKIVA']];
$('midi-map-list').innerHTML = '<li><code>Noter</code> kanal 2 och 1 · GM: 36 DÄCK, 38 MOTORHUV, 42 och 46 TRYCKLUFT, 39 SKIFTNYCKEL, 41–50 OLJEFAT i c-moll, 56 BROMSSKIVA</li><li><code>MIDI-klocka</code> start, stopp och klocka styr sequencern</li>'
  + MIDIMAP.map(([cc, label]) => `<li><code>CH2/CH1 CC${cc}</code> ${label}</li>`).join('');
const panel = menu.querySelector('.menu-panel');
const showMap = (show) => { panel.classList.toggle('show-midi-map', show); $('midi-map-panel').hidden = !show; $('midi-map-toggle').setAttribute('aria-expanded', String(show)); };
$('midi-map-toggle').onclick = () => showMap(true);
$('midi-map-back').onclick = () => showMap(false);
menu.addEventListener('toggle', () => { if (!menu.open) showMap(false); });
// Installing as an app
const INSTALLED = 'perkele-installed-v1';
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

// ---------- host hook (ÄLSKOG and diagnostics), like window.svettan and window.turbotutte.
// Events: 'hit' {voice, track, name, velocity, offset, note, time}, 'step' {count, step, time},
// 'pump' {time, depth} on every DÄCK (for ducking other machines), 'perkele' and 'startti' {phase, time}, 'misfire'.
// Times are AudioContext seconds when the sound is heard. Everything is in C (c-moll); there is no key to set.
const VOICE_NOTE = PADS.map((p) => p.note);
Object.defineProperties(hook, Object.getOwnPropertyDescriptors({
  get values() {
    const out = {};
    K.forEach((k) => { out[k[3]] = engineValue(k[3], val[k[3]]); });
    lens.forEach((n, t) => { out['len' + t] = n; });
    return {...out, bpm: bpm(), start: playing ? 1 : 0, humppa: humppa ? 1 : 0};
  },
  update(name, value) {
    const i = knobIndex(name);
    if (name === 'rpm') setK(i, clamp(value, 0, 2) / 2, 1);
    else if (i >= 0) setK(i, value, 1);
    else if (name === 'bpm') setBpm(value, 1);
    else if (name === 'start') { if (!!value !== playing) togglePlay(); }
    else if (name === 'humppa') setHumppa(!!value, 1);
    else if (name === 'perkele') { if (value) perkele(); }
    else if (name === 'startti') { if (value) startti(); }
    else if (/^len[0-5]$/.test(name)) setLen(+name[3], value, 1);
  },
  setTempo(value) { setBpm(value, 1); },
  start() { if (!playing) togglePlay(); }, stop() { if (playing) togglePlay(); },
  noteOn(note, velocity = 100) { ensureAudio(); post({type: 'midi', bytes: [0x90 | CHANNEL, note, velocity]}); },
  noteOff() { /* drums: nothing to release */ },
  hit(voice, velocity = 100) { const i = typeof voice === 'number' ? voice : PADS.findIndex((p) => p.label === voice); if (i >= 0) hitPad(i, velocity); },
  get pattern() { return {rows: rows.map((r) => r.slice()), lens: lens.slice(), humppa}; },
  setPattern({rows: r, lens: l, humppa: h} = {}) {
    if (Array.isArray(r) && r.length === 6) { rows = r.map(pad16); for (let s = 0; s < 16; s++) sendStep(s); }
    if (Array.isArray(l) && l.length === 6) l.forEach((n, t) => setLen(t, n, 1));
    if (h !== undefined) setHumppa(!!h, 1);
    markCassette(-1); drawSteps(); store();
  },
  cassettes: CASSETTES.map((c) => c.name), loadCassette,
  perkele, startti, togglePlay, ensureAudio, voiceNotes: VOICE_NOTE,
  get playing() { return playing; }, get node() { return node; }, get context() { return ac; }, get ready() { return ready; },
}));
window.perkele = hook;
