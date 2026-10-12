'use strict';
const ColdCoffeeReverseCore = (() => {
  const CAP = 4 * 1024 * 1024;

  function u16(v, o, le) { return o + 2 <= v.byteLength ? v.getUint16(o, le) : null; }
  function u32(v, o, le) { return o + 4 <= v.byteLength ? v.getUint32(o, le) : null; }
  function u64(v, o) {
    if (o + 8 > v.byteLength) return null;
    return v.getUint32(o, true) + v.getUint32(o + 4, true) * 0x100000000;
  }
  function i32(b, o) {
    const n = (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) | 0;
    return n;
  }
  function hex(n, width) {
    const s = (n >>> 0).toString(16);
    return width ? s.padStart(width, '0') : s;
  }
  function entropy(bytes) {
    if (!bytes.length) return 0;
    const count = new Uint32Array(256);
    for (const b of bytes) count[b] += 1;
    let sum = 0;
    for (const n of count) {
      if (!n) continue;
      const p = n / bytes.length;
      sum -= p * Math.log2(p);
    }
    return sum;
  }
  function cstring(bytes, off, limit) {
    if (off < 0 || off >= bytes.length) return '';
    let end = off;
    const stop = Math.min(bytes.length, off + (limit || 260));
    while (end < stop && bytes[end] !== 0) end += 1;
    return new TextDecoder('latin1').decode(bytes.subarray(off, end));
  }
  function rvaToOff(sections, rva) {
    for (const s of sections) {
      const span = Math.max(s.virtSize, s.rawSize);
      if (rva >= s.va && rva < s.va + span) return s.raw + (rva - s.va);
    }
    return null;
  }
  function readName(bytes, off) {
    const raw = cstring(bytes, off, 8);
    return raw.replace(/\0/g, '') || '未命名';
  }

  const peArch = { 0x14c: '32位 Intel', 0x8664: '64位 Intel', 0x1c0: '32位 ARM', 0xaa64: '64位 ARM' };
  const elfArch = { 3: '32位 Intel', 62: '64位 Intel', 40: '32位 ARM', 183: '64位 ARM' };

  function stringsOf(bytes) {
    const out = [];
    let run = [];
    const push = (text) => {
      if (text.length >= 6 && /[A-Za-z\u4e00-\u9fff]/.test(text)) out.push(text.slice(0, 180));
    };
    for (let i = 0; i < bytes.length && out.length < 120; i += 1) {
      const c = bytes[i];
      if (c >= 32 && c <= 126 && run.length < 180) run.push(c);
      else { push(String.fromCharCode(...run)); run = []; }
    }
    push(String.fromCharCode(...run));
    return out.slice(0, 80);
  }

  function nearEntry(bytes, sections, entry) {
    const off = rvaToOff(sections, entry);
    if (off === null || off < 0 || off >= bytes.length) return '入口不在文件里。';
    const slice = bytes.subarray(off, Math.min(bytes.length, off + 48));
    const lines = [];
    let i = 0;
    while (i < slice.length && lines.length < 16) {
      const at = entry + i;
      const b = slice[i];
      let text = `字节 ${hex(b, 2)}`;
      let step = 1;
      if (b === 0x90) text = '空指令';
      else if (b === 0xc3) text = '返回';
      else if (b === 0xcc) text = '断点';
      else if (b === 0x55) text = '保存栈底';
      else if (b === 0x5d) text = '恢复栈底';
      else if (b === 0xc9) text = '离开函数';
      else if (b === 0xe8 && i + 5 <= slice.length) { text = `调用 ${hex(at + 5 + i32(slice, i + 1))}`; step = 5; }
      else if (b === 0xe9 && i + 5 <= slice.length) { text = `跳转 ${hex(at + 5 + i32(slice, i + 1))}`; step = 5; }
      else if (b === 0xeb && i + 2 <= slice.length) { text = `短跳 ${hex(at + 2 + (slice[i + 1] << 24 >> 24))}`; step = 2; }
      else if (b === 0x48 && slice[i + 1] === 0x83 && slice[i + 2] === 0xec && i + 4 <= slice.length) { text = `给栈留 ${slice[i + 3]} 字节`; step = 4; }
      else if (b === 0x48 && slice[i + 1] === 0x89 && slice[i + 2] === 0xe5) { text = '把栈顶记到栈底'; step = 3; }
      lines.push(`${hex(at, 8)}  ${text}`);
      i += step;
    }
    return lines.join('\n');
  }

  function parsePe(bytes, view) {
    const eLfanew = u32(view, 0x3c, true);
    if (eLfanew === null || eLfanew + 24 > bytes.length || u32(view, eLfanew, true) !== 0x4550) return null;
    const coff = eLfanew + 4;
    const machine = u16(view, coff, true);
    const nsec = u16(view, coff + 2, true);
    const optSize = u16(view, coff + 16, true);
    const opt = coff + 20;
    const magic = u16(view, opt, true);
    const pe32plus = magic === 0x20b;
    if (magic !== 0x10b && magic !== 0x20b) return null;
    const entry = u32(view, opt + 16, true);
    const imageBase = pe32plus ? u64(view, opt + 24) : u32(view, opt + 28, true);
    const ddCount = u32(view, opt + (pe32plus ? 108 : 92), true) || 0;
    const dd = opt + (pe32plus ? 112 : 96);
    const sections = [];
    let secOff = opt + optSize;
    for (let i = 0; i < Math.min(nsec || 0, 96); i += 1) {
      if (secOff + 40 > bytes.length) break;
      const name = readName(bytes, secOff);
      const virtSize = u32(view, secOff + 8, true) || 0;
      const va = u32(view, secOff + 12, true) || 0;
      const rawSize = u32(view, secOff + 16, true) || 0;
      const raw = u32(view, secOff + 20, true) || 0;
      const chunk = bytes.subarray(Math.min(raw, bytes.length), Math.min(raw + rawSize, bytes.length));
      sections.push({ name, va, raw, rawSize, virtSize, entropy: entropy(chunk).toFixed(2) });
      secOff += 40;
    }
    const dir = (index) => (index < ddCount && dd + index * 8 + 4 <= bytes.length) ? u32(view, dd + index * 8, true) : 0;
    const imports = [];
    const impRva = dir(1);
    const impOff = impRva ? rvaToOff(sections, impRva) : null;
    if (impOff !== null) {
      for (let i = 0; i < 48; i += 1) {
        const base = impOff + i * 20;
        if (base + 20 > bytes.length) break;
        const oft = u32(view, base, true) || 0;
        const nameRva = u32(view, base + 12, true) || 0;
        const ft = u32(view, base + 16, true) || 0;
        if (!nameRva && !oft && !ft) break;
        const nameOff = rvaToOff(sections, nameRva);
        const dll = nameOff === null ? '未知' : cstring(bytes, nameOff, 200);
        const thunkRva = oft || ft;
        const thunkOff = thunkRva ? rvaToOff(sections, thunkRva) : null;
        const names = [];
        const step = pe32plus ? 8 : 4;
        if (thunkOff !== null) {
          for (let n = 0; n < 12; n += 1) {
            const at = thunkOff + n * step;
            if (at + step > bytes.length) break;
            const lo = u32(view, at, true) || 0;
            const hi = pe32plus ? (u32(view, at + 4, true) || 0) : 0;
            const val = pe32plus ? lo + hi * 0x100000000 : lo;
            if (!val) break;
            const byOrdinal = pe32plus ? (hi & 0x80000000) !== 0 : (lo & 0x80000000) !== 0;
            if (byOrdinal) names.push(`序号 ${lo & 0xffff}`);
            else {
              const hint = rvaToOff(sections, val);
              names.push(hint === null ? '名字读不到' : cstring(bytes, hint + 2, 200));
            }
          }
        }
        imports.push({ dll, names });
      }
    }
    const exports = [];
    const expOff = dir(0) ? rvaToOff(sections, dir(0)) : null;
    if (expOff !== null && expOff + 40 <= bytes.length) {
      const count = u32(view, expOff + 24, true) || 0;
      const namesRva = u32(view, expOff + 32, true) || 0;
      const namesOff = rvaToOff(sections, namesRva);
      if (namesOff !== null) {
        for (let i = 0; i < Math.min(count, 40); i += 1) {
          const rva = u32(view, namesOff + i * 4, true);
          const off = rva ? rvaToOff(sections, rva) : null;
          if (off !== null) exports.push(cstring(bytes, off, 200));
        }
      }
    }
    return {
      kind: pe32plus ? '64 位程序' : '32 位程序',
      arch: peArch[machine] || `机器码 ${hex(machine || 0, 4)}`,
      entry, imageBase, sections, imports, exports,
      entryText: nearEntry(bytes, sections, entry || 0),
    };
  }

  function parseElf(bytes, view) {
    if (bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) return null;
    const cls = bytes[4];
    const le = bytes[5] === 1;
    if (!le) return { kind: '文件头', arch: '大端，这份只读小端', entry: 0, imageBase: 0, sections: [], imports: [], exports: [], entryText: '' };
    const bits64 = cls === 2;
    const machine = u16(view, 18, true);
    const entry = bits64 ? u64(view, 24) : u32(view, 24, true);
    const shoff = bits64 ? u64(view, 40) : u32(view, 32, true);
    const shentsize = u16(view, bits64 ? 58 : 46, true) || (bits64 ? 64 : 40);
    const shnum = u16(view, bits64 ? 60 : 48, true) || 0;
    const shstr = u16(view, bits64 ? 62 : 50, true) || 0;
    const sections = [];
    let strOff = 0;
    if (shoff && shstr < shnum) {
      const base = shoff + shstr * shentsize;
      strOff = bits64 ? (u64(view, base + 24) || 0) : (u32(view, base + 16, true) || 0);
    }
    for (let i = 0; i < Math.min(shnum, 64); i += 1) {
      const base = shoff + i * shentsize;
      if (!shoff || base + shentsize > bytes.length) break;
      const nameOff = u32(view, base, true) || 0;
      const name = strOff ? cstring(bytes, strOff + nameOff, 64) : `节 ${i}`;
      const addr = bits64 ? u64(view, base + 16) : u32(view, base + 12, true);
      const off = bits64 ? u64(view, base + 24) : u32(view, base + 16, true);
      const size = bits64 ? u64(view, base + 32) : u32(view, base + 20, true);
      const chunk = bytes.subarray(Math.min(off || 0, bytes.length), Math.min((off || 0) + Math.min(size || 0, 1024 * 256), bytes.length));
      sections.push({ name: name || `节 ${i}`, va: addr || 0, raw: off || 0, rawSize: size || 0, virtSize: size || 0, entropy: entropy(chunk).toFixed(2) });
    }
    return {
      kind: bits64 ? '64 位程序' : '32 位程序',
      arch: elfArch[machine] || `机器码 ${hex(machine || 0, 4)}`,
      entry, imageBase: 0, sections, imports: [], exports: [], entryText: '',
    };
  }

  function hexDump(bytes) {
    const lines = [];
    const n = Math.min(bytes.length, 256);
    for (let i = 0; i < n; i += 16) {
      const row = bytes.subarray(i, Math.min(n, i + 16));
      const raw = [...row].map((b) => hex(b, 2)).join(' ');
      const text = [...row].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      lines.push(`${hex(i, 4)}  ${raw.padEnd(47, ' ')}  ${text}`);
    }
    return lines.join('\n');
  }

  async function sha256(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((b) => hex(b, 2)).join('');
  }

  async function parseFile(file) {
    const truncated = file.size > CAP;
    const buf = await file.slice(0, CAP).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);
    const head = bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a ? parsePe(bytes, view) : parseElf(bytes, view);
    const body = head || { kind: '普通文件', arch: '未识别', entry: 0, imageBase: 0, sections: [], imports: [], exports: [], entryText: '' };
    return {
      name: file.name,
      size: file.size,
      truncated,
      sha256: await sha256(bytes),
      entropy: entropy(bytes).toFixed(2),
      hex: hexDump(bytes),
      text: stringsOf(bytes),
      ...body,
    };
  }

  function show(model, mode) {
    if (!model) return '先选一个文件。';
    if (mode === 'layout') {
      if (!model.sections.length) return '没有读到结构。';
      return model.sections.map((s) => `${s.name}  位置 ${hex(s.va || 0)}  大小 ${s.rawSize}  乱度 ${s.entropy}`).join('\n');
    }
    if (mode === 'refs') {
      const im = model.imports.length ? model.imports.map((row) => `${row.dll}\n  ${(row.names || []).join('，') || '没有名字'}`).join('\n') : '没有引用。';
      const ex = model.exports.length ? `\n\n引出\n${model.exports.join('\n')}` : '';
      return im + ex;
    }
    if (mode === 'text') return model.text.length ? model.text.join('\n') : '没有读到够长的文字。';
    if (mode === 'bytes') return [model.hex, '', '入口附近', model.entryText || '没有入口。'].join('\n');
    return [
      `文件  ${model.name}`,
      `大小  ${model.size} 字节${model.truncated ? '（只看了前 4MB）' : ''}`,
      `种类  ${model.kind}`,
      `架构  ${model.arch}`,
      `入口  ${model.entry ? hex(model.entry) : '无'}`,
      `乱度  ${model.entropy}`,
      `校验  ${model.sha256}`,
    ].join('\n');
  }

  return { parseFile, show };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ColdCoffeeReverseCore;

if (typeof document !== 'undefined') {
  (() => {
    const desk = document.getElementById('re-desk');
    if (!desk || !document.getElementById('re-file')) return;
    const out = document.getElementById('re-out');
    let model = null;
    let mode = 'sum';
    document.getElementById('re-lanes').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      mode = button.dataset.re;
      desk.querySelectorAll('#re-lanes button').forEach((el) => el.classList.toggle('on', el === button));
      out.textContent = ColdCoffeeReverseCore.show(model, mode);
    });
    document.getElementById('re-file').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      out.textContent = '正在看…';
      try {
        model = await ColdCoffeeReverseCore.parseFile(file);
        desk.dataset.state = 'armed';
        document.getElementById('re-pill').textContent = '已开';
        document.getElementById('re-when').textContent = file.name;
        document.getElementById('re-lead').textContent = '已经打开。点上面的字换看法。';
        out.textContent = ColdCoffeeReverseCore.show(model, mode);
      } catch (error) {
        out.textContent = error.message || '这个文件看不了。';
      }
    });
    window.ColdCoffeeReverse = {
      arm() {
        if (desk.dataset.state === 'armed') return;
        desk.dataset.state = 'armed';
        document.getElementById('re-pill').textContent = '已开';
        document.getElementById('re-when').textContent = '选个文件';
        document.getElementById('re-lead').textContent = '已开。选一个文件就能看。';
      },
    };
  })();
}
