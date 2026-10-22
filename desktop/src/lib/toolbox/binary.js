'use strict';
const { digest, integer } = require('./common');
const MAX_FILE = 64 * 1024 * 1024;
function entropy(bytes) { const counts = new Uint32Array(256); for (const byte of bytes) counts[byte]++; let h = 0; for (const n of counts) if (n) { const p = n / bytes.length; h -= p * Math.log2(p); } return Number(h.toFixed(4)); }
function reader(b, little = true) {
  const need = (off, n) => { if (!Number.isSafeInteger(off) || off < 0 || off + n > b.length) throw new Error(`Truncated binary at 0x${off.toString(16)}`); };
  return { need, u16: o => { need(o, 2); return little ? b.readUInt16LE(o) : b.readUInt16BE(o); }, u32: o => { need(o, 4); return little ? b.readUInt32LE(o) : b.readUInt32BE(o); }, u64: o => { need(o, 8); return '0x' + (little ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o)).toString(16); }, number64: o => { need(o, 8); const n = little ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Binary offset exceeds integer range'); return Number(n); } };
}
function cstr(b, offset, max = 4096) { if (offset < 0 || offset >= b.length) return ''; const end = b.indexOf(0, offset); return b.subarray(offset, end < 0 ? Math.min(b.length, offset + max) : Math.min(end, offset + max)).toString('utf8'); }
function hex(value) { return '0x' + Number(value).toString(16); }
function readPE(b) {
  const r = reader(b); const p = r.u32(0x3c); r.need(p, 24);
  if (b.toString('ascii', p, p + 4) !== 'PE\0\0') throw new Error('Invalid PE signature');
  const machine = r.u16(p + 4), count = r.u16(p + 6), optSize = r.u16(p + 20), flags = r.u16(p + 22), opt = p + 24;
  if (count > 256) throw new Error('PE section count exceeds 256'); r.need(opt, optSize);
  const magic = r.u16(opt), is64 = magic === 0x20b;
  if (![0x10b, 0x20b].includes(magic) || optSize < (is64 ? 112 : 96)) throw new Error('Unsupported PE optional header');
  const entry = r.u32(opt + 16); const imageBase = is64 ? r.u64(opt + 24) : hex(r.u32(opt + 28)); const dllFlags = r.u16(opt + 70);
  const sections = [];
  for (let i = 0; i < count; i++) {
    const o = opt + optSize + i * 40; r.need(o, 40);
    const offset = r.u32(o + 20), size = r.u32(o + 16), virtualSize = r.u32(o + 8), address = r.u32(o + 12), attributes = r.u32(o + 36);
    r.need(offset, size);
    sections.push({ name: cstr(b, o, 8), offset, size, virtualSize, address: hex(address), rva: address, readable: Boolean(attributes & 0x40000000), writable: Boolean(attributes & 0x80000000), executable: Boolean(attributes & 0x20000000), entropy: entropy(b.subarray(offset, offset + size)) });
  }
  const toOffset = address => {
    if (address < r.u32(opt + 60) && address < b.length) return address;
    const section = sections.find(s => address >= s.rva && address - s.rva < s.size);
    return section ? section.offset + address - section.rva : null;
  };
  const imports = [], exports = [];
  const directories = opt + (is64 ? 112 : 96); const dirCount = r.u32(opt + (is64 ? 108 : 92));
  if (dirCount > 1 && directories + 16 <= opt + optSize) {
    const imp = toOffset(r.u32(directories + 8));
    if (imp !== null && r.u32(directories + 8)) {
      for (let i = 0; i < 512; i++) {
        const o = imp + i * 20; r.need(o, 20);
        const thunk = r.u32(o), nameRva = r.u32(o + 12), first = r.u32(o + 16); if (!thunk && !nameRva && !first) break;
        const nameOffset = toOffset(nameRva), dll = nameOffset === null ? hex(nameRva) : cstr(b, nameOffset); let at = toOffset(thunk || first); if (at === null) continue;
        for (let j = 0; j < 4096 && imports.length < 2000; j++, at += is64 ? 8 : 4) {
          r.need(at, is64 ? 8 : 4); const value = is64 ? b.readBigUInt64LE(at) : BigInt(r.u32(at)); if (!value) break;
          const ordinal = Boolean(value & (is64 ? 0x8000000000000000n : 0x80000000n));
          const nameAt = ordinal ? null : toOffset(Number(value)); imports.push({ library: dll, name: ordinal ? '#' + (value & 0xffffn).toString() : (nameAt === null ? hex(Number(value)) : cstr(b, nameAt + 2)) });
        }
      }
    }
  }
  if (dirCount > 0 && directories + 8 <= opt + optSize) {
    const exportRva = r.u32(directories), exp = toOffset(exportRva);
    if (exp !== null && exportRva) {
      r.need(exp, 40); const n = Math.min(r.u32(exp + 24), 2000), names = toOffset(r.u32(exp + 32));
      if (names !== null) for (let i = 0; i < n; i++) { const o = toOffset(r.u32(names + i * 4)); if (o !== null) exports.push(cstr(b, o)); }
    }
  }
  return { format: 'PE', bits: is64 ? 64 : 32, architecture: ({ 0x14c: 'x86', 0x8664: 'x86_64', 0xaa64: 'ARM64', 0x1c4: 'ARM' })[machine] || hex(machine), imageBase, entry: hex(entry), entryOffset: toOffset(entry), sections, imports, exports, mitigations: { aslr: Boolean(dllFlags & 0x40), nx: Boolean(dllFlags & 0x100), cfg: Boolean(dllFlags & 0x4000), dll: Boolean(flags & 0x2000) } };
}
function readELF(b) {
  if (![1, 2].includes(b[4]) || ![1, 2].includes(b[5])) throw new Error('Invalid ELF class/endianness');
  const is64 = b[4] === 2, little = b[5] === 1, r = reader(b, little); r.need(0, is64 ? 64 : 52);
  const sectionOffset = is64 ? r.number64(40) : r.u32(32), sectionSize = r.u16(is64 ? 58 : 46), sectionCount = r.u16(is64 ? 60 : 48), namesIndex = r.u16(is64 ? 62 : 50);
  const programOffset = is64 ? r.number64(32) : r.u32(28), programSize = r.u16(is64 ? 54 : 42), programCount = r.u16(is64 ? 56 : 44);
  if (sectionCount > 4096 || programCount > 4096 || (sectionCount && sectionSize < (is64 ? 64 : 40)) || (programCount && programSize < (is64 ? 56 : 32))) throw new Error('Invalid ELF table sizes');
  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const o = sectionOffset + i * sectionSize; r.need(o, sectionSize);
    const type = r.u32(o + 4), offset = is64 ? r.number64(o + 24) : r.u32(o + 16), size = is64 ? r.number64(o + 32) : r.u32(o + 20), flags = is64 ? r.number64(o + 8) : r.u32(o + 8);
    if (type !== 8) r.need(offset, size);
    sections.push({ nameIndex: r.u32(o), name: '', type, offset, size, address: is64 ? r.u64(o + 16) : hex(r.u32(o + 12)), link: r.u32(o + (is64 ? 40 : 24)), entrySize: is64 ? r.number64(o + 56) : r.u32(o + 36), writable: Boolean(flags & 1), executable: Boolean(flags & 4), entropy: type === 8 ? 0 : entropy(b.subarray(offset, offset + size)) });
  }
  const names = sections[namesIndex]; for (const s of sections) s.name = names && s.nameIndex < names.size ? cstr(b, names.offset + s.nameIndex) : '';
  const imports = [], exports = [];
  for (const s of sections.filter(s => [2, 11].includes(s.type))) {
    const str = sections[s.link], stride = s.entrySize || (is64 ? 24 : 16); if (!str || stride < (is64 ? 24 : 16)) continue;
    for (let o = s.offset; o + stride <= s.offset + s.size && imports.length + exports.length < 2000; o += stride) {
      const nameIndex = r.u32(o), idx = r.u16(o + (is64 ? 6 : 14)); if (!nameIndex || nameIndex >= str.size) continue;
      const symbol = { name: cstr(b, str.offset + nameIndex), address: is64 ? r.u64(o + 8) : hex(r.u32(o + 4)) };
      if (idx === 0) imports.push(symbol); else exports.push(symbol);
    }
  }
  let nx = null, entryOffset = null; const entryN = is64 ? r.number64(24) : r.u32(24);
  for (let i = 0; i < programCount; i++) {
    const o = programOffset + i * programSize; r.need(o, programSize); const type = r.u32(o), flags = r.u32(o + (is64 ? 4 : 24));
    if (type === 0x6474e551) nx = !(flags & 1);
    if (type === 1) { const va = is64 ? r.number64(o + 16) : r.u32(o + 8), offset = is64 ? r.number64(o + 8) : r.u32(o + 4), size = is64 ? r.number64(o + 32) : r.u32(o + 16); if (entryN >= va && entryN - va < size) entryOffset = offset + entryN - va; }
  }
  return { format: 'ELF', bits: is64 ? 64 : 32, endian: little ? 'little' : 'big', architecture: ({ 3: 'x86', 62: 'x86_64', 40: 'ARM', 183: 'ARM64' })[r.u16(18)] || hex(r.u16(18)), entry: hex(entryN), entryOffset, sections, imports, exports, mitigations: { pieOrShared: r.u16(16) === 3, nx } };
}
function stringsOf(b, minLength = 5, limit = 500) {
  const output = [];
  for (const stride of [1, 2]) {
    for (let i = 0; i < b.length && output.length < limit;) {
      const start = i; let text = '';
      while (i < b.length && b[i] >= 32 && b[i] <= 126 && (stride === 1 || b[i + 1] === 0)) { if (text.length < 400) text += String.fromCharCode(b[i]); i += stride; }
      if ((i - start) / stride >= minLength) output.push({ offset: start, encoding: stride === 1 ? 'ASCII' : 'UTF-16LE', text });
      i += stride === 2 ? 1 : 1;
    }
  }
  return output.sort((a, b) => a.offset - b.offset);
}
function analyze(b, options = {}) {
  if (b.length > MAX_FILE) throw new Error('样本上限 64 MiB');
  let info = { format: 'RAW', sections: [], imports: [], exports: [] };
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) info = readPE(b);
  else if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x7f, 69, 76, 70]))) info = readELF(b);
  const strings = stringsOf(b, integer(options.minLength, 5, 3, 100, 'minLength'), integer(options.stringLimit, 500, 1, 2000, 'stringLimit'));
  const warnings = [];
  for (const s of info.sections) { if (s.writable && s.executable) warnings.push(`${s.name}: writable and executable`); if (s.entropy > 7.2) warnings.push(`${s.name}: high entropy ${s.entropy}`); }
  const at = info.entryOffset ?? 0;
  return { ...info, bytes: b.length, hashes: { sha256: digest(b), sha1: digest(b, 'sha1'), md5: digest(b, 'md5') }, entropy: entropy(b), strings, checkHints: strings.filter(s => /license|serial|check|verify|password|trial|flag\{|ctf\{/i.test(s.text)), warnings, entryBytes: b.subarray(at, Math.min(b.length, at + 96)).toString('hex').match(/.{1,2}/g)?.join(' ') || '' };
}
function parseHex(value, wildcards = false) {
  const compact = String(value || '').replace(/\s+/g, '').replace(/^0x/i, '');
  if (!compact || compact.length % 2 || !new RegExp(wildcards ? '^(?:[0-9a-f]{2}|\\?\\?)+$' : '^[0-9a-f]+$', 'i').test(compact)) throw new Error(wildcards ? '填写十六进制字节，通配符用 ??' : '填写完整的十六进制字节');
  return compact.match(/../g).map(v => v === '??' ? null : parseInt(v, 16));
}
function searchBytes(b, pattern) {
  const values = parseHex(pattern, true), offsets = [];
  if (values.length > 4096) throw new Error('特征长度上限 4096 字节');
  const frequency = new Uint32Array(256); for (const byte of b.subarray(0, 65536)) frequency[byte]++;
  let anchor = -1; for (let j = 0; j < values.length; j++) if (values[j] !== null && (anchor < 0 || frequency[values[j]] < frequency[values[anchor]])) anchor = j;
  let checks = 0, limited = false, resumeOffset = 0;
  for (let i = 0; i <= b.length - values.length;) {
    if (anchor >= 0) { const found = b.indexOf(values[anchor], i + anchor); if (found < 0) break; i = found - anchor; if (i > b.length - values.length) break; }
    let match = true;
    for (let j = 0; j < values.length; j++) if (values[j] !== null) { checks++; if (values[j] !== b[i + j]) { match = false; break; } }
    if (match) offsets.push(i); i++;
    if (offsets.length === 1000 || checks >= 20000000) { limited = true; resumeOffset = i; break; }
  }
  return { pattern, offsets, count: offsets.length, limited, ...(limited ? { resumeOffset } : {}) };
}
function patchBytes(b, patches, expectedSha256) {
  if (expectedSha256 && digest(b) !== String(expectedSha256).toLowerCase()) throw new Error('样本 SHA-256 与预期不一致');
  if (!Array.isArray(patches) || !patches.length || patches.length > 100) throw new Error('填写 1..100 条补丁');
  const ranges = patches.map(p => {
    const offset = integer(p.offset, -1, 0, b.length - 1, 'offset'), before = Buffer.from(parseHex(p.expected)), after = Buffer.from(parseHex(p.replace));
    if (before.length !== after.length || offset + before.length > b.length) throw new Error('原字节与新字节须等长且位于文件内');
    if (!b.subarray(offset, offset + before.length).equals(before)) throw new Error(`0x${offset.toString(16)} 原字节与预期不一致`);
    return { offset, before, after };
  }).sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < ranges.length; i++) if (ranges[i].offset < ranges[i - 1].offset + ranges[i - 1].before.length) throw new Error('补丁区间存在重叠');
  const output = Buffer.from(b); for (const p of ranges) p.after.copy(output, p.offset);
  return { output, manifest: { originalSha256: digest(b), patchedSha256: digest(output), bytes: b.length, patches: ranges.map(p => ({ offset: p.offset, expected: p.before.toString('hex'), replace: p.after.toString('hex') })) } };
}
function diffBytes(a, b) {
  const ranges = []; let start = null, changed = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { changed++; if (start === null) start = i; }
    else if (start !== null) { if (ranges.length < 1000) ranges.push({ offset: start, length: i - start, before: a.subarray(start, i).toString('hex').slice(0, 256), after: b.subarray(start, i).toString('hex').slice(0, 256) }); start = null; }
  }
  if (start !== null && ranges.length < 1000) ranges.push({ offset: start, length: Math.max(a.length, b.length) - start, before: a.subarray(start).toString('hex').slice(0, 256), after: b.subarray(start).toString('hex').slice(0, 256) });
  return { originalBytes: a.length, modifiedBytes: b.length, changed, ranges, limited: ranges.length === 1000 };
}
function decodeText({ text = '', mode = 'base64_decode' }) {
  const input = String(text); if (Buffer.byteLength(input) > 2 * 1024 * 1024) throw new Error('文本上限 2 MiB');
  let result;
  if (mode === 'base64_decode') { if (!/^[A-Za-z0-9+/=_\-\s]*$/.test(input)) throw new Error('Base64 字符格式无效'); result = Buffer.from(input, 'base64').toString('utf8'); }
  else if (mode === 'base64_encode') result = Buffer.from(input).toString('base64');
  else if (mode === 'hex_decode') result = Buffer.from(parseHex(input)).toString('utf8');
  else if (mode === 'hex_encode') result = Buffer.from(input).toString('hex');
  else if (mode === 'url_decode') result = decodeURIComponent(input);
  else if (mode === 'url_encode') result = encodeURIComponent(input);
  else if (mode === 'jwt') { const parts = input.split('.'); if (parts.length !== 3) throw new Error('JWT 应有三段'); result = { header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')), payload: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')), signatureVerified: false }; }
  else if (['md5', 'sha1', 'sha256', 'sha512'].includes(mode)) result = digest(input, mode);
  else throw new Error('未知文本转换');
  return { mode, result };
}
function matchHash({ hash, algorithm = 'sha256', words }) {
  if (!['md5', 'sha1', 'sha256', 'sha512'].includes(algorithm)) throw new Error('支持 MD5 / SHA1 / SHA256 / SHA512');
  const list = Array.isArray(words) ? words : String(words || '').split(/\r?\n/); if (list.length > 100000) throw new Error('单次最多 100000 条候选');
  const target = String(hash || '').trim().toLowerCase(); if (!/^[0-9a-f]+$/.test(target) || target.length !== digest('', algorithm).length) throw new Error('哈希格式与算法不一致');
  for (let i = 0; i < list.length; i++) if (digest(String(list[i]), algorithm) === target) return { found: true, value: list[i], tried: i + 1, algorithm };
  return { found: false, tried: list.length, algorithm };
}
module.exports = { MAX_FILE, analyze, readPE, readELF, entropy, stringsOf, parseHex, searchBytes, patchBytes, diffBytes, decodeText, matchHash };
