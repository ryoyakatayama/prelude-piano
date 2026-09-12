import {esc} from './core.js';
import {icon} from './icons.js';
import {showDialog} from './dialogs.js';

const standalone=window.matchMedia('(display-mode: standalone)');
let pendingPrompt=null,installed=false,prompting=false;
const isInstalled=()=>installed||standalone.matches||navigator.standalone===true;
const appleMobile=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Mac/.test(navigator.platform)&&navigator.maxTouchPoints>1);
const platform=()=>appleMobile()?'ipad':/Android/.test(navigator.userAgent)?'android':'desktop';

// Keep the browser event until a deliberate tap, including when it arrives after rendering.
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pendingPrompt=event;syncInstallUI();});
window.addEventListener('appinstalled',()=>{installed=true;pendingPrompt=null;syncInstallUI();});
standalone.addEventListener('change',syncInstallUI);

export function installBanner(){return `<section class="install-banner" data-install-promotion ${isInstalled()?'hidden':''} aria-label="アプリのインストール"><img src="./icon-192.png" width="52" height="52" alt=""><div><strong>ホーム画面から、すぐ練習。</strong><p>Préludeをアプリとして追加できます。</p></div><button class="btn primary" data-action="install">${icon('device')}アプリをインストール</button></section>`;}

export function syncInstallUI(){
 document.querySelectorAll('[data-install-promotion]').forEach(el=>{el.hidden=isInstalled();});
 const button=document.querySelector('#install-native');
 if(button){button.hidden=!pendingPrompt||isInstalled();button.disabled=prompting;}
 const status=document.querySelector('#install-result');
 if(status&&isInstalled())status.textContent='追加しました。ホーム画面やアプリ一覧のPréludeアイコンから開けます。';
}

function instructions(device){
 if(device==='ipad')return `<ol class="install-steps"><li><strong>このページをSafariで開く</strong><span>別のアプリで見ている場合は、下のURLをコピーしてSafariで開きます。</span></li><li><strong><span class="share-symbol">${icon('upload')}</span>共有 → ホーム画面に追加</strong><span>Safariの共有ボタンをタップし、メニューを下へスクロールします。</span></li><li><strong>「追加」をタップ</strong><span>「Webアプリとして開く」がある場合はオンにします。ホーム画面にPréludeのアイコンが並びます。</span></li></ol><a class="install-source" href="https://support.apple.com/ja-jp/guide/ipad/ipad8f1f7a29/ipados" target="_blank" rel="noopener noreferrer">Appleの手順を見る ↗</a>`;
 if(device==='android')return `<ol class="install-steps"><li><strong>このページをChromeで開く</strong><span>アプリ内ブラウザーの場合は、下のURLをコピーしてChromeで開きます。</span></li><li><strong>メニュー ⋮ をタップ</strong><span>「アプリをインストール」または「ホーム画面に追加」を選びます。</span></li><li><strong>インストール・追加を確定</strong><span>ホーム画面やアプリ一覧からPréludeを開けます。</span></li></ol>`;
 return `<ol class="install-steps"><li><strong>Chrome または Edge で開く</strong><span>下のURLをコピーして、使いたいブラウザーで開きます。</span></li><li><strong>アドレスバーのインストールアイコンを選ぶ</strong><span>表示されない場合は、ブラウザーのメニューから「アプリ」や「インストール」を探します。</span></li><li><strong>「インストール」を確定</strong><span>アプリ一覧からPréludeを起動できます。MacのSafariでは「ファイル → Dockに追加」も使えます。</span></li></ol>`;
}

function openGuide(){
 const url=new URL('./',location.href).href;
 const d=showDialog('Préludeをインストール',`<div class="install-intro"><img src="./icon-192.png" width="64" height="64" alt=""><div><strong>Prélude</strong><p>いつもの練習室を、ホーム画面に。</p></div></div><button class="btn primary full" id="install-native" ${pendingPrompt?'':'hidden'}>${icon('download')}この端末にインストール</button><div class="install-device-tabs" role="group" aria-label="インストールする端末"><button class="btn" data-install-device="ipad">iPad / iPhone</button><button class="btn" data-install-device="android">Android</button><button class="btn" data-install-device="desktop">パソコン</button></div><div id="install-instructions"></div><div class="notice">追加後はPréludeのアイコンから開き、使いたい曲を「端末に保存」してください。「オフライン準備完了」が表示されると、保存済みの曲を通信なしで練習できます。</div><label class="field install-url-label">アプリのURL<input id="install-url" type="url" value="${esc(url)}" readonly></label><button class="btn full" id="install-copy">${icon('device')}URLをコピーして別の端末でも使う</button><p id="install-result" role="status" aria-live="polite"></p>`);
 const select=device=>{d.querySelector('#install-instructions').innerHTML=instructions(device);d.querySelectorAll('[data-install-device]').forEach(b=>{const active=b.dataset.installDevice===device;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});};
 d.querySelectorAll('[data-install-device]').forEach(b=>b.onclick=()=>select(b.dataset.installDevice));
 d.querySelector('#install-native').onclick=()=>promptInstall(d);
 d.querySelector('#install-copy').onclick=async()=>{try{await navigator.clipboard.writeText(url);d.querySelector('#install-result').textContent='URLをコピーしました。使いたい端末やSafariに貼り付けて開いてください。';}catch{const field=d.querySelector('#install-url');field.focus();field.select();field.setSelectionRange(0,field.value.length);d.querySelector('#install-result').textContent='URLを選択しました。長押し、またはコピー操作でコピーしてください。';}};
 select(platform());syncInstallUI();return d;
}

async function promptInstall(dialog){
 if(prompting)return;
 const event=pendingPrompt;
 if(!event){if(!dialog)openGuide();return;}
 pendingPrompt=null;prompting=true;syncInstallUI();
 try{
  // prompt() must run before any await to preserve the tap's user activation.
  await event.prompt();
  const choice=await event.userChoice;
  if(dialog?.open){dialog.querySelector('#install-result').textContent=choice.outcome==='accepted'?'インストールを受け付けました。端末の案内に従って完了してください。':'インストールをキャンセルしました。下の手順から後で追加できます。';}
 }catch{const d=dialog?.open?dialog:openGuide();d.querySelector('#install-result').textContent='ブラウザーのメニューから追加できます。下の手順をご覧ください。';}
 finally{prompting=false;syncInstallUI();}
}

export function openInstall(){if(isInstalled()){openGuide();return;}if(pendingPrompt)return promptInstall();openGuide();}
