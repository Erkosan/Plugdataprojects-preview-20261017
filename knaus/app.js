// KNAUS 3000 — User Interface & AudioWorklet host
const ROOT = document.documentElement;
const STAGE = document.getElementById('stage');
const FIT = document.getElementById('fit');
const LCD_NAME = document.getElementById('lname');
const LCD_VAL = document.getElementById('lval');
const LCD_LINE = document.getElementById('lline');
const PLAY_BTN = document.getElementById('play');
const BPM_INPUT = document.getElementById('bpm');
const REC_BTN = document.getElementById('rec');
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
let isRecording = false;
let recStep = 0; // Target step for step-recording (0..15)
let isAudioReady = false;
let currentPowerSource = 0; // 0 = 220V, 1 = 12V, 2 = Gasol
let activePresetIndex = 0; // 0 = Böda Sand
let beerCanOpened = false;
let beerCanKnocked = false;
let beerSpilled = false;
let gasHeaterLit = false;
let savedDriveBeforeHeater = 0.35;
let matchStriking = false;
let sagTimeout = null;
const fingers = new Map(); // pointerId -> midi note (live held keys)

// C-minor scale notes in MIDI numbers
const C_MINOR_SCALE = [48, 50, 51, 53, 55, 56, 58, 60, 62, 63, 65, 67, 68, 70, 72];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToName(m) {
  return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}

// Fit scaling: scale the room as one picture
function updateFit() {
  const stage = document.getElementById('stage') || ROOT;
  const cs = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const h = stage.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
  const zoom = Math.max(0.2, Math.min(w / 1180, h / 740));
  document.documentElement.style.setProperty('--zoom', zoom.toFixed(4));
}
new ResizeObserver(updateFit).observe(document.getElementById('stage') || ROOT);
window.addEventListener('orientationchange', () => setTimeout(updateFit, 250));
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



// Tactile Web Audio Sound Effects Synthesizer (Zero-latency procedural camping sfx)
function playSfx(type) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  try {
    if (type === 'beer-open') {
      // PFFFFT-TSCH! metall-knäpp + fräsande kolsyrehiss
      const osc = audioCtx.createOscillator();
      const oscG = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.035);
      oscG.gain.setValueAtTime(0.4, t);
      oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc.connect(oscG).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.04);

      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.3), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4200, t);
      filter.frequency.exponentialRampToValueAtTime(1600, t + 0.28);
      filter.Q.value = 2.2;
      const noiseG = audioCtx.createGain();
      noiseG.gain.setValueAtTime(0.35, t);
      noiseG.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      noise.connect(filter).connect(noiseG).connect(audioCtx.destination);
      noise.start(t);
      noise.stop(t + 0.3);
    } else if (type === 'beer-clonk') {
      // KLONK! Burken välter omkull mot campingbordet
      [260, 490, 780].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.65, t + 0.22);
        g.gain.setValueAtTime(0.35 / (idx + 1), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.23);
      });
    } else if (type === 'wettex-swipe') {
      // Mjukt fuktigt Wettex-torkljud
      const dur = 0.45;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.linearRampToValueAtTime(350, t + dur);
      filter.Q.value = 1.4;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(audioCtx.destination);
      src.start(t);
      src.stop(t + dur);
    } else if (type === 'zap') {
      // BZZZZ-ZAP! 12V Högspänningsgnista
      const dur = 0.16;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (i < 300 ? 1 : 0.4);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1400;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(audioCtx.destination);
      src.start(t);
      src.stop(t + dur);

      const buzz = audioCtx.createOscillator();
      const bG = audioCtx.createGain();
      buzz.type = 'sawtooth';
      buzz.frequency.setValueAtTime(95, t);
      bG.gain.setValueAtTime(0.28, t);
      bG.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      buzz.connect(bG).connect(audioCtx.destination);
      buzz.start(t);
      buzz.stop(t + 0.13);
    } else if (type === 'piezo-click' || type === 'piezo-snap') {
      // Mekaniskt metall-klick + kraftigt kvartskristall-slag och fjäderklang
      const snap = audioCtx.createOscillator();
      const snapG = audioCtx.createGain();
      snap.type = 'triangle';
      snap.frequency.setValueAtTime(3400, t);
      snap.frequency.exponentialRampToValueAtTime(140, t + 0.025);
      snapG.gain.setValueAtTime(0.75, t);
      snapG.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      snap.connect(snapG).connect(audioCtx.destination);
      snap.start(t);
      snap.stop(t + 0.03);

      const thud = audioCtx.createOscillator();
      const thudG = audioCtx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(340, t);
      thud.frequency.exponentialRampToValueAtTime(55, t + 0.06);
      thudG.gain.setValueAtTime(0.6, t);
      thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      thud.connect(thudG).connect(audioCtx.destination);
      thud.start(t);
      thud.stop(t + 0.08);

      const twang = audioCtx.createOscillator();
      const twangG = audioCtx.createGain();
      twang.type = 'sawtooth';
      twang.frequency.setValueAtTime(1250, t + 0.008);
      twang.frequency.exponentialRampToValueAtTime(420, t + 0.09);
      twangG.gain.setValueAtTime(0.25, t + 0.008);
      twangG.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      twang.connect(twangG).connect(audioCtx.destination);
      twang.start(t + 0.008);
      twang.stop(t + 0.11);
    } else if (type === 'gas-whoosh') {
      // Varm gasol-tändning
      const dur = 0.55;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(160, t);
      filter.frequency.linearRampToValueAtTime(500, t + 0.12);
      filter.frequency.exponentialRampToValueAtTime(120, t + dur);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(audioCtx.destination);
      src.start(t);
      src.stop(t + dur);
    } else if (type === 'gas-puff') {
      // Gasol-släckning
      const dur = 0.2;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(audioCtx.destination);
      src.start(t);
      src.stop(t + dur);
    } else if (type === 'match-scratch') {
      // SCCCCH-FSH! Svavel drag mot plån
      const dur = 0.38;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3400, t);
      filter.frequency.exponentialRampToValueAtTime(5400, t + 0.16);
      filter.frequency.exponentialRampToValueAtTime(1400, t + dur);
      filter.Q.value = 2.4;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.38, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(audioCtx.destination);
      src.start(t);
      src.stop(t + dur);
    } else if (type === 'flame-crackle') {
      // Mjukt sprakande och väsande från brinnande tändsticka och låga
      const dur = 2.2;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() < 0.025 ? (Math.random() * 2 - 1) * 1.4 : (Math.random() * 2 - 1) * 0.12;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, t);
      filter.Q.value = 1.3;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.01, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(audioCtx.destination);
      src.start(t);
      src.stop(t + dur);
    }
  } catch (err) {
    console.warn('Sfx error:', err);
  }
}

// Voltmeter Voltage Sag under tunga basnoter och sequencer-slag
function triggerVoltageSag(pitch = 48, vel = 100) {
  if (currentParams['brownout'] === 1) return;
  const bassWeight = Math.max(0, (65 - pitch) / 17);
  const velWeight = Math.min(1.2, vel / 100);
  let baseV = 12.1;
  let maxDrop = 0.9;
  if (currentPowerSource === 0) {
    baseV = 13.8;
    maxDrop = 0.7;
  } else if (currentPowerSource === 2) {
    baseV = 12.4;
    maxDrop = 0.8;
  } else {
    maxDrop = 1.1; // 12V batteri saggar mest!
  }

  const sagAmount = bassWeight * velWeight * maxDrop;
  if (sagAmount < 0.12) return;

  const targetV = Math.max(10.8, baseV - sagAmount);
  updateVoltmeter(targetV);

  // Subtil dimning av chassi och LCD
  const chassis = document.querySelector('.knaus-chassis');
  const lcd = document.querySelector('.knaus-lcd');
  if (chassis) chassis.classList.add('voltage-sag');
  if (lcd) lcd.classList.add('voltage-sag');

  clearTimeout(sagTimeout);
  sagTimeout = setTimeout(() => {
    if (chassis) chassis.classList.remove('voltage-sag');
    if (lcd) lcd.classList.remove('voltage-sag');
    sagTimeout = null;
    updateVoltmeterJitter();
  }, 190);
}

function handleEngineEvent(name, values) {
  if (name === 'ev_step') {
    const step = Math.round(values[0]);
    activeStep = step;
    highlightStep(step);

    // Kontrollera om steget har gate och accent
    const stepVal = currentParams[`step${step}`] || 0;
    const gate = Math.floor(stepVal / 64) % 2;
    const accent = Math.floor(stepVal / 128) % 2;
    const stepPitch = (stepVal % 64) + 12;

    if (gate > 0) {
      triggerVoltageSag(stepPitch, accent > 0 ? 127 : 85);
      if (accent > 0) {
        // Rytmisk mikrozap vid sequencer-accent
        const spark = document.getElementById('zapper-spark');
        if (spark) {
          spark.style.opacity = '0.7';
          spark.style.transform = 'scale(1.2)';
          setTimeout(() => {
            spark.style.opacity = '0';
            spark.style.transform = 'scale(1)';
          }, 70);
        }
      }
    } else {
      updateVoltmeterJitter();
    }
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
    setTimeout(() => {
      keyEl.classList.remove('active');
      if (![...fingers.values()].includes(midiNote)) {
        keyEl.classList.remove('down');
      }
    }, 120);
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
  if (currentParams['brownout'] === 1 || sagTimeout !== null) return;
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
    stepEl.id = `step-${i}`;
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
      lastRecClick = 0;
      if (isRecording) {
        recStep = i;
        updateRecTarget();
        const val = currentParams[`step${i}`] || 0;
        const gate = Math.floor(val / 64) % 2;
        const pitch = (val % 64) + 12;
        LCD_NAME.textContent = `INSPELNING · STEG ${recStep + 1}`;
        LCD_VAL.textContent = gate ? midiToName(pitch) : 'VILA / TOMT';
      } else {
        cycleStep(i);
      }
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
    PLAY_BTN.classList.toggle('playing', isPlaying);
    const path = PLAY_BTN.querySelector('#pi');
    if (path) {
      path.setAttribute('d', isPlaying ? 'M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z' : 'M7 5 L19 12 L7 19 Z');
    }
    updateRecTarget();
    if (isRecording) {
      LCD_NAME.textContent = isPlaying ? 'INSPELNING · LIVE OVERDUB' : `INSPELNING · STEG ${recStep + 1}`;
      LCD_VAL.textContent = isPlaying ? 'SPELA IN TILL SLINGA' : 'TRYCK TANGENT FÖR NOT';
    } else {
      LCD_NAME.textContent = isPlaying ? 'SEQUENCER' : 'SEQUENCER STOPPAD';
      LCD_VAL.textContent = isPlaying ? 'SPELAR' : 'PAUS';
    }
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
    key.id = `key${midi}`;
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
    bKey.id = `key${midi}`;
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

  // Multi-finger sliding / glissando keyboard (identical to Turbotutte 3000 & Svettan 3000)
  const keyAt = (x, y, fallbackEl) => {
    let el = (x !== undefined && y !== undefined && (x !== 0 || y !== 0)) ? document.elementFromPoint(x, y) : null;
    if (!el && fallbackEl) el = fallbackEl;
    const keyEl = el && (el.classList?.contains('ds-key') ? el : el.closest?.('.ds-key, .kn-key'));
    return keyEl && keyEl.dataset.note !== undefined ? parseInt(keyEl.dataset.note, 10) : null;
  };

  const keyOn = (sem) => {
    if (sem === null || sem === undefined) return;
    initAudio();
    triggerNoteOn(sem, 100);
  };

  const keyOff = (sem) => {
    if (sem === null || sem === undefined) return;
    triggerNoteOff(sem);
  };

  KEYS_CONTAINER.addEventListener('pointerdown', (e) => {
    const sem = keyAt(e.clientX, e.clientY, e.target);
    if (sem === null) return;
    e.preventDefault();
    try { KEYS_CONTAINER.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    fingers.set(e.pointerId, sem);
    if ([...fingers.values()].filter(v => v === sem).length === 1) keyOn(sem);
  });

  KEYS_CONTAINER.addEventListener('pointermove', (e) => {
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
    try { KEYS_CONTAINER.releasePointerCapture(e.pointerId); } catch {}
  };

  KEYS_CONTAINER.addEventListener('pointerup', lift);
  KEYS_CONTAINER.addEventListener('pointercancel', lift);
  KEYS_CONTAINER.addEventListener('lostpointercapture', lift);
  KEYS_CONTAINER.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('blur', () => {
    for (const sem of [...fingers.values()]) {
      if (sem !== null) keyOff(sem);
    }
    fingers.clear();
  });

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
      if (isRecording && !isPlaying) {
        recordRest();
      } else {
        PLAY_BTN.dispatchEvent(new PointerEvent('pointerdown'));
      }
    } else if (e.code === 'KeyV' && isRecording) {
      e.preventDefault();
      recordRest();
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

function triggerNoteOn(pitch, vel = 100) {
  lastRecClick = 0;

  // Voltage Sag vid djupa bastoner
  if (pitch < 62) {
    triggerVoltageSag(pitch, vel);
  }

  // Berusad sluddring om öl runnit in i kretsarna
  let noteToPlay = pitch;
  if (beerSpilled) {
    if (Math.random() < 0.35) {
      noteToPlay = Math.max(48, Math.min(72, pitch + (Math.random() < 0.5 ? -1 : 1)));
    }
    // Tillfälligt extra ryck i flutter
    if (workletNode) {
      workletNode.port.postMessage({ type: 'param', name: 'flutter', value: 0.95 });
      setTimeout(() => {
        if (beerSpilled && workletNode) workletNode.port.postMessage({ type: 'param', name: 'flutter', value: 0.85 });
      }, 100);
    }
  }

  if (workletNode) {
    workletNode.port.postMessage({ type: 'midi', bytes: [0x92, noteToPlay, vel] });
  }
  const keyEl = KEYS_CONTAINER.querySelector(`[data-note="${pitch}"]`);
  if (keyEl) keyEl.classList.add('down', 'active');

  if (isRecording) {
    const targetStep = isPlaying ? activeStep : recStep;
    const val = (pitch - 12) + 64;
    setParam(`step${targetStep}`, val, false);
    currentParams[`step${targetStep}`] = val;
    const stepEl = document.getElementById(`step-${targetStep}`) || STEPS_CONTAINER.children[targetStep];
    if (stepEl) updateStepUI(stepEl, targetStep);
    LCD_NAME.textContent = `INSPELNING · STEG ${targetStep + 1}`;
    LCD_VAL.textContent = midiToName(pitch);
    if (!isPlaying) {
      recStep = (recStep + 1) % 16;
      updateRecTarget();
    }
  } else {
    LCD_NAME.textContent = 'TON';
    LCD_VAL.textContent = `${midiToName(pitch)} (${pitch})`;
  }

  if (pitch >= 62) {
    updateVoltmeterJitter();
  }
  if (!window.__knausNotes) window.__knausNotes = [];
  window.__knausNotes.push({ type: 'on', note: pitch, vel });
}

function triggerNoteOff(pitch) {
  if (workletNode) {
    workletNode.port.postMessage({ type: 'midi', bytes: [0x82, pitch, 0] });
  }
  const keyEl = KEYS_CONTAINER.querySelector(`[data-note="${pitch}"]`);
  if (keyEl) keyEl.classList.remove('down', 'active');
  if (!window.__knausNotes) window.__knausNotes = [];
  window.__knausNotes.push({ type: 'off', note: pitch });
}

// Sequencer REC & Step-recording functions
function updateRecTarget() {
  for (let i = 0; i < 16; i++) {
    const stepEl = document.getElementById(`step-${i}`) || STEPS_CONTAINER.children[i];
    if (stepEl) {
      if (isRecording && !isPlaying && i === recStep) {
        stepEl.classList.add('rec-target');
      } else {
        stepEl.classList.remove('rec-target');
      }
    }
  }
}

function toggleRecord(forceState) {
  isRecording = (forceState !== undefined) ? !!forceState : !isRecording;
  if (REC_BTN) {
    REC_BTN.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
    REC_BTN.classList.toggle('recording', isRecording);
  }
  updateRecTarget();
  if (isRecording) {
    LCD_NAME.textContent = isPlaying ? 'INSPELNING · LIVE OVERDUB' : `INSPELNING · STEG ${recStep + 1}`;
    LCD_VAL.textContent = isPlaying ? 'SPELA IN TILL SLINGA' : 'TRYCK TANGENT FÖR NOT';
  } else {
    LCD_NAME.textContent = 'INSPELNING AVBRUTEN';
    LCD_VAL.textContent = isPlaying ? 'SPELAR' : 'PAUS';
  }
}

function clearAllSteps() {
  for (let i = 0; i < 16; i++) {
    setParam(`step${i}`, 0, false);
    currentParams[`step${i}`] = 0;
    const stepEl = document.getElementById(`step-${i}`) || STEPS_CONTAINER.children[i];
    if (stepEl) updateStepUI(stepEl, i);
  }
  recStep = 0;
  isRecording = true;
  if (REC_BTN) {
    REC_BTN.setAttribute('aria-pressed', 'true');
    REC_BTN.classList.add('recording');
  }
  updateRecTarget();
  LCD_NAME.textContent = 'RENSAT · ALLA STEG TOMMA';
  LCD_VAL.textContent = 'TRYCK TANGENT FÖR NOT';
}

function recordRest() {
  if (!isRecording) return;
  const targetStep = isPlaying ? activeStep : recStep;
  const paramName = `step${targetStep}`;
  setParam(paramName, 0, false);
  currentParams[paramName] = 0;
  const stepEl = document.getElementById(`step-${targetStep}`) || STEPS_CONTAINER.children[targetStep];
  if (stepEl) updateStepUI(stepEl, targetStep);
  LCD_NAME.textContent = `INSPELNING · STEG ${targetStep + 1}`;
  LCD_VAL.textContent = 'VILA / PAUS (TOMT)';
  if (!isPlaying) {
    recStep = (recStep + 1) % 16;
    updateRecTarget();
  }
}

let lastRecClick = 0;

function setupRec() {
  if (!REC_BTN) return;
  REC_BTN.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    const now = Date.now();
    if (now - lastRecClick < 280) {
      lastRecClick = 0;
      clearAllSteps();
      return;
    }
    lastRecClick = now;
    toggleRecord();
  });

  REC_BTN.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearAllSteps();
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
        setParam('flutter', beerSpilled ? 0.85 : 0.04);
        setParam('drive', gasHeaterLit ? 0.70 : 0.15);
        updateVoltmeter(13.8);
        LCD_NAME.textContent = 'KRAFT · 220V STOLPE';
        LCD_VAL.textContent = 'NÄTSTRÖM (LADDAR)';
      } else if (p === 1) {
        // 12V Fritidsbatteri: standard camping flutter
        setParam('flutter', beerSpilled ? 0.90 : 0.25);
        setParam('drive', gasHeaterLit ? 0.75 : 0.35);
        updateVoltmeter(12.1);
        LCD_NAME.textContent = 'KRAFT · 12V BATTERI';
        LCD_VAL.textContent = 'TRANSFORMATOR-SURR';
      } else {
        // Gasol: warm drive, slight rumble
        setParam('flutter', beerSpilled ? 0.85 : 0.12);
        setParam('drive', gasHeaterLit ? 0.85 : 0.65);
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
      params: { wave: 0, attack: 0.08, decay: 0.45, sustain: 0.6, release: 0.4, cutoff: 0.65, resonance: 0.25, envmod: 0.35, drive: 0.15, rain: 0.0, flutter: 0.04 },
      power: 0
    },
    {
      name: 'RAGUNDA',
      title: 'RAGUNDA · ÖSREGN OCH 12V TAPP',
      params: { wave: 1, attack: 0.02, decay: 0.35, sustain: 0.5, release: 0.35, cutoff: 0.42, resonance: 0.45, envmod: 0.6, drive: 0.38, rain: 0.25, flutter: 0.25 },
      power: 1
    },
    {
      name: 'VARBERG',
      title: 'VARBERG · VÄSTKUSTBLÅST OCH GASOL',
      params: { wave: 2, attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.25, cutoff: 0.55, resonance: 0.5, envmod: 0.7, drive: 0.65, rain: 0.1, flutter: 0.18 },
      power: 2
    },
    {
      name: 'KÖPINGSVIK',
      title: 'KÖPINGSVIK · FULL CAMPINGPANIK',
      params: { wave: 1, attack: 0.05, decay: 0.5, sustain: 0.65, release: 0.5, cutoff: 0.75, resonance: 0.6, envmod: 0.8, drive: 0.7, rain: 0.3, flutter: 0.4 },
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

      for (const [k, v] of Object.entries(cp.params)) {
        setParam(k, v);
      }

      const targetPowerBtn = document.querySelector(`.power-btn[data-power="${cp.power}"]`);
      if (targetPowerBtn) targetPowerBtn.dispatchEvent(new PointerEvent('pointerdown'));

      LCD_NAME.textContent = 'CAMPING · ' + cp.name;
      LCD_VAL.textContent = 'PLATS LADDAD';
    });
  });

  // 3. Truma Gasolvärmare & Piezo-tändare
  const PIEZO_BTN = document.getElementById('piezo');
  const TRUMA_HEATER = document.getElementById('truma-heater');
  const GAS_WINDOW = document.getElementById('gas-window');
  const GAS_FLAME = document.getElementById('gas-flame');
  if (PIEZO_BTN) {
    PIEZO_BTN.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      PIEZO_BTN.classList.add('pressed', 'spark');
      if (GAS_WINDOW) GAS_WINDOW.classList.add('spark');
      playSfx('piezo-snap');

      setTimeout(() => {
        PIEZO_BTN.classList.remove('pressed', 'spark');
        if (GAS_WINDOW) GAS_WINDOW.classList.remove('spark');
      }, 180);

      if (!gasHeaterLit) {
        // Tänd Truma gasolbrännare
        gasHeaterLit = true;
        playSfx('gas-whoosh');
        if (GAS_FLAME) GAS_FLAME.classList.add('lit');
        if (TRUMA_HEATER) TRUMA_HEATER.classList.add('lit');
        savedDriveBeforeHeater = currentParams['drive'] || 0.35;
        setParam('drive', Math.min(1.0, savedDriveBeforeHeater + 0.35), true);
        LCD_NAME.textContent = 'PIEZO · GASOLVÄRMARE';
        LCD_VAL.textContent = 'TÄND (TRUMA 3000)';
      } else {
        // Släck brännare
        gasHeaterLit = false;
        playSfx('gas-puff');
        if (GAS_FLAME) GAS_FLAME.classList.remove('lit');
        if (TRUMA_HEATER) TRUMA_HEATER.classList.remove('lit');
        setParam('drive', savedDriveBeforeHeater, true);
        LCD_NAME.textContent = 'PIEZO · GASOLVÄRMARE';
        LCD_VAL.textContent = 'SLÄCKT (TRUMA 3000)';
      }
      updateVoltmeterJitter();
    });
  }

  // 4. Knottdödaren (UV-zapper) i takluckan & myggsvärm
  const ZAPPER_BTN = document.getElementById('zapper');
  const CARAVAN_WINDOW = document.getElementById('caravan-window');
  const ROOM = document.getElementById('room');
  const triggerZapper = (targetMosquito = null) => {
    initAudio();
    playSfx('zap');
    if (ZAPPER_BTN) ZAPPER_BTN.classList.add('spark');
    if (CARAVAN_WINDOW) CARAVAN_WINDOW.classList.add('flash');
    if (ROOM) ROOM.classList.add('zapper-flash-active');

    setTimeout(() => {
      if (ZAPPER_BTN) ZAPPER_BTN.classList.remove('spark');
      if (CARAVAN_WINDOW) CARAVAN_WINDOW.classList.remove('flash');
      if (ROOM) ROOM.classList.remove('zapper-flash-active');
    }, 220);

    // Döda en mygga
    let victim = targetMosquito;
    if (!victim) {
      const liveMosquitos = Array.from(document.querySelectorAll('.mosquito:not(.dead)'));
      if (liveMosquitos.length > 0) victim = liveMosquitos[Math.floor(Math.random() * liveMosquitos.length)];
    }
    if (victim) {
      victim.classList.add('dead');
      setTimeout(() => victim.classList.remove('dead'), 4000);
    }

    // Audio zap: temporary high resonance spike
    const prevRes = currentParams['resonance'] || 0.4;
    setParam('resonance', 0.95, false);
    setTimeout(() => setParam('resonance', prevRes, false), 90);

    LCD_NAME.textContent = 'KNOTT · ZAP!';
    LCD_VAL.textContent = '12V HÖGSPÄNNING';
  };

  if (ZAPPER_BTN) {
    ZAPPER_BTN.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      triggerZapper();
    });
  }

  document.querySelectorAll('.mosquito').forEach(mosq => {
    mosq.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerZapper(mosq);
    });
  });

  // 5. Pripps Blå 2.8% retro ölburk, Kapsyl, Spilld Öl & Wettex-trasa
  const BEER_CAN = document.getElementById('beer-can');
  const BEER_ASSEMBLY = document.getElementById('beer-assembly');
  const BEER_TAB = document.getElementById('beer-tab');
  const BEER_FOAM_MOUTH = document.getElementById('beer-foam-mouth');
  const BEER_RING = document.getElementById('beer-ring');
  const WETTEX_CLOTH = document.getElementById('wettex-cloth');

  // Kapsyl / flärp klick
  if (BEER_TAB) {
    BEER_TAB.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      playSfx('beer-open');
      beerCanOpened = true;
      BEER_TAB.classList.add('opened');
      if (BEER_FOAM_MOUTH) {
        BEER_FOAM_MOUTH.classList.add('active');
        setTimeout(() => BEER_FOAM_MOUTH.classList.remove('active'), 2500);
      }
      LCD_NAME.textContent = 'PRIPPS BLÅ 2.8%';
      LCD_VAL.textContent = 'ÖPPNAD! (PFFFFT-TSCH)';
    });
  }

  // Burken klickas eller välts
  const knockBeerCan = () => {
    initAudio();
    if (!beerCanOpened && BEER_TAB) {
      BEER_TAB.classList.add('opened');
      beerCanOpened = true;
    }
    beerCanKnocked = true;
    beerSpilled = true;
    if (BEER_ASSEMBLY) BEER_ASSEMBLY.classList.add('knocked');
    if (BEER_RING) {
      BEER_RING.classList.add('expanded');
      BEER_RING.classList.remove('dry');
    }
    playSfx('beer-clonk');

    // Ölet rinner in i kretsarna: öka flutter kraftigt så det sluddrar!
    setParam('flutter', 0.85, true);

    // Mutera sekvensen lätt berusat
    for (let i = 0; i < 16; i++) {
      if (Math.random() < 0.25) {
        cycleStep(i);
      }
    }

    LCD_NAME.textContent = 'SPILLD FOLKÖL';
    LCD_VAL.textContent = 'KORTIS I KRETSARNA!';
    triggerVoltageSag(48, 127);
  };

  if (BEER_CAN) {
    BEER_CAN.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      knockBeerCan();
    });
  }

  if (BEER_RING) {
    BEER_RING.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      knockBeerCan();
    });
  }

  // Wettex-trasa torkar upp ölet och torkar kretsarna
  if (WETTEX_CLOTH) {
    WETTEX_CLOTH.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      initAudio();
      playSfx('wettex-swipe');
      WETTEX_CLOTH.classList.add('wiping');

      setTimeout(() => {
        if (BEER_RING) {
          BEER_RING.classList.remove('expanded');
          BEER_RING.classList.add('dry');
        }
      }, 350);

      setTimeout(() => {
        WETTEX_CLOTH.classList.remove('wiping');
        if (BEER_ASSEMBLY) BEER_ASSEMBLY.classList.remove('knocked');
        beerCanKnocked = false;
        beerSpilled = false;

        // Återställ strömkällans normala flutter
        const normalFlutter = (currentPowerSource === 0 ? 0.04 : (currentPowerSource === 1 ? 0.25 : 0.12));
        setParam('flutter', normalFlutter, true);

        LCD_NAME.textContent = 'TORKAT MED WETTEX';
        LCD_VAL.textContent = 'KRETSARNA TORRA';
      }, 750);
    });
  }

  // 6. Solstickan tändsticksask & tändsticka
  const SOLSTICKAN_BOX = document.getElementById('solstickan');
  const MATCHSTICK = document.getElementById('matchstick');
  const CAMPING_TABLE = document.getElementById('camping-table');
  const CHASSIS = document.querySelector('.knaus-chassis');

  const triggerMatchStrike = (e) => {
    if (e) e.preventDefault();
    if (matchStriking) return;
    matchStriking = true;
    initAudio();
    playSfx('match-scratch');
    setTimeout(() => playSfx('flame-crackle'), 160);

    if (MATCHSTICK) MATCHSTICK.classList.add('strike');
    if (CAMPING_TABLE) CAMPING_TABLE.classList.add('match-lit');
    if (CHASSIS) CHASSIS.classList.add('match-lit');

    // Värmer upp analoga kretsarna en smula
    const preMatchDrive = currentParams['drive'] || 0.35;
    setParam('drive', Math.min(1.0, preMatchDrive + 0.20), true);

    LCD_NAME.textContent = 'SOLSTICKAN · FLAMMA';
    LCD_VAL.textContent = 'VÄRMER KRETSARNA';

    setTimeout(() => {
      if (MATCHSTICK) MATCHSTICK.classList.remove('strike');
      if (CAMPING_TABLE) CAMPING_TABLE.classList.remove('match-lit');
      if (CHASSIS) CHASSIS.classList.remove('match-lit');
      if (!gasHeaterLit) {
        setParam('drive', preMatchDrive, true);
      }
      matchStriking = false;
      LCD_NAME.textContent = 'SOLSTICKAN';
      LCD_VAL.textContent = 'STICKAN SLOCKNAD';
    }, 3200);
  };

  if (SOLSTICKAN_BOX) SOLSTICKAN_BOX.addEventListener('pointerdown', triggerMatchStrike);
  if (MATCHSTICK) MATCHSTICK.addEventListener('pointerdown', triggerMatchStrike);

  // 7. Weather Badge Toggle
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
  record: toggleRecord,
  rest: recordRest,
  clear: clearAllSteps,
  get isRecording() { return isRecording; },
  get recStep() { return recStep; },
  get activeStep() { return activeStep; },
  get currentStep() { return activeStep; },
  get analyser() { return analyserNode; },
  get audioCtx() { return audioCtx; },
  get isReady() { return isAudioReady; },
  get fingers() { return fingers; }
};

// Bootstrap
async function start() {
  try {
    const res = await fetch('params.json');
    paramsDef = await res.json();
    for (const [k, v] of Object.entries(paramsDef)) {
      currentParams[k] = v.default;
    }
    // Start clean and quiet: rain at 0.0 (Uppehåll)
    currentParams['rain'] = 0.0;
  } catch (e) {
    console.warn('params.json kunde inte laddas, använder grundinställningar');
  }

  setupKnobs();
  setupSequencer();
  setupKeyboard();
  setupRec();
  setupCampingQuirks();
  setupMenu();

  // Initial UI knob positions
  for (const [k, v] of Object.entries(currentParams)) {
    updateKnobDisplay(k, v);
  }
  updateWeatherUI(currentParams['rain'] || 0.0);
  updateVoltmeter(13.8);
  LCD_NAME.textContent = 'KNAUS 3000';
  LCD_VAL.textContent = 'C-MOLL · 116 BPM';

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
