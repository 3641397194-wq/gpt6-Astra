'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SeatTransactions,guardPath}=require('../../desktop/src/lib/seat-transactions');
const {ActivationGate}=require('../../desktop/src/lib/activation-gate');
const upstream=require('../../desktop/src/lib/upstream-skills');
const {statusRea}=require('../../desktop/src/lib/upstream-rea-runtime');
const {PACK_IDS}=require('../../desktop/src/lib/seat-runtime');
const localAgentSkills=require('../../desktop/src/lib/local-agent-skills');
const gate=new ActivationGate();
const root=path.resolve(__dirname,'../..'),tx=new SeatTransactions(),nonce=crypto.randomBytes(32).toString('hex');
const port=Number(process.env.PORT||8772);
const routes={'/':'docs/readme-preview.html','/readme-preview':'docs/readme-preview.html','/workbench/':'desktop/src/workbench/index.html','/assets/brand-avatar-v3.png':'desktop/assets/brand-avatar-v3.png','/assets/brand-avatar-v4.png':'desktop/assets/brand-avatar-v4.png','/assets/coldcoffee-manga-v3.png':'desktop/assets/coldcoffee-manga-v3.png','/assets/coldcoffee-manga-v4.png':'desktop/assets/coldcoffee-manga-v4.png','/assets/coldcoffee-manga-v5.jpg':'desktop/assets/coldcoffee-manga-v5.jpg'};
const prefixes={'/docs/':'docs/','/workbench/':'desktop/src/workbench/','/shared/':'desktop/src/shared/','/assets/community/':'desktop/assets/community/'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
function previewRoot(seat){
 if(!PACK_IDS.includes(seat))throw new Error('未知席位');
 const base=path.join(root,'.coldbrew','interactive-preview');
 return path.join(base,seat==='cursor'?'.cursor':seat==='mimo'?'.config/mimocode':seat==='kimi'?'.kimi-code':seat);
}
function layout(seat){return seat==='deepseek'?'deepseek-harness':seat==='glm53'?'zcode':'default';}
function inspectUpstream(seat){
 const selected=previewRoot(seat),check=new SeatTransactions();
 check.select(selected,{layout:layout(seat)});
 const checked=check.verify(seat),summary=checked.upstream;
 return {ok:checked.ok,seat,root:selected,upstream:{...summary,verified:checked.ok,
  runtime:statusRea(selected),message:'只核对项目内合成目录；未读取个人配置。',
  mcp:{...summary.mcp,configured:summary.mcp.configured&&checked.ok,message:checked.ok?summary.mcp.message:'隔离目录尚未安装或内容未匹配；请在高级预览中写入后再核对。'}}};
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
http.createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return json(res,403,{error:'Host rejected'});
 let url;try{url=new URL(req.url,`http://127.0.0.1:${port}`);}catch{return json(res,400,{error:'Bad URL'});}
 if(req.method==='GET'&&url.pathname==='/api/session')return json(res,200,{nonce,mode:'isolated-preview'});
 if(req.method==='POST'&&url.pathname==='/api/command'){
   if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return json(res,403,{error:'Origin rejected'});
   if(req.headers['x-coldcoffee-token']!==nonce||req.headers['content-type']!=='application/json')return json(res,403,{error:'Token or content type rejected'});
   try{let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>65536)return json(res,413,{error:'Request too large'});}const {action,payload={}}=JSON.parse(text);let result;
   if(action==='gate-create')result=gate.create(payload.seat);
   else if(action==='gate-input')result=gate.input(payload.id,payload.text);
   else if(action==='gate-reset'){gate.reset(payload.id);result={ok:true};}
   else if(action==='upstream-catalog')result=upstream.catalog();
   else if(action==='upstream-status')result=inspectUpstream(payload.seat);
   else if(action==='local-skill-list')result=localAgentSkills.list({home:path.join(root,'.coldbrew','interactive-preview','fixture-home'),env:{}}).map(item=>({...item,suggestedSkillsRoot:item.manualRoot?'':item.suggestedSkillsRoot}));
   else if(action==='local-skill-select-default'){const profile=localAgentSkills.list({home:path.join(root,'.coldbrew','interactive-preview','fixture-home'),env:{}}).find(item=>item.id===payload.id);if(!profile||!profile.suggestedSkillsRoot)throw new Error('请手动选择 Agent Skills 目录');result=localAgentSkills.select(payload.id,profile.suggestedSkillsRoot);}
   else if(action==='local-skill-choose'){const selected=path.join(root,'.coldbrew','interactive-preview','local-agent-skills',String(payload.id),'skills');result=localAgentSkills.select(payload.id,selected);}
   else if(action==='local-skill-preview')result=localAgentSkills.preview(payload.id);
   else if(action==='local-skill-install'){if(payload.confirm!==true)throw new Error('请先确认写入');result=localAgentSkills.deploy(payload.id,payload.planId);}
   else if(action==='local-skill-verify')result=localAgentSkills.verify(payload.id);
   else if(action==='local-skill-history')result=localAgentSkills.history(payload.id);
   else if(action==='local-skill-restore'){if(payload.confirm!==true)throw new Error('请先确认恢复');result=localAgentSkills.restore(payload.id,payload.transactionId);}
   else if(action==='select'||action==='auto-select'){const selected=previewRoot(payload.seat);result={...tx.select(selected,{layout:layout(payload.seat)}),exists:fs.existsSync(selected),source:'隔离预览专用合成目录 · 不读取个人目录',layout:layout(payload.seat)};}
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
}).listen(port,'127.0.0.1',()=>console.log(`ColdCoffee interactive preview: http://127.0.0.1:${port}/workbench/`));
