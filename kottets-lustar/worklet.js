import createKottdiskModule from './kottdisk-engine.js';

// Emscripten's SINGLE_FILE decoder also works in browsers without worklet atob.
if (!globalThis.atob) globalThis.atob = (input) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0, value = 0, output = '';
  for (const char of input.replace(/=+$/, '')) {
    const digit = chars.indexOf(char); if (digit < 0) continue;
    value = (value << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; output += String.fromCharCode((value >> bits) & 255); }
  }
  return output;
};
const names = ['kd_attack','kd_bite','kd_decay','kd_hold','kd_ratio','kd_release',
  'kd_space','kd_sustain','kd_tender','kd_tone','kd_volume','kd_warmth'];

class KottdiskProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.module = null; this.failed = false; this.queued = [];
    this.port.onmessage = ({data}) => this.module ? this.message(data) : this.queued.push(data);
    Promise.resolve(createKottdiskModule({printErr: message => this.port.postMessage({type:'diagnostic', message})})).then(module => {
      this.module = module;
      this.context = module._kd_new(sampleRate);
      if (!this.context) throw new Error('Kunde inte skapa PlugData-motorn.');
      this.buffer = module._malloc(128 * 2 * 4);
      this.offset = this.buffer >>> 2;
      this.output = module.HEAPF32;
      for (const message of this.queued) this.message(message);
      this.queued = [];
      this.port.postMessage({type:'ready', sampleRate, engine:'PlugData/hvcc', wasm:true});
    }).catch(error => { this.failed = true; this.port.postMessage({type:'error', message:String(error)}); });
  }
  message(data) {
    const m = this.module;
    if (data.type === 'param') {
      const index = names.indexOf(data.name);
      if (index >= 0 && Number.isFinite(data.value)) m._kd_param(this.context, index, data.value);
    } else if (data.type === 'midi' && data.bytes?.length >= 3) {
      m._kd_midi(this.context, ...data.bytes.slice(0,3));
    } else if (data.type === 'transport') m._kd_transport(this.context, data.bpm || 120, data.playing ? 1 : 0);
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    if (!this.context || this.failed) return true;
    this.module._kd_process(this.context, this.buffer, 128);
    for (let i = 0; i < 128; i++) {
      channels[0][i] = this.output[this.offset + i*2];
      channels[1][i] = this.output[this.offset + i*2 + 1];
    }
    return true;
  }
}
registerProcessor('kottdisk', KottdiskProcessor);
