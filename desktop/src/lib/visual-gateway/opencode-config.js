'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { applyEdits, modify, parse } = require('jsonc-parser');

const PROVIDER = 'coldcoffee-workbench';
const MODEL = `${PROVIDER}/gateway`;
const PACKAGE = '@ai-sdk/openai-compatible';
const LOCAL_KEY = 'coldcoffee-local';
const LOOPBACK = /^http:\/\/127\.0\.0\.1:\d+\/v1$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const absolute = value => typeof value === 'string' && path.isAbsolute(value);

function openCodeTarget(home, env) {
  const globalRoot = path.join(absolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, '.config'), 'opencode');
  const customDir = absolute(env.OPENCODE_CONFIG_DIR);
  const customFile = !customDir && absolute(env.OPENCODE_CONFIG);
  const root = customDir ? env.OPENCODE_CONFIG_DIR : customFile ? path.dirname(env.OPENCODE_CONFIG) : globalRoot;
  const names = customFile ? [path.basename(env.OPENCODE_CONFIG)] : ['opencode.jsonc', 'opencode.json'];
  const candidates = customFile || customDir ? names : [...names, 'config.json'];

  function filename() {
    return names.find(name => fs.lstatSync(path.join(root, name), { throwIfNoEntry: false })) ||
      (customFile ? names[0] : 'opencode.json');
  }
  return { root, filename, candidates };
}

function readDocument(before) {
  const original = before === null ? '{}\n' : before.toString('utf8');
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = original.slice(bom.length);
  const errors = [];
  const config = parse(text, errors, { allowTrailingComma: true, allowEmptyContent: true });
  if (errors.length || (config !== undefined && !object(config))) throw new Error('OpenCode 配置有语法错误，请在原软件中检查后再接入');
  return { bom, text, config: config ?? {} };
}

function openCodeConfig(relative, files, model, endpoint, context) {
  if (!LOOPBACK.test(endpoint)) throw new Error('请先启动本机网关再接入 OpenCode');
  if (/\{(?:env|file):/i.test(model)) throw new Error('此模型标识与 OpenCode 配置格式冲突，请选择另一模型');
  const documents = files.map(file => ({ relative: file.relative, ...readDocument(file.before) }));
  const { bom, text: original, config } = documents.find(file => file.relative === relative);
  const formats = new Set();
  for (const { config: source } of documents) {
    for (const key of ['providers', 'provider']) {
      if (!Object.hasOwn(source, key)) continue;
      if (!object(source[key])) throw new Error('OpenCode 服务商配置格式有误');
      if (!Object.hasOwn(source[key], PROVIDER)) continue;
      const provider = source[key][PROVIDER];
      const settings = key === 'providers' ? provider?.settings : provider?.options;
      if (settings?.apiKey !== LOCAL_KEY || !LOOPBACK.test(settings.baseURL ?? '')) {
        throw new Error('OpenCode 配置已经使用冷咖啡服务商标识，请先检查同名服务商');
      }
      formats.add(key);
    }
  }
  if (formats.size > 1) throw new Error('OpenCode 中存在两种格式的冷咖啡服务商，请检查当前使用的配置');
  // Supported V1 providers are also read by V2. Keep an existing native V2 map native.
  const key = formats.values().next().value || (documents.some(doc => Object.hasOwn(doc.config, 'providers')) ? 'providers' : 'provider');
  const native = key === 'providers';
  const root = [key, PROVIDER];
  const settingsKey = native ? 'settings' : 'options';
  const chosen = [...root, 'models', 'gateway'];
  const idKey = native ? 'modelID' : 'id';
  const enabled = documents.find(doc => Object.hasOwn(doc.config, 'enabled_providers'))?.config.enabled_providers;
  const disabled = documents.find(doc => Object.hasOwn(doc.config, 'disabled_providers'))?.config.disabled_providers;
  if (Array.isArray(disabled) && disabled.includes(PROVIDER)) throw new Error('OpenCode 已禁用冷咖啡服务商，请先在客户端配置中启用');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let text = Object.keys(config).length === 0 && !original.includes('{') ? original + (original.endsWith(eol) ? '' : eol) + '{}' + eol : original;
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol };
  const set = (key, value) => {
    text = applyEdits(text, modify(text, key, value, { formattingOptions }));
  };
  if (!Object.hasOwn(config, '$schema')) set(['$schema'], 'https://opencode.ai/config.json');
  set([...root, 'name'], '冷咖啡本机网关');
  set([...root, native ? 'package' : 'npm'], native ? '@opencode/ai/providers/openai-compatible' : PACKAGE);
  set([...root, settingsKey, 'baseURL'], endpoint);
  set([...root, settingsKey, 'apiKey'], LOCAL_KEY);
  set([...chosen, 'name'], model);
  set([...chosen, idKey], model);
  if (!native && Number.isSafeInteger(context) && context > 0) set([...chosen, 'limit'], { context, output: 0 });
  else if (config[key]?.[PROVIDER]?.models?.gateway?.limit !== undefined && !native) set([...chosen, 'limit'], undefined);
  set(['model'], MODEL);
  if (Array.isArray(enabled) && !enabled.includes(PROVIDER)) {
    set(['enabled_providers'], [...enabled, PROVIDER]);
  }
  const errors = [];
  const result = parse(text, errors, { allowTrailingComma: true });
  const provider = result?.[key]?.[PROVIDER];
  if (errors.length || result?.model !== MODEL ||
      provider?.[settingsKey]?.baseURL !== endpoint || provider?.[settingsKey]?.apiKey !== LOCAL_KEY ||
      provider?.models?.gateway?.[idKey] !== model ||
      (Array.isArray(enabled) && !enabled.includes(PROVIDER) && !result.enabled_providers?.includes(PROVIDER))) {
    throw new Error('OpenCode 配置中存在冲突或重复项，请检查后再接入');
  }
  return Buffer.from(bom + text, 'utf8');
}

module.exports = { openCodeTarget, openCodeConfig };
