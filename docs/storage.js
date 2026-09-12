import {validateScore} from './core.js';
let promise;
function db(){return promise??=new Promise((resolve,reject)=>{const r=indexedDB.open('prelude-piano-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('scores',{keyPath:'id'});r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('端末保存を開けませんでした。Safariの通常モードでお試しください。'));r.onblocked=()=>reject(Error('ほかのPréludeタブを閉じて、もう一度開いてください。'));});}
async function transact(store,mode,action){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,mode);let result;const r=action(tx.objectStore(store));if(r)r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error(tx.error?.name==='QuotaExceededError'?'端末の空き容量が足りません。不要な曲を削除してください。':'端末への保存に失敗しました。バックアップ後に再度お試しください。'));tx.onabort=()=>reject(Error('保存処理を完了できませんでした。'));});}
export const getScores=()=>transact('scores','readonly',s=>s.getAll());
export const getScore=id=>transact('scores','readonly',s=>s.get(id));
export const putScore=score=>transact('scores','readwrite',s=>s.put(validateScore(score)));
export const removeScore=id=>transact('scores','readwrite',s=>s.delete(id));
export const getSetting=key=>transact('settings','readonly',s=>s.get(key));
export const putSetting=(key,value)=>transact('settings','readwrite',s=>s.put(value,key));
export async function restoreBackup(data){if(data?.type!=='prelude-backup'||data.version!==1||!Array.isArray(data.scores)||data.scores.length>1000)throw Error('Préludeのバックアップではありません。');const scores=data.scores.map(validateScore);const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(['scores','settings'],'readwrite');for(const s of scores)tx.objectStore('scores').put(s);for(const [key,value] of Object.entries(data.preferences??{}))if(key.startsWith('practice:')||key==='global')tx.objectStore('settings').put(value,key);tx.oncomplete=()=>resolve(scores.length);tx.onerror=tx.onabort=()=>reject(Error('復元できませんでした。端末の空き容量をご確認ください。'));});}
export async function createBackup(){const scores=await getScores(),preferences={};for(const s of scores){const p=await getSetting(`practice:${s.id}`);if(p)preferences[`practice:${s.id}`]=p;}preferences.global=await getSetting('global');return {type:'prelude-backup',version:1,createdAt:new Date().toISOString(),scores,preferences};}
export async function requestPersistence(){if(!navigator.storage?.persist)return false;return navigator.storage.persist();}
export const downloadFile=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);};
export const downloadJson=(data,name)=>downloadFile(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);
