'use strict';
const core = window.ColdCoffeeCore;
const $ = (id) => document.getElementById(id);
const state = {seat:'codex',profile:'max',history:[],counter:0,result:null,busy:false,relayReady:false,relayProvider:'gpt-6-astra',relayBusy:false,relayTesting:false,relayModels:[],relayRevision:0};
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
function page(name) { document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${name}`)); document.querySelectorAll('.nav').forEach(el=>{const yes=el.dataset.page===name;el.classList.toggle('active',yes);el.setAttribute('aria-current',yes?'page':'false');}); }
function renderSeats() { $('seats').replaceChildren(...core.SEATS.map(s=>{const b=button('',()=>{state.seat=s.id;renderSeats();window.dispatchEvent(new CustomEvent("coldcoffee:seat",{detail:s.id}));toast(`当前席位：${s.tag}（配置席位已切换）`);},`seat${state.seat===s.id?' selected':''}`);b.setAttribute('aria-pressed',String(state.seat===s.id)); const mark=document.createElement('span');mark.className='mark';mark.textContent=s.mark;b.append(mark,document.createTextNode(s.tag));return b;})); const seat=core.SEATS.find(s=>s.id===state.seat); $('seat-title').textContent=seat.tag;$('seat-hint').textContent=seat.hint; }
function renderProfiles() { $('profiles').replaceChildren(...core.PROFILES.map(p=>{const b=button(p.label,()=>{state.profile=p.id;renderProfiles();},state.profile===p.id?'active':'');b.title=p.brief;b.setAttribute('aria-pressed',String(state.profile===p.id));return b;})); }
function revisions() { for(const id of ['before','after']) {$(id).replaceChildren(...state.history.map(h=>{const opt=document.createElement('option');opt.value=String(h.id);opt.textContent=`版本 ${h.id} · ${h.seat} · ${h.time}`;return opt;}));} $('before').value=String(state.history[Math.max(0,state.history.length-2)].id);$('after').value=String(state.history.at(-1).id); compare(); }
function compare() { const a=state.history.find(h=>String(h.id)===$('before').value),b=state.history.find(h=>String(h.id)===$('after').value); if(!a||!b)return;const diff=core.diff(a.text,b.text);$('removed').textContent=diff.removed.join('\n')||'无删除内容';$('added').textContent=diff.added.join('\n')||'无新增内容';$('diff-note').textContent=diff.same?'两个版本文本一致。':`前 ${diff.prefix} 行一致；显示中间变更区段（整体替换视图，不是逐行最小差异）。`; }
async function compose(event) {event?.preventDefault();if(state.busy||state.relayBusy)return;state.busy=true;setRelaySubmitEnabled(false);const submit=$('compose-form').querySelector('[type=submit]');submit.disabled=true;try{const input={goal:$('goal').value,context:$('context').value,constraints:$('constraints').value,format:$('format').value,seat:state.seat,profile:state.profile};const result=window.coldbrew?.compose?await window.coldbrew.compose(input):core.compose(input);state.result=result;state.history.push({id:++state.counter,text:result.text,seat:core.SEATS.find(s=>s.id===state.seat).tag,time:new Date().toLocaleTimeString('zh-CN',{hour12:false})});if(state.history.length>20)state.history.shift();$('empty-output').hidden=true;$('output').hidden=false;$('output').textContent=result.text;$('output-stat').textContent=`${result.sections} 个区段 · ${result.characters} 字符`;$('revision').textContent=`版本 ${state.counter} · 当前会话`;$('checks').replaceChildren(...result.checks.map(c=>{const el=document.createElement('span');el.textContent=`${c.ok?'✓':'○'} ${c.name}`;return el;}));$('checks').classList.add('done');$('copy').disabled=false;$('export').disabled=false;revisions();toast('任务契约已构建；尚未向模型发送。');}catch(e){toast(e.message);}finally{state.busy=false;submit.disabled=false;setRelaySubmitEnabled(state.relayReady);}}
async function submitToRelay() {
  if (state.relayBusy || state.busy) return;
  if (!$('compose-form').reportValidity()) return;
  const modelId = relayInput('relay-provider');
  if (!window.coldbrew?.relay || !state.relayReady || !state.relayModels.includes(modelId)) {
    page('relay');
    toast('先填写 API Key、测试连接并选择服务器模型');
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
  try { url=new URL(value); } catch { throw new Error('请填写有效的 API Base URL'); }
  if(url.username||url.password||value.includes('?')||value.includes('#')) {
    throw new Error('API 地址仅填写协议、主机与路径；凭据请填在 API Key 输入框');
  }
  const key=relayInput('relay-api-key');
  let decoded=value;
  try { decoded=decodeURIComponent(value); } catch { throw new Error('API 地址包含无效编码'); }
  if(key&&[value,decoded].some(part=>part.includes(key)||part.includes(encodeURIComponent(key)))) {
    throw new Error('API 地址中含有 Key，请将凭据移至 API Key 输入框');
  }
  const loopback=/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/|$)/i.test(value);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)) {
    throw new Error('API 地址须使用 HTTPS；HTTP 仅供本机回环测试');
  }
  return url.href.replace(/\/+$/, '');
}
function copyRelayValue(makeText) {
  try { copy(makeText()); } catch(error) { toast(error.message); }
}
function relayConfigText() {
  const baseUrl=relayBaseUrl();
  const modelId=relayInput('relay-provider','MODEL_ID');
  const effort=['gpt-6-astra','gpt-5.6-sol'].includes(modelId)?'model_reasoning_effort = "xhigh"\n':'';
  return `# 冷咖啡 · 合并到 %USERPROFILE%\\.codex\\config.toml
# 保留已有配置；同名键与 provider 配置只保留一份。
model_provider = "coldcoffee"
model = ${JSON.stringify(modelId)}
${effort}
[model_providers.coldcoffee]
name = "冷咖啡中转"
base_url = ${JSON.stringify(baseUrl)}
env_key = "COLDCOFFEE_API_KEY"
wire_api = "responses"
requires_openai_auth = false
# Key 使用单独的“复制 Key 设置命令”按钮配置。
# 完全访问在 Codex 客户端设置。`;
}
function relayEnvText() {
  const key=relayInput('relay-api-key');
  if(!key) throw new Error('请先填写 API Key');
  const quoted="'"+key.replace(/'/g,"''")+"'";
  return `[Environment]::SetEnvironmentVariable('COLDCOFFEE_API_KEY', ${quoted}, 'User')\n$env:COLDCOFFEE_API_KEY = ${quoted}\n# 完全退出并重新打开 Codex，使新启动的进程继承环境变量。`;
}
function lockRelayInputs(locked) {
  for(const id of ['relay-api-base','relay-api-key','relay-provider','relay-test','relay-refresh','relay-sync']) $(id).disabled=locked;
  document.querySelectorAll('.relay-model-card button').forEach(b=>b.disabled=locked);
}
function setRelayConnection(kind,title,detail) {
  $('relay-connection-state').dataset.state=kind;
  $('relay-connection-title').textContent=title;
  $('relay-connection-detail').textContent=detail;
  $('relay-state-label').textContent=kind==='ready'?'API 验证通过':kind==='preview'?'浏览器预览':kind==='error'?'待处理':'等待验证';
  $('relay-state-label').dataset.state=kind;
  if(kind!=='ready') state.relayReady=false;
  setRelaySubmitEnabled(state.relayReady);
}
function updateRelaySelection() {
  const modelId=relayInput('relay-provider');
  state.relayProvider=modelId;
  $('relay-selected-provider').textContent=modelId||'等待服务器模型列表';
  document.querySelectorAll('.relay-model-card').forEach(card=>{
    const selected=card.dataset.model===modelId;
    card.classList.toggle('selected',selected);
    const b=card.querySelector('button');
    b.classList.toggle('is-selected',selected);
    b.textContent=selected?'当前选择':'选择推荐模型';
  });
  if(!state.relayBusy) $('relay-task-status').textContent=`中转模型：${modelId||'待选择'} · 主动点击发送后才产生 API 用量。`;
  setRelaySubmitEnabled(state.relayReady);
}
function populateRelayModels(models) {
  const entries=Array.isArray(models)?models:(Array.isArray(models?.data)?models.data:[]);
  const ids=[...new Set(entries.map(item=>typeof item==='string'?item:item?.id).filter(id=>typeof id==='string'&&id.trim()))];
  if(!ids.length) throw new Error('服务器未返回可选模型');
  const previous=relayInput('relay-provider');
  state.relayModels=ids;
  $('relay-provider').replaceChildren(...ids.map(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;return o;}));
  $('relay-provider').value=ids.includes(previous)?previous:ids[0];
  updateRelaySelection();
}
async function refreshRelayUsage() {
  try {
    const usage=await relayCall('usage');
    if(!usage||usage.source==='preview') { $('relay-usage-state').textContent='等待真实查询';return; }
    const value=usage.remaining;
    $('relay-usage-state').textContent=typeof value==='number'&&Number.isFinite(value)?`${value} ${usage.unit||''}`:'服务器未返回余额';
    if(usage.active===false){
      setRelayConnection('error','API Key 状态未启用','请到冷咖啡中转站查看 Key 状态。');
      $('relay-access-state').textContent='Key 未启用';
    }
  } catch(error) { $('relay-usage-state').textContent=`查询失败：${error.message}`; }
}
async function refreshRelayStatus({probe=false}={}) {
  if(probe) return configureRelayFromForm();
  setRelayConnection(window.coldbrew?.relay?'idle':'preview','填写 API Key 后开始测试',window.coldbrew?.relay?'桌面端将连接填写的 API 地址。':'当前为浏览器界面预览；真实 API 请求在桌面版执行。');
}
async function configureRelayFromForm() {
  if(state.relayTesting||state.relayBusy) return;
  const key=relayInput('relay-api-key');
  let base;
  try { base=relayBaseUrl(); } catch(error) {setRelayConnection('error','请检查 API 地址',error.message);return;}
  if(!key){setRelayConnection('idle','请填写 API 地址与 Key','填好后点击测试接入状态。');return;}
  if(!window.coldbrew?.relay){setRelayConnection('preview','请在桌面版测试 API','浏览器预览仅展示交互；真实请求由桌面版执行。');return;}
  state.relayTesting=true;
  const revision=++state.relayRevision;
  lockRelayInputs(true);
  setRelayConnection('idle','正在验证 API','读取模型列表与用量状态。');
  $('relay-access-state').textContent='验证中';
  $('relay-usage-state').textContent='查询中';
  try {
    const config=await relayCall('configure',{mode:'openai',baseUrl:base,authToken:key,wireApi:'responses'});
    if(!config?.ready) throw new Error('接入参数不完整');
    const probe=await relayCall('test');
    if(revision!==state.relayRevision) return;
    if(!probe?.ok||probe.preview) throw new Error('尚未获得真实模型列表');
    populateRelayModels(probe.models);
    state.relayReady=true;
    setRelayConnection('ready','模型接口验证通过',`已读取 ${state.relayModels.length} 个模型；任务接口在实际发送时验证。`);
    $('relay-access-state').textContent='API Key 已通过 /models 验证';
    await refreshRelayUsage();
    try { const catalog=await relayCall('catalog');renderRelayCatalog(catalog,catalog?.source); }
    catch(error) { $('relay-catalog-state').textContent=`工作流信息待确认：${error.message}`; }
    toast(state.relayReady?'接入测试完成，可以复制配置或发送任务':'模型列表已读取；请处理 Key 状态提示');
  } catch(error) {
    state.relayModels=[];
    $('relay-access-state').textContent='验证未通过';
    $('relay-usage-state').textContent='未查询';
    setRelayConnection('error','API 验证失败',error.message);
  } finally {state.relayTesting=false;lockRelayInputs(false);setRelaySubmitEnabled(state.relayReady);}
}
function invalidateRelayConfig() {
  state.relayRevision++;
  state.relayModels=[];
  $('relay-access-state').textContent='接入信息已修改，请重新测试';
  $('relay-usage-state').textContent='待重新查询';
  setRelayConnection('idle','接入信息已更新','重新测试后再发送，避免使用旧 Key 或旧地址。');
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
    const action=button(workflow.visibility==='private'?'进群私聊管理员':'查看接入配置',()=>{page(workflow.visibility==='private'?'community':'relay');});
    card.append(top,title,desc,action);return card;
  }));
}
function renderRelay() {
  const models=[{id:'gpt-6-astra',name:'GPT-6 Astra',mark:'A / 06'},{id:'gpt-5.6-sol',name:'GPT-5.6 Sol',mark:'S / 56'}];
  $('relay-models').replaceChildren(...models.map(model=>{
    const card=document.createElement('article');card.className='relay-model-card';card.dataset.model=model.id;
    const mark=document.createElement('div');mark.className='model-mark';mark.textContent=model.mark;
    const title=document.createElement('h3');title.textContent=model.name;
    const desc=document.createElement('p');desc.textContent='推荐 xhigh 推理；请在 Codex 开启完全访问。模型可用性以 API 返回为准。';
    const choose=button('选择推荐模型',()=>{
      if(state.relayReady&&!state.relayModels.includes(model.id)){toast('该 ID 未出现在服务器列表，请在上方选择实际模型');return;}
      if(!Array.from($('relay-provider').options).some(o=>o.value===model.id)){
        const o=document.createElement('option');o.value=model.id;o.textContent=`${model.name} · 待验证`;$('relay-provider').append(o);
      }
      $('relay-provider').value=model.id;updateRelaySelection();
    });
    card.append(mark,title,desc,choose);return card;
  }));
  renderRelayCatalog(null);
  $('relay-groups').replaceChildren(...core.COMMUNITY.map(group=>{
    const row=document.createElement('div');row.className='relay-group-row';const info=document.createElement('div');
    const name=document.createElement('strong');name.textContent=group.name;const num=document.createElement('code');num.textContent=group.value;
    info.append(name,num);row.append(info,button('复制群号',()=>copy(group.value)));return row;
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
  $('relay-submit-task').addEventListener('click',submitToRelay);
  $('relay-teaser-open').addEventListener('click',()=>page('relay'));
  updateRelaySelection();
}
function renderCommunity() {$('community').replaceChildren(...core.COMMUNITY.map((group,index)=>{const card=document.createElement('article');card.className='community-card';const label=document.createElement('div');label.className='eyebrow';label.textContent=`冷咖啡 / 0${index+1}`;const title=document.createElement('h2');title.textContent=group.name;const qr=button('',()=>{$('qr-large').src=img.src;$('qr-caption').textContent=`${group.name} · ${group.value}`;$('qr-dialog').showModal();},'qr-button');qr.setAttribute('aria-label',`放大${group.name}二维码`);const img=document.createElement('img');img.src=`../../assets/community/${group.image}`;img.alt=`${group.name}二维码，群号 ${group.value}`;qr.append(img);const row=document.createElement('div');row.className='group-number';const value=document.createElement('code');value.textContent=group.value;row.append(value,button('复制群号',()=>copy(group.value)));card.append(label,title,qr,row);return card;}));}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
$('presets').replaceChildren(...core.PRESETS.map(p=>button(p.label,()=>{$('goal').value=p.goal;$('context').value=p.context;$('constraints').value=p.constraints;$('format').value=p.format;state.profile=p.profile;renderProfiles();toast('已填入示例，编辑后点击本地构建或发送到中转');})));
$('compose-form').addEventListener('submit',compose);$('copy').addEventListener('click',()=>copy(state.result.text));$('export').addEventListener('click',download);$('before').addEventListener('change',compare);$('after').addEventListener('change',compare);
$('eval-form').addEventListener('submit',async event=>{event.preventDefault();try{const answer=$('answer').value,options={format:$('eval-format').value,minLength:Number($('min-length').value),keywords:$('keywords').value};const r=window.coldbrew?.evaluate?await window.coldbrew.evaluate(answer,options):core.evaluate(answer,options);$('eval-score').textContent=`${r.passed} / ${r.total} 项通过`;$('eval-result').replaceChildren(...r.checks.map(c=>{const line=document.createElement('div');line.className=c.ok?'pass':'fail';line.textContent=`${c.ok?'✓':'×'} ${c.name}`;return line;}));}catch(e){toast(e.message);}});
$('qr-close').addEventListener('click',()=>$('qr-dialog').close());$('qr-dialog').addEventListener('click',e=>{if(e.target===$('qr-dialog'))$('qr-dialog').close();});
$('repo').addEventListener('click',()=>{const url='https://github.com/3641397194-wq/gpt6-Astra';if(window.coldbrew)window.coldbrew.openExternal(url).catch(e=>toast(e.message));else window.open(url,'_blank','noopener,noreferrer');});
if(window.coldbrew){document.body.classList.add('desktop');$('environment').textContent='桌面端 · 本地构建';for(const name of ['minimize','maximize','close'])$(name).addEventListener('click',()=>window.coldbrew[name]());}
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&$('page-work').classList.contains('active')){event.preventDefault();$('compose-form').requestSubmit();}});
renderSeats();renderProfiles();renderRelay();renderCommunity();refreshRelayStatus();
window.addEventListener('DOMContentLoaded',()=>{if(location.hash==='#relay')page('relay');});
