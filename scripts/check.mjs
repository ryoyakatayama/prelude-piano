import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateVault,validateEncryptedAsset} from '../docs/crypto.js';
const docs=new URL('../docs/',import.meta.url),vault=validateVault(JSON.parse(await readFile(new URL('vault.json',docs),'utf8')));
for(const file of (await readdir(docs)).filter(f=>f.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',new URL(file,docs).pathname.replace(/^\/([A-Z]:)/,'$1')],{encoding:'utf8'});if(result.status)throw Error(`${file}: ${result.stderr}`);}
const catalog=JSON.parse(await readFile(new URL('catalog.json',docs),'utf8'));if(catalog.version!==2||catalog.vault!=='./vault.json')throw Error('Encrypted catalog required');const ids=new Set(),referenced=new Set();
for(const item of catalog.tracks){if(ids.has(item.id)||item.encrypted!==true)throw Error('Duplicate or unprotected track');ids.add(item.id);for(const kind of ['score','audio']){const name=`./tracks/${item.id}.${kind==='score'?'piano':'wav'}.enc.json`,field=kind==='score'?'file':'audioFile';if(item[field]!==name)throw Error('Unsafe catalog path');referenced.add(name.slice(9));const raw=await readFile(new URL(name,docs)),p=validateEncryptedAsset(JSON.parse(raw));if(p.vaultId!==vault.id||p.metadata.kind!==kind)throw Error('Wrong vault or asset kind');for(const k of ['id','title','composer','tempo','measures'])if(item[k]!==p.metadata[k])throw Error('Catalog metadata mismatch');if(kind==='score'&&item.revision!==createHash('sha256').update(raw).digest('hex').slice(0,12))throw Error('Catalog revision mismatch');}}
for(const name of await readdir(new URL('tracks/',docs)))if(!referenced.has(name))throw Error(`Unprotected or unreferenced track: ${name}`);
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())await scan(file);else if(/\.piano\.json$|\.wav$|\.pem$|\.key$|\.pkcs8$/i.test(entry.name))throw Error(`Plaintext music or private key in public assets: ${entry.name}`);}}await scan(docs);
const html=await readFile(new URL('index.html',docs),'utf8');if(!html.includes('noindex'))throw Error('Missing noindex');
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"?]+)"/g))await stat(new URL(match[1],docs));
const sw=await readFile(new URL('sw.js',docs),'utf8'),list=JSON.parse(sw.match(/const ASSETS=(\[[^;]+\]);/)[1]);for(const item of list.filter(a=>a!=='./'))await stat(new URL(item,docs));
for(const needed of ['./crypto.js','./vault.js','./vault.json'])if(!list.includes(needed))throw Error('Missing offline vault asset');if(list.some(a=>a.includes('tracks/')))throw Error('Song cache must be managed per track');
console.log(`Checked ${catalog.tracks.length} encrypted score/audio pairs, no plaintext tracks, syntax and offline assets.`);
