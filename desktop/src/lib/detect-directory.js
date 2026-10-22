'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {guardPath}=require('./seat-transactions');
const {cursorConfigDir,assertCursorUserDir}=require('./cursor-home');
const {mimoConfigDir,assertMimoUserDir}=require('./mimo-home');
const {kimiCodeHome,assertKimiUserDir}=require('./kimi-home');
const {deepseekHarnessHome}=require('./deepseek-home');
const definitions={codex:[['CODEX_HOME','CODEX_DIR'],'.codex'],claude:[['CLAUDE_CONFIG_DIR','CLAUDE_HOME'],'.claude'],grok:[['GROK_HOME','GROK_DIR'],'.grok'],deepseek:[['DSH_HOME'],'.dsh'],glm53:[['GLM_HOME','ZHIPU_HOME'],'.glm'],gemini:[['GEMINI_HOME','GEMINI_DIR'],'.gemini'],doubao:[['DOUBAO_USER_SKILLS'],'.doubao'],workbuddy:[['WORKBUDDY_HOME'],'.workbuddy'],cursor:[['CURSOR_HOME'],'.cursor'],mimo:[['MIMOCODE_HOME','XDG_CONFIG_HOME'],'.config/mimocode'],kimi:[['KIMI_CODE_HOME'],'.kimi-code']};
function platformDataHome({env=process.env,home=os.homedir(),platform=process.platform}={}){
 if(platform==='win32')return String(env.LOCALAPPDATA||'').trim()||path.join(home,'AppData','Local');
 if(platform==='darwin')return path.join(home,'Library','Application Support');
 return String(env.XDG_DATA_HOME||'').trim()||path.join(home,'.local','share');
}
function detectDirectory(seat,{env=process.env,home=os.homedir(),platform=process.platform}={}){
 const def=definitions[seat];if(!def)throw new Error('未知席位');const candidates=[];
 function add(value,source,layout='default'){if(!value)return;value=String(value);if(layout!=='deepseek-harness')value=value.trim();if(value.startsWith('~/')||value.startsWith('~\\'))value=path.join(home,value.slice(2));if(!path.isAbsolute(value))throw new Error(`${source} 必须为绝对路径`);const root=path.resolve(value);guardPath(root);if(fs.existsSync(root)&&!fs.statSync(root).isDirectory())throw new Error(`${source} 指向的不是目录`);candidates.push({root,source,layout,exists:fs.existsSync(root)});}
 if(seat==='cursor'){
  const configured=String(env.CURSOR_HOME||'').trim();
  const target=assertCursorUserDir(cursorConfigDir(env,home));
  add(target,configured?'CURSOR_HOME':'Cursor 用户目录');
  return candidates[0];
 }
 if(seat==='mimo'){
  const configured=String(env.MIMOCODE_HOME||'').trim();
  const xdg=String(env.XDG_CONFIG_HOME||'').trim();
  const target=assertMimoUserDir(mimoConfigDir(env,home),env,home);
  add(target,configured?'MIMOCODE_HOME/config':xdg?'XDG_CONFIG_HOME/mimocode':'MiMo 用户配置目录');
  return candidates[0];
 }
 if(seat==='kimi'){
  const configured=String(env.KIMI_CODE_HOME||'').trim();
  const target=assertKimiUserDir(kimiCodeHome(env,home),env,home);
  add(target,configured?'KIMI_CODE_HOME':'Kimi Code 数据根');
  return candidates[0];
 }
 if(seat==='workbuddy'){
  let target=env.WORKBUDDY_HOME&&String(env.WORKBUDDY_HOME).trim()?String(env.WORKBUDDY_HOME).trim():path.join(home,'.workbuddy');
  if(target==='~')target=home;
  if(target.startsWith('~/')||target.startsWith('~\\'))target=path.join(home,target.slice(2));
  if(!path.isAbsolute(target))throw new Error('WORKBUDDY_HOME 必须为绝对路径');
  target=path.resolve(target);
  let source='WorkBuddy 用户目录';
  try{if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink()){target=fs.realpathSync(target);source='WorkBuddy 用户目录（目录联接已解析）';}}catch{}
  add(target,source);return candidates[0];
 }
 if(seat==='doubao'){
  if(env.DOUBAO_USER_SKILLS&&String(env.DOUBAO_USER_SKILLS).trim()){add(String(env.DOUBAO_USER_SKILLS).trim(),'DOUBAO_USER_SKILLS');return candidates[0];}
  add(path.join(platformDataHome({env,home,platform}),'Doubao','User Data','Default','.doubao','agent_mode','workspace','.user_skills'),'豆包用户技能目录');
  return candidates[0];
 }
 if(seat==='deepseek'){
  const configured=typeof env.DSH_HOME==='string'&&env.DSH_HOME.trim().length>0;
  const target=deepseekHarnessHome({env,home});
  add(target,configured?'DSH_HOME':'DeepSeek 官方 Harness 配置目录','deepseek-harness');return candidates[0];
 }
 for(const key of def[0])if(env[key]){add(env[key],key);return candidates[0];}
 if(seat==='glm53'&&env.ZCODE_HOME){add(env.ZCODE_HOME,'ZCODE_HOME','zcode');return candidates[0];}
 add(path.join(home,def[1]),'约定配置目录');
 if(seat==='glm53')add(path.join(home,'.zcode'),'ZCode 配置目录','zcode');
 return candidates.find(c=>c.exists)||candidates[0];
}
module.exports={detectDirectory,platformDataHome};
