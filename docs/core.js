export const VERSION = 1;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const noteName = midi => midi == null ? '休符' : ['ド','ド♯','レ','レ♯','ミ','ファ','ファ♯','ソ','ソ♯','ラ','ラ♯','シ'][midi % 12];
export const pitchName = midi => midi == null ? '休符' : ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi % 12] + (Math.floor(midi / 12) - 1);
export function parsePitch(input) {
  if (/^(rest|休符|-)$/i.test(input.trim())) return null;
  const m = /^([A-G])([#b]?)(-?\d)$/i.exec(input.trim());
  if (!m) throw Error('音名は C4、F#4、Bb3、休符 のように入力してください。');
  const midi = (Number(m[3])+1)*12 + {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()] + (m[2]==='#'?1:m[2]==='b'?-1:0);
  if (midi < 21 || midi > 108) throw Error('音域は A0〜C8 にしてください。');
  return midi;
}
export function validateScore(input) {
  if (!input || input.version !== VERSION) throw Error('対応形式は version: 1 の .piano.json です。');
  const s = structuredClone(input);
  if (typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)) throw Error('曲IDが不正です。');
  if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 200) throw Error('曲名を200文字以内で設定してください。');
  if (!Number.isFinite(s.tempo) || s.tempo < 20 || s.tempo > 300) throw Error('テンポは20〜300 BPMで設定してください。');
  if (!Array.isArray(s.measures) || !s.measures.length || s.measures.length > 1000) throw Error('小節数は1〜1000にしてください。');
  s.composer = String(s.composer ?? '').slice(0,200);
  s.pages ??= [];
  if (!Array.isArray(s.pages) || s.pages.length > 60) throw Error('写真は60ページ以内にしてください。');
  const pageIds = new Set();
  for (const p of s.pages) {
    if (typeof p.id !== 'string' || pageIds.has(p.id)) throw Error('ページIDが不正です。');
    pageIds.add(p.id);
    if (typeof p.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image) || p.image.length > 20_000_000) throw Error('画像はPNG・JPEG・WebPの埋め込みデータにしてください。');
    if (!(p.width > 0 && p.height > 0 && p.width <= 20000 && p.height <= 20000)) throw Error('画像サイズが不正です。');
  }
  const ids = new Set(); let noteCount = 0;
  for (const [i,m] of s.measures.entries()) {
    m.number = i+1;
    if (!(Number.isFinite(m.beats) && m.beats > 0 && m.beats <= 32)) throw Error(`${i+1}小節の長さが不正です。`);
    if (!Array.isArray(m.notes) || m.notes.length > 512) throw Error(`${i+1}小節の音符データが不正です。`);
    if (m.region) {
      const r = m.region;
      if (!pageIds.has(r.page) || ![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.x<0 || r.y<0 || r.width<=0 || r.height<=0 || r.x+r.width>1.0001 || r.y+r.height>1.0001) throw Error(`${i+1}小節の写真位置が不正です。`);
    }
    for (const [j,n] of m.notes.entries()) {
      n.id ??= `n-${i}-${j}`;
      if (typeof n.id!=='string' || ids.has(n.id)) throw Error('音符IDが重複しています。');
      ids.add(n.id); noteCount++;
      if (!(Number.isFinite(n.beat) && n.beat>=0 && n.beat<m.beats && Number.isFinite(n.duration) && n.duration>0 && n.beat+n.duration<=m.beats+0.001)) throw Error(`${i+1}小節の音符の拍・長さを確認してください。`);
      if (n.midi !== null && !(Number.isInteger(n.midi) && n.midi>=21 && n.midi<=108)) throw Error('音程はMIDI番号21〜108、休符はnullです。');
      if (!['right','left'].includes(n.hand)) throw Error('handはrightまたはleftです。');
      if (n.finger != null && !(Number.isInteger(n.finger) && n.finger>=1 && n.finger<=5)) throw Error('運指は1〜5にしてください。');
      if (n.x != null && !(Number.isFinite(n.x) && n.x>=0 && n.x<=1)) throw Error('音符のxは小節範囲内の0〜1です。');
      if (n.velocity != null && !(Number.isFinite(n.velocity) && n.velocity>0 && n.velocity<=1)) throw Error('強さは0より大きく1以下です。');
    }
    m.notes.sort((a,b)=>a.beat-b.beat || (a.midi??0)-(b.midi??0));
  }
  if (noteCount>50000) throw Error('音符が多すぎます。曲を分けてください。');
  return s;
}
export function timeline(score, hand='both') {
  let start = 0; const events = []; const starts=[];
  score.measures.forEach((m,index)=>{
    starts.push(start);
    m.notes.forEach(n=>{ if(n.midi != null && (hand==='both'||n.hand===hand)) events.push({...n,start:start+n.beat,measure:index}); });
    start += m.beats;
  });
  return {events:events.sort((a,b)=>a.start-b.start),starts,total:start};
}
export function locate(score, beat) {
  let start=0;
  for(let i=0;i<score.measures.length;i++) { const m=score.measures[i]; if(beat<start+m.beats || i===score.measures.length-1) return {index:i,local:clamp(beat-start,0,m.beats),start}; start+=m.beats; }
}
export function loopBounds(score,a,b) {
  const t=timeline(score); const from=clamp(Math.trunc(a),0,score.measures.length-1),to=clamp(Math.trunc(b),from,score.measures.length-1);
  return {start:t.starts[from],end:t.starts[to]+score.measures[to].beats};
}
export function demoScore(id='joy') {
  const melody = id==='scale' ? [[60,62,64,65],[67,69,71,72],[72,71,69,67],[65,64,62,60],[60,64,67,72],[71,67,64,62],[65,69,67,62],[60,60]] : [[64,64,65,67],[67,65,64,62],[60,60,62,64],[64,62,62],[64,64,65,67],[67,65,64,62],[60,60,62,64],[62,60,60],[62,62,64,60],[62,64,65,64,60],[62,64,65,64,62],[60,62,67],[64,64,65,67],[67,65,64,62],[60,60,62,64],[62,60,60]];
  const fingers={60:1,62:2,64:3,65:4,67:5,69:3,71:4,72:5};
  return validateScore({version:1,id,title:id==='scale'?'ハ長調のウォームアップ':'よろこびの歌',composer:id==='scale'?'Prélude オリジナル練習曲':'L. van Beethoven',subtitle:'やさしいピアノ編曲',tempo:id==='scale'?72:88,timeSignature:'4/4',key:'C major',pages:[],fingerings:'suggested',measures:melody.map((p,i)=>{
    const durations=p.length===2?[2,2]:p.length===3?[1.5,0.5,2]:p.length===5?[1,0.5,0.5,1,1]:[1,1,1,1];
    let beat=0; const notes=p.map((midi,j)=>{const n={id:`r${i}-${j}`,beat,duration:durations[j],midi,hand:'right',finger:fingers[midi]};beat+=durations[j];return n;});
    const chord=i%4===1||i%4===3?[43,55,59]:[48,55,60];
    chord.forEach((midi,j)=>notes.push({id:`l${i}-${j}`,beat:0,duration:4,midi,hand:'left',finger:[5,2,1][j]}));
    return {number:i+1,beats:4,notes};
  })});
}
