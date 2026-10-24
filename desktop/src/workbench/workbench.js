'use strict';
const core = window.ColdCoffeeCore;
const $ = (id) => document.getElementById(id);
const state = {seat:'codex',profile:'max',history:[],counter:0,result:null,busy:false,relayReady:false,relayProvider:'gpt-6-astra',relayBusy:false,relayTesting:false,relayModels:[],relayRevision:0,localSkillNonce:'',workflow:{plan:null,task:null,events:[],ida:null,poll:null,aiBusy:false}};
const hashSeat = location.hash.replace('#','');
if (core.SEATS.some(s => s.id === hashSeat)) state.seat = hashSeat;
let toastTimer;
function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500); }
function setRelaySubmitEnabled(enabled) {
  const submit = $('relay-submit-task');
  if (!submit) return;
  submit.disabled = !enabled || state.relayBusy || state.busy || !state.relayModels.includes(relayInput('relay-provider'));
  submit.title = enabled ? '发送到冷咖啡中转；此操作可能产生服务端用量' : '先到“冷咖啡中转”页填写 API Key 并测试连接';
}
function relayResponseText(payload) {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const parts = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (typeof item === 'string') parts.push(item);
    for (const content of (Array.isArray(item?.content) ? item.content : [])) {
      if (typeof content === 'string') parts.push(content);
      else if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content ?? choice?.text;
    if (typeof content === 'string') parts.push(content);
    else if (Array.isArray(content)) for (const item of content) if (typeof item?.text === 'string') parts.push(item.text);
  }
  const text = parts.filter(Boolean).join('\n').trim();
  return text || JSON.stringify(payload, null, 2);
}
function renderTaskResult(result, { remote = false, seat = state.seat } = {}) {
  state.result = result;
  state.history.push({id:++state.counter,text:result.text,seat:core.SEATS.find(s=>s.id===seat)?.tag||seat,time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),remote});
  if(state.history.length>20) state.history.shift();
  $('empty-output').hidden=true;
  $('output').hidden=false;
  $('output').textContent=result.text;
  $('output-stat').textContent=`${result.sections||1} 个区段 · ${result.characters||result.text.length} 字符${remote?' · 服务端返回':''}`;
  $('revision').textContent=`版本 ${state.counter} · ${remote?'冷咖啡中转':'当前会话'}`;
  $('checks').replaceChildren(...(result.checks||[]).map(c=>{const el=document.createElement('span');el.textContent=`${c.ok?'✓':'○'} ${c.name}`;return el;}));
  $('checks').classList.add('done');
  $('copy').disabled=false;
  $('export').disabled=false;
  revisions();
}

function button(text,click,cls='') { const b=document.createElement('button'); b.type='button'; b.textContent=text; b.className=cls; b.addEventListener('click',click); return b; }
function page(name) { document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${name}`)); document.querySelectorAll('.nav').forEach(el=>{const yes=el.dataset.page===name;el.classList.toggle('active',yes);el.setAttribute('aria-current',yes?'page':'false');}); if(name==='toolbox'){if(window.ColdCoffeeOriginalToolbox)window.ColdCoffeeOriginalToolbox.arm();if(window.ColdCoffeePentest)window.ColdCoffeePentest.arm();if(window.ColdCoffeeReverse)window.ColdCoffeeReverse.arm();} }
function renderSeats() { $('seats').replaceChildren(...core.SEATS.map(s=>{const b=button('',()=>{state.seat=s.id;renderSeats();window.dispatchEvent(new CustomEvent("coldcoffee:seat",{detail:s.id}));toast(`当前席位：${s.tag}（配置席位已切换）`);},`seat${state.seat===s.id?' selected':''}`);b.setAttribute('aria-pressed',String(state.seat===s.id)); const line=document.createElement('span');line.className='seat-line';const mark=document.createElement('span');mark.className='mark';mark.textContent=s.mark;line.append(mark,document.createTextNode(s.tag));b.append(line);if(s.place){const place=document.createElement('small');place.className='seat-place';place.textContent=s.place;b.append(place);}return b;})); const seat=core.SEATS.find(s=>s.id===state.seat); if($('seat-title'))$('seat-title').textContent=seat.tag; if($('seat-hint'))$('seat-hint').textContent=seat.hint; }
function renderProfiles() { if(!$('profiles'))return; $('profiles').replaceChildren(...core.PROFILES.map(p=>{const b=button(p.label,()=>{state.profile=p.id;renderProfiles();},state.profile===p.id?'active':'');b.title=p.brief;b.setAttribute('aria-pressed',String(state.profile===p.id));return b;})); }
function revisions() { for(const id of ['before','after']) {$(id).replaceChildren(...state.history.map(h=>{const opt=document.createElement('option');opt.value=String(h.id);opt.textContent=`版本 ${h.id} · ${h.seat} · ${h.time}`;return opt;}));} $('before').value=String(state.history[Math.max(0,state.history.length-2)].id);$('after').value=String(state.history.at(-1).id); compare(); }
function compare() { const a=state.history.find(h=>String(h.id)===$('before').value),b=state.history.find(h=>String(h.id)===$('after').value); if(!a||!b)return;const diff=core.diff(a.text,b.text);$('removed').textContent=diff.removed.join('\n')||'无删除内容';$('added').textContent=diff.added.join('\n')||'无新增内容';$('diff-note').textContent=diff.same?'两个版本文本一致。':`前 ${diff.prefix} 行一致；显示中间变更区段（整体替换视图，不是逐行最小差异）。`; }
async function compose(event) {event?.preventDefault();if(state.busy||state.relayBusy)return;state.busy=true;setRelaySubmitEnabled(false);const submit=$('compose-form').querySelector('[type=submit]');submit.disabled=true;try{const input={goal:$('goal').value,context:$('context').value,constraints:$('constraints').value,format:$('format').value,seat:state.seat,profile:state.profile};const result=window.coldbrew?.compose?await window.coldbrew.compose(input):core.compose(input);state.result=result;state.history.push({id:++state.counter,text:result.text,seat:core.SEATS.find(s=>s.id===state.seat).tag,time:new Date().toLocaleTimeString('zh-CN',{hour12:false})});if(state.history.length>20)state.history.shift();$('empty-output').hidden=true;$('output').hidden=false;$('output').textContent=result.text;$('output-stat').textContent=`${result.sections} 个区段 · ${result.characters} 字符`;$('revision').textContent=`版本 ${state.counter} · 当前会话`;$('checks').replaceChildren(...result.checks.map(c=>{const el=document.createElement('span');el.textContent=`${c.ok?'✓':'○'} ${c.name}`;return el;}));$('checks').classList.add('done');$('copy').disabled=false;$('export').disabled=false;revisions();toast('任务契约已构建；尚未向模型发送。');}catch(e){toast(e.message);}finally{state.busy=false;submit.disabled=false;setRelaySubmitEnabled(state.relayReady);}}
async function submitToRelay() {
  if (state.relayBusy || state.busy) return;
  if (!$('compose-form').reportValidity()) return;
  const modelId = relayInput('relay-provider');
  if (!window.coldbrew?.relay || !state.relayReady || !state.relayModels.includes(modelId)) {
    page('relay');
    toast('先贴 Key，测通，再选名单里的模型');
    return;
  }
  const revision = state.relayRevision;
  state.relayBusy = true;
  setRelaySubmitEnabled(false);
  lockRelayInputs(true);
  $('compose-form').querySelector('[type=submit]').disabled = true;
  $('relay-submit-task').textContent = '请求处理中…';
  $('relay-task-status').textContent = `正在请求 ${modelId}；等待服务器返回，请勿重复提交。`;
  try {
    const request = {
      modelId,
      goal: relayInput('goal'),
      context: relayInput('context'),
      constraints: relayInput('constraints'),
      outputFormat: relayInput('format', 'markdown'),
      stream: false
    };
    const result = await relayCall('submit', request);
    if (!result || result.mode !== 'openai' || !result.response) throw new Error('服务器未返回有效模型响应');
    const text = relayResponseText(result.response);
    const completed = result.status === 'completed';
    renderTaskResult({
      text: text || '服务器返回空内容。',
      sections: 1,
      characters: text.length,
      checks: [{ok:true,name:'收到 API 响应'},{ok:completed,name:completed?'响应完成':'响应未完成'}],
      task: {seat:modelId,modelId,remote:true}
    }, {remote:true,seat:modelId});
    $('relay-task-status').textContent = `模型：${modelId} · ${completed?'响应完成':result.status} · ${result.response.id||'服务器未返回请求编号'}`;
    if (revision === state.relayRevision) await refreshRelayUsage();
    toast(completed?'已收到中转返回；用量以服务器为准':'已收到响应，请检查完成状态');
  } catch(error) {
    $('relay-task-status').textContent = `提交失败：${error.message}。网络中断时请先在中转站确认用量再重试。`;
    toast('请求未完成；错误详情已显示在结果区');
  } finally {
    state.relayBusy = false;
    lockRelayInputs(false);
    $('compose-form').querySelector('[type=submit]').disabled = false;
    $('relay-submit-task').textContent = '发送到冷咖啡中转 ↗';
    setRelaySubmitEnabled(state.relayReady);
  }
}
async function copy(text) {try{await navigator.clipboard.writeText(text);toast('已复制');}catch{toast('剪贴板暂不可用，请选中文本手动复制。');}}
function download() {if(!state.result)return;const blob=new Blob([state.result.text],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`冷咖啡-${state.result.task.seat}-v${state.counter}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前版本');}
function openRelaySite() {
  const url='https://coldcoffeeai.com/';
  if(window.coldbrew?.openExternal) window.coldbrew.openExternal(url).catch(e=>toast(e.message));
  else window.open(url,'_blank','noopener,noreferrer');
}
async function relayCall(action,payload={}) {
  if(window.coldbrew?.relay) return window.coldbrew.relay(action,payload);
  return null;
}
function relayInput(id, fallback='') {
  const el=$(id);
  return el && typeof el.value==='string' && el.value.trim() ? el.value.trim() : fallback;
}
function relayBaseUrl() {
  const value=relayInput('relay-api-base');
  let url;
  try { url=new URL(value); } catch { throw new Error('地址要带 https://，像现在框里这样'); }
  if(url.username||url.password||value.includes('?')||value.includes('#')) {
    throw new Error('地址里别带账号密码，Key 贴在下面');
  }
  const key=relayInput('relay-api-key');
  let decoded=value;
  try { decoded=decodeURIComponent(value); } catch { throw new Error('地址里有认不出的字符'); }
  if(key&&[value,decoded].some(part=>part.includes(key)||part.includes(encodeURIComponent(key)))) {
    throw new Error('Key 贴在下面那个框，别写进地址');
  }
  const loopback=/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/|$)/i.test(value);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)) {
    throw new Error('地址要用 https://');
  }
  return url.href.replace(/\/+$/, '');
}
function copyRelayValue(makeText) {
  try { copy(makeText()); } catch(error) { toast(error.message); }
}
function relayConfigText() {
  const baseUrl=relayBaseUrl();
  const modelId=relayInput('relay-provider','MODEL_ID');
  const effort=['gpt-6-astra','gpt-6.1-sol'].includes(modelId)?'model_reasoning_effort = "xhigh"\n':'';
  const configPath=window.coldbrew?.platform==='win32'?'%USERPROFILE%\\.codex\\config.toml':'~/.codex/config.toml';
  return `# 贴进 Codex 的 ${configPath}
# 已有的同名项留一份就行。
model_provider = "coldcoffee"
model = ${JSON.stringify(modelId)}
${effort}
[model_providers.coldcoffee]
name = "冷咖啡中转"
base_url = ${JSON.stringify(baseUrl)}
env_key = "COLDCOFFEE_API_KEY"
wire_api = "responses"
requires_openai_auth = false
# Key 用旁边那个「把 Key 记到这台电脑」。
# 完全访问在 Codex 里打开。`;
}
function relayEnvText() {
  const key=relayInput('relay-api-key');
  if(!key) throw new Error('先贴上 Key');
  if(window.coldbrew?.platform==='win32') {
    const quoted="'"+key.replace(/'/g,"''")+"'";
    return `[Environment]::SetEnvironmentVariable('COLDCOFFEE_API_KEY', ${quoted}, 'User')\n$env:COLDCOFFEE_API_KEY = ${quoted}\n# 跑完后把 Codex 完全退出再打开。`;
  }
  const quoted="'"+key.replace(/'/g,"'\\''")+"'";
  return `export COLDCOFFEE_API_KEY=${quoted}\n# 在同一个终端里打开 Codex。`;
}
function lockRelayInputs(locked) {
  for(const id of ['relay-api-base','relay-api-key','relay-provider','relay-test','relay-refresh','relay-sync']) $(id).disabled=locked;
  document.querySelectorAll('.relay-model-card button').forEach(b=>b.disabled=locked);
}
function setRelayConnection(kind,title,detail) {
  $('relay-connection-state').dataset.state=kind;
  $('relay-connection-title').textContent=title;
  $('relay-connection-detail').textContent=detail;
  $('relay-state-label').textContent=kind==='ready'?'测过了':kind==='preview'?'先看样子':kind==='error'?'还没用上':'等你点测试';
  $('relay-state-label').dataset.state=kind;
  if(kind!=='ready') state.relayReady=false;
  setRelaySubmitEnabled(state.relayReady);
}
function updateRelaySelection() {
  const modelId=relayInput('relay-provider');
  state.relayProvider=modelId;
  $('relay-selected-provider').textContent=modelId||'测完才有名单';
  document.querySelectorAll('.relay-model-card').forEach(card=>{
    const selected=card.dataset.model===modelId;
    card.classList.toggle('selected',selected);
    const b=card.querySelector('button');
    b.classList.toggle('is-selected',selected);
    b.textContent=selected?'当前选择':'选择推荐模型';
  });
  if(!state.relayBusy && $('relay-task-status')) $('relay-task-status').textContent=`中转模型：${modelId||'待选择'} · 主动点击发送后才产生 API 用量。`;
  setRelaySubmitEnabled(state.relayReady);
}
function populateRelayModels(models) {
  const entries=Array.isArray(models)?models:(Array.isArray(models?.data)?models.data:[]);
  const ids=[...new Set(entries.map(item=>typeof item==='string'?item:item?.id).filter(id=>typeof id==='string'&&id.trim()))];
  if(!ids.length) throw new Error('官网没返回模型，再测一次');
  const previous=relayInput('relay-provider');
  state.relayModels=ids;
  $('relay-provider').replaceChildren(...ids.map(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;return o;}));
  $('relay-provider').value=ids.includes(previous)?previous:ids[0];
  updateRelaySelection();
}
async function refreshRelayUsage() {
  try {
    const usage=await relayCall('usage');
    if(!usage||usage.source==='preview') { $('relay-usage-state').textContent='还没查余额';return; }
    const value=usage.remaining;
    $('relay-usage-state').textContent=typeof value==='number'&&Number.isFinite(value)?`${value} ${usage.unit||''}`:'官网没给出余额';
    if(usage.active===false){
      setRelayConnection('error','这个 Key 现在用不了','去 coldcoffeeai.com 看一下 Key。');
      $('relay-access-state').textContent='Key 未启用';
    }
  } catch(error) { $('relay-usage-state').textContent=`没查到：${error.message}`; }
}
async function refreshRelayStatus({probe=false}={}) {
  if(probe) return configureRelayFromForm();
  setRelayConnection(window.coldbrew?.relay?'idle':'preview','贴上 Key，点一下测试',window.coldbrew?.relay?'会连到你上面填的地址。':'现在只是看样子。用桌面里的软件，才会真的去问。');
}
async function configureRelayFromForm() {
  if(state.relayTesting||state.relayBusy) return;
  const key=relayInput('relay-api-key');
  let base;
  try { base=relayBaseUrl(); } catch(error) {setRelayConnection('error','地址看起来不对',error.message);return;}
  if(!key){setRelayConnection('idle','还差 Key','贴上买到的 Key，再点测试。');return;}
  if(!window.coldbrew?.relay){setRelayConnection('preview','用打开的这个软件再测','网页里只能看样子。');return;}
  state.relayTesting=true;
  const revision=++state.relayRevision;
  lockRelayInputs(true);
  setRelayConnection('idle','正在问官网','看有哪些模型，还剩多少。');
  $('relay-access-state').textContent='正在测';
  $('relay-usage-state').textContent='正在查余额';
  try {
    const config=await relayCall('configure',{mode:'openai',baseUrl:base,authToken:key,wireApi:'responses'});
    if(!config?.ready) throw new Error('地址和 Key 还没填全');
    const probe=await relayCall('test');
    if(revision!==state.relayRevision) return;
    if(!probe?.ok||probe.preview) throw new Error('还没拿到模型名单');
    populateRelayModels(probe.models);
    state.relayReady=true;
    setRelayConnection('ready','能用了',`读到 ${state.relayModels.length} 个模型。复制到 Codex 就能聊。`);
    $('relay-access-state').textContent='Key 能用';
    await refreshRelayUsage();
    try { const catalog=await relayCall('catalog');renderRelayCatalog(catalog,catalog?.source); }
    catch(error) { $('relay-catalog-state').textContent=`工作流信息待确认：${error.message}`; }
    toast(state.relayReady?'测通了。复制到 Codex 就能用。':'名单读到了。看一下上面的 Key 提示。');
  } catch(error) {
    state.relayModels=[];
    $('relay-access-state').textContent='这次没通过';
    $('relay-usage-state').textContent='还没查余额';
    setRelayConnection('error','没测通',error.message);
  } finally {state.relayTesting=false;lockRelayInputs(false);setRelaySubmitEnabled(state.relayReady);}
}
function invalidateRelayConfig() {
  state.relayRevision++;
  state.relayModels=[];
  $('relay-access-state').textContent='改过了，再测一次';
  $('relay-usage-state').textContent='还没重新查';
  setRelayConnection('idle','你改过了','再测一次，用现在贴的 Key 和地址。');
}
function renderRelayCatalog(catalog,source='product') {
  const verified=['openai','remote'].includes(source)&&catalog?.verified!==false;
  const list=verified?(catalog.workflows||[]):[{id:'coldcoffee-default',name:'冷咖啡内置工作流',description:'接入冷咖啡 API 后由中转侧处理，无需安装在线 Skill。具体执行效果请在 Codex 中发送任务验证。'}];
  $('relay-catalog-state').textContent=verified?`服务器返回 ${list.length} 个工作流`:'产品说明 · 当前模型 API 未提供工作流加载证明';
  $('relay-workflows').replaceChildren(...list.map((workflow,index)=>{
    const card=document.createElement('article');card.className='relay-workflow-card';
    const top=document.createElement('div');top.className='workflow-top';
    const mark=document.createElement('span');mark.textContent=`工作流 / ${index+1}`;
    const ver=document.createElement('span');ver.textContent=verified?(workflow.version||'服务器目录'):'中转内置';top.append(mark,ver);
    const title=document.createElement('h3');title.textContent=workflow.name||'冷咖啡工作流';
    const desc=document.createElement('p');desc.textContent=workflow.description||'按中转服务方案提供。';
    const action=button(workflow.visibility==='private'?'闭源或定制，进群找管理':'查看接入配置',()=>{page(workflow.visibility==='private'?'community':'relay');});
    card.append(top,title,desc,action);return card;
  }));
}
async function localSkillCall(action,payload={}) {
  if(window.coldbrew?.localSkills) return window.coldbrew.localSkills(action,payload);
  if(!state.localSkillNonce){const session=await fetch('/api/session');if(!session.ok)throw new Error('请通过本地交互预览打开');state.localSkillNonce=(await session.json()).nonce;}
  const response=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json','X-ColdCoffee-Token':state.localSkillNonce},body:JSON.stringify({action:`local-skill-${action}`,payload})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'本地技能操作失败');return data.result;
}
function renderRelay() {
  const models=[{id:'gpt-6-astra',name:'GPT-6 Astra',mark:'A / 06'},{id:'gpt-6.1-sol',name:'GPT-6.1 Sol',mark:'S / 61'}];
  $('relay-models').replaceChildren(...models.map(model=>{
    const card=document.createElement('article');card.className='relay-model-card';card.dataset.model=model.id;
    const mark=document.createElement('div');mark.className='model-mark';mark.textContent=model.mark;
    const title=document.createElement('h3');title.textContent=model.name;
    const desc=document.createElement('p');desc.textContent='推理开高档。完全访问在 Codex 里打开。有没有这个模型，以测出来的列表为准。';
    const choose=button('选择推荐模型',()=>{
      if(state.relayReady&&!state.relayModels.includes(model.id)){toast('官网名单里没有这个，用上面列表里的');return;}
      if(!Array.from($('relay-provider').options).some(o=>o.value===model.id)){
        const o=document.createElement('option');o.value=model.id;o.textContent=`${model.name} · 再测一次`;$('relay-provider').append(o);
      }
      $('relay-provider').value=model.id;updateRelaySelection();
    });
    card.append(mark,title,desc,choose);return card;
  }));
  renderRelayCatalog(null);
  $('relay-groups').replaceChildren(...core.COMMUNITY.map(group=>{
    const row=document.createElement('div');row.className='relay-group-row';const info=document.createElement('div');
    const name=document.createElement('strong');name.textContent=group.name;const value=document.createElement('code');value.textContent=group.kind==='qq'?group.value:group.url;
    info.append(name,value);row.append(info,button(group.kind==='qq'?'复制群号':'打开链接',()=>group.kind==='qq'?copy(group.value):openCommunityLink(group)));return row;
  }));
  $('relay-open').addEventListener('click',openRelaySite);
  $('relay-sync').addEventListener('click',async()=>{
    if(!state.relayReady){renderRelayCatalog(null);toast('接入后可查看服务器提供的信息');return;}
    try {const c=await relayCall('catalog');renderRelayCatalog(c,c?.source);}
    catch(error){$('relay-catalog-state').textContent=error.message;}
  });
  $('relay-contact').addEventListener('click',()=>page('community'));
  $('relay-copy-base').addEventListener('click',()=>copyRelayValue(relayBaseUrl));
  $('relay-copy-config').addEventListener('click',()=>copyRelayValue(relayConfigText));
  $('relay-copy-env').addEventListener('click',()=>{try{copy(relayEnvText());}catch(error){toast(error.message);}});
  $('relay-toggle-key').addEventListener('click',()=>{const input=$('relay-api-key');input.type=input.type==='password'?'text':'password';$('relay-toggle-key').textContent=input.type==='text'?'隐藏':'显示';});
  for(const id of ['relay-api-base','relay-api-key']) $(id).addEventListener('input',invalidateRelayConfig);
  $('relay-provider').addEventListener('change',updateRelaySelection);
  $('relay-test').addEventListener('click',configureRelayFromForm);
  $('relay-refresh').addEventListener('click',()=>refreshRelayStatus({probe:true}));
  if($('relay-submit-task'))$('relay-submit-task').addEventListener('click',submitToRelay);
  if($('relay-teaser-open'))$('relay-teaser-open').addEventListener('click',()=>page('relay'));
  for (const id of ['closed-pitch-go','newbie-closed','side-closed']) if($(id))$(id).addEventListener('click',()=>page('community'));
  updateRelaySelection();
}
function openCommunityLink(group) {
  if (window.coldbrew?.openExternal) return window.coldbrew.openExternal(group.url).catch((error) => toast(error.message));
  window.open(group.url, '_blank', 'noopener,noreferrer');
}
function renderCommunity() {$('community').replaceChildren(...core.COMMUNITY.map((group,index)=>{const card=document.createElement('article');card.className=group.kind==='telegram'?'community-link-card':'community-card';const label=document.createElement('div');label.className='eyebrow';label.textContent=`冷咖啡 / 0${index+1}`;const title=document.createElement('h2');title.textContent=group.name;if(group.kind==='telegram'){const desc=document.createElement('p');desc.textContent=`Telegram ${group.label}，点击即可打开。`;const link=button(`打开 ${group.label}`,()=>openCommunityLink(group),'community-link');link.setAttribute('aria-label',`打开${group.name}`);const url=document.createElement('code');url.textContent=group.url;card.append(label,title,desc,link,url);return card;}const qr=button('',()=>{$('qr-large').src=img.src;$('qr-caption').textContent=`${group.name} · ${group.value}`;$('qr-dialog').showModal();},'qr-button');qr.setAttribute('aria-label',`放大${group.name}二维码`);const img=document.createElement('img');img.src=`../../assets/community/${group.image}`;img.alt=`${group.name}二维码，群号 ${group.value}`;qr.append(img);const row=document.createElement('div');row.className='group-number';const value=document.createElement('code');value.textContent=group.value;row.append(value,button('复制群号',()=>copy(group.value)));card.append(label,title,qr,row);return card;}));}
function workflowPayload(overrides={}){const value={mode:$('workflow-mode')?.value||'infiltration',target:relayInput('workflow-target'),wordlist:relayInput('workflow-wordlist'),artifactDir:relayInput('workflow-artifacts'),idaUrl:relayInput('workflow-ida-url','http://127.0.0.1:13337/mcp'),timeoutMs:Math.max(1000,Math.min(900000,Number($('workflow-timeout')?.value||45)*1000)),...overrides};if(!value.artifactDir)delete value.artifactDir;if(!value.wordlist)delete value.wordlist;return value;}
function workflowFallbackPlan(input){const names={infiltration:'渗透测试流水线',api:'API 接口分析',reverse:'IDA 逆向分析',unlock:'校验逻辑与补丁分析',mobile:'移动样本分析',custom:'自定义步骤链'};const stages={infiltration:['目标与范围确认','端口与服务发现','HTTP 指纹与存活探测','漏洞模板验证','证据归档'],api:['API 目标与范围','HTTP 服务与技术栈','端点与参数发现','漏洞模板验证','证据归档'],reverse:['样本与工作目录','IDA MCP 在线状态','读取 IDA 工具能力','提取可见字符串','读取函数索引','追踪关键交叉引用','证据归档'],unlock:['样本与派生目录','IDA MCP 在线状态','提取授权相关字符串','定位校验函数','读取反编译结果','输出偏移与回滚记录'],mobile:['APK 样本','读取 APK 基础信息','反编译 Java/Kotlin','设备连接状态','证据归档'],custom:['AI 生成步骤链']};return{id:input.mode,label:names[input.mode]||input.mode,description:'浏览器预览计划；桌面端可直接调用真实工具。',target:input.target,toolIds:[],ida:['reverse','unlock'].includes(input.mode),stages:(stages[input.mode]||stages.infiltration).map((label,index)=>({id:`preview-${index+1}`,index,label,kind:'preview',optional:false,status:'pending'}))};}
function workflowSetState(id,text,kind=''){const el=$(id);if(!el)return;el.textContent=text;if(kind)el.dataset.state=kind;}
function workflowLog(message){const el=$('workflow-log');if(!el)return;const line=`[${new Date().toLocaleTimeString('zh-CN',{hour12:false})}] ${String(message)}`;const lines=(el.textContent&&el.textContent!=='执行日志会按阶段实时显示。'?el.textContent.split('\n'):[]);lines.push(line);el.textContent=lines.slice(-180).join('\n');el.scrollTop=el.scrollHeight;}
function workflowJson(value){try{return JSON.stringify(value,null,2);}catch{return String(value||'');}}
function renderWorkflowPlan(plan){state.workflow.plan=plan||null;const list=$('workflow-plan-list');if(!list)return;if(!plan){list.innerHTML='<p class="empty-inline">输入目标后生成计划。</p>';workflowSetState('workflow-plan-count','0 阶段');workflowSetState('workflow-plan-meta','尚未生成计划');return;}workflowSetState('workflow-plan-count',`${plan.stages?.length||0} 阶段`);workflowSetState('workflow-plan-meta',`${plan.label||plan.id} · ${plan.target||'待填目标'}${plan.ida?' · 含 IDA MCP':''}`);list.replaceChildren(...(plan.stages||[]).map((stage,index)=>{const row=document.createElement('div');row.className=`workflow-stage stage-${stage.status||'pending'}`;row.dataset.stage=stage.id;const no=document.createElement('b');no.textContent=String(index+1).padStart(2,'0');const body=document.createElement('div');const title=document.createElement('strong');title.textContent=stage.label||stage.id;const meta=document.createElement('span');meta.textContent=[stage.kind,stage.tool||'编排器',stage.optional?'可选':'必需'].filter(Boolean).join(' · ');body.append(title,meta);const status=document.createElement('em');status.textContent=stage.status==='completed'?'完成':stage.status==='running'?'执行中':stage.status==='failed'?'失败':stage.status==='cancelled'?'已取消':'等待';row.append(no,body,status);return row;}));}
function renderWorkflowTask(task){if(!task)return;state.workflow.task=task;const total=Number(task.stageCount||task.stages?.length||0),done=Number(task.completed||task.stages?.filter(item=>item.status==='completed').length||0);workflowSetState('workflow-task-meta',`${task.label||task.workflowId||'工作流'} · ${task.target||'未指定目标'} · ${task.taskId||task.id||''}`);workflowSetState('workflow-task-state',task.status||'等待开始',task.status||'');workflowSetState('workflow-runtime-state',task.status||'待机',task.status||'');workflowSetState('workflow-progress-label',`${done} / ${total}`);const bar=$('workflow-progress-bar');if(bar)bar.style.width=`${total?Math.round(done/total*100):0}%`;for(const stage of task.stages||[]){const row=document.querySelector(`.workflow-stage[data-stage="${CSS.escape(stage.id)}"]`);if(!row)continue;row.className=`workflow-stage stage-${stage.status||'pending'}`;const em=row.querySelector('em');if(em)em.textContent=stage.status==='completed'?'完成':stage.status==='running'?'执行中':stage.status==='failed'?'失败':stage.status==='cancelled'?'已取消':'等待';}const terminal=['completed','failed','cancelled'].includes(task.status);$('workflow-pause').disabled=terminal||!['queued','running'].includes(task.status);$('workflow-resume').disabled=!['paused','needs-input'].includes(task.status);$('workflow-cancel').disabled=terminal;const evidence=$('workflow-evidence');if(evidence&&terminal){const results=(task.stages||[]).filter(item=>item.result);const report=results.find(item=>item.result?.reportPath);evidence.replaceChildren(...[report?`报告：${report.result.reportPath}`:`任务状态：${task.status}`,`阶段：${done}/${total} 完成 · ${task.failed||0} 失败`,task.error?`错误：${task.error}`:'执行结果来自实际工具与 IDA MCP 返回'].map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));$('workflow-copy-report').disabled=false;}}
function workflowHandleEvent(entry){if(!entry)return;state.workflow.events.push(entry);if(state.workflow.events.length>200)state.workflow.events.shift();const data=entry.data||{};if(entry.type==='task:created'&&data.plan)renderWorkflowPlan(data.plan);if(entry.type==='phase:started')workflowLog(`阶段开始 · ${data.label||data.stage||entry.phase}`);if(entry.type==='tool:started')workflowLog(`工具启动 · ${data.tool||''} ${Array.isArray(data.args)?data.args.join(' '):''}`);if(entry.type==='tool:output')workflowLog(`${data.tool||'工具'} · ${data.message||''}`);if(entry.type==='phase:completed')workflowLog(`阶段完成 · ${data.stage||entry.phase}`);if(entry.type==='phase:failed')workflowLog(`阶段失败 · ${data.stage||entry.phase} · ${data.result?.error||''}`);if(entry.type==='task:needs-input')workflowLog(`需要输入 · ${data.message||'请补充任务参数'}`);if(entry.type==='task:completed')workflowLog('任务完成 · 证据报告已写入');if(entry.type==='task:cancelled')workflowLog('任务已取消');if(entry.type==='task:failed')workflowLog(`任务失败 · ${data.error||''}`);if(entry.type==='task:paused')workflowLog('任务已暂停');if(entry.type==='task:resumed')workflowLog('任务继续执行');}
async function workflowWatch(taskId){clearInterval(state.workflow.poll);if(!window.coldbrew?.workflowStatus)return;state.workflow.poll=setInterval(async()=>{try{const task=await window.coldbrew.workflowStatus(taskId);if(!task)return;renderWorkflowTask(task);if(['completed','failed','cancelled'].includes(task.status)){clearInterval(state.workflow.poll);state.workflow.poll=null;}}catch(error){workflowLog(`状态读取失败 · ${error.message}`);}},500);}
async function workflowPlanAction(){const input=workflowPayload();if(!input.target){$('workflow-target').focus();toast('先填写目标或样本路径');return;}workflowSetState('workflow-runtime-state','正在生成计划','running');try{const plan=window.coldbrew?.workflowPlan?await window.coldbrew.workflowPlan(input):workflowFallbackPlan(input);renderWorkflowPlan(plan);workflowLog(`计划已生成 · ${plan.label||plan.id} · ${plan.stages?.length||0} 阶段`);workflowSetState('workflow-runtime-state','计划就绪','completed');}catch(error){workflowSetState('workflow-runtime-state','计划失败','failed');workflowLog(`计划失败 · ${error.message}`);toast(error.message);}}
async function workflowHealthAction(){workflowSetState('workflow-runtime-state','检查工具中','running');try{const result=window.coldbrew?.toolsHealth?await window.coldbrew.toolsHealth():{available:0,total:0,platform:'浏览器预览',tools:[]};workflowLog(`工具检查 · ${result.available}/${result.total} 可用 · ${result.platform||''}`);for(const tool of result.tools||[])workflowLog(`${tool.ok?'可用':'缺失'} · ${tool.label||tool.id}${tool.detail?` · ${tool.detail}`:''}${tool.error?` · ${tool.error}`:''}`);workflowSetState('workflow-runtime-state',`${result.available}/${result.total} 工具可用`,result.available?'completed':'failed');}catch(error){workflowSetState('workflow-runtime-state','检查失败','failed');workflowLog(`工具检查失败 · ${error.message}`);toast(error.message);}}
async function workflowStartAction(overrides={}){if(state.workflow.task&&['queued','running'].includes(state.workflow.task.status)){toast('已有任务正在执行');return;}const input=workflowPayload(overrides);if(!input.target){$('workflow-target').focus();toast('先填写目标或样本路径');return;}if(!window.coldbrew?.workflowStart){renderWorkflowPlan(state.workflow.plan||workflowFallbackPlan(input));workflowSetState('workflow-runtime-state','浏览器预览','preview');workflowSetState('workflow-task-state','仅计划','preview');workflowLog('浏览器预览不会启动本机工具；请用桌面版执行。');return;}try{$('workflow-start').disabled=true;workflowSetState('workflow-runtime-state','启动中','running');const task=await window.coldbrew.workflowStart(input);renderWorkflowTask(task);const currentPlan=state.workflow.plan;if(!currentPlan||currentPlan.target!==input.target||currentPlan.id!==input.mode)renderWorkflowPlan(workflowFallbackPlan(input));workflowLog(`任务已启动 · ${task.taskId||task.id}`);await workflowWatch(task.taskId||task.id);}catch(error){workflowSetState('workflow-runtime-state','启动失败','failed');workflowLog(`启动失败 · ${error.message}`);toast(error.message);}finally{$('workflow-start').disabled=false;}}
async function workflowAiAction(){if(state.workflow.aiBusy)return;if(!state.relayReady||!window.coldbrew?.relay){page('relay');toast('先在冷咖啡中转页验证 API Key，再让 AI 生成步骤链');return;}const input=workflowPayload();if(!input.target){$('workflow-target').focus();toast('先填写目标或样本路径');return;}state.workflow.aiBusy=true;$('workflow-ai').disabled=true;workflowSetState('workflow-runtime-state','AI 规划中','running');workflowLog(`请求 ${state.relayProvider} 生成可执行步骤链`);try{const result=await relayCall('submit',{modelId:state.relayProvider,goal:`为目标 ${input.target} 生成一条可执行的 ${input.mode} 工作流。`,context:'冷咖啡桌面编排器会校验并调用本机工具。',constraints:'只返回 JSON：{"label":"...","description":"...","steps":[{"id":"...","label":"...","kind":"command|ida-health|ida-tools|ida-call|evidence","tool":"注册工具名","args":[] ,"optional":true}]}。不要返回解释，不要编造执行结果。',outputFormat:'json',stream:false});const text=relayResponseText(result?.response);const match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error('AI 没有返回可解析的 JSON 步骤链');const parsed=JSON.parse(match[0]);const steps=Array.isArray(parsed.steps)?parsed.steps:(Array.isArray(parsed.stages)?parsed.stages:[]);if(!steps.length)throw new Error('AI 返回的步骤链为空');const custom={...input,mode:'custom',label:parsed.label||'AI 生成工作流',description:parsed.description||'由中转模型生成并经本机工作流引擎执行。',steps:steps.slice(0,32)};const plan=window.coldbrew?.workflowPlan?await window.coldbrew.workflowPlan(custom):workflowFallbackPlan(custom);renderWorkflowPlan(plan);workflowLog(`AI 步骤链已校验 · ${steps.length} 步 · 开始执行`);await workflowStartAction(custom);}catch(error){workflowSetState('workflow-runtime-state','AI 规划失败','failed');workflowLog(`AI 规划失败 · ${error.message}`);toast(error.message);}finally{state.workflow.aiBusy=false;$('workflow-ai').disabled=false;}}
async function workflowIdaProbe(){const url=relayInput('workflow-ida-url','http://127.0.0.1:13337/mcp');$('workflow-ida-url-label').textContent=url;workflowSetState('workflow-ida-state','探测中','running');try{const result=window.coldbrew?.idaStatus?await window.coldbrew.idaStatus({url,timeoutMs:8000}):{ok:false,error:'浏览器预览不连接本机 IDA'};state.workflow.ida=result;workflowSetState('workflow-ida-state',result.ok?`在线 · ${result.tools?.length||0} 工具`:'未连接',result.ok?'completed':'failed');$('workflow-ida-output').textContent=workflowJson(result);if(result.ok&&Array.isArray(result.tools)){const select=$('workflow-ida-tool');select.replaceChildren(...result.tools.map(tool=>{const option=document.createElement('option');option.value=tool.name;option.textContent=tool.name;return option;}));}workflowLog(result.ok?`IDA MCP 在线 · ${result.tools?.length||0} 个工具`:`IDA MCP 未连接 · ${result.error||'请先打开 IDA 插件'}`);}catch(error){workflowSetState('workflow-ida-state','探测失败','failed');$('workflow-ida-output').textContent=error.message;workflowLog(`IDA 探测失败 · ${error.message}`);}}
async function workflowIdaCall(){const tool=relayInput('workflow-ida-tool','server_health');let args={};try{args=JSON.parse(relayInput('workflow-ida-args','{}')||'{}');}catch{toast('IDA 参数必须是有效 JSON');return;}const url=relayInput('workflow-ida-url','http://127.0.0.1:13337/mcp');workflowSetState('workflow-ida-state','调用中','running');try{const result=window.coldbrew?.idaCall?await window.coldbrew.idaCall({tool,args,url,sessionId:state.workflow.ida?.sessionId,timeoutMs:20000}):{ok:false,error:'浏览器预览不调用本机 IDA'};$('workflow-ida-output').textContent=workflowJson(result);workflowSetState('workflow-ida-state',result.ok?'调用完成':'调用失败',result.ok?'completed':'failed');workflowLog(`${result.ok?'IDA 工具完成':'IDA 工具失败'} · ${tool}`);}catch(error){workflowSetState('workflow-ida-state','调用失败','failed');$('workflow-ida-output').textContent=error.message;workflowLog(`IDA 调用失败 · ${error.message}`);}}
function bindWorkflow(){if(!$('workflow-plan'))return;$('workflow-plan').addEventListener('click',workflowPlanAction);$('workflow-health').addEventListener('click',workflowHealthAction);$('workflow-start').addEventListener('click',()=>workflowStartAction());$('workflow-ai').addEventListener('click',workflowAiAction);$('workflow-pause').addEventListener('click',async()=>{const id=state.workflow.task?.taskId||state.workflow.task?.id;if(id&&window.coldbrew?.workflowPause)renderWorkflowTask(await window.coldbrew.workflowPause(id));});$('workflow-resume').addEventListener('click',async()=>{const id=state.workflow.task?.taskId||state.workflow.task?.id;if(id&&window.coldbrew?.workflowResume)renderWorkflowTask(await window.coldbrew.workflowResume(id));});$('workflow-cancel').addEventListener('click',async()=>{const id=state.workflow.task?.taskId||state.workflow.task?.id;if(id&&window.coldbrew?.workflowCancel)renderWorkflowTask(await window.coldbrew.workflowCancel(id));});$('workflow-ida-probe').addEventListener('click',workflowIdaProbe);$('workflow-ida-call').addEventListener('click',workflowIdaCall);$('workflow-copy-report').addEventListener('click',()=>{const task=state.workflow.task;if(!task)return;copy((task.stages||[]).map(stage=>`${stage.label}: ${stage.status}${stage.result?.reportPath?`\n报告：${stage.result.reportPath}`:''}`).join('\n'));});$('workflow-mode').addEventListener('change',()=>{state.workflow.plan=null;renderWorkflowPlan(null);});if(window.coldbrew?.onWorkflow)window.coldbrew.onWorkflow(workflowHandleEvent);}

function renderIdaStatus(status){const state=$('ida-state');if(!state)return;const buttons=['ida-install','ida-uninstall','ida-reveal','ida-refresh'];if(!status){state.textContent='仅桌面端写入';$('ida-target').textContent='浏览器预览只展示说明，不写入 IDA 用户插件目录。';$('ida-files').replaceChildren();for(const id of buttons)$(id).disabled=true;return;}state.textContent=status.installed?'中文已经装好':status.present?'文件和软件里的不一样，可以再装一次':'还没装中文';$('ida-target').textContent=`插件文件夹 · ${status.target}`;$('ida-files').replaceChildren(...status.files.map(file=>{const li=document.createElement('li');li.textContent=`${file.name} · ${file.present?(file.match?'一样':'不一样'):'没有'}`;return li;}));for(const id of buttons)$(id).disabled=false;$('ida-reveal').disabled=!status.targetExists;}
function renderMcpStatus(status){const state=$('ida-mcp-state');if(!state)return;const buttons=['ida-mcp-install','ida-mcp-plugin','ida-mcp-uninstall','ida-mcp-refresh'];if(!status){state.textContent='仅桌面端写入';$('ida-mcp-target').textContent='先看地址。点按钮才会写进软件。';$('ida-mcp-clients').replaceChildren();for(const id of buttons)$(id).disabled=true;return;}const ready=status.clients.filter(row=>row.installed).length;state.textContent=status.plugin.ready?`插件好了 · ${ready} 个软件已接上`:`插件还没装 · ${ready} 个软件已接上`;$('ida-mcp-target').textContent=`插件文件夹 · ${status.plugin.target}`;if($('ida-mcp-url'))$('ida-mcp-url').textContent=status.url;$('ida-mcp-clients').replaceChildren(...status.clients.map(row=>{const li=document.createElement('li');const mark=row.installed?'已接入':row.kind==='manual'?'手填':row.exists?'未写入':'无文件';li.textContent=`${row.label} · ${mark}${row.file?` · ${row.file}`:''}${row.note?` · ${row.note}`:''}`;return li;}));for(const id of buttons)$(id).disabled=false;}
async function toolboxCall(action){const result=await window.coldbrew.toolbox({action});if(result&&!result.canceled){if(String(action).startsWith('mcp'))renderMcpStatus(result);else renderIdaStatus(result);}return result;}
function bindToolbox(){if(!$('ida-install'))return;$('ida-refresh').addEventListener('click',()=>toolboxCall('status').catch(error=>toast(error.message)));$('ida-install').addEventListener('click',()=>toolboxCall('install').then(result=>{if(result?.canceled)toast('已取消安装');else if(result)toast('中文装好了，把 IDA 重新打开');}).catch(error=>toast(error.message)));$('ida-uninstall').addEventListener('click',()=>toolboxCall('uninstall').then(result=>{if(result?.canceled)toast('已取消卸载');else if(result)toast('中文卸掉了');}).catch(error=>toast(error.message)));$('ida-reveal').addEventListener('click',()=>toolboxCall('reveal').then(()=>toast('文件夹打开了')).catch(error=>toast(error.message)));$('ida-mcp-refresh').addEventListener('click',()=>toolboxCall('mcp-status').catch(error=>toast(error.message)));$('ida-mcp-install').addEventListener('click',()=>toolboxCall('mcp-install').then(result=>{if(result?.canceled)toast('已取消写入');else if(result)toast('已经写进软件');}).catch(error=>toast(error.message)));$('ida-mcp-uninstall').addEventListener('click',()=>toolboxCall('mcp-uninstall').then(result=>{if(result?.canceled)toast('已取消');else if(result)toast('已经从软件里去掉');}).catch(error=>toast(error.message)));$('ida-mcp-plugin').addEventListener('click',()=>toolboxCall('mcp-plugin').then(result=>{if(result?.canceled)toast('已取消安装插件');else if(result)toast('连接插件放好了，把 IDA 重新打开');}).catch(error=>toast(error.message)));if(window.coldbrew?.toolbox){toolboxCall('status').catch(error=>toast(error.message));toolboxCall('mcp-status').catch(error=>toast(error.message));}else{renderIdaStatus(null);renderMcpStatus(null);}}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
if($('presets')&&$('goal'))$('presets').replaceChildren(...core.PRESETS.map(p=>button(p.label,()=>{$('goal').value=p.goal;$('context').value=p.context;$('constraints').value=p.constraints;$('format').value=p.format;state.profile=p.profile;renderProfiles();toast('已填入示例，编辑后点击本地构建或发送到中转');})));
if($('compose-form')){$('compose-form').addEventListener('submit',compose);$('copy').addEventListener('click',()=>copy(state.result.text));$('export').addEventListener('click',download);}
if($('before')&&$('after')){$('before').addEventListener('change',compare);$('after').addEventListener('change',compare);}
if($('eval-form'))$('eval-form').addEventListener('submit',async event=>{event.preventDefault();try{const answer=$('answer').value,options={format:$('eval-format').value,minLength:Number($('min-length').value),keywords:$('keywords').value};const r=window.coldbrew?.evaluate?await window.coldbrew.evaluate(answer,options):core.evaluate(answer,options);$('eval-score').textContent=`${r.passed} / ${r.total} 项通过`;$('eval-result').replaceChildren(...r.checks.map(c=>{const line=document.createElement('div');line.className=c.ok?'pass':'fail';line.textContent=`${c.ok?'✓':'×'} ${c.name}`;return line;}));}catch(e){toast(e.message);}});
$('qr-close').addEventListener('click',()=>$('qr-dialog').close());$('qr-dialog').addEventListener('click',e=>{if(e.target===$('qr-dialog'))$('qr-dialog').close();});
$('repo').addEventListener('click',()=>{const url='https://coldcoffeeai.com/';if(window.coldbrew)window.coldbrew.openExternal(url).catch(e=>toast(e.message));else window.open(url,'_blank','noopener,noreferrer');});
if(window.coldbrew){document.body.classList.add('desktop');$('environment').textContent='冷咖啡中转';for(const name of ['minimize','maximize','close'])$(name).addEventListener('click',()=>window.coldbrew[name]());}
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&$('page-work')?.classList.contains('active')){event.preventDefault();$('compose-form').requestSubmit();}});
renderSeats();renderProfiles();renderRelay();renderCommunity();bindToolbox();bindWorkflow();refreshRelayStatus();
window.addEventListener('DOMContentLoaded',()=>{if(location.hash==='#relay')page('relay');});
