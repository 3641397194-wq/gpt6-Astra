'use strict';
const string = { type: 'string' }, number = { type: 'integer' }, object = { type: 'object' };
const strList = { oneOf: [{ type: 'string' }, { type: 'array', items: string }] };
const spec = (name, title, description, properties, required = []) => ({ name, title, description, inputSchema: { type: 'object', properties, required, additionalProperties: false } });
const http = { url: string, timeoutMs: number, headers: object, verifyTls: { type: 'boolean' }, maxBytes: number };
const TOOLS = [
  spec('resolve_host', '查地址', 'Resolve one hostname to IPv4/IPv6 addresses.', { host: string }, ['host']),
  spec('scan_ports', '扫端口', 'Original concurrent TCP connect scanner; no external scanner dependency.', { host: string, ports: strList, concurrency: number, timeoutMs: number }, ['host']),
  spec('inspect_http', '看网站', 'Request a URL, record headers, title, hashes and evidence-based fingerprints. Redirects are recorded, not followed.', { ...http, method: string, body: string }, ['url']),
  spec('crawl_site', '找页面', 'Bounded same-origin crawling of links, scripts and forms.', { ...http, maxPages: number }, ['url']),
  spec('find_paths', '找目录', 'Concurrent path discovery against a random missing-path baseline, suppressing identical soft-404 pages.', { ...http, paths: strList, concurrency: number }, ['url']),
  spec('fuzz_http', '测输入', 'Replace FUZZ in URL/body with provided payloads; compare actual status, response length and reflection.', { ...http, method: string, body: string, payloads: strList, concurrency: number }, ['url', 'payloads']),
  spec('check_web', '查问题', 'Record header settings and test one explicit query parameter for raw reflection, SQL error disclosure and redirects. Reflection is not proof of script execution.', { ...http, parameter: string }, ['url']),
  spec('analyze_binary', '拆文件', 'Original PE/ELF parser with sections, imports, symbols, hashes, strings, entropy and mitigation flags. Other files receive RAW analysis.', { file: string, minLength: number, stringLimit: number }, ['file']),
  spec('search_bytes', '找字节', 'Search a sample for hexadecimal signatures; ?? means one wildcard byte.', { file: string, pattern: string }, ['file', 'pattern']),
  spec('patch_bytes', '做补丁', 'Verify expected bytes/hash and create a new patched copy with a manifest; the source stays unchanged.', { file: string, expectedSha256: string, patches: { type: 'array', items: { type: 'object', properties: { offset: number, expected: string, replace: string }, required: ['offset', 'expected', 'replace'], additionalProperties: false } } }, ['file', 'patches']),
  spec('diff_files', '比文件', 'Compare byte ranges of two explicitly named files in the workspace.', { file: string, other: string }, ['file', 'other']),
  spec('decode_text', '解文本', 'Base64, hex, URL, JWT inspection and MD5/SHA hashing; JWT inspection does not verify signatures.', { text: string, mode: string }, ['text']),
  spec('match_hash', '找原文', 'Test an explicit candidate list against an MD5/SHA digest.', { hash: string, algorithm: string, words: strList }, ['hash', 'words']),
  spec('ida_connect', '接上 IDA', 'Perform a real MCP handshake and obtain live tool names and schemas.', { url: string }),
  spec('ida_call', '调用 IDA', 'Call only a tool returned by ida_connect, using its live input schema.', { url: string, name: string, arguments: object }, ['name']),
  spec('run_workflow', '自动跑', 'Run the original web or binary analysis pipeline and aggregate actual results. IDA is opt-in and failures are explicit.', { mode: { type: 'string', enum: ['web', 'reverse'] }, url: string, file: string, maxPages: number, parameter: string, paths: strList, ports: strList, timeoutMs: number, useIda: { type: 'boolean' }, idaUrl: string }, ['mode']),
];
function validate(value, schema, at = 'arguments') {
  if (schema.oneOf) { if (!schema.oneOf.some(s => { try { validate(value, s, at); return true; } catch { return false; } })) throw new Error(`${at}: invalid type`); return; }
  const type = schema.type;
  if (type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error(`${at}: expected object`);
  if (type === 'string' && typeof value !== 'string') throw new Error(`${at}: expected string`);
  if (type === 'integer' && !Number.isSafeInteger(value)) throw new Error(`${at}: expected integer`);
  if (type === 'boolean' && typeof value !== 'boolean') throw new Error(`${at}: expected boolean`);
  if (type === 'array' && !Array.isArray(value)) throw new Error(`${at}: expected array`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${at}: unexpected value`);
  if (type === 'array') value.forEach((v, i) => validate(v, schema.items || {}, `${at}[${i}]`));
  if (type === 'object') {
    for (const name of schema.required || []) if (!Object.hasOwn(value, name)) throw new Error(`${at}.${name}: required`);
    for (const [name, v] of Object.entries(value)) { const child = schema.properties?.[name]; if (!child && schema.additionalProperties === false) throw new Error(`${at}.${name}: unknown field`); if (child) validate(v, child, `${at}.${name}`); }
  }
}
module.exports = { TOOLS, validate };
