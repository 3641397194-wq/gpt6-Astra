'use strict';
// Explicit-directory transactions around the repository's unchanged seat plans.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {TextDecoder}=require('node:util');
const runtime=require('./seat-runtime');
const hash=(buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
function guardPath(file){
  let at=path.resolve(file);const chain=[];
  while(true){chain.push(at);const parent=path.dirname(at);if(parent===at)break;at=parent;}
  for(const part of chain.reverse())if(fs.existsSync(part)||(()=>{try{fs.lstatSync(part);return true;}catch{return false;}})()){
    const stat=fs.lstatSync(part);if(stat.isSymbolicLink())throw new Error('目标路径包含符号链接或目录联接，请选择普通目录');
    if(stat.isFile()&&stat.nlink>1)throw new Error('目标文件包含硬链接，请先使用独立副本');
  }
}
function within(root,relative){const file=path.resolve(root,relative),rel=path.relative(root,file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('目标超出已选目录');guardPath(file);return file;}
function read(file){guardPath(file);if(!fs.existsSync(file))return null;const stat=fs.statSync(file);if(!stat.isFile()||stat.size>5*1024*1024)throw new Error('目标不是普通文本文件或超过 5 MB');return fs.readFileSync(file);}
function decode(buffer){if(!buffer)return '';new TextDecoder('utf-8',{fatal:true}).decode(buffer);return buffer.toString('utf8');}
function atomic(file,buffer){guardPath(file);fs.mkdirSync(path.dirname(file),{recursive:true});guardPath(path.dirname(file));const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,buffer,{flag:'wx',mode:0o600});guardPath(file);fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function marked(previous,pack,begin,end){const n1=previous.split(begin).length-1,n2=previous.split(end).length-1;if(!n1&&!n2)return previous+(previous&&!previous.endsWith('\n')?'\n':'')+(previous?'\n':'')+pack;
  if(n1!==1||n2!==1||previous.indexOf(end)<previous.indexOf(begin))throw new Error('检测到损坏或重复的席位标记，请先检查原文件');
  const stop=previous.indexOf(end)+end.length;const body=pack.slice(pack.indexOf(begin),pack.indexOf(end)+end.length);return previous.slice(0,previous.indexOf(begin))+body+previous.slice(stop);
}
function nextText(item,previous,spec){
  if(item.kind==='skill')return item.body.endsWith('\n')?item.body:item.body+'\n';
  if(item.kind==='file')return spec.pack;
  if(item.kind==='marked')return marked(previous,spec.pack,spec.begin,spec.end);
  if(item.kind==='toml'){
    const line=`${item.key} = ${JSON.stringify(item.value)}`;const table=previous.search(/^\s*\[/m);const split=table<0?previous.length:table;const head=previous.slice(0,split),tail=previous.slice(split);const pattern=new RegExp(`^[ \\t]*${item.key}[ \\t]*=.*$`,'gm');const found=[...head.matchAll(pattern)];
    if(found.length>1)throw new Error('配置包含重复顶层字段，请先整理');
    if(found.length)return head.replace(pattern,line)+tail;
    return head+(head&&!head.endsWith('\n')?'\n':'')+line+'\n'+tail;
  }
  if(item.kind==='settings'){
    const data=previous.trim()?JSON.parse(previous.replace(/^\uFEFF/,'')):{};
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('settings.json 顶层应为对象');
    if(data.context!=null&&(typeof data.context!=='object'||Array.isArray(data.context)))throw new Error('context 字段应为对象');
    const context=data.context||{};let names=context.fileName??context.filename??[];if(typeof names==='string')names=[names];if(!Array.isArray(names)||names.some(n=>typeof n!=='string'))throw new Error('context.fileName 格式错误');
    context.fileName=[...new Set([...names,item.name])];data.context=context;return JSON.stringify(data,null,2)+'\n';
  }
  throw new Error('未知写入类型');
}
class SeatTransactions{
  constructor(){this.root=null;this.pending=new Map();}
  select(root,{layout="default"}={}){if(!["default","hermes","zcode"].includes(layout))throw new Error("目录布局错误");if(typeof root!=='string'||!path.isAbsolute(root))throw new Error('请明确选择绝对目录');const resolved=path.resolve(root);if(path.parse(resolved).root===resolved)throw new Error('请选择专用目录，不要选择磁盘根目录');guardPath(resolved);if(fs.existsSync(resolved)&&!fs.statSync(resolved).isDirectory())throw new Error('所选路径不是目录');this.root=resolved;this.layout=layout;this.pending.clear();return {root:this.root};}
  requireRoot(){if(!this.root)throw new Error('先选择目标目录；尚未读取任何用户配置');guardPath(this.root);return this.root;}
  preview(seat){const root=this.requireRoot();if(!runtime.PACK_IDS.includes(seat))throw new Error('未知模型席位');const spec=runtime.plan(seat,root);
    if(this.layout==='hermes'||this.layout==='zcode'){
      if((this.layout==='hermes'&&seat!=='deepseek')||(this.layout==='zcode'&&seat!=='glm53'))throw new Error('席位与目录布局不匹配');
      const nested=path.join(root,this.layout);
      spec.writes=spec.writes.filter(item=>item.file.startsWith(nested+path.sep)).map(item=>({...item,file:path.join(root,path.relative(nested,item.file))}));
    }
    const files=spec.writes.map(item=>{const rel=path.relative(root,item.file);const file=within(root,rel),before=read(file),text=nextText(item,decode(before),spec),after=Buffer.from(text);return {path:rel.replace(/\\/g,'/'),kind:item.kind,before:before?.toString('base64')??null,after:after.toString('base64'),beforeHash:before?hash(before):null,afterHash:hash(after),changed:!before||!before.equals(after)};});
    const id=crypto.randomUUID();const plan={id,seat,root,created:Date.now(),files,pack:spec.pack};this.pending.clear();this.pending.set(id,plan);return {id,seat,root,pack:spec.pack,packHash:hash(spec.pack),changes:files.filter(f=>f.changed).length,files:files.map(({path,kind,beforeHash,afterHash,changed,before,after})=>({path,kind,beforeHash,afterHash,changed,exists:before!==null,bytes:Buffer.from(after,'base64').length})),modelStatus:'未验证：仅处理配置文件'};
  }
  getPlan(id){const plan=this.pending.get(id);if(!plan||plan.root!==this.requireRoot()||Date.now()-plan.created>15*60*1000)throw new Error('预览已过期，请重新预览');return plan;}
  file(id,index){const p=this.getPlan(id),f=p.files[index];if(!Number.isInteger(index)||!f)throw new Error('文件序号错误');return {path:f.path,before:decode(f.before===null?null:Buffer.from(f.before,'base64')),after:decode(Buffer.from(f.after,'base64'))};}
  journal(id){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('版本编号错误');return within(this.requireRoot(),`.coldcoffee-history/${id}.json`);}
  save(snapshot){atomic(this.journal(snapshot.id),Buffer.from(JSON.stringify(snapshot,null,2)));}
  validateCurrent(files,expected){for(const f of files){const value=read(within(this.root,f.path)),digest=value?hash(value):null;if(digest!==f[expected])throw new Error(`文件已被其他操作修改：${f.path}；请重新预览或保留修改后处理`);}}
  deploy(id){const p=this.getPlan(id);this.validateCurrent(p.files,'beforeHash');const changes=p.files.filter(f=>f.changed);if(!changes.length){this.pending.clear();return {ok:true,changed:0,message:'配置已与当前席位包一致，没有重复写入'};}
    const snapshot={id:crypto.randomUUID(),seat:p.seat,root:p.root,at:new Date().toISOString(),status:'preparing',files:changes};this.save(snapshot);const written=[];
    try{for(const f of changes){this.validateCurrent([f],'beforeHash');atomic(within(this.root,f.path),Buffer.from(f.after,'base64'));written.push(f);}snapshot.status='applied';this.save(snapshot);}
    catch(error){const conflicts=[];for(const f of written.reverse()){try{this.validateCurrent([f],'afterHash');const file=within(this.root,f.path);if(f.before===null)fs.unlinkSync(file);else atomic(file,Buffer.from(f.before,'base64'));}catch{conflicts.push(f.path);}}snapshot.status=conflicts.length?'partial':'rolled-back';snapshot.conflicts=conflicts;this.save(snapshot);this.pending.clear();throw new Error(`写入失败：${error.message}；${conflicts.length?'部分文件需人工检查':'本次已写文件已回滚'}`);}
    this.pending.clear();return {ok:true,id:snapshot.id,changed:changes.length,root:this.root,backup:this.journal(snapshot.id),message:'真实文件已写入，备份已保存；模型效果待单独验证'};
  }
  history(){this.requireRoot();const dir=within(this.root,'.coldcoffee-history');if(!fs.existsSync(dir))return [];return fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>JSON.parse(decode(read(within(this.root,'.coldcoffee-history/'+n))))).sort((a,b)=>b.at.localeCompare(a.at)).map(s=>({id:s.id,seat:s.seat,at:s.at,status:s.status,files:s.files.length}));}
  snapshot(id){const s=JSON.parse(decode(read(this.journal(id))));if(s.root!==this.root||s.id!==id||!Array.isArray(s.files))throw new Error('备份与目标目录不匹配');for(const f of s.files){within(this.root,f.path);if(hash(Buffer.from(f.after,'base64'))!==f.afterHash||(f.before!==null&&hash(Buffer.from(f.before,'base64'))!==f.beforeHash))throw new Error('备份完整性检查失败');}return s;}
  verify(seat){const p=this.preview(seat);return {ok:p.changes===0,root:p.root,seat,checks:p.files.map(f=>({path:f.path,ok:!f.changed,exists:f.exists})),modelStatus:'未验证：文件匹配不代表客户端已加载，也不代表模型突破'};}
  restore(id){this.requireRoot();const s=this.snapshot(id);if(s.status!=='applied')throw new Error('此版本不是可恢复的已应用版本');this.validateCurrent(s.files,'afterHash');s.status='restoring';this.save(s);const restored=[];try{for(const f of s.files){this.validateCurrent([f],'afterHash');const file=within(this.root,f.path);if(f.before===null)fs.unlinkSync(file);else atomic(file,Buffer.from(f.before,'base64'));restored.push(f);}s.status='restored';this.save(s);}catch(error){s.status='partial';s.restoredPaths=restored.map(f=>f.path);this.save(s);throw new Error(`恢复中断：${error.message}；备份保留，请检查目录`);}this.pending.clear();return {ok:true,restored:restored.length,message:'原文件已按字节恢复；本次新增文件已移除，空目录与备份保留'};}
}
module.exports={SeatTransactions,guardPath,within,nextText};
