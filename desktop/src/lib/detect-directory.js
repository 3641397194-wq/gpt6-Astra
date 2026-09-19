'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {guardPath}=require('./seat-transactions');
const definitions={codex:[['CODEX_HOME','CODEX_DIR'],'.codex'],claude:[['CLAUDE_CONFIG_DIR','CLAUDE_HOME'],'.claude'],grok:[['GROK_HOME','GROK_DIR'],'.grok'],deepseek:[['DSH_HOME'],'.dsh'],glm53:[['GLM_HOME','ZHIPU_HOME'],'.glm'],gemini:[['GEMINI_HOME','GEMINI_DIR'],'.gemini']};
function detectDirectory(seat,{env=process.env,home=os.homedir()}={}){
 const def=definitions[seat];if(!def)throw new Error('未知席位');const candidates=[];
 function add(value,source,layout='default'){if(!value)return;value=String(value).trim();if(value.startsWith('~/')||value.startsWith('~\\'))value=path.join(home,value.slice(2));if(!path.isAbsolute(value))throw new Error(`${source} 必须为绝对路径`);const root=path.resolve(value);guardPath(root);if(fs.existsSync(root)&&!fs.statSync(root).isDirectory())throw new Error(`${source} 指向的不是目录`);candidates.push({root,source,layout,exists:fs.existsSync(root)});}
 if(seat==='deepseek'){
  const configured=typeof env.DSH_HOME==='string'&&env.DSH_HOME.trim()?env.DSH_HOME.trim():null;
  let target=configured||path.join(home,'.dsh');
  if(target==='~')target=home;
  if(!target.startsWith('~/')&&!target.startsWith('~\\')&&!path.isAbsolute(target))target=path.resolve(target);
  add(target,configured?'DSH_HOME':'DeepSeek 官方 Harness 配置目录','deepseek-harness');return candidates[0];
 }
 for(const key of def[0])if(env[key]){add(env[key],key);return candidates[0];}
 if(seat==='glm53'&&env.ZCODE_HOME){add(env.ZCODE_HOME,'ZCODE_HOME','zcode');return candidates[0];}
 add(path.join(home,def[1]),'约定配置目录');
 if(seat==='glm53')add(path.join(home,'.zcode'),'ZCode 配置目录','zcode');
 return candidates.find(c=>c.exists)||candidates[0];
}
module.exports={detectDirectory};
