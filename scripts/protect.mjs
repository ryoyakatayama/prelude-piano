import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateScore} from '../docs/core.js';
import {validateVault,encryptAsset} from '../docs/crypto.js';
import {synthesizeWav} from './synthesize.mjs';
const project=fileURLToPath(new URL('../',import.meta.url)),docs=new URL('../docs/',import.meta.url),input=process.argv[2];
if(!input)throw Error('Usage: node scripts/protect.mjs <private-input-directory outside this repository>');
const dir=path.resolve(input),relative=path.relative(project,dir);if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Keep unencrypted source scores outside the public repository.');
const vault=validateVault(JSON.parse(await readFile(new URL('vault.json',docs),'utf8'))),files=(await readdir(dir)).filter(f=>f.endsWith('.piano.json')).sort();if(!files.length)throw Error('No .piano.json source scores found');
await mkdir(new URL('tracks/',docs),{recursive:true});const seen=new Set();
for(const file of files){const score=validateScore(JSON.parse(await readFile(path.join(dir,file),'utf8')));if(seen.has(score.id))throw Error('Duplicate source score id');seen.add(score.id);const meta={id:score.id,title:score.title,composer:score.composer,tempo:score.tempo,measures:score.measures.length};
 const bytes=new TextEncoder().encode(JSON.stringify(score)),wav=synthesizeWav(score);
 try{const encryptedScore=await encryptAsset(bytes,vault,{...meta,kind:'score'}),encryptedAudio=await encryptAsset(wav,vault,{...meta,kind:'audio'});await writeFile(new URL(`tracks/${score.id}.piano.enc.json`,docs),JSON.stringify(encryptedScore)+'\n');await writeFile(new URL(`tracks/${score.id}.wav.enc.json`,docs),JSON.stringify(encryptedAudio)+'\n');}finally{bytes.fill(0);wav.fill(0);}
 console.log(`Encrypted ${score.id}: score and audio. No password required.`);
}
