// Host/lifecycle adapter only: all synthesis and effects remain in PlugData.
export class KottdiskEngine {
  constructor() {
    this.context=null; this.node=null; this.pending=null; this.status='idle';
    this.error=null; this.onerror=null; this.diagnostics={};
  }
  get healthy() { return this.status==='ready' && !!this.node && this.context?.state!=='closed'; }
  fail(error) {
    const wasReady=this.status==='ready';
    this.error=error instanceof Error ? error : new Error(String(error));
    this.status='failed'; this.node?.disconnect();
    if (wasReady) this.onerror?.(this.error);
  }
  dispose() {
    const node=this.node, context=this.context;
    this.node=null; this.context=null; this.status='idle';
    if (node) { node.port.postMessage({type:'dispose'}); node.disconnect(); }
    return context && context.state!=='closed' ? context.close().catch(()=>{}) : Promise.resolve();
  }
  async start() {
    if (this.pending) {
      if (this.context?.state!=='running') this.context?.resume().catch(()=>{});
      return this.pending;
    }
    if (this.healthy) { await this.context.resume(); return this; }
    const retired=this.dispose();
    this.status='starting'; this.error=null;
    this.pending=(async()=>{
      try { if (navigator.audioSession) navigator.audioSession.type='playback'; } catch {}
      const AudioContext=window.AudioContext || window.webkitAudioContext;
      const context=this.context=new AudioContext({latencyHint:'interactive'});
      // Must run in the original gesture, before any network await.
      const resumed=context.resume(); resumed.catch(()=>{});
      const response=await fetch(new URL('./worklet.js?v=overhaul-3',import.meta.url),{credentials:'same-origin'});
      if (!response.ok) throw new Error('Ljudmotorn kunde inte hämtas ('+response.status+').');
      const moduleUrl=URL.createObjectURL(new Blob([await response.text()],{type:'text/javascript'}));
      try { await context.audioWorklet.addModule(moduleUrl); }
      finally { URL.revokeObjectURL(moduleUrl); }
      const node=this.node=new AudioWorkletNode(context,'kottdisk',{
        numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],
      });
      const ready=new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Ljudmotorn svarade inte.')),15000);
        const reportError=error=>{clearTimeout(timeout); this.fail(error); reject(this.error);};
        node.port.onmessage=({data})=>{
          if(data.type==='ready'){clearTimeout(timeout);this.diagnostics={...data};resolve();}
          else if(data.type==='health')this.diagnostics={...this.diagnostics,...data};
          else if(data.type==='error')reportError(new Error(data.message));
        };
        node.onprocessorerror=()=>reportError(new Error('Ljudmotorn avbröts. Spela en ton för att starta den igen.'));
      });
      node.connect(context.destination);
      await Promise.all([resumed,ready,retired]);
      this.status='ready'; return this;
    })().catch(async error=>{
      this.fail(error); await this.dispose(); this.status='failed'; throw error;
    }).finally(()=>{this.pending=null;});
    return this.pending;
  }
  send(message) { if(this.healthy)this.node.port.postMessage(message); }
  setParam(name,value) { this.send({type:'param',name,value}); }
  noteOn(note,velocity=100,channel=1) { this.send({type:'midi',bytes:[0x90|((channel-1)&15),note,velocity]}); }
  noteOff(note,channel=1) { this.send({type:'midi',bytes:[0x80|((channel-1)&15),note,0]}); }
  controlChange(cc,value,channel=1) { this.send({type:'midi',bytes:[0xb0|((channel-1)&15),cc,value]}); }
  setTransport(transport) { this.send({type:'transport',...transport}); }
  panic() { this.send({type:'panic'}); }
}
