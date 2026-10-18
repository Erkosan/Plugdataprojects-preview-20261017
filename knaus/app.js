// KNAUS 3000 — User Interface & AudioWorklet host
const ROOT = document.documentElement;
const STAGE = document.getElementById('stage');
const FIT = document.getElementById('fit');
const LCD_NAME = document.getElementById('lname');
const LCD_VAL = document.getElementById('lval');
const LCD_LINE = document.getElementById('lline');
const PLAY_BTN = document.getElementById('play');
const BPM_INPUT = document.getElementById('bpm');
const PANIC_BTN = document.getElementById('panic');
const STEPS_CONTAINER = document.getElementById('steps');
const KEYS_CONTAINER = document.getElementById('keys');
const WEATHER_TEXT = document.getElementById('wtext');

// State
let audioCtx = null;
let workletNode = null;
let analyserNode = null;
let paramsDef = {};
let currentParams = {};
let activeStep = 0;
let isPlaying = false;
let isAudioReady = false;

// C-minor scale notes in MIDI numbers
const C_MINOR_SCALE = [48, 50, 51, 53, 55, 56, 58, 60, 62, 63, 65, 67, 68, 70, 72];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToName(m) {
  return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}

// Fit scaling
function updateFit() {
  const w = window.innerWidth, h = window.innerHeight;
  const zoom = Math.min(w / 1180, h / 740, 1.5);
  ROOT.style.setProperty('--zoom', Math.max(0.3, zoom).toFixed(3));
}
window.addEventListener('resize', updateFit);
updateFit();

// Audio setup
async function initAudio() {
  if (audioCtx && audioCtx.state !== 'closed') {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return;
  }
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = 'playback';
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    await audioCtx.audioWorklet.addModule('worklet.js');
    workletNode = new AudioWorkletNode(audioCtx, 'knaus', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { parameters: paramsDef }
    });

    workletNode.port.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        isAudioReady = true;
      } else if (data.type === 'ev') {
        handleEngineEvent(data.name, data.values);
      }
    };

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    workletNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    // Send all initial params
    for (const [k, v] of Object.entries(currentParams)) {
      workletNode.port.postMessage({ type: 'param', name: k, value: v });
    }
  } catch (err) {
    console.error('Ljudinitialisering misslyckades:', err);
  }
}

// User gesture starts audio
window.addEventListener('pointerdown', () => { if (!audioCtx) initAudio(); }, { once: true });
window.addEventListener('keydown', () => { if (!audioCtx) initAudio(); }, { once: true });

function handleEngineEvent(name, values) {
  if (name === 'ev_step') {
    const step = Math.round(values[0]);
    activeStep = step;
    highlightStep(step);
  } else if (name === 'ev_note') {
    const pitch = Math.round(values[0]);
    highlightKey(pitch);
  }
}

function highlightStep(stepIdx) {
  const allSteps = STEPS_CONTAINER.children;
  for (let i = 0; i < allSteps.length; i++) {
    if (i === stepIdx) {
      allSteps[i].classList.add('active-head');
    } else {
      allSteps[i].classList.remove('active-head');
    }
  }
}

function highlightKey(midiNote) {
  const keyEl = KEYS_CONTAINER.querySelector(`[data-note="${midiNote}"]`);
  if (keyEl) {
    keyEl.classList.add('active');
    setTimeout(() => keyEl.classList.remove('active'), 150);
  }
}

// Parameter handling
function setParam(name, val, updateUI = true) {
  const def = paramsDef[name];
  if (!def) return;
  const clamped = Math.max(def.min, Math.min(def.max, val));
  currentParams[name] = clamped;

  if (workletNode) {
    workletNode.port.postMessage({ type: 'param', name, value: clamped });
  }

  if (updateUI) {
    updateKnobDisplay(name, clamped);
  }

  // Weather badge update
  if (name === 'rain') {
    if (clamped > 0.6) WEATHER_TEXT.textContent = 'ÖSREGN';
    else if (clamped > 0.2) WEATHER_TEXT.textContent = 'REGN';
    else WEATHER_TEXT.textContent = 'UPPEHÅLL';
  }
}

function updateKnobDisplay(name, val) {
  const knob = document.getElementById(`knob-${name}`);
  if (knob) {
    knob.setAttribute('aria-valuenow', val.toFixed(2));
    const def = paramsDef[name];
    if (def) {
      const norm = (val - def.min) / (def.max - def.min);
      const deg = -135 + norm * 270;
      const indicator = knob.querySelector('.knob-indicator');
      if (indicator) indicator.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    }
  }

  // LCD text
  const container = document.querySelector(`.ds-knob-container[data-param="${name}"]`);
  const label = container ? container.getAttribute('data-label') : name.toUpperCase();
  LCD_NAME.textContent = label;
  LCD_VAL.textContent = val.toFixed(2);
  const def = paramsDef[name];
  if (def) {
    const pct = ((val - def.min) / (def.max - def.min) * 100).toFixed(0);
    LCD_LINE.style.setProperty('--meter-val', `${pct}%`);
  }
}

// Knobs interaction
function setupKnobs() {
  document.querySelectorAll('.ds-knob-container').forEach(container => {
    const param = container.getAttribute('data-param');
    const knob = container.querySelector('.ds-knob');
    if (!knob) return;

    let startY = 0, startVal = 0;

    const onPointerMove = (e) => {
      const dy = startY - e.clientY;
      const def = paramsDef[param];
      if (!def) return;
      const range = def.max - def.min;
      const step = range / 150;
      const newVal = startVal + dy * step;
      setParam(param, newVal);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    knob.addEventListener('pointerdown', (e) => {
      initAudio();
      startY = e.clientY;
      startVal = currentParams[param] !== undefined ? currentParams[param] : (paramsDef[param] ? paramsDef[param].default : 0);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    knob.addEventListener('wheel', (e) => {
      e.preventDefault();
      initAudio();
      const def = paramsDef[param];
      if (!def) return;
      const range = def.max - def.min;
      const step = (e.deltaY < 0 ? 1 : -1) * (range / 30);
      const curr = currentParams[param] !== undefined ? currentParams[param] : def.default;
      setParam(param, curr + step);
    });

    knob.addEventListener('dblclick', () => {
      const def = paramsDef[param];
      if (def) setParam(param, def.default);
    });

    knob.addEventListener('pointerenter', () => {
      const val = currentParams[param] !== undefined ? currentParams[param] : (paramsDef[param] ? paramsDef[param].default : 0);
      const label = container.getAttribute('data-label') || param.toUpperCase();
      LCD_NAME.textContent = label;
      LCD_VAL.textContent = val.toFixed(2);
    });
  });
}

// Sequencer setup
function setupSequencer() {
  STEPS_CONTAINER.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const stepEl = document.createElement('div');
    stepEl.className = 'seq-step';
    stepEl.setAttribute('data-step', i);
    stepEl.setAttribute('role', 'button');
    stepEl.setAttribute('tabindex', '0');

    const led = document.createElement('div');
    led.className = 'seq-step-led';
    stepEl.appendChild(led);

    const noteLabel = document.createElement('span');
    noteLabel.className = 'seq-step-note';
    noteLabel.textContent = '-';
    stepEl.appendChild(noteLabel);

    updateStepUI(stepEl, i);

    stepEl.addEventListener('click', () => {
      initAudio();
      cycleStep(i);
    });

    STEPS_CONTAINER.appendChild(stepEl);
  }

  // Play / Stop
  PLAY_BTN.addEventListener('click', () => {
    initAudio();
    isPlaying = !isPlaying;
    setParam('start', isPlaying ? 1 : 0);
    PLAY_BTN.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    const path = PLAY_BTN.querySelector('#pi');
    if (path) {
      path.setAttribute('d', isPlaying ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
    }
    LCD_NAME.textContent = isPlaying ? 'SEQUENCER' : 'SEQUENCER STOPPAD';
    LCD_VAL.textContent = isPlaying ? 'SPELAR' : 'PAUS';
  });

  // BPM
  BPM_INPUT.addEventListener('change', () => {
    const val = parseInt(BPM_INPUT.value, 10) || 116;
    setParam('bpm', val);
  });
}

function cycleStep(stepIdx) {
  const paramName = `step${stepIdx}`;
  let val = currentParams[paramName] || 0;
  // Decode:
  let gate = Math.floor(val / 64) % 2;
  let accent = Math.floor(val / 128) % 2;
  let pitch = (val % 64) + 12;

  if (gate === 0) {
    // Turn ON: default note in C minor scale
    pitch = C_MINOR_SCALE[stepIdx % C_MINOR_SCALE.length];
    val = (pitch - 12) + 64;
  } else if (accent === 0) {
    // Turn on ACCENT
    val = val + 128;
  } else {
    // Turn OFF (rest)
    val = 0;
  }

  setParam(paramName, val, false);
  const stepEl = STEPS_CONTAINER.children[stepIdx];
  if (stepEl) updateStepUI(stepEl, stepIdx);
}

function updateStepUI(stepEl, stepIdx) {
  const val = currentParams[`step${stepIdx}`] || 0;
  const gate = Math.floor(val / 64) % 2;
  const accent = Math.floor(val / 128) % 2;
  const pitch = (val % 64) + 12;

  if (gate > 0) {
    stepEl.classList.add('gate-on');
    stepEl.querySelector('.seq-step-note').textContent = midiToName(pitch);
    if (accent > 0) stepEl.classList.add('accent-on');
    else stepEl.classList.remove('accent-on');
  } else {
    stepEl.classList.remove('gate-on', 'accent-on');
    stepEl.querySelector('.seq-step-note').textContent = '-';
  }
}

// Keyboard setup: 2 octaves (MIDI 48 C3 to 72 C5)
function setupKeyboard() {
  KEYS_CONTAINER.innerHTML = '';
  const whiteNotes = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
  const blackNotes = {
    49: 48, // C#3 after C3
    51: 50, // D#3 after D3
    54: 53, // F#3 after F3
    56: 55, // G#3 after G3
    58: 57, // A#3 after A3
    61: 60, // C#4
    63: 62, // D#4
    66: 65, // F#4
    68: 67, // G#4
    70: 69  // A#4
  };

  const whiteKeys = [];

  whiteNotes.forEach((midi, idx) => {
    const key = document.createElement('div');
    key.className = 'ds-key white';
    key.setAttribute('data-note', midi);
    key.setAttribute('tabindex', '0');
    key.setAttribute('aria-label', midiToName(midi));
    KEYS_CONTAINER.appendChild(key);
    whiteKeys.push({ midi, el: key });

    key.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      triggerNoteOn(midi, 100);
    });
    key.addEventListener('pointerup', () => triggerNoteOff(midi));
    key.addEventListener('pointerleave', () => triggerNoteOff(midi));
  });

  // Black keys overlay
  Object.entries(blackNotes).forEach(([blackMidi, afterWhiteMidi]) => {
    const bMidi = parseInt(blackMidi, 10);
    const whiteIdx = whiteNotes.indexOf(parseInt(afterWhiteMidi, 10));
    if (whiteIdx === -1) return;

    const bKey = document.createElement('div');
    bKey.className = 'ds-key black';
    bKey.setAttribute('data-note', bMidi);
    bKey.setAttribute('tabindex', '0');
    bKey.setAttribute('aria-label', midiToName(bMidi));
    // Position between white keys
    const leftPct = ((whiteIdx + 0.68) / whiteNotes.length) * 100;
    bKey.style.left = `${leftPct}%`;
    KEYS_CONTAINER.appendChild(bKey);

    bKey.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      triggerNoteOn(bMidi, 100);
    });
    bKey.addEventListener('pointerup', () => triggerNoteOff(bMidi));
    bKey.addEventListener('pointerleave', () => triggerNoteOff(bMidi));
  });

  // Computer keyboard bindings
  const KEY_MAP = {
    'KeyA': 48, 'KeyW': 49, 'KeyS': 50, 'KeyE': 51, 'KeyD': 52, 'KeyF': 53,
    'KeyT': 54, 'KeyG': 55, 'KeyY': 56, 'KeyH': 57, 'KeyU': 58, 'KeyJ': 59,
    'KeyK': 60, 'KeyO': 61, 'KeyL': 62, 'KeyP': 63, 'Semicolon': 64
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      PLAY_BTN.click();
      return;
    }
    const midi = KEY_MAP[e.code];
    if (midi) {
      initAudio();
      triggerNoteOn(midi, 100);
      highlightKey(midi);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const midi = KEY_MAP[e.code];
    if (midi) {
      triggerNoteOff(midi);
    }
  });
}

function triggerNoteOn(pitch, vel) {
  if (workletNode) {
    workletNode.port.postMessage({ type: 'midi', bytes: [0x92, pitch, vel] }); // Channel 3 (0x92)
  }
  LCD_NAME.textContent = 'TON';
  LCD_VAL.textContent = `${midiToName(pitch)} (${pitch})`;
}

function triggerNoteOff(pitch) {
  if (workletNode) {
    workletNode.port.postMessage({ type: 'midi', bytes: [0x82, pitch, 0] });
  }
}

// Panic button
function setupPanic() {
  const triggerPanic = (active) => {
    setParam('brownout', active ? 1 : 0);
    PANIC_BTN.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      LCD_NAME.textContent = 'STRÖMAVBROTT';
      LCD_VAL.textContent = 'SPÄNNINGSFALL!';
    } else {
      LCD_NAME.textContent = 'KNAUS 3000';
      LCD_VAL.textContent = 'DRIFT ÅTERSTÄLLD';
    }
  };

  PANIC_BTN.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    triggerPanic(true);
  });
  window.addEventListener('pointerup', () => {
    if (currentParams['brownout'] === 1) triggerPanic(false);
  });
}

// Menu and presets
function setupMenu() {
  document.getElementById('demo').addEventListener('click', () => {
    // Reset to default C-minor sequence
    for (let i = 0; i < 16; i++) {
      const def = paramsDef[`step${i}`];
      if (def) setParam(`step${i}`, def.default, false);
      const stepEl = STEPS_CONTAINER.children[i];
      if (stepEl) updateStepUI(stepEl, i);
    }
    LCD_NAME.textContent = 'EXEMPELSLINGA';
    LCD_VAL.textContent = 'LADDAD (C-MOLL)';
  });

  document.getElementById('clear').addEventListener('click', () => {
    for (let i = 0; i < 16; i++) {
      setParam(`step${i}`, 0, false);
      const stepEl = STEPS_CONTAINER.children[i];
      if (stepEl) updateStepUI(stepEl, i);
    }
    LCD_NAME.textContent = 'RENSA';
    LCD_VAL.textContent = 'ALLA STEG TOMMA';
  });

  document.getElementById('save').addEventListener('click', () => {
    const data = JSON.stringify(currentParams, null, 2);
    localStorage.setItem('knaus-3000-session', data);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'knaus-3000-session.json';
    a.click();
    LCD_NAME.textContent = 'SPARA';
    LCD_VAL.textContent = 'SESSION SPARAD';
  });

  const fileInput = document.getElementById('load');
  document.getElementById('open').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        for (const [k, v] of Object.entries(parsed)) {
          setParam(k, v);
          if (k.startsWith('step')) {
            const idx = parseInt(k.replace('step', ''), 10);
            const stepEl = STEPS_CONTAINER.children[idx];
            if (stepEl) updateStepUI(stepEl, idx);
          }
        }
        LCD_NAME.textContent = 'ÖPPNA';
        LCD_VAL.textContent = 'SESSION LADDAD';
      } catch (err) {
        alert('Kunde inte läsa sessionsfil.');
      }
    };
    reader.readAsText(file);
  });

  // Load downloads listing
  fetch('downloads.json').then(r => r.json()).then(list => {
    const grid = document.getElementById('download-grid');
    if (!grid || !Array.isArray(list) || list.length === 0) return;
    document.getElementById('downloads').hidden = false;
    grid.innerHTML = '';
    list.forEach(item => {
      const a = document.createElement('a');
      a.href = `downloads/${item.file}`;
      a.textContent = item.label || item.file;
      a.className = 'ds-menu-button';
      grid.appendChild(a);
    });
  }).catch(() => {});
}

// Global window.knaus interface for tests and hosts
window.knaus = {
  init: initAudio,
  update: (name, val) => setParam(name, val),
  noteOn: (note, vel = 100) => triggerNoteOn(note, vel),
  noteOff: (note) => triggerNoteOff(note),
  getParams: () => ({ ...currentParams }),
  params: currentParams,
  get analyser() { return analyserNode; },
  get audioCtx() { return audioCtx; },
  get isReady() { return isAudioReady; }
};

// Bootstrap
async function start() {
  try {
    const res = await fetch('params.json');
    paramsDef = await res.json();
    for (const [k, v] of Object.entries(paramsDef)) {
      currentParams[k] = v.default;
    }
    // Set web ambience to cozy caravan rain
    currentParams['rain'] = 0.35;
  } catch (e) {
    console.warn('params.json kunde inte laddas, använder grundinställningar');
  }

  setupKnobs();
  setupSequencer();
  setupKeyboard();
  setupPanic();
  setupMenu();

  // Initial UI knob positions
  for (const [k, v] of Object.entries(currentParams)) {
    updateKnobDisplay(k, v);
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
