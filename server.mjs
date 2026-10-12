import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {Readable} from 'node:stream';

const ORIGIN='https://arcana-v3-app-production.up.railway.app';
const VERSION='arcana-codex-v4-20261012-hotfix';
const encoded=JSON.parse(brotliDecompressSync(readFileSync(new URL('./artwork.br',import.meta.url))).toString('utf8'));
const files=new Map(Object.entries(encoded).map(([name,b64])=>[name,Buffer.from(b64,'base64')]));
const manifest=JSON.parse(files.get('manifest.json').toString('utf8'));
const CATEGORIES=Object.keys(manifest.categories);
const REV=process.env.ARCANA_PREVIEW_ONLY==='1';
const ARTWORK_RENDERER="/** Codex-only official IdleArc artwork resolver. Labs/Build Studio untouched. */\nconst norm = value => String(value ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');\nconst kindMap = {'class-skill': 'skills', monster: 'monsters', biome: 'biomes', material: 'materials', item: 'equipment'};\nconst normKey = key => norm(key.split(':').pop().replace(/_/g, '-'));\nfunction lookup(group, key) {\n  if (!group?.mapping) return null;\n  const keys = Object.keys(group.mapping);\n  const matches = keys.filter(k => normKey(k) === norm(key));\n  return matches.length === 1 ? matches[0] : null;\n}\nfunction officialArt(entry, manifest, { assetPrefix = '/codex-art' } = {}) {\n  const kind = entry.gameKind || entry.kind || '';\n  let category = kindMap[kind];\n  let group = manifest?.categories?.[category];\n  let key;\n  if (kind === 'class-skill') {\n    const cls = norm(entry.className || (entry.facts || []).find(([k]) => String(k).toLowerCase() === 'class')?.[1] || '');\n    const exact = Object.keys(group?.mapping || {}).filter(k => k.includes(':') && norm(k.split(':')[0]) === cls && normKey(k) === norm(entry.title));\n    if (exact.length === 1) key = exact[0];\n    else if (!exact.length) key = lookup(group, entry.title);\n  } else {\n    key = lookup(group, entry.title);\n    if (!key && kind === 'item') {\n      category = 'items'; group = manifest?.categories?.[category]; key = lookup(group, entry.title);\n    }\n  }\n  let status = 'exact';\n  if (!key) {\n    const emblem = manifest?.categoryEmblems?.[kind];\n    if (emblem && manifest?.categories?.[emblem[0]]?.mapping?.[emblem[1]] !== undefined) {\n      [category, key] = emblem; group = manifest.categories[category]; status = 'category-emblem';\n    } else return { status: 'missing', entry: entry.title, kind };\n  }\n  const index = group.mapping[key];\n  if (!Number.isInteger(index) || index < 0 || index >= group.cols * group.rows) return { status: 'invalid-index', category, key, index };\n  const col = index % group.cols;\n  const row = Math.floor(index / group.cols);\n  return { status, category, key, index, url: `${assetPrefix}/${category}.webp`, backgroundSize: `${group.cols * 100}% ${group.rows * 100}%`, backgroundPosition: `${group.cols > 1 ? (100 * col / (group.cols - 1)).toFixed(6) : 0}% ${group.rows > 1 ? (100 * row / (group.rows - 1)).toFixed(6) : 0}%` };\n}\n\nexport function codexOfficialArt(entry,size=44){\n const result=officialArt(entry,officialCodexManifest||{categories:officialCodexAtlas||{}},{assetPrefix:'/codex-art'});\n if(result.status==='missing'||result.status==='invalid-index'){\n  if((entry.gameKind||entry.kind)==='item'||(entry.gameKind||entry.kind)==='material')return gameArt(entry,size);\n  return '<span class=\"gameArt gameArt-missing\" data-art-status=\"missing\" aria-label=\"Official artwork unavailable\">◇</span>';\n }\n const safe=String(result.key).replace(/&/g,'&amp;').replace(/\"/g,'&quot;');\n return '<span class=\"gameArt gameArt-original codexOfficialArt\" data-art-status=\"'+result.status+'\" data-official-key=\"'+safe+'\" title=\"Official IdleArc artwork\" style=\"background-image:url('+result.url+');background-size:'+result.backgroundSize+';background-position:'+result.backgroundPosition+'\"></span>';\n}\n";

function patchJs(path,script){
 if(path==='/src/assets.js'){
  const start=script.indexOf('export function codexOfficialArt(entry,size=44){');
  const end=script.indexOf('\n}',start);
  if(start<0||end<start||end-start>4500)throw Error('Artwork renderer section not found in current Arcana source');
  script=script.slice(0,start)+ARTWORK_RENDERER+script.slice(end+2);
  if(!script.includes('let officialCodexAtlas=null;')||!script.includes('officialCodexAtlas=m.categories;'))throw Error('Artwork manifest loader has changed');
  script=script.replace('let officialCodexAtlas=null;','let officialCodexAtlas=null;let officialCodexManifest=null;')
   .replace('officialCodexAtlas=m.categories;','officialCodexManifest=m;officialCodexAtlas=m.categories;');
 }
 if(path==='/src/wiki-views.js'){
  const old="['item','material','class-skill','biome','monster']";
  const full="['item','material','class-skill','biome','monster','pet','rune','runeword','passive','pet-affix','pet-bonus','item-affix','currency','gem','dungeon','goblin','boss']";
  if(!script.includes(old))throw Error('Codex record artwork source not found');
  script=script.replaceAll(old,full);
  script=script.replaceAll('./assets.js?v=codex-native-20261011-v5','./assets.js?v='+VERSION);
 }
 if(path==='/src/app.js')script=script.replaceAll('./wiki-views.js?v=codex-native-20261011-v5','./wiki-views.js?v='+VERSION);
 return script;
}
function contentType(name){return name.endsWith('.webp')?'image/webp':name.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8'}
function respond(res,status,body,type='text/plain; charset=utf-8',method='GET',extra={}){
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Arcana-Codex-Version':'v4-frontend',...extra});
 if(method==='HEAD')return res.end();res.end(body);
}
async function handle(req,res){
 const u=new URL(req.url||'/', 'http://localhost');const p=u.pathname,method=req.method||'GET';
 if(p==='/__arcana_v4_health')return respond(res,200,JSON.stringify({ok:true,mode:'frontend-candidate',upstream:ORIGIN,artworkCategories:CATEGORIES.length,manifestAssets:Object.keys(encoded).length,version:VERSION}), 'application/json',method);
 if(p==='/health')return respond(res,200,JSON.stringify({ok:true,release:'v4',categories:CATEGORIES,assets:CATEGORIES.length,mappingCounts:Object.fromEntries(CATEGORIES.map(k=>[k,Object.keys(manifest.categories[k].mapping||{}).length]))}), 'application/json',method);
 if(p==='/preview'||p==='/art-preview')return respond(res,200,files.get('preview.html'),'text/html; charset=utf-8',method);
 // This route serves both the public asset URLs and Arcana's existing reverse proxy,
 // which strips the /codex-art/ prefix when accessing this service.
 const key=p.replace(/^\/codex-art\//,'').replace(/^\//,'');
 if((key.endsWith('.webp')||key==='manifest.json')&&files.has(key))return respond(res,200,files.get(key),contentType(key),method,{'Cache-Control':key==='manifest.json'?'no-store':'public,max-age=3600','Access-Control-Allow-Origin':'*'});
 const target=ORIGIN+p+u.search;
 try{
   const inHeaders=new Headers();for(const [k,v] of Object.entries(req.headers)){
    if(!['host','connection','transfer-encoding','content-length','accept-encoding'].includes(k)&&typeof v==='string')inHeaders.set(k,v);
   }
   let payload;if(method!=='GET'&&method!=='HEAD'){const chunks=[];for await(const chunk of req)chunks.push(chunk);payload=Buffer.concat(chunks)}
   const upstream=await fetch(target,{method,headers:inHeaders,body:payload,redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(['/','/index.html'].includes(p)){
    let html=await upstream.text();
    const old=html;
    html=html.replace(/(src=["']\/src\/app\.js\?v=)[^"']+/g,'$1'+VERSION);
    if(old===html)html=html.replace(/(src=["']\/src\/app\.js)(["'])/g,'$1?v='+VERSION+'$2');
    return respond(res,upstream.status,html,'text/html; charset=utf-8',method);
   }
   if(method==='GET'&&['/src/assets.js','/src/wiki-views.js','/src/app.js'].includes(p)){
    const script=patchJs(p,await upstream.text());
    return respond(res,upstream.status,script,'text/javascript; charset=utf-8',method);
   }
   const headers=Object.fromEntries(upstream.headers);
   for(const k of ['content-encoding','content-length','transfer-encoding','etag'])delete headers[k];
   headers['cache-control']=p.startsWith('/src/')?'no-store':(headers['cache-control']||'no-store');
   headers['x-arcana-codex-version']='v4-frontend';
   res.writeHead(upstream.status,headers);
   if(method==='HEAD'||!upstream.body)return res.end();
   Readable.fromWeb(upstream.body).pipe(res);
 }catch(e){console.error('ARCANA_V4_PROXY_ERROR',p,e.message);respond(res,502,'Arcana V4 route unavailable: '+p+' ('+e.message+')','text/plain; charset=utf-8',method)}
}
const port=Number(process.env.PORT||3000);
const server=createServer((req,res)=>{void handle(req,res)});
server.listen(port,'0.0.0.0',()=>console.log('Arcana V4 frontend + '+CATEGORIES.length+' artwork categories listening on '+port));
export {patchJs,ARTWORK_RENDERER};
