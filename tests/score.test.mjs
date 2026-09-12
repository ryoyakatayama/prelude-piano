import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNotation,renderPhotos,chordGroups,durationStyle,updatePlayhead} from '../docs/score.js';
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
