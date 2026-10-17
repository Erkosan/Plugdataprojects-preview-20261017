import VulvaEngine from './vulva-engine.js';
if(typeof globalThis.atob!=='function')globalThis.atob=base64=>{const a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',s=base64.replace(/[\s=]/g,'');let b=0,n=0,r='';for(const c of s){const v=a.indexOf(c);if(v<0)throw Error('Invalid WASM encoding');b=b<<6|v;n+=6;if(n>=8){n-=8;r+=String.fromCharCode(b>>n&255);}}return r;};
if(typeof globalThis.performance==='undefined')globalThis.performance={now:()=>currentTime*1000};
class VulvaProcessor extends AudioWorkletProcessor{
 constructor(options){super();this.ready=false;this.pending=[];this.frames=0;this.peak=0;this.lastStep=-2;this.failed=false;
  this.port.onmessage=({data})=>{if(!this.ready){if(this.pending.length<512)this.pending.push(data);}else this.apply(data);};
  Promise.resolve().then(()=>VulvaEngine({print:()=>{},printErr:()=>{}})).then(e=>{
   this.e=e;if(!e._vulva_web_create(sampleRate))throw Error('Kunde inte starta ljudmotorn.');
   this.ready=true;this.apply({type:'parameters',values:options.processorOptions.initial});this.statePointer=e._vulva_web_state()/4;this.audioPointer=e._vulva_web_render()/4;
   this.previous=new Float32Array(156);this.previous.fill(NaN);
   for(const m of this.pending)this.apply(m);this.pending=[];
   this.port.postMessage({type:'ready'});
  }).catch(error=>this.port.postMessage({type:'error',message:String(error.message||error)}));
 }
 apply(m){
  if(m.type==='parameters'&&Array.isArray(m.values)){for(const [id,v] of m.values)if(Number.isInteger(id)&&id>=0&&id<156&&Number.isFinite(v))this.e._vulva_web_set(id,v);}
  else if(m.type==='parameter'&&Number.isInteger(m.id)&&Number.isFinite(m.value))this.e._vulva_web_set(m.id,m.value);
  else if(m.type==='midi'&&Array.isArray(m.bytes)&&m.bytes.length>=3&&m.bytes.every(v=>Number.isInteger(v)&&v>=0&&v<=255))this.e._vulva_web_midi(...m.bytes.slice(0,3));
  else if(m.type==='panic'){this.e._vulva_web_set(57,0);this.e._vulva_web_set(64,0);this.e._vulva_web_set(42,1);}
 }
 process(inputs,outputs){
  const out=outputs[0];if(!this.ready||this.failed||!out||out[0].length!==128)return true;
  try{
   const p=this.e._vulva_web_render()/4,a=this.e.HEAPF32;
   for(let i=0;i<128;++i){const l=a[p+i],r=a[p+128+i];if(!Number.isFinite(l)||!Number.isFinite(r))throw Error('Ljudmotorn gav ett ogiltigt värde.');out[0][i]=l;if(out[1])out[1][i]=r;this.peak=Math.max(this.peak,Math.abs(l),Math.abs(r));}
   const sp=this.e._vulva_web_state()/4,step=a[sp+145];
   if(step!==this.lastStep){this.lastStep=step;this.port.postMessage({type:'position',step,time:currentTime});}
   this.frames+=128;
   if(this.frames>=sampleRate/30){this.frames=0;const changes=[];for(let id=0;id<156;++id){const value=a[sp+id];if(this.previous[id]!==value){this.previous[id]=value;changes.push([id,value]);}}
    this.port.postMessage({type:'state',changes,peak:this.peak});this.peak=0;}
  }catch(error){this.failed=true;for(const channel of out)channel.fill(0);this.port.postMessage({type:'error',message:String(error.message||error)});}
  return true;
 }
}
registerProcessor('vulva',VulvaProcessor);
