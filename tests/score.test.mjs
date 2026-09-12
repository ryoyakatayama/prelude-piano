import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScore,timeline} from '../docs/core.js';
import {renderNotation,renderPhotos,chordGroups,durationStyle,updatePlayhead,fitTwoSystems,notationLayout} from '../docs/score.js';
const n=(midi,beat=0,duration=1,hand='right')=>({id:`${hand}-${midi}-${beat}-${duration}`,midi,beat,duration,hand});
const score=notes=>({title:'Test',composer:'',tempo:80,pages:[],measures:[{beats:4,notes}]});
test('quarter and eighth triads share one stem, with flags only for an eighth',()=>{
 for(const duration of [1,.5]){const html=renderNotation(score([60,64,67].map(m=>n(m,0,duration)))).html;assert.equal((html.match(/class="note-head"/g)||[]).length,3);assert.equal((html.match(/class="note-stem"/g)||[]).length,1);assert.equal((html.match(/class="note-flag"/g)||[]).length,duration===.5?1:0);}
});
test('adjacent eighth chords are beamed once, without per-note flags',()=>{
 const html=renderNotation(score([60,64,67].flatMap(m=>[n(m,0,.5),n(m,.5,.5)]))).html;assert.equal((html.match(/class="note-stem"/g)||[]).length,2);assert.equal((html.match(/class="note-beam"/g)||[]).length,1);assert.ok(!html.includes('class="note-flag"'));
});
test('overlapping voices with different lengths are not merged into one chord',()=>{
 const s=score([n(60,0,2),n(64,0,.5),n(67,0,.5),n(64,.5,.5)]);assert.deepEqual(chordGroups(s.measures[0]).map(g=>g.notes.length).sort(),[1,1,2]);const html=renderNotation(s).html;assert.equal((html.match(/class="note-stem"/g)||[]).length,3);
});
test('dotted and triplet durations retain their correct note values',()=>{
 assert.deepEqual(durationStyle(1.5),{base:1,dotted:true,tuplet:false,flags:0});assert.equal(durationStyle(.75).flags,1);assert.equal(durationStyle(1/3).flags,1);assert.equal(durationStyle(1/6).flags,2);assert.equal(durationStyle(2/3).flags,0);assert.equal(durationStyle(1/3).tuplet,true);
});
test('seconds move to opposite sides of the shared stem',()=>{
 const html=renderNotation(score([60,62,64].map(m=>n(m)))).html,heads=[...html.matchAll(/class="note-head"[^>]*cx="([^"]+)"/g)].map(m=>Number(m[1]));assert.equal(new Set(heads).size,2);assert.equal(Math.max(...heads)-Math.min(...heads),13);
});
test('notation anchors ignore photo spacing, align both hands and do not mutate music',()=>{
 const s=score([n(60,0,.5),n(64,.5,.5),n(48,0,2,'left')]);s.measures[0].notes.forEach((n,i)=>n.x=[.95,.05,.3][i]);const before=JSON.stringify(s),r=renderNotation(s,{width:500});assert.equal(JSON.stringify(s),before);assert.ok(r.anchors[0][0][1]<r.anchors[0][1][1]);assert.equal(r.regions.length,1);
});
test('photos render just the selected image and never create overlays',()=>{
 const s=score([n(60)]);s.pages=[0,1,2].map(i=>({id:`p${i}`,image:`data:image/jpeg;base64,AA${i}=`,width:100,height:200}));const html=renderPhotos(s,{photoPage:1,fingers:true,names:true});assert.equal((html.match(/<img /g)||[]).length,1);assert.ok(html.includes('AA1='));assert.ok(!html.includes('<svg'));assert.ok(!html.includes('data-measure'));assert.equal(updatePlayhead({querySelector(){throw Error('Photos must not inspect overlays');}},s,0,null,true),0);
});

test('short grace playback times use printed small sixteenths, never invented 64ths',()=>{
 const s=score([n(84,0,.075),n(85,.075,.075),n(87,.15,.35)]);
 s.measures[0].notes.slice(0,2).forEach(n=>n.notation={durations:[.25],grace:true});s.measures[0].notes[2].notation={durations:[.5]};
 const groups=chordGroups(s.measures[0]),html=renderNotation(s).html;
 assert.deepEqual(groups.map(g=>g.flags),[2,2,1]);assert.equal((html.match(/class="chord grace-note"/g)||[]).length,2);assert.equal((html.match(/rx="4.6"/g)||[]).length,2);
 assert.equal(durationStyle(.075).unknown,true);assert.equal(durationStyle(.075).flags,0);assert.equal(durationStyle(.0625).flags,4);
});

test('tied values draw both noteheads and a tie without retriggering the playback event',()=>{
 const s=score([{...n(69,.75,1.25),notation:{durations:[.25,1]}}]),before=JSON.stringify(s),html=renderNotation(s).html;
 assert.equal((html.match(/class="note-head"/g)||[]).length,2);assert.equal((html.match(/class="note-tie"/g)||[]).length,1);
 assert.deepEqual(chordGroups(s.measures[0]).map(g=>g.beat),[.75,1]);assert.equal(timeline(s).events.length,1);assert.equal(timeline(s).events[0].duration,1.25);assert.equal(JSON.stringify(s),before);
});

test('notation metadata validates tied totals and grace values on import',()=>{
 const s={...score([{...n(69,0,1.25),notation:{durations:[.25,1]}}]),version:1,id:'rhythm'};
 assert.equal(validateScore(s).measures[0].notes[0].notation.durations.length,2);
 s.measures[0].notes[0].notation.durations=[1,1];assert.throws(()=>validateScore(s),/タイ/);
 s.measures[0].notes[0].notation={durations:[0],grace:true};assert.throws(()=>validateScore(s),/記譜/);
});

test('selected measures per system overrides automatic wrapping and retains every measure',()=>{
 const s=score([n(60)]);s.measures=Array.from({length:11},(_,i)=>({beats:4,notes:[n(60+i),n(64+i,.5,.5)]}));const before=JSON.stringify(s);
 for(const count of [1,2,3,4,6,8]){const r=renderNotation(s,{width:320,measuresPerSystem:count});assert.equal(r.systemSizes.length,Math.ceil(11/count));r.regions.forEach((m,i)=>assert.equal(m.system,Math.floor(i/count)));assert.ok(!r.html.includes('min-width:'));}
 assert.equal(JSON.stringify(s),before);
});

test('two-system fit accounts for the tallest adjacent pair, labels and spacing',()=>{
 const sizes=[{width:900,height:320},{width:1400,height:500},{width:1100,height:760}],width=720,height=430,z=fitTwoSystems(sizes,width,height);
 assert.ok(z>0&&z<1);for(let i=0;i<sizes.length-1;i++)assert.ok((sizes[i].height+sizes[i+1].height+48+60)*z<=height);
 assert.equal(fitTwoSystems(sizes,width,2000),1);
});

test('sparse and dense systems retain identical note scale at every zoom',()=>{
 const s=score([n(60)]);s.measures.push({beats:4,notes:Array.from({length:16},(_,i)=>n(64,i/4,.25))});
 const r=renderNotation(s,{width:600,measuresPerSystem:1});assert.notEqual(r.systemSizes[0].width,r.systemSizes[1].width);
 for(const zoom of [.3,.4,.75,1,2]){const layout=notationLayout(r.systemSizes,zoom,600);layout.systems.forEach((system,i)=>{assert.ok(Math.abs(system.width/r.systemSizes[i].width-zoom)<1e-12);assert.ok(Math.abs(system.height/r.systemSizes[i].height-zoom)<1e-12);});assert.equal(layout.width,Math.max(...layout.systems.map(s=>s.width)));}
});

test('name and fingering toggles preserve wrapping, note positions and automatic scale',()=>{
 const s=score([n(60)]);s.measures=Array.from({length:9},(_,i)=>({beats:4,notes:[...Array.from({length:i%3+2},(_,j)=>n(60+j*2,0,2)),n(72,.5,.5)]}));
 for(const count of [0,1,4,8]){const baseline=renderNotation(s,{width:680,measuresPerSystem:count,names:false,fingers:false});
  for(const options of [{names:true},{fingers:true},{names:true,fingers:true}]){const r=renderNotation(s,{width:680,measuresPerSystem:count,...options});assert.deepEqual(r.systemSizes,baseline.systemSizes);assert.deepEqual(r.regions,baseline.regions);assert.deepEqual(r.anchors,baseline.anchors);assert.equal(fitTwoSystems(r.systemSizes,680,450),fitTwoSystems(baseline.systemSizes,680,450));assert.ok(!baseline.html.includes('class="note-label"'));if(options.names)assert.ok(r.html.includes('class="note-label"'));}
 }
});
