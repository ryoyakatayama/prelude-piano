import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../docs/',import.meta.url)));
const port=Number(process.env.PORT||43189);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'};
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');let name=decodeURIComponent(u.pathname);const prefix=process.env.BASE_PATH||'';if(prefix&&name.startsWith(prefix))name=name.slice(prefix.length);let file=path.resolve(root,'.'+name);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if((await stat(file)).isDirectory())file=path.join(file,'index.html');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);}catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Prélude: http://127.0.0.1:${port}`));
