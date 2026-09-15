'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SeatTransactions,guardPath}=require('../../desktop/src/lib/seat-transactions');
const {ActivationGate}=require('../../desktop/src/lib/activation-gate');
const gate=new ActivationGate();
const root=path.resolve(__dirname,'../..'),tx=new SeatTransactions(),nonce=crypto.randomBytes(32).toString('hex');
const routes={'/':'docs/readme-preview.html','/readme-preview':'docs/readme-preview.html','/workbench/':'desktop/src/workbench/index.html','/assets/brand-avatar-v3.png':'desktop/assets/brand-avatar-v3.png','/assets/coldcoffee-manga-v3.png':'desktop/assets/coldcoffee-manga-v3.png'};
const prefixes={'/docs/':'docs/','/workbench/':'desktop/src/workbench/','/shared/':'desktop/src/shared/','/assets/community/':'desktop/assets/community/'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
http.createServer(async(req,res)=>{
 if(req.headers.host!=='127.0.0.1:8772'&&req.headers.host!=='localhost:8772')return json(res,403,{error:'Host rejected'});
 let url;try{url=new URL(req.url,'http://127.0.0.1:8772');}catch{return json(res,400,{error:'Bad URL'});}
 if(req.method==='GET'&&url.pathname==='/api/session')return json(res,200,{nonce,mode:'isolated-preview'});
 if(req.method==='POST'&&url.pathname==='/api/command'){
   if(req.headers.origin&&!['http://127.0.0.1:8772','http://localhost:8772'].includes(req.headers.origin))return json(res,403,{error:'Origin rejected'});
   if(req.headers['x-coldcoffee-token']!==nonce||req.headers['content-type']!=='application/json')return json(res,403,{error:'Token or content type rejected'});
   try{let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>65536)return json(res,413,{error:'Request too large'});}const {action,payload={}}=JSON.parse(text);let result;
   if(action==='gate-create')result=gate.create(payload.seat);
   else if(action==='gate-input')result=gate.input(payload.id,payload.text);
   else if(action==='gate-reset'){gate.reset(payload.id);result={ok:true};}
   else if(action==='select'){if(!['codex','claude','grok','deepseek','glm53','gemini'].includes(payload.seat))throw new Error('未知席位');result=tx.select(path.join(root,'.coldbrew','interactive-preview',payload.seat));}
   else if(action==='preview')result=tx.preview(payload.seat);
   else if(action==='file')result=tx.file(payload.id,payload.index);
   else if(action==='deploy'){if(payload.confirm!==true)throw new Error('请先确认写入');result=tx.deploy(payload.id);}
   else if(action==='verify')result=tx.verify(payload.seat);
   else if(action==='history')result=tx.history();
   else if(action==='restore'){if(payload.confirm!==true)throw new Error('请先确认恢复');result=tx.restore(payload.id);}
   else throw new Error('未知操作');return json(res,200,{result});
   }catch(error){return json(res,400,{error:error.message});}
 }
 if(req.method!=='GET')return json(res,405,{error:'Method rejected'});
 let name;try{name=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'Bad path'});}
 let relative=routes[name];if(!relative)for(const [prefix,dir]of Object.entries(prefixes)){if(name.startsWith(prefix)){const candidate=path.resolve(root,dir,name.slice(prefix.length)),base=path.resolve(root,dir);if(candidate.startsWith(base+path.sep))relative=path.relative(root,candidate);break;}}
 if(!relative)return json(res,404,{error:'Not found'});try{const file=path.join(root,relative);guardPath(file);if(!fs.statSync(file).isFile())throw new Error();res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);}catch{json(res,404,{error:'Not found'});}
}).listen(8772,'127.0.0.1',()=>console.log('ColdCoffee interactive preview: http://127.0.0.1:8772/workbench/'));
