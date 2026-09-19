'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {detectDirectory}=require('../src/lib/detect-directory');
const {SeatTransactions}=require('../src/lib/seat-transactions');
const base=path.resolve(__dirname,'../../.coldbrew/discovery-tests');fs.mkdirSync(base,{recursive:true});
function fixture(fn){const home=fs.mkdtempSync(path.join(base,'case-'));try{fn(home);}finally{assert.ok(path.resolve(home).startsWith(base+path.sep));fs.rmSync(home,{recursive:true,force:true});}}
for(const [seat,dir] of Object.entries({codex:'.codex',claude:'.claude',grok:'.grok',deepseek:'.dsh',glm53:'.glm',gemini:'.gemini'}))test(`${seat}: discover without writing`,()=>fixture(home=>{const r=detectDirectory(seat,{home,env:{}});assert.equal(r.root,path.join(home,dir));assert.equal(r.exists,false);assert.deepEqual(fs.readdirSync(home),[]);}));
test('explicit environment wins and expands tilde',()=>fixture(home=>{const r=detectDirectory('codex',{home,env:{CODEX_HOME:'~/custom',CODEX_DIR:path.join(home,'ignored')}});assert.equal(r.root,path.join(home,'custom'));assert.equal(r.source,'CODEX_HOME');assert.throws(()=>detectDirectory('codex',{home,env:{CODEX_HOME:'relative'}}),/绝对/);}));
test('reject file and junction targets',()=>fixture(home=>{fs.writeFileSync(path.join(home,'.codex'),'x');assert.throws(()=>detectDirectory('codex',{home,env:{}}),/目录/);const target=path.join(home,'target');fs.mkdirSync(target);fs.symlinkSync(target,path.join(home,'.claude'),'junction');assert.throws(()=>detectDirectory('claude',{home,env:{}}),/符号链接/);}));
for(const [seat,layout,variable,entry,folder] of [['deepseek','deepseek-harness','DSH_HOME','AGENTS.md','.dsh'],['glm53','zcode','ZCODE_HOME','AGENTS.md','.zcode']])test(`${layout}: discover actual root, install once, verify and restore`,()=>fixture(home=>{const root=path.join(home,folder);fs.mkdirSync(root);const r=detectDirectory(seat,{home,env:{}});assert.equal(r.root,root);assert.equal(r.layout,layout);const custom=detectDirectory(seat,{home,env:{[variable]:path.join(home,'custom')}});assert.equal(custom.layout,layout);const tx=new SeatTransactions();tx.select(r.root,{layout:r.layout});const p=tx.preview(seat);assert.ok(p.files.some(f=>f.path===entry));assert.ok(p.files.length>6);assert.ok(p.files.every(f=>!f.path.startsWith(layout+'/')));assert.deepEqual(fs.readdirSync(root),[]);const applied=tx.deploy(p.id);assert.equal(tx.verify(seat).ok,true);assert.equal(tx.preview(seat).changes,0);tx.restore(applied.id);assert.equal(fs.existsSync(path.join(root,entry)),false);assert.throws(()=>tx.preview('codex'),/不匹配/);}));

test('DeepSeek uses only official DSH_HOME and never selects legacy or Hermes homes',()=>fixture(home=>{
 const legacy=path.join(home,'.deepseek'),hermes=path.join(home,'.hermes');fs.mkdirSync(legacy);fs.mkdirSync(hermes);
 const env={DEEPSEEK_HOME:legacy,DEEPSEEK_DIR:legacy,HERMES_HOME:hermes};
 assert.equal(detectDirectory('deepseek',{home,env}).root,path.join(home,'.dsh'));
 assert.equal(detectDirectory('deepseek',{home,env:{...env,DSH_HOME:'   '}}).root,path.join(home,'.dsh'));
 assert.equal(detectDirectory('deepseek',{home,env:{...env,DSH_HOME:'~/official'}}).root,path.join(home,'official'));
 assert.equal(detectDirectory('deepseek',{home,env:{DSH_HOME:'~'}}).root,home);
 assert.deepEqual(fs.readdirSync(legacy),[]);assert.deepEqual(fs.readdirSync(hermes),[]);
 const tx=new SeatTransactions();assert.throws(()=>tx.select(hermes,{layout:'hermes'}),/布局/);
}));
