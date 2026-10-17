import KaptenEngine from './kapten-engine.js';

// Browser engine outputs: main L/R, kick, snare, hat, sample L/R (as the VST3),
// plus sample-in-mix L/R and effect return L/R for Älskog 3000.
const OUTS = 11;
class KaptenProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ready = false;
    this.parameters=options.processorOptions.parameters;
    this.queue = [];
    this.barriers = [];
    this.peak = 0;
    this.port.onmessage = ({data}) => {
      if(data.type==='alskog-link'){this.alskog=data.port;return;}
      if(data.type==='init'){if(!this.initializing){this.initializing=true;this.initialize(data.wasmBinary);}return;}
      if(data.type==='samples-chunk'){try{this.loadSamples(data.bytes);this.port.postMessage({type:'samples-ack'});}catch(e){this.port.postMessage({type:'error',message:String(e)});}return;}
      if(data.type==='samples-done'){if(this.sampleBytes!==this.engine._runk_pcm_frames()*4){this.port.postMessage({type:'error',message:'Samplebiblioteket är ofullständigt.'});return;}this.ready=true;for(const m of this.queue)this.apply(m);this.queue=[];this.port.postMessage({type:'ready',memoryBytes:this.engine.HEAPF32.buffer.byteLength});return;}
      if (data.type === 'meter') {
        this.port.postMessage({type: 'meter', peak: this.peak});
        this.peak = 0;
      } else if (this.ready) this.apply(data);
      else this.queue.push(data);
    };
  }

  initialize(binary) {
    Promise.resolve().then(() => KaptenEngine({instantiateWasm:(imports,done)=>{const module=new WebAssembly.Module(binary);const instance=new WebAssembly.Instance(module,imports);binary=null;done(instance,module);return instance.exports;},print: () => {}, printErr: (text) => this.port.postMessage({type: 'error', message: String(text)})}))
      .then((engine) => {
        this.engine = engine;
        this.context = engine._hv_kapten_new_with_options(sampleRate, 192, 192, 4);
        if (!this.context) throw new Error('Ljudmotorn kunde inte starta.');
        this.buffer = engine._malloc(128 * OUTS * 4);
        this.sampleBytes=0;this.sampleLow=0;
        this.hashes = {};
        // hv_stringToHash consumes a UTF-8 C string; these names are all ASCII.
        for (const [name, definition] of Object.entries(this.parameters)) {
          const pointer = engine._malloc(name.length + 1);
          const bytes = new Uint8Array(engine.HEAPF32.buffer);
          for (let i = 0; i < name.length; ++i) bytes[pointer + i] = name.charCodeAt(i);
          bytes[pointer + name.length] = 0;
          this.hashes[name] = engine._hv_stringToHash(pointer);
          engine._free(pointer);
          engine._hv_sendFloatToReceiver(this.context, this.hashes[name], definition.default);
        }
        const voices = new Map(['voice_kick','voice_snare','voice_closed_hat','voice_open_hat','voice_future','voice_bank','voice_preset'].map((name,index) => {
          const pointer=engine._malloc(name.length+1);const bytes=new Uint8Array(engine.HEAPF32.buffer);
          for(let i=0;i<name.length;i++) bytes[pointer+i]=name.charCodeAt(i);
          bytes[pointer+name.length]=0;const hash=engine._hv_stringToHash(pointer)>>>0;engine._free(pointer);
          return [hash,index];
        }));
        const hashName=(name)=>{const pointer=engine._malloc(name.length+1);const bytes=new Uint8Array(engine.HEAPF32.buffer);for(let i=0;i<name.length;i++)bytes[pointer+i]=name.charCodeAt(i);bytes[pointer+name.length]=0;const hash=engine._hv_stringToHash(pointer)>>>0;engine._free(pointer);return hash;};
        const views=new Map(Object.keys(this.parameters).filter(name=>/^(kick|snare|closed_hat|open_hat|zzz_future)_step/.test(name)).map(name=>[hashName(`view_${name}`),name]));
        const outputs=Object.fromEntries(['accent_edit','accent_now_done','bank_active','bank_edit','bank_clear_done','last_track','trigger_done','variation_done','fill_done','ratchet_edit','chain_bank','sample_edit_v3','probability_edit','sound_edit','preset_done','chain_playing','chain_edit','chain_editing','chain_capture_count','chain_ready','chain_edit_done'].map(name=>[name,hashName(name)]));
        this.hook = engine.addFunction((context, name, hash, message) => {
          const key=hash>>>0;
          if(views.has(key))this.port.postMessage({type:'view',name:views.get(key),value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.accent_edit)this.port.postMessage({type:'accent-edit',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.accent_now_done)this.port.postMessage({type:'accent-now-done'});
          if(key===outputs.probability_edit)this.port.postMessage({type:'probability-edit',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.sample_edit_v3)this.port.postMessage({type:'sample-edit-v3',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.sound_edit)this.port.postMessage({type:'sound-edit',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.preset_done)this.port.postMessage({type:'preset-done',index:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.chain_playing)this.port.postMessage({type:'chain-playing',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.chain_edit)this.port.postMessage({type:'chain-edit',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.chain_editing)this.port.postMessage({type:'chain-editing',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.chain_capture_count)this.port.postMessage({type:'chain-count',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.chain_ready)this.port.postMessage({type:'chain-ready',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.chain_edit_done)this.port.postMessage({type:'chain-edit-done'});
          if(key===outputs.ratchet_edit)this.port.postMessage({type:'ratchet-edit',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.chain_bank)this.port.postMessage({type:'chain-bank',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.bank_active)this.port.postMessage({type:'bank-active',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.bank_edit)this.port.postMessage({type:'bank-edit',index:engine._hv_msg_getFloat(message,0),value:engine._hv_msg_getFloat(message,1)});
          if(key===outputs.bank_clear_done)this.port.postMessage({type:'clear-done',index:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.last_track)this.port.postMessage({type:'track',value:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.variation_done)this.port.postMessage({type:'variation-done',index:engine._hv_msg_getFloat(message,0)});
          if(key===outputs.trigger_done)this.port.postMessage({type:'trigger-done'});
          if(key===outputs.fill_done)this.port.postMessage({type:'fill-done'});
          if (voices.has(hash >>> 0)) { const voice = voices.get(hash >>> 0); this.port.postMessage({type: 'hit', voice}); if (this.alskog && voice < 2) this.alskog.postMessage(voice); }
          if ((hash >>> 0) === 0x9bbe6593) {
            this.port.postMessage({type: 'step', value: engine._hv_msg_getFloat(message, 0),
                                  timestamp: engine._hv_msg_getTimestamp(message)});
          }
        }, 'viiii');
        engine._hv_setSendHook(this.context, this.hook);
        this.port.postMessage({type:'engine-ready'});
      }).catch(error => this.port.postMessage({type: 'error', message: String(error)}));
  }

  loadSamples(bytes) {
    const frames=this.engine._runk_pcm_frames(),left=this.engine._runk_pcm_left()/4,right=this.engine._runk_pcm_right()/4;
    if(this.sampleBytes+bytes.length>frames*4)throw new Error('Samplebiblioteket är för stort.');
    const heap=this.engine.HEAPF32;
    for(const byte of bytes){
      if((this.sampleBytes&1)===0)this.sampleLow=byte;
      else {const index=this.sampleBytes>>1,value=(this.sampleLow|(byte<<8))<<16>>16;heap[(index<frames ? left : right)+(index%frames)]=value;}
      this.sampleBytes++;
    }
  }

  setUserSamples({capacity,first,slots,library,samples}) {
    // Bank D: user PCM goes after the library in the reserved headroom; the
    // sample IDs first..first+slots-1 and pool_3/pool_count are rewritten.
    const e=this.engine,heap=e.HEAPF32,frames=e._runk_pcm_frames(),left=e._runk_pcm_left()/4,right=e._runk_pcm_right()/4;
    const [offset,length,period,pool,count]=[0,1,2,3,4].map(i=>e._runk_table(i)/4);
    if(!offset||!length||!period||!pool||!count)return;
    for(let id=first;id<first+slots;++id){heap[offset+id]=0;heap[length+id]=0;heap[period+id]=1;}
    const ids=[...library];let position=frames;
    for(const sample of samples){
      const n=sample.left.length;
      if(sample.id<first||sample.id>=first+slots||sample.right.length!==n||position+n+4>frames+capacity)continue;
      heap[left+position]=0;heap[right+position]=0;
      for(let i=0;i<n;++i){heap[left+position+1+i]=sample.left[i];heap[right+position+1+i]=sample.right[i];}
      for(let i=1;i<4;++i){heap[left+position+n+i]=0;heap[right+position+n+i]=0;}
      heap[offset+sample.id]=position+1;heap[length+sample.id]=n;heap[period+sample.id]=n<=1?1:2**Math.ceil(Math.log2(n));
      position+=n+4;ids.push(sample.id);
    }
    for(let i=0;i<Math.max(1,library.length)+slots;++i)heap[pool+i]=ids[i]||0;
    heap[count+3]=Math.max(1,ids.length);
  }

  apply(message) {
    if(message.type==='user-samples'){this.setUserSamples(message);return;}
    if(message.type==='state-barrier'){this.barriers.push(message.id);return;}
    if(message.type==='midi') {
      if(!Number.isInteger(message.pitch) || !Number.isInteger(message.velocity) || !Number.isInteger(message.channel) || message.pitch<0 || message.pitch>127 || message.velocity<0 || message.velocity>127 || message.channel<0 || message.channel>15)return;
      this.engine._hv_sendMessageToReceiverFFF(this.context,0x67e37ca3,0,message.pitch,message.velocity,message.channel);
    }
    if (message.type === 'parameter') {
      const definition = this.parameters[message.name];
      if (!definition || !Number.isFinite(message.value)) return;
      let value = Math.max(definition.min, Math.min(definition.max, message.value));
      if (definition.type !== 'float') value = Math.round(value);
      if (!this.engine._hv_sendFloatToReceiver(this.context, this.hashes[message.name], value))
        this.port.postMessage({type: 'error', message: 'För många parameterändringar samtidigt.'});
    }
  }

  process(inputs, outputs) {
    if (!this.ready) return true;
    const output = outputs[0];
    if (!output || output[0].length !== 128) return true;
    this.engine._hv_processInline(this.context, 0, this.buffer, 128);
    for(const id of this.barriers)this.port.postMessage({type:'state-ready',id});
    this.barriers=[];
    const offset = this.buffer / 4;
    const audio = this.engine.HEAPF32;
    for (let c = 0; c < OUTS; ++c) if (output[c]) output[c].set(audio.subarray(offset + c * 128, offset + (c + 1) * 128));
    for (let i = 0; i < 7 * 128; ++i) this.peak = Math.max(this.peak, Math.abs(audio[offset + i]));
    return true;
  }
}

registerProcessor('kapten', KaptenProcessor);
