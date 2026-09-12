import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {validateScore} from '../docs/core.js';
const docs=new URL('../docs/',import.meta.url);
for(const file of (await readdir(docs)).filter(f=>f.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',new URL(file,docs).pathname.replace(/^\/([A-Z]:)/,'$1')],{encoding:'utf8'});if(result.status)throw Error(`${file}: ${result.stderr}`);}
const catalog=JSON.parse(await readFile(new URL('catalog.json',docs),'utf8'));const ids=new Set();for(const item of catalog.tracks){if(ids.has(item.id))throw Error('Duplicate track id');ids.add(item.id);const data=validateScore(JSON.parse(await readFile(new URL(item.file,docs),'utf8')));if(data.id!==item.id)throw Error('Catalog id mismatch');}
const html=await readFile(new URL('index.html',docs),'utf8');if(!html.includes('noindex'))throw Error('Missing noindex');
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"?]+)"/g))await stat(new URL(match[1],docs));
const sw=await readFile(new URL('sw.js',docs),'utf8'),list=JSON.parse(sw.match(/const ASSETS=(\[[^;]+\]);/)[1]);for(const item of list.filter(a=>a!=='./'))await stat(new URL(item,docs));
console.log(`Checked ${catalog.tracks.length} scores, JavaScript syntax, manifest, entrypoint and offline assets.`);
