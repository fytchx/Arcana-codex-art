import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

// The archive contains official in-game sprites supplied by the game community.
const encoded = JSON.parse(brotliDecompressSync(readFileSync(new URL('./artwork.br', import.meta.url))).toString('utf8'));
const files = new Map(Object.entries(encoded).map(([name,data]) => [name,Buffer.from(data,'base64')]));
const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
const groups = Object.keys(manifest.categories);
const port = Number(process.env.PORT || 3000);

const server = createServer((req,res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const respond = (status, data, type, cache='no-store') => {
    res.writeHead(status, { 'Content-Type':type, 'Cache-Control':cache, 'Access-Control-Allow-Origin':'*', 'X-Content-Type-Options':'nosniff' });
    if(req.method !== 'HEAD')res.end(data); else res.end();
  };
  if(req.method !== 'GET' && req.method !== 'HEAD')return respond(405,'Method not allowed','text/plain');
  if(url.pathname === '/health')return respond(200, JSON.stringify({ok:true,release:'v4',categories:groups,assets:groups.length,mappingCounts:Object.fromEntries(groups.map(k=>[k,Object.keys(manifest.categories[k].mapping).length]))}),'application/json');
  if(url.pathname === '/' || url.pathname === '/preview')return respond(200,files.get('preview.html'),'text/html; charset=utf-8');
  const name = url.pathname.replace(/^\/codex-art\//,'').replace(/^\//,'');
  if(!files.has(name)||(!name.endsWith('.webp')&&name!=='manifest.json'))return respond(404,'Not found','text/plain');
  return respond(200,files.get(name),name==='manifest.json'?'application/json; charset=utf-8':'image/webp',name==='manifest.json'?'no-store':'public, max-age=3600');
});
server.listen(port, '0.0.0.0',()=>console.log(`Arcana V4 art online: ${groups.length} categories on port ${port}`));
