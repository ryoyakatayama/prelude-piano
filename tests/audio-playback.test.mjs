import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=(await readFile(new URL('../docs/audio.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export (function|class|async function) /g,'$1 ');
function setup(){
 const calls=[],contexts=[];
 class AudioContext{
  constructor(){this.state='suspended';this.currentTime=1;this.sampleRate=48000;this.destination={};contexts.push(this);calls.push('create');}
  createGain(){return {connect(){return this;},gain:{value:.8,cancelAndHoldAtTime:t=>calls.push(['hold',t]),setValueAtTime:(v,t)=>calls.push(['set',v,t]),setTargetAtTime:(v,t,c)=>calls.push(['smooth',v,t,c])}};}
  createDynamicsCompressor(){return {connect(){return this;}};}
  createBufferSource(){return {connect(){},start:()=>calls.push('warmup'),disconnect(){}};}
  createBuffer(){return {};}
  resume(){calls.push('resume');this.state='running';return Promise.resolve();}
  close(){calls.push('close');this.state='closed';return Promise.resolve();}
 }
 const audioSession={set type(v){calls.push(['session',v]);}};
 const ctx=vm.createContext({window:{AudioContext},navigator:{audioSession},setTimeout,clearTimeout,clearInterval,cancelAnimationFrame(){},clamp:(v,min,max)=>Math.max(min,Math.min(max,v))});
 vm.runInContext(code+'\nvar transport=new Transport(()=>{});',ctx);
 return {calls,contexts,run:s=>vm.runInContext(s,ctx)};
}

test('tap selects playback routing and resumes/warms audio before its first await',async()=>{
 const a=setup(),ready=a.run('transport.unlock()');assert.deepEqual(a.calls.slice(0,4),[['session','playback'],'create','resume','warmup']);await ready;
});
test('interrupted and backgrounded contexts are discarded before another play',async()=>{
 const a=setup();await a.run('transport.unlock()');a.contexts[0].state='interrupted';await a.run('transport.unlock()');assert.equal(a.contexts.length,2);assert.equal(a.contexts[0].state,'closed');
 a.run('transport.resetAfterBackground()');assert.equal(a.contexts[1].state,'closed');await a.run('transport.unlock()');assert.equal(a.contexts.length,3);
});
test('volume changes preserve current gain then smooth to the new value, including mute',async()=>{
 const a=setup();await a.run('transport.unlock()');a.calls.length=0;a.run('transport.setVolume(.37)');assert.deepEqual(a.calls,[['hold',1],['smooth',.37,1,.02]]);a.run('transport.setVolume(0)');assert.deepEqual(a.calls.at(-1),['smooth',0,1,.02]);a.run('transport.setVolume(2,true)');assert.deepEqual(a.calls.at(-1),['set',1,1]);
});
test('browser without Audio Session API still starts audio',async()=>{
 const a=setup();a.run('delete navigator.audioSession');await a.run('transport.unlock()');assert.equal(a.contexts[0].state,'running');
});
