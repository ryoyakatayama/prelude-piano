import {validateVault,unlockVault,fingerprint,verifyPrivateKey,decryptAsset,parseDecryptedJson,encryptAsset} from './crypto.js';
import {getSetting,putSetting,removeSetting,downloadJson} from './storage.js';
import {showDialog} from './dialogs.js';
import {validateScore,esc} from './core.js';
import {renderWav} from './audio.js';
import {icon} from './icons.js';

export async function fetchBoundedJson(url,maxBytes=145*1024*1024){
 const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('ダウンロードできませんでした。通信状態を確認してください。');
 if(Number(response.headers.get('content-length'))>maxBytes)throw Error('データが大きすぎます。');
 const reader=response.body?.getReader();if(!reader){const text=await response.text();if(new Blob([text]).size>maxBytes)throw Error('データが大きすぎます。');return JSON.parse(text);}
 const parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('データが大きすぎます。');}parts.push(value);}}finally{reader.releaseLock();}
 return JSON.parse(await new Blob(parts).text());
}

export class LibraryVault{
 constructor(onChange=()=>{}){this.config=null;this.key=null;this.remembered=false;this.onChange=onChange;this.pending=null;this.revision=null;}
 async refresh(){
  let config;try{config=validateVault(await fetchBoundedJson(new URL('./vault.json',location.href),20000));await putSetting('vault-config',config);}catch(error){config=await getSetting('vault-config').catch(()=>null);if(!config){this.error=error.message;return;}}
  validateVault(config);const revision=await fingerprint(config);if(this.revision!==revision){this.key=null;this.remembered=false;this.revision=revision;this.config=config;const stored=await getSetting('vault-key').catch(()=>null);if(stored?.revision===revision&&await verifyPrivateKey(stored.key,config)){this.key=stored.key;this.remembered=true;}else if(stored)await removeSetting('vault-key');}
  this.config=config;this.error=null;this.onChange();
 }
 banner(){return `<div class="vault-banner"><span class="vault-badge">${icon(this.key?'check':'lock')}</span><div><strong>${this.key?'パスワード確認済み':'曲のダウンロードにはパスワードが必要です'}</strong><p>${this.key?(this.remembered?'この端末では次回から入力を省略します。':'この画面を閉じるまで有効です。'):'同じパスワードで、iPad・PCから使えます。'} 保存済みの曲はオフラインでも練習できます。</p></div><button class="btn ${this.key?'':'primary'}" data-action="${this.key?'vault-lock':'vault-unlock'}">${this.key?'入力の記憶を解除':'パスワードを入力'}</button></div>`;}
 async forget(){await removeSetting('vault-key');this.key=null;this.remembered=false;this.onChange();}
 async requireKey(){
  if(this.key)return this.key;if(this.pending)return this.pending;if(!this.config)await this.refresh();if(!this.config)throw Error('鍵設定を取得できません。オンラインで一覧を更新してください。');
  const config=this.config,revision=this.revision;
  this.pending=new Promise(resolve=>{
   const d=showDialog('曲のパスワード',`<p>ほかの端末と同じ共通パスワードを入力してください。</p><form id="vault-form"><label class="field" style="margin-top:20px">パスワード<input id="vault-password" type="password" autocomplete="current-password" maxlength="1024" required></label><label class="remember-choice"><input id="vault-remember" type="checkbox">この端末で覚える</label><p class="helper">自分のiPad・PCで選ぶと、次回の入力を省略できます。保存済みの曲はパスワード入力なしで練習できます。</p><div class="error-text" id="vault-error" role="alert"></div><div class="dialog-actions"><button class="btn" type="button" id="vault-cancel">キャンセル</button><button class="btn primary" id="vault-submit" type="submit">曲を開けるようにする</button></div></form>`),form=d.querySelector('#vault-form');let settled=false;
   const finish=value=>{if(!settled){settled=true;resolve(value);}};
   d.addEventListener('close',()=>{form.querySelector('#vault-password').value='';finish(null);},{once:true});form.querySelector('#vault-cancel').onclick=()=>d.close();
   form.onsubmit=async event=>{event.preventDefault();const input=form.querySelector('#vault-password'),button=form.querySelector('#vault-submit'),message=form.querySelector('#vault-error'),remember=form.querySelector('#vault-remember').checked;button.disabled=true;button.textContent='確認しています…';message.textContent='';
    try{const key=await unlockVault(input.value,config);input.value='';if(settled||!d.open||!d.contains(form))return;if(this.revision!==revision)throw Error('鍵設定が更新されました。画面を開き直してください。');
     let remembered=false;if(remember){try{await putSetting('vault-key',{revision,key});remembered=true;}catch{message.textContent='この端末に記憶できなかったため、今回は画面を閉じるまで有効です。';}}else await removeSetting('vault-key');
     this.key=key;this.remembered=remembered;finish(key);d.close();this.onChange();
    }catch(error){input.value='';message.textContent=error.message;input.focus();}finally{button.disabled=false;button.textContent='曲を開けるようにする';}
   };form.querySelector('#vault-password').focus();
  });
  try{return await this.pending;}finally{this.pending=null;}
 }
 async openScore(envelope,expectedId){const key=await this.requireKey();if(!key)return null;const bytes=await decryptAsset(envelope,key,this.config,{id:expectedId??envelope.metadata?.id,kind:'score'});try{const score=validateScore(parseDecryptedJson(bytes));if(score.id!==envelope.metadata.id||score.title!==envelope.metadata.title||score.composer!==envelope.metadata.composer||score.tempo!==envelope.metadata.tempo||score.measures.length!==envelope.metadata.measures)throw Error('曲の情報が一致しません。');return score;}finally{bytes.fill(0);}}
 async readImport(data){return data?.type==='prelude-encrypted-asset'?this.openScore(data):validateScore(data);}
 async exportProtected(score,toast){
  if(!this.config)await this.refresh();if(!this.config)throw Error('オンラインで鍵設定を取得してからお試しください。');const config=this.config,base={id:score.id,title:score.title,composer:score.composer,tempo:score.tempo,measures:score.measures.length};
  const d=showDialog('GitHub追加用に暗号化',`<p><strong>${esc(score.title)}</strong> を、同じパスワードで開けるファイルにします。作成したファイルをこのチャットに渡して、GitHubへの追加を依頼してください。</p><button class="btn primary full" id="encrypt-score">${icon('lock')}楽譜・音符を暗号化して書き出す</button><button class="btn full" id="encrypt-audio">${icon('music')}練習音源を暗号化して書き出す</button><p class="helper">曲名・作曲者・テンポ・小節数は一覧用に公開されます。写真・音符・音源の内容は暗号化されます。</p><p id="encryption-status" role="status"></p><div class="error-text" id="encryption-error" role="alert"></div>`);
  for(const kind of ['score','audio'])d.querySelector(`#encrypt-${kind}`).onclick=async e=>{const button=e.currentTarget;button.disabled=true;d.querySelector('#encryption-status').textContent='準備しています…';try{const bytes=kind==='score'?new TextEncoder().encode(JSON.stringify(validateScore(score))):new Uint8Array(await (await renderWav(score,{tempo:score.tempo,hand:'both',volume:.8})).arrayBuffer());try{const encrypted=await encryptAsset(bytes,config,{...base,kind});downloadJson(encrypted,`${score.id}.${kind==='score'?'piano':'wav'}.enc.json`);}finally{bytes.fill(0);}d.querySelector('#encryption-status').textContent='暗号化したファイルを書き出しました。';toast('暗号化して書き出しました');}catch(error){d.querySelector('#encryption-error').textContent=error.message;}finally{button.disabled=false;}};
 }
}
