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
const WEATHER_BADGE = document.getElementById('wbadge');
const WEATHER_TEXT = document.getElementById('wtext');
const RAIN_DROPS = document.getElementById('rain-drops');
const METER_NEEDLE = document.getElementById('meter-needle');
const METER_VAL_TEXT = document.getElementById('meter-val-text');
const PIEZO_BTN = document.getElementById('piezo');
const ZAPPER_BTN = document.getElementById('zapper');
const BEER_RING = document.getElementById('beer-ring');

// State
let audioCtx = null;
let workletNode = null;
let analyserNode = null;
let paramsDef = {};
let currentParams = {};
let activeStep = 0;
let isPlaying = false;
let isAudioReady = false;
let currentPowerSource = 1; // 0 = 220V, 1 = 12V, 2 = Gasol
let activePresetIndex = 1; // 1 = Ragunda

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
  ROOT.style.setProperty('--zoom', Math.max(0.28, zoom).toFixed(3));
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
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, () => { if (!audioCtx) initAudio(); }, { capture: true, passive: true });
}

// Prevent browser gestures from dragging the page on phone
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#stage')) {
    e.preventDefault();
  }
}, { passive: false });

function handleEngineEvent(name, values) {
  if (name === 'ev_step') {
    const step = Math.round(values[0]);
    activeStep = step;
    highlightStep(step);
    // Subtle voltmeter needle twitch with sequencer beat
    updateVoltmeterJitter();
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
    keyEl.classList.add('active', 'down');
    setTimeout(() => keyEl.classList.remove('active', 'down'), 120);
  }
}

// Voltmeter handling
function updateVoltmeter(voltage) {
  if (currentParams['brownout'] === 1) {
    METER_NEEDLE.style.setProperty('--needle-deg', '-45deg');
    METER_VAL_TEXT.textContent = '0.0V';
    return;
  }
  // 10V is -35deg, 12V is 0deg, 14V is +35deg
  const deg = ((voltage - 12) / 2) * 35;
  METER_NEEDLE.style.setProperty('--needle-deg', `${deg.toFixed(1)}deg`);
  METER_VAL_TEXT.textContent = `${voltage.toFixed(1)}V`;
}

function updateVoltmeterJitter() {
  if (currentParams['brownout'] === 1) return;
  let baseV = 12.1;
  if (currentPowerSource === 0) baseV = 13.8;
  else if (currentPowerSource === 2) baseV = 12.4;

  const flutter = currentParams['flutter'] || 0;
  const jitter = (Math.random() - 0.5) * flutter * 0.8;
  updateVoltmeter(baseV + jitter);
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
    updateWeatherUI(clamped);
  }
}

function updateWeatherUI(clamped) {
  if (clamped > 0.6) {
    WEATHER_TEXT.textContent = 'ÖSREGN';
    RAIN_DROPS.style.opacity = '0.85';
    RAIN_DROPS.style.animationDuration = '1.2s';
  } else if (clamped > 0.15) {
    WEATHER_TEXT.textContent = 'REGN';
    RAIN_DROPS.style.opacity = '0.55';
    RAIN_DROPS.style.animationDuration = '1.8s';
  } else {
    WEATHER_TEXT.textContent = 'UPPEHÅLL';
    RAIN_DROPS.style.opacity = '0.1';
    RAIN_DROPS.style.animationDuration = '3s';
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

// Knobs touch & mouse interaction
function setupKnobs() {
  document.querySelectorAll('.ds-knob-container').forEach(container => {
    const param = container.getAttribute('data-param');
    const knob = container.querySelector('.ds-knob');
    if (!knob) return;

    let startY = 0;
    let startVal = 0;
    let pointerId = null;

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      const dy = startY - e.clientY;
      const def = paramsDef[param];
      if (!def) return;
      const range = def.max - def.min;
      const step = range / 160; // 160px for full sweep, standard in 3000-series
      setParam(param, startVal + dy * step);
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      try { knob.releasePointerCapture(e.pointerId); } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    knob.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      try { knob.setPointerCapture(e.pointerId); } catch {}
      pointerId = e.pointerId;
      startY = e.clientY;
      startVal = currentParams[param] !== undefined ? currentParams[param] : (paramsDef[param] ? paramsDef[param].default : 0);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);

      const val = startVal;
      const label = container.getAttribute('data-label') || param.toUpperCase();
      LCD_NAME.textContent = label;
      LCD_VAL.textContent = val.toFixed(2);
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
    }, { passive: false });

    knob.addEventListener('dblclick', () => {
      const def = paramsDef[param];
      if (def) setParam(param, def.default);
    });

    knob.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') {
        const val = currentParams[param] !== undefined ? currentParams[param] : (paramsDef[param] ? paramsDef[param].default : 0);
        const label = container.getAttribute('data-label') || param.toUpperCase();
        LCD_NAME.textContent = label;
        LCD_VAL.textContent = val.toFixed(2);
      }
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

    stepEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      cycleStep(i);
    });

    STEPS_CONTAINER.appendChild(stepEl);
  }

  // Play / Stop
  PLAY_BTN.addEventListener('pointerdown', (e) => {
    e.preventDefault();
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
  let gate = Math.floor(val / 64) % 2;
  let accent = Math.floor(val / 128) % 2;
  let pitch = (val % 64) + 12;

  if (gate === 0) {
    pitch = C_MINOR_SCALE[stepIdx % C_MINOR_SCALE.length];
    val = (pitch - 12) + 64;
  } else if (accent === 0) {
    val = val + 128;
  } else {
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

// 2-Octave Plastic Camping Keyboard (C3 to C5, MIDI 48 to 72)
function setupKeyboard() {
  KEYS_CONTAINER.innerHTML = '';
  const whiteNotes = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
  const blackNotes = [
    { midi: 49, afterIdx: 0 }, // C#3
    { midi: 51, afterIdx: 1 }, // D#3
    { midi: 54, afterIdx: 3 }, // F#3
    { midi: 56, afterIdx: 4 }, // G#3
    { midi: 58, afterIdx: 5 }, // A#3
    { midi: 61, afterIdx: 7 }, // C#4
    { midi: 63, afterIdx: 8 }, // D#4
    { midi: 66, afterIdx: 10 }, // F#4
    { midi: 68, afterIdx: 11 }, // G#4
    { midi: 70, afterIdx: 12 }  // A#4
  ];

  const totalWhite = whiteNotes.length;
  const whiteWidthPct = 100 / totalWhite;

  // 1. Create white keys
  whiteNotes.forEach((midi, idx) => {
    const key = document.createElement('div');
    const isRoot = (midi % 12 === 0);
    key.className = `kn-key ds-key w white ${isRoot ? 'scale-c' : ''}`;
    key.setAttribute('data-note', midi);
    key.setAttribute('tabindex', '0');
    key.setAttribute('aria-label', midiToName(midi));
    key.style.left = `${(idx * whiteWidthPct).toFixed(4)}%`;
    key.style.width = `${whiteWidthPct.toFixed(4)}%`;

    const noteSpan = document.createElement('span');
    noteSpan.className = 'kn-key-note';
    noteSpan.textContent = midiToName(midi);
    key.appendChild(noteSpan);

    KEYS_CONTAINER.appendChild(key);
  });

  // 2. Create black keys
  const blackWidthPct = whiteWidthPct * 0.62;
  blackNotes.forEach(({ midi, afterIdx }) => {
    const bKey = document.createElement('div');
    bKey.className = 'kn-key ds-key b black';
    bKey.setAttribute('data-note', midi);
    bKey.setAttribute('tabindex', '0');
    bKey.setAttribute('aria-label', midiToName(midi));

    // Centered on the seam between white keys
    const leftPct = ((afterIdx + 1) * whiteWidthPct) - (blackWidthPct / 2);
    bKey.style.left = `${leftPct.toFixed(4)}%`;
    bKey.style.width = `${blackWidthPct.toFixed(4)}%`;

    const noteSpan = document.createElement('span');
    noteSpan.className = 'kn-key-note';
    noteSpan.textContent = midiToName(midi);
    bKey.appendChild(noteSpan);

    KEYS_CONTAINER.appendChild(bKey);
  });

  const fingerNotes = new Map();

  function keyAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const keyEl = el.closest('.kn-key');
    return keyEl ? parseInt(keyEl.dataset.note, 10) : null;
  }

  function noteFromEvent(e) {
    const targetKey = e.target && e.target.closest ? e.target.closest('.kn-key') : null;
    if (targetKey && targetKey.dataset.note) {
      return parseInt(targetKey.dataset.note, 10);
    }
    if (e.clientX !== undefined && e.clientY !== undefined) {
      return keyAtPoint(e.clientX, e.clientY);
    }
    return null;
  }

  const bindKey = (el, midi) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      fingerNotes.set(e.pointerId || 0, midi);
      triggerNoteOn(midi, 100);
    });
    el.addEventListener('pointerup', (e) => {
      triggerNoteOff(midi);
      fingerNotes.delete(e.pointerId || 0);
    });
    el.addEventListener('pointerleave', (e) => {
      if (fingerNotes.has(e.pointerId || 0)) {
        triggerNoteOff(midi);
        fingerNotes.delete(e.pointerId || 0);
      }
    });
  };

  whiteNotes.forEach((midi, idx) => {
    const key = KEYS_CONTAINER.children[idx];
    if (key) bindKey(key, midi);
  });

  const allKeyEls = KEYS_CONTAINER.querySelectorAll('.kn-key.b');
  allKeyEls.forEach((bKey, bIdx) => {
    if (blackNotes[bIdx]) bindKey(bKey, blackNotes[bIdx].midi);
  });

  KEYS_CONTAINER.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    try { KEYS_CONTAINER.setPointerCapture(e.pointerId); } catch {}
    const note = noteFromEvent(e);
    if (note !== null && !fingerNotes.has(e.pointerId)) {
      fingerNotes.set(e.pointerId, note);
      triggerNoteOn(note, 100);
    }
  });

  KEYS_CONTAINER.addEventListener('pointermove', (e) => {
    if (!fingerNotes.has(e.pointerId)) return;
    const oldNote = fingerNotes.get(e.pointerId);
    const newNote = keyAtPoint(e.clientX, e.clientY);
    if (newNote !== null && newNote !== oldNote) {
      triggerNoteOff(oldNote);
      triggerNoteOn(newNote, 100);
      fingerNotes.set(e.pointerId, newNote);
    }
  });

  const endFinger = (e) => {
    if (!fingerNotes.has(e.pointerId)) return;
    const note = fingerNotes.get(e.pointerId);
    triggerNoteOff(note);
    fingerNotes.delete(e.pointerId);
    try { KEYS_CONTAINER.releasePointerCapture(e.pointerId); } catch {}
  };

  KEYS_CONTAINER.addEventListener('pointerup', endFinger);
  KEYS_CONTAINER.addEventListener('pointercancel', endFinger);

  // Computer keyboard bindings
  const KEY_MAP = {
    KeyA: 48, KeyW: 49, KeyS: 50, KeyE: 51, KeyD: 52, KeyF: 53,
    KeyT: 54, KeyG: 55, KeyY: 56, KeyH: 57, KeyU: 58, KeyJ: 59,
    KeyK: 60, KeyO: 61, KeyL: 62, KeyP: 63, Semicolon: 64, Quote: 65
  };

  const activeKeys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.repeat) return;
    const midi = KEY_MAP[e.code];
    if (midi && !activeKeys.has(midi)) {
      activeKeys.add(midi);
      initAudio();
      triggerNoteOn(midi, 100);
    } else if (e.code === 'Space') {
      e.preventDefault();
      PLAY_BTN.dispatchEvent(new PointerEvent('pointerdown'));
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const midi = KEY_MAP[e.code];
    if (midi && activeKeys.has(midi)) {
      activeKeys.delete(midi);
      triggerNoteOff(midi);
    }
  });
}

function triggerNoteOn(pitch, vel) {
  if (workletNode) {
    workletNode.port.postMessage({ type: 'midi', bytes: [0x92, pitch, vel] });
  }
  const keyEl = KEYS_CONTAINER.querySelector(`[data-note="${pitch}"]`);
  if (keyEl) keyEl.classList.add('down', 'active');
  LCD_NAME.textContent = 'TON';
  LCD_VAL.textContent = `${midiToName(pitch)} (${pitch})`;
  updateVoltmeterJitter();
}

function triggerNoteOff(pitch) {
  if (workletNode) {
    workletNode.port.postMessage({ type: 'midi', bytes: [0x82, pitch, 0] });
  }
  const keyEl = KEYS_CONTAINER.querySelector(`[data-note="${pitch}"]`);
  if (keyEl) keyEl.classList.remove('down', 'active');
}

// Panic button (STRÖMAVBROTT)
function setupPanic() {
  const triggerPanic = (active) => {
    setParam('brownout', active ? 1 : 0);
    PANIC_BTN.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      LCD_NAME.textContent = 'STRÖMAVBROTT';
      LCD_VAL.textContent = 'KALLT I VAGNEN!';
      updateVoltmeter(0.0);
    } else {
      LCD_NAME.textContent = 'KNAUS 3000';
      LCD_VAL.textContent = 'DRIFT ÅTERSTÄLLD';
      updateVoltmeter(currentPowerSource === 0 ? 13.8 : (currentPowerSource === 1 ? 12.1 : 12.4));
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

// Camping Quirks & Features
function setupCampingQuirks() {
  // 1. Strömkälla (220V Stolpe / 12V Batteri / Gasol)
  const powerButtons = document.querySelectorAll('.power-btn');
  powerButtons.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      const p = parseInt(btn.dataset.power, 10);
      currentPowerSource = p;
      powerButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');

      if (p === 0) {
        // 220V Stolpe: clean, stable, minimal flutter
        setParam('flutter', 0.04);
        setParam('drive', 0.15);
        updateVoltmeter(13.8);
        LCD_NAME.textContent = 'KRAFT · 220V STOLPE';
        LCD_VAL.textContent = 'NÄTSTRÖM (LADDAR)';
      } else if (p === 1) {
        // 12V Fritidsbatteri: standard camping flutter
        setParam('flutter', 0.25);
        setParam('drive', 0.35);
        updateVoltmeter(12.1);
        LCD_NAME.textContent = 'KRAFT · 12V BATTERI';
        LCD_VAL.textContent = 'TRANSFORMATOR-SURR';
      } else {
        // Gasol: warm drive, slight rumble
        setParam('flutter', 0.12);
        setParam('drive', 0.65);
        updateVoltmeter(12.4);
        LCD_NAME.textContent = 'KRAFT · GASOL';
        LCD_VAL.textContent = 'PRIMUS TÄNT · VARM DRIFT';
      }
    });
  });

  // 2. Campingplatser Presets
  const CAMPINGPLATSER = [
    {
      name: 'BÖDA SAND',
      title: 'BÖDA SAND · SOL OCH 220V',
      params: { wave: 0, attack: 0.08, decay: 0.45, sustain: 0.7, release: 0.5, cutoff: 0.65, resonance: 0.25, envmod: 0.35, drive: 0.15, rain: 0.05, flutter: 0.04 },
      power: 0
    },
    {
      name: 'RAGUNDA',
      title: 'RAGUNDA · ÖSREGN OCH 12V TAPP',
      params: { wave: 1, attack: 0.02, decay: 0.35, sustain: 0.55, release: 0.35, cutoff: 0.42, resonance: 0.45, envmod: 0.6, drive: 0.38, rain: 0.85, flutter: 0.3 },
      power: 1
    },
    {
      name: 'VARBERG',
      title: 'VARBERG · VÄSTKUSTBLÅST OCH GASOL',
      params: { wave: 2, attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.25, cutoff: 0.55, resonance: 0.62, envmod: 0.7, drive: 0.65, rain: 0.3, flutter: 0.18 },
      power: 2
    },
    {
      name: 'KÖPINGSVIK',
      title: 'KÖPINGSVIK · FULL CAMPINGPANIK',
      params: { wave: 1, attack: 0.05, decay: 0.5, sustain: 0.8, release: 0.65, cutoff: 0.78, resonance: 0.7, envmod: 0.85, drive: 0.8, rain: 0.6, flutter: 0.65 },
      power: 1
    }
  ];

  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      const idx = parseInt(btn.dataset.preset, 10);
      const cp = CAMPINGPLATSER[idx];
      if (!cp) return;
      activePresetIndex = idx;
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Apply preset parameters
      for (const [k, v] of Object.entries(cp.params)) {
        setParam(k, v);
      }

      // Switch power
      const targetPowerBtn = document.querySelector(`.power-btn[data-power="${cp.power}"]`);
      if (targetPowerBtn) targetPowerBtn.dispatchEvent(new PointerEvent('pointerdown'));

      LCD_NAME.textContent = 'CAMPING · ' + cp.name;
      LCD_VAL.textContent = 'PLATS LADDAD';
    });
  });

  // 3. Piezo Ignition Button
  PIEZO_BTN.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    PIEZO_BTN.classList.add('spark');
    setTimeout(() => PIEZO_BTN.classList.remove('spark'), 200);

    // Audio spark: temporarily spike drive & rain for 60ms
    const prevDrive = currentParams['drive'] || 0.35;
    setParam('drive', Math.min(1.0, prevDrive + 0.4), false);
    setTimeout(() => setParam('drive', prevDrive, false), 70);

    LCD_NAME.textContent = 'PIEZO · GNISTA';
    LCD_VAL.textContent = 'BLÅ GNISTA TÄNDER GASOLEN';
    updateVoltmeterJitter();
  });

  // 4. Mosquito Zapper on Caravan Window
  ZAPPER_BTN.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    ZAPPER_BTN.classList.add('spark');
    setTimeout(() => ZAPPER_BTN.classList.remove('spark'), 250);

    // Audio zap: temporary high resonance spike
    const prevRes = currentParams['resonance'] || 0.4;
    setParam('resonance', 0.95, false);
    setTimeout(() => setParam('resonance', prevRes, false), 90);

    LCD_NAME.textContent = 'KNOTT · ZAP!';
    LCD_VAL.textContent = 'EN MINDRE I FÖRTÄLTET';
  });

  // 5. Spilled Pripps Blå Beer Ring: Mutate sequencer
  BEER_RING.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    // Variation: shift steps or toggle accents in C-minor
    for (let i = 0; i < 16; i++) {
      if (Math.random() < 0.3) {
        cycleStep(i);
      }
    }
    LCD_NAME.textContent = 'SPILLD FOLKÖL';
    LCD_VAL.textContent = 'VAGNEN GUNGAR · VARIATION';
  });

  // 6. Weather Badge Toggle
  WEATHER_BADGE.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    const currRain = currentParams['rain'] || 0;
    let nextRain = 0.35;
    if (currRain > 0.6) nextRain = 0.0;
    else if (currRain > 0.15) nextRain = 0.85;
    setParam('rain', nextRain);
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
  setupCampingQuirks();
  setupMenu();

  // Initial UI knob positions
  for (const [k, v] of Object.entries(currentParams)) {
    updateKnobDisplay(k, v);
  }
  updateWeatherUI(currentParams['rain'] || 0.35);
  updateVoltmeter(12.1);

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
