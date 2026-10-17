// Host adapter only. The compiled PlugData patch owns every audio sample.
export class KottdiskEngine {
  constructor() { this.context = null; this.node = null; this.pending = null; }
  async start() {
    if (this.pending) {
      // A second real gesture can also unlock a context interrupted during load.
      if (this.context?.state !== 'running') this.context?.resume().catch(() => {});
      return this.pending;
    }
    if (this.node) { await this.context.resume(); return this; }
    this.pending = (async () => {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; }
      catch { /* Optional Safari routing support must not prevent audio startup. */ }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = this.context = new AudioContext({ latencyHint: 'interactive' });
      // Safari requires resume() within the original pointer/key event, before
      // awaiting downloads or compilation. Do not move this below an await.
      const resumed = context.resume();
      resumed.catch(() => {});
      // Fetch in the page's authenticated context. A self-contained worklet has
      // no additional protected module requests from the audio thread.
      const response = await fetch(new URL('./worklet.js?v=audio-2', import.meta.url), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Ljudmotorn kunde inte hämtas (${response.status}).`);
      const moduleUrl = URL.createObjectURL(new Blob([await response.text()], { type: 'text/javascript' }));
      try { await context.audioWorklet.addModule(moduleUrl); }
      finally { URL.revokeObjectURL(moduleUrl); }
      const node = this.node = new AudioWorkletNode(context, 'kottdisk', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      });
      const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Ljudmotorn svarade inte.')), 15000);
        node.port.onmessage = ({data}) => {
          if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
          if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); }
        };
        node.onprocessorerror = () => { clearTimeout(timeout); reject(new Error('Ljudmotorn stannade.')); };
      });
      node.connect(context.destination);
      await Promise.all([resumed, ready]);
      return this;
    })().catch(async error => {
      this.node?.disconnect(); this.node = null;
      await this.context?.close(); this.context = null;
      throw error;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  send(message) { this.node?.port.postMessage(message); }
  setParam(name, value) { this.send({type:'param', name, value}); }
  noteOn(note, velocity = 100, channel = 1) { this.send({type:'midi', bytes:[0x90 | ((channel - 1) & 15), note, velocity]}); }
  noteOff(note, channel = 1) { this.send({type:'midi', bytes:[0x80 | ((channel - 1) & 15), note, 0]}); }
  controlChange(cc, value, channel = 1) { this.send({type:'midi', bytes:[0xb0 | ((channel - 1) & 15), cc, value]}); }
  setTransport(transport) { this.send({type:'transport', ...transport}); }
  panic() { this.controlChange(120, 0, 1); this.controlChange(120, 0, 9); }
}
