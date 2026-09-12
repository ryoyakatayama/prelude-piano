import {timeline,loopBounds,clamp} from './core.js';
export function setAudioSession(type){try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{/* Older browsers retain their default routing. */}}
export function pianoVoice(ctx,destination,midi,time,duration,velocity=.65,registry){
  const hz=440*2**((midi-69)/12),length=Math.max(.07,duration),release=.22;
  const gain=ctx.createGain();gain.connect(destination);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(velocity*.24,time+.004);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0001,velocity*.095),time+Math.min(.18,length*.45));
  gain.gain.exponentialRampToValueAtTime(Math.max(.0001,velocity*.027),time+length);
  gain.gain.exponentialRampToValueAtTime(.0001,time+length+release);
  const oscs=[];
  for(const [partial,amplitude] of [[1,1],[2,.38],[3,.17],[4,.08],[5,.035]]) {
    if(hz*partial>ctx.sampleRate*.45)continue;
    const osc=ctx.createOscillator(),g=ctx.createGain();osc.frequency.value=hz*partial;osc.detune.value=partial>1?partial*.13:0;g.gain.value=amplitude;osc.connect(g).connect(gain);osc.start(time);osc.stop(time+length+release+.03);oscs.push(osc);
    osc.onended=()=>{osc.disconnect();g.disconnect();registry?.delete(osc);};registry?.add(osc);
  }
  if(oscs.length)oscs[0].addEventListener('ended',()=>gain.disconnect(),{once:true});
}
function click(ctx,dest,time,accent,registry) {
 const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=accent?1300:950;g.gain.setValueAtTime(.09,time);g.gain.exponentialRampToValueAtTime(.001,time+.035);o.connect(g).connect(dest);o.start(time);o.stop(time+.05);registry.add(o);o.onended=()=>{registry.delete(o);o.disconnect();g.disconnect();};
}
export class Transport {
 constructor(onFrame,onEnd){this.onFrame=onFrame;this.onEnd=onEnd;this.voices=new Set();this.running=false;this.generation=0;}
 async unlock(reset=false){
   setAudioSession('playback');
   if(reset||this.needsReset||this.ctx?.state==='closed'||this.ctx?.state==='interrupted')this.releaseContext();
   if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('このブラウザは音源再生に対応していません。Safariの最新版でお試しください。');this.ctx=new C({latencyHint:'interactive'});this.master=this.ctx.createGain();this.master.gain.value=.8;const compressor=this.ctx.createDynamicsCompressor();this.master.connect(compressor).connect(this.ctx.destination);
    const context=this.ctx;context.onstatechange=()=>{if(this.ctx===context&&this.running&&context.state!=='running'){this.stop();this.needsReset=true;this.onEnd?.();this.onIssue?.('音声が中断されました。再生ボタンを押すと再開します。');}};
   }
   const context=this.ctx;
   // Both calls occur in the original tap, before an await can lose Safari's user activation.
   const resumed=context.resume();
   const warmup=context.createBufferSource();warmup.buffer=context.createBuffer(1,1,context.sampleRate);warmup.connect(context.destination);warmup.onended=()=>warmup.disconnect();warmup.start();
   let timeout;
   try{await Promise.race([resumed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('音声の開始を確認できませんでした。「音を確認」または再生ボタンを押し直してください。')),4000);})]);if(context.state!=='running')throw Error('音声を開始できませんでした。再生ボタンをもう一度押してください。');}
   catch(error){if(this.ctx===context)this.needsReset=true;throw error;}
   finally{clearTimeout(timeout);}
 }
 releaseContext(){const previous=this.ctx;this.ctx=null;this.master=null;this.needsReset=false;if(previous){previous.onstatechange=null;if(previous.state!=='closed')previous.close().catch(()=>{});}}
 resetAfterBackground(){this.stop();this.releaseContext();setAudioSession('auto');}
 setVolume(value,immediate=false){const level=clamp(Number(value)||0,0,1);if(this.opts)this.opts.volume=level;if(!this.master||!this.ctx)return;const gain=this.master.gain,now=this.ctx.currentTime;if(gain.cancelAndHoldAtTime)gain.cancelAndHoldAtTime(now);else{const current=gain.value;gain.cancelScheduledValues(now);gain.setValueAtTime(current,now);}if(immediate)gain.setValueAtTime(level,now);else gain.setTargetAtTime(level,now,.02);}
 async testSound(volume=.8){this.stop();const generation=++this.generation;await this.unlock(true);if(generation!==this.generation)return;this.setVolume(volume,true);[60,64,67].forEach((midi,i)=>pianoVoice(this.ctx,this.master,midi,this.ctx.currentTime+.04+i*.35,.3,.7,this.voices));this.testTimer=setTimeout(()=>{if(generation===this.generation)this.stop();},1600);}
 async start(score,opts,beat=0){
   this.stop();const generation=++this.generation;await this.unlock();if(generation!==this.generation)return;
   this.score=score;this.opts={...opts};this.tempo=opts.tempo;this.data=timeline(score,opts.hand);this.bounds=opts.loop?loopBounds(score,opts.a,opts.b):{start:0,end:this.data.total};
   if(beat>=this.bounds.end||beat<this.bounds.start&&opts.loop)beat=this.bounds.start;
   this.initialBeat=beat;this.startTime=this.ctx.currentTime+.045+(opts.countIn?4*60/this.tempo:0);this.anchorTime=this.startTime;this.anchorBeat=beat;this.running=true;this.setVolume(opts.volume??.8,true);
   this.resetIndices();
   if(opts.countIn)for(let i=0;i<4;i++)click(this.ctx,this.master,this.startTime-(4-i)*60/this.tempo,i===0,this.voices);
   this.timer=setInterval(()=>this.schedule(),25);this.schedule();this.frame();
 }
 resetIndices(){this.eventIndex=this.data.events.findIndex(n=>n.start>=this.anchorBeat-.00001);if(this.eventIndex<0)this.eventIndex=this.data.events.length;this.clickBeat=Math.ceil(this.anchorBeat-.00001);}
 schedule(){if(!this.running)return;const until=this.ctx.currentTime+.12,bps=this.tempo/60;
   for(let segment=0;segment<4;segment++){
     const boundary=this.anchorTime+(this.bounds.end-this.anchorBeat)/bps;
     while(this.eventIndex<this.data.events.length){const n=this.data.events[this.eventIndex],t=this.anchorTime+(n.start-this.anchorBeat)/bps;if(n.start>=this.bounds.end||t>until)break;this.eventIndex++;if(t<this.ctx.currentTime-.025)continue;pianoVoice(this.ctx,this.master,n.midi,Math.max(t,this.ctx.currentTime),Math.min(n.duration,this.bounds.end-n.start)/bps*.93,n.velocity??.65,this.voices);}
     if(this.opts.metronome)while(this.clickBeat<this.bounds.end){const t=this.anchorTime+(this.clickBeat-this.anchorBeat)/bps;if(t>until)break;if(t>=this.ctx.currentTime-.02)click(this.ctx,this.master,Math.max(t,this.ctx.currentTime),this.data.starts.some(s=>Math.abs(s-this.clickBeat)<.001),this.voices);this.clickBeat++;}
     if(this.opts.loop&&boundary<=until){this.anchorTime=boundary;this.anchorBeat=this.bounds.start;this.resetIndices();}else break;
   }
 }
 position(){if(!this.running)return this.lastPosition??0;let beat=this.initialBeat+Math.max(0,this.ctx.currentTime-this.startTime)*this.tempo/60;if(this.opts.loop&&beat>=this.bounds.end)beat=this.bounds.start+(beat-this.bounds.end)%(this.bounds.end-this.bounds.start);return Math.min(beat,this.bounds.end);}
 frame(){if(!this.running)return;const beat=this.position();this.onFrame(beat,this.ctx.currentTime<this.startTime?Math.ceil((this.startTime-this.ctx.currentTime)*this.tempo/60):0);if(!this.opts.loop&&beat>=this.bounds.end){this.stop();this.onEnd?.();return;}this.raf=requestAnimationFrame(()=>this.frame());}
 stop(){this.generation++;if(this.running)this.lastPosition=this.position();this.running=false;clearInterval(this.timer);clearTimeout(this.testTimer);cancelAnimationFrame(this.raf);for(const v of this.voices){try{v.stop();}catch{}}this.voices.clear();return this.lastPosition??0;}
}
export function encodeWav(samples,sampleRate){const array=new ArrayBuffer(44+samples.length*2),v=new DataView(array),str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++)v.setInt16(44+i*2,clamp(samples[i],-1,1)*32767,true);return array;}
export async function renderWav(score,{tempo=score.tempo,hand='both'}={}) {
  const data=timeline(score,hand),seconds=data.total*60/tempo+.5;
  if(seconds>600)throw Error('WAV書き出しは10分以内にしてください。テンポを上げるか、曲データを分けてください。');
  const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)throw Error('このブラウザではWAV書き出しを利用できません。');
  const ctx=new C(1,Math.ceil(seconds*22050),22050),master=ctx.createGain();master.gain.value=.75;master.connect(ctx.destination);
  for(const n of data.events)pianoVoice(ctx,master,n.midi,n.start*60/tempo,n.duration*60/tempo*.93,n.velocity??.65);
  const buffer=await ctx.startRendering();return new Blob([encodeWav(buffer.getChannelData(0),22050)],{type:'audio/wav'});
}
