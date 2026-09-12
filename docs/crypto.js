// Shared by the browser and Node.js. Passwords and unwrapped private keys never leave the device.
const utf8=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
export const KDF_ITERATIONS=600000;
const MAX_BYTES=100*1024*1024;
const requireCrypto=()=>{if(!globalThis.crypto?.subtle)throw Error('暗号化にはHTTPSと新しいSafari / Chromeが必要です。');return globalThis.crypto.subtle;};
export function toBase64(value){const bytes=new Uint8Array(value);let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
export function fromBase64(value,max=MAX_BYTES){if(typeof value!=='string'||!value.length||value.length>Math.ceil(max/3)*4||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('暗号化データの形式が不正です。');const result=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(result.length>max||toBase64(result)!==value)throw Error('暗号化データの形式が不正です。');return result;}
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
function exactFields(value,fields){if(!value||typeof value!=='object'||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k)))throw Error('暗号化データに予期しない項目があります。');}
function vaultAAD(v){return utf8.encode(JSON.stringify(['prelude-vault',1,v.id,v.publicKey]));}
export function validateVault(v){
 exactFields(v,['type','version','id','publicKey','kdf','privateKey']);exactFields(v.kdf,['name','hash','iterations','salt']);exactFields(v.privateKey,['algorithm','iv','data']);
 if(v?.type!=='prelude-vault'||v.version!==1||!safeId(v.id)||v.kdf?.name!=='PBKDF2'||v.kdf.hash!=='SHA-256'||v.kdf.iterations!==KDF_ITERATIONS||v.privateKey?.algorithm!=='AES-GCM')throw Error('このライブラリの鍵設定には対応していません。');
 if(fromBase64(v.kdf.salt,16).length!==16||fromBase64(v.privateKey.iv,12).length!==12||fromBase64(v.publicKey,1024).length<256||fromBase64(v.privateKey.data,8192).length<1024)throw Error('鍵設定が壊れています。');
 return v;
}
async function passwordKey(password,v){if(typeof password!=='string'||password.length>1024)throw Error('パスワードを確認してください。');const subtle=requireCrypto(),material=await subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);return subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:fromBase64(v.kdf.salt,16),iterations:v.kdf.iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function createVault(password){
 if(typeof password!=='string'||[...password].length<8||password.length>1024)throw Error('パスワードは8文字以上（数字だけでも可）で設定してください。');
 const subtle=requireCrypto(),pair=await subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt','wrapKey','unwrapKey']);
 const v={type:'prelude-vault',version:1,id:crypto.randomUUID(),publicKey:toBase64(await subtle.exportKey('spki',pair.publicKey)),kdf:{name:'PBKDF2',hash:'SHA-256',iterations:KDF_ITERATIONS,salt:toBase64(crypto.getRandomValues(new Uint8Array(16)))},privateKey:{algorithm:'AES-GCM',iv:toBase64(crypto.getRandomValues(new Uint8Array(12)))}};
 const raw=new Uint8Array(await subtle.exportKey('pkcs8',pair.privateKey));
 try{v.privateKey.data=toBase64(await subtle.encrypt({name:'AES-GCM',iv:fromBase64(v.privateKey.iv,12),additionalData:vaultAAD(v)},await passwordKey(password,v),raw));}finally{raw.fill(0);}
 return validateVault(v);
}
export async function fingerprint(v){validateVault(v);return toBase64(await requireCrypto().digest('SHA-256',utf8.encode(JSON.stringify([v.id,v.publicKey,v.kdf,v.privateKey]))));}
export async function importPublicKey(v){validateVault(v);return requireCrypto().importKey('spki',fromBase64(v.publicKey,1024),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt','wrapKey']);}
export async function verifyPrivateKey(key,v){try{const subtle=requireCrypto(),challenge=crypto.getRandomValues(new Uint8Array(32)),sealed=await subtle.encrypt({name:'RSA-OAEP'},await importPublicKey(v),challenge),opened=new Uint8Array(await subtle.decrypt({name:'RSA-OAEP'},key,sealed));return !key.extractable&&key.type==='private'&&opened.length===challenge.length&&opened.every((b,i)=>b===challenge[i]);}catch{return false;}}
export async function unlockVault(password,v){
 validateVault(v);let raw;
 try{const subtle=requireCrypto();raw=new Uint8Array(await subtle.decrypt({name:'AES-GCM',iv:fromBase64(v.privateKey.iv,12),additionalData:vaultAAD(v)},await passwordKey(password,v),fromBase64(v.privateKey.data,8192)));const key=await subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt','unwrapKey']);if(!await verifyPrivateKey(key,v))throw Error('key mismatch');return key;}
 catch{throw Error('パスワードが違うか、鍵設定が破損しています。');}finally{raw?.fill(0);}
}
function metadata(value){exactFields(value,['id','kind','title','composer','tempo','measures']);if(!safeId(value.id)||!['score','audio'].includes(value.kind)||typeof value.title!=='string'||value.title.length>200||typeof value.composer!=='string'||value.composer.length>200||!Number.isFinite(value.tempo)||value.tempo<20||value.tempo>300||!Number.isInteger(value.measures)||value.measures<1||value.measures>1000)throw Error('曲の暗号化情報が不正です。');return {id:value.id,kind:value.kind,title:value.title,composer:value.composer,tempo:value.tempo,measures:value.measures};}
function trackAAD(p){return utf8.encode(JSON.stringify(['prelude-encrypted-asset',1,p.vaultId,metadata(p.metadata)]));}
export function validateEncryptedAsset(p){exactFields(p,['type','version','vaultId','algorithm','metadata','iv','key','data']);if(p.type!=='prelude-encrypted-asset'||p.version!==1||!safeId(p.vaultId)||p.algorithm!=='AES-256-GCM+RSA-OAEP-SHA256')throw Error('暗号化された曲データではありません。');metadata(p.metadata);if(fromBase64(p.iv,12).length!==12||fromBase64(p.key,384).length!==384||fromBase64(p.data,MAX_BYTES+16).length<16)throw Error('暗号化された曲データが壊れています。');return p;}
export async function encryptAsset(bytes,v,meta){
 validateVault(v);if(!(bytes instanceof Uint8Array)||bytes.length>MAX_BYTES)throw Error('暗号化できるデータは100MBまでです。');const subtle=requireCrypto(),key=await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
 const p={type:'prelude-encrypted-asset',version:1,vaultId:v.id,algorithm:'AES-256-GCM+RSA-OAEP-SHA256',metadata:metadata(meta),iv:toBase64(crypto.getRandomValues(new Uint8Array(12))),key:toBase64(await subtle.wrapKey('raw',key,await importPublicKey(v),{name:'RSA-OAEP'}))};
 p.data=toBase64(await subtle.encrypt({name:'AES-GCM',iv:fromBase64(p.iv,12),additionalData:trackAAD(p)},key,bytes));return p;
}
export async function decryptAsset(p,key,v,expected){
 validateVault(v);validateEncryptedAsset(p);if(p.vaultId!==v.id||p.metadata.id!==expected.id||p.metadata.kind!==expected.kind)throw Error('この曲とライブラリの鍵が一致しません。');
 try{const subtle=requireCrypto(),aes=await subtle.unwrapKey('raw',fromBase64(p.key,384),key,{name:'RSA-OAEP'},{name:'AES-GCM',length:256},false,['decrypt']);return new Uint8Array(await subtle.decrypt({name:'AES-GCM',iv:fromBase64(p.iv,12),additionalData:trackAAD(p)},aes,fromBase64(p.data,MAX_BYTES+16)));}catch{throw Error('曲データを開けませんでした。破損しているか、鍵が一致しません。');}
}
export const parseDecryptedJson=bytes=>JSON.parse(decode.decode(bytes));
