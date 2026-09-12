import {esc,noteName,locate,clamp} from './core.js';
const line=(x1,y1,x2,y2,attrs='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
const text=(x,y,s,attrs='')=>`<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
const steps=[0,0,1,1,2,3,3,4,4,5,5,6];
function yPitch(midi,hand,top) { const step=Math.floor(midi/12)*7+steps[midi%12];return top+40-(step-(hand==='right'?37:25))*5; }
export function noteX(note,measure) { return note.x ?? (0.11+note.beat/measure.beats*0.81); }
export function renderNotation(score,options={}) {
  const cols=4, width=1120, margin=72, usable=width-margin*2, mw=usable/cols;
  const rows=Math.ceil(score.measures.length/cols),height=130+rows*254;
  let svg=`<svg class="notation" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(score.title)}の楽譜">`;
  svg+=text(width/2,43,score.title,'text-anchor="middle" class="sheet-title"')+text(width-72,78,score.composer,'text-anchor="end" class="sheet-composer"');
  svg+=text(73,90,`♩ = ${options.tempo??score.tempo}`,'class="sheet-tempo"');
  const regions=[];
  score.measures.forEach((m,i)=>{
    const row=Math.floor(i/cols),col=i%cols,x=margin+col*mw,top=136+row*254;
    const r={x,y:top-42,width:mw,height:209}; regions.push(r);
    svg+=`<g class="score-measure" data-measure="${i}"><rect class="measure-hit" x="${x}" y="${top-42}" width="${mw}" height="209" rx="5"/>`;
    svg+=text(x+7,top-28,i+1,'class="measure-number"');
    for(const staff of [0,100]) for(let l=0;l<5;l++)svg+=line(x,top+staff+l*10,x+mw,top+staff+l*10,'class="staff-line"');
    svg+=line(x+mw,top,x+mw,top+140,'class="bar-line"');
    if(col===0){svg+=text(x-41,top+34,'𝄞','class="clef"')+text(x-39,top+127,'𝄢','class="clef bass"');svg+=`<path d="M${x-9} ${top} Q${x-24} ${top+15} ${x-18} ${top+53} Q${x-18} ${top+67} ${x-27} ${top+70} Q${x-18} ${top+74} ${x-18} ${top+89} Q${x-24} ${top+125} ${x-9} ${top+140}" fill="none" stroke="currentColor" stroke-width="2"/>`;}
    for(const n of m.notes){
      const nx=x+noteX(n,m)*mw,staff=top+(n.hand==='left'?100:0),y=n.midi==null?staff+22:yPitch(n.midi,n.hand,staff);
      const faded=options.hand!=='both'&&options.hand&&n.hand!==options.hand;
      svg+=`<g class="note ${faded?'muted-note':''}" data-note="${esc(n.id)}">`;
      if(n.midi==null){svg+=text(nx,y,'𝄽','font-size="27" text-anchor="middle"');}
      else {
        for(let ly=staff-10;ly>=y-1;ly-=10)svg+=line(nx-11,ly,nx+11,ly,'class="ledger"');
        for(let ly=staff+50;ly<=y+1;ly+=10)svg+=line(nx-11,ly,nx+11,ly,'class="ledger"');
        const hollow=n.duration>=2;
        svg+=`<ellipse cx="${nx}" cy="${y}" rx="7.4" ry="5.1" transform="rotate(-18 ${nx} ${y})" fill="${hollow?'white':'currentColor'}" stroke="currentColor" stroke-width="1.8"/>`;
        if(n.duration<4) {
          const up=n.hand==='right',sx=nx+(up?6:-6),end=y+(up?-31:31);
          svg+=line(sx,y,sx,end,'stroke="currentColor" stroke-width="1.7"');
          if(n.duration<1)svg+=`<path d="M${sx} ${end} q${up?16:-16} ${up?9:-9} 2 ${up?22:-22}" fill="none" stroke="currentColor" stroke-width="2.5"/>`;
          if(n.duration<0.5)svg+=`<path d="M${sx} ${end+(up?8:-8)} q${up?16:-16} ${up?9:-9} 2 ${up?20:-20}" fill="none" stroke="currentColor" stroke-width="2"/>`;
        }
        if([0.75,1.5,3].includes(n.duration))svg+=`<circle cx="${nx+13}" cy="${y-3}" r="2"/>`;
        if([1,3,6,8,10].includes(n.midi%12))svg+=text(nx-19,y+5,'♯','font-size="21"');
        const chord=m.notes.filter(other=>other.beat===n.beat&&other.hand===n.hand&&other.midi!=null);
        if(chord[0]===n){
          if(options.fingers&&chord.some(c=>c.finger))svg+=text(nx,n.hand==='right'?staff-16:staff+66,chord.map(c=>c.finger??'–').join('·'),'text-anchor="middle" class="finger-label"');
          if(options.names)svg+=text(nx,n.hand==='right'?staff+69:staff+88,chord.map(c=>noteName(c.midi)).join('·'),'text-anchor="middle" class="note-label"');
        }
      }
      svg+='</g>';
    }
    svg+='</g>';
  });
  svg+='<g id="playhead" pointer-events="none"><rect class="playhead-shade"/><line class="playhead-line"/><circle r="5" class="playhead-dot"/></g></svg>';
  return {html:svg,regions,width,height};
}
export function renderPhotos(score,options={}) {
  return score.pages.map((p,index)=>{
    let overlays='';
    score.measures.forEach((m,i)=>{const r=m.region;if(r?.page!==p.id)return;const x=r.x*1000,y=r.y*1000,w=r.width*1000,h=r.height*1000;
      overlays+=`<g class="score-measure" data-measure="${i}"><rect class="photo-hit measure-hit" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="photo-number" x="${x+4}" y="${y+14}">${i+1}</text>`;
      m.notes.forEach(n=>{if(n.midi==null)return;const chord=m.notes.filter(other=>other.beat===n.beat&&other.hand===n.hand&&other.midi!=null);if(chord[0]!==n)return;const nx=x+noteX(n,m)*w,ny=y+(n.hand==='right'?h*0.13:h*0.85);if(options.fingers&&chord.some(c=>c.finger))overlays+=text(nx,ny,chord.map(c=>c.finger??'–').join('·'),'class="photo-label finger-label" text-anchor="middle"');if(options.names)overlays+=text(nx,ny+17,chord.map(c=>noteName(c.midi)).join('·'),'class="photo-label note-label" text-anchor="middle"');});
      overlays+='</g>';
    });
    return `<div class="photo-page" data-page="${esc(p.id)}"><img src="${p.image}" alt="${esc(score.title)} ${index+1}ページ"/><svg viewBox="0 0 1000 1000" preserveAspectRatio="none">${overlays}<g class="photo-playhead" pointer-events="none"><rect class="playhead-shade"/><line class="playhead-line"/></g></svg></div>`;
  }).join('');
}
export function updatePlayhead(container,score,beat,rendered,photo=false){
  const loc=locate(score,beat),m=score.measures[loc.index];
  // Interpolate between note anchors, so a photographed score need not be evenly spaced.
  const anchors=[...new Map(m.notes.map(n=>[n.beat,noteX(n,m)])).entries()].sort((a,b)=>a[0]-b[0]);
  if(!anchors.length||anchors[0][0]>0)anchors.unshift([0,0.11]);
  anchors.push([m.beats,0.96]);
  let a=anchors[0],b=anchors.at(-1);for(let j=0;j<anchors.length-1;j++)if(loc.local>=anchors[j][0]&&loc.local<=anchors[j+1][0]){a=anchors[j];b=anchors[j+1];break;}
  const ratio=a[1]+(b[1]-a[1])*clamp((loc.local-a[0])/(b[0]-a[0]||1),0,1);
  let target,r;
  if(photo){container.querySelectorAll('.photo-playhead').forEach(e=>e.style.display='none');const region=m.region;if(!region)return loc.index;const page=[...container.querySelectorAll('.photo-page')].find(el=>el.dataset.page===region.page);target=page?.querySelector('.photo-playhead');r={x:region.x*1000,y:region.y*1000,width:region.width*1000,height:region.height*1000};}
  else {target=container.querySelector('#playhead');r=rendered.regions[loc.index];}
  if(!target||!r)return loc.index;
  target.style.display='';const x=r.x+ratio*r.width; const rect=target.querySelector('rect'),ln=target.querySelector('line'),dot=target.querySelector('circle');
  Object.entries({x:x-10,y:r.y,width:20,height:r.height}).forEach(([k,v])=>rect.setAttribute(k,v));
  Object.entries({x1:x,x2:x,y1:r.y,y2:r.y+r.height}).forEach(([k,v])=>ln.setAttribute(k,v));
  if(dot){dot.setAttribute('cx',x);dot.setAttribute('cy',r.y);}
  return loc.index;
}
