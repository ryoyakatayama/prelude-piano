import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,unlockVault,verifyPrivateKey,encryptAsset,decryptAsset,fingerprint,validateVault,validateEncryptedAsset,fromBase64,toBase64} from '../docs/crypto.js';
const password=`test-only-${crypto.randomUUID()}`;
let config,key;
test('password opens a non-exportable private key; independent devices can unlock the same config',async()=>{
 config=await createVault(password);key=await unlockVault(password,config);const other=await unlockVault(password,structuredClone(config));assert.equal(await verifyPrivateKey(other,config),true);assert.equal(key.extractable,false);assert.equal(JSON.stringify(config).includes(password),false);await assert.rejects(crypto.subtle.exportKey('pkcs8',key));assert.equal(await fingerprint(config),await fingerprint(structuredClone(config)));
});
test('public key encrypts score and audio without the password; tampering and wrong context fail',async()=>{
 const meta={id:'private-test',kind:'score',title:'Test score',composer:'Test',tempo:80,measures:1};const plaintext=new TextEncoder().encode('private music content');const asset=await encryptAsset(plaintext,config,meta),second=await encryptAsset(plaintext,config,meta);assert.notEqual(asset.iv,second.iv);assert.notEqual(asset.key,second.key);assert.notEqual(asset.data,second.data);assert.deepEqual(await decryptAsset(asset,key,config,{id:meta.id,kind:'score'}),plaintext);
 const audio=await encryptAsset(new Uint8Array([82,73,70,70,1,2,3,4]),config,{...meta,kind:'audio'});assert.equal((await decryptAsset(audio,key,config,{id:meta.id,kind:'audio'}))[0],82);
 for(const field of ['data','key','iv']){const bad=structuredClone(asset),bytes=fromBase64(bad[field]);bytes[0]^=1;bad[field]=toBase64(bytes);await assert.rejects(decryptAsset(bad,key,config,{id:meta.id,kind:'score'}));}
 const changed=structuredClone(asset);changed.metadata.title='Changed';await assert.rejects(decryptAsset(changed,key,config,{id:meta.id,kind:'score'}));await assert.rejects(decryptAsset(asset,key,config,{id:'different',kind:'score'}));await assert.rejects(decryptAsset(asset,key,config,{id:meta.id,kind:'audio'}));assert.throws(()=>validateEncryptedAsset({...asset,plaintext:'accidental leak'}));
});
test('eight numeric digits are accepted; seven characters are rejected',async()=>{const numeric='12345678';const v=await createVault(numeric);assert.equal(await verifyPrivateKey(await unlockVault(numeric,v),v),true);await assert.rejects(createVault('1234567'));});
test('wrong passwords, altered vault configuration, malformed envelopes and weak setup are rejected',async()=>{
 await assert.rejects(unlockVault('wrong-password',config));await assert.rejects(createVault('short'));const bad=structuredClone(config);bad.id='changed';await assert.rejects(unlockVault(password,bad));bad.kdf.iterations=1;assert.throws(()=>validateVault(bad));assert.throws(()=>validateEncryptedAsset({type:'prelude-encrypted-asset',version:99}));assert.throws(()=>fromBase64('%%%%'));assert.throws(()=>fromBase64('AB=='));const other=await createVault(`another-test-${crypto.randomUUID()}`);assert.equal(await verifyPrivateKey(key,other),false);
});
