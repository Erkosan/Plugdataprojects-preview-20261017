const play = document.querySelector('#play');
const menu = document.querySelector('#menu');

function report(message, error = false) {
  (error ? console.error : console.log)(message);
}

let installPrompt;
const installButton=document.querySelector('#install-app');
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.disabled=false;});
window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.textContent='Appen är installerad';installButton.disabled=true;});
installButton.onclick=async()=>{
  menu.open=false;
  if(matchMedia('(display-mode: standalone)').matches||navigator.standalone){installButton.textContent='Appen är installerad';installButton.disabled=true;return;}
  if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;return;}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  alert(ios?'På iPhone/iPad: tryck Dela och välj ”Lägg till på hemskärmen”.':'Öppna webbläsarens meny och välj ”Installera app” eller ”Lägg till på startskärmen”.');
};
if('serviceWorker' in navigator)navigator.serviceWorker.register(new URL('sw.js',import.meta.url)).catch(()=>{});

async function boot() {
  const response = await fetch('layout.json');
  if (!response.ok) throw new Error('Kunde inte läsa instrumentet. Ladda om sidan.');
  const {parameters, gui, icons, lights: lightLayout, panel, sample_catalog: sampleCatalog, sounds, sound_parameters: soundParameters, midi_map: midiMap, midi_channels: midiChannelConfig} = await response.json();
  const midiMapList = document.querySelector('#midi-map-list');
  const midiControllers = new Map((midiMap || []).map(entry => [`${entry.channel || '*'}:${entry.cc}`, entry]));
  const midiChannels = new Set(midiChannelConfig.voice_channels);
  const allChannels = `CH${midiChannelConfig.shared_channel}, ${Math.min(...midiChannels)}–${Math.max(...midiChannels)}`;
  if (midiMapList && midiMap) midiMapList.innerHTML = midiMap.map(({channel, cc, label}) => `<li><code>${channel ? `CH${channel}` : allChannels} CC${cc}</code> ${label}</li>`).join('');
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
  const geometry = new Map(gui.objects.filter(object => object.parameter).map(object => [object.parameter, object]));
  const readout = document.querySelector('#readout');
  const lampStyles = new Map(panel.lamps.map(light => [`${light.x},${light.y}`,light]));
  function lampColor(element, light) {
    element.style.setProperty('--lamp-background',light.background);
    element.style.setProperty('--lamp-foreground',light.foreground);
  }
  const labels = new Map();
  let selected;
  function describe(name) {
    selected = name;
    readout.textContent = name==='zzzzzzzzzz_chain_edit' || name==='zzzz_bank' ? Array.from({length:chainEditing ? chainCapture.length : values.zzzzzzzzz_chain_length},(_,i)=>values[`zzzzzzzzz_chain_${String(i+1).padStart(2,'0')}`]).join('>') : panel.labels[name] || labels.get(name) || name;
    document.querySelector('#readout-value').textContent = name==='zzzzzzzzzz_chain_edit' || name==='zzzz_bank' ? (chainEditing ? 'REC' : values.zzzzzzzzz_chain_on ? 'PLAY' : '') : String(Number(values[name].toPrecision(3)));
  }
  function position(element, object) {
    const {x, y} = object.position;
    Object.assign(element.style, {left: `${x}px`, top: `${y}px`, width: `${object.size.x}px`, height: `${object.size.y}px`});
    if (object.bg_color) element.style.setProperty('--control-color', object.bg_color);
    if (object.arc_color) element.style.setProperty('--arc-color', object.arc_color);
    if (object.fg_color) element.style.setProperty('--pointer-color', object.fg_color);
  }
  const values = Object.fromEntries(Object.entries(parameters).map(([name, p]) => [name, p.default]));
  const controls = new Map();
  const tracks=['kick','snare','closed_hat','open_hat','zzz_future'];
  const fillMasks=[4369,4112,48059,17476,16384];
  function paintRows() {
    for(const pad of pads) {
      pad.classList.toggle('selected-track',Number(pad.dataset.track)===lastTrack);
      const excluded=Number(pad.dataset.step)>=values.zzzzzzz_length;
      pad.classList.toggle('outside-length',excluded);
      const row=Number(pad.dataset.track),step=Number(pad.dataset.step),packName=`zzzzzzzzz_rpack_${String(row*16+activeBank*2+Math.floor(step/8)).padStart(2,'0')}`,count=1+((values[packName]>>(2*(step%8)))&3);
      pad.dataset.ratchet=String(count);
      pad.dataset.accent=String((values[accentNames[row*8+activeBank]]>>step)&1);
      pad.dataset.probability=String(100-(Math.floor(values[probabilityNames[row*64+activeBank*8+Math.floor(step/2)]]/(128**(step%2)))%128));
      pad.style.setProperty('--ratchet-marks',count>1 ? `${count*4.2}px` : '0px');
      const sampleID=row===4 ? Math.floor(values[sampleNames[values.zzzzzzzzzzz_sample_bank*64+activeBank*8+Math.floor(step/2)]]/(256**(step%2)))%256 : 0;
      pad.dataset.sample=String(sampleID);
      pad.title=excluded ? 'Utanför vald längd – lagras till senare' : `Ratchet: ${count} slag${row===4 ? ` · Sample ${sampleID || 1}` : ''}`;
    }
    patch.dataset.track=String(lastTrack);
    patch.dataset.length=String(values.zzzzzzz_length);
  }
  const stepNames=tracks.flatMap(track=>Array.from({length:16},(_,i)=>`${track}_step${String(i+1).padStart(2,'0')}`));
  const storageNames=tracks.flatMap(track=>Array.from({length:8},(_,i)=>`zzzzz_pattern_${track}_b${String(i+1).padStart(2,'0')}`));
  const ratchetNames=Array.from({length:80},(_,i)=>`zzzzzzzzz_rpack_${String(i).padStart(2,'0')}`);
  const clearNames=['zzzz_clear',...tracks.map(track=>`zzzz_clear_${track}`)];
  let activeBank=0,lastTrack=0,midiAccess,chainEditing=false,chainCapture=[];
  const sampleNames=Array.from({length:256},(_,i)=>`zzzzzzzzzzz_samplepack_${String(i).padStart(3,'0')}`);
  const probabilityNames=Array.from({length:320},(_,i)=>`zzzzzzzzzzzz_probability_${String(i).padStart(3,'0')}`);
  const legacySampleNames=Array.from({length:32},(_,i)=>`zzzzzzzzzz_spack_${String(i).padStart(2,'0')}`);
  const accentNames=Array.from({length:40},(_,i)=>`zzzzzzzzzzzz_accent_${String(i).padStart(2,'0')}`);
  const holds=['roll','fill','skip','random'].map(x=>`zzzzzzzzzzz_perf_${x}`);
  const presetNames=['clean','hard','dub','metal','sub','acid','dust','clang','break'].map(x=>`zzzzzzzzzzz_preset_${x}`);
  function chooseSample(){const ids=bankIds(values.zzzzzzzzzzz_sample_bank);return ids[Math.floor(Math.random()*ids.length)] || 0;}
  // Bank D: the user's own samples, kept in IndexedDB and written into the engine's
  // reserved sample IDs (sample_catalog.user) by the worklet.
  const userBank=sampleCatalog.user;let userSamples=[];
  const isUserId=id=>!!userBank&&id>=userBank.first_id&&id<userBank.first_id+userBank.slots;
  function bankIds(bank){const ids=sampleCatalog.banks[bank].ids;return userBank&&bank===userBank.bank?[...ids,...userSamples.map(s=>userBank.first_id+s.slot)]:ids;}
  function userDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('runkinator-user-samples',1);r.onupgradeneeded=()=>r.result.createObjectStore('samples',{keyPath:'slot'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function userStore(mode,action){const db=await userDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('samples',mode),r=action(tx.objectStore('samples'));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
  const userFramesUsed=()=>userSamples.reduce((sum,s)=>sum+s.left.length+4,0);
  function sendUserSamples(){if(!node||!userBank)return;node.port.postMessage({type:'user-samples',capacity:userBank.frames,first:userBank.first_id,slots:userBank.slots,library:sampleCatalog.banks[userBank.bank].ids,samples:userSamples.map(s=>({id:userBank.first_id+s.slot,left:s.left,right:s.right}))});}
  async function loadUserSamples(){if(!userBank)return;try{const rows=await userStore('readonly',store=>store.getAll());userSamples=(rows||[]).filter(r=>Number.isInteger(r.slot)&&r.slot>=0&&r.slot<userBank.slots&&r.left instanceof Int16Array&&r.right instanceof Int16Array&&r.left.length===r.right.length).sort((a,b)=>a.slot-b.slot);sendUserSamples();paintUserSamples();}catch{}}
  function kWeightedLoudness(channels){
    // BS.1770 at 48 kHz, same filters and gating as tools/prepare_samples.py.
    const filter=(x,b,a)=>{const y=new Float64Array(x.length);let x1=0,x2=0,y1=0,y2=0;for(let i=0;i<x.length;++i){const v=b[0]*x[i]+b[1]*x1+b[2]*x2-a[0]*y1-a[1]*y2;y[i]=v;x2=x1;x1=x[i];y2=y1;y1=v;}return y;};
    const weighted=channels.map(c=>filter(filter(c,[1.53512485958697,-2.69169618940638,1.19839281085285],[-1.69065929318241,.73248077421585]),[1,-2,1],[-1.99004745483398,.99007225036621]));
    const count=weighted[0].length,window=Math.min(count,19200),energies=[];
    for(let start=0;start<Math.max(1,count-window+1);start+=4800){let e=0;for(const c of weighted){let sum=0;for(let i=start;i<start+window;++i)sum+=c[i]*c[i];e+=sum/window;}energies.push(e);}
    const absolute=energies.filter(e=>e>10**((-70+.691)/10));
    if(!absolute.length)return -.691+10*Math.log10(Math.max(energies.reduce((a,b)=>a+b,0)/energies.length,1e-30));
    const relative=absolute.reduce((a,b)=>a+b,0)/absolute.length*.1,gated=absolute.filter(e=>e>=relative);
    return -.691+10*Math.log10(gated.reduce((a,b)=>a+b,0)/gated.length);
  }
  async function addUserSample(file){
    if(!userBank)throw new Error('Egna samples stöds inte i den här versionen.');
    const slot=Array.from({length:userBank.slots},(_,i)=>i).find(i=>!userSamples.some(s=>s.slot===i));
    if(slot===undefined)throw new Error(`Bank D är full (${userBank.slots} samples).`);
    if(file.size>64*1048576)throw new Error('Filen är för stor.');
    let audio;try{audio=await new OfflineAudioContext(2,1,48000).decodeAudioData(await file.arrayBuffer());}catch{throw new Error('Kunde inte läsa ljudfilen.');}
    const channels=[audio.getChannelData(0),audio.getChannelData(audio.numberOfChannels>1?1:0)],frames=channels[0].length;
    if(!frames)throw new Error('Ljudfilen är tom.');
    if(userFramesUsed()+frames+4>userBank.frames)throw new Error(`Inte plats: Bank D rymmer ${userBank.frames/48000} s totalt.`);
    let peak=0;for(const c of channels)for(const v of c)peak=Math.max(peak,Math.abs(v));
    if(peak<1e-8)throw new Error('Ljudfilen är tyst.');
    const gain=Math.min(10**((userBank.target_lufs-kWeightedLoudness(channels))/20),.89/peak);
    const [left,right]=channels.map(c=>Int16Array.from(c,v=>Math.round(Math.max(-1,Math.min(1,v*gain))*32767)));
    const record={slot,name:file.name.replace(/\.[^.]+$/,'').slice(0,40)||`Sample ${slot+1}`,left,right};
    await userStore('readwrite',store=>store.put(record));
    userSamples=[...userSamples,record].sort((a,b)=>a.slot-b.slot);sendUserSamples();paintUserSamples();report(`${record.name} ligger i Bank D`);
  }
  async function removeUserSample(slot){await userStore('readwrite',store=>store.delete(slot));userSamples=userSamples.filter(s=>s.slot!==slot);sendUserSamples();paintUserSamples();}
  function paintUserSamples(){
    const list=document.querySelector('#user-samples-list');if(!list||!userBank)return;list.replaceChildren();
    for(const s of userSamples){const li=document.createElement('li'),name=document.createElement('span'),time=document.createElement('code'),remove=document.createElement('button');name.textContent=s.name;time.textContent=`${(s.left.length/48000).toFixed(2)} s`;remove.type='button';remove.textContent='✕';remove.setAttribute('aria-label',`Ta bort ${s.name}`);remove.onclick=()=>void removeUserSample(s.slot).catch(error=>report(error.message,true));li.append(time,name,remove);list.append(li);}
    document.querySelector('#user-samples-space').textContent=`${userSamples.length}/${userBank.slots} · ${(Math.max(0,userBank.frames-userFramesUsed())/48000).toFixed(1)} s kvar`;
  }
  function releaseHolds(){for(const name of holds)if(values[name])update(name,0);}
  function paintChain() {
    const count=chainEditing ? chainCapture.length : values.zzzzzzzzz_chain_length;
    const order=Array.from({length:count},(_,i)=>values[`zzzzzzzzz_chain_${String(i+1).padStart(2,'0')}`]).join(' > ');
    const el=document.querySelector('#chain-order');if(el){el.textContent=chainEditing ? (order ? `REC ${order}` : 'Välj banker…') : `${values.zzzzzzzzz_chain_on ? 'PLAY  ' : ''}${order}`;el.classList.toggle('recording',chainEditing);}
    if(selected==='zzzzzzzzzz_chain_edit' || selected==='zzzz_bank')describe(selected);
    const edit=controls.get('zzzzzzzzzz_chain_edit');if(edit){edit.setAttribute('aria-pressed',String(chainEditing));edit.title=chainEditing ? 'Tryck igen för att spela bankkedjan' : 'Tryck och välj banker i ordning';}
  }
  function localChainEdit() {
    chainEditing=!chainEditing;
    if(chainEditing){chainCapture=[];update('zzzzzzzzz_chain_on',0);}
    else if(chainCapture.length){update('zzzzzzzzz_chain_length',chainCapture.length);update('zzzzzzzzz_chain_on',1);}
    paintChain();
  }
  function paintBank() {
    for(const button of document.querySelectorAll('[data-bank]')) {
      const index=Number(button.dataset.bank);button.setAttribute('aria-checked',String(index===activeBank));
      button.classList.toggle('pending',index===values.zzzz_bank && index!==activeBank);
    }

  }
  function localBank(index) {
    activeBank=index;
    for(let row=0;row<5;row++)for(let step=0;step<16;step++) update(stepNames[row*16+step],(values[storageNames[row*8+index]]>>step)&1,true);
    paintBank();paintRows();
  }
  const lights = [];
  const pads = [];
  const patch = document.querySelector('#patch');

  let context, node, ready = false, starting, meterTimer;
  let stateSequence=0;
  const stateWaiters=new Map();
  function stateApplied(){
    return new Promise((resolve,reject)=>{
      const id=++stateSequence;
      const timer=setTimeout(()=>{stateWaiters.delete(id);reject(new Error('Ljudmotorn svarade inte på återläsningen.'));},10000);
      stateWaiters.set(id,()=>{clearTimeout(timer);stateWaiters.delete(id);resolve();});
      node.port.postMessage({type:'state-barrier',id});
    });
  }
  let zoom = 1;

  function resize() {
    const scroll = document.querySelector('.patch-scroll');
    const width = scroll.clientWidth;
    // Preserve the patch's coordinates, including on narrow screens. Small
    // screens scroll the panel rather than rearranging or stretching knobs.
    // The panel dimensions are authored in kapten.pd and exported in layout.json.
    // Only reserve the safe edge around the instrument: the header is an overlay,
    // not a row that should shrink the playable canvas.
    zoom = Math.max(.3, Math.min(2, width / panel.width, (window.innerHeight-24) / panel.height));
    patch.style.transform = `scale(${zoom})`;
    patch.dataset.zoom = String(zoom);
    const viewport = document.querySelector('#patch-viewport');
    viewport.style.width = `${panel.width * zoom}px`;
    viewport.style.height = `${panel.height * zoom}px`;
  }
  Object.assign(patch.style, {width: `${panel.width}px`,height: `${panel.height}px`,backgroundColor:'transparent',backgroundImage:'none',backgroundSize:'cover',backgroundPosition:'center'});
  document.body.style.backgroundImage='url(Background.png)';
  window.addEventListener('resize',resize);

  new ResizeObserver(resize).observe(document.querySelector('.patch-scroll'));
  new ResizeObserver(resize).observe(patch);

  function displayValue(name, value) {
    if (name.endsWith('_pan')) {
      return value === .5 ? 'Mitten' : `${Math.round(Math.abs(value - .5) * 200)} % ${value < .5 ? 'vänster' : 'höger'}`;
    }
    return `${Math.round(value * 100)} %`;
  }

  function update(name, value, internal = false) {
    const p = parameters[name];
    if (!p || !Number.isFinite(value)) return;
    if(name==='zzzzzzzz_sync' || name==='zzzzzzzzz_ratchet_live' || name==='zzzzzzzzzzz_perf_late')value=0;
    value = Math.max(p.min, Math.min(p.max, value));
    if (p.type !== 'float') value = Math.round(value);
    if(name==='zzzz_bank' && !internal && chainEditing) {
      if(ready)node.port.postMessage({type:'parameter',name,value});
      else if(chainCapture.length<8){chainCapture.push(value+1);values[`zzzzzzzzz_chain_${String(chainCapture.length).padStart(2,'0')}`]=value+1;values.zzzzzzzzz_chain_length=chainCapture.length;paintChain();}
      return;
    }
    if(name==='zzzzzzzzzz_chain_edit' && value>0 && !internal && !ready){localChainEdit();return;}
    if(name==='zzzz_bank' && !internal && !chainEditing)update('zzzzzzzzz_chain_on',0);
    values[name] = value;
    if(!internal && stepNames.includes(name)) {
      const slot=stepNames.indexOf(name),row=Math.floor(slot/16),bit=1<<(slot%16),maskName=storageNames[row*8+activeBank];
      const changed=Boolean(values[maskName]&bit)!==Boolean(value);
      if(!ready && changed){const an=accentNames[row*8+activeBank];values[an]=value && values.zzzzzzzzzzz_accent ? values[an]|bit : values[an]&~bit;}
      if(!ready && changed){const pi=row*64+activeBank*8+Math.floor((slot%16)/2),power=128**(slot%2),old=values[probabilityNames[pi]],digit=Math.floor(old/power)%128;values[probabilityNames[pi]]=old+((value ? 100-values.zzzzzzzzzzz_chance : 0)-digit)*power;}
      if(!ready && changed) {const ri=row*16+activeBank*2+Math.floor((slot%16)/8),power=4**(slot%8),old=values[ratchetNames[ri]],digit=Math.floor(old/power)%4;values[ratchetNames[ri]]=old+((value ? values.zzzzzzzz_ratchet-1 : 0)-digit)*power;}
      if(!ready && row===4) {
        for(let variant=0;variant<4;variant++)if(!value || variant===values.zzzzzzzzzzz_sample_bank){
          const pack=sampleNames[variant*64+activeBank*8+Math.floor((slot%16)/2)],power=256**(slot%2),old=values[pack],digit=Math.floor(old/power)%256;
          const id=value ? (digit || chooseSample()) : 0;values[pack]=old+(id-digit)*power;
        }
      }
      const before=values[maskName];values[maskName]=value ? (before|bit) : (before&~bit);
      if(values[maskName]!==before) {lastTrack=row;values.zzzzzz_focus=row;}
      paintRows();
    }
    if(!internal && clearNames.includes(name) && value>0 && !ready) {
      const rows=name==='zzzz_clear' ? [0,1,2,3,4] : [tracks.indexOf(name.slice('zzzz_clear_'.length))];
      for(const row of rows) { values[accentNames[row*8+activeBank]]=0; if(row===4)for(let variant=0;variant<4;variant++)for(let i=0;i<8;i++)values[sampleNames[variant*64+activeBank*8+i]]=0;for(let pair=0;pair<8;pair++)values[probabilityNames[row*64+activeBank*8+pair]]=0;values[ratchetNames[row*16+activeBank*2]]=0;values[ratchetNames[row*16+activeBank*2+1]]=0;values[storageNames[row*8+activeBank]]=0;for(let step=0;step<16;step++)update(stepNames[row*16+step],0,true); }
    }
    if(!internal && (/^(?:zzzzzzz_fx_)?(kick|snare|hat)_/.test(name) || stepNames.includes(name))) {
      if(!stepNames.includes(name)) { const voice=name.match(/^(?:zzzzzzz_fx_)?(kick|snare|hat)_/)[1];lastTrack=voice==='kick' ? 0 : voice==='snare' ? 1 : name==='hat_open_decay' ? 3 : 2; }
      values.zzzzzz_focus=lastTrack;
      if(node)node.port.postMessage({type:'parameter',name:'zzzzzz_focus',value:lastTrack});
    }
    if(!internal && presetNames.includes(name) && value>0 && !ready){const focus=lastTrack;for(const [key,v] of Object.entries(sounds[name.slice('zzzzzzzzzzz_preset_'.length)]))update(key,v);update('zzzzzz_focus',focus);}
    if(name==='zzzzzz_focus') {lastTrack=value;paintRows();for(const b of document.querySelectorAll('[data-track-choice]'))b.setAttribute('aria-checked',String(Number(b.dataset.trackChoice)===lastTrack));}
    if(name==='zzzz_bank') { if(!ready) localBank(value);else paintBank(); }
    if (selected === name) describe(name);
    const element = controls.get(name);
    if (element) {
      if (element.classList.contains('knob')) {
        const portion = (value - p.min) / (p.max - p.min);
        element.style.setProperty('--angle', `${-135 + 270 * portion}deg`);
        element.style.setProperty('--sweep', `${270 * portion}deg`);
        element.setAttribute('aria-valuenow', value);
        element.setAttribute('aria-valuetext', displayValue(name, value));
        element.parentElement.querySelector('output').textContent = String(Math.round(portion * 100));
      } else if (name==='zzzz_bank') { paintBank();
      } else if ((name.startsWith('ui_extra_') || name.startsWith('zzzzzzz_var_') || name==='zzzzzzzzz_ratchet_live' || name==='zzzzzzzzz_chain_on' || name==='zzzzzzzzzz_chain_edit' || name==='zzzzzzzzzzz_accent' || presetNames.includes(name) || holds.includes(name))) { element.setAttribute('aria-pressed',String(Boolean(value)));
      } else if (element.classList.contains('step') || element.classList.contains('track-control')) {
        element.setAttribute('aria-pressed', String(Boolean(value)));
      } else if (name !== 'start') {
        element.value = value;
        if (name !== 'bpm') element.setAttribute('aria-valuetext', displayValue(name, value));
      }
    }
    if(name==='zzzzzzzz_space_mode')for(const b of document.querySelectorAll('[data-space-mode]'))b.setAttribute('aria-checked',String(Number(b.dataset.spaceMode)===value));
    if (node && !internal) node.port.postMessage({type: 'parameter', name, value});
    if(name==='zzzzzzz_length' || ratchetNames.includes(name) || sampleNames.includes(name) || probabilityNames.includes(name) || (clearNames.includes(name) && value>0))paintRows();
    if(name.startsWith('zzzzzzzzz_chain_'))paintChain();
    if(name==='zzzzzzzzzzz_sample_bank'){paintRows();for(const b of document.querySelectorAll('[data-sample-bank]'))b.setAttribute('aria-checked',String(Number(b.dataset.sampleBank)===value));}
    if(presetNames.includes(name) && value>0)update(name,0,true);
    if(name==='zzzzzzzzzz_chain_edit' && value>0)update(name,0,true);
    if(name==='zzzzzzzz_fill' && value>0)update(name,0,true);
    if(!internal && clearNames.includes(name) && value>0) update(name,0,true);
    if(!internal && name.startsWith('zzzzzzz_var_') && value>0) update(name,0,true);
    if(name==='zzzz_trigger' && value>0) update(name,0,true);
    if (name === 'start') {
      play.setAttribute('aria-pressed', String(Boolean(value)));
      play.setAttribute('aria-label', value ? 'Stoppa' : 'Spela');
      document.querySelector('#play-label').textContent = value ? 'Stoppa' : 'Spela';
      if (!value) showStep(-1);
    }
  }

  function showStep(value) {
    const step = Number.isInteger(value) && value >= 0 && value < 16 ? value : -1;
    for (const light of lights) light.classList.toggle('active', Number(light.dataset.step) === step);
    for (const pad of pads) pad.classList.toggle('current', Number(pad.dataset.step) === step);
    patch.dataset.step = String(step);
    document.querySelector('#position').textContent = step < 0 ? `${values.zzzzzzz_length} steg` : `${String(step + 1).padStart(2, '0')} / ${values.zzzzzzz_length}`;
  }

  function bindNumericAdjustment(input, name) {
    const parameter = parameters[name];
    const step = Number(input.step) || (parameter.type === 'float' ? (parameter.max - parameter.min) / 100 : 1);
    input.style.touchAction = 'none';
    let drag;
    const commit = value => update(name, value);
    input.addEventListener('wheel', event => {
      event.preventDefault();
      commit(values[name] + (event.deltaY < 0 ? step : -step));
    }, {passive: false});
    input.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = {y: event.clientY, initial: values[name], id: event.pointerId, moved: false};
      input.setPointerCapture(event.pointerId);
    });
    input.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const ticks = Math.round((drag.y - event.clientY) / 10);
      if (ticks) {
        drag.moved = true;
        commit(drag.initial + ticks * step);
        event.preventDefault();
      }
    });
    const release = () => { drag = null; };
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    input.addEventListener('lostpointercapture', release);
  }

  function bindSliderAdjustment(input, name) {
    const p = parameters[name];
    input.style.touchAction = 'none';
    let drag;
    input.addEventListener('wheel', event => {
      event.preventDefault();
      update(name, values[name] + (event.deltaY < 0 ? 1 : -1) * (p.max - p.min) / 100);
    }, {passive: false});
    input.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      input.focus();
      // Horizontal sliders drag left/right across their own width; vertical ones drag up/down.
      const rect = input.getBoundingClientRect();
      drag = {x: event.clientX, y: event.clientY, initial: values[name], id: event.pointerId, zoom, horizontal: rect.width >= rect.height, width: Math.max(rect.width, 1)};
      input.setPointerCapture(event.pointerId);
    });
    input.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      const travel = drag.horizontal ? (event.clientX - drag.x) / drag.width : (drag.y - event.clientY) / (150 * drag.zoom);
      update(name, drag.initial + travel * (p.max - p.min));
    });
    const release = () => { drag = null; };
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    input.addEventListener('lostpointercapture', release);
  }

  function register(element, name) {
    if (!parameters[name]) throw new Error(`Instrumentet saknar kontrollen ${name}.`);
    element.dataset.parameter = name;
    element.id ||= `control-${name}`;
    controls.set(name, element);
    if (!name.includes('_step')) {
      labels.set(name, element.getAttribute('aria-label') || name);
      element.addEventListener('pointerenter', () => describe(name));
      element.addEventListener('focus', () => describe(name));
      element.addEventListener('input', () => describe(name));
    }
    update(name, values[name]);
    return element;
  }

  const voices = [
    {key: 'kick', title: 'Kick', knobs: [
      ['kick_pitch', 'Tonhöjd'], ['kick_base_pitch', 'Grundton'],
      ['kick_pitch_decay', 'Tonfall'], ['kick_tone', 'Klang'],
      ['kick_click', 'Klick'], ['kick_click_decay', 'Klicklängd'],
      ['kick_amp_decay', 'Längd'], ['kick_drive', 'Drive'],
    ]},
    {key: 'snare', title: 'Snare', knobs: [
      ['snare_body_pitch', 'Tonhöjd'], ['snare_body', 'Kropp'],
      ['snare_noise', 'Brus'], ['snare_crack_amount', 'Smäll'],
      ['snare_body_decay', 'Längd'], ['snare_noise_decay', 'Bruslängd'],
      ['snare_tone', 'Klang'], ['snare_drive', 'Drive'],
    ]},
    {key: 'hat', title: 'Hi-hat', knobs: [
      ['hat_metal', 'Metall'], ['hat_metal_pitch', 'Tonhöjd'], ['hat_noise', 'Brus'],
      ['hat_tone', 'Klang'], ['hat_closed_decay', 'Sluten längd'], ['hat_open_decay', 'Öppen längd'],
    ]},
    {key: 'fx', title: 'Effekter', knobs: Object.keys(parameters)
      .filter(name=>(name.startsWith('zzzzzzz_fx_') || ['zzzzzzzzzzz_sample_pan','zzzzzzzzzzz_sample_drive_send','zzzzzzzzzzz_sample_space_send','zzzzzzzzzzz_reverb'].includes(name)) && geometry.get(name)?.type==='knob')
      .map(name=>[name,panel.labels[name] || name])},
  ];

  for (const voice of voices) {
    const section = document.createElement('section');
    section.className = `voice ${voice.key}`;
    section.setAttribute('aria-label',voice.title);
    const knobs = document.createElement('div'); knobs.className = 'knobs';
    for (const [name, label] of voice.knobs) {
      const wrapper = document.createElement('div'); wrapper.className = 'knob-control';
      const knob = document.createElement('button'); knob.type = 'button'; knob.className = 'knob';
      const p = parameters[name];
      knob.setAttribute('role', 'slider');
      knob.setAttribute('aria-label', `${voice.title}: ${label}`);
      knob.setAttribute('aria-valuemin', p.min); knob.setAttribute('aria-valuemax', p.max);
      const output = document.createElement('output'); output.className = 'knob-value'; output.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('label'); caption.textContent = label;
      knob.innerHTML = '<svg viewBox="0 0 50 50" aria-hidden="true"><path class="knob-track" d="M 12 38 A 18 18 0 1 1 38 38"/><line class="knob-pointer" x1="25" y1="25" x2="25" y2="9"/></svg>';
      wrapper.append(knob, output, caption);
      position(wrapper, geometry.get(name));
      register(knob, name); caption.htmlFor = knob.id;
      let drag;
      knob.onpointerdown = event => {
        if (event.button !== 0) return;
        describe(name);
        drag = {y: event.clientY, initial: values[name], zoom};
        knob.setPointerCapture(event.pointerId);
        wrapper.classList.add('dragging');
      };
      knob.onpointermove = event => {
        if (drag) update(name, drag.initial + (drag.y - event.clientY) / (150 * drag.zoom) * (p.max - p.min));
      };
      const release = () => { drag = null; wrapper.classList.remove('dragging'); };
      knob.onpointerup = knob.onpointercancel = knob.onlostpointercapture = release;
      knob.ondblclick = () => update(name, p.default);
      knob.onwheel = event => {
        event.preventDefault();
        update(name, values[name] + (event.deltaY < 0 ? 1 : -1) * (p.max - p.min) / 100);
      };
      knob.onkeydown = event => {
        const direction = {ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10}[event.key];
        if (direction || ['Home', 'End'].includes(event.key)) {
          event.preventDefault();
          update(name, event.key === 'Home' ? p.min : event.key === 'End' ? p.max : values[name] + direction * (p.max - p.min) / 100);
        }
      };
      knobs.append(wrapper);
    }
    section.append(knobs);
    if (voice.key==='fx') { document.querySelector('#voices').append(section); continue; }
    const mix = document.createElement('div'); mix.className = 'mix';
    for (const [suffix, label] of [['level', 'Nivå'], ['pan', 'Panorering']]) {
      const name = `${voice.key}_${suffix}`, p = parameters[name];
      const caption = document.createElement('label'); caption.textContent = label;
      const input = document.createElement('input'); input.type = 'range';
      input.min = p.min; input.max = p.max; input.step = .001;
      input.setAttribute('aria-label', `${voice.title}: ${label}`);
      input.oninput = () => update(name, input.valueAsNumber);
      const object = geometry.get(name);
      position(caption, object);
      caption.classList.add(object.type === 'vslider' ? 'vertical' : 'horizontal');
      input.setAttribute('aria-orientation', object.type === 'vslider' ? 'vertical' : 'horizontal');
      const text = document.createElement('span'); text.textContent = label;
      caption.textContent = ''; caption.append(text, input);
      register(input, name); bindSliderAdjustment(input, name); mix.append(caption);
    }
    section.append(mix); document.querySelector('#voices').append(section);
  }

  const fxMix=document.createElement('div');fxMix.className='mix fx-mix';
  for(const name of Object.keys(parameters).filter(name=>name.startsWith('zzzzzzz_fx_') || ['zzzzzzzzzz_sample_level','zzzzzzzzzzz_sample_pan','zzzzzzzzzzz_sample_drive_send','zzzzzzzzzzz_sample_space_send'].includes(name))) {
    const object=geometry.get(name),p=parameters[name];
    if (object.type==='knob') continue;
    const wrapper=document.createElement('label');wrapper.className=object.type==='vslider' ? 'vertical' : 'horizontal';position(wrapper,object);
    const input=document.createElement('input');input.type='range';input.min=p.min;input.max=p.max;input.step=.001;
    input.setAttribute('aria-label',panel.labels[name]);input.setAttribute('aria-orientation',object.type==='vslider' ? 'vertical' : 'horizontal');
    input.oninput=()=>update(name,input.valueAsNumber);register(input,name);bindSliderAdjustment(input,name);wrapper.append(input);fxMix.append(wrapper);
  }
  patch.append(fxMix);
  const length=document.createElement('input');length.type='number';length.min=1;length.max=16;length.step=1;
  length.className='length-control';length.setAttribute('aria-label','Sekvenslängd i sextondelar');
  position(length,geometry.get('zzzzzzz_length'));register(length,'zzzzzzz_length');
  length.onchange=()=>update('zzzzzzz_length',Number.isFinite(length.valueAsNumber) ? length.valueAsNumber : values.zzzzzzz_length);
  bindNumericAdjustment(length,'zzzzzzz_length');
  patch.append(length);
  const ratchet=document.createElement('input');ratchet.type='number';ratchet.min=1;ratchet.max=4;ratchet.step=1;
  ratchet.className='length-control';ratchet.setAttribute('aria-label','Ratchet: antal slag per steg');
  position(ratchet,geometry.get('zzzzzzzz_ratchet'));register(ratchet,'zzzzzzzz_ratchet');
  ratchet.onchange=()=>update('zzzzzzzz_ratchet',Number.isFinite(ratchet.valueAsNumber) ? ratchet.valueAsNumber : 1);bindNumericAdjustment(ratchet,'zzzzzzzz_ratchet');patch.append(ratchet);
  for(const name of ['zzzzzzzzz_swing']) {
    const input=document.createElement('input');input.type='number';input.className='length-control';
    input.min=parameters[name].min;input.max=parameters[name].max;input.step=1;input.setAttribute('aria-label',panel.labels[name]);
    position(input,geometry.get(name));register(input,name);input.onchange=()=>update(name,Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : values[name]);bindNumericAdjustment(input,name);patch.append(input);
  }
  for(const [name,label] of [['zzzzzzzzzz_chain_edit','CHAIN']]) {
    const button=document.createElement('button');button.type='button';button.innerHTML=icon(name);
    button.setAttribute('aria-label',panel.labels[name]);button.className='extra-control';
    position(button,geometry.get(name));register(button,name);button.onclick=()=>update(name,name==='zzzzzzzzzz_chain_edit' ? 1 : values[name] ? 0 : 1);patch.append(button);
  }
  const order=document.createElement('output');order.id='chain-order';order.hidden=true;patch.append(order);paintChain();
  const trackChoice=document.createElement('div');trackChoice.className='banks track-choice';trackChoice.setAttribute('role','radiogroup');trackChoice.setAttribute('aria-label','Välj spår');position(trackChoice,geometry.get('zzzzzz_focus'));register(trackChoice,'zzzzzz_focus');if(geometry.get('zzzzzz_focus').size.y>geometry.get('zzzzzz_focus').size.x)trackChoice.style.flexDirection='column';
  for(const [i,label] of ['Kick','Snare','Closed hat','Open hat','Samples'].entries()){const b=document.createElement('button');b.type='button';b.textContent='';b.style.background=(geometry.get(['kick_level','snare_level','hat_level','open_hat_step01','zzzzzzzzzz_sample_level'][i])?.bg_color)||['#c14955','#e0c635','#9caae4','#7fa8d8','#b68ed9'][i];b.dataset.trackChoice=i;b.setAttribute('role','radio');b.setAttribute('aria-label',label);b.setAttribute('aria-checked',String(i===lastTrack));b.onclick=()=>update('zzzzzz_focus',i);trackChoice.append(b);}patch.append(trackChoice);
  for(const [i,name] of presetNames.slice(1).entries()) {
    const b=document.createElement('button');b.type='button';b.innerHTML=icon(name);b.className='action-control';b.setAttribute('aria-label',panel.labels[name]);position(b,geometry.get(name));register(b,name);b.onclick=()=>update(name,1);patch.append(b);
  }
  for(const [i,name] of holds.entries()) {
    const b=document.createElement('button');b.type='button';b.innerHTML=icon(name);b.className='action-control hold-control';b.setAttribute('aria-label',panel.labels[name]);position(b,geometry.get(name));register(b,name);
    b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();b.focus();b.setPointerCapture(e.pointerId);update(name,1);};
    const release=()=>update(name,0);b.onpointerup=b.onpointercancel=b.onlostpointercapture=release;
    b.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)update(name,1);}};b.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();release();}};b.onblur=release;patch.append(b);
  }
  window.addEventListener('blur',releaseHolds);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseHolds();});
  const sampleSets=document.createElement('div');sampleSets.className='banks sample-sets';sampleSets.setAttribute('role','radiogroup');sampleSets.setAttribute('aria-label','Sample set');position(sampleSets,geometry.get('zzzzzzzzzzz_sample_bank'));register(sampleSets,'zzzzzzzzzzz_sample_bank');
  for(let i=0;i<4;i++){const b=document.createElement('button');b.type='button';b.textContent='';b.dataset.sampleBank=i;b.title=sampleCatalog.banks[i].name;b.setAttribute('role','radio');b.setAttribute('aria-label',`Sample set ${i+1}: ${sampleCatalog.banks[i].name}`);b.onclick=()=>update('zzzzzzzzzzz_sample_bank',i);sampleSets.append(b);}patch.append(sampleSets);
  const chanceInput=document.createElement('input');chanceInput.type='range';chanceInput.min=0;chanceInput.max=100;chanceInput.step=1;chanceInput.className='chance-control';chanceInput.setAttribute('aria-label','Chance %');position(chanceInput,geometry.get('zzzzzzzzzzz_chance'));register(chanceInput,'zzzzzzzzzzz_chance');chanceInput.oninput=()=>update('zzzzzzzzzzz_chance',chanceInput.valueAsNumber);bindSliderAdjustment(chanceInput,'zzzzzzzzzzz_chance');patch.append(chanceInput);
  const accent=document.createElement('button');accent.type='button';accent.className='action-control accent-control';accent.innerHTML=icon('zzzzzzzzzzz_accent');accent.setAttribute('aria-label','Accent');position(accent,geometry.get('zzzzzzzzzzz_accent'));register(accent,'zzzzzzzzzzz_accent');accent.onclick=()=>update(values.ui_extra_03 && values.start ? 'zzzzzzzzzzz_accent_now' : 'zzzzzzzzzzz_accent',values.ui_extra_03 && values.start ? 1 : values.zzzzzzzzzzz_accent ? 0 : 1);patch.append(accent);
  for(const action of ['solo','mute']){const name=`zzzzzzzzzz_sample_${action}`,b=document.createElement('button');b.type='button';b.textContent=action==='solo' ? 'S' : 'M';b.className=`track-control ${action}`;b.setAttribute('aria-label',`Samples ${action}`);position(b,geometry.get(name));register(b,name);b.onclick=()=>update(name,values[name] ? 0 : 1);patch.append(b);}
  const mode=document.createElement('div');mode.className='banks space-mode';mode.setAttribute('role','radiogroup');mode.setAttribute('aria-label','Effekt');
  position(mode,geometry.get('zzzzzzzz_space_mode'));register(mode,'zzzzzzzz_space_mode');
  for(const [index,label] of ['Delay','Chorus','Flanger'].entries()) {
    const b=document.createElement('button');b.type='button';b.innerHTML=icon(`space_${index}`);b.setAttribute('role','radio');b.setAttribute('aria-label',label);b.dataset.spaceMode=index;
    b.onclick=()=>{update('zzzzzzzz_space_mode',index);describe('zzzzzzzz_space_mode');};mode.append(b);
  }
  patch.append(mode);
  const sync=document.createElement('button');sync.type='button';sync.innerHTML=icon('zzzzzzzz_sync');sync.className='extra-control sync-control';
  sync.title='DAW-synk finns i VST3-pluginen';sync.setAttribute('aria-label',sync.title);position(sync,geometry.get('zzzzzzzz_sync'));register(sync,'zzzzzzzz_sync');sync.disabled=true;patch.append(sync);

  register(play, 'start');
  labels.set('start', 'Start / stopp');
  position(play, geometry.get('start'));
  const tempo = register(document.querySelector('#tempo'), 'bpm');
  position(document.querySelector('.tempo'), geometry.get('bpm'));
  labels.set('bpm', 'Tempo');document.querySelector('.tempo span')?.remove();
  tempo.oninput = () => {
    if (tempo.valueAsNumber >= parameters.bpm.min && tempo.valueAsNumber <= parameters.bpm.max)
      update('bpm', tempo.valueAsNumber);
  };
  tempo.onchange = () => update('bpm', Number.isFinite(tempo.valueAsNumber) ? tempo.valueAsNumber : values.bpm);
  tempo.onkeydown = event => { if (event.key === 'Enter') tempo.blur(); };
  bindNumericAdjustment(tempo, 'bpm');

  const grid = document.querySelector('#sequence-grid');
  function applyCaption(button, name) {
    const caption=panel.captions?.[name];
    if (!caption) return;
    const text=document.createElement('span');text.textContent=caption.label==='empty' ? '' : caption.label;
    Object.assign(text.style,{position:'absolute',left:`${caption.x}px`,top:`${caption.y}px`,
      transform:'translateY(-50%)',fontSize:`${caption.font}px`,lineHeight:'1',color:caption.color,
      fontFamily:'sans-serif',whiteSpace:'pre',pointerEvents:'none'});
    button.replaceChildren(text);
  }
  for (const layout of lightLayout) {
    const light = document.createElement('span'); light.className = 'light'; light.dataset.step = layout.step;
    position(light, {position: layout, size: {x: layout.size, y: layout.size}});
    lampColor(light,lampStyles.get(`${layout.x},${layout.y}`));
    light.setAttribute('aria-hidden', 'true'); grid.append(light); lights.push(light);
  }
  const edges = Array.from({length:7},()=>[]);
  function frameLight(x, y, voice) {
    const light = document.createElement('span'); light.className = 'border-light'; light.dataset.voice = voice;
    position(light, {position: {x,y}, size: {x:25,y:25}});
    document.querySelector('#border').append(light); edges[voice].push(light);
  }
  for (const light of panel.frame) {
    frameLight(light.x,light.y,light.voice);
    lampColor(edges[light.voice].at(-1),light);
    const element=edges[light.voice].at(-1);element.style.width=element.style.height=`${light.size}px`;
  }
  for (const [key,id] of [['name','readout'],['value','readout-value']]) {
    const rect=panel.readout[key];
    const element=document.querySelector(`#${id}`);
    position(element,{position: rect,size: {x:rect.width,y:rect.height}});
    Object.assign(element.style,{background:panel.readout.background,color:panel.readout.foreground,fontSize:`${panel.readout.font}px`});
  }
  const housing=document.createElement('div');housing.className='readout-housing';
  const h=panel.readout.housing;position(housing,{position:h,size:{x:h.width,y:h.height}});housing.style.background=h.background;patch.prepend(housing);
  const module=document.createElement('div');module.className='module-backplate';
  position(module,{position:panel.module,size:{x:panel.module.width,y:panel.module.height}});module.style.background=panel.module.background;patch.prepend(module);
  for (const decoration of panel.decorations) {
    const element=document.createElement('span');element.className='panel-caption';element.textContent=decoration.label;
    position(element,{position:decoration,size:{x:decoration.width,y:decoration.height}});
    Object.assign(element.style,{background:decoration.background===panel.background ? 'transparent' : decoration.background,color:decoration.foreground,fontSize:`${decoration.font}px`,paddingLeft:`${decoration.label_x}px`});grid.append(element);
    // System fonts differ slightly from the plugin font. Keep a caption
    // inside its PD canvas without moving controls or wrapping onto steps.
    const measure=document.createElement('canvas').getContext('2d');
    measure.font=getComputedStyle(element).font;
    const width=measure.measureText(element.textContent).width;
    if (width>decoration.width-decoration.label_x)
      element.style.fontSize=`${Math.max(1,Math.floor(decoration.font*(decoration.width-decoration.label_x)/width))}px`;
  }
  const timers=[];
  function hit(voice) {
    if (!edges[voice]) return;
    clearTimeout(timers[voice]);
    for (const light of edges[voice]) light.classList.add('active');
    timers[voice] = setTimeout(() => { for (const light of edges[voice]) light.classList.remove('active'); },120);
  }
  for (const [prefix, label, style] of [['kick', 'Kick', 'kick'], ['snare', 'Snare', 'snare'],
    ['closed_hat', 'Sluten hat', 'closed-hat'], ['open_hat', 'Öppen hat', 'open-hat'], ['zzz_future','Framtida trumma (tyst)','future']]) {
    if (prefix!=='zzz_future') for (const [action,symbol] of [['solo','S'],['mute','M']]) {
      const name=`zz_${prefix}_${action}`;
      const button=document.createElement('button');button.type='button';button.className=`track-control ${action}`;button.textContent=symbol;
      button.setAttribute('aria-label',`${label}, ${action.toUpperCase()}`);button.title=button.getAttribute('aria-label');
      button.onclick=()=>{update(name,values[name] ? 0 : 1);describe(name);};
      register(button,name);position(button,geometry.get(name));grid.append(button);
    }
    for (let step = 0; step < 16; step++) {
      const name = `${prefix}_step${String(step + 1).padStart(2, '0')}`;
      const pad = document.createElement('button'); pad.type = 'button';
      const marks=document.createElement('span');marks.className='substep-marks';pad.append(marks);const accentMark=document.createElement('span');accentMark.className='accent-mark';pad.append(accentMark);
      pad.addEventListener('pointerenter',()=>{readout.textContent=`${['K','S','CH','OH','SM'][tracks.indexOf(prefix)]} ${step+1} R${pad.dataset.ratchet}`;document.querySelector('#readout-value').textContent=pad.dataset.probability+'%';});
      const row=tracks.indexOf(prefix);
      pad.className = `step ${style}${fillMasks[row] & (1<<step) ? ' beat' : ''}`; pad.dataset.step = step;pad.dataset.track=row;
      pad.setAttribute('aria-label', `${label}, steg ${step + 1}`);
      pad.onkeydown=event=>{if(event.key===' ' || event.key==='Enter'){event.preventDefault();update(name,values[name] ? 0 : 1);}};
      register(pad, name); position(pad, geometry.get(name)); grid.append(pad); pads.push(pad);
    }
  }
  let gesture=null;
  grid.addEventListener('pointerdown',event=>{const pad=event.target.closest('.step');if(!pad || event.button!==0)return;event.preventDefault();gesture={id:event.pointerId,row:Number(pad.dataset.track),value:values[pad.dataset.parameter] ? 0 : 1,last:Number(pad.dataset.step),seen:new Set()};grid.setPointerCapture(event.pointerId);paintStep(gesture.last);});
  function paintStep(step){if(!gesture || gesture.seen.has(step))return;gesture.seen.add(step);update(stepNames[gesture.row*16+step],gesture.value);}
  grid.addEventListener('pointermove',event=>{if(!gesture || event.pointerId!==gesture.id)return;const pad=document.elementFromPoint(event.clientX,event.clientY)?.closest('.step');if(!pad || Number(pad.dataset.track)!==gesture.row)return;const step=Number(pad.dataset.step);for(let i=Math.min(step,gesture.last);i<=Math.max(step,gesture.last);i++)paintStep(i);gesture.last=step;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])grid.addEventListener(type,event=>{if(gesture && event.pointerId===gesture.id)gesture=null;});
  const untz=document.createElement('button');untz.type='button';untz.className='extra-control untz-control';untz.textContent='UNTZ';untz.setAttribute('aria-label','UNTZ: fyll markerade slag i aktivt spår');
  position(untz,geometry.get('zzzzzzzz_fill'));register(untz,'zzzzzzzz_fill');
  untz.onclick=async()=>{try{await ensureAudio();update('zzzzzzzz_fill',1);}catch(error){report(error.message,true);}};grid.append(untz);
  paintRows();
  for(const [index,name] of clearNames.entries()) {
    const button=document.createElement('button');button.type='button';button.className='clear-control';button.textContent=index===0 ? 'Clear' : '×';
    button.title=index===0 ? 'Rensa aktuell bank' : `Rensa ${tracks[index-1]}`;button.setAttribute('aria-label',button.title);
    register(button,name);position(button,geometry.get(name));if(index===0)button.innerHTML=icon(name);else button.textContent='×';button.onclick=()=>update(name,1);grid.append(button);
  }
  const bank=document.createElement('div');bank.className='banks';bank.setAttribute('role','radiogroup');bank.setAttribute('aria-label','Mönsterbank');
  register(bank,'zzzz_bank');position(bank,geometry.get('zzzz_bank'));
  for(let index=0;index<8;index++) {
    const button=document.createElement('button');button.type='button';button.textContent='';button.dataset.bank=String(index);
    button.setAttribute('role','radio');button.setAttribute('aria-label',`Bank ${index+1}`);button.onclick=()=>update('zzzz_bank',index);bank.append(button);
  }
  grid.append(bank);
  const record=document.createElement('button');record.type='button';record.className='record-control';record.setAttribute('aria-label','Spela in MIDI');record.title='Record: spela in MIDI på närmaste 16-del';
  register(record,'ui_extra_03');position(record,geometry.get('ui_extra_03'));grid.append(record);
  async function connectMidi(){
    if(!navigator.requestMIDIAccess)throw new Error('Web MIDI stöds inte här. Prova Chrome eller Edge på en dator.');
    await ensureAudio();
    midiAccess ||= await navigator.requestMIDIAccess({sysex:false});
    const bind=()=>{let count=0;for(const input of midiAccess.inputs.values()){
      input.onmidimessage=({data})=>{
        if(!node || !ready || data.length<3)return;
        const kind=data[0]&0xf0;
        if(kind===0xb0){
          let channel=(data[0]&15)+1;
          // Channel 1 is shared with VULVA: sound CCs go to the selected track.
          if(channel===midiChannelConfig.shared_channel)channel=midiChannelConfig.focus_channels[Math.max(0,Math.min(4,values.zzzzzz_focus|0))];
          if(!midiChannels.has(channel))return;
          const entry=midiControllers.get(`${channel}:${data[1]}`)||midiControllers.get(`*:${data[1]}`),p=entry&&parameters[entry.parameter];
          if(p)update(entry.parameter,entry.parameter==='start' ? Number(data[2]>=64) : p.min+(p.max-p.min)*data[2]/127);
          return;
        }
        if(kind!==0x90 && kind!==0x80)return;
        node.port.postMessage({type:'midi',pitch:data[1],velocity:kind===0x80 || (kind===0x90&&data[2]===0) ? 0 : data[2],channel:data[0]&15});
      };
      if(input.state==='connected')count++;
    }document.querySelector('#midi').textContent=count?`MIDI ansluten (${count})`:'Anslut MIDI';return count;};
    midiAccess.onstatechange=()=>{const count=bind();report(count?`MIDI ansluten: ${count} enhet${count===1?'':'er'}.`:'MIDI aktiverat. Anslut en enhet.');};
    return bind();
  }
  record.onclick=async()=>{
    update('ui_extra_03',values.ui_extra_03 ? 0 : 1);
    if(!values.ui_extra_03)return;
    try {
      const count=await connectMidi();
      report(count?(values.start?'Record är på.':'Record är armerad. Tryck Spela.'):'Record är armerad. Anslut en MIDI-enhet.');
    }catch(error){report(`MIDI kunde inte öppnas: ${error.message}`,true);}
  };
  const variationLabels=['Later','Earlier','Flip','Mutate','Reverse','Euclid','Random','Undo','Rotate two steps','Swap halves','Repeat half','Mirror half','Thin alternate steps','Fill after hits','Spread ×2'];
  const variationIcons=['→','←','◐','⚄','⇄','◌','↝','↶','>>','<>','||','><','.',':'];
  for(let index=4;index<19;index++) {
    const name=`zzzzzzz_var_${String(index).padStart(2,'0')}`;
    const button=document.createElement('button');button.type='button';button.className='variation-control';button.innerHTML=icon(name);
    button.setAttribute('aria-label',variationLabels[index-4]);button.title=variationLabels[index-4];
    register(button,name);position(button,geometry.get(name));button.style.color=geometry.get(name).fg_color;
    button.onclick=async()=>{button.disabled=true;try{await ensureAudio();update(name,1);}catch(error){report(error.message,true);}finally{button.disabled=false;}};
    grid.append(button);
  }
  const trigger=document.createElement('button');trigger.type='button';trigger.className='trigger-control';trigger.textContent='6 7';trigger.setAttribute('aria-label','6 7: senaste spåret');
  register(trigger,'zzzz_trigger');position(trigger,geometry.get('zzzz_trigger'));applyCaption(trigger,'zzzz_trigger');trigger.onclick=async()=>{trigger.disabled=true;try{await ensureAudio();update('zzzz_trigger',1);}catch(error){report(error.message,true);}finally{trigger.disabled=false;}};grid.append(trigger);
  paintBank();showStep(-1); resize();

  async function disposeAudio() {
    ready = false;
    clearInterval(meterTimer);
    node?.disconnect(); node = null;
    const previous = context; context = null;
    if (previous && previous.state !== 'closed') await previous.close();
    update('start', 0);
  }

  async function ensureAudio() {
    if (ready) { await context.resume(); return; }
    if (starting) return starting;
    starting = (async () => {
      if (!window.isSecureContext) throw new Error('Ljud kräver HTTPS eller en lokal webbserver.');
      if (!window.AudioContext || !window.AudioWorkletNode) throw new Error('Webbläsaren saknar stöd för ljudmotorn. Prova en nyare webbläsare.');
      context = new AudioContext();
      // Safari requires unlock during the original click, before asynchronous loading.
      const unlocked = context.resume();
      if (!context.audioWorklet) throw new Error('Webbläsaren saknar stöd för ljudmotorn. Prova en nyare webbläsare.');
      const wasmResponse=await fetch(new URL('kapten-engine.wasm',import.meta.url));
      if(!wasmResponse.ok)throw new Error('Kunde inte läsa ljudmotorn.');
      const wasmBinary=await wasmResponse.arrayBuffer();
      await context.audioWorklet.addModule(new URL('worklet.js',import.meta.url));
      node = new AudioWorkletNode(context, 'kapten', {numberOfInputs: 0, numberOfOutputs: 1,
        outputChannelCount: [11], processorOptions: {parameters}});
      let fail,acknowledgeSamples;
      const audioNode=node;
      async function streamSamples(){
        const response=await fetch(new URL('kapten-samples.pcm',import.meta.url));
        if(!response.ok || !response.body)throw new Error('Kunde inte läsa samplebiblioteket.');
        const reader=response.body.getReader();let loaded=0;
        try{while(true){const {value,done}=await reader.read();if(done)break;
          // Transfer each portion and await its consumption: no full-file copies.
          for(let offset=0;offset<value.length;offset+=262144){const bytes=value.slice(offset,offset+262144);const ack=new Promise(resolve=>{acknowledgeSamples=resolve;});loaded+=bytes.length;audioNode.port.postMessage({type:'samples-chunk',bytes},[bytes.buffer]);await ack;}
          report(`Laddar ljud… ${Math.round(loaded/1048576)} MB`);
        }}finally{reader.releaseLock();}
        audioNode.port.postMessage({type:'samples-done'});
      }
      const initialized = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Ljudmotorn svarade inte. Försök igen.')), 60000);
        fail = error => { clearTimeout(timeout); reject(error); };
        node.onprocessorerror = () => {
          const error = new Error('Ljudmotorn avbröts. Tryck Spela för att försöka igen.');
          if (!ready) fail(error);
          else { void disposeAudio(); report(error.message, true); }
        };
        node.port.onmessage = ({data}) => {
          if(data.type==='engine-ready')void streamSamples().catch(fail);
          if(data.type==='samples-ack'){acknowledgeSamples?.();acknowledgeSamples=null;}
          if(data.type==='ready')patch.dataset.memoryBytes=String(data.memoryBytes);
          if(data.type==='state-ready')stateWaiters.get(data.id)?.();
          if (data.type === 'step') showStep(data.value);
          if (data.type === 'hit') hit(data.voice);
          if (data.type === 'view') update(data.name,data.value,true);
          if(data.type==='accent-edit'){values[accentNames[data.index]]=data.value;paintRows();}
          if(data.type==='accent-now-done')update('zzzzzzzzzzz_accent_now',0,true);
          if(data.type==='probability-edit'){values[probabilityNames[data.index]]=data.value;paintRows();}
          if(data.type==='sample-edit-v3'){values[sampleNames[data.index]]=data.value;paintRows();}
          if(data.type==='chain-edit'){values[`zzzzzzzzz_chain_${String(data.index+1).padStart(2,'0')}`]=data.value;paintChain();}
          if(data.type==='chain-editing'){chainEditing=data.value>0;if(chainEditing){chainCapture=[];update('zzzzzzzzz_chain_on',0,true);}paintChain();}
          if(data.type==='chain-count'){chainCapture=Array.from({length:data.value});if(data.value>0)values.zzzzzzzzz_chain_length=data.value;paintChain();}
          if(data.type==='chain-playing'){update('zzzzzzzzz_chain_on',data.value,true);paintChain();}
          if(data.type==='sound-edit')update(soundParameters[data.index],data.value,true);
          if(data.type==='preset-done')update(presetNames[data.index],0,true);
          if(data.type==='chain-ready'){update('zzzzzzzzz_chain_on',1,true);paintChain();}
          if(data.type==='chain-edit-done')update('zzzzzzzzzz_chain_edit',0,true);
          if (data.type === 'ratchet-edit') {values[ratchetNames[data.index]]=data.value;paintRows();}
          if (data.type === 'chain-bank') update('zzzz_bank',data.value,true);
          if (data.type === 'bank-edit') values[storageNames[data.index]]=data.value;
          if (data.type === 'bank-active') {activeBank=data.value;paintBank();paintRows();}
          if (data.type === 'clear-done') update(clearNames[data.index],0,true);
          if (data.type === 'track') {lastTrack=data.value;values.zzzzzz_focus=lastTrack;update('zzzzzz_focus',lastTrack,true);paintRows();}
          if (data.type === 'fill-done') update('zzzzzzzz_fill',0,true);
          if (data.type === 'variation-done') update(`zzzzzzz_var_${String(data.index).padStart(2,'0')}`,0,true);
          if (data.type === 'trigger-done') update('zzzz_trigger',0,true);
          if (data.type === 'ready') {
            clearTimeout(timeout); ready = true; sendUserSamples();
            // Restore controls without treating each send/knob as a new edit.
            // Restore focus last because the DSP also selects a voice on edits.
            const restored = {...values};
            for (const [name, value] of Object.entries(restored))
              node.port.postMessage({type: 'parameter', name, value});
            node.port.postMessage({type: 'parameter', name: 'zzzzzz_focus', value: restored.zzzzzz_focus});
            meterTimer = setInterval(() => node?.port.postMessage({type: 'meter'}), 500);
            resolve();
          }
          if (data.type === 'error') {
            if (!ready) fail(new Error(data.message)); else report(data.message, true);
          }
          if (data.type === 'meter') patch.dataset.peak = data.peak;
        };
      });
      // Connect and resume before waiting: a suspended worklet may not start.
      node.connect(context.destination);
      node.port.postMessage({type:'init',wasmBinary},[wasmBinary]);
      try {await unlocked;if(context.state!=='running')throw new Error('Ljudet är pausat av webbläsaren. Tryck Spela igen.');} catch(error){fail(error);}
      await initialized;
    })();
    try { await starting; }
    catch (error) { await disposeAudio(); throw error; }
    finally { starting = null; }
  }

  play.onclick = async () => {
    if (values.start && context?.state === 'running') {
      update('start', 0); report('Pausad'); return;
    }
    play.disabled = true; play.setAttribute('aria-busy', 'true'); report('Startar ljud…');
    try {
      await ensureAudio(); update('start', 1); report('Spelar');
    } catch (error) { report(error.message, true); }
    finally { play.disabled = false; play.removeAttribute('aria-busy'); }
  };

  function clear() {
    update('zzzz_clear',1);
  }
  function demo() {
    clear();
    for (const step of [1, 5, 9, 13]) update(`kick_step${String(step).padStart(2, '0')}`, 1);
    for (const step of [5, 13]) update(`snare_step${String(step).padStart(2, '0')}`, 1);
    for (const step of [1, 3, 5, 7, 9, 11, 13, 15]) update(`closed_hat_step${String(step).padStart(2, '0')}`, 1);
    update('open_hat_step16', 1);
  }
  // Browsers block audible Web Audio until a real user gesture. Prepare only
  // the audio engine on first interaction; transport remains stopped.
  demo();lastTrack=0;values.zzzzzz_focus=0;paintRows();update('zzzzzzzz_space_mode',values.zzzzzzzz_space_mode,true);update('start',0,true);report('Redo · ljudet aktiveras vid första trycket'); play.disabled = false;
  // Host hook (Älskog 3000 and diagnostics): same update path as the controls.
  window.runkinator={get values(){return {...values};},update,ensureAudio,get node(){return node;},get ready(){return ready;}};
  let autoStartArmed=true;
  const autoStart=async event=>{
    if(!autoStartArmed)return;
    if(event.target?.closest?.('#play')){autoStartArmed=false;removeAutoStart();return;}
    autoStartArmed=false;removeAutoStart();
    try{play.disabled=true;play.setAttribute('aria-busy','true');await ensureAudio();report('Ljud redo');}
    catch(error){report(error.message,true);autoStartArmed=true;installAutoStart();}
    finally{play.disabled=false;play.removeAttribute('aria-busy');}
  };
  const installAutoStart=()=>{window.addEventListener('pointerdown',autoStart,{capture:true,once:true});window.addEventListener('keydown',autoStart,{capture:true,once:true});};
  const removeAutoStart=()=>{window.removeEventListener('pointerdown',autoStart,true);window.removeEventListener('keydown',autoStart,true);};
  installAutoStart();
  const userPanel=document.querySelector('#user-samples-panel'),userToggle=document.querySelector('#user-samples-toggle');
  const showUserSamples=show=>{menuPanel.classList.toggle('show-user-samples',show);userPanel.hidden=!show;userToggle.setAttribute('aria-expanded',String(show));if(show)paintUserSamples();(show?document.querySelector('#user-samples-back'):userToggle).focus();};
  userToggle.onclick=()=>showUserSamples(true);
  document.querySelector('#user-samples-back').onclick=()=>showUserSamples(false);
  menu.addEventListener('toggle',()=>{if(!menu.open&&!userPanel.hidden){menuPanel.classList.remove('show-user-samples');userPanel.hidden=true;userToggle.setAttribute('aria-expanded','false');}});
  document.querySelector('#user-samples-add').onclick=()=>document.querySelector('#user-samples-file').click();
  document.querySelector('#user-samples-file').onchange=async event=>{const files=[...event.target.files];event.target.value='';for(const file of files){try{await addUserSample(file);}catch(error){report(`${file.name}: ${error.message}`,true);}}};
  void loadUserSamples();
  const menuPanel = menu.querySelector('.menu-panel'), midiMapPanel = document.querySelector('#midi-map-panel'), midiMapToggle = document.querySelector('#midi-map-toggle');
  const showMidiMap = show => { menuPanel.classList.toggle('show-midi-map', show); midiMapPanel.hidden = !show; midiMapToggle.setAttribute('aria-expanded', String(show)); (show ? document.querySelector('#midi-map-back') : midiMapToggle).focus(); };
  midiMapToggle.onclick = () => showMidiMap(true);
  document.querySelector('#midi-map-back').onclick = () => showMidiMap(false);
  menu.addEventListener('toggle', () => { if (!menu.open && !midiMapPanel.hidden) { menuPanel.classList.remove('show-midi-map'); midiMapPanel.hidden = true; midiMapToggle.setAttribute('aria-expanded', 'false'); } });
  document.querySelector('#demo').onclick = () => { demo(); menu.open = false; report('Exempelsekvens laddad'); };
  document.querySelector('#clear').onclick = () => { clear(); menu.open = false; report('Sekvensen är rensad'); };
  document.querySelector('#midi').onclick = async()=>{try{const count=await connectMidi();report(count?`MIDI ansluten: ${count} enhet${count===1?'':'er'}.`:'MIDI aktiverat. Anslut en enhet.');}catch(error){alert(error.message);}finally{menu.open=false;}};
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || event.defaultPrevented) return;
    const target = event.target;
    // Preserve normal typing and the keyboard behavior of every focused control.
    if (target?.closest?.('input, textarea, select, button, summary, [contenteditable="true"]')) return;
    event.preventDefault();
    play.click();
  });
  document.querySelector('#open').onclick = () => document.querySelector('#load').click();
  document.querySelector('#save').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({format: 'kapten-beat-5', values: {...values,...Object.fromEntries([...holds,...presetNames].map(n=>[n,0])), zzzzzzzzzzz_accent_now:0, start: 0, zzzz_bank:activeBank, zzzz_clear:0,zzzz_trigger:0}}, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'Runkinator-session.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); menu.open = false; report('Sessionen är sparad');
  };
  document.querySelector('#load').onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      const saved = JSON.parse(await file.text());
      if (!['kapten-beat-1','kapten-beat-2','kapten-beat-3','kapten-beat-4','kapten-beat-5'].includes(saved.format) || !saved.values || typeof saved.values !== 'object' || Array.isArray(saved.values))
        throw new Error('Fel filformat.');
      const entries = Object.entries(saved.values);
      if (!entries.length || entries.some(([name, value]) => !Object.hasOwn(parameters, name) || !Number.isFinite(value)))
        throw new Error('Ogiltiga kontrollvärden.');
      if(accentNames.some(name=>Object.hasOwn(saved.values,name) && (!Number.isInteger(saved.values[name]) || saved.values[name]<0 || saved.values[name]>65535)))throw new Error('Ogiltiga accent-värden.');
      if(ratchetNames.some(name=>Object.hasOwn(saved.values,name) && (!Number.isInteger(saved.values[name]) || saved.values[name]<0 || saved.values[name]>65535)))throw new Error('Ogiltiga ratchet-värden.');
      if(probabilityNames.some(name=>Object.hasOwn(saved.values,name) && (!Number.isInteger(saved.values[name]) || saved.values[name]<0 || saved.values[name]>16383 || [0,1].some(i=>Math.floor(saved.values[name]/128**i)%128>100))))throw new Error('Ogiltiga probability-värden.');
      if(sampleNames.some(name=>Object.hasOwn(saved.values,name) && (!Number.isInteger(saved.values[name]) || saved.values[name]<0 || saved.values[name]>65535 || Array.from({length:2},(_,i)=>Math.floor(saved.values[name]/256**i)%256).some(v=>v && !sampleCatalog.ids.includes(v) && !isUserId(v)))))throw new Error('Ogiltiga sample-värden.');
      if(storageNames.some(name=>Object.hasOwn(saved.values,name) && (!Number.isInteger(saved.values[name]) || saved.values[name]<0 || saved.values[name]>65535)))throw new Error('Ogiltiga bankvärden.');
      releaseHolds();chainEditing=false;chainCapture=[];paintChain();
      for(let bank=0;bank<8;bank++)for(let quarter=0;quarter<4;quarter++){const old=saved.values[legacySampleNames[bank*4+quarter]] || 0;for(let pair=0;pair<2;pair++){const name=sampleNames[bank*8+quarter*2+pair];if(!Object.hasOwn(saved.values,name))saved.values[name]=Math.floor(old/32**(pair*2))%32+256*(Math.floor(old/32**(pair*2+1))%32);}}
      update('start',0);
      // Older beat files predate ratchets, swing and chains; restore defaults.
      for(const [name,p] of Object.entries(parameters)) if(/^z{9,11}_/.test(name) && name!=='zzzzzzzzzz_chain_edit' && !holds.includes(name) && !presetNames.includes(name)) update(name,saved.values[name] ?? p.default);
      for(const [name,value] of entries) if(name!=='start' && name!=='zzzz_bank' && !stepNames.includes(name) && !storageNames.includes(name) && !clearNames.includes(name) && name!=='zzzz_trigger' && name!=='zzzzzzzz_fill' && name!=='zzzzzzzzzz_chain_edit' && !name.startsWith('zzzzzzz_var_') && !holds.includes(name) && !presetNames.includes(name) && name!=='zzzzzzzzzzz_accent_now')update(name,value);
      const stored=Object.fromEntries(storageNames.map(name=>[name,saved.values[name] || 0]));
      if(!storageNames.some(name=>Object.hasOwn(saved.values,name)))for(let row=0;row<5;row++)for(let step=0;step<16;step++)if(saved.values[stepNames[row*16+step]]>0)stored[storageNames[row*8]]|=1<<step;
      for(const name of storageNames)update(name,stored[name]);
      update('zzzz_bank',saved.values.zzzz_bank || 0);
      for(const name of sampleNames)update(name,saved.values[name] ?? 0);
      for(const name of accentNames)update(name,saved.values[name] ?? 0);
      for(const name of probabilityNames)update(name,saved.values[name] ?? 0);
      update('zzzzzzzzz_chain_on',saved.values.zzzzzzzzz_chain_on ?? 0);
      update('zzzzzz_focus', saved.values.zzzzzz_focus ?? 0);
      if(ready){report('Öppnar beatet…');await context.resume();await stateApplied();}
      report('Sessionen är öppnad');
    } catch (error) { report(`Kunde inte öppna beatet: ${error.message}`, true); }
    event.target.value = ''; menu.open = false;
  };
}

document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) menu.open = false; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
});
boot().catch(error => report(error.message, true));
