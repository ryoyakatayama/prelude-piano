import {timeline,noteName} from './core.js';
// YIN's difference/CMND estimator. Single fundamental only; polyphonic piano is not promised.
export function detectPitch(buffer,sampleRate){
 const stride=2,n=Math.min(2048,Math.floor(buffer.length/stride)),data=new Float32Array(n);let rms=0;
 for(let i=0;i<n;i++){data[i]=buffer[i*stride];rms+=data[i]*data[i];}rms=Math.sqrt(rms/n);if(rms<.008)return {midi:null,rms,confidence:0};
 const sr=sampleRate/stride,min=Math.max(2,Math.floor(sr/2200)),max=Math.min(Math.floor(n/2)-1,Math.ceil(sr/65)),diff=new Float32Array(max+1),win=n-max;let sum=0,tau=-1;
 for(let t=1;t<=max;t++){let d=0;for(let i=0;i<win;i++){const v=data[i]-data[i+t];d+=v*v;}diff[t]=d;sum+=d;diff[t]=sum>0?d*t/sum:1;if(t>min+1&&diff[t-1]<.15&&diff[t-1]<diff[t-2]&&diff[t-1]<=diff[t]){tau=t-1;break;}}
 if(tau<0)return {midi:null,rms,confidence:0};
 const y0=diff[tau-1],y1=diff[tau],y2=diff[tau+1],delta=(y0-y2)/(2*(y0-2*y1+y2)||1),hz=sr/(tau+delta),midi=Math.round(69+12*Math.log2(hz/440));
 return {midi:midi>=36&&midi<=96?midi:null,rms,confidence:1-y1};
}
export class FollowMatcher {
 constructor(score,hand,beat=0,bounds){this.groups=[];for(const n of timeline(score,hand).events){if(bounds&&(n.start<bounds.start||n.start>=bounds.end))continue;let g=this.groups.at(-1);if(!g||g.beat!==n.start){g={beat:n.start,pitches:[]};this.groups.push(g);}g.pitches.push(n.midi);}this.index=Math.max(0,this.groups.findIndex(g=>g.beat>=beat));this.lastPitch=null;this.lastAt=-Infinity;this.released=true;this.lastRms=0;this.stable=null;this.stableFrames=0;}
 accept({midi,rms,confidence},now){
   const attack=rms>this.lastRms*1.65&&rms>.012;this.lastRms=rms;
   if(midi==null||confidence<.8){if(rms<.01){this.released=true;this.stableFrames=0;}return null;}
   if(midi===this.stable)this.stableFrames++;else{this.stable=midi;this.stableFrames=1;}
   if(this.stableFrames<2||now-this.lastAt<130)return null;
   if(midi===this.lastPitch&&!this.released&&!attack)return null;
   let found=-1;for(let i=this.index;i<Math.min(this.groups.length,this.index+4);i++)if(this.groups[i].pitches.includes(midi)){found=i;break;}
   if(found<0)return null;
   const group=this.groups[found];this.index=found+1;this.lastPitch=midi;this.lastAt=now;this.released=false;
   return {beat:group.beat,midi,complete:this.index>=this.groups.length};
 }
}
export class MicrophoneFollower {
 constructor(onPosition,onStatus){this.onPosition=onPosition;this.onStatus=onStatus;this.generation=0;}
 async start(score,hand,beat,bounds){this.stop();const generation=++this.generation;
   if(!navigator.mediaDevices?.getUserMedia)throw Error('マイク追従はHTTPSのSafariで開いてください。');
   try{
    const C=window.AudioContext||window.webkitAudioContext;const context=new C();this.ctx=context;await context.resume();
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());await context.close();return;}
    this.stream=stream;this.source=context.createMediaStreamSource(stream);this.analyser=context.createAnalyser();this.analyser.fftSize=4096;this.source.connect(this.analyser);this.buffer=new Float32Array(4096);this.matcher=new FollowMatcher(score,hand,beat,bounds);this.running=true;this.loop();
   }catch(e){this.stop();throw Error(e.name==='NotAllowedError'?'マイクが許可されていません。Safariのサイト設定でマイクを許可してください。':e.name==='NotFoundError'?'マイクが見つかりませんでした。':e.message||'マイクを開始できませんでした。');}
 }
 loop(){if(!this.running)return;this.analyser.getFloatTimeDomainData(this.buffer);const result=detectPitch(this.buffer,this.ctx.sampleRate),match=this.matcher.accept(result,performance.now());this.onStatus(result.midi==null?'音を待っています…':`${noteName(result.midi)} を検出`,result.rms);if(match)this.onPosition(match);this.timer=setTimeout(()=>this.loop(),60);}
 stop(){this.generation++;this.running=false;clearTimeout(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.source?.disconnect();if(this.ctx&&this.ctx.state!=='closed')this.ctx.close().catch(()=>{});this.ctx=null;}
}
