import {clamp} from './core.js';
export function nearestMeasure(rects,x,y){let best=null,distance=Infinity;for(const item of rects){const r=item.rect,dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom),d=dx*dx+dy*dy+.0001*((x-(r.left+r.right)/2)**2+(y-(r.top+r.bottom)/2)**2);if(d<distance){distance=d;best=item.index;}}return best;}
export function moveLoopEdge(a,b,edge,index,total){const i=clamp(Math.round(index),0,total-1);return edge==='a'?{a:Math.min(i,b),b}:{a,b:Math.max(i,a)};}
export function installLoopTouch({root,getState,getScore,onStart,onMove,onEnd}){
 let drag=null,raf=0;
 const elements=()=>[...root.querySelectorAll('#score [data-measure] .measure-hit')].map(el=>({index:Number(el.closest('[data-measure]').dataset.measure),rect:el.getBoundingClientRect()}));
 function position(){const state=getState(),container=root.querySelector('#score');if(!container)return;if(state.photo){container.querySelector('.loop-handles')?.remove();return;}let layer=container.querySelector('.loop-handles');if(!layer){layer=document.createElement('div');layer.className='loop-handles';layer.innerHTML=`<div class="loop-edge" data-loop-edge="a"><button class="loop-handle" data-loop-handle="a" aria-label="リピート開始位置。左右キーで小節を変更" title="Aをドラッグして開始小節を変更">A<span>⠿</span></button></div><div class="loop-edge" data-loop-edge="b"><button class="loop-handle" data-loop-handle="b" aria-label="リピート終了位置。左右キーで小節を変更" title="Bをドラッグして終了小節を変更">B<span>⠿</span></button></div>`;container.append(layer);}
  layer.hidden=!state.loop;const origin=container.getBoundingClientRect(),rects=elements();
  for(const edge of ['a','b']){const el=layer.querySelector(`[data-loop-edge="${edge}"]`),item=rects.find(r=>r.index===state[edge]);el.hidden=!item;if(!item)continue;const r=item.rect;el.style.left=`${(edge==='a'?r.left+3:r.right-3)-origin.left}px`;el.style.top=`${r.top-origin.top}px`;el.style.height=`${r.height}px`;el.querySelector('button').setAttribute('aria-valuetext',`${state[edge]+1}小節`);}
 }
 function tick(){if(!drag)return;const pane=root.querySelector('#sheet-scroll'),r=pane.getBoundingClientRect();const dy=drag.y<r.top+45?-Math.min(12,(r.top+45-drag.y)*.25):drag.y>r.bottom-45?Math.min(12,(drag.y-r.bottom+45)*.25):0;const dx=drag.x<r.left+30?-7:drag.x>r.right-30?7:0;if(dy)pane.scrollTop+=dy;if(dx)pane.scrollLeft+=dx;
  const index=nearestMeasure(elements(),drag.x,drag.y);if(index!=null){const state=getState(),next=moveLoopEdge(state.a,state.b,drag.edge,index,getScore().measures.length);if(next.a!==state.a||next.b!==state.b)onMove(next);position();}raf=requestAnimationFrame(tick);
 }
 root.addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-loop-handle]');if(!handle||event.button!==0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);drag={edge:handle.dataset.loopHandle,x:event.clientX,y:event.clientY,id:event.pointerId,handle};handle.classList.add('dragging');root.classList.add('loop-dragging');onStart();raf=requestAnimationFrame(tick);});
 root.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();drag.x=event.clientX;drag.y=event.clientY;});
 function end(event){if(!drag||event.pointerId!==drag.id)return;cancelAnimationFrame(raf);const {handle,id}=drag;drag=null;handle.classList.remove('dragging');root.classList.remove('loop-dragging');try{handle.releasePointerCapture(id);}catch{}onEnd();}
 root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);
 root.addEventListener('keydown',event=>{const handle=event.target.closest('[data-loop-handle]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const edge=handle.dataset.loopHandle,state=getState(),delta=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;onStart();onMove(moveLoopEdge(state.a,state.b,edge,state[edge]+delta,getScore().measures.length));position();onEnd();});
 window.addEventListener('resize',()=>requestAnimationFrame(position));
 return {position};
}
