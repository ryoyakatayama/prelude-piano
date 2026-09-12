import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=(await readFile(new URL('../docs/install.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export function ','function ');
function app({standalone=false,iosStandalone=false}={}){
 const listeners={},promotions=[{hidden:false},{hidden:false}],media={matches:standalone,addEventListener:(name,fn)=>{listeners.media=fn;}};
 const context=vm.createContext({window:{matchMedia:()=>media,addEventListener:(name,fn)=>{listeners[name]=fn;}},navigator:{standalone:iosStandalone},document:{querySelectorAll:()=>promotions,querySelector:()=>null},icon:()=>'',esc:x=>x});
 vm.runInContext(code,context);
 return {listeners,promotions,media,run:source=>vm.runInContext(source,context)};
}

test('standalone launch hides install promotion, including iPad standalone',()=>{
 for(const options of [{standalone:true},{iosStandalone:true}]){const a=app(options);a.run('syncInstallUI()');assert.ok(a.promotions.every(p=>p.hidden));assert.match(a.run('installBanner()'),/data-install-promotion hidden/);}
});

test('late install event is retained and prompted synchronously once per event',async()=>{
 const a=app();let prevented=false,calls=0,finish;
 const wait=new Promise(resolve=>{finish=resolve;});
 a.listeners.beforeinstallprompt({preventDefault:()=>{prevented=true;},prompt:()=>{calls++;return wait;},userChoice:Promise.resolve({outcome:'dismissed'})});
 assert.ok(prevented);
 const pending=a.run('openInstall()');assert.equal(calls,1);
 await a.run('promptInstall()');assert.equal(calls,1);
 finish();await pending;
 a.listeners.beforeinstallprompt({preventDefault(){},prompt:()=>{calls++;},userChoice:Promise.resolve({outcome:'accepted'})});
 await a.run('openInstall()');assert.equal(calls,2);
});

test('installation and display-mode changes refresh existing UI without rebuilding it',()=>{
 const a=app();a.run('syncInstallUI()');assert.ok(a.promotions.every(p=>!p.hidden));
 a.media.matches=true;a.listeners.media();assert.ok(a.promotions.every(p=>p.hidden));
 a.media.matches=false;a.listeners.media();assert.ok(a.promotions.every(p=>!p.hidden));
 a.listeners.appinstalled();assert.ok(a.promotions.every(p=>p.hidden));
});
