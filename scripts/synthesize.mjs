import {timeline} from '../docs/core.js';
import {encodeWav} from '../docs/audio.js';
export function synthesizeWav(score){
  const t=timeline(score),sr=22050,seconds=t.total*60/score.tempo+.5;if(seconds>600)throw Error(`${score.id}: audio exceeds 10 minutes`);
  const samples=new Float32Array(Math.ceil(seconds*sr));
  for(const n of t.events){const start=Math.round(n.start*60/score.tempo*sr),duration=n.duration*60/score.tempo*.93,hz=440*2**((n.midi-69)/12),velocity=n.velocity??.65;
   for(let i=0;i<Math.ceil((duration+.22)*sr)&&start+i<samples.length;i++){const time=i/sr,attack=.004,decay=Math.min(.18,duration*.45);let env;if(time<attack)env=.24*time/attack;else if(time<decay)env=.24*(.095/.24)**((time-attack)/(decay-attack));else if(time<duration)env=.095*(.027/.095)**((time-decay)/(duration-decay));else env=.027*(.0001/.027)**((time-duration)/.22);let value=0;for(const [p,a] of [[1,1],[2,.38],[3,.17],[4,.08],[5,.035]])if(hz*p<sr*.45)value+=Math.sin(time*hz*p*2*Math.PI)*a;samples[start+i]+=value*env*velocity*.75;}
  }
  return new Uint8Array(encodeWav(samples,sr));
}
