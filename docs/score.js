import {esc,noteName,locate,clamp} from './core.js';
const line=(x1,y1,x2,y2,attrs='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
const text=(x,y,s,attrs='')=>`<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
const near=(a,b)=>Math.abs(a-b)<.00001,black=[1,3,6,8,10];
const steps=[0,0,1,1,2,3,3,4,4,5,5,6],flatSteps=[0,1,1,2,2,3,4,4,5,5,6,6];
const mean=xs=>xs.reduce((a,b)=>a+b,0)/(xs.length||1);
function yPitch(midi,clef,flat){const step=Math.floor(midi/12)*7+(flat?flatSteps:steps)[midi%12];return 40-(step-(clef==='treble'?37:25))*5;}
export function noteX(note,measure){return note.x??(.11+note.beat/measure.beats*.81);}
// A chord shares one stem; notes of different durations remain separate voices.
export function durationStyle(duration){
  for(const base of [4,2,1,.5,.25,.125,.0625]){
    if(near(duration,base))return {base,dotted:false,tuplet:false,flags:Math.max(0,Math.round(Math.log2(1/base)))};
    if(near(duration,base*1.5))return {base,dotted:true,tuplet:false,flags:Math.max(0,Math.round(Math.log2(1/base)))};
  }
  for(const base of [4,2,1,.5,.25,.125])if(near(duration,base*2/3))return {base,dotted:false,tuplet:true,flags:Math.max(0,Math.round(Math.log2(1/base)))};
  const base=2**Math.floor(Math.log2(duration));return {base,dotted:false,tuplet:false,flags:clamp(Math.round(Math.log2(1/base)),0,4)};
}
export function chordGroups(measure){
  const map=new Map();for(const n of measure.notes){const key=[n.hand,n.beat.toFixed(6),n.duration.toFixed(6),n.voice??'',n.midi==null?'rest':'note'].join(':');if(!map.has(key))map.set(key,{hand:n.hand,beat:n.beat,duration:n.duration,notes:[],rest:n.midi==null,...durationStyle(n.duration)});map.get(key).notes.push(n);}
  return [...map.values()].sort((a,b)=>a.beat-b.beat||mean(b.notes.map(n=>n.midi??0))-mean(a.notes.map(n=>n.midi??0)));
}
function columns(measure,groups,options){
  const beats=[...new Set([0,...groups.map(g=>g.beat)])].sort((a,b)=>a-b);
  const gaps=beats.map((beat,i)=>{const at=groups.filter(g=>near(g.beat,beat)),acc=Math.max(0,...at.map(g=>g.notes.filter(n=>n.midi!=null&&black.includes(n.midi%12)).length)),count=Math.max(1,...at.map(g=>g.notes.length)),next=beats[i+1]??measure.beats;return Math.max(options.names?42:29,options.fingers?count*12+5:29,29*Math.sqrt(next-beat))+(count>1?10:0)+Math.min(3,acc)*8;});
  return {beats,gaps,minWidth:Math.max(166,58+gaps.reduce((a,b)=>a+b,0))};
}
function prepareHand(groups,hand,clef,flat,anchors){
  const list=groups.filter(g=>g.hand===hand).map(g=>({...g,notes:g.notes.map(n=>({...n,y:n.midi==null?20:yPitch(n.midi,clef,flat)})),x:anchors.find(a=>near(a[0],g.beat))[1]})),lanes=[];
  for(const g of list){let lane=lanes.findIndex(end=>end<=g.beat+.00001);if(lane<0)lane=lanes.length;lanes[lane]=g.beat+g.duration;g.lane=lane;}
  for(const g of list){const ys=g.notes.map(n=>n.y);g.up=lanes.length>1?g.lane===0:mean(ys)>20;g.min=Math.min(...ys);g.max=Math.max(...ys);g.end=g.up?g.min-35:g.max+35;}
  // Never join across rests, different voices, or beat boundaries.
  const beamGroups=[];
  for(let lane=0;lane<lanes.length;lane++){let run=[];const flush=()=>{if(run.length>1)beamGroups.push(run);run=[];};for(const g of list.filter(g=>g.lane===lane)){const prev=run.at(-1);if(g.rest||!g.flags){flush();continue;}if(prev&&(!near(prev.beat+prev.duration,g.beat)||Math.floor(prev.beat+.00001)!==Math.floor(g.beat+.00001)))flush();run.push(g);}flush();}
  for(const run of beamGroups){const up=lanes.length>1?run[0].up:mean(run.flatMap(g=>g.notes.map(n=>n.y)))>20,end=up?Math.min(...run.map(g=>g.min))-35:Math.max(...run.map(g=>g.max))+35;for(const g of run){g.up=up;g.end=end;g.beamed=true;}}
  const alterations=new Map();
  for(const g of list){
    const ordered=[...g.notes].sort((a,b)=>g.up?b.y-a.y:a.y-b.y);let previous=null;for(const n of ordered){n.dx=previous&&Math.abs(n.y-previous.y)<=5&&previous.dx===0?(g.up?13:-13):0;previous=n;}g.stemX=g.x+(g.up?6.5:-6.5);
    const accCols=[];for(const n of [...g.notes].sort((a,b)=>a.y-b.y)){if(n.midi==null)continue;const altered=black.includes(n.midi%12);n.accidental=altered?(flat?'♭':'♯'):alterations.get(n.y)?'♮':null;alterations.set(n.y,altered);if(!n.accidental)continue;let col=accCols.findIndex(y=>n.y-y>=26);if(col<0)col=accCols.length;accCols[col]=n.y;n.accX=g.x+Math.min(0,...g.notes.map(n=>n.dx))-18-col*11;}
  }
  const sounding=list.filter(g=>!g.rest),min=Math.min(-8,...sounding.flatMap(g=>[g.min-8,g.base<4?g.end-10:g.min-8])),max=Math.max(48,...sounding.flatMap(g=>[g.max+8,g.base<4?g.end+10:g.max+8]));
  return {list,beamGroups,min,max};
}
function drawHand(data,staffY,hand,options,flat){
  let svg=`<g class="staff-notes ${options.hand&&options.hand!=='both'&&options.hand!==hand?'muted-note':''}" transform="translate(0 ${staffY})">`;
  for(const g of data.list){
    svg+=`<g class="chord" data-beat="${g.beat}" data-duration="${g.duration}" data-hand="${hand}">`;
    if(g.rest){const y=data.list.some(o=>o!==g&&!o.rest&&o.beat<=g.beat&&o.beat+o.duration>g.beat)?(g.lane===0?-9:57):20,glyph=g.base>=4?'𝄻':g.base>=2?'𝄼':g.base>=1?'𝄽':g.base>=.5?'𝄾':'𝄿';svg+=text(g.x,y+8,glyph,'class="rest" text-anchor="middle"');}
    else{
      const ledgers=new Map();for(const n of g.notes){for(let y=-10;y>=n.y-1;y-=10){const a=ledgers.get(y)||[Infinity,-Infinity];ledgers.set(y,[Math.min(a[0],g.x+n.dx-11),Math.max(a[1],g.x+n.dx+11)]);}for(let y=50;y<=n.y+1;y+=10){const a=ledgers.get(y)||[Infinity,-Infinity];ledgers.set(y,[Math.min(a[0],g.x+n.dx-11),Math.max(a[1],g.x+n.dx+11)]);}}for(const [y,[a,b]] of ledgers)svg+=line(a,y,b,y,'class="ledger"');
      for(const n of g.notes){const x=g.x+n.dx;svg+=`<ellipse class="note-head" data-note="${esc(n.id)}" cx="${x}" cy="${n.y}" rx="${g.base>=4?8.5:7.1}" ry="4.7" transform="rotate(-18 ${x} ${n.y})" fill="${g.base>=2?'white':'currentColor'}" stroke="currentColor" stroke-width="1.6"/>`;if(n.accX!=null)svg+=text(n.accX,n.y+6,n.accidental,'class="accidental" text-anchor="middle"');}
      if(g.base<4){svg+=line(g.stemX,g.up?g.max:g.min,g.stemX,g.end,'class="note-stem"');if(!g.beamed)for(let f=0;f<g.flags;f++){const dir=g.up?1:-1,y=g.end+dir*f*8;svg+=`<path class="note-flag" d="M${g.stemX} ${y} c17 ${dir*7} 17 ${dir*18} 5 ${dir*25} c6 ${-dir*12} 0 ${-dir*15} -5 ${-dir*17} Z"/>`;}}
    }
    if(g.dotted){const ys=new Set();for(const n of g.notes){let y=n.y%10===0?n.y-5:n.y;while(ys.has(y))y-=10;ys.add(y);svg+=`<circle class="augmentation-dot" cx="${g.x+Math.max(...g.notes.map(n=>n.dx??0))+16}" cy="${y}" r="2.1"/>`;}}
    svg+='</g>';
  }
  for(const run of data.beamGroups){const dir=run[0].up?1:-1;for(let level=0;level<Math.max(...run.map(g=>g.flags));level++){for(let i=0;i<run.length-1;i++)if(run[i].flags>level&&run[i+1].flags>level)svg+=line(run[i].stemX,run[i].end+dir*level*8,run[i+1].stemX,run[i+1].end+dir*level*8,'class="note-beam"');for(let i=0;i<run.length;i++)if(run[i].flags>level&&!(run[i-1]?.flags>level)&&!(run[i+1]?.flags>level)){const g=run[i],hook=i===run.length-1?-10:10;svg+=line(g.stemX,g.end+dir*level*8,g.stemX+hook,g.end+dir*level*8,'class="note-beam"');}}}
  // A visible tuplet number preserves the distinction from ordinary eighths/sixteenths.
  for(const lane of new Set(data.list.map(g=>g.lane))){const tuplets=data.list.filter(g=>g.lane===lane&&g.tuplet);let run=[];const flush=()=>{if(run.length){const a=run[0],b=run.at(-1),count=run.length%6===0?'6':'3',y=data.min-9;svg+=line(a.x-7,y+4,b.x+7,y+4,'class="tuplet-bracket"')+text((a.x+b.x)/2,y+8,count,'class="tuplet-label" text-anchor="middle"');run=[];}};for(const g of tuplets){const p=run.at(-1);if(p&&(!near(p.beat+p.duration,g.beat)||run.length>=6||p.base!==g.base||Math.floor((p.beat+.00001)/Math.max(1,g.base*2))!==Math.floor((g.beat+.00001)/Math.max(1,g.base*2))))flush();run.push(g);}flush();}
  const onsets=new Map();for(const g of data.list.filter(g=>!g.rest)){if(!onsets.has(g.beat))onsets.set(g.beat,[]);onsets.get(g.beat).push(...g.notes);}
  for(const [beat,notes] of onsets){const x=data.list.find(g=>near(g.beat,beat)).x,ordered=[...notes].sort((a,b)=>b.midi-a.midi);if(options.fingers&&notes.some(n=>n.finger))svg+=text(x,data.min-27,ordered.map(n=>n.finger??'–').join('·'),'class="finger-label" text-anchor="middle"');if(options.names)ordered.forEach((n,i)=>svg+=text(x,data.max+19+i*15,flat?['ド','レ♭','レ','ミ♭','ミ','ファ','ソ♭','ソ','ラ♭','ラ','シ♭','シ'][n.midi%12]:noteName(n.midi),'class="note-label" text-anchor="middle"'));}
  return svg+'</g>';
}
export function renderNotation(score,options={}){
  const flat=/[♭b]/.test((score.key||'').split(' ')[0]),available=clamp(options.width||1000,320,1120),margin=65;
  const measures=score.measures.map((m,index)=>{const groups=chordGroups(m);return {m,index,groups,...columns(m,groups,options)};}),systems=[];let row=[],used=margin+18;
  for(const m of measures){if(row.length&&(used+m.minWidth>available||row.length>=4)){systems.push(row);row=[];used=margin+18;}row.push(m);used+=m.minWidth;}if(row.length)systems.push(row);
  let html=`<div class="notation-heading"><div class="sheet-title">${esc(score.title)}</div><div class="sheet-composer">${esc(score.composer)}</div><div class="sheet-tempo">♩ = ${options.tempo??score.tempo}</div></div>`;
  const regions=[],anchors=[],systemSizes=[];
  systems.forEach((items,system)=>{
    const minimum=margin+18+items.reduce((sum,m)=>sum+m.minWidth,0),width=Math.max(available,minimum),extra=(width-minimum)/items.length,leftPitches=items.flatMap(o=>o.m.notes.filter(n=>n.hand==='left'&&n.midi!=null).map(n=>n.midi)).sort((a,b)=>a-b),leftClef=(leftPitches[Math.floor(leftPitches.length/2)]??48)>=60?'treble':'bass';let x=margin;
    for(const item of items){const mw=item.minWidth+extra,stretch=(mw-58)/item.gaps.reduce((a,b)=>a+b,0);let nx=x+42;item.x=x;item.width=mw;const a=item.beats.map((beat,i)=>{const out=[beat,nx];nx+=item.gaps[i]*stretch;return out;});a.push([item.m.beats,x+mw-12]);anchors[item.index]=a;item.right=prepareHand(item.groups,'right','treble',flat,a);item.left=prepareHand(item.groups,'left',leftClef,flat,a);x+=mw;}
    const extents=hand=>({min:Math.min(...items.map(o=>o[hand].min))-(options.fingers?40:22),max:Math.max(...items.map(o=>o[hand].max+(options.names?20+15*Math.max(0,...o[hand].list.map(g=>g.notes.length)):0)))}),right=extents('right'),left=extents('left'),top=26-right.min,bass=top+right.max+32-left.min,height=bass+left.max+38;
    systemSizes.push({width,height});html+=`<div class="notation-system" style="content-visibility:auto;contain-intrinsic-size:auto ${height}px"><svg class="notation" data-system="${system}" viewBox="0 0 ${width} ${height}" style="min-width:${minimum}px" role="img" aria-label="${items[0].index+1}〜${items.at(-1).index+1}小節">`;
    html+=text(11,top+34,'𝄞','class="clef"')+text(11,bass+(leftClef==='treble'?34:30),leftClef==='treble'?'𝄞':'𝄢',`class="clef ${leftClef==='bass'?'bass':''}"`)+line(margin-6,top,margin-6,bass+40,'class="bar-line"');
    for(const item of items){const r={x:item.x,y:5,width:item.width,height:height-15,system};regions[item.index]=r;html+=`<g class="score-measure" data-measure="${item.index}"><rect class="measure-hit" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="5"/>`+text(item.x+5,20,item.index+1,'class="measure-number"');for(const staff of [top,bass])for(let l=0;l<5;l++)html+=line(item.x,staff+l*10,item.x+item.width,staff+l*10,'class="staff-line"');html+=line(item.x+item.width,top,item.x+item.width,bass+40,'class="bar-line"')+drawHand(item.right,top,'right',options,flat)+drawHand(item.left,bass,'left',options,flat)+'</g>';}
    html+='<g class="notation-playhead" style="display:none" pointer-events="none"><rect class="playhead-shade"/><line class="playhead-line"/><circle r="5" class="playhead-dot"/></g></svg></div>';
  });return {html,regions,anchors,systemSizes};
}
// One reference page at a time: no per-note SVG, hit regions, or playback overlays.
export function renderPhotos(score,options={}){
  const index=clamp(Math.trunc(options.photoPage||0),0,score.pages.length-1),p=score.pages[index];if(!p)return '';
  return `<div class="photo-navigation"><button class="btn" data-photo-step="-1" ${index===0?'disabled':''}>← 前</button><label>確認用の写真 <select id="photo-page-select" aria-label="写真のページ">${score.pages.map((_,i)=>`<option value="${i}" ${i===index?'selected':''}>${i+1} / ${score.pages.length} ページ</option>`).join('')}</select></label><button class="btn" data-photo-step="1" ${index===score.pages.length-1?'disabled':''}>次 →</button></div><div class="photo-page" data-page="${esc(p.id)}"><img src="${p.image}" width="${p.width}" height="${p.height}" decoding="async" alt="${esc(score.title)} 確認用の写真 ${index+1}ページ"/></div>`;
}
export function updatePlayhead(container,score,beat,rendered,photo=false){
  const loc=locate(score,beat);if(photo||!rendered)return loc.index;const r=rendered.regions[loc.index],anchors=rendered.anchors[loc.index];if(!r)return loc.index;
  const target=container.querySelector(`[data-system="${r.system}"] .notation-playhead`);if(!target)return loc.index;const previous=container.querySelector('.notation-playhead.active');if(previous&&previous!==target){previous.style.display='none';previous.classList.remove('active');}target.style.display='';target.classList.add('active');
  let a=anchors[0],b=anchors.at(-1);for(let j=0;j<anchors.length-1;j++)if(loc.local>=anchors[j][0]&&loc.local<=anchors[j+1][0]){a=anchors[j];b=anchors[j+1];break;}const x=a[1]+(b[1]-a[1])*clamp((loc.local-a[0])/(b[0]-a[0]||1),0,1),rect=target.querySelector('rect'),ln=target.querySelector('line'),dot=target.querySelector('circle');
  Object.entries({x:x-9,y:r.y,width:18,height:r.height}).forEach(([k,v])=>rect.setAttribute(k,v));Object.entries({x1:x,x2:x,y1:r.y,y2:r.y+r.height}).forEach(([k,v])=>ln.setAttribute(k,v));dot.setAttribute('cx',x);dot.setAttribute('cy',r.y+3);return loc.index;
}
