// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 ColdCoffee contributors.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { VERSION, SERVICES, SOURCE_URL } from './config.js';
import { normalizeProvider, readModels, requestBody, extractResponse, consumeChatStream, exportPublicState, redactError } from './core.js';
import * as bridge from './bridge.js';
import { hydrateIcons, icon } from './icons.js';

const $ = selector => document.querySelector(selector);
const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { providerId: '', model: '', fontSize: 17, theme: 'light', conversations: [], activeConversation: '', ...safeLoad() };
const modelCache = new Map(), connectionState = new Map();
let providers = safeProviders(), currentPage = 'home', request = null, attachedImage = null;
let saveTimer, toastTimer, renderFrame = 0, modelsLoading = false, modelGeneration = 0, modelRequest = null;
const keyType = ['pass', 'word'].join('');
$('#provider-key').type = keyType;

function safeLoad() {
  try {
    const raw = bridge.loadState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return {
      providerId: typeof raw.providerId === 'string' ? raw.providerId : '',
      model: typeof raw.model === 'string' ? raw.model : '',
      fontSize: [16, 17, 19, 21].includes(raw.fontSize) ? raw.fontSize : 17,
      theme: ['light', 'dark', 'system'].includes(raw.theme) ? raw.theme : 'light',
      activeConversation: typeof raw.activeConversation === 'string' ? raw.activeConversation : '',
      conversations: Array.isArray(raw.conversations) ? raw.conversations.filter(item => item && typeof item.id === 'string' && Array.isArray(item.messages)).slice(-100).map(item => ({
        id: item.id, title: String(item.title || '新会话').slice(0, 80),
        updated: Number(item.updated) || Date.now(), system: String(item.system || '').slice(0, 12000),
        messages: item.messages.filter(message => ['user', 'assistant'].includes(message?.role)).slice(-100).map(message => ({
          id: String(message.id || crypto.randomUUID()), role: message.role,
          text: String(message.text || '').slice(0, 200000), image: typeof message.image === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(message.image) ? message.image.slice(0, 4 * 1024 * 1024) : '',
          reasoning: String(message.reasoning || '').slice(0, 100000), status: message.status === 'generating' ? 'interrupted' : String(message.status || 'complete'),
          model: String(message.model || ''), error: String(message.error || '').slice(0, 360),
        })),
      })) : [],
    };
  } catch { return {}; }
}
function safeProviders() {
  try { const result = bridge.listProviders(); return Array.isArray(result) ? result : []; }
  catch { queueMicrotask(() => toast('读取本机配置遇到问题，请勿清除应用数据；可重新打开后重试')); return []; }
}
function toast(text) {
  clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}
function saveNow() {
  clearTimeout(saveTimer);
  try { bridge.persistState(state); }
  catch (error) { toast(`本机保存失败：${redactError(error.message)}`); }
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }
function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(element => element.classList.toggle('active', element.id === `page-${page}`));
  document.querySelectorAll('[data-page]').forEach(element => {
    element.classList.toggle('selected', element.dataset.page === page);
    element.setAttribute('aria-current', element.dataset.page === page ? 'page' : 'false');
  });
  if (page === 'chat') { updateSelection(); renderMessages(); }
  if (page === 'providers') renderProviders();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function openDialog(id) { const dialog = $(`#${id}`); if (!dialog.open) dialog.showModal(); }
function clearKey() { $('#provider-key').value = ''; $('#provider-key').type = keyType; }
function closeDialog(dialog) {
  if (dialog.id === 'provider-dialog') clearKey();
  if (dialog.id === 'models-dialog') { modelGeneration++; modelsLoading = false; modelRequest?.cancel(); modelRequest = null; }
  dialog.close();
}
function applyAppearance() {
  document.documentElement.style.fontSize = `${state.fontSize}px`;
  const dark = state.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : state.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#font-size').value = state.fontSize; $('#theme').value = state.theme;
}
function selectedProvider() { return providers.find(item => item.id === state.providerId); }
function conversation() {
  let value = state.conversations.find(item => item.id === state.activeConversation);
  if (!value) {
    value = { id: crypto.randomUUID(), title: '新会话', system: '', updated: Date.now(), messages: [] };
    state.conversations.push(value); state.activeConversation = value.id;
    if (state.conversations.length > 100) state.conversations.shift();
  }
  return value;
}
function updateSelection() {
  $('#selected-model').textContent = state.model || '选择模型';
  $('#selected-provider').textContent = selectedProvider()?.name || '接入自己的 API 后开始';
  const latest = state.conversations.filter(item => item.messages.length).at(-1);
  $('#resume-description').textContent = latest?.title || '接好模型，把第一个问题交给冷咖啡。';
}
function openProvider(mode = 'coldcoffee', provider) {
  $('#provider-form').reset(); clearKey();
  $('#provider-id').value = provider?.id || '';
  $('#provider-name').value = provider?.name || (mode === 'coldcoffee' ? '冷咖啡中转' : '');
  $('#provider-url').value = provider?.baseUrl || (mode === 'coldcoffee' ? SERVICES.api : '');
  $('#provider-protocol').value = provider?.protocol || 'chat';
  $('#provider-dialog-title').textContent = provider ? '编辑服务商' : mode === 'coldcoffee' ? '接入冷咖啡' : '添加其他服务商';
  $('#provider-key').placeholder = provider?.hasKey ? '已保存 Key；留空保留原 Key' : '填写自己的 Key';
  $('#provider-key-help').textContent = provider?.hasKey ? '原 Key 不会回填到输入框。填写新 Key 可替换，留空则保留。' : '只保存在本机加密存储。我们不会替你创建或赠送 Key。';
  $('#provider-form-error').hidden = true; $('#provider-save').disabled = false;
  openDialog('provider-dialog');
}
function renderProviders() {
  const list = $('#provider-list'); list.replaceChildren();
  if (!providers.length) {
    list.innerHTML = '<div class="empty-providers">还没有接入服务商。<br>上方接入冷咖啡，或添加你已有的中转。</div>'; return;
  }
  for (const provider of providers) {
    const card = document.createElement('article'); card.className = 'provider-card';
    const status = connectionState.get(provider.id);
    card.innerHTML = `<div class="provider-card-header"><div class="provider-avatar">${escape(provider.name.slice(0, 1))}</div><div><strong>${escape(provider.name)}</strong><p class="address">${escape(provider.baseUrl)}</p><span class="provider-state">${status === 'ready' ? '模型列表读取成功' : status === 'error' ? '连接待重试 · 可编辑配置' : provider.hasKey ? 'Key 已加密保存 · 尚待检测' : '请补充自己的 Key'} · ${provider.protocol === 'responses' ? 'Responses' : 'Chat Completions'}</span></div></div><div class="provider-actions"><button data-action="use">选模型开聊</button><button data-action="edit">编辑</button><button data-action="remove">删除</button></div>`;
    card.querySelector('[data-action="use"]').onclick = () => { state.providerId = provider.id; state.model = ''; saveSoon(); openModels(true); };
    card.querySelector('[data-action="edit"]').onclick = () => openProvider('other', provider);
    card.querySelector('[data-action="remove"]').onclick = () => {
      if (request) { toast('请先停止当前生成，再删除服务商'); return; }
      if (!window.confirm(`删除“${provider.name}”及本机保存的 Key？会话记录会保留。`)) return;
      try {
        bridge.deleteProvider(provider.id); providers = safeProviders(); modelCache.delete(provider.id);
        if (state.providerId === provider.id) { state.providerId = ''; state.model = ''; }
        saveNow(); renderProviders(); updateSelection(); toast('服务商与对应 Key 已删除');
      } catch (error) { toast(redactError(error.message)); }
    };
    list.append(card);
  }
}
async function refreshModels(providerId = state.providerId) {
  if (!providerId || modelsLoading) return;
  const generation = ++modelGeneration; modelsLoading = true; $('#refresh-models').disabled = true;
  $('#model-status').textContent = '正在读取模型列表…';
  let job;
  try {
    modelRequest?.cancel();
    job = bridge.nativeRequest({ providerId, path: '/models' });
    modelRequest = job;
    const { status } = await job.ready;
    const text = await job.text();
    if (status < 200 || status >= 300) throw new Error(httpError(status, text));
    let parsed; try { parsed = JSON.parse(text); } catch { throw new Error('接口返回了非 JSON 内容，请检查 API 地址'); }
    const models = readModels(parsed);
    modelCache.set(providerId, models); connectionState.set(providerId, 'ready');
    if (generation !== modelGeneration || providerId !== state.providerId) return;
    $('#model-status').textContent = models.length ? `读取成功 · ${models.length} 个模型` : '接口未列出模型，可在下方填写服务商提供的模型 ID。';
    renderModelList();
  } catch (error) {
    connectionState.set(providerId, 'error');
    if (generation === modelGeneration && providerId === state.providerId) $('#model-status').textContent = `${redactError(error.message)}。也可核对后手动填写模型 ID。`;
  } finally {
    job?.cancel();
    if (modelRequest === job) modelRequest = null;
    if (generation === modelGeneration) { modelsLoading = false; $('#refresh-models').disabled = false; }
    renderProviders();
  }
}
function httpError(status, text) {
  if (status === 401 || status === 403) return `HTTP ${status}：Key 无效、无权限或接口受限，请检查服务商设置`;
  if (status === 404) return 'HTTP 404：接口路径或模型不存在，请检查 API 地址与协议';
  if (status === 429) return 'HTTP 429：额度、余额或频率受限，请查看服务商账户';
  if (status >= 500) return `HTTP ${status}：服务商暂时异常，请稍后重试`;
  try { const parsed = JSON.parse(text); return `HTTP ${status}：${redactError(parsed.error?.message || parsed.message || '请求未成功')}`; }
  catch { return `HTTP ${status}：服务商未接受请求，请核对配置`; }
}
function openModels(fetch = false) {
  if (request) { toast('请先停止生成，再切换服务商或模型'); return; }
  if (!providers.length) { openProvider(); return; }
  if (!selectedProvider()) state.providerId = providers[0].id;
  $('#model-provider').replaceChildren(...providers.map(provider => {
    const option = document.createElement('option'); option.value = provider.id; option.textContent = provider.name; return option;
  }));
  $('#model-provider').value = state.providerId; $('#model-search').value = ''; $('#manual-model').value = state.model;
  $('#model-status').textContent = modelCache.has(state.providerId) ? `本次已读取 ${modelCache.get(state.providerId).length} 个模型` : '模型由所选服务商提供。可刷新列表，也可手动填写。';
  $('#refresh-models').disabled = false; modelsLoading = false;
  renderModelList(); openDialog('models-dialog');
  if (fetch || !modelCache.has(state.providerId)) refreshModels();
}
function renderModelList() {
  const search = $('#model-search').value.trim().toLowerCase();
  const models = (modelCache.get(state.providerId) || []).filter(id => id.toLowerCase().includes(search));
  const list = $('#model-list'); list.replaceChildren();
  for (const model of models.slice(0, 250)) {
    const button = document.createElement('button'); button.className = `model-option${model === state.model ? ' selected' : ''}`;
    button.textContent = model; button.onclick = () => chooseModel(model); list.append(button);
  }
  if (models.length > 250) { const note = document.createElement('p'); note.className = 'field-help'; note.textContent = '请输入关键词缩小结果，当前显示前 250 项。'; list.append(note); }
}
function chooseModel(model) {
  state.model = String(model).trim(); if (!state.model) return;
  closeDialog($('#models-dialog')); saveNow(); updateSelection(); showPage('chat'); toast(`已选择 ${state.model}`);
}
function messageContent(message) {
  return message.image ? [{ type: 'text', text: message.text || '请描述这张图片。' }, { type: 'image_url', image_url: { url: message.image } }] : message.text;
}
function markdown(text) {
  return DOMPurify.sanitize(marked.parse(text || '', { breaks: true, gfm: true }), {
    FORBID_TAGS: ['img', 'video', 'audio', 'iframe', 'form', 'input', 'button', 'style', 'svg', 'math'],
    FORBID_ATTR: ['style', 'src', 'srcset'],
  });
}
function renderMessages() {
  const list = $('#messages'), chat = conversation(); list.replaceChildren();
  if (!chat.messages.length) {
    list.innerHTML = `<div class="chat-empty"><img src="assets/icon.png" alt=""><h2>来杯冷咖啡，<br>开始你的好点子。</h2><p>连接你选择的服务商，让模型陪你写作、解题、读图和整理思路。</p><div class="suggestions"><button>帮我把一个想法拆成可执行的步骤</button><button>把这段文字改得更清楚自然</button><button>给我一个今天可以完成的小项目</button></div></div>`;
    list.querySelectorAll('.suggestions button').forEach(button => { button.onclick = () => { $('#message-input').value = button.textContent; $('#message-input').focus(); }; }); return;
  }
  for (const message of chat.messages) list.append(createMessage(message));
}
function createMessage(message) {
  const node = document.createElement('article'); node.className = `message ${message.role}`; node.dataset.messageId = message.id;
  if (message.role === 'user') {
    if (message.image) { const image = document.createElement('img'); image.className = 'message-image'; image.src = message.image; image.alt = '本次提问附图'; node.append(image); }
    const text = document.createElement('div'); text.textContent = message.text; node.append(text);
    return node;
  }
  node.innerHTML = '<div class="message-author"><img src="assets/icon.png" alt=""><span></span></div><details class="reasoning" hidden><summary>思考过程</summary><div></div></details><div class="message-body"></div><div class="message-error" hidden></div><div class="message-meta"></div><div class="message-controls"><button data-copy>复制回复</button><button data-retry>重新生成</button></div>';
  node.querySelector('.message-author span').textContent = message.model || '冷咖啡';
  updateMessage(node, message);
  node.querySelector('[data-copy]').onclick = () => { bridge.copyText(message.text); toast('回复已复制'); };
  node.querySelector('[data-retry]').onclick = () => retryMessage(message);
  return node;
}
function updateMessage(node, message) {
  node = document.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`) || node;
  node.querySelector('.message-body').innerHTML = markdown(message.text || (message.status === 'generating' ? '正在等待模型回复…' : ''));
  node.querySelector('.reasoning').hidden = !message.reasoning;
  node.querySelector('.reasoning div').textContent = message.reasoning || '';
  node.querySelector('.message-error').hidden = !message.error;
  node.querySelector('.message-error').textContent = message.error || '';
  const label = { generating: '正在生成', complete: '生成完成', stopped: '已停止 · 保留部分回复', interrupted: '上次连接已中断 · 可重新生成', error: '生成失败 · 可重试' };
  node.querySelector('.message-meta').textContent = label[message.status] || '';
  node.querySelector('[data-retry]').hidden = message.status === 'generating';
}
function scheduleMessageUpdate(node, message) {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    const nearBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 260;
    updateMessage(node, message);
    if (nearBottom && currentPage === 'chat') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });
}
async function generate(chat, placeholder, context) {
  const provider = selectedProvider();
  if (!provider) return;
  const node = createMessage(placeholder); $('#messages').append(node);
  const body = requestBody({ protocol: provider.protocol, model: state.model, messages: context.map(message => ({ role: message.role, content: messageContent(message) })), system: chat.system });
  let job;
  $('#send-message').hidden = true; $('#stop-message').hidden = false; $('#generation-status').textContent = '正在连接模型…';
  try {
    job = bridge.nativeRequest({ providerId: provider.id, path: provider.protocol === 'responses' ? '/responses' : '/chat/completions', method: 'POST', body });
    request = { job, chatId: chat.id, message: placeholder };
    const { status, headers } = await job.ready;
    if (status < 200 || status >= 300) throw new Error(httpError(status, await job.text()));
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    $('#generation-status').textContent = '模型正在回复…';
    if (contentType.includes('application/json')) {
      let value; try { value = JSON.parse(await job.text()); } catch { throw new Error('返回格式不正确，请核对接口协议'); }
      placeholder.text = extractResponse(value, provider.protocol);
      if (!placeholder.text) throw new Error('模型没有返回文字内容，请检查模型类型');
    } else {
      await consumeChatStream(job.stream, {
        protocol: provider.protocol,
        onText(text) { placeholder.text += text; scheduleMessageUpdate(node, placeholder); saveSoon(); },
        onReasoning(text) { placeholder.reasoning += text; scheduleMessageUpdate(node, placeholder); },
      });
    }
    if (placeholder.status === 'generating') placeholder.status = 'complete';
  } catch (error) {
    if (placeholder.status === 'stopped' || error.name === 'AbortError') placeholder.status = 'stopped';
    else { placeholder.status = 'error'; placeholder.error = redactError(error.message); }
  } finally {
    job?.cancel();
    if (request?.job === job) request = null;
    if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
    updateMessage(node, placeholder); chat.updated = Date.now(); saveNow();
    $('#send-message').hidden = false; $('#stop-message').hidden = true;
    $('#generation-status').textContent = '内容仅发送至所选服务商';
  }
}
async function sendMessage(event) {
  event?.preventDefault(); if (request) return;
  if (!selectedProvider() || !state.model) { openModels(true); return; }
  const text = $('#message-input').value.trim();
  if (!text && !attachedImage) return;
  if (text.length > 30000) { toast('单条消息请控制在三万字以内'); return; }
  const chat = conversation();
  if (chat.messages.length > 96) { toast('当前会话较长，请新建会话继续'); return; }
  chat.messages.push({ id: crypto.randomUUID(), role: 'user', text, image: attachedImage || '', status: 'complete' });
  if (chat.title === '新会话') chat.title = text.slice(0, 28) || '图片提问';
  const context = chat.messages.filter(message => message.role === 'user' || (message.role === 'assistant' && message.status === 'complete' && message.text));
  const response = { id: crypto.randomUUID(), role: 'assistant', text: '', reasoning: '', model: state.model, status: 'generating', error: '' };
  chat.messages.push(response); $('#message-input').value = ''; $('#message-input').style.height = 'auto'; attachedImage = null; renderAttachment();
  renderMessages(); $('#messages').lastElementChild?.remove(); updateSelection(); saveNow();
  await generate(chat, response, context);
}
async function retryMessage(message) {
  if (request) { toast('请先停止当前生成'); return; }
  if (!selectedProvider() || !state.model) { openModels(true); return; }
  const chat = conversation(), index = chat.messages.indexOf(message);
  if (index < 1) return;
  if (index !== chat.messages.length - 1 && !window.confirm('重新生成会移除这条回复之后的对话，继续？')) return;
  chat.messages.splice(index);
  const response = { id: crypto.randomUUID(), role: 'assistant', text: '', reasoning: '', model: state.model, status: 'generating', error: '' };
  const context = chat.messages.filter(item => item.role === 'user' || item.status === 'complete');
  chat.messages.push(response); renderMessages(); $('#messages').lastElementChild?.remove();
  await generate(chat, response, context);
}
function stopGeneration() {
  if (request) { request.message.status = 'stopped'; request.job.cancel(); toast('已停止，部分回复保留在本机'); }
}
function newConversation() {
  if (request) { toast('请先停止生成，再新建会话'); return; }
  state.activeConversation = ''; attachedImage = null; renderAttachment(); conversation(); saveNow(); showPage('chat');
}
function renderAttachment() {
  const target = $('#attachment-preview'); target.replaceChildren(); target.hidden = !attachedImage;
  if (!attachedImage) return;
  const image = document.createElement('img'); image.src = attachedImage; image.alt = '待发送图片';
  const text = document.createElement('span'); text.textContent = '发送消息时一并上传给所选服务商';
  const remove = document.createElement('button'); remove.className = 'icon-button'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', '移除图片');
  remove.onclick = () => { attachedImage = null; renderAttachment(); };
  target.append(image, text, remove);
}
async function readAttachment(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast('请选择 PNG、JPG 或 WebP 图片'); return; }
  if (file.size > 8 * 1024 * 1024) { toast('请选择 8MB 以内的图片'); return; }
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  attachedImage = canvas.toDataURL('image/jpeg', .85);
  if (attachedImage.length > 3 * 1024 * 1024) { attachedImage = null; toast('图片处理后仍较大，请换一张较小的图片'); return; }
  renderAttachment();
}
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren();
  for (const chat of [...state.conversations].sort((a, b) => b.updated - a.updated)) {
    const row = document.createElement('div'); row.className = 'history-row';
    row.innerHTML = `<button><strong>${escape(chat.title)}</strong><small>${chat.messages.length} 条消息 · ${new Date(chat.updated).toLocaleDateString('zh-CN')}</small></button><button class="delete-history">删除</button>`;
    row.firstElementChild.onclick = () => {
      if (request) { toast('请先停止当前生成，再切换会话'); return; }
      state.activeConversation = chat.id; closeDialog($('#history-dialog')); saveSoon(); renderMessages();
    };
    row.lastElementChild.onclick = () => {
      if (request?.chatId === chat.id) { toast('请先停止生成'); return; }
      if (!window.confirm(`删除本机会话“${chat.title}”？`)) return;
      state.conversations = state.conversations.filter(item => item.id !== chat.id); conversation(); saveNow(); renderHistory(); renderMessages();
    };
    list.append(row);
  }
}
function renderCommunity() {
  for (const group of SERVICES.groups) {
    const button = document.createElement('button'); button.className = 'qq-card';
    button.innerHTML = `<img src="${group.image}" alt="${group.name}二维码缩略图"><span><strong>${group.name}</strong><small>${group.number}</small></span>`;
    button.onclick = () => {
      $('#qr-title').textContent = group.name; $('#qr-image').src = group.image; $('#qr-number').textContent = group.number;
      $('#qr-copy').onclick = () => { bridge.copyText(group.number); toast('群号已复制'); }; openDialog('qr-dialog');
    };
    $('#qq-groups').append(button);
  }
}
async function showLicenses() {
  $('#content-title').textContent = '开源许可与版权';
  const body = $('#content-body'); body.replaceChildren();
  const intro = document.createElement('p');
  intro.textContent = '冷咖啡安卓客户端按 GNU GPL v3 开放源码。原创界面与安卓集成由冷咖啡维护；Chatbox 的三个公开 SSE 兼容模块保持上游代码原样，固定版本 v1.24.4。独立项目，非 Chatbox 官方出品或背书。';
  body.append(intro);
  const source = document.createElement('button'); source.className = 'button secondary full'; source.textContent = '获取本版对应源码与构建说明 ↗'; source.onclick = () => bridge.openExternal(`https://github.com/3641397194-wq/gpt6-Astra/releases/tag/v${VERSION}`); body.append(source);
  for (const [name, path] of [['版权与第三方说明', 'legal/THIRD_PARTY_NOTICES.md'], ['GNU GPL v3 完整正文', 'legal/GPL-3.0.txt']]) {
    const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
    summary.textContent = name; details.append(summary, pre); body.append(details);
    try { const response = await fetch(path); if (!response.ok) throw new Error(); pre.textContent = await response.text(); }
    catch { pre.textContent = '本机许可文件暂未读出，可在对应源码仓库中查看完整正文。'; }
  }
  openDialog('content-dialog');
}
function showPrivacy() {
  $('#content-title').textContent = '隐私与数据';
  $('#content-body').innerHTML = '<h3>Key 与本机数据</h3><p>安卓版把服务商 Key 放进 Android Keystore 支持的加密存储，原始 Key 不回填到网页界面。会话和设置保存在应用私有加密存储，系统备份已关闭。卸载应用或清除应用数据会移除本机记录。</p><h3>请求会发到哪里</h3><p>读取模型列表与聊天只发往你选择的服务商。你发送的文字和主动选择的图片会包含在请求中。冷咖啡与其他中转分别适用各自的服务条款、计费和隐私政策。</p><h3>公开分享</h3><p>“分享服务商配置”只包含名称、接口地址和协议，不包含 Key、会话或图片。社区入口和官网仅在你点击后打开。本客户端没有内置统计追踪或自动上传聊天记录。</p>';
  openDialog('content-dialog');
}

hydrateIcons(); renderCommunity(); renderProviders(); updateSelection(); applyAppearance();
if (!bridge.isNative()) { $('#runtime-badge').textContent = '浏览器预览'; }
$('#about-version').textContent = VERSION;
document.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => showPage(button.dataset.page); });
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => closeDialog(button.closest('dialog')); });
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(dialog); } });
});
document.querySelectorAll('[data-external]').forEach(button => { button.onclick = () => bridge.openExternal(SERVICES[button.dataset.external]); });
document.querySelectorAll('[data-community]').forEach(button => { button.onclick = () => showPage('community'); });
$('#brand-home').onclick = () => showPage('home');
$('#settings-open').onclick = () => openDialog('settings-dialog');
$('#home-connect').onclick = $('#provider-coldcoffee').onclick = () => openProvider();
$('#home-other').onclick = $('#add-provider').onclick = () => openProvider('other');
$('#resume-chat').onclick = () => showPage('chat');
$('#toggle-key').onclick = () => { const input = $('#provider-key'); input.type = input.type === keyType ? 'text' : keyType; };
$('#provider-form').onsubmit = async event => {
  event.preventDefault(); const button = $('#provider-save'); if (button.disabled) return; button.disabled = true;
  try {
    const provider = normalizeProvider({ id: $('#provider-id').value, name: $('#provider-name').value, baseUrl: $('#provider-url').value, protocol: $('#provider-protocol').value, apiKey: $('#provider-key').value });
    if (!provider.apiKey && !providers.find(item => item.id === provider.id)?.hasKey) throw new Error('请填写你自己的 API Key');
    bridge.saveProvider(provider); providers = safeProviders(); state.providerId = provider.id; state.model = ''; modelCache.delete(provider.id);
    closeDialog($('#provider-dialog')); saveNow(); renderProviders(); updateSelection(); openModels(true);
  } catch (error) { $('#provider-form-error').hidden = false; $('#provider-form-error').textContent = redactError(error.message); }
  finally { button.disabled = false; }
};
$('#model-open').onclick = () => openModels();
$('#model-search').oninput = renderModelList;
$('#model-provider').onchange = () => { modelGeneration++; modelsLoading = false; modelRequest?.cancel(); modelRequest = null; state.providerId = $('#model-provider').value; state.model = ''; $('#refresh-models').disabled = false; renderModelList(); refreshModels(); };
$('#refresh-models').onclick = () => refreshModels();
$('#manual-model-form').onsubmit = event => { event.preventDefault(); chooseModel($('#manual-model').value); };
$('#composer').onsubmit = sendMessage;
$('#stop-message').onclick = stopGeneration;
$('#new-chat').onclick = $('#history-new').onclick = () => { closeDialog($('#history-dialog')); newConversation(); };
$('#history-open').onclick = () => { renderHistory(); openDialog('history-dialog'); };
$('#message-input').oninput = event => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(150, event.target.scrollHeight)}px`; };
$('#message-input').onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); sendMessage(); } };
$('#attach-open').onclick = () => $('#attachment-input').click();
$('#attachment-input').onchange = async event => { try { await readAttachment(event.target.files[0]); } catch { toast('图片读取失败，请换一张图片'); } event.target.value = ''; };
$('#system-open').onclick = () => { $('#system-prompt').value = conversation().system; openDialog('system-dialog'); };
$('#system-save').onclick = () => { if (request) { toast('请停止生成后修改会话设置'); return; } conversation().system = $('#system-prompt').value; saveNow(); closeDialog($('#system-dialog')); toast('当前会话设置已保存'); };
$('#font-size').onchange = event => { state.fontSize = Number(event.target.value); applyAppearance(); saveNow(); };
$('#theme').onchange = event => { state.theme = event.target.value; applyAppearance(); saveNow(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') applyAppearance(); });
$('#export-config').onclick = () => { bridge.shareText(JSON.stringify(exportPublicState(state, providers), null, 2)); toast('已打开分享；内容不含 Key 或聊天记录'); };
$('#privacy-open').onclick = showPrivacy;
$('#licenses-open').onclick = showLicenses;
$('#source-open').onclick = () => bridge.openExternal(SOURCE_URL);
$('#wechat-help').onclick = () => { toast('微信群最新有效邀请请进 QQ 群私聊管理获取'); $('#qq-groups').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
$('#custom-contact').onclick = () => { $('#qq-groups').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('选择任一 QQ 群，进群私聊管理沟通方案与报价'); };
document.addEventListener('click', event => {
  const link = event.target.closest('.message-body a'); if (!link) return;
  event.preventDefault();
  try { const url = new URL(link.href); if (['http:', 'https:'].includes(url.protocol)) bridge.openExternal(url.href); }
  catch { toast('链接格式不正确'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('beforeunload', saveNow);
