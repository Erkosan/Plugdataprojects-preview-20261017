import TvattstugaEngine from './tvattstuga-engine.js';

// AudioWorkletGlobalScope has no atob; Emscripten's embedded WebAssembly needs it once at start.
if (typeof globalThis.atob !== 'function') {
  globalThis.atob = (base64) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0, count = 0, result = '';
    for (const character of base64.replace(/[\s=]/g, '')) {
      const value = alphabet.indexOf(character);
      if (value < 0) throw new Error('Invalid embedded WebAssembly encoding');
      bits = (bits << 6) | value; count += 6;
      if (count >= 8) { count -= 8; result += String.fromCharCode((bits >> count) & 255); }
    }
    return result;
  };
}

const NOTEIN = 0x67e37ca3, CTLIN = 0x41be0f9c, REALTIME = 0x6fff0bcf;
const EVENTS = ['ev_hit', 'ev_step', 'ev_centrifug', 'ev_lapp'];

class TvattstugaProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ready = false;
    this.failed = false;
    this.queue = [];
    this.frames = 0;
    this.blockTime = 0;
    this.peak = 0;
    this.port.onmessage = ({data}) => {
      if (this.ready) this.apply(data);
      else if (this.queue.length < 1024) this.queue.push(data);
    };
    Promise.resolve().then(() => TvattstugaEngine({print: () => {}, printErr: () => {}})).then((engine) => {
      this.engine = engine;
      this.context = engine._hv_tvattstuga_new_with_options(sampleRate, 64, 64, 64);
      if (!this.context) throw new Error('Ljudmotorn kunde inte starta.');
      this.buffer = engine._malloc(128 * 2 * 4);
      const hash = (name) => {
        const pointer = engine._malloc(name.length + 1);
        engine.HEAPU8.set([...name].map((c) => c.charCodeAt(0)), pointer);
        engine.HEAPU8[pointer + name.length] = 0;
        const value = engine._hv_stringToHash(pointer) >>> 0;
        engine._free(pointer);
        return value;
      };
      this.parameters = (options && options.processorOptions && options.processorOptions.parameters) || {};
      this.hashes = {};
      for (const [name, definition] of Object.entries(this.parameters)) {
        this.hashes[name] = hash(name);
        engine._hv_sendFloatToReceiver(this.context, this.hashes[name], definition.default);
      }
      const events = new Map(EVENTS.map((name) => [hash(name), name]));
      this.hook = engine.addFunction((context, name, key, message) => {
        const event = events.get(key >>> 0);
        if (!event) return;
        const values = [];
        for (let i = 0, n = engine._hv_msg_getNumElements(message); i < n; ++i)
          if (engine._hv_msg_isFloat(message, i)) values.push(engine._hv_msg_getFloat(message, i));
        const time = this.blockTime + (engine._hv_msg_getTimestamp(message) - this.frames) / sampleRate;
        this.port.postMessage({type: 'ev', name: event, values, time});
      }, 'viiii');
      engine._hv_setSendHook(this.context, this.hook);
      this.ready = true;
      for (const message of this.queue) this.apply(message);
      this.queue = [];
      this.port.postMessage({type: 'ready'});
    }).catch((error) => this.port.postMessage({type: 'error', message: String(error && error.message || error)}));
  }

  apply(message) {
    const engine = this.engine;
    if (message.type === 'param') {
      const definition = this.parameters[message.name];
      if (!definition || !Number.isFinite(message.value)) return;
      let value = Math.max(definition.min, Math.min(definition.max, message.value));
      if (definition.type !== 'float') value = Math.round(value);
      engine._hv_sendFloatToReceiver(this.context, this.hashes[message.name], value);
    } else if (message.type === 'midi' && Array.isArray(message.bytes) && message.bytes.length >= 3) {
      const [status, a, b] = message.bytes;
      if (![status, a, b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255) || a > 127 || b > 127) return;
      const kind = status & 0xf0, channel = status & 15;
      if (kind === 0x90 || kind === 0x80)
        engine._hv_sendMessageToReceiverFFF(this.context, NOTEIN, 0, a, kind === 0x80 ? 0 : b, channel);
      else if (kind === 0xb0)
        engine._hv_sendMessageToReceiverFFF(this.context, CTLIN, 0, b, a, channel);
    } else if (message.type === 'rt' && [0xf8, 0xfa, 0xfb, 0xfc].includes(message.byte)) {
      engine._hv_sendMessageToReceiverFF(this.context, REALTIME, 0, message.byte, 0);
    } else if (message.type === 'meter') {
      this.port.postMessage({type: 'meter', peak: this.peak});
      this.peak = 0;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!this.ready || this.failed || !output || output[0].length !== 128) return true;
    try {
      this.blockTime = currentTime;
      this.engine._hv_processInline(this.context, 0, this.buffer, 128);
      this.frames += 128;
      const offset = this.buffer / 4, audio = this.engine.HEAPF32;
      for (let i = 0; i < 128; ++i) {
        const l = audio[offset + i], r = audio[offset + 128 + i];
        if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error('Ljudmotorn gav ett ogiltigt värde.');
        output[0][i] = l;
        if (output[1]) output[1][i] = r;
        const a = Math.abs(l);
        if (a > this.peak) this.peak = a;
      }
    } catch (error) {
      this.failed = true;
      for (const channel of output) channel.fill(0);
      this.port.postMessage({type: 'error', message: String(error && error.message || error)});
    }
    return true;
  }
}

registerProcessor('tvattstuga', TvattstugaProcessor);
