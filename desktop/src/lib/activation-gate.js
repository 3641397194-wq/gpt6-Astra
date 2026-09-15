'use strict';
const crypto=require('node:crypto');
const {PACK_IDS,renderPack,activationReply}=require('./seat-packs');
// This layer must be wired into the host's actual message pipeline to enforce gating.
// A plain prompt file alone is not an enforcement mechanism.
class ActivationGate {
 constructor({pack=renderPack,reply=activationReply,clock=Date.now}={}){this.sessions=new Map();this.pack=pack;this.reply=reply;this.clock=clock;}
 create(seat){if(!PACK_IDS.includes(seat))throw new Error('未知席位');for(const[id,s]of this.sessions)if(this.clock()-s.last>30*60*1000)this.sessions.delete(id);if(this.sessions.size>=100)this.sessions.delete(this.sessions.keys().next().value);const id=crypto.randomUUID();this.sessions.set(id,{seat,active:false,last:this.clock()});return {id,seat,active:false,trigger:'冷咖啡'};}
 reset(id){this.sessions.delete(id);}
 session(id){const s=this.sessions.get(id);if(!s||this.clock()-s.last>30*60*1000){this.sessions.delete(id);throw new Error('会话不存在或已过期，请新建会话');}s.last=this.clock();return s;}
 input(id,text){if(typeof text!=='string'||text.length>20000)throw new Error('输入应为不超过 20000 字符的文本');const s=this.session(id);const exact=text.trim()==='冷咖啡';if(exact){s.active=true;return {active:true,activatedNow:true,seat:s.seat,reply:this.reply(),instructionText:this.pack(s.seat),note:'程序开关已开启；原欢迎文案不代表模型权限或突破效果'};}
 if(!s.active)return {active:false,activatedNow:false,seat:s.seat,reply:'待机中。整条消息输入「冷咖啡」后启动。',instructionText:'',note:'未向客户端放行词包'};
 return {active:true,activatedNow:false,seat:s.seat,reply:'当前会话已激活，词包可交给已接入的客户端处理下一条消息。',instructionText:this.pack(s.seat),note:'本地接入验证，不是模型实际回答'};
 }
}
module.exports={ActivationGate};
